// Popup form for uploading a reviewer file (sent as multipart/form-data).
import { useState } from 'react';
import { api } from '../api.js';
import Icon from './Icon.jsx';

export default function UploadModal({ defaults, onClose, onUploaded }) {
  const [form, setForm] = useState({ title: '', description: '', courseCode: '', program: defaults.program, yearLevel: defaults.yearLevel });
  const [file, setFile] = useState(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const set = (k) => (e) => setForm({ ...form, [k]: e.target.value });

  const submit = async (e) => {
    e.preventDefault();
    if (!file) return setError('Choose a file to upload.');
    setError('');
    setLoading(true);
    try {
      const fd = new FormData();
      Object.entries(form).forEach(([k, v]) => fd.append(k, v));
      fd.append('file', file);
      const created = await api('/resources', { method: 'POST', form: fd });
      onUploaded(created);
      onClose();
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fade-in fixed inset-0 z-30 grid place-items-center bg-ink/45 p-4" role="dialog" aria-modal="true" aria-labelledby="upload-title">
      <form onSubmit={submit} className="rise max-h-[92vh] w-full max-w-md space-y-3 overflow-y-auto rounded-[28px] bg-paper p-6">
        <h2 id="upload-title" className="text-2xl font-medium tracking-tight">Upload a reviewer</h2>
        {error && <p className="alert" role="alert">{error}</p>}

        <input className="field" placeholder="Title" value={form.title} onChange={set('title')} required />
        <textarea className="field" rows={3} placeholder="What does it cover? (optional)" value={form.description} onChange={set('description')} />
        <input className="field" placeholder="Course code, like CC106" value={form.courseCode} onChange={set('courseCode')} required />
        <div className="grid grid-cols-2 gap-3">
          <select className="field" value={form.program} onChange={set('program')} aria-label="Program">
            <option value="BSCS">BSCS</option><option value="BSIS">BSIS</option><option value="BOTH">Both programs</option>
          </select>
          <select className="field" value={form.yearLevel} onChange={set('yearLevel')} aria-label="Year level">
            {[1, 2, 3, 4].map((y) => <option key={y} value={y}>Year {y}</option>)}
          </select>
        </div>

        <label className="flex cursor-pointer items-center gap-3 rounded-2xl border border-dashed border-plum-300 bg-white px-4 py-3 text-sm">
          <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-plum-100 text-plum-700"><Icon name="upload" size={18} /></span>
          <span className="min-w-0 flex-1 truncate">{file ? file.name : 'Choose a PDF, Markdown, text or code file'}</span>
          <input type="file" className="sr-only" accept=".pdf,.md,.txt,.js,.py,.java,.c,.cpp,.html,.css,.sql" onChange={(e) => setFile(e.target.files[0])} />
        </label>
        <p className="note">Up to 4 MB.</p>

        <div className="flex justify-end gap-2 pt-1">
          <button type="button" onClick={onClose} className="btn btn-line">Cancel</button>
          <button disabled={loading} className="btn btn-primary">{loading ? 'Uploading' : 'Upload'}</button>
        </div>
      </form>
    </div>
  );
}
