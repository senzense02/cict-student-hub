// App shell: sign-in gate, the tabs each role can see, sidebar (desktop) and bottom bar (phone).
import { useEffect, useState } from 'react';
import { useAuth } from './context/AuthContext.jsx';
import { pendingCount, syncAll } from './lib/offline.js';
import { setAuthLostHandler } from './lib/liveStore.js';
import { useLive } from './lib/live.js';
import { api } from './api.js';
import Icon from './components/Icon.jsx';
import Avatar from './components/Avatar.jsx';
import CardStatus from './components/CardStatus.jsx';
import CardLinkModal from './components/CardLinkModal.jsx';
import Login from './pages/Login.jsx';
import ReviewBoard from './pages/ReviewBoard.jsx';
import Overview from './pages/Overview.jsx';
import DoorLog from './pages/DoorLog.jsx';
import DoorScanner from './pages/DoorScanner.jsx';
import Cards from './pages/Cards.jsx';
import AdminUsers from './pages/AdminUsers.jsx';

// Which tabs each role can see
//  student: the review board
//  staff:   door scanner (+ review board)
//  admin:   overview, review board (verify/delete), door log, ID cards, users
// The server enforces the same rules (requireRole); hiding a tab here is only about not showing buttons
// that would be refused.
const TABS = [
  { id: 'overview', label: 'Overview', icon: 'overview', roles: ['admin'], view: Overview },
  { id: 'board', label: 'Review board', icon: 'board', roles: ['student', 'staff', 'admin'], view: ReviewBoard },
  { id: 'door', label: 'Door scanner', icon: 'door', roles: ['staff'], view: DoorScanner },
  { id: 'log', label: 'Door log', icon: 'log', roles: ['admin'], view: DoorLog },
  { id: 'cards', label: 'ID cards', icon: 'card', roles: ['admin'], view: Cards },
  { id: 'users', label: 'Users', icon: 'users', roles: ['admin'], view: AdminUsers },
];
const HOME = { admin: 'overview', staff: 'door' }; // where each role lands the first time
const ROLE_LABEL = { student: 'Student', staff: 'Event staff', admin: 'Admin' };

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
  const [tab, setTab] = useState(() => localStorage.getItem('cict_tab'));
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

  // Keep the card status right when an admin links or changes the card, and when the saved login is from an older version
  const refreshMe = () => {
    if (!user || user.role === 'admin') return;
    api('/auth/me').then(({ user: me }) => updateUser({ ...user, ...me })).catch(() => {});
  };
  useEffect(() => { refreshMe(); }, [user?.id]);
  useLive(['users'], refreshMe);

  if (!user) return <Login />;

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
                  className={`flex h-11 items-center gap-3 rounded-full px-4 text-[15px] transition-colors ${on ? 'bg-paper font-medium text-plum-900 shadow-[0_6px_16px_-10px_rgba(60,42,77,0.6)]' : 'text-plum-700 hover:bg-paper/60'}`}>
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
          <main className="flex-1 p-5 pb-28 md:p-9 md:pb-9">
            <div key={current.id} className="page-in"><View onNavigate={choose} /></div>
          </main>
        </div>
      </div>

      {offerCard && role === 'student' && <CardLinkModal onClose={closeOffer} />}

      {tabs.length > 1 && (
        <nav className="fixed inset-x-0 bottom-0 z-20 flex justify-around border-t border-line bg-rail px-2 pt-1.5 pb-[max(0.5rem,env(safe-area-inset-bottom))] md:hidden" aria-label="Main">
          {tabs.map((t) => {
            const on = current.id === t.id;
            return (
              <button key={t.id} onClick={() => choose(t.id)} aria-current={on ? 'page' : undefined} className={`flex min-w-0 flex-1 flex-col items-center gap-0.5 rounded-2xl py-1.5 text-[11px] ${on ? 'font-medium text-plum-900' : 'text-plum-700'}`}>
                <span className={`grid h-7 w-12 place-items-center rounded-full ${on ? 'bg-plum-200' : ''}`}><Icon name={t.icon} size={20} /></span>
                <span className="truncate">{t.label.split(' ')[0]}</span>
              </button>
            );
          })}
        </nav>
      )}
    </div>
  );
}
