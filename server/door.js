// Door-event queries shared by the attendance and admin routes
import { query } from './db.js';
import { iso } from './lib.js';

// Who is inside / outside, from each student's latest door tap *in one session*. Every session starts with
// nobody inside. With no sessionId it looks at taps that belong to no session (recorded before sessions
// existed, or uploaded by a phone still running an older version).
// UNKNOWN_CARD taps are left out: they have no student and never change who is inside.
export async function venueState({ sessionId = null } = {}) {
  // `= $1` can use the session index; `IS NOT DISTINCT FROM` could not, so the two cases are written out
  const scope = sessionId ? 'session_id = $1' : 'session_id IS NULL';
  const rows = await query(
    `SELECT e.student_id, e.action
     FROM event_logs e
     JOIN (
       SELECT student_id, MAX(scanned_at) AS last_at
       FROM event_logs
       WHERE student_id IS NOT NULL AND action IN ('CHECK_IN', 'RE_ENTRY', 'TEMPORARY_EXIT') AND ${scope}
       GROUP BY student_id
     ) latest ON latest.student_id = e.student_id AND latest.last_at = e.scanned_at
     WHERE e.action IN ('CHECK_IN', 'RE_ENTRY', 'TEMPORARY_EXIT') AND e.${scope}
     ORDER BY e.created_at`, // if two taps share a time, the one uploaded last wins
    sessionId ? [sessionId] : []
  );
  const state = {};
  for (const r of rows) state[r.student_id] = r.action === 'TEMPORARY_EXIT' ? 'OUTSIDE' : 'INSIDE';
  return state;
}

// For the admin overview: how many people are inside / temporarily outside right now, across the sessions that
// are running. A student is counted once per running session they are in. Ended sessions count for nobody.
export async function activeVenueCounts() {
  const rows = await query(
    `SELECT e.session_id, e.student_id, e.action
     FROM event_logs e
     JOIN door_sessions s ON s.id = e.session_id AND s.status = 'active'
     JOIN (
       SELECT session_id, student_id, MAX(scanned_at) AS last_at
       FROM event_logs
       WHERE student_id IS NOT NULL AND session_id IS NOT NULL AND action IN ('CHECK_IN', 'RE_ENTRY', 'TEMPORARY_EXIT')
       GROUP BY session_id, student_id
     ) latest ON latest.session_id = e.session_id AND latest.student_id = e.student_id AND latest.last_at = e.scanned_at
     WHERE e.action IN ('CHECK_IN', 'RE_ENTRY', 'TEMPORARY_EXIT')
     ORDER BY e.created_at`
  );
  const state = new Map(); // "session|student" -> action; the tap uploaded last wins a tie
  for (const r of rows) state.set(`${r.session_id}|${r.student_id}`, r.action);
  let inside = 0;
  let outside = 0;
  for (const action of state.values()) {
    if (action === 'TEMPORARY_EXIT') outside++;
    else inside++;
  }
  return { inside, outside };
}

// Newest first. Optional [from, to) window, optional single session.
export async function doorEvents({ from = null, to = null, sessionId = null, limit = 2000 } = {}) {
  const params = [];
  const where = [];
  if (from) where.push(`e.scanned_at >= $${params.push(from)}`);
  if (to) where.push(`e.scanned_at < $${params.push(to)}`);
  if (sessionId) where.push(`e.session_id = $${params.push(sessionId)}`);
  const max = Math.min(Math.max(parseInt(limit, 10) || 50, 1), 5000); // the limit is pasted into the SQL below, so force it to a safe whole number
  return query(
    `SELECT e.client_id, e.action, e.scanned_at, e.token, e.student_id, e.by_id, e.session_id,
            u.name AS student_name, u.student_id AS login_id, u.program, u.year_level, b.name AS by_name,
            s.name AS session_name
     FROM event_logs e
     LEFT JOIN users u ON u.id = e.student_id
     LEFT JOIN users b ON b.id = e.by_id
     LEFT JOIN door_sessions s ON s.id = e.session_id
     ${where.length ? `WHERE ${where.join(' AND ')}` : ''}
     ORDER BY e.scanned_at DESC
     LIMIT ${max}`,
    params
  );
}

// The shape the browser receives. student is null for an unregistered card; session is null for a tap
// that belongs to no session.
export const shapeEvent = (r) => ({
  clientId: r.client_id,
  action: r.action,
  scannedAt: iso(r.scanned_at),
  token: r.token,
  student: r.student_name
    ? { id: r.student_id, name: r.student_name, studentId: r.login_id, program: r.program, yearLevel: r.year_level }
    : null,
  by: r.by_name || null,
  session: r.session_id ? { id: r.session_id, name: r.session_name || null } : null,
});
