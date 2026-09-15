import { FormEvent, useState, useEffect } from 'react';
import { LogIn, Loader2, Mail, ChevronDown } from 'lucide-react';
import { api, ApiUser } from '../api';

interface LoginViewProps {
  onLoggedIn: (user: ApiUser) => void;
}

const DEMO_ACCOUNTS = [
  {
    email: 'sales@microgenesis.com',
    password: 'password123',
    name: 'Maria Reyes',
    role: 'Sales Coordinator',
    initials: 'MR',
    avatarBg: 'bg-blue-600',
    roleBadge: 'bg-blue-50 text-blue-700 border-blue-200',
  },
  {
    email: 'logistics@microgenesis.com',
    password: 'password123',
    name: 'Juan Santos',
    role: 'Logistics',
    initials: 'JS',
    avatarBg: 'bg-emerald-600',
    roleBadge: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  },
  {
    email: 'tass@microgenesis.com',
    password: 'password123',
    name: 'Ana Cruz',
    role: 'TASS',
    initials: 'AC',
    avatarBg: 'bg-purple-600',
    roleBadge: 'bg-purple-50 text-purple-700 border-purple-200',
  },
  {
    email: 'admin@microgenesis.com',
    password: 'admin123',
    name: 'System Admin',
    role: 'Admin',
    initials: 'SA',
    avatarBg: 'bg-[#1F3864]',
    roleBadge: 'bg-slate-100 text-slate-700 border-slate-200',
  },
] as const;

const SHOW_DEMO = import.meta.env.DEV || import.meta.env.VITE_SHOW_DEMO_ACCOUNTS === 'true';

function MicrosoftLogo() {
  return (
    <svg width="21" height="21" viewBox="0 0 21 21" xmlns="http://www.w3.org/2000/svg">
      <rect x="1" y="1" width="9" height="9" fill="#F25022" />
      <rect x="11" y="1" width="9" height="9" fill="#7FBA00" />
      <rect x="1" y="11" width="9" height="9" fill="#00A4EF" />
      <rect x="11" y="11" width="9" height="9" fill="#FFB900" />
    </svg>
  );
}

