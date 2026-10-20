// Door scanner: staff tap student ID cards at the entrance. Each tap flips a student between inside and
// outside, is saved on the phone first, and uploads in the background, so it also works offline.
import { useEffect, useMemo, useRef, useState } from 'react';
import { useAuth } from '../context/AuthContext.jsx';
import Banner, { useBanner } from '../components/Banner.jsx';
import ScanControls from '../components/ScanControls.jsx';
import SyncBar from '../components/SyncBar.jsx';
import PageHeader from '../components/PageHeader.jsx';
import Ring from '../components/Ring.jsx';
import Avatar from '../components/Avatar.jsx';
import { store, uid, refreshStudents, refreshVenue, pendingCount, syncAll } from '../lib/offline.js';
import { useLive } from '../lib/live.js';
import { nextDoorAction, doorStats } from '../lib/logic.js';

const LABEL = { CHECK_IN: 'Checked in', RE_ENTRY: 'Welcome back', TEMPORARY_EXIT: 'Temporary exit' };
const DOT = { green: 'bg-ok', yellow: 'bg-warn', red: 'bg-bad' };

export default function DoorScanner() {
  const { user } = useAuth();
  const [students, setStudents] = useState(store.students());
  const [venue, setVenue] = useState(store.venue());
  const [banner, setBanner] = useBanner();
  const [recent, setRecent] = useState([]);
  const [pending, setPending] = useState(pendingCount(user.role));
  const [note, setNote] = useState('');
  const [query, setQuery] = useState('');

  // Refresh the roster and who is inside. Offline, we keep using the copy saved on this phone.
  const loadFromServer = async () => {
    setNote('');
    try {
      setStudents(await refreshStudents());
      const v = await refreshVenue();
      if (v) setVenue(v);
      setNote('Student list updated.');
    } catch (e) {
      setNote(`Using the saved student list. ${e.message}`);
    }
  };

  useEffect(() => {
    loadFromServer();
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

  const onToken = (token) => {
    const student = byToken.get(token);
    const scannedAt = new Date().toISOString();

    if (!student) {
      // Unregistered card: still log it, so admins see it in the Overview and Door log
      store.setEvents([...store.events(), { clientId: uid(), student: null, token, action: 'UNKNOWN_CARD', scannedAt }]);
      setBanner({ kind: 'red', title: 'Unregistered card', subtitle: token });
      setRecent((r) => [{ at: scannedAt, text: `Unknown card ${token}`, kind: 'red' }, ...r].slice(0, 8));
    } else {
      // Read the saved state, not React state, so two quick taps in a row can't both see the old value
      const current = store.venue();
      const { action, state } = nextDoorAction(current[student.id]);
      const next = { ...current, [student.id]: state };
      store.setVenue(next);
      store.setEvents([...store.events(), { clientId: uid(), student: student.id, token, action, scannedAt }]);
      setVenue(next);
      const kind = action === 'TEMPORARY_EXIT' ? 'yellow' : 'green';
      setBanner({ kind, title: student.name, subtitle: LABEL[action] });
      setRecent((r) => [{ at: scannedAt, text: `${student.name}, ${LABEL[action].toLowerCase()}`, kind }, ...r].slice(0, 8));
    }
    setPending(pendingCount(user.role));
    syncSoon();
  };

  const stats = doorStats(students, venue);
  const shown = students.filter((s) => `${s.name} ${s.studentId}`.toLowerCase().includes(query.toLowerCase())).slice(0, 50);

  // For starting a new event day. Taps not yet uploaded are kept, so no attendance is lost.
  const resetVenue = () => {
    if (!confirm('Clear Inside/Outside status on this phone? Unsent taps are kept.')) return;
    store.setVenue({});
    setVenue({});
  };

  const tiles = [
    { label: 'Registered', n: stats.total, tint: 'bg-lilac' },
    { label: 'Inside', n: stats.inside, tint: 'bg-sage', ring: 'var(--color-ok)' },
    { label: 'Temporarily outside', n: stats.outside, tint: 'bg-sand', ring: '#c99410' },
    { label: 'Not yet arrived', n: stats.notArrived, tint: 'bg-blush', ring: 'var(--color-plum-700)' },
  ];

  return (
    <>
      <PageHeader title="Door scanner" sub="Each tap flips a student between inside and outside. Works without internet." />
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
            <h2 className="mb-2 text-xl font-medium">Students</h2>
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
