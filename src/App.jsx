// App shell: sign-in gate, the tabs each role can see, sidebar (desktop) and bottom bar (phone).
import { Suspense, lazy, useEffect, useState } from 'react';
import { useAuth } from './context/AuthContext.jsx';
import { pendingCount, syncAll } from './lib/offline.js';
import { setAuthLostHandler } from './lib/liveStore.js';
import { useLive } from './lib/live.js';
import { api } from './api.js';
import Icon from './components/Icon.jsx';
import Avatar from './components/Avatar.jsx';
import CardStatus from './components/CardStatus.jsx';
import CardLinkModal from './components/CardLinkModal.jsx';
import PageBoundary from './components/PageBoundary.jsx';
import PageSkeleton from './components/PageSkeleton.jsx';
import Login from './pages/Login.jsx'; // stays in the main file: it is the first thing a new visitor sees

// Which tabs each role can see:
//  student: the review board
//  staff:   door scanner, door log (+ review board)
//  admin:   overview, review board (verify/delete), door log, ID cards, users
// The server enforces the same rules (requireRole). Hiding a tab here only avoids showing buttons that
// would be refused.
// `short` is the label under the icon in the phone's bottom bar (default: the first word). It is needed
// because "Door scanner" and "Door log" would both read "Door".
// Each tab's page is its own file, downloaded the first time it is needed. `load` starts that download.
const TABS = [
  { id: 'overview', label: 'Overview', icon: 'overview', roles: ['admin'], load: () => import('./pages/Overview.jsx') },
  { id: 'board', label: 'Review board', icon: 'board', roles: ['student', 'staff', 'admin'], load: () => import('./pages/ReviewBoard.jsx') },
  { id: 'door', label: 'Door scanner', short: 'Scanner', icon: 'door', roles: ['staff'], load: () => import('./pages/DoorScanner.jsx') },
  { id: 'log', label: 'Door log', short: 'Door log', icon: 'log', roles: ['staff', 'admin'], load: () => import('./pages/DoorLog.jsx') },
  { id: 'cards', label: 'ID cards', icon: 'card', roles: ['admin'], load: () => import('./pages/Cards.jsx') },
  { id: 'users', label: 'Users', icon: 'users', roles: ['admin'], load: () => import('./pages/AdminUsers.jsx') },
].map((t) => ({ ...t, view: lazy(t.load) }));
const HOME = { admin: 'overview', staff: 'door' }; // where each role lands the first time
const ROLE_LABEL = { student: 'Student', staff: 'Event staff', admin: 'Admin' };

// Start downloading the tab this person will most likely open while React is still starting up, not after.
// Someone who is not signed in (or has storage turned off) just skips this.
try {
  const saved = JSON.parse(localStorage.getItem('cict_user'));
  if (saved) {
    const r = ROLE_LABEL[saved.role] ? saved.role : 'student';
    const mine = TABS.filter((t) => t.roles.includes(r));
    (mine.find((t) => t.id === localStorage.getItem('cict_tab')) || mine.find((t) => t.id === HOME[r]) || mine[0])?.load().catch(() => {});
  }
} catch { /* nothing to warm up */ }

function Brand() {
  return (
    <div className="flex items-center gap-3">
      <span className="grid h-9 w-9 place-items-center rounded-[12px] bg-plum-700 font-display text-lg font-semibold text-white">C</span>
      <span className="font-display text-[1.35rem] font-semibold tracking-tight">Student Hub</span>
    </div>
  );
}

