/**
 * AuthModal — sign-in / sign-up dialog.
 *
 * Tabs: Sign In | Create Account
 * Auth method: email + password
 * Auth is optional — the modal is only shown when the user clicks "Sign in".
 */

import { useState } from 'react';
import { X, Sparkles, Loader2, AlertCircle, CheckCircle } from 'lucide-react';
import { useAuthStore } from '../../store/authStore';

interface AuthModalProps {
  onClose: () => void;
  /** Open on the signup tab by default. */
  defaultTab?: 'signin' | 'signup';
}

type Tab = 'signin' | 'signup';

export function AuthModal({ onClose, defaultTab = 'signin' }: AuthModalProps) {
  const [tab, setTab]               = useState<Tab>(defaultTab);
  const [email, setEmail]           = useState('');
  const [password, setPassword]     = useState('');
  const [displayName, setDisplayName] = useState('');
  const [loading, setLoading]       = useState(false);
  const [error, setError]           = useState<string | null>(null);
  const [success, setSuccess]       = useState<string | null>(null);

  const { signIn, signUp } = useAuthStore();

  const reset = () => {
    setError(null);
    setSuccess(null);
  };

  const switchTab = (t: Tab) => {
    setTab(t);
    reset();
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (loading) return;
    reset();
    setLoading(true);

    let err: string | null;
    if (tab === 'signin') {
      err = await signIn(email.trim(), password);
      if (!err) {
        onClose();
        return;
      }
    } else {
      if (!displayName.trim()) {
        setError('Please enter a display name.');
        setLoading(false);
        return;
      }
      err = await signUp(email.trim(), password, displayName.trim());
      if (!err) {
        setSuccess('Account created! Check your email to confirm, then sign in.');
        setLoading(false);
        return;
      }
    }

    setError(err);
    setLoading(false);
  };

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 z-40 bg-black/40 backdrop-blur-sm"
        onClick={onClose}
      />

      {/* Dialog */}
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
        <div className="relative w-full max-w-sm bg-white rounded-2xl shadow-2xl overflow-hidden">

          {/* Header */}
          <div
            className="px-6 pt-6 pb-5"
            style={{ background: 'linear-gradient(135deg, #7c3aed18, #0d948818)' }}
          >
            <div className="flex items-center gap-2 mb-1">
              <Sparkles size={18} className="text-violet-500" />
              <span className="font-bold text-slate-800 text-lg">Wizards Playground</span>
            </div>
            <p className="text-xs text-slate-500">
              {tab === 'signin'
                ? 'Sign in to access cloud backup and sync.'
                : 'Create a free account to backup your work.'}
            </p>
          </div>

          {/* Close button */}
          <button
            onClick={onClose}
            className="absolute top-4 right-4 flex items-center justify-center w-7 h-7 rounded-full text-slate-400 hover:text-slate-600 hover:bg-slate-100 transition-all"
          >
            <X size={15} />
          </button>

          {/* Tab switcher */}
          <div className="flex bg-slate-100 rounded-lg mx-5 mt-4 p-0.5">
            {(['signin', 'signup'] as const).map((t) => (
              <button
                key={t}
                onClick={() => switchTab(t)}
                className={`flex-1 py-2 text-xs font-semibold rounded-md transition-all ${
                  tab === t
                    ? 'bg-white text-slate-800 shadow-sm'
                    : 'text-slate-400 hover:text-slate-500'
                }`}
              >
                {t === 'signin' ? 'Sign In' : 'Create Account'}
              </button>
            ))}
          </div>

          {/* Form */}
          <form onSubmit={handleSubmit} className="px-5 pt-4 pb-6 space-y-3">

            {tab === 'signup' && (
              <div>
                <label className="block text-xs font-medium text-slate-600 mb-1">
                  Display name
                </label>
                <input
                  type="text"
                  value={displayName}
                  onChange={(e) => setDisplayName(e.target.value)}
                  placeholder="Your pen name or real name"
                  autoComplete="name"
                  className="w-full px-3 py-2.5 text-sm border border-slate-200 rounded-lg outline-none focus:border-violet-400 focus:ring-2 focus:ring-violet-100 transition-all"
                />
              </div>
            )}

            <div>
              <label className="block text-xs font-medium text-slate-600 mb-1">
                Email
              </label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@example.com"
                required
                autoComplete="email"
                className="w-full px-3 py-2.5 text-sm border border-slate-200 rounded-lg outline-none focus:border-violet-400 focus:ring-2 focus:ring-violet-100 transition-all"
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-600 mb-1">
                Password
              </label>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder={tab === 'signup' ? 'At least 8 characters' : ''}
                required
                minLength={tab === 'signup' ? 8 : undefined}
                autoComplete={tab === 'signin' ? 'current-password' : 'new-password'}
                className="w-full px-3 py-2.5 text-sm border border-slate-200 rounded-lg outline-none focus:border-violet-400 focus:ring-2 focus:ring-violet-100 transition-all"
              />
            </div>

            {/* Error */}
            {error && (
              <div className="flex items-start gap-2 p-3 bg-red-50 border border-red-200 rounded-lg">
                <AlertCircle size={14} className="text-red-500 mt-0.5 shrink-0" />
                <p className="text-xs text-red-600">{error}</p>
              </div>
            )}

            {/* Success */}
            {success && (
              <div className="flex items-start gap-2 p-3 bg-teal-50 border border-teal-200 rounded-lg">
                <CheckCircle size={14} className="text-teal-500 mt-0.5 shrink-0" />
                <p className="text-xs text-teal-700">{success}</p>
              </div>
            )}

            <button
              type="submit"
              disabled={loading || !!success}
              className="w-full py-2.5 text-sm font-semibold text-white rounded-lg transition-all disabled:opacity-60"
              style={{ background: 'linear-gradient(135deg, #7c3aed, #0d9488)' }}
            >
              {loading
                ? <span className="flex items-center justify-center gap-2">
                    <Loader2 size={14} className="animate-spin" />
                    {tab === 'signin' ? 'Signing in…' : 'Creating account…'}
                  </span>
                : tab === 'signin' ? 'Sign In' : 'Create Account'}
            </button>

            <p className="text-center text-[11px] text-slate-400">
              {tab === 'signin' ? (
                <>No account?{' '}
                  <button type="button" onClick={() => switchTab('signup')}
                    className="text-violet-500 hover:underline font-medium">
                    Create one free
                  </button>
                </>
              ) : (
                <>Already have one?{' '}
                  <button type="button" onClick={() => switchTab('signin')}
                    className="text-violet-500 hover:underline font-medium">
                    Sign in
                  </button>
                </>
              )}
            </p>
          </form>
        </div>
      </div>
    </>
  );
}
