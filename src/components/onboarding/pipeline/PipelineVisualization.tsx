/**
 * PipelineVisualization
 *
 * Full-screen pipeline canvas with integrated side panels.
 *
 * Layout: flex row — [left panel] | [SVG canvas + particles] | [right panel]
 *
 * The background dot grid spans the entire width behind everything.
 * Panels are normal flex columns (transparent, no card/overlay) with
 * just a subtle 1px border divider. The SVG canvas fills the remaining
 * center space and scales via preserveAspectRatio="xMidYMid meet".
 *
 * When panels are open, the corresponding SVG labels hide (the panel
 * shows the same info in richer HTML). Connection dots and lines remain
 * visible in the SVG to maintain the visual flow.
 */

import { useMemo, useRef, useEffect, useState } from 'react';
import { useOnboarding } from '../OnboardingContext';
import { SourcePanelContent } from '../SourceOverlay';
import { DestPanelContent } from '../DestinationOverlay';
import BackgroundGrid from './BackgroundGrid';
import StageNode from './StageNode';
import StreamLine from './StreamLine';
import ParticleSystem from './ParticleSystem';
import type { PipelineStage, SourceState } from '../types';

// ---------------------------------------------------------------------------
// Layout constants (1400x800 viewBox)
// ---------------------------------------------------------------------------

const SVG_WIDTH = 1400;
const SVG_HEIGHT = 800;

const STAGE_RADIUS = 56;
const STAGE_Y = 400;

/** Platform destinations shown on the right side */
const OUTPUT_PLATFORMS = ['Windows', 'Linux', 'Cloud', 'Network', 'macOS', 'Other'];

// Source / destination endpoint positions
const DEFAULT_SOURCE_DOT_X = 170;
const DEFAULT_SOURCE_TEXT_X = 160;
const DEFAULT_DEST_DOT_X = 1190;
const DEFAULT_DEST_TEXT_X = 1205;

// Stage node X positions (center of pipeline)
const STAGE_X: Record<PipelineStage, number> = {
  fetch: 400, parse: 540, validate: 680, normalize: 820, store: 960,
};

// ---------------------------------------------------------------------------
// Theme-aware color constants for SVG inline styles
// ---------------------------------------------------------------------------

const THEME = {
  primary: 'rgb(var(--md-sys-color-primary))',
  primaryHalf: 'rgb(var(--md-sys-color-primary) / 0.5)',
  primary60: 'rgb(var(--md-sys-color-primary) / 0.6)',
  onSurface: 'rgb(var(--md-sys-color-on-surface))',
  onSurfaceVariant: 'rgb(var(--md-sys-color-on-surface-variant))',
  onSurfaceVariant60: 'rgb(var(--md-sys-color-on-surface-variant) / 0.6)',
  onPrimaryContainer: 'rgb(var(--md-sys-color-on-primary-container))',
  outlineVariant: 'rgb(var(--md-sys-color-outline-variant))',
  outlineVariant30: 'rgb(var(--md-sys-color-outline-variant) / 0.3)',
  success: '#10b981',
  success70: 'rgba(16,185,129,0.7)',
} as const;

// ---------------------------------------------------------------------------
// Y-position distribution
// ---------------------------------------------------------------------------

function getSourceY(index: number, total: number): number {
  if (total <= 1) return 400;
  return 160 + (index * 480 / (total - 1));
}

// ---------------------------------------------------------------------------
// Path generation
// ---------------------------------------------------------------------------

function generateInputPath(sourceIndex: number, totalSources: number, sourceDotX: number, fetchX: number): string {
  const startX = sourceDotX;
  const startY = getSourceY(sourceIndex, totalSources);
  const endX = fetchX - STAGE_RADIUS;
  const endY = STAGE_Y;

  const gap = endX - startX;
  const cp1x = startX + gap * 0.35;
  const cp2x = endX - gap * 0.35;
  return `M ${startX},${startY} C ${cp1x},${startY} ${cp2x},${endY} ${endX},${endY}`;
}

