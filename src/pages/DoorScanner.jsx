import { useEffect, useMemo, useState } from 'react';
import { useAuth } from '../context/AuthContext.jsx';
import Banner, { useBanner } from '../components/Banner.jsx';
import ScanControls from '../components/ScanControls.jsx';
import SyncBar from '../components/SyncBar.jsx';
import PageHeader from '../components/PageHeader.jsx';
import Ring from '../components/Ring.jsx';
import Avatar from '../components/Avatar.jsx';
import { store, uid, refreshStudents, refreshVenue, pendingCount } from '../lib/offline.js';
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

  const byToken = useMemo(() => new Map(students.filter((s) => s.nfcToken).map((s) => [s.nfcToken, s])), [students]);

  const onToken = (token) => {
    const student = byToken.get(token);
    const scannedAt = new Date().toISOString();

    if (!student) {
      store.setEvents([...store.events(), { clientId: uid(), student: null, token, action: 'UNKNOWN_CARD', scannedAt }]);
      setBanner({ kind: 'red', title: 'Unregistered card', subtitle: token });
      setRecent((r) => [{ at: scannedAt, text: `Unknown card ${token}`, kind: 'red' }, ...r].slice(0, 8));
    } else {
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
  };

  const stats = doorStats(students, venue);
  const shown = students.filter((s) => `${s.name} ${s.studentId}`.toLowerCase().includes(query.toLowerCase())).slice(0, 50);

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
              <div>
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

        <div className="grid gap-5 lg:grid-cols-2">
          <section aria-label="Recent scans">
            <h2 className="mb-2 text-xl font-medium">Recent scans</h2>
            <div className="overflow-hidden rounded-3xl border border-line bg-white">
              {recent.length === 0 && <p className="note p-4">Scans from this session appear here.</p>}
              {recent.map((r, i) => (
                <div key={i} className="row">
                  <span className="flex items-center gap-3 text-sm"><span className={`h-2.5 w-2.5 rounded-full ${DOT[r.kind]}`} />{r.text}</span>
                  <span className="text-xs text-muted tabular-nums">{new Date(r.at).toLocaleTimeString()}</span>
                </div>
              ))}
            </div>
          </section>

          <section aria-label="Students">
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
