import { useEffect, useMemo, useState } from 'react';
import { api } from '../api.js';
import PageHeader from '../components/PageHeader.jsx';
import Avatar from '../components/Avatar.jsx';
import { toCsv } from '../lib/logic.js';

const LABEL = { CHECK_IN: 'Checked in', RE_ENTRY: 'Came back in', TEMPORARY_EXIT: 'Temporary exit', UNKNOWN_CARD: 'Unregistered card' };
const DOT = { CHECK_IN: 'bg-ok', RE_ENTRY: 'bg-ok', TEMPORARY_EXIT: 'bg-warn', UNKNOWN_CARD: 'bg-bad' };
const FILTERS = [['ALL', 'All'], ['CHECK_IN', 'Check ins'], ['TEMPORARY_EXIT', 'Exits'], ['RE_ENTRY', 'Re-entries'], ['UNKNOWN_CARD', 'Unregistered']];

const todayLocal = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

// Every door tap of one day, for the admin. Can be exported as a CSV.
export default function DoorLog() {
  const [date, setDate] = useState(todayLocal());
  const [action, setAction] = useState('ALL');
  const [events, setEvents] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const load = () => {
    setLoading(true);
    setError('');
    api(`/attendance/log?date=${date}`)
      .then((r) => setEvents(r.events))
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  };
  useEffect(load, [date]);

  const shown = useMemo(() => (action === 'ALL' ? events : events.filter((e) => e.action === action)), [events, action]);
  const peopleCount = new Set(events.filter((e) => e.student).map((e) => e.student.id)).size;

  const download = () => {
    const rows = shown.map((e) => ({
      time: new Date(e.scannedAt).toLocaleString(),
      studentId: e.student?.studentId || '',
      name: e.student?.name || 'Unregistered card',
      program: e.student?.program || '',
      year: e.student?.yearLevel || '',
      action: LABEL[e.action],
      by: e.by || '',
    }));
    const csv = toCsv(rows, [['time', 'Time'], ['studentId', 'Student ID'], ['name', 'Name'], ['program', 'Program'], ['year', 'Year'], ['action', 'Action'], ['by', 'Scanned by']]);
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv' }));
    a.download = `door-log-${date}.csv`;
    a.click();
    URL.revokeObjectURL(a.href);
  };

  return (
    <>
      <PageHeader title="Door log" sub="Every card tap recorded at the door. Pick a day to review it or export it.">
        <button onClick={download} disabled={shown.length === 0} className="btn btn-primary">Download CSV</button>
      </PageHeader>

      <div className="mb-4 flex flex-wrap items-center gap-3">
        <input type="date" className="field max-w-[190px]" aria-label="Day" value={date} max={todayLocal()} onChange={(e) => e.target.value && setDate(e.target.value)} />
        <div className="flex flex-wrap gap-1.5" role="group" aria-label="Type of tap">
          {FILTERS.map(([v, text]) => (
            <button key={v} className="chip" aria-pressed={action === v} onClick={() => setAction(v)}>{text}</button>
          ))}
        </div>
        <button onClick={load} className="btn-text">Refresh</button>
      </div>

      <p className="note mb-3">{events.length} taps from {peopleCount} {peopleCount === 1 ? 'student' : 'students'} on this day.</p>
      {error && <p className="alert mb-4" role="alert">{error}</p>}

      <div className="overflow-hidden rounded-3xl border border-line bg-white">
        {loading && <p className="note p-4">Loading</p>}
        {!loading && shown.length === 0 && <p className="note p-4">No taps match.</p>}
        {!loading && shown.map((e) => (
          <div key={e.clientId} className="row flex-wrap">
            <span className="flex min-w-0 items-center gap-3">
              <Avatar name={e.student?.name || '?'} size={32} />
              <span className="min-w-0 text-sm">
                <span className="block truncate font-medium">{e.student ? e.student.name : 'Unregistered card'}</span>
                <span className="text-muted">{e.student ? `${e.student.studentId}, ${e.student.program} year ${e.student.yearLevel}` : e.token}</span>
              </span>
            </span>
            <span className="flex items-center gap-4 text-sm">
              <span className="flex items-center gap-2"><span className={`h-2.5 w-2.5 rounded-full ${DOT[e.action]}`} />{LABEL[e.action]}</span>
              <span className="text-xs text-muted tabular-nums">{new Date(e.scannedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}</span>
              {e.by && <span className="hidden text-xs text-muted sm:inline">by {e.by}</span>}
            </span>
          </div>
        ))}
      </div>
    </>
  );
}
