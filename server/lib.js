// Small helpers shared by the server routes.

// Errors with a status code. `expose` lets a 5xx message reach the browser (used for setup mistakes).
export const httpError = (status, message, expose = false) => Object.assign(new Error(message), { status, expose });

// Express 4 does not catch errors thrown in async handlers, so wrap them.
export const asyncHandler = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);

// "04:a1:b2:..." -> "04A1B2..."  (same rule as the client)
export const normalizeToken = (t = '') => String(t).replace(/[^0-9a-f]/gi, '').toUpperCase();

// Ids that arrive from phones are checked before they reach the database or the event log
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export const validId = (v) => typeof v === 'string' && UUID.test(v);

// A bad or missing timestamp from a phone becomes "now" instead of failing the whole upload
export const toDate = (v) => {
  const d = new Date(v);
  return Number.isNaN(d.getTime()) ? new Date() : d;
};
// Trim and cap the length, so one oversized field cannot bloat a row
export const str = (v, max = 200) => String(v ?? '').trim().slice(0, max);
export const iso = (v) => (v == null ? null : new Date(v).toISOString());

// Postgres error code 23505: a unique value (login ID, card, ...) is already taken
export const isDuplicate = (err) => err?.code === '23505';

// Student account rules. Shared by self-registration (routes/auth.js) and by an admin creating a student
// (routes/users.js), so both paths accept exactly the same IDs, programs and year levels.
// Accepts "25-1167" and "2025-01234" style IDs. Adjust if your school's format differs.
export const STUDENT_ID_REGEX = /^\d{2,4}-\d{3,6}$/;
export const PROGRAMS = ['BSCS', 'BSIS'];
export const isYearLevel = (n) => Number.isInteger(n) && n >= 1 && n <= 4;

// A Student ID typed into a form: "25-1167", " 25 1167 ", or "25–1167" (phone keyboards turn a hyphen into an
// en dash). Same rule as the client, so the list a staff member previews is the list the server stores.
export const normalizeStudentNo = (v = '') =>
  String(v).trim().replace(/[\u2010-\u2015\u2212]/g, '-').replace(/\s*-\s*/g, '-').replace(/\s+/g, '-');

// The calendar day (in the school's time zone) as a [from, to) pair of UTC dates.
// Default offset is UTC+8 (Philippines); change it with APP_UTC_OFFSET_HOURS.
export function dayWindow(date) {
  const hours = Number(process.env.APP_UTC_OFFSET_HOURS);
  const offset = (process.env.APP_UTC_OFFSET_HOURS && Number.isFinite(hours) ? hours : 8) * 3600_000;
  let y, m, d;
  if (typeof date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(date)) [y, m, d] = date.split('-').map(Number);
  else {
    const t = new Date(Date.now() + offset);
    [y, m, d] = [t.getUTCFullYear(), t.getUTCMonth() + 1, t.getUTCDate()];
  }
  const start = Date.UTC(y, m - 1, d) - offset;
  const label = new Date(start + offset).toISOString().slice(0, 10);
  return { date: label, from: new Date(start), to: new Date(start + 86400_000) };
}
