// Small shared helpers

// Errors with a status code. `expose` lets a 5xx message reach the browser (used for setup mistakes).
export const httpError = (status, message, expose = false) => Object.assign(new Error(message), { status, expose });

// Express 4 does not catch errors thrown in async handlers, so wrap them.
export const asyncHandler = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);

// "04:a1:b2:..." -> "04A1B2..."  (same rule as the client)
export const normalizeToken = (t = '') => String(t).replace(/[^0-9a-f]/gi, '').toUpperCase();

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export const validId = (v) => typeof v === 'string' && UUID.test(v);

export const toDate = (v) => {
  const d = new Date(v);
  return Number.isNaN(d.getTime()) ? new Date() : d;
};
export const toInt = (v) => {
  const n = Number(v);
  return v && Number.isFinite(n) ? Math.trunc(n) : null;
};
export const str = (v, max = 200) => String(v ?? '').trim().slice(0, max);
export const iso = (v) => (v == null ? null : new Date(v).toISOString());

// "$1,$2,$3" (start = 1)
export const placeholders = (n, start = 1) => Array.from({ length: n }, (_, i) => `$${start + i}`).join(',');

// Postgres unique_violation
export const isDuplicate = (err) => err?.code === '23505';
