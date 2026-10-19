import { useEffect, useState } from 'react';
import { api } from '../api.js';
import { useAuth } from '../context/AuthContext.jsx';
import ResourceCard from '../components/ResourceCard.jsx';
import UploadModal from '../components/UploadModal.jsx';
import PageHeader from '../components/PageHeader.jsx';
import Ring from '../components/Ring.jsx';
import Icon from '../components/Icon.jsx';

const part = () => {
  const h = new Date().getHours();
  return h < 12 ? 'morning' : h < 18 ? 'afternoon' : 'evening';
};

function Chips({ label, value, options, onChange }) {
  return (
    <div className="flex flex-wrap items-center gap-1.5" role="group" aria-label={label}>
      {options.map(([v, text]) => (
        <button key={v} className="chip" aria-pressed={value === v} onClick={() => onChange(v)}>{text}</button>
      ))}
    </div>
  );
}

export default function ReviewBoard() {
  const { user } = useAuth();
  const canVerify = user.role === 'teacher' || user.role === 'admin';
  const [filters, setFilters] = useState({
    program: user.program || 'ALL',
    yearLevel: user.yearLevel ? String(user.yearLevel) : 'ALL',
    courseCode: '', q: '', sort: 'top', verified: '',
  });
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [showUpload, setShowUpload] = useState(false);

  const set = (k) => (e) => setFilters({ ...filters, [k]: e.target.value });
  const pick = (k) => (v) => setFilters({ ...filters, [k]: v });

  useEffect(() => {
    // small debounce so typing in the search boxes doesn't spam the API
    const t = setTimeout(async () => {
      setLoading(true);
      setError('');
      try {
        const params = new URLSearchParams(Object.entries(filters).filter(([, v]) => v));
        setItems(await api(`/resources?${params}`));
      } catch (err) {
        setError(err.message);
      } finally {
        setLoading(false);
      }
    }, 300);
    return () => clearTimeout(t);
  }, [filters]);

  const replace = (updated) => setItems((prev) => prev.map((r) => (r._id === updated._id ? updated : r)));
  const act = async (id, path, body) => {
    try {
      replace(await api(`/resources/${id}/${path}`, { method: 'POST', body }));
    } catch (err) {
      setError(err.message);
    }
  };

  const verifiedCount = items.filter((r) => r.verified).length;
  const where = `${filters.program === 'ALL' ? 'all programs' : filters.program}${filters.yearLevel === 'ALL' ? '' : `, year ${filters.yearLevel}`}`;

  return (
    <>
      <PageHeader title={`Good ${part()}, ${user.name.split(' ')[0]}`} sub={`Reviewers for ${where}. Teacher-verified ones are marked so you know which to trust.`}>
        <button onClick={() => setShowUpload(true)} className="btn btn-primary"><Icon name="plus" size={18} />Upload reviewer</button>
      </PageHeader>

      <div className="grid gap-6 xl:grid-cols-[1fr_280px]">
        <div className="min-w-0">
          <div className="mb-5 space-y-3">
            <div className="flex flex-wrap gap-x-6 gap-y-3">
              <Chips label="Program" value={filters.program} onChange={pick('program')} options={[['ALL', 'All programs'], ['BSCS', 'BSCS'], ['BSIS', 'BSIS']]} />
              <Chips label="Year level" value={filters.yearLevel} onChange={pick('yearLevel')} options={[['ALL', 'All years'], ['1', 'Year 1'], ['2', 'Year 2'], ['3', 'Year 3'], ['4', 'Year 4']]} />
            </div>
            <div className="flex flex-wrap gap-2">
              <input className="field max-w-[190px]" placeholder="Course code" aria-label="Course code" value={filters.courseCode} onChange={set('courseCode')} />
              <input className="field max-w-[240px]" placeholder="Search titles" aria-label="Search titles" value={filters.q} onChange={set('q')} />
              <select className="field max-w-[160px]" aria-label="Sort" value={filters.sort} onChange={set('sort')}>
                <option value="top">Top rated</option>
                <option value="new">Newest</option>
              </select>
              <button className="chip h-11 px-4" aria-pressed={filters.verified === 'true'} onClick={() => setFilters({ ...filters, verified: filters.verified ? '' : 'true' })}>
                <Icon name="shield" size={16} />Verified only
              </button>
            </div>
          </div>

          {error && <p className="alert mb-4" role="alert">{error}</p>}
          {loading && <p className="note">Loading reviewers</p>}
          {!loading && items.length === 0 && (
            <div className="rounded-3xl bg-lilac p-8">
              <p className="font-display text-xl font-medium">Nothing here yet</p>
              <p className="note mt-1">No reviewers match these filters. Widen the filters, or upload the first one.</p>
            </div>
          )}
          <div className="grid gap-4 md:grid-cols-2">
            {items.map((r) => (
              <ResourceCard key={r._id} resource={r} onVote={(id, value) => act(id, 'vote', { value })} canVerify={canVerify} onVerify={(id) => act(id, 'verify')} />
            ))}
          </div>
        </div>

        <aside className="hidden space-y-4 xl:block">
          <div className="tile bg-lilac">
            <p className="text-sm text-muted">Showing now</p>
            <div className="mt-3 flex items-center justify-between gap-3">
              <div>
                <p className="font-display text-4xl font-medium tabular-nums">{items.length}</p>
                <p className="text-sm">reviewers</p>
              </div>
              <Ring value={verifiedCount} total={items.length} color="var(--color-ok)" />
            </div>
            <p className="mt-3 text-sm text-ink/70">{verifiedCount} of {items.length} verified by a teacher.</p>
          </div>
          <div className="tile bg-blush">
            <p className="font-display text-xl font-medium leading-snug">Notes that helped you can help the next batch.</p>
            <button onClick={() => setShowUpload(true)} className="btn btn-primary btn-sm mt-4">Share a reviewer</button>
          </div>
        </aside>
      </div>

      {showUpload && (
        <UploadModal defaults={{ program: user.program || 'BOTH', yearLevel: user.yearLevel || 1 }} onClose={() => setShowUpload(false)} onUploaded={(r) => setItems((prev) => [r, ...prev])} />
      )}
    </>
  );
}
