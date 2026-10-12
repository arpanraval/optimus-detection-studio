import React from 'react';
import type { SiemReadiness } from '../../../hooks/useProfileIntelligence';

interface SiemReadinessBarProps {
  readiness: SiemReadiness[];
  totalMatched: number;
  loading: boolean;
}

function LoadingSkeleton(): React.ReactElement {
  return (
    <div className="rounded-2xl p-5 h-full" style={{ backgroundColor: 'rgb(var(--md-sys-color-surface-container-high))' }}>
      <div className="h-3 w-32 bg-surface-container rounded animate-pulse mb-5" />
      <div className="space-y-5">
        {Array.from({ length: 2 }).map((_, i) => (
          <div key={i} className="space-y-2">
            <div className="h-4 w-28 bg-surface-container/50 rounded loading-placeholder" />
            <div className="h-2.5 w-full bg-surface-container/50 rounded animate-pulse" />
          </div>
        ))}
      </div>
    </div>
  );
}

function EmptyState(): React.ReactElement {
  return (
    <div className="rounded-2xl p-5 h-full" style={{ backgroundColor: 'rgb(var(--md-sys-color-surface-container-high))' }}>
      <h3 className="text-[10px] font-brand font-bold text-on-surface tracking-[0.2em] uppercase mb-3">SIEM Readiness</h3>
      <p className="text-[12px] text-outline">
        Add SIEM platforms in your profile to see detection readiness.
      </p>
    </div>
  );
}

interface SegmentedBarProps {
  nativeCount: number;
  sigmaCount: number;
  totalMatched: number;
}

function SegmentedBar({ nativeCount, sigmaCount, totalMatched }: SegmentedBarProps): React.ReactElement {
  const nativePct = totalMatched > 0 ? (nativeCount / totalMatched) * 100 : 0;
  const sigmaPct = totalMatched > 0 ? (sigmaCount / totalMatched) * 100 : 0;
  const emptyPct = 100 - nativePct - sigmaPct;
  const transition = 'width 0.8s cubic-bezier(0.4, 0, 0.2, 1)';

  return (
    <div className="h-2.5 rounded-full overflow-hidden flex" style={{ backgroundColor: 'rgb(var(--md-sys-color-surface-container))' }}>
      {nativeCount > 0 && (
        <div
          className="h-full"
          style={{
            width: `${nativePct}%`,
            backgroundColor: 'rgb(var(--md-ext-color-teal))',
            transition,
          }}
        />
      )}
      {sigmaCount > 0 && (
        <div
          className="h-full"
          style={{
            width: `${sigmaPct}%`,
            backgroundImage: `repeating-linear-gradient(
              -45deg,
              rgb(var(--md-ext-color-teal) / 0.25),
              rgb(var(--md-ext-color-teal) / 0.25) 3px,
              rgb(var(--md-ext-color-teal) / 0.10) 3px,
              rgb(var(--md-ext-color-teal) / 0.10) 6px
            )`,
            transition,
          }}
        />
      )}
      {emptyPct > 0 && (
        <div className="h-full flex-1" />
      )}
    </div>
  );
}

interface SiemEntryProps {
  siem: SiemReadiness;
  totalMatched: number;
}

function SiemEntry({ siem, totalMatched }: SiemEntryProps): React.ReactElement {
  const notCompatible = Math.max(0, totalMatched - siem.nativeCount - siem.sigmaCount);

  return (
    <div>
      {/* Platform name + native count hero */}
      <div className="flex items-baseline justify-between mb-2">
        <span className="text-[12px] font-medium text-on-surface">{siem.platform}</span>
        <span className="font-brand font-bold text-ext-teal text-lg leading-none">
          {siem.nativeCount}
          <span className="text-[10px] font-medium text-on-surface-variant ml-1">native</span>
        </span>
      </div>

      {/* Segmented bar */}
      <SegmentedBar
        nativeCount={siem.nativeCount}
        sigmaCount={siem.sigmaCount}
        totalMatched={totalMatched}
      />

      {/* Breakdown labels */}
      <div className="flex flex-wrap items-center gap-x-3 gap-y-0.5 mt-2 text-[10px]">
        <span className="flex items-center gap-1.5">
          <span
            className="inline-block w-2 h-2 rounded-sm flex-shrink-0"
            style={{ backgroundColor: 'rgb(var(--md-ext-color-teal))' }}
          />
          <span className="text-on-surface-variant">
            <span className="font-mono font-bold text-on-surface">{siem.nativeCount}</span> native — deploy immediately
          </span>
        </span>
        <span className="flex items-center gap-1.5">
          <span
            className="inline-block w-2 h-2 rounded-sm flex-shrink-0"
            style={{
              backgroundImage: `repeating-linear-gradient(
                -45deg,
                rgb(var(--md-ext-color-teal) / 0.35),
                rgb(var(--md-ext-color-teal) / 0.35) 1px,
                rgb(var(--md-ext-color-teal) / 0.12) 1px,
                rgb(var(--md-ext-color-teal) / 0.12) 2px
              )`,
            }}
          />
          <span className="text-on-surface-variant">
            <span className="font-mono font-bold text-on-surface">{siem.sigmaCount}</span> Sigma — need conversion
          </span>
        </span>
        {notCompatible > 0 && (
          <span className="flex items-center gap-1.5">
            <span
              className="inline-block w-2 h-2 rounded-sm flex-shrink-0"
              style={{ backgroundColor: 'rgb(var(--md-sys-color-surface-container))' }}
            />
            <span className="text-on-surface-variant/60">
              <span className="font-mono font-bold text-on-surface-variant/60">{notCompatible}</span> not compatible
            </span>
          </span>
        )}
      </div>
    </div>
  );
}

export const SiemReadinessBar: React.FC<SiemReadinessBarProps> = ({
  readiness,
  totalMatched,
  loading,
}) => {
  if (loading) return <LoadingSkeleton />;
  if (readiness.length === 0) return <EmptyState />;

  return (
    <div className="rounded-2xl p-5 h-full" style={{ backgroundColor: 'rgb(var(--md-sys-color-surface-container-high))' }}>
      <h3 className="text-[10px] font-brand font-bold text-on-surface tracking-[0.2em] uppercase mb-5">
        SIEM Readiness
      </h3>

      <div className="space-y-5">
        {readiness.map(siem => (
          <SiemEntry key={siem.platform} siem={siem} totalMatched={totalMatched} />
        ))}
      </div>

      {/* Conversion caveat */}
      <p className="mt-4 text-[9px] text-on-surface-variant/40 leading-relaxed">
        Sigma conversion success varies by rule complexity. Test before deploying.
      </p>
    </div>
  );
};