export default function App() {
  const { user, signOut, updateUser } = useAuth();
  const role = user && (ROLE_LABEL[user.role] ? user.role : 'student'); // unknown/old roles get student access
  const showCard = role === 'student' || role === 'staff'; // admins manage cards from the ID cards tab
  const tabs = user ? TABS.filter((t) => t.roles.includes(role)) : [];
  const [tab, setTab] = useState(() => localStorage.getItem('cict_tab')); // last tab used, remembered between visits
  // Right after signing up, offer to link the ID card once (Login sets this flag)
  const [offerCard, setOfferCard] = useState(false);
  useEffect(() => {
    if (!user) return;
    try { if (sessionStorage.getItem('cict_offer_card') === '1') setOfferCard(true); } catch { /* ignore */ }
  }, [user?.id]);
  const closeOffer = () => {
    try { sessionStorage.removeItem('cict_offer_card'); } catch { /* ignore */ }
    setOfferCard(false);
  };

  // Once the page is idle, fetch the other tabs this role can open. They then open instantly, and the service
  // worker keeps a copy, so staff can switch tabs at the door without a connection.
  useEffect(() => {
    if (!user) return undefined;
    if (role === 'student' && navigator.connection?.saveData) return undefined; // respect "data saver" for students
    const idle = window.requestIdleCallback || ((fn) => setTimeout(fn, 1500));
    const cancel = window.cancelIdleCallback || clearTimeout;
    const handle = idle(() => tabs.forEach((t) => t.load().catch(() => {})));
    return () => cancel(handle);
  }, [role]);

  // Upload anything queued while offline: when the connection comes back, and every 20 seconds
  // while something is still waiting (covers a failed attempt)
  useEffect(() => {
    if (!user || user.role === 'student') return undefined;
    const run = () => syncAll(user.role).catch(() => {});
    window.addEventListener('online', run);
    const retry = setInterval(() => { if (navigator.onLine && pendingCount(user.role) > 0) run(); }, 20000);
    return () => {
      window.removeEventListener('online', run);
      clearInterval(retry);
    };
  }, [user]);

  // If the server says this login is no longer valid (account deleted, token expired), sign out at once
  useEffect(() => {
    setAuthLostHandler(signOut);
    return () => setAuthLostHandler(null);
  }, [signOut]);

  // Keeps the card status current when an admin links or changes the card, and fills in anything missing
  // from a login saved by an older version
  const refreshMe = () => {
    if (!user || user.role === 'admin') return;
    api('/auth/me').then(({ user: me }) => updateUser({ ...user, ...me })).catch(() => {});
  };
  useEffect(() => { refreshMe(); }, [user?.id]);
  useLive(['users'], refreshMe);

  if (!user) return <Login />;

  // A saved tab this role may not open falls back to the role's home tab
  const current = tabs.find((t) => t.id === tab) || tabs.find((t) => t.id === HOME[role]) || tabs[0];
  const View = current.view;
  const choose = (id) => {
    setTab(id);
    localStorage.setItem('cict_tab', id);
  };

  return (
    <div className="min-h-screen lg:p-6">
      <div className="mx-auto flex min-h-screen max-w-[1320px] overflow-hidden bg-paper lg:min-h-[calc(100vh-3rem)] lg:rounded-[32px] lg:shadow-[0_28px_70px_-30px_rgba(60,42,77,0.55)]">
        <aside className="hidden w-64 shrink-0 flex-col bg-rail p-5 md:flex">
          <div className="px-2 pt-1"><Brand /></div>
          <nav className="mt-10 flex flex-col gap-1.5" aria-label="Main">
            {tabs.map((t) => {
              const on = current.id === t.id;
              return (
                <button key={t.id} onClick={() => choose(t.id)} aria-current={on ? 'page' : undefined}
                  className={`flex h-11 items-center gap-3 rounded-full px-4 text-[15px] transition-[background-color,color,box-shadow] duration-200 ${on ? 'bg-paper font-medium text-plum-900 shadow-[0_6px_16px_-10px_rgba(60,42,77,0.6)]' : 'text-plum-700 hover:bg-paper/60'}`}>
                  <Icon name={t.icon} size={20} />{t.label}
                </button>
              );
            })}
          </nav>
          <div className="mt-auto rounded-3xl bg-paper p-3">
            {showCard && <CardStatus className="mb-3" />}
            <div className="flex items-center gap-3">
              <Avatar name={user.name} size={38} />
              <div className="min-w-0">
                <p className="truncate text-sm font-medium">{user.name}</p>
                <p className="text-xs text-muted">{ROLE_LABEL[role]}</p>
              </div>
            </div>
            <button onClick={signOut} className="btn btn-soft btn-sm mt-3 w-full"><Icon name="logout" size={15} />Log out</button>
          </div>
        </aside>

        <div className="flex min-w-0 flex-1 flex-col">
          <div className="flex items-center justify-between bg-rail px-5 py-3 md:hidden">
            <Brand />
            <div className="flex items-center gap-2">
              {showCard && <CardStatus compact />}
              <button onClick={signOut} className="btn btn-soft btn-sm"><Icon name="logout" size={15} />Log out</button>
            </div>
          </div>
          {/* On phones the bottom padding keeps content clear of the fixed bottom bar */}
          <main className="flex-1 p-5 pb-28 md:p-9 md:pb-9">
            <div key={current.id} className="page-in">
              <PageBoundary key={current.id}>
                <Suspense fallback={<PageSkeleton />}><View onNavigate={choose} /></Suspense>
              </PageBoundary>
            </div>
          </main>
        </div>
      </div>

      {offerCard && role === 'student' && <CardLinkModal onClose={closeOffer} />}

      {/* Phone bottom bar, only worth showing with more than one tab. The bottom padding keeps it clear of the phone's home bar. */}
      {tabs.length > 1 && (
        <nav className="fixed inset-x-0 bottom-0 z-20 flex justify-around border-t border-line bg-rail px-2 pt-1.5 pb-[max(0.5rem,env(safe-area-inset-bottom))] md:hidden" aria-label="Main">
          {tabs.map((t) => {
            const on = current.id === t.id;
            return (
              <button key={t.id} onClick={() => choose(t.id)} aria-current={on ? 'page' : undefined} className={`flex min-w-0 flex-1 flex-col items-center gap-0.5 rounded-2xl py-1.5 text-[11px] ${on ? 'font-medium text-plum-900' : 'text-plum-700'}`}>
                <span className={`grid h-7 w-12 place-items-center rounded-full ${on ? 'nav-pill bg-plum-200' : ''}`}><Icon name={t.icon} size={20} /></span>
                <span className="truncate">{t.short || t.label.split(' ')[0]}</span>
              </button>
            );
          })}
        </nav>
      )}
    </div>
  );
}
