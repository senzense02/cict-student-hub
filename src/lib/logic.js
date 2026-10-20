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