function generateStagePath(from: PipelineStage, to: PipelineStage, stageX: Record<PipelineStage, number>): string {
  const fx = stageX[from];
  const tx = stageX[to];
  const startX = fx + STAGE_RADIUS;
  const endX = tx - STAGE_RADIUS;
  const midX = (startX + endX) / 2;
  return `M ${startX},${STAGE_Y} C ${midX},${STAGE_Y} ${midX},${STAGE_Y} ${endX},${STAGE_Y}`;
}

function generateOutputPath(destIndex: number, totalDests: number, storeX: number, destDotX: number): string {
  const startX = storeX + STAGE_RADIUS;
  const startY = STAGE_Y;
  const endX = destDotX;
  const endY = getSourceY(destIndex, totalDests);

  const gap = endX - startX;
  const cp1x = startX + gap * 0.35;
  const cp2x = endX - gap * 0.35;
  return `M ${startX},${startY} C ${cp1x},${startY} ${cp2x},${endY} ${endX},${endY}`;
}

// ---------------------------------------------------------------------------
// Inter-stage pairs
// ---------------------------------------------------------------------------

const STAGE_PAIRS: [PipelineStage, PipelineStage][] = [
  ['fetch', 'parse'],
  ['parse', 'validate'],
  ['validate', 'normalize'],
  ['normalize', 'store'],
];

// ---------------------------------------------------------------------------
// ParticlePath type
// ---------------------------------------------------------------------------

interface ParticlePath {
  id: string;
  pathData: string;
  color: string;
  active: boolean;
}

// ---------------------------------------------------------------------------
// Status helpers
// ---------------------------------------------------------------------------

const STATUS_LABELS: Record<string, string> = {
  fetching: 'Fetching...',
  parsing: 'Parsing...',
  validating: 'Validating...',
  inserting: 'Importing...',
  recon: 'Scanning...',
  complete: 'Complete',
  error: 'Error',
  ready: 'Ready',
};

function isProcessing(status: string): boolean {
  return ['fetching', 'parsing', 'validating', 'inserting', 'recon'].includes(status);
}

// ---------------------------------------------------------------------------
// Source logo mapping (official source id → logo path in public/)
// ---------------------------------------------------------------------------

const SOURCE_LOGO_MAP: Record<string, string> = {
  'sigma-hq': '/logos/integrations/sigma.svg',
  'splunk-escu': '/logos/integrations/splunk.svg',
  'elastic-detection-rules': '/logos/integrations/elastic.svg',
  'chronicle-detection-rules': '/logos/integrations/chronicle.svg',
  'microsoft-sentinel': '/logos/integrations/sentinel.svg',
  'defender-xdr': '/logos/integrations/defender-xdr.svg',
};

// ---------------------------------------------------------------------------
// SVG Source Label
// ---------------------------------------------------------------------------

interface SourceLabelProps {
  state: SourceState;
  y: number;
  onToggle: () => void;
}

