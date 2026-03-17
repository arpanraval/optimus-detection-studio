import React from 'react';
import type { OnboardingPhase } from '../types';

interface PlatformFanOutProps {
  platforms: Record<string, number>; // from liveStats.byPlatform
  phase: OnboardingPhase;
}

const PLATFORM_CONFIG: { key: string; label: string; color: string }[] = [
  { key: 'windows', label: 'Windows', color: '#3b82f6' },
  { key: 'linux', label: 'Linux', color: '#f97316' },
  { key: 'cloud', label: 'Cloud', color: '#a855f7' },
  { key: 'network', label: 'Network', color: '#06b6d4' },
  { key: 'macos', label: 'macOS', color: '#6b7280' },
  { key: 'other', label: 'Other', color: '#8b5cf6' },
];

export const PlatformFanOut: React.FC<PlatformFanOutProps> = ({
  platforms,
  phase,
}) => {
  return (
    <div className="grid grid-cols-2 gap-1.5">
      {PLATFORM_CONFIG.map(({ key, label, color }) => {
        const count = platforms[key] ?? 0;
        const isWaiting = count === 0;
        const isComplete = phase === 'complete';

        return (
          <div
            key={key}
            className={`rounded-xl p-2.5 transition-all duration-300 ${
              isWaiting
                ? 'bg-surface-container-low/50 border border-dashed border-outline-variant/15'
                : 'bg-surface-container-lowest border border-solid border-outline-variant/20'
            }`}
            style={{
              borderLeftWidth: 2,
              borderLeftStyle: isWaiting ? 'dashed' : 'solid',
              borderLeftColor: isWaiting ? undefined : color,
            }}
          >
            <div
              className={`text-[11px] font-medium ${
                isWaiting ? 'text-on-surface/30' : 'text-on-surface-variant'
              }`}
            >
              {label}
            </div>
            <div
              className={`font-brand text-lg font-bold transition-all duration-300 ${
                isWaiting
                  ? 'text-on-surface/30'
                  : isComplete
                    ? 'text-on-surface'
                    : 'text-on-surface'
              }`}
            >
              {Intl.NumberFormat('en-US').format(count)}
            </div>
          </div>
        );
      })}
    </div>
  );
};
