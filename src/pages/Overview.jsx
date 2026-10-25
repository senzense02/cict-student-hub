import { useEffect, useState } from 'react';
import { api } from '../api.js';
import PageHeader from '../components/PageHeader.jsx';
import Ring from '../components/Ring.jsx';
import { useFresh, useLive } from '../lib/live.js';

const ACTION = { CHECK_IN: 'checked in', RE_ENTRY: 'came back in', TEMPORARY_EXIT: 'stepped out', UNKNOWN_CARD: 'tapped an unregistered card' };
const DOT = { CHECK_IN: 'bg-ok', RE_ENTRY: 'bg-ok', TEMPORARY_EXIT: 'bg-warn', UNKNOWN_CARD: 'bg-bad' };
const time = (iso) => new Date(iso).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
const plural = (n, one, many) => `${n} ${n === 1 ? one : many}`;

// The admin's home page: what is happening, and what needs a decision.
export default function Overview({ onNavigate }) {
  const [data, setData] = useState(null);
  const [error, setError] = useState('');

  const load = () =>
    api('/admin/overview')
      .then((d) => { setData(d); setError(''); })
      .catch((e) => setError(e.message));

  useEffect(() => {
    load();
    // The live feed does the real work. This slow refresh only keeps the "today" counts correct across
    // midnight, and it is skipped while the tab is hidden.
    const t = setInterval(() => document.visibilityState === 'visible' && load(), 60000);
    return () => clearInterval(t);
  }, []);
  useLive(['door', 'resources', 'users'], load);

  // Rows that just arrived flash once
  const freshTaps = useFresh(data ? data.recent.map((e) => e.clientId) : []);
  const freshPending = useFresh(data ? data.pendingResources.map((r) => r._id) : []);

  const verify = async (id) => {
    try { await api(`/resources/${id}/verify`, { method: 'POST' }); load(); } catch (e) { setError(e.message); }
  };
  const remove = async (id) => {
    if (!confirm('Delete this reviewer for everyone? This cannot be undone.')) return;
    try { await api(`/resources/${id}`, { method: 'DELETE' }); load(); } catch (e) { setError(e.message); }
  };

  if (!data)
    return (
      <>
        <PageHeader title="Overview" sub="What is happening across the Student Hub." />
        {error ? <p className="alert" role="alert">{error}</p> : <p className="note">Loading</p>}
      </>
    );

  const { users, students, resources, door, pendingResources, recent } = data;
  const noCard = students.total - students.withCard;

  // Things worth acting on. Empty means everything is in order.
  const attention = [
    noCard > 0 && { text: `${plural(noCard, 'student has', 'students have')} no ID card linked yet.`, label: 'Open ID cards', go: 'cards' },
    door.unknownToday > 0 && { text: `${plural(door.unknownToday, 'unregistered card was', 'unregistered cards were')} tapped today.`, label: 'Open door log', go: 'log' },
    users.staff === 0 && { text: 'There are no event staff accounts yet, so nobody can use the door scanner.', label: 'Create one', go: 'users' },
  ].filter(Boolean);

  // ring is [color, filled, total]. A tile without a ring has no share-of-total to show.
  const tiles = [
    { label: 'Students', n: students.total, sub: `${students.withCard} with an ID card`, tint: 'bg-lilac', ring: ['var(--color-plum-700)', students.withCard, students.total] },
    { label: 'Event staff', n: users.staff, sub: plural(users.admin, 'admin', 'admins'), tint: 'bg-iris' },
    { label: 'Reviewers', n: resources.total, sub: `${resources.pending} not verified`, tint: 'bg-blush', ring: ['var(--color-ok)', resources.verified, resources.total] },
    { label: 'Inside now', n: door.inside, sub: `${plural(door.checkedInToday, 'student', 'students')} checked in today`, tint: 'bg-sage' },
  ];

  return (
    <>
      <PageHeader title="Overview" sub="What is happening across the Student Hub, and what needs your attention.">
        <button onClick={load} className="btn btn-line btn-sm">Refresh</button>
      </PageHeader>

      {error && <p className="alert mb-4" role="alert">{error}</p>}

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {tiles.map((t, i) => (
          <div key={t.label} style={{ '--i': i }} className={`tile rise ${t.tint}`}>
            <div className="tile-top">
              <p key={t.n} className="tick font-display text-[2.4rem] font-medium leading-none tabular-nums">{t.n}</p>
              {t.ring && <Ring value={t.ring[1]} total={t.ring[2]} color={t.ring[0]} size={54} stroke={7} />}
            </div>
            <p className="mt-1.5 text-sm">{t.label}</p>
            <p className="text-xs text-ink/70">{t.sub}</p>
          </div>
        ))}
      </div>

      <div className="mt-6 grid gap-6 lg:grid-cols-2">
        <div className="space-y-6">
          <section aria-label="Needs attention">
            <h2 className="mb-2 text-xl font-medium">Needs attention</h2>
            <div className="overflow-hidden rounded-3xl border border-line bg-white">
              {attention.length === 0 && <p className="note p-4">All caught up. Nothing needs your attention.</p>}
              {attention.map((a) => (
                <div key={a.go} className="row flex-wrap">
                  <span className="text-sm">{a.text}</span>
                  <button onClick={() => onNavigate(a.go)} className="btn-text">{a.label}</button>
                </div>
              ))}
            </div>
          </section>

          <section aria-label="Waiting for verification">
            <h2 className="mb-2 text-xl font-medium">Waiting for verification</h2>
            <div className="overflow-hidden rounded-3xl border border-line bg-white">
              {pendingResources.length === 0 && <p className="note p-4">Every reviewer has been verified.</p>}
              {pendingResources.map((r) => (
                <div key={r._id} className={`row flex-wrap ${freshPending.has(r._id) ? 'flash' : ''}`}>
                  <span className="min-w-0 text-sm">
                    <span className="block truncate font-medium">{r.title}</span>
                    <span className="text-muted">{r.courseCode}, by {r.uploader}</span>
                  </span>
                  <span className="flex gap-4">
                    <button onClick={() => verify(r._id)} className="btn-text">Verify</button>
                    <button onClick={() => remove(r._id)} className="btn-text text-bad-ink">Delete</button>
                  </span>
                </div>
              ))}
            </div>
            {/* the list above can be shorter than the real count, so link to the full queue */}
            {resources.pending > pendingResources.length && (
              <button onClick={() => onNavigate('board')} className="btn-text mt-2">
                See all {resources.pending} in the Review board
              </button>
            )}
          </section>
        </div>

        <section aria-label="Recent door activity">
          <h2 className="mb-2 text-xl font-medium">Recent door activity</h2>
          <div className="overflow-hidden rounded-3xl border border-line bg-white">
            {recent.length === 0 && <p className="note p-4">No door taps yet.</p>}
            {recent.map((e) => (
              <div key={e.clientId} className={`row ${freshTaps.has(e.clientId) ? 'flash' : ''}`}>
                <span className="flex min-w-0 items-center gap-3 text-sm">
                  <span className={`h-2.5 w-2.5 shrink-0 rounded-full ${DOT[e.action]}`} />
                  <span className="truncate">{e.student ? e.student.name : 'Unknown card'} {ACTION[e.action]}</span>
                </span>
                <span className="shrink-0 text-xs text-muted tabular-nums">{time(e.scannedAt)}</span>
              </div>
            ))}
          </div>
          <button onClick={() => onNavigate('log')} className="btn-text mt-2">Open the full door log</button>
        </section>
      </div>
    </>
  );
}
