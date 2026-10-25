// The Door log, for admins and event staff. Two views of the same taps:
//   By session  every event that was run, open one to see who came and who did not
//   By day      every tap of one calendar day, whichever session it belongs to. This is how the log
//               worked before sessions existed, so taps from before sessions still show up here.
import { useEffect, useMemo, useState } from 'react';
import { api } from '../api.js';
import PageHeader from '../components/PageHeader.jsx';
import TapRow, { ACTION_LABEL } from '../components/TapRow.jsx';
import SessionLog from '../components/SessionLog.jsx';
import { toCsv } from '../lib/logic.js';
import { downloadText } from '../lib/download.js';
import { useFresh, useLive } from '../lib/live.js';

const FILTERS = [['ALL', 'All'], ['CHECK_IN', 'Check ins'], ['TEMPORARY_EXIT', 'Exits'], ['RE_ENTRY', 'Re-entries'], ['UNKNOWN_CARD', 'Unregistered']];

// Today as YYYY-MM-DD, built from local date parts so it matches the day on the user's clock
const todayLocal = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};
const when = (iso) => new Date(iso).toLocaleString([], { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });

// Every session that has started, newest first
function SessionsView({ onOpen }) {
  const [sessions, setSessions] = useState(null);
  const [error, setError] = useState('');

  const load = () =>
    api('/attendance/sessions')
      .then((list) => { setSessions(list.filter((s) => s.status !== 'draft')); setError(''); }) // drafts are hidden: they have no taps yet
      .catch((e) => setError(e.message));
  useEffect(() => { load(); }, []);
  useLive(['sessions', 'door'], load);
  const fresh = useFresh((sessions || []).map((s) => s.id));

  return (
    <>
      {error && <p className="alert mb-4" role="alert">{error}</p>}
      {!sessions && !error && <p className="note">Loading</p>}
      {sessions && (
        <div className="overflow-hidden rounded-3xl border border-line bg-white">
          {sessions.length === 0 && <p className="note p-4">No sessions yet. Event staff start one from the Door scanner.</p>}
          {sessions.map((s) => {
            const c = s.counts;
            return (
              <button key={s.id} onClick={() => onOpen(s.id)} className={`row w-full flex-wrap text-left transition-colors hover:bg-plum-100/60 ${fresh.has(s.id) ? 'flash' : ''}`}>
                <span className="min-w-0">
                  <span className="block truncate font-medium">{s.name}</span>
                  <span className="text-sm text-muted">
                    {s.status === 'active' ? `Started ${when(s.startedAt)}` : `${when(s.startedAt)} to ${when(s.endedAt)}`}
                    {s.createdByName ? `, by ${s.createdByName}` : ''}
                  </span>
                </span>
                <span className="flex items-center gap-3 text-sm">
                  {s.status === 'active' && <span className="inline-flex h-7 items-center rounded-full bg-sage px-3 text-[13px] font-medium text-ok">Running</span>}
                  <span className="tabular-nums">
                    {c.roster ? `${c.attended} of ${c.roster} came` : `${c.students} ${c.students === 1 ? 'student' : 'students'}`}
                  </span>
                </span>
              </button>
            );
          })}
        </div>
      )}
    </>
  );
}

// Every door tap of one day, with a filter by type of tap and a CSV export
function DayView() {
  const [date, setDate] = useState(todayLocal());
  const [action, setAction] = useState('ALL');
  const [events, setEvents] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  // silent = a live refresh: no spinner, and a failure is ignored because the next change tries again
  const load = (silent = false) => {
    if (!silent) { setLoading(true); setError(''); }
    api(`/attendance/log?date=${date}`)
      .then((r) => setEvents(r.events))
      .catch((e) => { if (!silent) setError(e.message); })
      .finally(() => setLoading(false));
  };
  useEffect(() => { load(); }, [date]);
  useLive(['door', 'users', 'sessions'], () => { if (date === todayLocal()) load(true); }); // only "today" can change
  const freshTaps = useFresh(events.map((e) => e.clientId));

  const shown = useMemo(() => (action === 'ALL' ? events : events.filter((e) => e.action === action)), [events, action]);
  const peopleCount = new Set(events.filter((e) => e.student).map((e) => e.student.id)).size;

  // Exports what is on screen (after the type filter)
  const download = () => {
    const rows = shown.map((e) => ({
      time: new Date(e.scannedAt).toLocaleString(),
      studentId: e.student?.studentId || '',
      name: e.student?.name || 'Unregistered card',
      program: e.student?.program || '',
      year: e.student?.yearLevel || '',
      action: ACTION_LABEL[e.action],
      session: e.session ? e.session.name || 'Deleted session' : '',
      by: e.by || '',
    }));
    downloadText(`door-log-${date}.csv`, toCsv(rows, [['time', 'Time'], ['studentId', 'Student ID'], ['name', 'Name'], ['program', 'Program'], ['year', 'Year'], ['action', 'Action'], ['session', 'Session'], ['by', 'Scanned by']]));
  };

  return (
    <>
      <div className="mb-4 flex flex-wrap items-center gap-3">
        {/* Future days are blocked, and clearing the field keeps the current day */}
        <input type="date" className="field max-w-[190px]" aria-label="Day" value={date} max={todayLocal()} onChange={(e) => e.target.value && setDate(e.target.value)} />
        <div className="flex flex-wrap gap-1.5" role="group" aria-label="Type of tap">
          {FILTERS.map(([v, text]) => (
            <button key={v} className="chip" aria-pressed={action === v} onClick={() => setAction(v)}>{text}</button>
          ))}
        </div>
        <button onClick={() => load()} className="btn-text">Refresh</button>
        <button onClick={download} disabled={shown.length === 0} className="btn btn-primary btn-sm ml-auto">Download CSV</button>
      </div>

      <p className="note mb-3">{events.length} taps from {peopleCount} {peopleCount === 1 ? 'student' : 'students'} on this day.</p>
      {error && <p className="alert mb-4" role="alert">{error}</p>}

      <div className="overflow-hidden rounded-3xl border border-line bg-white">
        {loading && <p className="note p-4">Loading</p>}
        {!loading && shown.length === 0 && <p className="note p-4">No taps match.</p>}
        {!loading && shown.map((e) => <TapRow key={e.clientId} e={e} fresh={freshTaps.has(e.clientId)} showSession />)}
      </div>
    </>
  );
}

export default function DoorLog() {
  const [view, setView] = useState('sessions');
  const [openId, setOpenId] = useState(null);

  if (openId) return <SessionLog id={openId} onBack={() => setOpenId(null)} />;

  return (
    <>
      <PageHeader title="Door log" sub="Every card tap recorded at the door. Open a session to see who came, or look at one day to see all of its taps." />
      <div className="mb-4 flex gap-1.5" role="group" aria-label="View">
        <button className="chip" aria-pressed={view === 'sessions'} onClick={() => setView('sessions')}>By session</button>
        <button className="chip" aria-pressed={view === 'day'} onClick={() => setView('day')}>By day</button>
      </div>
      {view === 'sessions' ? <SessionsView onOpen={setOpenId} /> : <DayView />}
    </>
  );
}
