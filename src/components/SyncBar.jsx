import { useState } from 'react';
import { syncAll } from '../lib/offline.js';
import { useAuth } from '../context/AuthContext.jsx';
import Icon from './Icon.jsx';

// Shows how many scans are still waiting on this phone and uploads them on demand.
export default function SyncBar({ pending, onSynced }) {
  const { user } = useAuth();
  const [msg, setMsg] = useState('');
  const [busy, setBusy] = useState(false);

  const run = async () => {
    setBusy(true);
    setMsg('');
    try {
      const r = await syncAll(user.role);
      // The server can refuse some records for this account. Say so instead of hiding it
      const rej = r.rejected ? r.rejected.events : 0;
      setMsg(r.sent ? `Uploaded ${r.sent} record${r.sent === 1 ? '' : 's'}.` : 'Nothing to upload.');
      if (rej) setMsg((m) => `${m} ${rej} not accepted for this account.`);
    } catch (e) {
      setMsg(`Could not sync: ${e.message}. Your data is safe on this phone.`);
    } finally {
      setBusy(false);
      onSynced?.(); // runs even after a failure, so the waiting count stays correct
    }
  };

  return (
    <div className="flex flex-wrap items-center gap-3">
      <span className={`inline-flex h-8 items-center rounded-full px-3.5 text-[13px] font-medium ${pending ? 'bg-warn/40 text-warn-ink' : 'bg-sage text-ok'}`}>
        {pending ? `${pending} waiting to upload` : 'All synced'}
      </span>
      <button onClick={run} disabled={busy} className="btn btn-primary btn-sm"><Icon name="sync" size={15} />{busy ? 'Syncing' : 'Sync now'}</button>
      {msg && <span className="note">{msg}</span>}
    </div>
  );
}
