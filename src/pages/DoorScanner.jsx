// Door scanner: staff pick (or create) a session for the event, then tap student ID cards at the entrance.
// Each tap flips a student between inside and outside, belongs to that session, is saved on the phone first,
// and uploads in the background, so it also works offline. Ending the session moves it to the Door log.
//
//   no session chosen  ->  SessionList      (running sessions, new session)
//   session is draft   ->  SessionSetup     (import the Google Form list, start)
//   session is active  ->  ScanSession      (the scanner)
//   session is ended   ->  a short message  (its log is in the Door log)
import { useEffect, useMemo, useRef, useState } from 'react';
import { api } from '../api.js';
import { useAuth } from '../context/AuthContext.jsx';
import Banner, { useBanner } from '../components/Banner.jsx';
import ScanControls from '../components/ScanControls.jsx';
import SyncBar from '../components/SyncBar.jsx';
import PageHeader from '../components/PageHeader.jsx';
import Ring from '../components/Ring.jsx';
import Avatar from '../components/Avatar.jsx';
import SessionList from '../components/SessionList.jsx';
import SessionSetup from '../components/SessionSetup.jsx';
import { store, uid, refreshStudents, refreshSession, pendingCount, syncAll } from '../lib/offline.js';
import { useLive } from '../lib/live.js';
import { nextDoorAction, doorStats } from '../lib/logic.js';

const LABEL = { CHECK_IN: 'Checked in', RE_ENTRY: 'Welcome back', TEMPORARY_EXIT: 'Temporary exit' };
const DOT = { green: 'bg-ok', yellow: 'bg-warn', red: 'bg-bad' };
const plural = (n, one, many) => `${n} ${n === 1 ? one : many}`;
const when = (iso) => new Date(iso).toLocaleString([], { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });

