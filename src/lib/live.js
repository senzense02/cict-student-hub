import { useEffect, useRef, useState } from 'react';
import { getStatus, onChange, onStatus } from './liveStore.js';

// useLive(['resources'], () => reload()) calls the handler whenever one of those topics changes on the server.
export function useLive(topics, handler) {
  const latest = useRef(handler);
  latest.current = handler;
  const key = topics.join(',');
  useEffect(
    () => onChange((changed) => { if (changed.some((t) => topics.includes(t))) latest.current(changed); }),
    [key]
  );
}

// true = receiving live updates, false = trying to reconnect, null = not known yet
export function useLiveStatus() {
  const [connected, setConnected] = useState(getStatus());
  useEffect(() => {
    setConnected(getStatus());
    return onStatus(setConnected);
  }, []);
  return connected;
}

// Which keys appeared since the previous render? Used to flash rows that just arrived.
// The very first list never counts as "new".
export function useFresh(keys) {
  const previous = useRef(null);
  const [fresh, setFresh] = useState(() => new Set());
  const signature = keys.join('|');
  useEffect(() => {
    if (previous.current) setFresh(new Set(keys.filter((k) => !previous.current.has(k))));
    previous.current = new Set(keys);
  }, [signature]);
  return fresh;
}
