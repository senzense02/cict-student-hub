import { useEffect, useState } from 'react';
import { api } from '../api.js';
import PageHeader from '../components/PageHeader.jsx';
import Avatar from '../components/Avatar.jsx';
import { useLive } from '../lib/live.js';

// Admin page to create accounts, reset passwords and delete users.
// Staff and students are listed separately because only students have a program and year.
const ROLE_LABEL = { student: 'Student', staff: 'Event staff', admin: 'Admin' };
const BLANK = { studentId: '', name: '', password: '', role: 'staff', program: 'BSCS', yearLevel: 1 };

export default function AdminUsers() {
  const [users, setUsers] = useState([]);
  const [form, setForm] = useState(BLANK);
  const [msg, setMsg] = useState('');
  const [view, setView] = useState('staff');

  const load = () => api('/users').then(setUsers).catch((e) => setMsg(e.message));
  useEffect(() => { load(); }, []);
  useLive(['users'], load); // accounts made or removed by another admin appear without a reload

  const create = async (e) => {
    e.preventDefault();
    setMsg('');
    try {
      // Staff have no program or year, so leave them out of the request
      const { program, yearLevel, ...rest } = form;
      await api('/users', { method: 'POST', body: form.role === 'student' ? form : rest });
      // Keep the role, program and year so several accounts in a row can be added quickly
      setForm({ ...form, studentId: '', name: '', password: '' });
      setMsg('Account created.');
      setView(form.role === 'student' ? 'students' : 'staff'); // switch to the list that holds the new account
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

  const isStudent = form.role === 'student';
  const students = users.filter((u) => u.role === 'student');
  const shown = view === 'students' ? students : users.filter((u) => u.role !== 'student');

  return (
    <>
      <PageHeader title="Users" sub="Create event staff or student accounts. Students can also register themselves." />
      <div className="space-y-5">
        <form onSubmit={create} className="tile bg-lilac grid gap-3 sm:grid-cols-2">
          <h2 className="text-2xl font-medium sm:col-span-2">New account</h2>
          <select className="field" aria-label="Role" value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value })}>
            <option value="staff">Event staff</option><option value="student">Student</option>
          </select>
          <input className="field" placeholder={isStudent ? 'Student ID, e.g. 25-1167' : 'Username'} aria-label={isStudent ? 'Student ID' : 'Username'} value={form.studentId} onChange={(e) => setForm({ ...form, studentId: e.target.value })} required />
          <input className="field" placeholder="Full name" aria-label="Full name" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required />
          <input className="field" type="password" placeholder="Password, at least 8 characters" aria-label="Password" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} required />
          {isStudent && (
            <>
              <select className="field" aria-label="Program" value={form.program} onChange={(e) => setForm({ ...form, program: e.target.value })}>
                <option value="BSCS">BSCS</option><option value="BSIS">BSIS</option>
              </select>
              <select className="field" aria-label="Year level" value={form.yearLevel} onChange={(e) => setForm({ ...form, yearLevel: Number(e.target.value) })}>
                {[1, 2, 3, 4].map((y) => <option key={y} value={y}>Year {y}</option>)}
              </select>
            </>
          )}
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