// The scanner for one running session
function ScanSession({ session, roster, reload, onLeave }) {
  const { user } = useAuth();
  const sid = session.id;
  const canManage = user.role === 'admin' || session.createdBy === user.id;
  const [students, setStudents] = useState(store.students());
  const [venue, setVenue] = useState(store.venue(sid));
  const [banner, setBanner] = useBanner();
  const [recent, setRecent] = useState([]);
  const [pending, setPending] = useState(pendingCount(user.role));
  const [note, setNote] = useState('');
  const [query, setQuery] = useState('');
  const [ending, setEnding] = useState(false);

  // The session was reloaded from the server (new list, or who is inside changed on another phone)
  useEffect(() => { setVenue(store.venue(sid)); }, [session, roster]);

  // Refresh the roster and the session. Offline, we keep using the copies saved on this phone.
  const loadFromServer = async () => {
    setNote('');
    try {
      setStudents(await refreshStudents());
      await reload();
      setNote('Student list updated.');
    } catch (e) {
      setNote(`Using the saved student list. ${e.message}`);
    }
  };

  useEffect(() => {
    refreshStudents().then(setStudents).catch(() => {});
  }, []);

  // Cards linked (or students added) by an admin reach this phone within seconds
  useLive(['users'], () => refreshStudents().then(setStudents).catch(() => {}));

  // Upload each tap right after it happens so the admin sees it live. Offline? It stays queued and
  // goes up when the connection returns.
  const syncTimer = useRef(null);
  const syncSoon = () => {
    clearTimeout(syncTimer.current);
    syncTimer.current = setTimeout(() => {
      if (!navigator.onLine) return;
      syncAll(user.role).catch(() => {}).finally(() => setPending(pendingCount(user.role)));
    }, 700);
  };
  useEffect(() => () => clearTimeout(syncTimer.current), []);

  // Card serial number -> student, so each tap is a quick lookup that needs no network
  const byToken = useMemo(() => new Map(students.filter((s) => s.nfcToken).map((s) => [s.nfcToken, s])), [students]);

  // The registration list. With no list imported, everyone is welcome and nobody is flagged.
  const hasList = roster.length > 0;
  const onList = useMemo(() => new Set(roster.filter((r) => r.userId).map((r) => r.userId)), [roster]);
  const expected = useMemo(() => (hasList ? students.filter((s) => onList.has(s.id)) : students), [students, onList, hasList]);

  const onToken = (token) => {
    const student = byToken.get(token);
    const scannedAt = new Date().toISOString();

    if (!student) {
      // Unregistered card: still log it, so admins see it in the Overview and Door log
      store.setEvents([...store.events(), { clientId: uid(), student: null, token, action: 'UNKNOWN_CARD', scannedAt, session: sid }]);
      setBanner({ kind: 'red', title: 'Unregistered card', subtitle: token });
      setRecent((r) => [{ at: scannedAt, text: `Unknown card ${token}`, kind: 'red' }, ...r].slice(0, 8));
    } else {
      // Read the saved state, not React state, so two quick taps in a row can't both see the old value
      const current = store.venue(sid);
      const { action, state } = nextDoorAction(current[student.id]);
      const next = { ...current, [student.id]: state };
      store.setVenue(sid, next);
      store.setEvents([...store.events(), { clientId: uid(), student: student.id, token, action, scannedAt, session: sid }]);
      setVenue(next);
      // Not on the list: the tap is recorded all the same, but staff see a red result so they can decide
      const offList = hasList && !onList.has(student.id);
      const kind = offList ? 'red' : action === 'TEMPORARY_EXIT' ? 'yellow' : 'green';
      setBanner({ kind, title: student.name, subtitle: offList ? `${LABEL[action]}. Not on the list.` : LABEL[action] });
      setRecent((r) => [{ at: scannedAt, text: `${student.name}, ${LABEL[action].toLowerCase()}${offList ? ', not on the list' : ''}`, kind }, ...r].slice(0, 8));
    }
    setPending(pendingCount(user.role));
    syncSoon();
  };

  const stats = doorStats(expected, venue);
  const shown = expected.filter((s) => `${s.name} ${s.studentId}`.toLowerCase().includes(query.toLowerCase())).slice(0, 50);
  const noAccount = roster.filter((r) => !r.userId).length;
  const offTapped = hasList ? students.filter((s) => !onList.has(s.id) && venue[s.id]).length : 0;

  // Resets who is inside on this phone for this session. Taps not yet uploaded are kept, so no attendance is lost.
  const resetVenue = () => {
    if (!confirm('Clear Inside/Outside status for this session on this phone? Unsent taps are kept.')) return;
    store.setVenue(sid, {});
    setVenue({});
  };

  // Ending needs a connection: every tap on this phone must reach the server first, so the log is complete
  // the moment the session appears in the Door log.
  const end = async () => {
    if (!confirm(`End "${session.name}"? No more cards can be scanned into it, and it moves to the Door log.`)) return;
    setEnding(true);
    setNote('');
    try {
      await syncAll(user.role);
      setPending(pendingCount(user.role));
      if (store.events().some((e) => e.session === sid)) throw new Error('Some taps are still waiting to upload. Try again in a moment');
      await api(`/attendance/sessions/${sid}`, { method: 'PATCH', body: { status: 'ended' } });
      store.dropSession(sid);
      onLeave({ message: `"${session.name}" has ended. Its log is now in the Door log.`, link: true });
    } catch (e) {
      setNote(`Could not end the session: ${e.message}. Your taps are safe on this phone.`);
      setEnding(false);
    }
  };

  const tiles = [
    { label: hasList ? 'On the list' : 'Registered', n: stats.total, tint: 'bg-lilac' },
    { label: 'Inside', n: stats.inside, tint: 'bg-sage', ring: 'var(--color-ok)' },
    { label: 'Temporarily outside', n: stats.outside, tint: 'bg-sand', ring: '#c99410' },
    { label: 'Not yet arrived', n: stats.notArrived, tint: 'bg-blush', ring: 'var(--color-plum-700)' },
  ];

  return (
    <>
      <PageHeader title={session.name} sub={`Started ${when(session.startedAt)}. Each tap flips a student between inside and outside. Works without internet.`}>
        <div className="flex gap-2">
          <button onClick={() => onLeave()} className="btn btn-line btn-sm">All sessions</button>
          {canManage && <button onClick={end} disabled={ending} className="btn btn-danger btn-sm">{ending ? 'Ending' : 'End session'}</button>}
        </div>
      </PageHeader>
      <div className="space-y-5">
        <Banner banner={banner} />
        <ScanControls onToken={onToken} />

        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          {tiles.map((t) => (
            <div key={t.label} className={`tile ${t.tint} flex items-center justify-between gap-2`}>
              <div className="min-w-0">
                <p className="font-display text-[2.4rem] font-medium leading-none tabular-nums">{t.n}</p>
                <p className="mt-1.5 text-sm">{t.label}</p>
              </div>
              {t.ring && <Ring value={t.n} total={stats.total} color={t.ring} size={54} stroke={7} />}
            </div>
          ))}
        </div>
        {hasList && (noAccount > 0 || offTapped > 0) && (
          <p className="note">
            {noAccount > 0 && `${plural(noAccount, 'student on the list has', 'students on the list have')} no Hub account yet, so they cannot be scanned. `}
            {offTapped > 0 && `${plural(offTapped, 'student who is not on the list has', 'students who are not on the list have')} tapped.`}
          </p>
        )}

        <div className="rounded-3xl border border-line bg-white p-4">
          <SyncBar pending={pending} onSynced={() => setPending(pendingCount(user.role))} />
          <div className="mt-3 flex flex-wrap gap-5">
            <button onClick={loadFromServer} className="btn-text">Refresh student list</button>
            <button onClick={resetVenue} className="btn-text text-muted">Reset inside and outside on this phone</button>
          </div>
          {note && <p className="note mt-2">{note}</p>}
          {students.filter((s) => s.nfcToken).length === 0 && <p className="mt-2 text-sm text-warn-ink">No student has a card linked yet. Ask an admin to link the ID cards.</p>}
        </div>

        {/* grid-cols-1 and min-w-0 on the sections: without them a long student name stretches the column
            wider than a phone screen and the cards get cut off on the right */}
        <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
          <section aria-label="Recent scans" className="min-w-0">
            <h2 className="mb-2 text-xl font-medium">Recent scans</h2>
            <div className="overflow-hidden rounded-3xl border border-line bg-white">
              {recent.length === 0 && <p className="note p-4">Scans from this session appear here.</p>}
              {recent.map((r, i) => (
                <div key={r.at} className={`row ${i === 0 ? 'flash' : ''}`}>
                  <span className="flex items-center gap-3 text-sm"><span className={`h-2.5 w-2.5 rounded-full ${DOT[r.kind]}`} />{r.text}</span>
                  <span className="text-xs text-muted tabular-nums">{new Date(r.at).toLocaleTimeString()}</span>
                </div>
              ))}
            </div>
          </section>

          <section aria-label="Students" className="min-w-0">
            <h2 className="mb-2 text-xl font-medium">{hasList ? 'On the list' : 'Students'}</h2>
            <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search by name or ID" className="field mb-3" aria-label="Search students" />
            <div className="max-h-80 overflow-y-auto rounded-3xl border border-line bg-white">
              {shown.map((s) => {
                const st = venue[s.id];
                return (
                  <div key={s.id} className="row">
                    <span className="flex min-w-0 items-center gap-3"><Avatar name={s.name} size={30} /><span className="truncate text-sm">{s.name}<span className="ml-2 text-muted">{s.studentId}</span></span></span>
                    <span className={`text-sm ${st === 'INSIDE' ? 'text-ok' : st === 'OUTSIDE' ? 'text-warn-ink' : 'text-muted'}`}>{st === 'INSIDE' ? 'Inside' : st === 'OUTSIDE' ? 'Outside' : 'Not yet'}</span>
                  </div>
                );
              })}
            </div>
          </section>
        </div>
      </div>
    </>
  );
}

