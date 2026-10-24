// Door scanner data. Staff (and admins) run sessions, upload taps and read the log.
import express from 'express';
import { randomUUID } from 'node:crypto';
import { insertRows, one, query, tx } from '../db.js';
import auth, { requireRole } from '../middleware/auth.js';
import { asyncHandler, dayWindow, httpError, iso, normalizeStudentNo, STUDENT_ID_REGEX, str, toDate, validId } from '../lib.js';
import { doorEvents, shapeEvent, venueState } from '../door.js';
import { bump } from '../live.js';

const router = express.Router();
router.use(auth);

const DOOR_ACTIONS = ['CHECK_IN', 'TEMPORARY_EXIT', 'RE_ENTRY', 'UNKNOWN_CARD'];
const okClientId = (v) => v != null && String(v).length > 0 && String(v).length <= 100;
const MAX_ROSTER = 5000; // same ceiling as the student roster the scanner downloads

// ---- sessions ------------------------------------------------------------------------------------------
// A session is one event: draft (being set up) -> active (scanning) -> ended (listed in the Door log).
// Anyone on staff can see every session and scan into a running one, so two phones can share an event.
// Only the person who created a session (or an admin) can import its list, start it, end it or delete it.

const SESSION_SQL = `
  SELECT s.id, s.name, s.status, s.created_by, s.created_at, s.started_at, s.ended_at, cb.name AS created_by_name,
    CAST((SELECT COUNT(*) FROM door_session_roster r WHERE r.session_id = s.id) AS INTEGER) AS roster_count,
    CAST((SELECT COUNT(*) FROM event_logs e WHERE e.session_id = s.id) AS INTEGER) AS tap_count,
    CAST((SELECT COUNT(DISTINCT e.student_id) FROM event_logs e
          WHERE e.session_id = s.id AND e.student_id IS NOT NULL) AS INTEGER) AS student_count,
    CAST((SELECT COUNT(DISTINCT e.student_id) FROM event_logs e
          JOIN users u ON u.id = e.student_id
          JOIN door_session_roster r ON r.session_id = e.session_id AND r.student_no = u.student_id
          WHERE e.session_id = s.id) AS INTEGER) AS attended_count,
    CAST((SELECT COUNT(*) FROM event_logs e WHERE e.session_id = s.id AND e.action = 'UNKNOWN_CARD') AS INTEGER) AS unknown_count
  FROM door_sessions s
  LEFT JOIN users cb ON cb.id = s.created_by`;

// counts.attended only counts students who are on the list; counts.students counts everyone who tapped
const shapeSession = (r) => ({
  id: r.id,
  name: r.name,
  status: r.status,
  createdBy: r.created_by,
  createdByName: r.created_by_name || null,
  createdAt: iso(r.created_at),
  startedAt: iso(r.started_at),
  endedAt: iso(r.ended_at),
  counts: { roster: r.roster_count, taps: r.tap_count, students: r.student_count, attended: r.attended_count, unknown: r.unknown_count },
});

async function loadSession(id) {
  if (!validId(id)) return null;
  const row = await one(`${SESSION_SQL} WHERE s.id = $1`, [id]);
  return row ? shapeSession(row) : null;
}
async function mustLoadSession(id) {
  const session = await loadSession(id);
  if (!session) throw httpError(404, 'That session does not exist any more.');
  return session;
}
const mayManage = (user, session) => user.role === 'admin' || session.createdBy === user.id;

// A session's registration list, matched to Hub accounts by Student ID at read time. userId is null for
// someone who filled in the form but has no Hub account (yet).
async function rosterOf(sessionId) {
  const rows = await query(
    `SELECT r.student_no, r.form_name, u.id AS user_id, u.name, u.program, u.year_level, (u.nfc_token IS NOT NULL) AS has_card
     FROM door_session_roster r
     LEFT JOIN users u ON u.student_id = r.student_no AND u.role = 'student'
     WHERE r.session_id = $1
     ORDER BY COALESCE(u.name, NULLIF(r.form_name, ''), r.student_no), r.student_no`,
    [sessionId]
  );
  return rows.map((r) => ({
    studentNo: r.student_no,
    name: r.name || r.form_name || '',
    userId: r.user_id || null,
    program: r.program || null,
    yearLevel: r.year_level || null,
    hasCard: Boolean(r.has_card),
  }));
}

// GET /api/attendance/sessions  every session, newest first (staff and admin)
router.get('/sessions', requireRole('staff', 'admin'), asyncHandler(async (req, res) => {
  const rows = await query(`${SESSION_SQL} ORDER BY COALESCE(s.started_at, s.created_at) DESC LIMIT 200`);
  res.json(rows.map(shapeSession));
}));

