// Pure functions (no browser APIs) so they are easy to test.

// "04:a1:b2:c3" -> "04A1B2C3"
export const normalizeToken = (t = '') => String(t).replace(/[^0-9a-f]/gi, '').toUpperCase();

// Door state machine. state: undefined (never scanned) | 'INSIDE' | 'OUTSIDE'
// A tap just flips the state, so staff never have to say whether someone is arriving or leaving.
export function nextDoorAction(state) {
  if (state === 'INSIDE') return { action: 'TEMPORARY_EXIT', state: 'OUTSIDE' };
  if (state === 'OUTSIDE') return { action: 'RE_ENTRY', state: 'INSIDE' };
  return { action: 'CHECK_IN', state: 'INSIDE' };
}

// Numbers for the four tiles on the Door scanner. A student with no tap yet counts as "not yet arrived".
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
// Every cell is quoted (inner quotes doubled) so a comma or quote in a name cannot break the columns,
// and lines end with \r\n, which is what Excel expects.

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

// ---- registration lists (Google Form exports) ----------------------------------------------------------

// Student IDs look like "25-1167" (same rule as the server's STUDENT_ID_REGEX)
export const STUDENT_NO = /^\d{2,4}-\d{3,6}$/;

// A Student ID typed into a form: "25-1167", " 25 1167 ", or "25–1167" (phone keyboards turn a hyphen into an
// en dash). Same rule as the server, so the list that is previewed is the list that is stored.
export const normalizeStudentNo = (v = '') =>
  String(v).trim().replace(/[\u2010-\u2015\u2212]/g, '-').replace(/\s*-\s*/g, '-').replace(/\s+/g, '-');

// Splits CSV (what Google Forms downloads), TSV (what you get copying cells from Google Sheets) or
// semicolon-separated text into rows of cells. Handles quoted cells that contain commas, quotes or line
// breaks, a leading byte-order mark, and Windows line endings. Blank lines are dropped.
export function parseTable(text) {
  const src = String(text ?? '').replace(/^\uFEFF/, '');

  // The separator is whichever of , tab ; appears most in the first line (outside quotes)
  const counts = { ',': 0, '\t': 0, ';': 0 };
  let quoted = false;
  for (const c of src) {
    if (c === '"') quoted = !quoted;
    else if (!quoted && (c === '\n' || c === '\r') && Object.values(counts).some(Boolean)) break;
    else if (!quoted && c in counts) counts[c]++;
  }
  const sep = Object.keys(counts).reduce((best, k) => (counts[k] > counts[best] ? k : best), ',');

  const rows = [];
  let row = [];
  let cell = '';
  let inQuotes = false;
  for (let i = 0; i < src.length; i++) {
    const c = src[i];
    if (inQuotes) {
      if (c !== '"') cell += c;
      else if (src[i + 1] === '"') { cell += '"'; i++; } // "" is a quote inside a quoted cell
      else inQuotes = false;
    } else if (c === '"' && cell === '') inQuotes = true; // a quote only opens a cell when it comes first
    else if (c === sep) { row.push(cell); cell = ''; }
    else if (c === '\n' || c === '\r') {
      if (c === '\r' && src[i + 1] === '\n') i++;
      row.push(cell);
      cell = '';
      rows.push(row);
      row = [];
    } else cell += c;
  }
  if (cell !== '' || row.length) { row.push(cell); rows.push(row); }
  return rows.map((r) => r.map((c) => c.trim())).filter((r) => r.some((c) => c !== ''));
}

// Does this row look like column titles rather than a student? (A pasted list of bare IDs has no title row.)
export const hasHeaderRow = (rows) => Boolean(rows[0]) && !rows[0].some((c) => STUDENT_NO.test(normalizeStudentNo(c)));

// Which column holds the Student ID, and which the name? Looks at the column titles first, then at the
// values (the column where most cells look like Student IDs). -1 means "not found".
export function guessColumns(header, rows) {
  const find = (re, not) => header.findIndex((h) => re.test(h) && !(not && not.test(h)));

  let id = find(/student\s*(id|no\.?|number|#)|id\s*(no\.?|number)|^id$|school\s*id/i);
  if (id < 0) {
    let share = 0.5; // a column needs more than half its cells to look like IDs
    header.forEach((_, c) => {
      const cells = rows.map((r) => r[c]).filter(Boolean);
      if (!cells.length) return;
      const s = cells.filter((v) => STUDENT_NO.test(normalizeStudentNo(v))).length / cells.length;
      if (s > share) { id = c; share = s; }
    });
  }

  let name = find(/full\s*name|^name$|^student\s*name$/i);
  if (name < 0) name = find(/name/i, /user|file|e-?mail|nick|school|course|section|org/i);
  return { id, name: name === id ? -1 : name };
}

// rows -> [{ studentId, name }] ready to send, plus what was left out and why
export function rosterFromRows(rows, idCol, nameCol) {
  const seen = new Map();
  const badValues = [];
  let invalid = 0;
  let duplicates = 0;
  for (const r of rows) {
    const raw = r[idCol] ?? '';
    const no = normalizeStudentNo(raw);
    if (!STUDENT_NO.test(no)) { invalid++; if (badValues.length < 5) badValues.push(raw || '(empty)'); continue; }
    const name = nameCol >= 0 ? r[nameCol] ?? '' : '';
    if (seen.has(no)) {
      duplicates++;
      if (!seen.get(no).name && name) seen.get(no).name = name; // keep a name if the first copy had none
      continue;
    }
    seen.set(no, { studentId: no, name });
  }
  return { list: [...seen.values()], invalid, duplicates, badValues };
}

// For one session: every person on its list with whether they came. roster: the session's list; events: its taps.
// status: 'attended' | 'absent' | 'no-account' (filled in the form but has no Hub account, so cannot be scanned)
export function attendanceRows(roster, events) {
  const firstTap = new Map(); // student id -> time of their first tap
  for (const e of events) {
    if (!e.student) continue;
    const t = firstTap.get(e.student.id);
    if (!t || e.scannedAt < t) firstTap.set(e.student.id, e.scannedAt);
  }
  return roster.map((r) => ({
    ...r,
    firstTap: r.userId ? firstTap.get(r.userId) || null : null,
    status: !r.userId ? 'no-account' : firstTap.has(r.userId) ? 'attended' : 'absent',
  }));
}
