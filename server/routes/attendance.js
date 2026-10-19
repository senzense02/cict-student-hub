import express from 'express';
import { insertRows, query, tx } from '../db.js';
import auth, { requireRole } from '../middleware/auth.js';
import { asyncHandler, placeholders, str, toDate, toInt, validId } from '../lib.js';

const router = express.Router();
router.use(auth, requireRole('staff', 'teacher', 'admin'));

const DOOR_ACTIONS = ['CHECK_IN', 'TEMPORARY_EXIT', 'RE_ENTRY', 'UNKNOWN_CARD'];
const STATUSES = ['present', 'late', 'excused', 'absent'];
const cap = (a) => (Array.isArray(a) ? a.slice(0, 2000) : []);
const okClientId = (v) => v != null && String(v).length > 0 && String(v).length <= 100;

// Idempotent upload of everything queued on a phone. Safe to call again after a dropped connection.
// body: { events: [], sessions: [], marks: [] }  ->  { accepted: {events,sessions,marks: [clientId]}, rejected: {...} }
// Everything runs in one transaction, so a failure leaves nothing half-saved (the phone keeps its queue).
router.post('/sync', asyncHandler(async (req, res) => {
  const { role, id: me } = req.user;
  const body = req.body || {};
  const canDoor = role === 'staff' || role === 'admin';
  const canClass = role === 'teacher' || role === 'admin';
  const accepted = { events: [], sessions: [], marks: [] };
  const rejected = { events: 0, sessions: 0, marks: 0 };
  const events = cap(body.events);
  const sessions = cap(body.sessions);
  const marks = cap(body.marks);

  await tx(async (q) => {
    // --- door events (staff / admin) ---
    if (!canDoor) rejected.events = events.length;
    else {
      const rows = [];
      for (const e of events) {
        if (!okClientId(e?.clientId) || !DOOR_ACTIONS.includes(e.action)) { rejected.events++; continue; }
        const clientId = String(e.clientId);
        rows.push([clientId, validId(e.student) ? e.student : null, str(e.token, 100), e.action, toDate(e.scannedAt), me]);
        accepted.events.push(clientId);
      }
      // A tap that was already uploaded is ignored (same client_id)
      await insertRows(q, 'event_logs', ['client_id', 'student_id', 'token', 'action', 'scanned_at', 'by_id'], rows, 'ON CONFLICT (client_id) DO NOTHING');
    }

    // --- class sessions (teacher / admin) ---
    if (!canClass) rejected.sessions = sessions.length;
    else {
      const candidates = sessions.filter((s) => {
        const ok = okClientId(s?.clientId) && s.courseCode;
        if (!ok) rejected.sessions++;
        return ok;
      });
      const ids = [...new Set(candidates.map((s) => String(s.clientId)))];
      const existing = ids.length
        ? await q(`SELECT client_id, teacher_id FROM class_sessions WHERE client_id IN (${placeholders(ids.length)})`, ids)
        : [];
      const owner = new Map(existing.map((s) => [s.client_id, s.teacher_id]));

      const rows = new Map(); // dedupe inside one request: the last copy wins
      for (const s of candidates) {
        const clientId = String(s.clientId);
        if (owner.has(clientId) && owner.get(clientId) !== me && role !== 'admin') { rejected.sessions++; continue; }
        const courseCode = str(s.courseCode, 40).toUpperCase(); // same as before: course codes are stored in capitals
        rows.set(clientId, [
          clientId, me, courseCode, str(s.name || s.courseCode, 120),
          ['ALL', 'BSCS', 'BSIS'].includes(s.program) ? s.program : 'ALL',
          toInt(s.yearLevel), str(s.section, 60), toInt(s.lateAfterMin),
          toDate(s.startedAt), s.endedAt ? toDate(s.endedAt) : null,
        ]);
        accepted.sessions.push(clientId);
      }
      // A session keeps its first details; only "ended at" can change afterwards
      await insertRows(
        q, 'class_sessions',
        ['client_id', 'teacher_id', 'course_code', 'name', 'program', 'year_level', 'section', 'late_after_min', 'started_at', 'ended_at'],
        [...rows.values()],
        'ON CONFLICT (client_id) DO UPDATE SET ended_at = EXCLUDED.ended_at, updated_at = CURRENT_TIMESTAMP'
      );
    }

    // --- class marks (teacher / admin) ---
    if (!canClass) rejected.marks = marks.length;
    else {
      const candidates = marks.filter((m) => {
        const ok = okClientId(m?.clientId) && okClientId(m.sessionId) && validId(m.student) && STATUSES.includes(m.status);
        if (!ok) rejected.marks++;
        return ok;
      });
      const ids = [...new Set(candidates.map((m) => String(m.sessionId)))];
      const owned = ids.length
        ? await q(`SELECT client_id, teacher_id FROM class_sessions WHERE client_id IN (${placeholders(ids.length)})`, ids)
        : [];
      const okSession = new Set(owned.filter((s) => role === 'admin' || s.teacher_id === me).map((s) => s.client_id));

      const rows = new Map();
      for (const m of candidates) {
        if (!okSession.has(String(m.sessionId))) { rejected.marks++; continue; }
        const clientId = String(m.clientId);
        rows.set(clientId, [clientId, String(m.sessionId), m.student, m.status, m.source === 'manual' ? 'manual' : 'nfc', toDate(m.markedAt)]);
        accepted.marks.push(clientId);
      }
      await insertRows(
        q, 'class_marks',
        ['client_id', 'session_id', 'student_id', 'status', 'source', 'marked_at'],
        [...rows.values()],
        `ON CONFLICT (client_id) DO UPDATE SET status = EXCLUDED.status, source = EXCLUDED.source,
           marked_at = EXCLUDED.marked_at, updated_at = CURRENT_TIMESTAMP`
      );
    }
  });

  res.json({ accepted, rejected });
}));