// POST /api/attendance/sessions  { name }  ->  the new session, as a draft
router.post('/sessions', requireRole('staff', 'admin'), asyncHandler(async (req, res) => {
  const name = str(req.body?.name, 100);
  if (!name) throw httpError(400, 'Give the session a name.');
  const id = randomUUID();
  await tx(async (q) => {
    await q('INSERT INTO door_sessions (id, name, created_by) VALUES ($1, $2, $3)', [id, name, req.user.id]);
    await bump('sessions', q);
  });
  res.status(201).json(await mustLoadSession(id));
}));

// GET /api/attendance/sessions/:id  ->  { session, roster, venue }
// Everything a phone needs to scan into the session: who is on the list, and who is inside right now.
router.get('/sessions/:id', requireRole('staff', 'admin'), asyncHandler(async (req, res) => {
  const session = await mustLoadSession(req.params.id);
  const [roster, venue] = await Promise.all([rosterOf(session.id), venueState({ sessionId: session.id })]);
  res.json({ session, roster, venue });
}));

// POST /api/attendance/sessions/:id/roster  { rows: [{ studentId, name }], mode: 'add' | 'replace' }
// The browser reads the Google Form export; this stores what it found. IDs are checked again here.
router.post('/sessions/:id/roster', requireRole('staff', 'admin'), asyncHandler(async (req, res) => {
  const session = await mustLoadSession(req.params.id);
  if (!mayManage(req.user, session)) throw httpError(403, 'Only the person who created this session can change its list.');
  if (session.status === 'ended') throw httpError(409, 'This session has ended, so its list can no longer change.');

  const input = Array.isArray(req.body?.rows) ? req.body.rows : [];
  if (input.length > MAX_ROSTER) throw httpError(400, `A list can hold up to ${MAX_ROSTER} students.`);
  const mode = req.body?.mode === 'replace' ? 'replace' : 'add';

  // One row per Student ID. A row with an unreadable ID is skipped, not fatal.
  const byNo = new Map();
  let skipped = 0;
  for (const r of input) {
    const no = normalizeStudentNo(r?.studentId);
    if (!STUDENT_ID_REGEX.test(no)) { skipped++; continue; }
    const name = str(r?.name, 120);
    if (!byNo.has(no) || (!byNo.get(no)[2] && name)) byNo.set(no, [session.id, no, name]);
  }

  await tx(async (q) => {
    if (mode === 'replace') await q('DELETE FROM door_session_roster WHERE session_id = $1', [session.id]);
    // Adding the same student again never creates a second row; it only fills in a name that was missing or changed
    await insertRows(q, 'door_session_roster', ['session_id', 'student_no', 'form_name'], [...byNo.values()],
      `ON CONFLICT (session_id, student_no) DO UPDATE SET
         form_name = CASE WHEN EXCLUDED.form_name <> '' THEN EXCLUDED.form_name ELSE door_session_roster.form_name END`);
    await bump('sessions', q);
  });

  const [totals] = await query(
    `SELECT CAST(COUNT(*) AS INTEGER) AS total, CAST(COUNT(u.id) AS INTEGER) AS matched
     FROM door_session_roster r
     LEFT JOIN users u ON u.student_id = r.student_no AND u.role = 'student'
     WHERE r.session_id = $1`,
    [session.id]
  );
  res.json({ saved: byNo.size, skipped, total: totals.total, matched: totals.matched });
}));

// PATCH /api/attendance/sessions/:id  { status: 'active' | 'ended' }
// A session only moves forward: draft -> active -> ended. Ending it is what puts it in the Door log for good.
const NEXT_STATUS = { draft: 'active', active: 'ended' };
router.patch('/sessions/:id', requireRole('staff', 'admin'), asyncHandler(async (req, res) => {
  const session = await mustLoadSession(req.params.id);
  if (!mayManage(req.user, session)) throw httpError(403, 'Only the person who created this session can start or end it.');

  const to = req.body?.status;
  if (to !== 'active' && to !== 'ended') throw httpError(400, 'A session can be started or ended.');
  if (NEXT_STATUS[session.status] !== to) {
    throw httpError(409, session.status === 'ended' ? 'This session has already ended.'
      : session.status === 'active' && to === 'active' ? 'This session is already running.'
      : 'Start the session before ending it.');
  }

  const column = to === 'active' ? 'started_at' : 'ended_at'; // chosen above, never from the request
  const changed = await tx(async (q) => {
    // Only moves if nobody else changed it in the meantime
    const rows = await q(`UPDATE door_sessions SET status = $1, ${column} = CURRENT_TIMESTAMP WHERE id = $2 AND status = $3 RETURNING id`,
      [to, session.id, session.status]);
    if (rows.length) await bump('sessions', q);
    return rows.length > 0;
  });
  if (!changed) throw httpError(409, 'Someone else just changed this session. Refresh and try again.');
  res.json(await mustLoadSession(session.id));
}));

