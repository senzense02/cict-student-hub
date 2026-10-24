// A session that has not started yet: import the registration list from the Google Form, then start it.
import { useState } from 'react';
import { api } from '../api.js';
import PageHeader from './PageHeader.jsx';
import ImportModal from './ImportModal.jsx';
import Icon from './Icon.jsx';

const plural = (n, one, many) => `${n} ${n === 1 ? one : many}`;

// A short list of people. Only the first 200 are drawn, so a big class does not slow the page down.
function People({ title, people }) {
  return (
    <details className="mt-3 text-sm">
      <summary className="cursor-pointer text-muted">{title}</summary>
      <div className="mt-2 max-h-56 overflow-y-auto rounded-2xl border border-line">
        {people.slice(0, 200).map((r) => (
          <div key={r.studentNo} className="row">
            <span className="truncate">{r.name || 'No name'}</span>
            <span className="text-muted tabular-nums">{r.studentNo}</span>
          </div>
        ))}
        {people.length > 200 && <p className="note p-3">and {people.length - 200} more</p>}
      </div>
    </details>
  );
}

// canManage: only whoever created the session (or an admin) can import and start it
export default function SessionSetup({ session, roster, canManage, onChanged, onLeave }) {
  const [importing, setImporting] = useState(false);
  const [starting, setStarting] = useState(false);
  const [note, setNote] = useState('');
  const [error, setError] = useState('');

  const inHub = roster.filter((r) => r.userId);
  const notInHub = roster.filter((r) => !r.userId);
  const noCard = inHub.filter((r) => !r.hasCard);

  const imported = (r) => {
    setImporting(false);
    setError('');
    setNote(
      `Saved ${plural(r.saved, 'student', 'students')}${r.skipped ? ` (${plural(r.skipped, 'row', 'rows')} skipped)` : ''}. ` +
      `The list now has ${plural(r.total, 'student', 'students')}, and ${r.matched} of them have a Hub account.`
    );
    onChanged();
  };

  const start = async () => {
    setStarting(true);
    setError('');
    try {
      await api(`/attendance/sessions/${session.id}`, { method: 'PATCH', body: { status: 'active' } });
      await onChanged(); // the page switches to scanning once the server says it is running
    } catch (e) {
      setError(e.message);
      setStarting(false);
    }
  };

  const tiles = [
    { label: 'On the list', n: roster.length, tint: 'bg-lilac' },
    { label: 'Have a Hub account', n: inHub.length, tint: 'bg-sage' },
    { label: 'No Hub account yet', n: notInHub.length, tint: 'bg-sand' },
  ];

  return (
    <>
      <button onClick={onLeave} className="btn-text mb-3">Back to sessions</button>
      <PageHeader title={session.name} sub="Add the registration list, then start the session. Nothing is logged until you start it." />

      <div className="space-y-5">
        {error && <p className="alert" role="alert">{error}</p>}

        <section aria-label="Registration list" className="rounded-3xl border border-line bg-white p-5">
          <h2 className="text-xl font-medium">Registration list</h2>
          {roster.length === 0 ? (
            <p className="note mt-1">
              No list yet. Import the responses from your Google Form and the scanner will flag anyone who taps without being on it.
              You can also start without a list: every student with a linked card is let in.
            </p>
          ) : (
            <>
              <div className="mt-3 grid grid-cols-3 gap-3">
                {tiles.map((t) => (
                  <div key={t.label} className={`tile ${t.tint}`}>
                    <p className="font-display text-[2rem] font-medium leading-none tabular-nums">{t.n}</p>
                    <p className="mt-1.5 text-sm">{t.label}</p>
                  </div>
                ))}
              </div>
              {noCard.length > 0 && <p className="note mt-3">{plural(noCard.length, 'student on the list has', 'students on the list have')} no ID card linked yet, so they cannot be scanned.</p>}
              {notInHub.length > 0 && <People title={`${notInHub.length} on the list with no Hub account`} people={notInHub} />}
              {noCard.length > 0 && <People title={`${noCard.length} with no ID card linked`} people={noCard} />}
            </>
          )}

          {canManage && (
            <button onClick={() => setImporting(true)} className="btn btn-line mt-4">
              <Icon name="upload" size={18} />{roster.length ? 'Import again' : 'Import from Google Form'}
            </button>
          )}
          {note && <p className="note mt-3" role="status">{note}</p>}
        </section>

        {canManage ? (
          <div className="flex flex-wrap items-center gap-3">
            <button onClick={start} disabled={starting} className="btn btn-primary">{starting ? 'Starting' : 'Start session'}</button>
            <span className="note">{roster.length ? 'Students not on the list can still be scanned, and are flagged.' : 'With no list, every student with a linked card can be scanned.'}</span>
          </div>
        ) : (
          <p className="note">{session.createdByName || 'The person who created this session'} has to start it.</p>
        )}
      </div>

      {importing && <ImportModal sessionId={session.id} existing={roster.length} onClose={() => setImporting(false)} onDone={imported} />}
    </>
  );
}