function SourceLabel({ state, y, onToggle }: SourceLabelProps): React.JSX.Element {
  const { source, selected, status, importedCount } = state;
  const processing = isProcessing(status);
  const isComplete = status === 'complete';

  function getStatusText(): string {
    if (isComplete) return `${importedCount.toLocaleString()} imported`;
    if (processing) return STATUS_LABELS[status] ?? status;
    if (status === 'error') return 'Error';
    if (status === 'ready') return 'Ready';
    return `~${source.estimatedRules.toLocaleString()}`;
  }

  const nameFill = selected ? THEME.onSurface : THEME.onSurfaceVariant;
  const subtextFill = selected
    ? isComplete
      ? THEME.success70
      : processing
        ? THEME.onPrimaryContainer
        : THEME.onSurfaceVariant
    : THEME.onSurfaceVariant60;

  const logoPath = SOURCE_LOGO_MAP[source.id] || '';
  const logoSize = 28;
  const logoX = DEFAULT_SOURCE_DOT_X - logoSize - 8;
  const textX = logoPath ? logoX - 6 : DEFAULT_SOURCE_TEXT_X - 18;

  return (
    <g style={{ cursor: 'pointer' }} onClick={onToggle}>
      {/* Product logo */}
      {logoPath ? (
        <image
          href={logoPath}
          x={logoX}
          y={y - logoSize / 2}
          width={logoSize}
          height={logoSize}
          opacity={selected ? 1 : 0.35}
          style={{ transition: 'opacity 300ms' }}
        />
      ) : (
        <circle
          cx={DEFAULT_SOURCE_TEXT_X - 8}
          cy={y - 2}
          r={3}
          fill={source.color}
          opacity={selected ? 0.8 : 0.25}
        />
      )}

      {/* Source name */}
      <text
        x={textX}
        y={y}
        textAnchor="end"
        style={{
          fontSize: 13,
          fontWeight: 500,
          fill: nameFill,
          fontFamily: 'system-ui, -apple-system, sans-serif',
          transition: 'fill 300ms',
        }}
      >
        {source.shortName}
      </text>

      {/* Estimated rules / status */}
      <text
        x={textX}
        y={y + 16}
        textAnchor="end"
        style={{
          fontSize: 9,
          fill: subtextFill,
          fontFamily: 'system-ui, -apple-system, sans-serif',
          transition: 'fill 300ms',
        }}
      >
        {getStatusText()}
      </text>

      {/* Connection dots are rendered separately (always visible) */}
    </g>
  );
}

// ---------------------------------------------------------------------------
// SVG Destination Label
// ---------------------------------------------------------------------------

interface DestLabelProps {
  platform: string;
  y: number;
  count: number;
}

