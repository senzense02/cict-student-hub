// One session in the Door log: who came, who did not, and every tap, with CSV downloads.
import { useEffect, useMemo, useState } from 'react';
import { api } from '../api.js';
import { useAuth } from '../context/AuthContext.jsx';
import { useFresh, useLive } from '../lib/live.js';
import { attendanceRows, toCsv } from '../lib/logic.js';
import { downloadText } from '../lib/download.js';
import PageHeader from './PageHeader.jsx';
import Avatar from './Avatar.jsx';
import TapRow, { ACTION_LABEL } from './TapRow.jsx';

const TAP_FILTERS = [['ALL', 'All'], ['CHECK_IN', 'Check ins'], ['TEMPORARY_EXIT', 'Exits'], ['RE_ENTRY', 'Re-entries'], ['UNKNOWN_CARD', 'Unregistered']];
const WHO_FILTERS = [['ALL', 'Everyone'], ['attended', 'Came'], ['absent', 'Did not come'], ['no-account', 'No Hub account']];
const STATUS = { attended: ['Came', 'text-ok'], absent: ['Did not come', 'text-bad-ink'], 'no-account': ['No Hub account', 'text-warn-ink'] };
const plural = (n, one, many) => `${n} ${n === 1 ? one : many}`;
const when = (iso) => new Date(iso).toLocaleString([], { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
const slug = (s) => s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'session';

export default function SessionLog({ id, onBack }) {
  const { user } = useAuth();
  const [data, setData] = useState(null); // { session, roster, events }
  const [error, setError] = useState('');
  const [tab, setTab] = useState('taps');
  const [action, setAction] = useState('ALL');
  const [who, setWho] = useState('ALL');
  const [deleting, setDeleting] = useState(false);

  // silent = a live refresh: a failed attempt is ignored, the next change tries again
  const load = (silent = false) =>
    api(`/attendance/log?session=${id}`)
      .then((d) => { setData(d); setError(''); })
      .catch((e) => {
        if (e.status === 404) return onBack(); // deleted while open
        if (!silent) setError(e.message);
      });
  useEffect(() => { load(); }, [id]);
  // A running session keeps changing; a finished one only changes if a phone uploads late (Refresh shows it)
  useLive(['door', 'sessions', 'users'], () => { if (data?.session.status === 'active') load(true); });

  const events = data?.events || [];
  const roster = data?.roster || [];
  const people = useMemo(() => attendanceRows(roster, events), [roster, events]);
  const freshTaps = useFresh(events.map((e) => e.clientId));
  const shownTaps = useMemo(() => (action === 'ALL' ? events : events.filter((e) => e.action === action)), [events, action]);
  const shownPeople = useMemo(() => (who === 'ALL' ? people : people.filter((p) => p.status === who)), [people, who]);

  if (!data) {
    return (
      <>
        <button onClick={onBack} className="btn-text mb-3">All sessions</button>
        {error ? <p className="alert" role="alert">{error}</p> : <p className="note">Loading</p>}
      </>
    );
  }

  const { session } = data;
  const hasList = roster.length > 0;
  const count = (status) => people.filter((p) => p.status === status).length;
  // These count different people, not taps, since one person can tap many times
  const offListPeople = new Set(events.filter((e) => e.offList && e.student).map((e) => e.student.id)).size;
  const unknown = events.filter((e) => e.action === 'UNKNOWN_CARD').length;
  const peopleSeen = new Set(events.filter((e) => e.student).map((e) => e.student.id)).size;

  // With a registration list we compare against it. Without one we only count what was scanned
  const tiles = hasList
    ? [
        { label: 'On the list', n: roster.length, tint: 'bg-lilac' },
        { label: 'Came', n: count('attended'), tint: 'bg-sage' },
        { label: 'Did not come', n: count('absent'), tint: 'bg-blush', sub: count('no-account') ? `${count('no-account')} more with no Hub account` : null },
        { label: 'Not on the list', n: offListPeople, tint: 'bg-sand', sub: unknown ? `${plural(unknown, 'unregistered card', 'unregistered cards')}` : null },
      ]
    : [
        { label: 'Students', n: peopleSeen, tint: 'bg-lilac' },
        { label: 'Taps', n: events.length, tint: 'bg-sage' },
        { label: 'Unregistered cards', n: unknown, tint: 'bg-sand' },
      ];

  const downloadTaps = () => {
    const rows = shownTaps.map((e) => ({
      time: new Date(e.scannedAt).toLocaleString(),
      studentId: e.student?.studentId || '',
      name: e.student?.name || 'Unregistered card',
      program: e.student?.program || '',
      year: e.student?.yearLevel || '',
      action: ACTION_LABEL[e.action],
      onList: !hasList || !e.student ? '' : e.offList ? 'No' : 'Yes',
      by: e.by || '',
    }));
    const cols = [['time', 'Time'], ['studentId', 'Student ID'], ['name', 'Name'], ['program', 'Program'], ['year', 'Year'], ['action', 'Action'], ...(hasList ? [['onList', 'On the list']] : []), ['by', 'Scanned by']];
    downloadText(`${slug(session.name)}-taps.csv`, toCsv(rows, cols));
  };
  const downloadAttendance = () => {
    const rows = shownPeople.map((p) => ({
      studentNo: p.studentNo,
      name: p.name,
      program: p.program || '',
      year: p.yearLevel || '',
      status: STATUS[p.status][0],
      firstTap: p.firstTap ? new Date(p.firstTap).toLocaleString() : '',
    }));
    downloadText(`${slug(session.name)}-attendance.csv`, toCsv(rows, [['studentNo', 'Student ID'], ['name', 'Name'], ['program', 'Program'], ['year', 'Year'], ['status', 'Status'], ['firstTap', 'First tap']]));
  };

  const remove = async () => {
    if (!confirm(`Delete "${session.name}" and its ${plural(session.counts.taps, 'tap', 'taps')}? This cannot be undone.`)) return;
    setDeleting(true);
    try {
      await api(`/attendance/sessions/${session.id}`, { method: 'DELETE' });
      onBack();
    } catch (e) {
      setError(e.message);
      setDeleting(false);
    }
  };

  const by = session.createdByName ? ` Run by ${session.createdByName}.` : '';
  return (
    <>
      <button onClick={onBack} className="btn-text mb-3">All sessions</button>
      <PageHeader
        title={session.name}
        sub={session.status === 'active' ? `Running since ${when(session.startedAt)}.${by} This page updates as cards are tapped.` : `${when(session.startedAt)} to ${when(session.endedAt)}.${by}`}
      >
        <button onClick={tab === 'attendance' ? downloadAttendance : downloadTaps} disabled={(tab === 'attendance' ? shownPeople : shownTaps).length === 0} className="btn btn-primary">
          {tab === 'attendance' ? 'Download attendance CSV' : 'Download taps CSV'}
        </button>
      </PageHeader>

      {error && <p className="alert mb-4" role="alert">{error}</p>}

      <div className={`grid grid-cols-2 gap-3 ${tiles.length === 4 ? 'lg:grid-cols-4' : 'lg:grid-cols-3'}`}>
        {tiles.map((t, i) => (
          <div key={t.label} style={{ '--i': i }} className={`tile rise ${t.tint}`}>
            <p className="font-display text-[2.4rem] font-medium leading-none tabular-nums">{t.n}</p>
            <p className="mt-1.5 text-sm">{t.label}</p>
            {t.sub && <p className="text-xs text-ink/70">{t.sub}</p>}
          </div>
        ))}
      </div>

      <div className="mb-4 mt-6 flex flex-wrap items-center gap-3">
        {hasList && (
          <div className="flex gap-1.5" role="group" aria-label="Show">
            <button className="chip" aria-pressed={tab === 'taps'} onClick={() => setTab('taps')}>Taps</button>
            <button className="chip" aria-pressed={tab === 'attendance'} onClick={() => setTab('attendance')}>Attendance</button>
          </div>
        )}
        <div className="flex flex-wrap gap-1.5" role="group" aria-label={tab === 'attendance' ? 'Who' : 'Type of tap'}>
          {(tab === 'attendance' ? WHO_FILTERS : TAP_FILTERS).map(([v, text]) => (
            <button key={v} className="chip" aria-pressed={(tab === 'attendance' ? who : action) === v} onClick={() => (tab === 'attendance' ? setWho(v) : setAction(v))}>{text}</button>
          ))}
        </div>
        <button onClick={() => load()} className="btn-text">Refresh</button>
      </div>

      <div className="overflow-hidden rounded-3xl border border-line bg-white">
        {tab === 'taps' && shownTaps.length === 0 && <p className="note p-4">{events.length ? 'No taps match.' : 'No taps in this session.'}</p>}
        {tab === 'taps' && shownTaps.map((e) => <TapRow key={e.clientId} e={e} fresh={freshTaps.has(e.clientId)} />)}

        {tab === 'attendance' && shownPeople.length === 0 && <p className="note p-4">Nobody matches.</p>}
        {tab === 'attendance' && shownPeople.map((p) => (
          <div key={p.studentNo} className="row flex-wrap">
            <span className="flex min-w-0 items-center gap-3">
              <Avatar name={p.name || '?'} size={32} />
              <span className="min-w-0 text-sm">
                <span className="block truncate font-medium">{p.name || 'No name'}</span>
                <span className="text-muted">{p.studentNo}{p.program ? `, ${p.program} year ${p.yearLevel}` : ''}</span>
              </span>
            </span>
            <span className="flex items-center gap-4 text-sm">
              <span className={STATUS[p.status][1]}>{STATUS[p.status][0]}</span>
              {p.firstTap && <span className="text-xs text-muted tabular-nums">{new Date(p.firstTap).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>}
            </span>
          </div>
        ))}
      </div>

      {user.role === 'admin' && session.status === 'ended' && (
        <button onClick={remove} disabled={deleting} className="btn-text mt-8 text-bad-ink">{deleting ? 'Deleting' : 'Delete this session'}</button>
      )}
    </>
  );
}
