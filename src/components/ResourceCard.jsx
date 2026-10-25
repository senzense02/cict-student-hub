// One reviewer on the board: votes, verified badge, and an inline preview or download of the file.
// Files sit behind the login, so they are fetched with the token and shown through a temporary blob: URL.
import { memo, useEffect, useState } from 'react';
import { fetchFileUrl } from '../api.js';
import { tintFor } from './Avatar.jsx';
import Avatar from './Avatar.jsx';
import Icon from './Icon.jsx';

function ResourceCard({ resource, index = 0, onVote, canVerify, onVerify, canDelete, onDelete }) {
  const [previewUrl, setPreviewUrl] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const [popped, setPopped] = useState(0); // which vote button was just tapped, so only that tap animates
  const isPdf = resource.fileType === '.pdf';
  const filePath = `/resources/${resource._id}/file`;
  const uploader = resource.uploader?.name || 'Unknown';

  // Free the temporary blob URL when it is replaced or the card goes away
  useEffect(() => () => previewUrl && URL.revokeObjectURL(previewUrl), [previewUrl]);

  const togglePreview = async () => {
    if (previewUrl) return setPreviewUrl(''); // already open: hide it (the effect above frees the blob)
    setBusy(true);
    setErr('');
    try {
      setPreviewUrl(await fetchFileUrl(filePath));
    } catch (e) {
      setErr(e.message);
    } finally {
      setBusy(false);
    }
  };

  const openFile = async () => {
    // Open the tab right away, while still inside the tap, so popup blockers allow it. The file URL is filled in after the download
    const win = window.open('', '_blank');
    setErr('');
    try {
      const url = await fetchFileUrl(filePath);
      // If the popup was blocked, load the file in this tab instead
      if (win) win.location.href = url;
      else window.location.href = url;
    } catch (e) {
      if (win) win.close();
      setErr(e.message);
    }
  };

  const vote = (value, icon, label) => (
    <button onClick={() => { setPopped(value); onVote(resource._id, value); }} aria-label={label} aria-pressed={resource.myVote === value}
      className={`grid h-8 w-8 place-items-center rounded-full transition active:scale-90 ${resource.myVote === value ? `bg-plum-700 text-white ${popped === value ? 'tick' : ''}` : 'text-plum-700 hover:bg-plum-100'}`}>
      <Icon name={icon} size={18} />
    </button>
  );

  return (
    // --i staggers the entrance animation, capped so cards far down the list do not wait long
    <article style={{ '--i': Math.min(index, 8) }} className={`${tintFor(resource.courseCode)} rise lift cv flex min-w-0 flex-col gap-4 rounded-3xl p-5`}>
      <div className="flex items-start justify-between gap-3">
        <div className="flex flex-wrap gap-1.5 text-[13px]">
          <span className="rounded-full bg-white px-3 py-1 font-medium text-plum-900">{resource.courseCode}</span>
          <span className="rounded-full bg-white/60 px-3 py-1">{resource.program === 'BOTH' ? 'BSCS and BSIS' : resource.program}</span>
          <span className="rounded-full bg-white/60 px-3 py-1">Year {resource.yearLevel}</span>
        </div>
        {resource.verified && (
          <span title={resource.verifiedBy ? `Verified by ${resource.verifiedBy.name}` : 'Verified'} className="inline-flex shrink-0 items-center gap-1 rounded-full bg-ok px-2.5 py-1 text-xs font-medium text-white">
            <Icon name="shield" size={14} />Verified
          </span>
        )}
      </div>

      <div>
        <h3 className="text-[1.35rem] font-medium leading-snug tracking-tight">{resource.title}</h3>
        {resource.description && <p className="mt-1.5 line-clamp-2 text-sm text-ink/70">{resource.description}</p>}
      </div>

      <div className="mt-auto flex items-center justify-between gap-3">
        <div className="flex min-w-0 items-center gap-2">
          <Avatar name={uploader} size={28} />
          <span className="truncate text-sm">{uploader}</span>
        </div>
        <div className="flex items-center rounded-full bg-white p-0.5" role="group" aria-label="Rating">
          {vote(1, 'up', 'Upvote')}
          {/* key={score} remounts this number so the tick animation replays whenever it changes */}
          <span key={resource.score} className="tick min-w-6 text-center text-sm font-semibold tabular-nums">{resource.score}</span>
          {vote(-1, 'down', 'Downvote')}
        </div>
      </div>

      <div className="flex flex-wrap gap-x-5 gap-y-1 border-t border-ink/10 pt-3">
        {isPdf && <button onClick={togglePreview} disabled={busy} className="btn-text">{busy ? 'Loading' : previewUrl ? 'Hide preview' : 'Preview'}</button>}
        <button onClick={openFile} className="btn-text">{isPdf ? 'Open or download' : 'View file'}</button>
        {canVerify && <button onClick={() => onVerify(resource._id)} className="btn-text">{resource.verified ? 'Remove verification' : 'Mark as verified'}</button>}
        {canDelete && <button onClick={() => onDelete(resource._id)} className="btn-text text-bad-ink">Delete</button>}
      </div>
      {err && <p className="text-xs text-bad-ink">{err}</p>}
      {previewUrl && <iframe title={resource.title} src={previewUrl} loading="lazy" className="h-[480px] w-full rounded-2xl border border-line bg-white" />}
    </article>
  );
}

// Cards only redraw when their own reviewer changes, so typing in the filters or voting on one card
// does not redraw the other ninety-nine.
export default memo(ResourceCard);