// Loads the chosen session and shows the right screen for where it is in its life
function SessionView({ id, onLeave, onNavigate }) {
  const { user } = useAuth();
  const [data, setData] = useState(() => store.sessionData(id)); // { session, roster }: the copy saved on this phone, then the server's
  const [error, setError] = useState('');

  const reload = async () => {
    try {
      const d = await refreshSession(id);
      setData({ session: d.session, roster: d.roster });
      setError('');
    } catch (e) {
      if (e.status === 404) { // deleted by an admin
        store.dropSession(id);
        onLeave({ message: 'That session no longer exists.' });
        return;
      }
      setError(`Could not refresh this session: ${e.message}`);
    }
  };
  useEffect(() => { reload(); }, [id]);
  // Someone imports a list, starts or ends the session, or a student gets a card: follow along
  useLive(['sessions', 'users'], reload);

  if (!data) {
    return (
      <>
        <button onClick={() => onLeave()} className="btn-text mb-3">Back to sessions</button>
        {error ? <p className="alert" role="alert">{error}</p> : <p className="note">Loading</p>}
      </>
    );
  }

  const { session, roster } = data;
  const canManage = user.role === 'admin' || session.createdBy === user.id;

  if (session.status === 'ended') {
    return (
      <>
        <PageHeader title={session.name} sub="This session has ended." />
        <div className="space-y-3 rounded-3xl border border-line bg-white p-5">
          <p className="text-sm">Its log, with everyone who came, is in the Door log. Taps still waiting on a phone are added when that phone reconnects.</p>
          <div className="flex flex-wrap gap-3">
            <button onClick={() => { store.dropSession(id); onLeave(); onNavigate('log'); }} className="btn btn-primary">Open Door log</button>
            <button onClick={() => { store.dropSession(id); onLeave(); }} className="btn btn-line">Back to sessions</button>
          </div>
        </div>
      </>
    );
  }

  return (
    <>
      {error && <p className="alert mb-4" role="alert">{error}. Showing the copy saved on this phone.</p>}
      {session.status === 'draft'
        ? <SessionSetup session={session} roster={roster} canManage={canManage} onChanged={reload} onLeave={() => onLeave()} />
        : <ScanSession session={session} roster={roster} reload={reload} onLeave={onLeave} />}
    </>
  );
}

export default function DoorScanner({ onNavigate }) {
  const [sessionId, setSessionId] = useState(store.session()); // remembered, so a reload picks up where the phone was
  const [notice, setNotice] = useState(null);

  const open = (id) => { store.setSession(id); setSessionId(id); setNotice(null); };
  const leave = (n = null) => { store.setSession(null); setSessionId(null); setNotice(n); };

  return sessionId
    ? <SessionView key={sessionId} id={sessionId} onLeave={leave} onNavigate={onNavigate} />
    : <SessionList onOpen={open} onNavigate={onNavigate} notice={notice} onDismiss={() => setNotice(null)} />;
}
