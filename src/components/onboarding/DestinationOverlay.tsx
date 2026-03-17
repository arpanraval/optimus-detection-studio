/**
 * DestinationOverlay
 *
 * Collapsible glass morphism stats panel on the right zone of the onboarding canvas.
 * Shows aggregate statistics in a single scrollable container:
 *   - Hero counter (large animated number)
 *   - Progress bar
 *   - Selected sources list with logos
 *   - MITRE ATT&CK stats
 *   - Quality score + severity bar
 *   - Source breakdown bar
 *
 * Uses M3 theme tokens for full light/dark theme support.
 */

import { useEffect, useRef, useState, useMemo } from 'react';
import { useOnboarding } from './OnboardingContext';

/** Map source IDs to bundled logo paths */
const SOURCE_LOGO_MAP: Record<string, string> = {
  'sigma-hq': '/logos/integrations/sigma.svg',
  'splunk-escu': '/logos/integrations/splunk.svg',
  'elastic-detection-rules': '/logos/integrations/elastic.svg',
  'chronicle-detection-rules': '/logos/integrations/chronicle.svg',
  'microsoft-sentinel': '/logos/integrations/sentinel.svg',
  'defender-xdr': '/logos/integrations/defender-xdr.svg',
};

// ---------------------------------------------------------------------------
// Animated number display
// ---------------------------------------------------------------------------

function AnimatedNumber({ value, className }: { value: number; className?: string }): React.JSX.Element {
  const [displayed, setDisplayed] = useState(0);
  const prevRef = useRef(0);
  const rafRef = useRef<number>(undefined);

  useEffect(() => {
    const start = prevRef.current;
    const end = value;
    if (start === end) return;

    const duration = 600;
    const startTime = performance.now();

    function animate(now: number): void {
      const elapsed = now - startTime;
      const progress = Math.min(elapsed / duration, 1);
      const eased = 1 - Math.pow(1 - progress, 3);
      setDisplayed(Math.round(start + (end - start) * eased));

      if (progress < 1) {
        rafRef.current = requestAnimationFrame(animate);
      } else {
        prevRef.current = end;
      }
    }

    rafRef.current = requestAnimationFrame(animate);
    return () => { if (rafRef.current) cancelAnimationFrame(rafRef.current); };
  }, [value]);

  return <span className={className}>{Intl.NumberFormat('en-US').format(displayed)}</span>;
}

// ---------------------------------------------------------------------------
// Severity color map
// ---------------------------------------------------------------------------

const SEVERITY_COLORS: Record<string, string> = {
  critical: '#ef4444',
  high: '#f97316',
  medium: '#eab308',
  low: 'rgb(var(--md-sys-color-primary))',
  informational: '#6b7280',
};

const SEVERITY_ORDER = ['critical', 'high', 'medium', 'low', 'informational'];

// ---------------------------------------------------------------------------
// Section divider
// ---------------------------------------------------------------------------

function Divider() {
  return <div className="h-px my-2 bg-outline-variant/10" />;
}

// ---------------------------------------------------------------------------
// Panel content — inner content only, no positioning wrapper
// Used inside foreignObject in PipelineVisualization
// ---------------------------------------------------------------------------

interface DestPanelContentProps {
  onCollapse: () => void;
}

