// Door-event queries shared by the attendance and admin routes
import { query } from './db.js';
import { iso } from './lib.js';

// Who is inside / outside, from each student's latest door tap.
// With `since`, only taps from that moment on count (the admin overview uses "today").
export async function venueState(since = null) {
  const params = since ? [since] : [];
  const rows = await query(
    `SELECT e.student_id, e.action
     FROM event_logs e
     JOIN (
       SELECT student_id, MAX(scanned_at) AS last_at
       FROM event_logs
       WHERE student_id IS NOT NULL AND action IN ('CHECK_IN', 'RE_ENTRY', 'TEMPORARY_EXIT')
       ${since ? 'AND scanned_at >= $1' : ''}
       GROUP BY student_id
     ) latest ON latest.student_id = e.student_id AND latest.last_at = e.scanned_at
     WHERE e.action IN ('CHECK_IN', 'RE_ENTRY', 'TEMPORARY_EXIT')
     ORDER BY e.created_at`,
    params
  );
  const state = {};
  for (const r of rows) state[r.student_id] = r.action === 'TEMPORARY_EXIT' ? 'OUTSIDE' : 'INSIDE';
  return state;
}

// Newest first. Optional [from, to) window.
export async function doorEvents({ from = null, to = null, limit = 2000 } = {}) {
  const params = [];
  const where = [];
  if (from) where.push(`e.scanned_at >= $${params.push(from)}`);
  if (to) where.push(`e.scanned_at < $${params.push(to)}`);
  const max = Math.min(Math.max(parseInt(limit, 10) || 50, 1), 5000);
  return query(
    `SELECT e.client_id, e.action, e.scanned_at, e.token, e.student_id, e.by_id,
            u.name AS student_name, u.student_id AS login_id, u.program, u.year_level, b.name AS by_name
     FROM event_logs e
     LEFT JOIN users u ON u.id = e.student_id
     LEFT JOIN users b ON b.id = e.by_id
     ${where.length ? `WHERE ${where.join(' AND ')}` : ''}
     ORDER BY e.scanned_at DESC
     LIMIT ${max}`,
    params
  );
}

export const shapeEvent = (r) => ({
  clientId: r.client_id,
  action: r.action,
  scannedAt: iso(r.scanned_at),
  token: r.token,
  student: r.student_name
    ? { id: r.student_id, name: r.student_name, studentId: r.login_id, program: r.program, yearLevel: r.year_level }
    : null,
  by: r.by_name || null,
});
