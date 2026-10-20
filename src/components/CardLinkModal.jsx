import { useEffect, useState } from 'react';
import { api } from '../api.js';
import { useAuth } from '../context/AuthContext.jsx';
import { normalizeToken } from '../lib/logic.js';
import { deviceKey } from '../lib/device.js';
import ScanControls from './ScanControls.jsx';
import Icon from './Icon.jsx';

// Popup for linking your own school ID card to your account: tap the card, confirm with your password.
export default function CardLinkModal({ onClose }) {
  const { user, updateUser } = useAuth();
  const [token, setToken] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [done, setDone] = useState(false);
  const linked = user.hasCard || done;

  useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const submit = async (e) => {
    e.preventDefault();
    const clean = normalizeToken(token);
    if (clean.length < 8) return setError('Tap your ID card first, or type the card ID.');
    if (!password) return setError('Enter your password to confirm it is you.');
    setError('');
    setLoading(true);
    try {
      // Students also trust this phone for tap-only sign-in; staff keep tap + password
      const body = { token: clean, password, deviceKey: user.role === 'student' ? deviceKey({ create: true }) : undefined };
      const { user: me } = await api('/auth/card', { method: 'POST', body });
      updateUser({ ...user, ...me });
      setDone(true);
      setPassword('');
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div
      className="fade-in fixed inset-0 z-30 grid place-items-center bg-ink/45 p-4"
      role="dialog" aria-modal="true" aria-labelledby="card-title"
      onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div className="rise max-h-[92vh] w-full max-w-md space-y-4 overflow-y-auto rounded-[28px] bg-paper p-6">
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-center gap-3">
            <span className={`grid h-10 w-10 shrink-0 place-items-center rounded-full ${linked ? 'bg-sage text-ok' : 'bg-plum-100 text-plum-700'}`}>
              <Icon name={linked ? 'check' : 'card'} size={20} />
            </span>
            <h2 id="card-title" className="text-2xl font-medium tracking-tight">
              {done ? 'Card linked' : linked ? 'Your card is linked' : 'Link your ID card'}
            </h2>
          </div>
          <button type="button" onClick={onClose} aria-label="Close" className="btn btn-soft btn-sm w-8 shrink-0 !px-0"><Icon name="x" size={16} /></button>
        </div>

        {linked ? (
          <>
            <p className="note">
              {done
                ? user.role === 'student'
                  ? 'All set. Staff can now scan your card at the door. To sign in, log out, choose "Tap ID card" and tap it: no password needed on this phone.'
                  : 'All set. Staff can now scan your card at the door, and you can sign in by tapping it and entering your password.'
                : 'Your ID card is linked to this account. If it needs to be changed (lost or replaced card), ask an admin.'}
            </p>
            <div className="flex justify-end"><button type="button" onClick={onClose} className="btn btn-primary">Done</button></div>
          </>
        ) : (
          <form onSubmit={submit} className="space-y-3">
            <p className="note">
              Hold your school ID against the back of your phone, then confirm with your password.
              {user.role === 'student' && ' After that, tapping the card signs you in on this phone without a password.'}
            </p>
            {error && <p className="alert" role="alert">{error}</p>}
            <ScanControls onToken={(t) => { setToken(t); setError(''); }} manual={false} />
            <input value={token} onChange={(e) => setToken(e.target.value)} placeholder="The card ID shows here after a tap" aria-label="Card ID" className="field font-mono" />
            <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="Your password" aria-label="Password" autoComplete="current-password" className="field" />
            <p className="note">No NFC on this device? You can type the card ID instead.</p>
            <div className="flex justify-end gap-2 pt-1">
              <button type="button" onClick={onClose} className="btn btn-line">Cancel</button>
              <button disabled={loading || !token || !password} className="btn btn-primary">{loading ? 'Linking' : 'Link card'}</button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}
