import { useEffect, useState } from 'react';
import { api } from '../api.js';
import PageHeader from '../components/PageHeader.jsx';
import Avatar from '../components/Avatar.jsx';

const ROLE_LABEL = { student: 'Student', staff: 'Event staff', admin: 'Admin' };

export default function AdminUsers() {
  const [users, setUsers] = useState([]);
  const [form, setForm] = useState({ studentId: '', name: '', password: '', role: 'staff' });
  const [msg, setMsg] = useState('');
  const [view, setView] = useState('staff');

  const load = () => api('/users').then(setUsers).catch((e) => setMsg(e.message));
  useEffect(() => { load(); }, []);

  const create = async (e) => {
    e.preventDefault();
    setMsg('');
    try {
      await api('/users', { method: 'POST', body: form });
      setForm({ studentId: '', name: '', password: '', role: form.role });
      setMsg('Account created.');
      load();
    } catch (err) {
      setMsg(err.message);
    }
  };

  const resetPw = async (u) => {
    const password = prompt(`New password for ${u.name} (at least 8 characters):`);
    if (!password) return;
    try { await api(`/users/${u.id}/password`, { method: 'PATCH', body: { password } }); setMsg('Password updated.'); } catch (err) { setMsg(err.message); }
  };

  const remove = async (u) => {
    if (!confirm(`Delete ${u.name}? This cannot be undone.`)) return;
    try { await api(`/users/${u.id}`, { method: 'DELETE' }); load(); } catch (err) { setMsg(err.message); }
  };

  const students = users.filter((u) => u.role === 'student');
  const shown = view === 'students' ? students : users.filter((u) => u.role !== 'student');

  return (
    <>
      <PageHeader title="Users" sub="Create event staff and admin accounts. Students create their own." />
      <div className="space-y-5">
        <form onSubmit={create} className="tile bg-lilac grid gap-3 sm:grid-cols-2">
          <h2 className="text-2xl font-medium sm:col-span-2">New account</h2>
          <input className="field" placeholder="Username" aria-label="Username" value={form.studentId} onChange={(e) => setForm({ ...form, studentId: e.target.value })} required />
          <input className="field" placeholder="Full name" aria-label="Full name" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required />
          <input className="field" type="password" placeholder="Password, at least 8 characters" aria-label="Password" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} required />
          <select className="field" aria-label="Role" value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value })}>
            <option value="staff">Event staff</option><option value="admin">Admin</option>
          </select>
          <div className="flex flex-wrap items-center gap-3 sm:col-span-2">
            <button className="btn btn-primary">Create account</button>
            {msg && <p className="note" role="status">{msg}</p>}
          </div>
        </form>

        <div className="flex gap-1.5" role="group" aria-label="Account type">
          <button className="chip" aria-pressed={view === 'staff'} onClick={() => setView('staff')}>Staff and admins</button>
          <button className="chip" aria-pressed={view === 'students'} onClick={() => setView('students')}>Students ({students.length})</button>
        </div>

        <div className="overflow-hidden rounded-3xl border border-line bg-white">
          {shown.map((u) => (
            <div key={u.id} className="row flex-wrap">
              <span className="flex min-w-0 items-center gap-3">
                <Avatar name={u.name} size={34} />
                <span className="min-w-0 text-sm">
                  <span className="block truncate font-medium">{u.name}</span>
                  <span className="text-muted">{u.studentId}, {ROLE_LABEL[u.role]}{u.role === 'student' ? `, ${u.program} year ${u.yearLevel}${u.hasCard ? ', card linked' : ''}` : ''}</span>
                </span>
              </span>
              <span className="flex gap-4">
                <button onClick={() => resetPw(u)} className="btn-text">Reset password</button>
                <button onClick={() => remove(u)} className="btn-text text-bad-ink">Delete</button>
              </span>
            </div>
          ))}
          {shown.length === 0 && <p className="note p-4">Nothing here yet.</p>}
        </div>
      </div>
    </>
  );
}