export function DestPanelContent({ onCollapse }: DestPanelContentProps): React.JSX.Element | null {
  const { phase, sources, liveStats } = useOnboarding();

  const selectedSources = useMemo(() => sources.filter((s) => s.selected), [sources]);

  const totalExpected = useMemo(() => {
    return selectedSources.reduce((sum, s) => sum + s.source.estimatedRules, 0);
  }, [selectedSources]);

  const progressPercent =
    totalExpected > 0
      ? Math.min((liveStats.totalImported / totalExpected) * 100, 100)
      : 0;

  const tacticCount = liveStats.mitreTactics.size;
  const techniqueCount = liveStats.mitreTechniques.size;

  const totalBySeverity = Object.values(liveStats.bySeverity).reduce((a, b) => a + b, 0);
  const totalBySource = Object.values(liveStats.bySource).reduce((a, b) => a + b, 0);

  const isLive = phase === 'processing' || phase === 'complete';

  if (selectedSources.length === 0) return null;

  return (
    <>
      {/* Panel header with collapse button */}
      <div className="flex items-center justify-between px-3 pt-3 pb-1.5 shrink-0">
        <div className="flex items-center gap-1.5">
          <span className="text-[11px] font-medium tracking-wide uppercase text-on-surface-variant">
            {isLive ? 'Library' : 'Expected'}
          </span>
          {phase === 'processing' && (
            <span className="flex items-center gap-0.5">
              <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 animate-pulse" />
              <span className="text-[9px]" style={{ color: 'rgba(16,185,129,0.7)' }}>Live</span>
            </span>
          )}
          {phase === 'complete' && (
            <span className="text-[9px]" style={{ color: 'rgba(16,185,129,0.7)' }}>Done</span>
          )}
        </div>
        <button
          type="button"
          onClick={onCollapse}
          className="w-5 h-5 flex items-center justify-center rounded cursor-pointer transition-colors text-on-surface-variant hover:text-on-surface hover:bg-on-surface/[0.08]"
          title="Collapse panel"
        >
          <svg
            className="w-3 h-3"
            viewBox="0 0 16 16"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d="M6 4l4 4-4 4" />
          </svg>
        </button>
      </div>

      {/* Scrollable content */}
      <div className="flex-1 overflow-y-auto px-3 pb-3 scrollbar-minimal">
        {/* Hero counter */}
        <AnimatedNumber
          value={isLive ? liveStats.totalImported : totalExpected}
          className="font-brand text-2xl font-bold text-on-surface block"
        />
        {!isLive && totalExpected > 0 && (
          <span className="text-[10px] text-on-surface-variant mt-0.5 block">
            rules from {selectedSources.length} source{selectedSources.length !== 1 ? 's' : ''}
          </span>
        )}

        {/* Progress bar */}
        {isLive && totalExpected > 0 && (
          <div className="h-[2px] w-full rounded-full mt-2 bg-surface-container-high">
            <div
              className="h-full rounded-full transition-all duration-500 ease-out bg-primary"
              style={{ width: `${progressPercent}%` }}
            />
          </div>
        )}

        {/* Selected sources (pre-processing) */}
        {!isLive && (
          <>
            <Divider />
            <span className="text-[9px] tracking-[0.15em] uppercase block mb-1.5 text-on-surface-variant">
              Sources
            </span>
            <div className="flex flex-col gap-1.5">
              {selectedSources.map((s) => (
                <div key={s.source.id} className="flex items-center gap-2">
                  {SOURCE_LOGO_MAP[s.source.id] ? (
                    <div className="w-4 h-4 rounded shrink-0 bg-surface-container-high flex items-center justify-center border border-outline-variant/15 overflow-hidden">
                      <img
                        src={SOURCE_LOGO_MAP[s.source.id]}
                        alt=""
                        width={11}
                        height={11}
                        className="object-contain"
                      />
                    </div>
                  ) : (
                    <span
                      className="w-4 h-4 rounded shrink-0 flex items-center justify-center text-[8px] font-bold text-white"
                      style={{ backgroundColor: s.source.color }}
                    >
                      {s.source.shortName.charAt(0)}
                    </span>
                  )}
                  <span className="text-[11px] text-on-surface truncate flex-1">
                    {s.source.shortName}
                  </span>
                  <span className="text-[10px] tabular-nums text-on-surface-variant">
                    ~{s.source.estimatedRules.toLocaleString()}
                  </span>
                </div>
              ))}
            </div>
          </>
        )}

        {/* MITRE ATT&CK */}
        <Divider />
        <span className="text-[9px] tracking-[0.15em] uppercase block mb-1 text-on-surface-variant">
          MITRE ATT&CK
        </span>
        <div className="flex items-center justify-between">
          <div className="text-center flex-1">
            <span className="font-brand text-sm font-bold block text-on-surface">
              {tacticCount || '--'}
            </span>
            <span className="text-[9px] text-on-surface-variant">/14 tactics</span>
          </div>
          <div className="w-px h-4 bg-outline-variant/20" />
          <div className="text-center flex-1">
            <span className="font-brand text-sm font-bold block text-on-surface">
              {techniqueCount || '--'}
            </span>
            <span className="text-[9px] text-on-surface-variant">techniques</span>
          </div>
        </div>

        {/* Quality + Severity */}
        <Divider />
        <div className="flex items-center justify-between mb-1">
          <span className="text-[9px] tracking-[0.15em] uppercase text-on-surface-variant">
            Quality
          </span>
          <span className="font-brand text-xs font-bold text-on-surface">
            {liveStats.avgQualityScore > 0 ? liveStats.avgQualityScore : '--'}
          </span>
        </div>

        {/* Severity mini-bar */}
        {totalBySeverity > 0 && (
          <div className="flex gap-0.5 h-1.5 rounded-full overflow-hidden bg-surface-container-high">
            {SEVERITY_ORDER.map((sev) => {
              const count = liveStats.bySeverity[sev] ?? 0;
              if (count === 0) return null;
              return (
                <div
                  key={sev}
                  className="h-full rounded-full"
                  style={{
                    width: `${(count / totalBySeverity) * 100}%`,
                    backgroundColor: SEVERITY_COLORS[sev] ?? '#6b7280',
                  }}
                />
              );
            })}
          </div>
        )}

        {/* Source breakdown mini bar */}
        {totalBySource > 0 && (
          <>
            <Divider />
            <span className="text-[9px] tracking-[0.15em] uppercase block mb-1.5 text-on-surface-variant">
              By Source
            </span>
            <div className="flex gap-0.5 h-1.5 rounded-full overflow-hidden bg-surface-container-high">
              {Object.entries(liveStats.bySource).map(([vendor, count]) => (
                <div
                  key={vendor}
                  className="h-full rounded-full bg-primary"
                  style={{
                    width: `${(count / totalBySource) * 100}%`,
                    opacity: 0.4 + (count / totalBySource) * 0.6,
                  }}
                />
              ))}
            </div>
          </>
        )}
      </div>
    </>
  );
}

// ---------------------------------------------------------------------------
// Legacy wrapper — kept for backwards compat but no longer used
// ---------------------------------------------------------------------------

export function DestinationOverlay(): React.JSX.Element | null {
  return null;
}

export default DestinationOverlay;
