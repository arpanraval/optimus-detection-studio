import React, { useState, useEffect, useCallback, useRef } from 'react';
import { supabase } from '../lib/supabaseClient';
import { Icon } from './Icon';
import { MfaChallengeForm } from './MfaChallengeForm';

// ============================================================================
// MFA Enrollment Wizard — 3-step TOTP enrollment modal
// ============================================================================

interface MfaEnrollmentWizardProps {
  isOpen: boolean;
  onClose: () => void;
  onEnrolled: () => void;
}

type Step = 'qr' | 'verify' | 'done';

const ACCENT = '#783264';

const STEP_META: { key: Step; label: string }[] = [
  { key: 'qr', label: 'Scan' },
  { key: 'verify', label: 'Verify' },
  { key: 'done', label: 'Done' },
];

export function MfaEnrollmentWizard({ isOpen, onClose, onEnrolled }: MfaEnrollmentWizardProps) {
  const [step, setStep] = useState<Step>('qr');
  const [factorId, setFactorId] = useState<string | null>(null);
  const [qrCode, setQrCode] = useState<string>('');
  const [secret, setSecret] = useState<string>('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [verifyError, setVerifyError] = useState('');
  const [isVerifying, setIsVerifying] = useState(false);
  const enrolledRef = useRef(false);

  // ── Enrollment setup ──────────────────────────────────────────────────
  const initEnrollment = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      // 1. Clean up orphan unverified factors (unverified only appear in `all`)
      const { data: factorsData } = await supabase.auth.mfa.listFactors();
      if (factorsData) {
        const unverified = factorsData.all.filter(
          (f) => f.factor_type === 'totp' && f.status === 'unverified',
        );
        for (const f of unverified) {
          await supabase.auth.mfa.unenroll({ factorId: f.id });
        }
      }

      // 2. Enroll new TOTP factor
      const { data, error: enrollError } = await supabase.auth.mfa.enroll({
        factorType: 'totp',
        friendlyName: 'Authenticator App',
      });

      if (enrollError) throw enrollError;
      if (!data || data.type !== 'totp') throw new Error('Unexpected enrollment response');

      setFactorId(data.id);
      setQrCode(data.totp.qr_code);
      setSecret(data.totp.secret);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to start MFA enrollment.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (isOpen) {
      enrolledRef.current = false;
      setStep('qr');
      initEnrollment();
    }
  }, [isOpen, initEnrollment]);

  // ── Cancel / cleanup ──────────────────────────────────────────────────
  const cleanup = useCallback(async () => {
    if (factorId && !enrolledRef.current) {
      await supabase.auth.mfa.unenroll({ factorId });
    }
  }, [factorId]);

  const handleClose = useCallback(async () => {
    await cleanup();
    onClose();
  }, [cleanup, onClose]);

  const handleBackdropClick = useCallback(
    (e: React.MouseEvent<HTMLDivElement>) => {
      if (e.target === e.currentTarget) {
        handleClose();
      }
    },
    [handleClose],
  );

  // ── Verify ────────────────────────────────────────────────────────────
  const handleVerify = useCallback(
    async (code: string) => {
      if (!factorId) return;
      setIsVerifying(true);
      setVerifyError('');
      try {
        const { error: verifyErr } = await supabase.auth.mfa.challengeAndVerify({
          factorId,
          code,
        });
        if (verifyErr) throw verifyErr;
        enrolledRef.current = true;
        setStep('done');
      } catch (err: unknown) {
        setVerifyError(err instanceof Error ? err.message : 'Verification failed. Please try again.');
      } finally {
        setIsVerifying(false);
      }
    },
    [factorId],
  );

  // ── Done ──────────────────────────────────────────────────────────────
  const handleDone = useCallback(() => {
    onEnrolled();
  }, [onEnrolled]);

  // ── Escape key ────────────────────────────────────────────────────────
  useEffect(() => {
    if (!isOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') handleClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [isOpen, handleClose]);

  if (!isOpen) return null;

  // ── Step indicator helpers ────────────────────────────────────────────
  const stepIndex = STEP_META.findIndex((s) => s.key === step);

  function stepCircleClass(i: number) {
    if (i < stepIndex) return 'bg-emerald-500/20 text-emerald-400';
    if (i === stepIndex) return `bg-[${ACCENT}]/20 text-[${ACCENT}]`;
    return 'bg-surface-container-highest text-on-surface-variant/30';
  }

  function lineClass(i: number) {
    return i < stepIndex ? 'bg-emerald-500/40' : 'bg-surface-container-highest';
  }

  // ── Render ────────────────────────────────────────────────────────────
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm"
      onClick={handleBackdropClick}
    >
      <div className="w-full max-w-md rounded-2xl border border-outline-variant/10 bg-surface-container shadow-xl relative overflow-hidden">
        {/* Accent gradient line */}
        <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-[#783264] via-[#005091] to-[#783264]" />

        {/* Header */}
        <div className="flex items-center justify-between px-8 pt-7 pb-0">
          <h2 className="text-lg font-bold text-on-surface">Set Up Two-Factor Authentication</h2>
          <button
            type="button"
            onClick={handleClose}
            className="text-on-surface-variant/40 hover:text-on-surface-variant/70 transition-colors"
          >
            <Icon name="x" className="w-5 h-5" />
          </button>
        </div>

        {/* Step indicators */}
        <div className="flex items-center justify-center gap-0 px-8 pt-6 pb-2">
          {STEP_META.map((s, i) => (
            <React.Fragment key={s.key}>
              <div className="flex flex-col items-center gap-1.5">
                <div
                  className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold transition-colors ${stepCircleClass(i)}`}
                >
                  {i < stepIndex ? (
                    <span className="text-sm">&#10003;</span>
                  ) : (
                    i + 1
                  )}
                </div>
                <span className={`text-[10px] font-medium ${i <= stepIndex ? 'text-on-surface-variant/70' : 'text-on-surface-variant/30'}`}>
                  {s.label}
                </span>
              </div>
              {i < STEP_META.length - 1 && (
                <div className={`flex-1 h-px mx-2 mb-5 ${lineClass(i)}`} />
              )}
            </React.Fragment>
          ))}
        </div>

        {/* Content area */}
        <div className="px-8 pb-8 pt-4">
          {/* Loading state */}
          {loading && (
            <div className="flex flex-col items-center gap-4 py-12">
              <Icon name="loader-2" className="w-8 h-8 animate-spin text-on-surface-variant/40" />
              <p className="text-sm text-on-surface-variant/50">Setting up enrollment...</p>
            </div>
          )}

          {/* Enrollment error */}
          {!loading && error && (
            <div className="flex flex-col items-center gap-4 py-8">
              <div className="p-3 rounded-lg bg-red-500/10 border border-red-500/20 text-red-400 text-sm w-full text-center">
                {error}
              </div>
              <button
                type="button"
                onClick={initEnrollment}
                className="text-sm text-on-surface-variant/60 hover:text-on-surface-variant transition-colors"
              >
                Try again
              </button>
            </div>
          )}

          {/* ── Step 1: QR Code ──────────────────────────────────── */}
          {!loading && !error && step === 'qr' && (
            <div className="flex flex-col items-center gap-5">
              <p className="text-sm text-on-surface-variant/60 text-center leading-relaxed">
                Scan this QR code with your authenticator app (Google Authenticator, Authy, 1Password, etc.)
              </p>

              {/* QR code container */}
              <div className="bg-white rounded-xl p-4 shadow-sm">
                <img
                  src={qrCode}
                  alt="MFA QR Code"
                  className="w-48 h-48"
                  draggable={false}
                />
              </div>

              {/* Manual entry */}
              <details className="w-full group">
                <summary className="text-xs text-on-surface-variant/40 hover:text-on-surface-variant/60 transition-colors cursor-pointer text-center">
                  Can't scan? Enter key manually
                </summary>
                <div className="mt-3 p-3 rounded-lg bg-surface-container-highest/50 border border-outline-variant/10">
                  <p className="text-[10px] text-on-surface-variant/40 mb-1.5">Secret key</p>
                  <code className="text-xs font-mono text-on-surface break-all select-all leading-relaxed">
                    {secret}
                  </code>
                </div>
              </details>

              {/* Next button */}
              <button
                type="button"
                onClick={() => setStep('verify')}
                className="w-full py-3 rounded-xl text-white text-sm font-semibold transition-all duration-200 hover:brightness-110 active:scale-[0.98] flex items-center justify-center gap-2"
                style={{ backgroundColor: ACCENT }}
              >
                <span>Next</span>
                <Icon name="arrowRight" className="w-4 h-4" />
              </button>
            </div>
          )}

          {/* ── Step 2: Verify ───────────────────────────────────── */}
          {!loading && !error && step === 'verify' && (
            <div className="flex flex-col items-center gap-4">
              <MfaChallengeForm
                onVerify={handleVerify}
                error={verifyError}
                isVerifying={isVerifying}
                title="Verify Your Code"
                subtitle="Enter the 6-digit code from your authenticator app to confirm setup."
              />

              <button
                type="button"
                onClick={() => setStep('qr')}
                className="text-xs text-on-surface-variant/40 hover:text-on-surface-variant/60 transition-colors mt-1"
              >
                &larr; Back to QR code
              </button>
            </div>
          )}

          {/* ── Step 3: Done ─────────────────────────────────────── */}
          {!loading && !error && step === 'done' && (
            <div className="flex flex-col items-center gap-5 py-4">
              <div className="w-16 h-16 rounded-full bg-emerald-500/15 flex items-center justify-center">
                <Icon name="shield-check" className="w-8 h-8 text-emerald-400" />
              </div>

              <div className="text-center">
                <h3 className="text-xl font-bold text-on-surface mb-2">2FA Enabled!</h3>
                <p className="text-sm text-on-surface-variant/60 leading-relaxed max-w-xs">
                  Your account is now protected with two-factor authentication. If you lose access to your authenticator app, contact your admin for recovery.
                </p>
              </div>

              <button
                type="button"
                onClick={handleDone}
                className="w-full py-3 rounded-xl text-white text-sm font-semibold transition-all duration-200 hover:brightness-110 active:scale-[0.98] flex items-center justify-center gap-2"
                style={{ backgroundColor: ACCENT }}
              >
                Done
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
