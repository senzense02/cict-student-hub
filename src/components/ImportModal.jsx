// Popup that reads the responses downloaded from a Google Form (or rows pasted from its Google Sheet),
// lets staff check which column is the Student ID, and adds those students to a session's list.
// The file is read in the browser; only the finished list is sent to the server.
import { useMemo, useState } from 'react';
import { api } from '../api.js';
import { guessColumns, hasHeaderRow, parseTable, rosterFromRows } from '../lib/logic.js';
import Icon from './Icon.jsx';

const MAX_ROWS = 5000; // the server's limit for one list

export default function ImportModal({ sessionId, existing, onClose, onDone }) {
  const [text, setText] = useState('');
  const [fileName, setFileName] = useState('');
  const [picked, setPicked] = useState(null); // { id, name }: columns the person chose; null = use the guess
  const [mode, setMode] = useState('add');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  // Re-read only when the text changes. A pasted list of bare IDs has no title row, so none is dropped.
  const table = useMemo(() => {
    const rows = parseTable(text);
    const titled = hasHeaderRow(rows);
    const header = rows.length ? (titled ? rows[0] : rows[0].map((_, i) => `Column ${i + 1}`)) : [];
    const body = titled ? rows.slice(1) : rows;
    return { header, body, guess: guessColumns(header, body) };
  }, [text]);
  const cols = picked || table.guess;
  const preview = useMemo(
    () => (table.body.length && cols.id >= 0 ? rosterFromRows(table.body, cols.id, cols.name) : null),
    [table, cols.id, cols.name]
  );
  const tooMany = preview && preview.list.length > MAX_ROWS;

  const onFile = async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    if (file.size > 2_000_000) return setError('That file is over 2 MB. A Google Form export is much smaller, so check that it is the right file.');
    try {
      setText(await file.text());
      setFileName(file.name);
      setPicked(null);
      setError('');
    } catch {
      setError('Could not read that file.');
    }
  };
  const clearFile = () => { setText(''); setFileName(''); setPicked(null); };

  const submit = async (e) => {
    e.preventDefault();
    if (!preview || !preview.list.length || tooMany) return;
    setBusy(true);
    setError('');
    try {
      onDone(await api(`/attendance/sessions/${sessionId}/roster`, { method: 'POST', body: { rows: preview.list, mode } }));
    } catch (err) {
      setError(err.message);
      setBusy(false);
    }
  };

  const pick = (key) => (e) => setPicked({ ...cols, [key]: Number(e.target.value) });

  return (
    <div className="fade-in fixed inset-0 z-30 grid place-items-center bg-ink/45 p-4" role="dialog" aria-modal="true" aria-labelledby="import-title">
      <form onSubmit={submit} className="rise max-h-[92vh] w-full max-w-lg space-y-3 overflow-y-auto rounded-[28px] bg-paper p-6">
        <h2 id="import-title" className="text-2xl font-medium tracking-tight">Import from Google Form</h2>
        <p className="note">
          In Google Forms, open the Responses tab, choose the three-dot menu, then Download responses (.csv). You can also paste
          rows copied from the linked Google Sheet.
        </p>
        {error && <p className="alert" role="alert">{error}</p>}

        {fileName ? (
          <div className="flex items-center gap-3 rounded-2xl border border-line bg-white px-4 py-3 text-sm">
            <span className="min-w-0 flex-1 truncate">{fileName}</span>
            <button type="button" onClick={clearFile} className="btn-text">Remove</button>
          </div>
        ) : (
          <>
            <label className="flex cursor-pointer items-center gap-3 rounded-2xl border border-dashed border-plum-300 bg-white px-4 py-3 text-sm">
              <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-plum-100 text-plum-700"><Icon name="upload" size={18} /></span>
              <span className="min-w-0 flex-1 truncate">Choose the responses file (.csv)</span>
              <input type="file" className="sr-only" accept=".csv,.tsv,.txt,text/csv,text/tab-separated-values,text/plain" onChange={onFile} />
            </label>
            <textarea className="field" rows={4} placeholder="Or paste the rows here" aria-label="Pasted rows" value={text} onChange={(e) => { setText(e.target.value); setPicked(null); }} />
          </>
        )}

        {table.header.length > 0 && (
          <div className="space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <label className="text-sm">
                <span className="mb-1 block text-muted">Student ID column</span>
                <select className="field" value={cols.id} onChange={pick('id')}>
                  {cols.id < 0 && <option value={-1}>Choose a column</option>}
                  {table.header.map((h, i) => <option key={i} value={i}>{h || `Column ${i + 1}`}</option>)}
                </select>
              </label>
              <label className="text-sm">
                <span className="mb-1 block text-muted">Name column</span>
                <select className="field" value={cols.name} onChange={pick('name')}>
                  <option value={-1}>No name column</option>
                  {table.header.map((h, i) => <option key={i} value={i}>{h || `Column ${i + 1}`}</option>)}
                </select>
              </label>
            </div>

            {cols.id < 0 && <p className="alert">No column looks like a Student ID, like 25-1167. Choose the one that does.</p>}

            {preview && (
              <div className="rounded-2xl border border-line bg-white p-4 text-sm">
                <p className="font-medium">{preview.list.length} {preview.list.length === 1 ? 'student' : 'students'} ready to import</p>
                {preview.list.slice(0, 3).map((r) => (
                  <p key={r.studentId} className="truncate text-muted">{r.studentId}{r.name ? `, ${r.name}` : ''}</p>
                ))}
                {preview.duplicates > 0 && <p className="mt-2 text-muted">{preview.duplicates} repeated {preview.duplicates === 1 ? 'row' : 'rows'} ignored.</p>}
                {preview.invalid > 0 && (
                  <p className="mt-2 text-warn-ink">
                    {preview.invalid} {preview.invalid === 1 ? 'row has' : 'rows have'} no readable Student ID and will be left out ({preview.badValues.join(', ')}
                    {preview.invalid > preview.badValues.length ? ', ...' : ''}).
                  </p>
                )}
                {tooMany && <p className="mt-2 text-bad-ink">A list can hold up to {MAX_ROWS} students.</p>}
              </div>
            )}
          </div>
        )}

        {existing > 0 && (
          <fieldset className="space-y-1.5 text-sm">
            <legend className="mb-1 font-medium">The list already has {existing} {existing === 1 ? 'student' : 'students'}</legend>
            <label className="flex items-center gap-2"><input type="radio" name="import-mode" checked={mode === 'add'} onChange={() => setMode('add')} />Add these to the list</label>
            <label className="flex items-center gap-2"><input type="radio" name="import-mode" checked={mode === 'replace'} onChange={() => setMode('replace')} />Replace the list with these</label>
          </fieldset>
        )}

        <div className="flex justify-end gap-2 pt-1">
          <button type="button" onClick={onClose} className="btn btn-line">Cancel</button>
          <button disabled={busy || !preview || !preview.list.length || tooMany} className="btn btn-primary">
            {busy ? 'Importing' : preview?.list.length ? `Import ${preview.list.length} ${preview.list.length === 1 ? 'student' : 'students'}` : 'Import'}
          </button>
        </div>
      </form>
    </div>
  );
}
