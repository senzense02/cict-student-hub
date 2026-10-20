// A tiny change feed. Writes bump a counter per topic ("resources", "door", "users");
// open pages poll the counters (GET /api/live) and refresh only the data whose counter moved.
import { query } from './db.js';

// q can be a transaction's query function, so the bump commits together with the change itself
export const bump = (topic, q = query) =>
  q(
    `INSERT INTO live_state (topic, version) VALUES ($1, 1)
     ON CONFLICT (topic) DO UPDATE SET version = live_state.version + 1`,
    [topic]
  );

export async function versions() {
  const rows = await query('SELECT topic, version FROM live_state');
  return Object.fromEntries(rows.map((r) => [r.topic, Number(r.version)]));
}
