// useNfc: a React hook around Web NFC, the phone's card reader (gives us a card's serial number).
import { useEffect, useRef, useState } from 'react';
import { normalizeToken } from './logic.js';

// Web NFC: works only in Chrome on Android, over HTTPS (or localhost), after a button tap.
export function useNfc(onToken) {
  const ctrl = useRef(null);
  const handler = useRef(onToken);
  const last = useRef({ token: '', at: 0 });
  const [scanning, setScanning] = useState(false);
  const [error, setError] = useState('');
  const supported = typeof window !== 'undefined' && 'NDEFReader' in window;

  handler.current = onToken; // always call the newest callback, because the reader below is started only once

  const start = async () => {
    if (!supported) return setError('Web NFC needs Chrome on an Android phone, opened over HTTPS.');
    try {
      const reader = new window.NDEFReader();
      ctrl.current = new AbortController();
      await reader.scan({ signal: ctrl.current.signal });
      reader.onreadingerror = () => setError('Could not read that card. Try again.');
      reader.onreading = (e) => {
        const token = normalizeToken(e.serialNumber);
        const now = Date.now();
        // Holding a card on the phone fires several reads, so ignore the same card within 2.5 seconds
        if (token === last.current.token && now - last.current.at < 2500) return;
        last.current = { token, at: now };
        handler.current(token);
      };
      setScanning(true);
      setError('');
    } catch (err) {
      setScanning(false);
      setError(err.name === 'NotAllowedError' ? 'NFC permission was denied.' : err.message);
    }
  };

  const stop = () => {
    ctrl.current?.abort();
    setScanning(false);
  };

  useEffect(() => () => ctrl.current?.abort(), []);

  return { supported, scanning, error, start, stop };
}
