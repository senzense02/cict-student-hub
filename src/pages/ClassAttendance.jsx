import { useEffect, useMemo, useState } from 'react';
import { api } from '../api.js';
import { useAuth } from '../context/AuthContext.jsx';
import Banner, { useBanner } from '../components/Banner.jsx';
import ScanControls from '../components/ScanControls.jsx';
import SyncBar from '../components/SyncBar.jsx';
import PageHeader from '../components/PageHeader.jsx';
import Ring from '../components/Ring.jsx';
import Avatar from '../components/Avatar.jsx';
import { store, uid, refreshStudents, pendingCount } from '../lib/offline.js';
import { inRoster, tapStatus, toCsv } from '../lib/logic.js';

const STATUSES = ['present', 'late', 'excused', 'absent'];
const TEXT = { present: 'text-ok', late: 'text-warn-ink', excused: 'text-plum-700', absent: 'text-bad-ink', unmarked: 'text-muted' };
const cap = (s) => s[0].toUpperCase() + s.slice(1);

function Segmented({ value, onPick, name }) {
  return (
    <div className="inline-flex rounded-full bg-rail p-0.5" role="group" aria-label={`Mark ${name}`}>
      {STATUSES.map((st) => (
        <button key={st} onClick={() => onPick(st)} aria-pressed={value === st}
          className={`h-7 rounded-full px-3 text-xs transition-colors ${value === st ? 'bg-plum-900 text-white' : 'text-plum-700 hover:bg-white'}`}>
          {cap(st)}
        </button>
      ))}
    </div>
  );
}

