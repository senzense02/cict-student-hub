// Slows down password guessing: 6 wrong tries per IP + account/card, then a 10 minute wait.
// Stored in Postgres (not memory) because serverless instances do not share memory.
import { one, query } from './db.js';

const MAX_TRIES = 6;
const WINDOW_MS = 10 * 60 * 1000;

// One bucket per IP AND account/card, so one person's typos cannot lock out everyone on the same school Wi-Fi
export const bucketFor = (req, id) => `${req.ip}|${id}`;

export async function isBlocked(bucket) {
  const row = await one('SELECT fails, reset_at FROM login_attempts WHERE bucket = $1', [bucket]);
  return Boolean(row && new Date(row.reset_at) > new Date() && row.fails >= MAX_TRIES);
}

export async function recordFail(bucket) {
  const now = new Date();
  const resetAt = new Date(now.getTime() + WINDOW_MS);
  await query(
    `INSERT INTO login_attempts (bucket, fails, reset_at) VALUES ($1, 1, $2)
     ON CONFLICT (bucket) DO UPDATE SET
       fails = CASE WHEN login_attempts.reset_at <= $3 THEN 1 ELSE login_attempts.fails + 1 END,
       reset_at = CASE WHEN login_attempts.reset_at <= $3 THEN $2 ELSE login_attempts.reset_at END`,
    [bucket, resetAt, now]
  );
  await query('DELETE FROM login_attempts WHERE reset_at <= $1', [now]); // tidy up expired rows
}

export const clearFails = (bucket) => query('DELETE FROM login_attempts WHERE bucket = $1', [bucket]);
