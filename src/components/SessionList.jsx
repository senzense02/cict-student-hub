// The Door scanner's first screen: sessions that are running or still being set up, and a way to start a new one.
// Finished sessions are not here; they live in the Door log.
import { useEffect, useState } from 'react';
import { api } from '../api.js';
import { useAuth } from '../context/AuthContext.jsx';
import { useFresh, useLive } from '../lib/live.js';
import PageHeader from './PageHeader.jsx';
import Icon from './Icon.jsx';

const plural = (n, one, many) => `${n} ${n === 1 ? one : many}`;
const when = (iso) => new Date(iso).toLocaleString([], { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });

// One line under a session's name: who started it and how many people have shown up
function describe(s) {
  const by = s.createdByName || 'a deleted account';
  if (s.status === 'active') {
    const seen = s.counts.roster ? `${s.counts.attended} of ${s.counts.roster} on the list have arrived` : `${plural(s.counts.students, 'student', 'students')} scanned so far`;
    return `Started ${when(s.startedAt)} by ${by}. ${seen}.`;
  }
  return `${s.counts.roster ? `${plural(s.counts.roster, 'student', 'students')} on the list` : 'No list yet'}. Created by ${by}.`;
}

function NewSessionModal({ onClose, onCreated }) {
  const [name, setName] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const submit = async (e) => {
    e.preventDefault();
    setBusy(true);
    setError('');
    try {
      onCreated(await api('/attendance/sessions', { method: 'POST', body: { name } }));
    } catch (err) {
      setError(err.message);
      setBusy(false);
    }
  };

  return (
    <div className="fade-in fixed inset-0 z-30 grid place-items-center bg-ink/45 p-4" role="dialog" aria-modal="true" aria-labelledby="new-session-title">
      <form onSubmit={submit} className="rise w-full max-w-md space-y-3 rounded-[28px] bg-paper p-6">
        <h2 id="new-session-title" className="text-2xl font-medium tracking-tight">New session</h2>
        <p className="note">Name the event. Next you can add the registration list from your Google Form.</p>
        {error && <p className="alert" role="alert">{error}</p>}
        <input className="field" placeholder="Event name, like CICT Week day 1" value={name} onChange={(e) => setName(e.target.value)} maxLength={100} required autoFocus aria-label="Event name" />
        <div className="flex justify-end gap-2 pt-1">
          <button type="button" onClick={onClose} className="btn btn-line">Cancel</button>
          <button disabled={busy || !name.trim()} className="btn btn-primary">{busy ? 'Creating' : 'Create session'}</button>
        </div>
      </form>
    </div>
  );
}

// notice: { message, link } shown after a session ended, with a shortcut to the Door log
export default function SessionList({ onOpen, onNavigate, notice, onDismiss }) {
  const { user } = useAuth();
  const [sessions, setSessions] = useState(null);
  const [error, setError] = useState('');
  const [creating, setCreating] = useState(false);

  const load = () =>
    api('/attendance/sessions')
      // finished sessions live in the Door log, not here
      .then((list) => { setSessions(list.filter((s) => s.status !== 'ended')); setError(''); })
      .catch((e) => setError(e.message));
  useEffect(() => { load(); }, []);
  useLive(['sessions', 'door'], load); // reload when a session changes or a card is tapped
  const fresh = useFresh((sessions || []).map((s) => s.id));

  // Only an admin or the person who created the session can set it up or delete it
  const mayManage = (s) => user.role === 'admin' || s.createdBy === user.id;
  const remove = async (s) => {
    if (!confirm(`Delete "${s.name}"? Its registration list is deleted too.`)) return;
    try { await api(`/attendance/sessions/${s.id}`, { method: 'DELETE' }); load(); } catch (e) { setError(e.message); }
  };

  const running = (sessions || []).filter((s) => s.status === 'active');
  const settingUp = (sessions || []).filter((s) => s.status === 'draft');

  // A plain function, not a component: a component declared here would be rebuilt on every refresh
  const row = (s) => (
    <div key={s.id} className={`row flex-wrap ${fresh.has(s.id) ? 'flash' : ''}`}>
      <span className="min-w-0">
        <span className="block truncate font-medium">{s.name}</span>
        <span className="text-sm text-muted">{describe(s)}</span>
      </span>
      <span className="flex items-center gap-3">
        {s.status === 'draft' && mayManage(s) && <button onClick={() => remove(s)} className="btn-text text-bad-ink">Delete</button>}
        {s.status === 'active' && <button onClick={() => onOpen(s.id)} className="btn btn-primary btn-sm">Scan</button>}
        {s.status === 'draft' && (mayManage(s)
          ? <button onClick={() => onOpen(s.id)} className="btn btn-soft btn-sm">Set up</button>
          : <span className="note">Being set up</span>)}
      </span>
    </div>
  );

  return (
    <>
      <PageHeader title="Door scanner" sub="Start a session for each event. Every tap is saved to its session, and the session moves to the Door log when it ends.">
        <button onClick={() => setCreating(true)} className="btn btn-primary"><Icon name="plus" size={18} />New session</button>
      </PageHeader>

      <div className="space-y-5">
        {notice && (
          <div className="fade-in flex flex-wrap items-center justify-between gap-3 rounded-2xl bg-sage px-4 py-3 text-sm text-ok" role="status">
            <span>{notice.message}</span>
            <span className="flex gap-4">
              {notice.link && <button onClick={() => onNavigate('log')} className="btn-text">Open Door log</button>}
              <button onClick={onDismiss} className="btn-text">Dismiss</button>
            </span>
          </div>
        )}
        {error && <p className="alert" role="alert">{error}</p>}
        {!sessions && !error && <p className="note">Loading</p>}

        {sessions && (
          <>
            <section aria-label="Running sessions">
              <h2 className="mb-2 text-xl font-medium">Running</h2>
              <div className="overflow-hidden rounded-3xl border border-line bg-white">
                {running.length === 0 && <p className="note p-4">No session is running. Create one, or open one that is being set up, then start it.</p>}
                {running.map(row)}
              </div>
            </section>

            {settingUp.length > 0 && (
              <section aria-label="Sessions being set up">
                <h2 className="mb-2 text-xl font-medium">Being set up</h2>
                <div className="overflow-hidden rounded-3xl border border-line bg-white">
                  {settingUp.map(row)}
                </div>
              </section>
            )}
          </>
        )}
      </div>

      {creating && <NewSessionModal onClose={() => setCreating(false)} onCreated={(s) => { setCreating(false); onOpen(s.id); }} />}
    </>
  );
}
