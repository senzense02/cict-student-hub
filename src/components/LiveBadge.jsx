import { useLiveStatus } from '../lib/live.js';

// "Live" while pages are receiving updates; amber while reconnecting.
export default function LiveBadge({ className = '', compact = false }) {
  const { connected, push } = useLiveStatus();
  if (connected === null) return null;
  return (
    <span
      role="status"
      title={connected ? (push ? 'Updates arrive instantly' : 'This page checks for updates every few seconds') : 'Trying to reconnect. Your data is safe.'}
      className={`inline-flex h-7 items-center gap-2 rounded-full bg-rail ${compact ? 'px-2.5' : 'px-3'} text-xs font-medium text-plum-900 ${className}`}
    >
      <span className={`h-2 w-2 rounded-full ${connected ? 'live-dot bg-ok' : 'bg-warn'}`} />
      <span className={compact ? 'sr-only' : undefined}>{connected ? 'Live' : 'Reconnecting'}</span>
    </span>
  );
}
