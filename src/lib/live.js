import { useEffect, useRef, useState } from 'react';
import { onChange } from './liveStore.js';

// useLive(['resources'], () => reload()) calls the handler whenever one of those topics changes on the server.
export function useLive(topics, handler) {
  const latest = useRef(handler);
  latest.current = handler; // the handler is read at call time, so a new one each render does not resubscribe
  const key = topics.join(','); // the topics array is new on every render, so compare its contents instead
  useEffect(
    () => onChange((changed) => { if (changed.some((t) => topics.includes(t))) latest.current(changed); }),
    [key]
  );
}

// Which keys appeared since the previous render? Used to flash rows that just arrived.
// The very first list never counts as "new".
export function useFresh(keys) {
  const previous = useRef(null);
  const [fresh, setFresh] = useState(() => new Set());
  const signature = keys.join('|'); // re-check only when the list really changed
  useEffect(() => {
    if (previous.current) setFresh(new Set(keys.filter((k) => !previous.current.has(k))));
    previous.current = new Set(keys);
  }, [signature]);
  return fresh;
}