export default function ClassAttendance() {
  const { user } = useAuth();
  const [students, setStudents] = useState(store.students());
  const [sessions, setSessions] = useState(store.sessions());
  const [marks, setMarks] = useState(store.marks());
  const [activeId, setActiveId] = useState(store.activeSession());
  const [banner, setBanner] = useBanner();
  const [pending, setPending] = useState(pendingCount(user.role));
  const [report, setReport] = useState(null);
  const [serverSessions, setServerSessions] = useState([]);
  const [form, setForm] = useState({ courseCode: '', program: 'ALL', year: 'ALL', section: '', late: '' });
  const [err, setErr] = useState('');

  useEffect(() => {
    refreshStudents().then(setStudents).catch(() => {});
    api('/attendance/sessions').then(setServerSessions).catch(() => {});
  }, []);

  const mine = sessions.filter((s) => user.role === 'admin' || s.teacher === user.id);
  const active = mine.find((s) => s.clientId === activeId && !s.endedAt) || null;
  const roster = useMemo(() => (active ? students.filter((s) => inRoster(active, s)) : []), [active, students]);
  const markFor = (sessionId, studentId) => marks[`${sessionId}:${studentId}`];
  const refreshPending = () => setPending(pendingCount(user.role));

  const saveSessions = (list) => {
    store.setSessions(list);
    setSessions(list);
    refreshPending();
  };
  const setMark = (session, student, status, source) => {
    const key = `${session.clientId}:${student.id}`;
    const m = { clientId: key, sessionId: session.clientId, student: student.id, status, source, markedAt: new Date().toISOString(), dirty: true };
    const next = { ...store.marks(), [key]: m };
    store.setMarks(next);
    setMarks(next);
    refreshPending();
  };

  const start = (e) => {
    e.preventDefault();
    if (!form.courseCode.trim()) return setErr('Enter a course code to start.');
    setErr('');
    const code = form.courseCode.trim().toUpperCase();
    const s = {
      clientId: uid(), teacher: user.id, courseCode: code, name: `${code}${form.section ? ' ' + form.section.trim() : ''}`,
      program: form.program, yearLevel: form.year === 'ALL' ? null : Number(form.year),
      section: form.section.trim(), lateAfterMin: form.late ? Number(form.late) : null,
      startedAt: new Date().toISOString(), endedAt: null, dirty: true,
    };
    saveSessions([s, ...store.sessions()]);
    store.setActiveSession(s.clientId);
    setActiveId(s.clientId);
  };

  const end = () => {
    if (!confirm('End this session? Students without a mark will count as absent.')) return;
    saveSessions(store.sessions().map((s) => (s.clientId === active.clientId ? { ...s, endedAt: new Date().toISOString(), dirty: true } : s)));
    store.setActiveSession(null);
    setActiveId(null);
  };

  const onToken = (token) => {
    if (!active) return;
    const student = students.find((s) => s.nfcToken === token);
    if (!student) return setBanner({ kind: 'red', title: 'Unregistered card', subtitle: token });
    if (!inRoster(active, student)) return setBanner({ kind: 'red', title: 'Not in this class', subtitle: student.name });
    const existing = markFor(active.clientId, student.id);
    if (existing && existing.status !== 'absent') return setBanner({ kind: 'blue', title: 'Already marked', subtitle: `${student.name} is ${existing.status}` });
    const status = tapStatus(active);
    setMark(active, student, status, 'nfc');
    setBanner({ kind: status === 'late' ? 'yellow' : 'green', title: student.name, subtitle: status === 'late' ? 'Marked late' : 'Marked present' });
  };

  const openReport = async (session) => {
    let serverMarks = [];
    try {
      const r = await api(`/attendance/sessions/${session.clientId}`);
      serverMarks = r.marks.map((m) => ({ student: String(m.student), status: m.status }));
    } catch { /* offline or not uploaded yet: local marks only */ }
    const byStudent = new Map(serverMarks.map((m) => [m.student, m.status]));
    for (const m of Object.values(store.marks())) if (m.sessionId === session.clientId) byStudent.set(m.student, m.status);

    const rows = students.filter((s) => inRoster(session, s)).map((s) => ({
      studentId: s.studentId, name: s.name, section: s.section || '',
      status: byStudent.get(s.id) || (session.endedAt ? 'absent' : 'unmarked'),
    }));
    setReport({ session, rows });
  };

  const download = () => {
    const csv = toCsv(report.rows, [['studentId', 'Student ID'], ['name', 'Name'], ['section', 'Section'], ['status', 'Status']]);
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv' }));
    a.download = `attendance-${report.session.name.replace(/\s+/g, '_')}-${report.session.startedAt.slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(a.href);
  };

  const allSessions = [...mine, ...serverSessions.filter((s) => !mine.some((m) => m.clientId === s.clientId))].sort((a, b) => new Date(b.startedAt) - new Date(a.startedAt));

  if (report) {
    const count = (k) => report.rows.filter((r) => r.status === k).length;
    const attended = count('present') + count('late');
    const tiles = [['present', 'bg-sage'], ['late', 'bg-sand'], ['excused', 'bg-lilac'], ['absent', 'bg-blush']];
    return (
      <>
        <button onClick={() => setReport(null)} className="btn-text mb-4">Back to sessions</button>
        <PageHeader title={report.session.name} sub={`Started ${new Date(report.session.startedAt).toLocaleString()}`}>
          <button onClick={download} className="btn btn-primary">Download CSV</button>
        </PageHeader>
        <div className="mb-5 grid grid-cols-2 gap-3 lg:grid-cols-5">
          <div className="tile bg-plum-100 flex items-center justify-between gap-2 col-span-2 lg:col-span-1">
            <div>
              <p className="font-display text-[2.4rem] font-medium leading-none tabular-nums">{attended}<span className="text-xl text-muted">/{report.rows.length}</span></p>
              <p className="mt-1.5 text-sm">Attended</p>
            </div>
            <Ring value={attended} total={report.rows.length} size={54} stroke={7} />
          </div>
          {tiles.map(([k, tint]) => (
            <div key={k} className={`tile ${tint}`}>
              <p className="font-display text-[2.4rem] font-medium leading-none tabular-nums">{count(k)}</p>
              <p className="mt-1.5 text-sm">{cap(k)}</p>
            </div>
          ))}
        </div>
        <div className="overflow-hidden rounded-3xl border border-line bg-white">
          {report.rows.map((r) => (
            <div key={r.studentId} className="row">
              <span className="flex min-w-0 items-center gap-3"><Avatar name={r.name} size={30} /><span className="truncate text-sm">{r.name}<span className="ml-2 text-muted">{r.studentId}</span></span></span>
              <span className={`text-sm font-medium ${TEXT[r.status]}`}>{cap(r.status)}</span>
            </div>
          ))}
          {report.rows.length === 0 && <p className="note p-4">No registered students match this class.</p>}
        </div>
      </>
    );
  }

  return (
    <>
      <PageHeader title="Class attendance" sub="Start a session, then tap student IDs. Late and absent are worked out for you." />
      <div className="space-y-5">
        {!active ? (
          <form onSubmit={start} className="tile bg-lilac space-y-3">
            <h2 className="text-2xl font-medium">Start a class session</h2>
            {err && <p className="alert" role="alert">{err}</p>}
            <input className="field" placeholder="Course code, like CC106" aria-label="Course code" value={form.courseCode} onChange={(e) => setForm({ ...form, courseCode: e.target.value })} />
            <div className="grid grid-cols-2 gap-3">
              <select className="field" aria-label="Program" value={form.program} onChange={(e) => setForm({ ...form, program: e.target.value })}>
                <option value="ALL">All programs</option><option value="BSCS">BSCS</option><option value="BSIS">BSIS</option>
              </select>
              <select className="field" aria-label="Year level" value={form.year} onChange={(e) => setForm({ ...form, year: e.target.value })}>
                <option value="ALL">All years</option>
                {[1, 2, 3, 4].map((y) => <option key={y} value={y}>Year {y}</option>)}
              </select>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <input className="field" placeholder="Section (optional)" aria-label="Section" value={form.section} onChange={(e) => setForm({ ...form, section: e.target.value })} />
              <input className="field" type="number" min="1" placeholder="Late after (minutes)" aria-label="Late after minutes" value={form.late} onChange={(e) => setForm({ ...form, late: e.target.value })} />
            </div>
            <div className="flex flex-wrap items-center gap-4">
              <button className="btn btn-primary">Start session</button>
              <p className="note">The roster is every registered student matching the program, year and section.</p>
            </div>
          </form>
        ) : (
          <>
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="flex items-center gap-4">
                <Ring value={roster.filter((s) => markFor(active.clientId, s.id)).length} total={roster.length} size={60} stroke={8} />
                <div>
                  <h2 className="text-2xl font-medium">{active.name}</h2>
                  <p className="note">
                    Started {new Date(active.startedAt).toLocaleTimeString()}
                    {active.lateAfterMin ? `, late after ${active.lateAfterMin} minutes` : ''}. {roster.length} on the roster.
                  </p>
                </div>
              </div>
              <button onClick={end} className="btn btn-danger">End session</button>
            </div>
            <Banner banner={banner} />
            <ScanControls onToken={onToken} />
            <div className="overflow-hidden rounded-3xl border border-line bg-white">
              {roster.map((s) => {
                const m = markFor(active.clientId, s.id);
                return (
                  <div key={s.id} className="row flex-wrap">
                    <span className="flex min-w-0 items-center gap-3"><Avatar name={s.name} size={32} /><span className="truncate text-sm">{s.name}<span className="ml-2 text-muted">{s.studentId}</span></span></span>
                    <Segmented value={m?.status} name={s.name} onPick={(st) => setMark(active, s, st, 'manual')} />
                  </div>
                );
              })}
              {roster.length === 0 && <p className="note p-4">No registered students match this class yet.</p>}
            </div>
          </>
        )}

        <div className="rounded-3xl border border-line bg-white p-4">
          <SyncBar pending={pending} onSynced={() => { refreshPending(); api('/attendance/sessions').then(setServerSessions).catch(() => {}); }} />
        </div>

        <section aria-label="Past sessions">
          <h2 className="mb-2 text-xl font-medium">Past sessions</h2>
          <div className="overflow-hidden rounded-3xl border border-line bg-white">
            {allSessions.map((s) => (
              <div key={s.clientId} className="row">
                <span className="text-sm">{s.name || s.courseCode}<span className="ml-2 text-muted">{new Date(s.startedAt).toLocaleString()}{!s.endedAt ? ', in progress' : ''}</span></span>
                <button onClick={() => openReport(s)} className="btn-text">View report</button>
              </div>
            ))}
            {allSessions.length === 0 && <p className="note p-4">No sessions yet. Your first one will show up here.</p>}
          </div>
        </section>
      </div>
    </>
  );
}
