import React from 'react';

/**
 * AppLoader — Minimal full-screen loading overlay.
 *
 * Five thin bars pulse in sequence like a signal being detected.
 * Used as a single continuous loader for both auth and data loading phases.
 */

const BAR_COUNT = 5;
const MAGENTA = '#783264';

interface AppLoaderProps {
  /** When true, fades out over 400ms then calls onFadeComplete */
  fadeOut?: boolean;
  onFadeComplete?: () => void;
}

export const AppLoader: React.FC<AppLoaderProps> = ({ fadeOut = false, onFadeComplete }) => {
  return (
    <div
      className="fixed inset-0 z-[9999] flex flex-col items-center justify-center bg-[#0a0a0a]"
      style={{
        opacity: fadeOut ? 0 : 1,
        transition: 'opacity 400ms ease',
        pointerEvents: fadeOut ? 'none' : 'auto',
      }}
      onTransitionEnd={() => {
        if (fadeOut) onFadeComplete?.();
      }}
    >
      {/* Signal bars */}
      <div className="flex items-end gap-[5px] h-10">
        {Array.from({ length: BAR_COUNT }).map((_, i) => (
          <div
            key={i}
            className="rounded-full"
            style={{
              width: 3,
              backgroundColor: MAGENTA,
              animation: `appLoaderPulse 1.2s ease-in-out ${i * 0.12}s infinite`,
            }}
          />
        ))}
      </div>

      {/* Brand text */}
      <span
        className="mt-5 text-[9px] font-mono tracking-[0.2em] uppercase"
        style={{ color: 'rgba(255,255,255,0.15)' }}
      >
        optimus
      </span>

      <style>{`
        @keyframes appLoaderPulse {
          0%, 100% {
            height: 8px;
            opacity: 0.3;
          }
          50% {
            height: 28px;
            opacity: 1;
          }
        }
      `}</style>
    </div>
  );
};
