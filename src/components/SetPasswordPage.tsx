import React, { useState } from 'react';
import { supabase } from '../lib/supabaseClient';
import { Icon } from './Icon';
import { MfaEnrollmentWizard } from './MfaEnrollmentWizard';
import { useTheme } from '../context/ThemeContext';

// ============================================================================
// Password requirements
// ============================================================================

const REQUIREMENTS = [
  { test: (p: string) => p.length >= 12, label: 'At least 12 characters' },
  { test: (p: string) => /[A-Z]/.test(p), label: 'One uppercase letter' },
  { test: (p: string) => /[a-z]/.test(p), label: 'One lowercase letter' },
  { test: (p: string) => /[0-9]/.test(p), label: 'One number' },
];

const ACCENT = '#783264';

// ============================================================================
// SET PASSWORD PAGE — shown after invite link or password recovery
// ============================================================================

interface SetPasswordPageProps {
  /** 'invite' for new user setup, 'recovery' for password reset */
  mode: 'invite' | 'recovery';
  /** User's email for display */
  email?: string;
  /** Called after password is successfully set */
  onComplete: () => void;
  /** User ID from session (passed by AppRouter) */
  userId?: string;
}

export const SetPasswordPage: React.FC<SetPasswordPageProps> = ({ mode, email, onComplete, userId }) => {
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [displayName, setDisplayName] = useState(() => {
    if (email) return email.split('@')[0];
    return '';
  });
  const [step, setStep] = useState<'form' | 'mfa-prompt' | 'mfa-enroll'>('form');

  const { theme } = useTheme();
  const isDark = theme === 'dark';

  const allValid = REQUIREMENTS.every(r => r.test(password));
  const passwordsMatch = password === confirmPassword && confirmPassword.length > 0;
  const canSubmit = allValid && passwordsMatch && !isSubmitting;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    if (!allValid) {
      setError('Password does not meet all requirements.');
      return;
    }
    if (!passwordsMatch) {
      setError('Passwords do not match.');
      return;
    }

    setIsSubmitting(true);
    try {
      const { error: updateError } = await supabase.auth.updateUser({ password });

      if (updateError) {
        // Check for expired token / session errors
        const msg = updateError.message?.toLowerCase() || '';
        const status = (updateError as { status?: number }).status;
        if (msg.includes('session') || msg.includes('jwt') || status === 401) {
          setError('Your invite link has expired. Please request a new invitation from your admin.');
          return;
        }
        throw updateError;
      }

      // Clear the pending action flag
      sessionStorage.removeItem('ds_pending_auth_action');

      if (mode === 'invite') {
        // Update profile with password_set flag and display name
        if (userId) {
          await supabase
            .from('profiles')
            .update({
              password_set: true,
              full_name: displayName.trim() || null,
            })
            .eq('id', userId);
        }
        setStep('mfa-prompt');
      } else {
        onComplete();
      }
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to set password. Please try again.');
    } finally {
      setIsSubmitting(false);
    }
  };

  // Styling tokens
  const headingColor = isDark ? 'text-white' : 'text-on-surface';
  const subtextColor = isDark ? 'text-white/50' : 'text-on-surface-variant/60';
  const pageBg = isDark ? 'bg-[#0a0a0a]' : 'bg-background';
  const cardBg = isDark ? 'bg-white/[0.03]' : 'bg-surface-container-low';
  const cardBorder = isDark ? 'border-white/10' : 'border-outline-variant/20';
  const inputBase = isDark
    ? 'bg-white/5 text-white placeholder-white/25 border-white/10 focus:border-[#783264]/50 focus:bg-white/8'
    : 'bg-surface-container-highest/50 text-on-surface placeholder-on-surface-variant/30 border-outline-variant/15 focus:border-[#783264]/40';
  const eyeClass = isDark ? 'text-white/20 hover:text-white/40' : 'text-on-surface-variant/25 hover:text-on-surface-variant/50';
  const btnShadow = `0 8px 20px -5px ${ACCENT}50`;

  const title = mode === 'invite' ? 'Set Your Password' : 'Reset Your Password';
  const subtitle = mode === 'invite'
    ? 'Welcome to Detection Studio! Set your name and password to get started.'
    : 'Enter a new password for your account.';

  return (
    <div className={`min-h-screen flex items-center justify-center p-6 ${pageBg}`}>
      {step === 'form' && (
        <div className={`w-full max-w-md rounded-2xl border ${cardBorder} ${cardBg} p-10 shadow-sm relative overflow-hidden`}>
          {/* Accent line */}
          <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-[#783264] via-[#005091] to-[#783264]" />

          {/* Logo */}
          <div className="flex items-center gap-2.5 mb-8 pt-2">
            <div style={{ '--md-sys-color-primary': '120 50 100', '--md-sys-color-tertiary': '0 80 145' } as React.CSSProperties}>
              <Icon name="optimus-logo" className="w-7 h-7" />
            </div>
            <span className={`font-brand font-bold text-xs tracking-widest ${headingColor}`}>OPTIMUS</span>
          </div>

          <div className="mb-8">
            <h2 className={`text-2xl font-bold mb-2 ${headingColor}`}>{title}</h2>
            <p className={`text-sm leading-relaxed ${subtextColor}`}>{subtitle}</p>
          </div>

          {error && (
            <div className="mb-5 p-3 rounded-lg bg-red-500/10 border border-red-500/20 text-red-400 text-sm">
              {error}
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-5">
            {/* Display Name (invite mode only) */}
            {mode === 'invite' && (
              <div className="space-y-1.5">
                <label className={`text-xs font-medium ${isDark ? 'text-white/40' : 'text-on-surface-variant/50'}`}>
                  Your Name
                </label>
                <input
                  type="text"
                  value={displayName}
                  onChange={(e) => setDisplayName(e.target.value)}
                  placeholder="How should we address you?"
                  className={`w-full rounded-xl px-4 py-3 text-sm outline-none transition-all duration-300 border ${inputBase}`}
                  autoFocus
                />
              </div>
            )}

            {/* Password */}
            <div className="space-y-1.5">
              <label className={`text-xs font-medium ${isDark ? 'text-white/40' : 'text-on-surface-variant/50'}`}>
                Password
              </label>
              <div className="relative">
                <input
                  type={showPassword ? 'text' : 'password'}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="Minimum 12 characters"
                  className={`w-full rounded-xl px-4 py-3 text-sm outline-none transition-all duration-300 border ${inputBase}`}
                  autoFocus={mode === 'recovery'}
                  required
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className={`absolute right-3 top-1/2 -translate-y-1/2 transition-colors ${eyeClass}`}
                >
                  <Icon name={showPassword ? 'eye-off' : 'eye'} className="w-4 h-4" />
                </button>
              </div>
            </div>

            {/* Confirm Password */}
            <div className="space-y-1.5">
              <label className={`text-xs font-medium ${isDark ? 'text-white/40' : 'text-on-surface-variant/50'}`}>
                Confirm Password
              </label>
              <input
                type={showPassword ? 'text' : 'password'}
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                placeholder="Re-enter password"
                className={`w-full rounded-xl px-4 py-3 text-sm outline-none transition-all duration-300 border ${inputBase}`}
                required
              />
              {confirmPassword.length > 0 && !passwordsMatch && (
                <p className="text-xs text-red-400 mt-1">Passwords do not match</p>
              )}
            </div>

            {/* Requirements checklist */}
            <div className={`rounded-lg p-3 ${isDark ? 'bg-white/[0.03]' : 'bg-surface-container-highest/30'}`}>
              <p className={`text-xs font-medium mb-2 ${isDark ? 'text-white/30' : 'text-on-surface-variant/40'}`}>
                Password requirements
              </p>
              <div className="grid grid-cols-2 gap-1.5">
                {REQUIREMENTS.map((req, i) => {
                  const met = req.test(password);
                  return (
                    <div key={i} className="flex items-center gap-1.5">
                      <div className={`w-3.5 h-3.5 rounded-full flex items-center justify-center text-[8px] transition-colors ${
                        met
                          ? 'bg-emerald-500/20 text-emerald-400'
                          : isDark ? 'bg-white/5 text-white/20' : 'bg-gray-100 text-gray-300'
                      }`}>
                        {met ? '✓' : '·'}
                      </div>
                      <span className={`text-[11px] ${met ? (isDark ? 'text-white/60' : 'text-on-surface-variant/70') : (isDark ? 'text-white/25' : 'text-on-surface-variant/35')}`}>
                        {req.label}
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Submit */}
            <button
              type="submit"
              disabled={!canSubmit}
              className="w-full py-3.5 rounded-xl text-white text-sm font-brand font-bold transition-all duration-200 hover:brightness-110 active:scale-[0.98] disabled:opacity-40 disabled:cursor-not-allowed flex items-center justify-center gap-2.5 relative overflow-hidden group/btn"
              style={{ backgroundColor: ACCENT, boxShadow: canSubmit ? btnShadow : 'none' }}
            >
              {isSubmitting ? (
                <Icon name="spinner" className="w-5 h-5 animate-spin" />
              ) : (
                <>
                  <span>{mode === 'invite' ? 'SET PASSWORD & CONTINUE' : 'UPDATE PASSWORD'}</span>
                  <Icon name="arrowRight" className="w-4 h-4 group-hover/btn:translate-x-0.5 transition-transform" />
                </>
              )}
            </button>
          </form>

          {mode === 'invite' && (
            <p className={`text-center text-[11px] mt-5 ${isDark ? 'text-white/20' : 'text-on-surface-variant/30'}`}>
              You must set a password to access your account after signing out.
            </p>
          )}

          {/* Sign out escape hatch */}
          <button
            type="button"
            onClick={async () => { await supabase.auth.signOut(); }}
            className={`w-full text-center text-xs mt-4 ${isDark ? 'text-white/25 hover:text-white/40' : 'text-on-surface-variant/30 hover:text-on-surface-variant/50'} transition-colors`}
          >
            Sign out and return to login
          </button>
        </div>
      )}

      {step === 'mfa-prompt' && (
        <div className={`w-full max-w-md rounded-2xl border ${cardBorder} ${cardBg} p-10 shadow-sm relative overflow-hidden text-center`}>
          {/* Accent line */}
          <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-[#783264] via-[#005091] to-[#783264]" />

          {/* Shield icon */}
          <div className="flex justify-center mb-6 pt-2">
            <div className="w-16 h-16 rounded-full bg-emerald-500/15 flex items-center justify-center">
              <Icon name="shield-check" className="w-8 h-8 text-emerald-400" />
            </div>
          </div>

          <h2 className={`text-2xl font-bold mb-2 ${headingColor}`}>Account Secured!</h2>
          <p className={`text-sm leading-relaxed mb-8 ${subtextColor}`}>
            Your password has been set. You're ready to start using Detection Studio.
          </p>

          <button
            type="button"
            onClick={() => setStep('mfa-enroll')}
            className="w-full py-3.5 rounded-xl text-white text-sm font-brand font-bold transition-all duration-200 hover:brightness-110 active:scale-[0.98] flex items-center justify-center gap-2.5"
            style={{ backgroundColor: ACCENT, boxShadow: btnShadow }}
          >
            <Icon name="shield-check" className="w-4 h-4" />
            <span>Enable 2FA Now</span>
          </button>

          <button
            type="button"
            onClick={() => onComplete()}
            className={`w-full text-center text-xs mt-4 ${isDark ? 'text-white/25 hover:text-white/40' : 'text-on-surface-variant/30 hover:text-on-surface-variant/50'} transition-colors`}
          >
            I'll do this later from Settings
          </button>
        </div>
      )}

      {step === 'mfa-enroll' && (
        <MfaEnrollmentWizard
          isOpen={true}
          onClose={() => setStep('mfa-prompt')}
          onEnrolled={onComplete}
        />
      )}
    </div>
  );
};
