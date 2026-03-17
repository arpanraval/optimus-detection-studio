import React, { useEffect, useRef, useState } from 'react';
import type { OnboardingPhase } from '../types';

interface HeroCounterProps {
  value: number;
  phase: OnboardingPhase;
  totalExpected?: number;
}

export const HeroCounter: React.FC<HeroCounterProps> = ({
  value,
  phase,
  totalExpected,
}) => {
  const [displayedValue, setDisplayedValue] = useState(0);
  const [pulseComplete, setPulseComplete] = useState(false);
  const prevValueRef = useRef(0);
  const rafRef = useRef<number>(undefined);

  // Animated count-up with ease-out
  useEffect(() => {
    const startValue = prevValueRef.current;
    const endValue = value;
    if (startValue === endValue) return;

    const duration = 600; // ms
    const startTime = performance.now();

    const animate = (now: number) => {
      const elapsed = now - startTime;
      const progress = Math.min(elapsed / duration, 1);
      // Ease-out: 1 - (1 - t)^3
      const eased = 1 - Math.pow(1 - progress, 3);
      const current = Math.round(startValue + (endValue - startValue) * eased);

      setDisplayedValue(current);

      if (progress < 1) {
        rafRef.current = requestAnimationFrame(animate);
      } else {
        prevValueRef.current = endValue;
      }
    };

    rafRef.current = requestAnimationFrame(animate);
    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
    };
  }, [value]);

  // Pulse on complete
  useEffect(() => {
    if (phase === 'complete') {
      setPulseComplete(true);
      const timer = setTimeout(() => setPulseComplete(false), 300);
      return () => clearTimeout(timer);
    }
  }, [phase]);

  const progressPercent =
    totalExpected && totalExpected > 0
      ? Math.min((value / totalExpected) * 100, 100)
      : 0;

  const formatted = Intl.NumberFormat('en-US').format(displayedValue);

  return (
    <div className="flex flex-col gap-2">
      {/* Label row */}
      <div className="flex items-center justify-between">
        <span className="font-brand text-[11px] tracking-widest uppercase text-on-surface-variant">
          Optimus Library
        </span>

        {/* Live / Complete indicator */}
        {phase === 'processing' ? (
          <span className="flex items-center gap-1.5">
            <span className="h-1.5 w-1.5 rounded-full bg-secondary animate-pulse" />
            <span className="text-[11px] font-medium text-secondary">Live</span>
          </span>
        ) : phase === 'complete' ? (
          <span className="flex items-center gap-1.5">
            <svg
              className="h-3.5 w-3.5 text-secondary"
              viewBox="0 0 20 20"
              fill="currentColor"
            >
              <path
                fillRule="evenodd"
                d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z"
                clipRule="evenodd"
              />
            </svg>
            <span className="text-[11px] font-medium text-secondary">
              Complete
            </span>
          </span>
        ) : null}
      </div>

      {/* Big number */}
      <div
        className={`font-brand text-3xl font-bold text-on-surface transition-transform duration-300 ${
          pulseComplete ? 'scale-[1.03]' : 'scale-100'
        }`}
      >
        {formatted}
      </div>

      {/* Progress bar */}
      {totalExpected != null && totalExpected > 0 && (
        <div className="h-1 w-full rounded-full bg-primary/15">
          <div
            className="h-full rounded-full bg-primary transition-all duration-500 ease-out"
            style={{ width: `${progressPercent}%` }}
          />
        </div>
      )}
    </div>
  );
};
