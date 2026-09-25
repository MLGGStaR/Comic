import { useState } from 'react';
import { supabase } from './supabase';
import { Wordmark } from './ui/Wordmark';

const isInstalled = () =>
  window.matchMedia?.('(display-mode: standalone)').matches ||
  (navigator as unknown as { standalone?: boolean }).standalone === true;
const isIOS = /iPhone|iPad|iPod/.test(navigator.userAgent);
const isAndroid = /Android/.test(navigator.userAgent);

const field =
  'w-full bg-bg-2 border border-transparent rounded-xl px-4 py-3 text-sm focus:outline-none focus:border-lb-blue placeholder:text-ink-2';

export function AuthScreen({ onSkip }: { onSkip: () => void }) {
  const [mode, setMode] = useState<'login' | 'signup'>('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [username, setUsername] = useState('');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ kind: 'ok' | 'err'; text: string } | null>(null);

  const forgot = async () => {
    if (!email) return setMsg({ kind: 'err', text: 'Enter your email first' });
    setBusy(true);
    setMsg(null);
    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: window.location.origin + window.location.pathname,
    });
    setBusy(false);
    if (error) return setMsg({ kind: 'err', text: error.message });
    setMsg({ kind: 'ok', text: 'Reset link sent' });
  };

  const submit = async () => {
    if (!email || !password || (mode === 'signup' && !username)) return;
    if (mode === 'signup' && !/^[a-zA-Z0-9_]{3,20}$/.test(username)) {
      return setMsg({ kind: 'err', text: 'Username: 3–20 letters, numbers or _' });
    }
    setBusy(true);
    setMsg(null);
    if (mode === 'signup') {
      const { data, error } = await supabase.auth.signUp({
        email,
        password,
        options: { data: { username } },
      });
      setBusy(false);
      if (error) return setMsg({ kind: 'err', text: error.message });
      if (!data.session) {
        setMsg({ kind: 'ok', text: 'Check your email' });
        setMode('login');
      }
    } else {
      const { error } = await supabase.auth.signInWithPassword({ email, password });
      setBusy(false);
      if (error) return setMsg({ kind: 'err', text: error.message });
    }
  };

  return (
    <div
      className="min-h-screen flex items-center justify-center p-6"
      style={{ paddingTop: 'max(1.5rem, env(safe-area-inset-top))' }}
    >
      <div className="w-full max-w-sm">
        {(isIOS || isAndroid) && !isInstalled() ? (
          <div className="card !p-3.5 mb-6 flex items-start gap-3 !border-lb-blue/40">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-lb-blue flex-shrink-0 mt-0.5">
              <path d="M4 12v7a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-7" />
              <polyline points="16 6 12 2 8 6" />
              <line x1="12" y1="2" x2="12" y2="15" />
            </svg>
            <div className="text-xs text-ink-1 leading-relaxed">
              <b className="text-ink-0">Get the app feel</b> — tap {isIOS ? <b>Share</b> : <b>menu ⋮</b>}, then{' '}
              <b>Add to Home Screen</b>.
            </div>
          </div>
        ) : null}

        <div className="text-center mb-2">
          <Wordmark size={38} />
        </div>
        <p className="text-center text-xs text-ink-2 mb-7">Same account as letterSizd</p>

        <div className="flex bg-bg-1 rounded-xl p-0.5 mb-4">
          {(
            [
              ['login', 'Log in'],
              ['signup', 'Create account'],
            ] as const
          ).map(([k, label]) => (
            <button
              key={k}
              onClick={() => {
                setMode(k);
                setMsg(null);
              }}
              className={`flex-1 py-2 rounded-[10px] text-sm font-semibold ${mode === k ? 'bg-bg-2 text-ink-0' : 'text-ink-2'}`}
            >
              {label}
            </button>
          ))}
        </div>

        <div className="space-y-3">
          {mode === 'signup' ? (
            <input
              type="text"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              placeholder="Username"
              autoCapitalize="off"
              autoCorrect="off"
              className={field}
            />
          ) : null}
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="Email"
            autoCapitalize="off"
            autoComplete="email"
            className={field}
          />
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && submit()}
            placeholder="Password"
            autoComplete={mode === 'signup' ? 'new-password' : 'current-password'}
            className={field}
          />
          <button
            onClick={submit}
            disabled={busy || !email || !password || (mode === 'signup' && !username)}
            className="w-full btn-primary !py-3 disabled:opacity-50"
          >
            {busy ? '…' : mode === 'signup' ? 'Create account' : 'Log in'}
          </button>
          {mode === 'login' ? (
            <button onClick={forgot} disabled={busy} className="w-full text-xs text-ink-2 py-1">
              Forgot password?
            </button>
          ) : null}
          {msg ? (
            <div className={`text-xs text-center ${msg.kind === 'ok' ? 'text-lb-green' : 'text-red-400'}`}>{msg.text}</div>
          ) : null}
          <button onClick={onSkip} className="w-full px-4 py-3 rounded-xl bg-bg-1 border border-white/10 text-ink-1 font-semibold text-sm">
            Just browse
          </button>
        </div>
      </div>
    </div>
  );
}
