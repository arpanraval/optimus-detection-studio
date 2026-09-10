import React, { useRef, useEffect, useState, useCallback } from 'react';
import { Icon } from './Icon';

export interface MfaChallengeFormProps {
  onVerify: (code: string) => Promise<void>;
  error?: string;
  isVerifying?: boolean;
  title?: string;
  subtitle?: string;
}

const DIGIT_COUNT = 6;

export function MfaChallengeForm({
  onVerify,
  error,
  isVerifying = false,
  title = 'Two-Factor Authentication',
  subtitle = 'Enter the 6-digit code from your authenticator app.',
}: MfaChallengeFormProps) {
  const [digits, setDigits] = useState<string[]>(Array(DIGIT_COUNT).fill(''));
  const inputRefs = useRef<Array<HTMLInputElement | null>>(Array(DIGIT_COUNT).fill(null));
  const submitAttemptedRef = useRef(false);

  // Auto-focus the first input on mount
  useEffect(() => {
    inputRefs.current[0]?.focus();
  }, []);

  // Drive auto-submit reactively whenever digits change
  useEffect(() => {
    const code = digits.join('');
    if (code.length === DIGIT_COUNT && !submitAttemptedRef.current) {
      submitAttemptedRef.current = true;
      onVerify(code).finally(() => {
        submitAttemptedRef.current = false;
      });
    }
  }, [digits, onVerify]);

  const handleChange = useCallback(
    (index: number, value: string) => {
      // Only accept a single numeric digit
      const digit = value.replace(/\D/g, '').slice(-1);
      setDigits((prev) => {
        const next = [...prev];
        next[index] = digit;
        return next;
      });
      if (digit) {
        // Advance focus to next input
        inputRefs.current[index + 1]?.focus();
      }
    },
    [],
  );

  const handleKeyDown = useCallback(
    (index: number, e: React.KeyboardEvent<HTMLInputElement>) => {
      if (e.key === 'Backspace') {
        if (digits[index] === '') {
          // Move focus to previous input
          inputRefs.current[index - 1]?.focus();
        } else {
          setDigits((prev) => {
            const next = [...prev];
            next[index] = '';
            return next;
          });
        }
      } else if (e.key === 'ArrowLeft') {
        inputRefs.current[index - 1]?.focus();
      } else if (e.key === 'ArrowRight') {
        inputRefs.current[index + 1]?.focus();
      }
    },
    [digits],
  );

  const handlePaste = useCallback(
    (e: React.ClipboardEvent<HTMLInputElement>) => {
      e.preventDefault();
      const pasted = e.clipboardData.getData('text').replace(/\D/g, '').slice(0, DIGIT_COUNT);
      if (!pasted) return;

      const next = Array(DIGIT_COUNT).fill('') as string[];
      for (let i = 0; i < pasted.length; i++) {
        next[i] = pasted[i];
      }
      setDigits(next);

      // Focus the input after the last pasted digit, or the last input
      const focusIndex = Math.min(pasted.length, DIGIT_COUNT - 1);
      inputRefs.current[focusIndex]?.focus();
      // auto-submit is driven by the digits useEffect
    },
    [],
  );

  const handleSubmit = useCallback(
    (e: React.FormEvent) => {
      e.preventDefault();
      const code = digits.join('');
      if (code.length === DIGIT_COUNT && !isVerifying) {
        onVerify(code);
      }
    },
    [digits, isVerifying, onVerify],
  );

  const allFilled = digits.every((d) => d !== '');

  return (
    <div className="flex flex-col items-center gap-6 w-full">
      {/* Header */}
      <div className="flex flex-col items-center gap-1 text-center">
        <h2 className="text-xl font-semibold text-on-surface">{title}</h2>
        {subtitle && (
          <p className="text-sm text-on-surface/60">{subtitle}</p>
        )}
      </div>

      <form onSubmit={handleSubmit} className="flex flex-col items-center gap-5 w-full">
        {/* Digit inputs */}
        <div className="flex items-center gap-2" role="group" aria-label="One-time passcode">
          {digits.map((digit, index) => (
            <input
              key={index}
              ref={(el) => { inputRefs.current[index] = el; }}
              type="text"
              inputMode="numeric"
              autoComplete={index === 0 ? 'one-time-code' : 'off'}
              maxLength={1}
              value={digit}
              aria-label={`Digit ${index + 1} of ${DIGIT_COUNT}`}
              className={[
                'w-11 h-13 text-center text-lg font-mono font-semibold',
                'bg-surface-container-highest border rounded-xl',
                'text-on-surface caret-transparent',
                'focus:outline-none focus:ring-2',
                'transition-colors duration-150',
                error
                  ? 'border-error/60 focus:ring-error/40'
                  : 'border-outline-variant/10 focus:ring-[#783264]/40 focus:border-[#783264]/60',
              ].join(' ')}
              onChange={(e) => handleChange(index, e.target.value)}
              onKeyDown={(e) => handleKeyDown(index, e)}
              onPaste={handlePaste}
              onFocus={(e) => e.target.select()}
              disabled={isVerifying}
            />
          ))}
        </div>

        {/* Error message */}
        {error && (
          <p role="alert" className="flex items-center gap-1.5 text-sm text-error">
            <Icon name="alert-circle" className="w-4 h-4 shrink-0" />
            {error}
          </p>
        )}

        {/* Verify button */}
        <button
          type="submit"
          disabled={!allFilled || isVerifying}
          style={{ backgroundColor: '#783264' }}
          className={[
            'flex items-center justify-center gap-2 w-full max-w-xs',
            'px-6 py-2.5 rounded-xl text-white text-sm font-semibold',
            'transition-opacity duration-150',
            !allFilled || isVerifying ? 'opacity-50 cursor-not-allowed' : 'hover:opacity-90',
          ].join(' ')}
        >
          {isVerifying ? (
            <>
              <Icon name="loader" className="w-4 h-4 animate-spin" />
              Verifying…
            </>
          ) : (
            'Verify'
          )}
        </button>
      </form>
    </div>
  );
}
