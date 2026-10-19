import { useEffect, useState } from 'react';
import { api } from '../api.js';
import { useAuth } from '../context/AuthContext.jsx';
import { useNfc } from '../lib/nfc.js';
import { normalizeToken } from '../lib/logic.js';
import Icon from '../components/Icon.jsx';

function CardArt() {
  return (
    <svg viewBox="0 0 320 200" className="w-full max-w-[340px]" role="img" aria-label="A school ID card">
      <rect width="320" height="200" rx="26" fill="#e2d3ea" />
      <circle cx="70" cy="72" r="32" fill="#5b3e70" />
      <rect x="122" y="48" width="120" height="13" rx="6.5" fill="#5b3e70" />
      <rect x="122" y="72" width="84" height="10" rx="5" fill="#5b3e70" opacity="0.4" />
      <rect x="122" y="92" width="96" height="10" rx="5" fill="#5b3e70" opacity="0.4" />
      <text x="30" y="166" fontFamily="DM Sans Variable, sans-serif" fontSize="30" fontWeight="600" fill="#3c2a4d" letterSpacing="1">25-1167</text>
      <g fill="none" stroke="#5b3e70" strokeWidth="3.5" strokeLinecap="round">
        <path d="M262 150c6 6 6 14 0 20" /><path d="M274 142c10 10 10 26 0 36" /><path d="M286 134c14 14 14 38 0 52" />
      </g>
    </svg>
  );
}

