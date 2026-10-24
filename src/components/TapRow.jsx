// One door tap in a list: who, what they did, when. Used by the Door log (by day and by session).
import Avatar from './Avatar.jsx';

export const ACTION_LABEL = { CHECK_IN: 'Checked in', RE_ENTRY: 'Came back in', TEMPORARY_EXIT: 'Temporary exit', UNKNOWN_CARD: 'Unregistered card' };
const DOT = { CHECK_IN: 'bg-ok', RE_ENTRY: 'bg-ok', TEMPORARY_EXIT: 'bg-warn', UNKNOWN_CARD: 'bg-bad' };

// showSession: also say which session the tap belongs to (the by-day view mixes sessions)
export default function TapRow({ e, fresh = false, showSession = false }) {
  const sessionName = showSession ? (e.session ? e.session.name || 'Deleted session' : 'No session') : null;
  return (
    <div className={`row flex-wrap ${fresh ? 'flash' : ''}`}>
      <span className="flex min-w-0 items-center gap-3">
        <Avatar name={e.student?.name || '?'} size={32} />
        <span className="min-w-0 text-sm">
          <span className="block truncate font-medium">{e.student ? e.student.name : 'Unregistered card'}</span>
          <span className="text-muted">{e.student ? `${e.student.studentId}, ${e.student.program} year ${e.student.yearLevel}` : e.token}</span>
          {sessionName && <span className="block truncate text-xs text-muted">{sessionName}</span>}
        </span>
      </span>
      <span className="flex items-center gap-4 text-sm">
        {e.offList && <span className="text-xs font-medium text-bad-ink">Not on the list</span>}
        <span className="flex items-center gap-2"><span className={`h-2.5 w-2.5 rounded-full ${DOT[e.action]}`} />{ACTION_LABEL[e.action]}</span>
        <span className="text-xs text-muted tabular-nums">{new Date(e.scannedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}</span>
        {e.by && <span className="hidden text-xs text-muted sm:inline">by {e.by}</span>}
      </span>
    </div>
  );
}
