import { useEffect, useState } from 'react';
import { useAuth } from '../context/AuthContext.jsx';
import { onBuild } from '../lib/liveStore.js';
import Icon from './Icon.jsx';

// The id of the build this page is running. vite.config.js writes the same id into /version.json on every deploy.
const RUNNING = typeof __BUILD_ID__ !== 'undefined' ? __BUILD_ID__ : 'dev';

// Pages left open (a phone on the door, a laptop in the lab) never reload by themselves.
// Signed-in pages learn about a new deploy within seconds from the live feed; /version.json is checked
// every minute and whenever the tab comes back as a backup (it also covers the sign-in page).
// Either way it only offers a refresh.
// Nothing is reloaded automatically, so a scan in progress is never interrupted, and queued scans stay saved.
export default function UpdateNotice() {
  const [available, setAvailable] = useState(false);
  const [hidden, setHidden] = useState(false);
  const { user } = useAuth();

  // Instant path: the server tells us which build is live
  useEffect(() => {
    if (!user) return undefined;
    return onBuild((build) => { if (build !== RUNNING) setAvailable(true); });
  }, [user]);

  useEffect(() => {
    if (!import.meta.env.PROD) return undefined; // no version.json while developing
    const check = async () => {
      if (document.visibilityState !== 'visible') return;
      try {
        const res = await fetch(`/version.json?t=${Date.now()}`, { cache: 'no-store' });
        if (!res.ok) return;
        const { id } = await res.json();
        if (id && id !== RUNNING) setAvailable(true);
      } catch { /* offline: try again later */ }
    };
    check();
    const timer = setInterval(check, 60000);
    document.addEventListener('visibilitychange', check);
    window.addEventListener('online', check);
    return () => {
      clearInterval(timer);
      document.removeEventListener('visibilitychange', check);
      window.removeEventListener('online', check);
    };
  }, []);

  if (!available || hidden) return null;

  return (
    <div role="status" aria-live="polite" className="slide-in fixed inset-x-4 bottom-24 z-30 mx-auto flex max-w-md items-center gap-3 rounded-3xl bg-plum-900 p-4 text-white shadow-[0_18px_40px_-16px_rgba(60,42,77,0.8)] md:inset-x-auto md:right-6 md:bottom-6 md:mx-0">
      <span className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-white/15"><Icon name="sync" size={20} /></span>
      <div className="min-w-0 flex-1">
        <p className="text-sm font-medium">A new version is ready</p>
        <p className="text-xs text-white/75">Refresh to get the latest changes.</p>
      </div>
      <button onClick={() => setHidden(true)} className="btn btn-sm text-white hover:bg-white/10">Later</button>
      <button onClick={() => window.location.reload()} className="btn btn-sm bg-white text-plum-900 hover:bg-plum-100">Refresh</button>
    </div>
  );
}
