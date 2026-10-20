// Optional: push updates through Neon Realtime instead of polling.
//
// Everything here stays switched off unless NEON_REALTIME_URL and NEON_REALTIME_SECRET are set, and any
// failure just means "no push": pages keep working by polling /api/live.
//
// What goes over the live connection is deliberately tiny and harmless: the change counters in `live_state`
// (see live.js). Real data is still fetched through the normal authenticated API, so nothing private is
// ever pushed to a browser.
const COUNTERS_SQL = 'SELECT topic, version FROM live_state ORDER BY topic';

export const realtimeEnabled = (env = process.env) => Boolean(env.NEON_REALTIME_URL && env.NEON_REALTIME_SECRET);

// The database the live query runs against: NEON_REALTIME_DB, else the name in DATABASE_URL, else "neondb"
export function databaseName(env = process.env) {
  if (env.NEON_REALTIME_DB) return env.NEON_REALTIME_DB;
  try {
    const name = decodeURIComponent(new URL(env.DATABASE_URL || env.POSTGRES_URL).pathname.slice(1));
    if (name) return name;
  } catch { /* not a URL we can read */ }
  return 'neondb';
}

let cached = null; // { key, realtime, rawSql }

async function sdk() {
  const secret = process.env.NEON_REALTIME_SECRET;
  const db = databaseName();
  const key = `${secret}|${db}`;
  if (!cached || cached.key !== key) {
    const { createRealtime, rawSql } = await import('@neon/realtime/server');
    cached = { key, realtime: createRealtime({ secret, db }), rawSql };
  }
  return cached;
}

// -> { url, query } for the browser, or null when push is not available.
// `query` is a *sealed* query: an encrypted, signed capability for exactly this one SELECT. It lasts
// 60 seconds, which is why open pages ask for a fresh one (GET /api/live) before it expires.
export async function realtimeForBrowser() {
  if (!realtimeEnabled()) return null;
  try {
    const { realtime, rawSql } = await sdk();
    return { url: process.env.NEON_REALTIME_URL, query: await realtime.seal({ query: rawSql(COUNTERS_SQL) }) };
  } catch (err) {
    console.error('Neon Realtime is unavailable, pages will poll instead:', err.message);
    return null;
  }
}