export default function LoginView({ onLoggedIn }: LoginViewProps) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [ssoLoading, setSsoLoading] = useState(false);
  const [showEmailForm, setShowEmailForm] = useState(false);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const errParam = params.get('error');
    if (errParam === 'account_deactivated') {
      setError('Your Microsoft account is not authorized. Contact your administrator.');
      window.history.replaceState({}, '', '/');
    } else if (errParam === 'sso_failed') {
      setError('Microsoft login failed. Please try again or use email login.');
      window.history.replaceState({}, '', '/');
    } else if (errParam === 'sso_not_configured') {
      setError('Microsoft login is not configured. Use email login.');
      setShowEmailForm(true);
      window.history.replaceState({}, '', '/');
    } else if (errParam === 'sso_no_email') {
      setError('Could not retrieve email from your Microsoft account. Use email login.');
      setShowEmailForm(true);
      window.history.replaceState({}, '', '/');
    }
  }, []);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const user = await api.login(email.trim(), password);
      onLoggedIn(user);
    } catch (err: any) {
      setError(err?.message || 'Login failed');
    } finally {
      setLoading(false);
    }
  };

  const handleMicrosoftLogin = async () => {
    setError(null);
    setSsoLoading(true);
    try {
      const res = await fetch('/api/auth/microsoft', {
        method: 'POST',
        credentials: 'include',
      });
      const data = await res.json();
      if (data.url) {
        window.location.href = data.url;
      } else {
        setError(data.error || 'Microsoft login is not configured. Use email login.');
        setShowEmailForm(true);
        setSsoLoading(false);
      }
    } catch {
      setError('Could not connect to authentication service.');
      setSsoLoading(false);
    }
  };

  const handleQuickLogin = async (demoEmail: string, demoPassword: string) => {
    setError(null);
    setLoading(true);
    try {
      const user = await api.login(demoEmail, demoPassword);
      onLoggedIn(user);
    } catch (err: any) {
      setError(err?.message || 'Login failed');
    } finally {
      setLoading(false);
    }
  };

  const isLoading = loading || ssoLoading;

  return (
    <div className="min-h-screen w-full flex" id="login-screen">

      {/* ── LEFT PANEL ─────────────────────────────────── */}
      <div className="hidden lg:flex lg:w-2/3 relative overflow-hidden bg-gradient-to-br from-[#1F3864] via-[#1a4f8a] to-[#0078C1] flex-col items-center justify-center px-12">
        {/* Glow decorations */}
        <div className="w-96 h-96 bg-white/5 rounded-full blur-3xl absolute -top-20 -right-20 pointer-events-none" />
        <div className="w-80 h-80 bg-[#0078C1]/20 rounded-full blur-3xl absolute -bottom-16 -left-16 pointer-events-none" />

        {/* Flowing line texture */}
        <svg className="absolute inset-0 w-full h-full pointer-events-none" viewBox="0 0 900 900" preserveAspectRatio="none">
          <path d="M -50 160 C 200 90, 550 240, 950 110" stroke="white" strokeOpacity="0.08" strokeWidth="1.5" fill="none" />
          <path d="M -50 320 C 250 270, 600 400, 950 280" stroke="white" strokeOpacity="0.06" strokeWidth="1.5" fill="none" />
          <path d="M -50 600 C 220 540, 520 700, 950 580" stroke="white" strokeOpacity="0.05" strokeWidth="1" fill="none" />
        </svg>

        {/* Fading dot-matrix cluster, bottom-left */}
        <svg className="absolute bottom-0 left-0 w-72 h-72 pointer-events-none" viewBox="0 0 280 280">
          {Array.from({ length: 9 }).map((_, row) =>
            Array.from({ length: 9 }).map((_, col) => {
              const dist = Math.sqrt(row * row + col * col);
              const opacity = Math.max(0, 0.45 - dist * 0.055);
              if (opacity <= 0.02) return null;
              return (
                <circle
                  key={`${row}-${col}`}
                  cx={col * 32}
                  cy={280 - row * 32}
                  r={1.6}
                  fill="white"
                  fillOpacity={opacity}
                />
              );
            })
          )}
        </svg>

        {/* Logo + text */}
        <div className="relative z-10 flex flex-col items-center text-center">
          <img src="/microgenesis_logo_white.png" alt="Microgenesis - Making IT Easy For You!" className="w-[28rem]" />
          <h1 className="text-5xl font-extrabold text-white tracking-tight leading-tight mt-8">
            Supply Chain Portal
          </h1>
        </div>

        {/* Bottom attribution */}
        <p className="absolute bottom-8 left-0 right-0 text-center text-xs text-white/30 font-medium">
          Microgenesis Business Systems Inc.
        </p>
      </div>

      {/* ── RIGHT PANEL ────────────────────────────────── */}
      <div className="w-full lg:w-1/3 bg-white flex flex-col items-center justify-center px-10 overflow-y-auto min-h-screen">
        <div className="w-full max-w-sm">

          {/* Mobile-only logo (left panel is hidden on mobile) */}
          <div className="lg:hidden flex flex-col items-center mb-8">
            <img src="/microgenesis_logo.png" className="w-36" alt="Microgenesis" />
            <p className="text-sm font-black text-[#1F3864] mt-3">Supply Chain Portal</p>
          </div>

          {/* Heading */}
          <h2 className="text-2xl font-black text-[#1F3864] mb-1 text-center">Welcome back</h2>
          <p className="text-sm text-slate-400 mb-7 text-center">Sign in to access the portal</p>

          {error && (
            <div className="bg-red-50 border border-red-200 text-red-700 text-sm font-semibold rounded-lg px-4 py-3 mb-4" id="login-error">
              {error}
            </div>
          )}

          {/* Microsoft SSO button */}
          <button
            onClick={handleMicrosoftLogin}
            disabled={isLoading}
            className="w-full bg-white hover:bg-slate-50 border border-[#8C8C8C] text-[#2F2F2F] font-semibold text-base py-3.5 rounded-xl flex items-center justify-center gap-3 transition-all cursor-pointer disabled:opacity-60 shadow-sm mb-4"
            id="microsoft-login-btn"
          >
            {ssoLoading ? (
              <Loader2 className="w-6 h-6 animate-spin text-slate-400" />
            ) : (
              <MicrosoftLogo />
            )}
            {ssoLoading ? 'Redirecting to Microsoft…' : 'Sign in with Microsoft'}
          </button>

          {/* Toggle for email login */}
          {!showEmailForm && (
            <button
              onClick={() => setShowEmailForm(true)}
              className="w-full flex items-center justify-center gap-2 text-sm font-bold text-slate-400 hover:text-slate-600 py-2.5 transition-colors cursor-pointer"
            >
              <Mail className="w-4 h-4" />
              Sign in with email instead
              <ChevronDown className="w-4 h-4" />
            </button>
          )}

          {/* Email + password form */}
          {showEmailForm && (
            <form onSubmit={handleSubmit} className="bg-white border border-slate-200 shadow-sm rounded-xl p-7 space-y-5" id="login-form">
              <div className="flex items-center gap-3 mb-1">
                <div className="h-px flex-1 bg-slate-200" />
                <span className="text-xs font-black text-slate-400 uppercase tracking-widest">Email Login</span>
                <div className="h-px flex-1 bg-slate-200" />
              </div>

              <div className="space-y-2">
                <label className="text-sm font-bold text-slate-700">Email</label>
                <input
                  type="email"
                  required
                  autoFocus
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="you@microgenesis.com"
                  className="w-full px-4 py-3 border border-slate-300 rounded-lg text-sm focus:outline-hidden focus:ring-1 focus:ring-[#0078C1]"
                  id="login-email"
                />
              </div>
              <div className="space-y-2">
                <label className="text-sm font-bold text-slate-700">Password</label>
                <input
                  type="password"
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••"
                  className="w-full px-4 py-3 border border-slate-300 rounded-lg text-sm focus:outline-hidden focus:ring-1 focus:ring-[#0078C1]"
                  id="login-password"
                />
              </div>

              <button
                type="submit"
                disabled={isLoading}
                className="w-full bg-[#1F3864] hover:bg-blue-900 disabled:opacity-60 text-white font-bold uppercase tracking-wider text-sm py-3 rounded-lg flex items-center justify-center gap-2 transition-all cursor-pointer"
              >
                {loading ? <Loader2 className="w-5 h-5 animate-spin" /> : <LogIn className="w-5 h-5" />}
                Sign In
              </button>
            </form>
          )}

          {/* Quick Switch — demo accounts (dev only) */}
          {SHOW_DEMO && (
            <div className="mt-5" id="quick-switch-panel">
              <div className="flex items-center gap-3 mb-3">
                <div className="h-px flex-1 bg-slate-200" />
                <span className="text-xs font-black text-slate-400 uppercase tracking-widest">Quick Switch</span>
                <div className="h-px flex-1 bg-slate-200" />
              </div>

              <div className="grid grid-cols-2 gap-2.5">
                {DEMO_ACCOUNTS.map(account => (
                  <button
                    key={account.email}
                    onClick={() => handleQuickLogin(account.email, account.password)}
                    disabled={isLoading}
                    className="bg-white border border-slate-200 rounded-xl p-3.5 text-left flex items-start gap-3 hover:border-[#0078C1] hover:shadow-sm transition-all cursor-pointer disabled:opacity-50 group"
                    title={`Sign in as ${account.name}`}
                  >
                    <div className={`w-9 h-9 rounded-full ${account.avatarBg} flex items-center justify-center text-white text-xs font-black shrink-0`}>
                      {account.initials}
                    </div>
                    <div className="min-w-0">
                      <p className="text-sm font-bold text-slate-800 truncate leading-tight">{account.name}</p>
                      <span className={`inline-block mt-1 px-2 py-0.5 rounded border text-[10px] font-bold tracking-wide ${account.roleBadge}`}>
                        {account.role}
                      </span>
                    </div>
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