export default function Login() {
  const { signIn } = useAuth();
  const [mode, setMode] = useState('login'); // login | register
  const [via, setVia] = useState('id'); // id | card
  const [form, setForm] = useState({ studentId: '', name: '', password: '', program: 'BSCS', yearLevel: 1 });
  const [cardToken, setCardToken] = useState('');
  const [manual, setManual] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const nfc = useNfc((t) => setCardToken(t));

  useEffect(() => {
    if (cardToken) nfc.stop();
  }, [cardToken]);

  const set = (k) => (e) => setForm({ ...form, [k]: e.target.value });
  const cardMode = mode === 'login' && via === 'card';

  const submit = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      const data = cardMode
        ? await api('/auth/nfc-login', { method: 'POST', body: { token: cardToken, password: form.password } })
        : await api(`/auth/${mode}`, { method: 'POST', body: form });
      signIn(data);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const switchMode = (m) => { setMode(m); setVia('id'); setError(''); };

  return (
    <div className="min-h-screen p-0 sm:p-6 lg:p-10">
      <div className="mx-auto grid min-h-screen max-w-5xl overflow-hidden bg-paper sm:min-h-[640px] sm:rounded-[32px] md:grid-cols-[1fr_0.9fr]">
        <form onSubmit={submit} className="flex flex-col justify-center gap-5 p-7 sm:p-12">
          <div className="flex items-center gap-3">
            <span className="grid h-9 w-9 place-items-center rounded-[12px] bg-plum-700 font-display text-lg font-semibold text-white">C</span>
            <span className="font-display text-xl font-semibold tracking-tight">Student Hub</span>
          </div>

          <div>
            <h1 className="text-[2.3rem] font-medium leading-[1.05] tracking-[-0.03em]">{mode === 'login' ? 'Welcome back' : 'Create your account'}</h1>
            <p className="mt-2 text-[15px] text-muted">
              {mode === 'login' ? 'Sign in to find reviewers and take part in class attendance.' : 'Use your Student ID. Teachers and staff get their accounts from an admin.'}
            </p>
          </div>

          {mode === 'login' && (
            <div className="inline-flex w-fit rounded-full bg-rail p-1" role="tablist" aria-label="Sign in method">
              {[['id', 'Student ID'], ['card', 'Tap ID card']].map(([v, label]) => (
                <button key={v} type="button" role="tab" aria-selected={via === v} onClick={() => { setVia(v); setError(''); }}
                  className={`h-9 rounded-full px-5 text-sm transition-colors ${via === v ? 'bg-white font-medium text-plum-900' : 'text-plum-700'}`}>
                  {label}
                </button>
              ))}
            </div>
          )}

          {error && <p className="alert" role="alert">{error}</p>}

          {cardMode ? (
            <>
              {!cardToken ? (
                <div className="rounded-3xl bg-lilac p-6">
                  <span className="grid h-12 w-12 place-items-center rounded-full bg-white text-plum-700"><Icon name="nfc" size={24} /></span>
                  {nfc.supported ? (
                    <>
                      <p className="mt-4 font-display text-xl font-medium">Hold your school ID to the back of your phone</p>
                      <p className="note mt-1">You will enter your password next, so a lost card cannot sign in on its own.</p>
                      <button type="button" onClick={nfc.start} className="btn btn-primary mt-4" disabled={nfc.scanning}>
                        {nfc.scanning ? 'Waiting for your card' : 'Start scanning'}
                      </button>
                      {nfc.error && <p className="alert mt-3">{nfc.error}</p>}
                    </>
                  ) : (
                    <>
                      <p className="mt-4 font-display text-xl font-medium">Tapping needs Chrome on an Android phone</p>
                      <p className="note mt-1">This browser cannot read NFC cards. Sign in with your Student ID instead.</p>
                      <button type="button" onClick={() => setVia('id')} className="btn btn-primary mt-4">Use Student ID</button>
                    </>
                  )}
                  {import.meta.env.DEV && (
                    <div className="mt-4 flex gap-2">
                      <input className="field" placeholder="Dev only: card ID" value={manual} onChange={(e) => setManual(e.target.value)} />
                      <button type="button" className="btn btn-line shrink-0" onClick={() => setCardToken(normalizeToken(manual))}>Use</button>
                    </div>
                  )}
                </div>
              ) : (
                <div className="flex items-center gap-3 rounded-3xl bg-sage p-4">
                  <span className="grid h-10 w-10 place-items-center rounded-full bg-white text-ok"><Icon name="check" size={20} /></span>
                  <div className="flex-1">
                    <p className="font-medium">ID card detected</p>
                    <p className="note">Enter your password to finish.</p>
                  </div>
                  <button type="button" onClick={() => setCardToken('')} className="btn-text">Scan another</button>
                </div>
              )}
              {cardToken && <input className="field" type="password" autoComplete="current-password" placeholder="Password" value={form.password} onChange={set('password')} required autoFocus />}
            </>
          ) : (
            <>
              <input className="field" autoComplete="username" placeholder={mode === 'login' ? 'Student ID or username' : 'Student ID, like 25-1167'} value={form.studentId} onChange={set('studentId')} required />
              {mode === 'register' && (
                <>
                  <input className="field" placeholder="Full name" value={form.name} onChange={set('name')} required />
                  <div className="grid grid-cols-2 gap-3">
                    <select className="field" value={form.program} onChange={set('program')} aria-label="Program">
                      <option value="BSCS">BSCS</option>
                      <option value="BSIS">BSIS</option>
                    </select>
                    <select className="field" value={form.yearLevel} onChange={set('yearLevel')} aria-label="Year level">
                      {[1, 2, 3, 4].map((y) => <option key={y} value={y}>Year {y}</option>)}
                    </select>
                  </div>
                </>
              )}
              <input className="field" type="password" autoComplete={mode === 'login' ? 'current-password' : 'new-password'} placeholder="Password, at least 8 characters" value={form.password} onChange={set('password')} required />
            </>
          )}

          {(!cardMode || cardToken) && (
            <button disabled={loading} className="btn btn-primary h-12 text-base">
              {loading ? 'Please wait' : mode === 'login' ? 'Sign in' : 'Create account'}
            </button>
          )}

          <p className="text-sm text-muted">
            {mode === 'login' ? 'New student?' : 'Already registered?'}{' '}
            <button type="button" className="btn-text" onClick={() => switchMode(mode === 'login' ? 'register' : 'login')}>
              {mode === 'login' ? 'Create an account' : 'Sign in'}
            </button>
          </p>
        </form>

        <aside className="hidden flex-col justify-center gap-8 bg-plum-700 p-12 text-white md:flex">
          <CardArt />
          <div>
            <p className="font-display text-[1.7rem] font-medium leading-tight tracking-tight">Your school ID is your key to class.</p>
            <p className="mt-3 max-w-xs text-[15px] text-plum-200">Tap it to sign in, to be marked present, and to check in at events. Reviewers from your program are waiting on the board.</p>
          </div>
        </aside>
      </div>
    </div>
  );
}