// DELETE /api/attendance/sessions/:id
// A draft can be deleted by whoever made it. A running session must be ended first. A finished session holds
// real attendance, so only an admin can delete it, and its taps go with it.
router.delete('/sessions/:id', requireRole('staff', 'admin'), asyncHandler(async (req, res) => {
  const session = await mustLoadSession(req.params.id);
  if (session.status === 'active') throw httpError(409, 'End the session before deleting it.');
  if (session.status === 'ended' && req.user.role !== 'admin') throw httpError(403, 'Only an admin can delete a finished session.');
  if (session.status === 'draft' && !mayManage(req.user, session)) throw httpError(403, 'Only the person who created this session can delete it.');

  const taps = await tx(async (q) => {
    const [gone] = await q(`WITH d AS (DELETE FROM event_logs WHERE session_id = $1 RETURNING 1) SELECT CAST(COUNT(*) AS INTEGER) AS n FROM d`, [session.id]);
    await q('DELETE FROM door_sessions WHERE id = $1', [session.id]); // its list goes with it (ON DELETE CASCADE)
    await bump('sessions', q);
    if (gone.n) await bump('door', q);
    return gone.n;
  });
  res.json({ deleted: true, taps });
}));

// ---- door taps -----------------------------------------------------------------------------------------

// Idempotent upload of everything queued on a phone. Safe to call again after a dropped connection.
// body: { events: [{ clientId, student, token, action, scannedAt, session }] }
//   ->  { accepted: { events: [clientId] }, rejected: { events: n } }
router.post('/sync', requireRole('staff', 'admin'), asyncHandler(async (req, res) => {
  // Capped so one request cannot hold the database for long. Taps beyond the cap stay queued on the
  // phone (only accepted ones are removed there) and go up on the next sync.
  const events = Array.isArray(req.body?.events) ? req.body.events.slice(0, 2000) : [];
  const accepted = { events: [] };
  const rejected = { events: 0 };

  // A tap names the session it was scanned in. Sessions that no longer exist (deleted while a phone was
  // offline) are dropped to "no session" instead of failing the upload. A session that has since ended
  // still takes its late taps: they happened while it was running.
  const named = [...new Set(events.map((e) => e?.session).filter(validId))];
  const known = new Set(
    named.length ? (await query('SELECT id FROM door_sessions WHERE id = ANY($1)', [named])).map((r) => r.id) : []
  );

  const rows = [];
  for (const e of events) {
    if (!okClientId(e?.clientId) || !DOOR_ACTIONS.includes(e.action)) { rejected.events++; continue; }
    const clientId = String(e.clientId);
    // A tap with a missing or malformed student id is still kept (as an unlinked tap) rather than lost
    rows.push([clientId, validId(e.student) ? e.student : null, str(e.token, 100), e.action, toDate(e.scannedAt), req.user.id, known.has(e.session) ? e.session : null]);
    accepted.events.push(clientId);
  }
  // A tap that was already uploaded is ignored (same client_id). One transaction: all or nothing.
  await tx(async (q) => {
    await insertRows(q, 'event_logs', ['client_id', 'student_id', 'token', 'action', 'scanned_at', 'by_id', 'session_id'], rows, 'ON CONFLICT (client_id) DO NOTHING');
    if (rows.length) await bump('door', q);
  });

  res.json({ accepted, rejected });
}));

// Latest door state per student: for one session (?session=<id>), or for taps that belong to no session.
// The scanner reads it through GET /sessions/:id instead; this stays for phones still on an older version.
router.get('/venue-state', requireRole('staff', 'admin'), asyncHandler(async (req, res) => {
  const sessionId = validId(req.query.session) ? req.query.session : null;
  res.json(await venueState({ sessionId }));
}));

// GET /api/attendance/log?date=2026-10-18   every door tap of that day, newest first
// GET /api/attendance/log?session=<id>      one session: { session, roster, events }. Each tap says whether the
//                                           student was missing from the session's list (offList)
// Staff and admins can both read it.
router.get('/log', requireRole('staff', 'admin'), asyncHandler(async (req, res) => {
  if (req.query.session) {
    const session = await mustLoadSession(String(req.query.session));
    const [rows, roster] = await Promise.all([doorEvents({ sessionId: session.id, limit: 5000 }), rosterOf(session.id)]);
    const onList = new Set(roster.filter((r) => r.userId).map((r) => r.userId));
    const hasList = roster.length > 0; // with no list, nobody is "off" it
    const events = rows.map(shapeEvent).map((e) => ({ ...e, offList: hasList && Boolean(e.student) && !onList.has(e.student.id) }));
    return res.json({ session, roster, events });
  }

  const day = dayWindow(req.query.date);
  // 5000 is far more than one day at a door produces; it only protects the size of the answer
  const rows = await doorEvents({ from: day.from, to: day.to, limit: 5000 });
  res.json({ date: day.date, events: rows.map(shapeEvent) });
}));

export default router;
