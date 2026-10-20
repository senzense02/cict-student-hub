import { useEffect, useState } from 'react';
import { api } from '../api.js';
import ScanControls from '../components/ScanControls.jsx';
import PageHeader from '../components/PageHeader.jsx';
import Avatar from '../components/Avatar.jsx';
import { store, refreshStudents } from '../lib/offline.js';

// Link a school ID card to a student: pick the student, tap the card, save.
export default function Cards() {
  const [students, setStudents] = useState(store.students());
  const [query, setQuery] = useState('');
  const [selected, setSelected] = useState(null);
  const [token, setToken] = useState('');
  const [msg, setMsg] = useState('');

  const load = () => refreshStudents().then(setStudents).catch((e) => setMsg(`Could not load students. ${e.message}`));
  useEffect(() => { load(); }, []);

  const pick = (s) => { setSelected(s); setToken(s.nfcToken || ''); setMsg(''); };

  const save = async (body) => {
    try {
      await api(`/students/${selected.id}`, { method: 'PATCH', body });
      setMsg('Saved.');
      const list = await refreshStudents();
      setStudents(list);
      setSelected(list.find((s) => s.id === selected.id));
    } catch (e) {
      setMsg(e.message);
    }
  };

  const shown = students.filter((s) => `${s.name} ${s.studentId}`.toLowerCase().includes(query.toLowerCase())).slice(0, 60);
  const linked = students.filter((s) => s.nfcToken).length;

  return (
    <>
      <PageHeader title="ID cards" sub={`${linked} of ${students.length} students have a card linked. Pick a student, tap their ID, then save.`} />
      <div className="grid gap-5 lg:grid-cols-2">
        <section>
          <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search by name or ID" aria-label="Search students" className="field mb-3" />
          <div className="max-h-[30rem] overflow-y-auto rounded-3xl border border-line bg-white">
            {shown.map((s) => (
              <button key={s.id} onClick={() => pick(s)} aria-pressed={selected?.id === s.id} className={`row w-full text-left ${selected?.id === s.id ? 'bg-plum-100' : 'hover:bg-rail/60'}`}>
                <span className="flex min-w-0 items-center gap-3"><Avatar name={s.name} size={32} /><span className="truncate text-sm">{s.name}<span className="ml-2 text-muted">{s.studentId}</span></span></span>
                <span className={`text-sm ${s.nfcToken ? 'text-ok' : 'text-muted'}`}>{s.nfcToken ? 'Linked' : 'No card'}</span>
              </button>
            ))}
            {shown.length === 0 && <p className="note p-4">No students found. Students create their own accounts first.</p>}
          </div>
        </section>

        <section className="space-y-4">
          {!selected ? (
            <div className="tile bg-lilac"><p className="font-display text-xl font-medium">Select a student</p><p className="note mt-1">Their details and card options will show here.</p></div>
          ) : (
            <>
              <div className="tile bg-lilac">
                <div className="flex items-center gap-3">
                  <Avatar name={selected.name} size={44} />
                  <div>
                    <h2 className="text-2xl font-medium leading-tight">{selected.name}</h2>
                    <p className="note">{selected.studentId}, {selected.program} year {selected.yearLevel}</p>
                  </div>
                </div>
              </div>
              <ScanControls onToken={setToken} />
              <input value={token} onChange={(e) => setToken(e.target.value)} placeholder="The card ID shows here after a tap" aria-label="Card ID" className="field font-mono" />
              <div className="flex flex-wrap gap-2">
                <button onClick={() => save({ nfcToken: token })} disabled={!token} className="btn btn-primary">Save card</button>
                {selected.nfcToken && <button onClick={() => { setToken(''); save({ nfcToken: '' }); }} className="btn btn-line">Unlink card</button>}
              </div>
              {msg && <p className="note" role="status">{msg}</p>}
            </>
          )}
        </section>
      </div>
    </>
  );
}
