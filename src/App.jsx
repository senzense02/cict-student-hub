import { useEffect, useState } from 'react';
import { useAuth } from './context/AuthContext.jsx';
import { syncAll } from './lib/offline.js';
import Icon from './components/Icon.jsx';
import Avatar from './components/Avatar.jsx';
import Login from './pages/Login.jsx';
import ReviewBoard from './pages/ReviewBoard.jsx';
import ClassAttendance from './pages/ClassAttendance.jsx';
import DoorScanner from './pages/DoorScanner.jsx';
import Cards from './pages/Cards.jsx';
import AdminUsers from './pages/AdminUsers.jsx';

// Which tabs each role can see
const TABS = [
  { id: 'board', label: 'Review board', icon: 'board', roles: ['student', 'teacher', 'staff', 'admin'], view: ReviewBoard },
  { id: 'class', label: 'Class attendance', icon: 'class', roles: ['teacher', 'admin'], view: ClassAttendance },
  { id: 'door', label: 'Door scanner', icon: 'door', roles: ['staff', 'admin'], view: DoorScanner },
  { id: 'cards', label: 'ID cards', icon: 'card', roles: ['teacher', 'staff', 'admin'], view: Cards },
  { id: 'users', label: 'Users', icon: 'users', roles: ['admin'], view: AdminUsers },
];
const ROLE_LABEL = { student: 'Student', teacher: 'Teacher', staff: 'Event staff', admin: 'Admin' };

function Brand() {
  return (
    <div className="flex items-center gap-3">
      <span className="grid h-9 w-9 place-items-center rounded-[12px] bg-plum-700 font-display text-lg font-semibold text-white">C</span>
      <span className="font-display text-[1.35rem] font-semibold tracking-tight">Student Hub</span>
    </div>
  );
}

export default function App() {
  const { user, signOut } = useAuth();
  const tabs = user ? TABS.filter((t) => t.roles.includes(user.role)) : [];
  const [tab, setTab] = useState(() => localStorage.getItem('cict_tab') || 'board');

  // When the connection comes back, upload anything queued while offline
  useEffect(() => {
    if (!user || user.role === 'student') return;
    const run = () => syncAll(user.role).catch(() => {});
    window.addEventListener('online', run);
    return () => window.removeEventListener('online', run);
  }, [user]);

  if (!user) return <Login />;

  const current = tabs.find((t) => t.id === tab) || tabs[0];
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
            <div className="flex items-center gap-3">
              <Avatar name={user.name} size={38} />
              <div className="min-w-0">
                <p className="truncate text-sm font-medium">{user.name}</p>
                <p className="text-xs text-muted">{ROLE_LABEL[user.role]}</p>
              </div>
            </div>
            <button onClick={signOut} className="btn btn-soft btn-sm mt-3 w-full"><Icon name="logout" size={15} />Log out</button>
          </div>
        </aside>

        <div className="flex min-w-0 flex-1 flex-col">
          <div className="flex items-center justify-between bg-rail px-5 py-3 md:hidden">
            <Brand />
            <button onClick={signOut} className="btn btn-soft btn-sm"><Icon name="logout" size={15} />Log out</button>
          </div>
          <main className="flex-1 p-5 pb-28 md:p-9 md:pb-9">
            <View key={current.id} />
          </main>
        </div>
      </div>

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