// Latest door state per student, so a fresh phone starts from the server's picture
router.get('/venue-state', requireRole('staff', 'admin'), asyncHandler(async (req, res) => {
  const rows = await query(
    `SELECT e.student_id, e.action
     FROM event_logs e
     JOIN (
       SELECT student_id, MAX(scanned_at) AS last_at
       FROM event_logs
       WHERE student_id IS NOT NULL AND action IN ('CHECK_IN', 'RE_ENTRY', 'TEMPORARY_EXIT')
       GROUP BY student_id
     ) latest ON latest.student_id = e.student_id AND latest.last_at = e.scanned_at
     WHERE e.action IN ('CHECK_IN', 'RE_ENTRY', 'TEMPORARY_EXIT')
     ORDER BY e.created_at`
  );
  const state = {};
  for (const r of rows) state[r.student_id] = r.action === 'TEMPORARY_EXIT' ? 'OUTSIDE' : 'INSIDE';
  res.json(state);
}));

const shapeSession = (s) => ({
  clientId: s.client_id,
  teacher: s.teacher_id,
  courseCode: s.course_code,
  name: s.name,
  program: s.program,
  yearLevel: s.year_level,
  section: s.section || '',
  lateAfterMin: s.late_after_min,
  startedAt: new Date(s.started_at).toISOString(),
  endedAt: s.ended_at ? new Date(s.ended_at).toISOString() : null,
});

router.get('/sessions', requireRole('teacher', 'admin'), asyncHandler(async (req, res) => {
  const mineOnly = req.user.role !== 'admin';
  const rows = await query(
    `SELECT * FROM class_sessions ${mineOnly ? 'WHERE teacher_id = $1' : ''} ORDER BY started_at DESC LIMIT 50`,
    mineOnly ? [req.user.id] : []
  );
  res.json(rows.map(shapeSession));
}));

router.get('/sessions/:clientId', requireRole('teacher', 'admin'), asyncHandler(async (req, res) => {
  const [session] = await query('SELECT * FROM class_sessions WHERE client_id = $1', [req.params.clientId]);
  if (!session) return res.status(404).json({ message: 'Session not found' });
  if (req.user.role !== 'admin' && session.teacher_id !== req.user.id)
    return res.status(403).json({ message: "This is another teacher's session" });
  const marks = await query('SELECT student_id, status, source, marked_at FROM class_marks WHERE session_id = $1', [session.client_id]);
  res.json({
    session: shapeSession(session),
    marks: marks.map((m) => ({ student: m.student_id, status: m.status, source: m.source, markedAt: new Date(m.marked_at).toISOString() })),
  });
}));

export default router;
