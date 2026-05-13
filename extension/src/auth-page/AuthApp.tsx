import { useState } from 'react';
import { sendMessage } from '../shared/messages';
import type { LearnerLevel } from '../shared/types';

const C = {
  base:     '#F5F1E9',
  surface0: '#FFFFFF',
  surface1: '#E2DACE',
  surface2: '#C9BEAD',
  text:     '#4A3B2C',
  subtext:  '#877666',
  blue:     '#98C1D9',
  green:    '#A8B693',
  amber:    '#E9C46A',
  red:      '#D97762',
};

type View = 'login' | 'register';

const LEVELS: Array<{ value: LearnerLevel; label: string }> = [
  { value: 'beginner',           label: 'A1 · Beginner (~1,235 words)' },
  { value: 'elementary',         label: 'A2 · Elementary (~2,531 words)' },
  { value: 'intermediate',       label: 'B1 · Intermediate (~4,535 words)' },
  { value: 'upper-intermediate', label: 'B2 · Upper Intermediate (~6,983 words)' },
  { value: 'advanced',           label: 'C2 · Advanced (~9,190 words)' },
];

interface AuthAppProps {
  inline?: boolean;
}

export function AuthApp({ inline }: AuthAppProps = {}) {
  const [view, setView] = useState<View>('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [learnerLevel, setLearnerLevel] = useState<LearnerLevel>('intermediate');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);

  const passwordStrengthError = (pwd: string): string | null => {
    if (pwd.length < 8) return 'Password must be at least 8 characters';
    if (!/[0-9]/.test(pwd)) return 'Password must contain at least one number';
    if (!/[!@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/?]/.test(pwd)) return 'Password must contain at least one special character';
    return null;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (view === 'register') {
      const pwdError = passwordStrengthError(password);
      if (pwdError) { setError(pwdError); return; }
      if (password !== confirmPassword) { setError('Passwords do not match'); return; }
    }
    setLoading(true);
    try {
      const payload = view === 'login' 
        ? { email, password }
        : { email, password, learnerLevel };

      const result = await sendMessage<{ ok: boolean; email?: string; error?: string }>({
        type: view === 'login' ? 'LOGIN' : 'REGISTER',
        payload: payload as any,
      });
      if (result.ok) {
        setSuccess(true);
        if (!inline) setTimeout(() => window.close(), 800);
      } else {
        setError(result.error ?? 'Something went wrong');
      }
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  };

  const globalStyle = `
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body { background: ${C.base}; }
    input::placeholder { color: ${C.surface2}; }
    input:focus { border-color: ${C.blue} !important; }
    select:focus { border-color: ${C.blue} !important; }
  `;

  const inputStyle: React.CSSProperties = {
    width: '100%',
    background: C.surface0,
    border: `1px solid ${C.surface1}`,
    borderRadius: '8px',
    padding: '10px 12px',
    color: C.text,
    fontSize: '14px',
    outline: 'none',
    transition: 'border-color 0.15s',
  };

  if (success) {
    return (
      <>
        <style>{globalStyle}</style>
        <div style={{
          minHeight: '100vh',
          background: C.base,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          fontFamily: 'system-ui, -apple-system, sans-serif',
        }}>
          <div style={{ textAlign: 'center', color: C.green, fontSize: '16px', fontWeight: 600 }}>
            ✓ {view === 'login' ? 'Signed in' : 'Account created'}!
            <div style={{ fontSize: '13px', color: C.subtext, marginTop: '6px', fontWeight: 400 }}>
              Closing…
            </div>
          </div>
        </div>
      </>
    );
  }

  return (
    <>
      <style>{globalStyle}</style>
      <div style={{
        minHeight: '100vh',
        background: C.base,
        fontFamily: 'system-ui, -apple-system, sans-serif',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '24px',
      }}>
        <div style={{ width: '100%', maxWidth: '340px' }}>
          {/* Logo */}
          <div style={{ textAlign: 'center', marginBottom: '28px' }}>
            <span style={{ color: C.blue, fontWeight: 800, fontSize: '28px', letterSpacing: '-1px' }}>Syn</span>
            <span style={{ color: C.amber, fontWeight: 800, fontSize: '28px', letterSpacing: '-1px' }}>tagma</span>
          </div>

          {/* Tab switcher */}
          <div style={{
            display: 'flex',
            background: C.surface1,
            borderRadius: '10px',
            padding: '4px',
            marginBottom: '24px',
          }}>
            {(['login', 'register'] as View[]).map(v => (
              <button
                key={v}
                onClick={() => { setView(v); setError(null); setConfirmPassword(''); }}
                style={{
                  flex: 1,
                  background: view === v ? C.surface0 : 'transparent',
                  color: view === v ? C.text : C.subtext,
                  border: 'none',
                  borderRadius: '8px',
                  padding: '8px',
                  cursor: 'pointer',
                  fontSize: '14px',
                  fontWeight: view === v ? 600 : 400,
                  transition: 'all 0.15s',
                  boxShadow: view === v ? '0 1px 3px rgba(0,0,0,0.08)' : 'none',
                }}
              >
                {v === 'login' ? 'Sign In' : 'Register'}
              </button>
            ))}
          </div>

          {/* Form */}
          <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
            <input
              type="email"
              value={email}
              onChange={e => setEmail(e.target.value)}
              placeholder="Email"
              required
              autoFocus
              style={inputStyle}
            />
            <input
              type="password"
              value={password}
              onChange={e => setPassword(e.target.value)}
              placeholder="Password"
              required
              style={inputStyle}
            />

            {view === 'register' && (
              <>
                <input
                  type="password"
                  value={confirmPassword}
                  onChange={e => setConfirmPassword(e.target.value)}
                  placeholder="Confirm Password"
                  required
                  style={{
                    ...inputStyle,
                    borderColor: confirmPassword && confirmPassword !== password ? C.red : C.surface1,
                  }}
                />
                
                <div style={{ marginTop: '4px' }}>
                  <label style={{ fontSize: '12px', fontWeight: 600, color: C.subtext, marginBottom: '6px', display: 'block' }}>
                    What is your current English level?
                  </label>
                  <select
                    value={learnerLevel}
                    onChange={e => setLearnerLevel(e.target.value as LearnerLevel)}
                    style={inputStyle}
                  >
                    {LEVELS.map(lvl => (
                      <option key={lvl.value} value={lvl.value}>
                        {lvl.label}
                      </option>
                    ))}
                  </select>
                  <div style={{ fontSize: '11px', color: C.subtext, marginTop: '4px', fontStyle: 'italic' }}>
                    This helps us identify which words you already know.
                  </div>
                </div>
              </>
            )}

            {error && (
              <div style={{
                fontSize: '13px',
                color: C.red,
                padding: '8px 10px',
                background: C.red + '18',
                borderRadius: '6px',
                border: `1px solid ${C.red}30`,
              }}>
                {error}
              </div>
            )}

            <button
              type="submit"
              disabled={loading}
              style={{
                background: loading ? C.surface1 : C.blue,
                color: loading ? C.subtext : C.base,
                border: 'none',
                borderRadius: '8px',
                padding: '11px',
                fontSize: '14px',
                fontWeight: 700,
                cursor: loading ? 'not-allowed' : 'pointer',
                transition: 'all 0.15s',
                marginTop: '4px',
              }}
            >
              {loading
                ? 'Please wait…'
                : view === 'login' ? 'Sign In' : 'Create Account'}
            </button>
          </form>

          <div style={{ textAlign: 'center', marginTop: '20px', fontSize: '12px', color: C.subtext }}>
            {view === 'login'
              ? <>Don't have an account?{' '}
                  <span onClick={() => { setView('register'); setError(null); }}
                    style={{ color: C.blue, cursor: 'pointer', fontWeight: 600 }}>Register</span></>
              : <>Already have an account?{' '}
                  <span onClick={() => { setView('login'); setError(null); setConfirmPassword(''); }}
                    style={{ color: C.blue, cursor: 'pointer', fontWeight: 600 }}>Sign In</span></>
            }
          </div>
        </div>
      </div>
    </>
  );
}
