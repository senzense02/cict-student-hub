// Pure functions (no browser APIs) so they are easy to test.

// "04:a1:b2:c3" -> "04A1B2C3"
export const normalizeToken = (t = '') => String(t).replace(/[^0-9a-f]/gi, '').toUpperCase();

// Door state machine. state: undefined (never scanned) | 'INSIDE' | 'OUTSIDE'
export function nextDoorAction(state) {
  if (state === 'INSIDE') return { action: 'TEMPORARY_EXIT', state: 'OUTSIDE' };
  if (state === 'OUTSIDE') return { action: 'RE_ENTRY', state: 'INSIDE' };
  return { action: 'CHECK_IN', state: 'INSIDE' };
}

export function doorStats(students, venue) {
  let inside = 0;
  let outside = 0;
  for (const s of students) {
    if (venue[s.id] === 'INSIDE') inside++;
    else if (venue[s.id] === 'OUTSIDE') outside++;
  }
  return { total: students.length, inside, outside, notArrived: students.length - inside - outside };
}

// rows: array of objects, cols: [[key, header], ...]
export function toCsv(rows, cols) {
  const q = (v) => `"${String(v ?? '').replace(/"/g, '""')}"`;
  return [cols.map(([, h]) => q(h)).join(','), ...rows.map((r) => cols.map(([k]) => q(r[k])).join(','))].join('\r\n');
}

// Topics whose change counter moved between two snapshots of GET /api/live
export const changedTopics = (prev, next) => Object.keys(next).filter((t) => next[t] !== prev[t]);

// Folds a fresh server list into the list someone is looking at, without surprises:
//  - cards on screen are updated in place (score, verified badge) and keep their order
//  - cards that were deleted, or no longer match the filters, are removed
//  - `incoming` holds reviewers that are truly new: not on screen, posted after everything on screen,
//    and not by the viewer. They are offered behind a "Show" button instead of being inserted.
// No clock comparison happens between the browser and the database; createdAt values are all
// the same server-formatted strings, so comparing them is exact.
export function mergeResources(current, fresh, myId) {
  const freshById = new Map(fresh.map((r) => [r._id, r]));
  const known = new Set(current.map((r) => r._id));
  const newest = current.reduce((max, r) => (r.createdAt > max ? r.createdAt : max), '');
  return {
    merged: current.filter((r) => freshById.has(r._id)).map((r) => freshById.get(r._id)),
    incoming: fresh.filter((r) => !known.has(r._id) && r.createdAt >= newest && r.uploader?._id !== myId),
  };
}