function DestLabel({ platform, y, count }: DestLabelProps): React.JSX.Element {
  const hasData = count > 0;
  const nameFill = hasData ? '#10b981' : THEME.onSurfaceVariant;
  const countFill = hasData ? THEME.success70 : THEME.onSurfaceVariant60;

  return (
    <g>
      {/* Connection dots are rendered separately (always visible) */}

      {/* Platform name */}
      <text
        x={DEFAULT_DEST_TEXT_X}
        y={y}
        textAnchor="start"
        style={{
          fontSize: 12,
          fill: nameFill,
          fontFamily: 'system-ui, -apple-system, sans-serif',
          transition: 'fill 300ms',
        }}
      >
        {platform}
      </text>

      {/* Count */}
      <text
        x={DEFAULT_DEST_TEXT_X}
        y={y + 14}
        textAnchor="start"
        style={{
          fontSize: 10,
          fill: countFill,
          fontFamily: "'Orbitron', sans-serif",
          fontVariantNumeric: 'tabular-nums',
          transition: 'fill 300ms',
        }}
      >
        {hasData ? count.toLocaleString() : '--'}
      </text>
    </g>
  );
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export default function PipelineVisualization(): React.JSX.Element {
  const { phase, sources, stages, streams, liveStats, toggleSource } = useOnboarding();
  const canvasRef = useRef<HTMLDivElement>(null);
  const [dimensions, setDimensions] = useState({ width: SVG_WIDTH, height: SVG_HEIGHT });

  // Panel expand/collapse state
  const [leftPanelOpen, setLeftPanelOpen] = useState(false);
  const [rightPanelOpen, setRightPanelOpen] = useState(false);

  useEffect(() => {
    if (!canvasRef.current) return;
    const observer = new ResizeObserver((entries) => {
      const { width, height } = entries[0].contentRect;
      if (width > 0 && height > 0) {
        setDimensions({ width, height });
      }
    });
    observer.observe(canvasRef.current);
    return () => observer.disconnect();
  }, []);

  const selectedSources = useMemo(
    () => sources.filter((s) => s.selected),
    [sources],
  );

  // Dynamic viewBox — expand to fill the canvas container with zero gaps.
  // The original 1400×800 content stays centered; extra viewBox space is
  // just empty background. This means `meet` fills 100% of the container.
  const dynamicViewBox = useMemo(() => {
    const cw = dimensions.width;
    const ch = dimensions.height;
    if (cw === 0 || ch === 0) return { x: 0, y: 0, w: SVG_WIDTH, h: SVG_HEIGHT };

    const containerAR = cw / ch;
    const svgAR = SVG_WIDTH / SVG_HEIGHT;

    let vbW = SVG_WIDTH;
    let vbH = SVG_HEIGHT;

    if (containerAR < svgAR) {
      // Container is taller than content — expand viewBox height
      vbH = SVG_WIDTH / containerAR;
    } else {
      // Container is wider than content — expand viewBox width
      vbW = SVG_HEIGHT * containerAR;
    }

    // Center the original content area within the expanded viewBox
    const vbX = (SVG_WIDTH - vbW) / 2;
    const vbY = (SVG_HEIGHT - vbH) / 2;

    return { x: vbX, y: vbY, w: vbW, h: vbH };
  }, [dimensions.width, dimensions.height]);

  // Auto-open left panel when sources are selected, auto-close when none
  const prevSelectedCountRef = useRef(0);
  useEffect(() => {
    const count = selectedSources.length;
    if (count > 0 && prevSelectedCountRef.current === 0) {
      setLeftPanelOpen(true);
    } else if (count === 0) {
      setLeftPanelOpen(false);
    }
    // Also open when a new source is added
    if (count > prevSelectedCountRef.current && count > 0) {
      setLeftPanelOpen(true);
    }
    prevSelectedCountRef.current = count;
  }, [selectedSources.length]);

  // Auto-open right panel when processing starts
  useEffect(() => {
    if (phase === 'processing' || phase === 'complete') {
      setRightPanelOpen(true);
    }
  }, [phase]);

  // Input paths (source endpoint -> fetch node) -- only for selected sources
  const inputPaths = useMemo(
    () =>
      selectedSources.map((s) => {
        const globalIndex = sources.findIndex((as) => as.source.id === s.source.id);
        return {
          id: `input-${s.source.id}`,
          pathData: generateInputPath(globalIndex, sources.length, DEFAULT_SOURCE_DOT_X, STAGE_X.fetch),
          color: THEME.primary,
          sourceId: s.source.id,
        };
      }),
    [selectedSources, sources],
  );

  // Inter-stage paths
  const interStagePaths = useMemo(
    () =>
      STAGE_PAIRS.map(([from, to]) => ({
        id: `stage-${from}-${to}`,
        pathData: generateStagePath(from, to, STAGE_X),
        from,
        to,
      })),
    [],
  );

  // Output paths (store -> destinations)
  const outputPaths = useMemo(
    () =>
      OUTPUT_PLATFORMS.map((p, i) => ({
        id: `output-${p}`,
        pathData: generateOutputPath(i, OUTPUT_PLATFORMS.length, STAGE_X.store, DEFAULT_DEST_DOT_X),
        platform: p,
      })),
    [],
  );

  // Build particle paths for active streams
  const particlePaths = useMemo(() => {
    const paths: ParticlePath[] = [];

    for (const ip of inputPaths) {
      const streamState = streams.find(
        (s) => s.sourceId === ip.sourceId && s.from === 'source',
      );
      if (streamState?.status === 'active') {
        paths.push({
          id: ip.id,
          pathData: ip.pathData,
          color: THEME.primary,
          active: true,
        });
      }
    }

    for (const sp of interStagePaths) {
      const streamState = streams.find(
        (s) => s.from === sp.from && s.to === sp.to,
      );
      if (streamState?.status === 'active') {
        paths.push({
          id: sp.id,
          pathData: sp.pathData,
          color: THEME.primary,
          active: true,
        });
      }
    }

    const isStoreActive = stages.find(s => s.stage === 'store')?.status === 'active';

    for (const op of outputPaths) {
      const hasData = (liveStats.byPlatform[op.platform] ?? 0) > 0;
      const isActive = hasData && isStoreActive && phase !== 'complete';
      if (isActive) {
        paths.push({
          id: op.id,
          pathData: op.pathData,
          color: '#10b981',
          active: true,
        });
      }
    }

    return paths;
  }, [inputPaths, interStagePaths, outputPaths, streams, liveStats.byPlatform, phase, stages]);

  return (
    <div className="relative w-full h-full overflow-hidden">
      {/* Background grid — spans full width behind everything */}
      <BackgroundGrid phase={phase} />

      {/* Content — flex row: left panel | canvas | right panel */}
      <div className="absolute inset-0 flex">

        {/* ── Left panel: source details ── */}
        {leftPanelOpen && selectedSources.length > 0 ? (
          <div className="relative z-[2] w-44 shrink-0 pt-20 pb-16 flex flex-col overflow-hidden border-r border-outline-variant/[0.06]">
            <SourcePanelContent onCollapse={() => setLeftPanelOpen(false)} />
          </div>
        ) : selectedSources.length > 0 ? (
          <button
            type="button"
            onClick={() => setLeftPanelOpen(true)}
            className="relative z-[2] shrink-0 mt-20 mb-16 w-5 flex items-center justify-center cursor-pointer transition-colors text-on-surface-variant/25 hover:text-on-surface-variant/60 border-r border-outline-variant/[0.06]"
          >
            <svg className="w-2.5 h-2.5" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
              <path d="M6 4l4 4-4 4" />
            </svg>
          </button>
        ) : null}

        {/* ── Center: SVG pipeline canvas ── */}
        <div ref={canvasRef} className="flex-1 relative min-w-0">
          <svg
            viewBox={`${dynamicViewBox.x} ${dynamicViewBox.y} ${dynamicViewBox.w} ${dynamicViewBox.h}`}
            className="absolute inset-0 z-[1] w-full h-full"
            preserveAspectRatio="xMidYMid meet"
          >
            {/* 1. Idle background lines for unselected sources */}
            {sources.map((s, i) => {
              if (s.selected) return null;
              return (
                <StreamLine
                  key={`idle-input-${s.source.id}`}
                  id={`idle-input-${s.source.id}`}
                  pathData={generateInputPath(i, sources.length, DEFAULT_SOURCE_DOT_X, STAGE_X.fetch)}
                  status="idle"
                  color={THEME.outlineVariant30}
                />
              );
            })}

            {/* 2. Active input streams (source -> fetch) */}
            {inputPaths.map((path) => {
              const streamState = streams.find(
                (s) => s.sourceId === path.sourceId && s.from === 'source',
              );
              return (
                <StreamLine
                  key={path.id}
                  id={path.id}
                  pathData={path.pathData}
                  status={streamState?.status ?? 'idle'}
                  color={THEME.primary}
                />
              );
            })}

            {/* 2b. Inter-stage streams */}
            {interStagePaths.map((path) => {
              const streamState = streams.find(
                (s) => s.from === path.from && s.to === path.to,
              );
              return (
                <StreamLine
                  key={path.id}
                  id={path.id}
                  pathData={path.pathData}
                  status={streamState?.status ?? 'idle'}
                  color={THEME.primary}
                />
              );
            })}

            {/* 2c. Output streams (store -> destinations) */}
            {outputPaths.map((path) => {
              const hasData = (liveStats.byPlatform[path.platform] ?? 0) > 0;
              const storeActive = stages.find(s => s.stage === 'store')?.status === 'active';
              let status: 'idle' | 'active' | 'complete';
              if (!hasData || (!storeActive && phase !== 'complete')) {
                status = 'idle';
              } else if (phase === 'complete') {
                status = 'complete';
              } else {
                status = 'active';
              }
              return (
                <StreamLine
                  key={path.id}
                  id={path.id}
                  pathData={path.pathData}
                  status={status}
                  color="#10b981"
                />
              );
            })}

            {/* 3. Source labels — always visible */}
            {sources.map((s, i) => (
              <SourceLabel
                key={`label-${s.source.id}`}
                state={s}
                y={getSourceY(i, sources.length)}
                onToggle={() => toggleSource(s.source.id)}
              />
            ))}

            {/* 4. Destination labels — always visible */}
            {OUTPUT_PLATFORMS.map((platform, i) => (
              <DestLabel
                key={`dest-${platform}`}
                platform={platform}
                y={getSourceY(i, OUTPUT_PLATFORMS.length)}
                count={liveStats.byPlatform[platform] ?? 0}
              />
            ))}

            {/* 5. Connection dots */}
            {sources.map((s, i) => {
              const y = getSourceY(i, sources.length);
              const dotR = s.selected ? 5 : 3.5;
              const dotFill = s.selected ? THEME.primary : THEME.outlineVariant;
              const processing = isProcessing(s.status);
              const isComplete = s.status === 'complete';
              return (
                <g key={`dot-src-${s.source.id}`}>
                  <circle cx={DEFAULT_SOURCE_DOT_X} cy={y} r={dotR} fill={dotFill} style={{ transition: 'all 300ms' }} />
                  {processing && s.selected && (
                    <circle cx={DEFAULT_SOURCE_DOT_X} cy={y} r={10} fill="none" stroke={THEME.primary} strokeWidth={1} opacity={0.4} className="animate-glow-pulse" />
                  )}
                  {isComplete && (
                    <circle cx={DEFAULT_SOURCE_DOT_X} cy={y} r={8} fill="none" stroke="#10b981" strokeWidth={1.5} opacity={0.6} />
                  )}
                </g>
              );
            })}
            {OUTPUT_PLATFORMS.map((platform, i) => {
              const y = getSourceY(i, OUTPUT_PLATFORMS.length);
              const count = liveStats.byPlatform[platform] ?? 0;
              const hasData = count > 0;
              const dotFill = hasData ? '#10b981' : THEME.outlineVariant;
              const dotR = hasData ? 5 : 3.5;
              return (
                <g key={`dot-dest-${platform}`}>
                  <circle cx={DEFAULT_DEST_DOT_X} cy={y} r={dotR} fill={dotFill} style={{ transition: 'all 300ms' }} />
                  {hasData && (
                    <circle cx={DEFAULT_DEST_DOT_X} cy={y} r={8} fill="none" stroke="#10b981" strokeWidth={1} opacity={0.3} />
                  )}
                </g>
              );
            })}

            {/* 6. Stage nodes (always on top) */}
            {stages.map((stage) => (
              <StageNode
                key={stage.stage}
                stage={stage.stage}
                status={stage.status}
                counter={stage.counter}
                secondaryCounter={stage.secondaryCounter}
                label={stage.label}
                x={STAGE_X[stage.stage]}
                y={STAGE_Y}
                radius={STAGE_RADIUS}
              />
            ))}
          </svg>

          {/* Particle overlay tracks the canvas div dimensions */}
          <ParticleSystem
            width={dimensions.width}
            height={dimensions.height}
            paths={particlePaths}
            svgViewBox={{ x: dynamicViewBox.x, y: dynamicViewBox.y, width: dynamicViewBox.w, height: dynamicViewBox.h }}
          />
        </div>

        {/* ── Right panel: import stats ── */}
        {rightPanelOpen && selectedSources.length > 0 ? (
          <div className="relative z-[2] w-36 shrink-0 pt-20 pb-16 flex flex-col overflow-hidden border-l border-outline-variant/[0.06]">
            <DestPanelContent onCollapse={() => setRightPanelOpen(false)} />
          </div>
        ) : selectedSources.length > 0 ? (
          <button
            type="button"
            onClick={() => setRightPanelOpen(true)}
            className="relative z-[2] shrink-0 mt-20 mb-16 w-5 flex items-center justify-center cursor-pointer transition-colors text-on-surface-variant/25 hover:text-on-surface-variant/60 border-l border-outline-variant/[0.06]"
          >
            <svg className="w-2.5 h-2.5" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
              <path d="M10 4l-4 4 4 4" />
            </svg>
          </button>
        ) : null}

      </div>
    </div>
  );
}
