import React, { useEffect, useRef, useState } from 'react';
import { MockupFrame } from '../shared/FeatureSlide';

const ACCENT = '#783264';
const TEAL = '#4D7C6F';

/**
 * ThreatResearchMockup — faithful miniature of the real Threat Research canvas.
 *
 * The product renders an agent-built research graph on a dotted canvas:
 * threat → tactics → attack opportunities → research → validated detections.
 * This mockup replays that graph growing stage by stage, with the app's
 * header chrome (breadcrumb, badges, Canvas/List/Research toggle) and
 * canvas controls (zoom, fit).
 */

// ─── Node glyphs ─────────────────────────────────────────────────────────────

const Glyph: React.FC<{ kind: 'threat' | 'tactic' | 'opp' | 'research' | 'detection'; muted?: boolean }> = ({ kind, muted }) => {
  const stroke = muted ? '#9ca3af' : ACCENT;
  const common = { stroke, strokeWidth: 1.6, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const, fill: 'none' };
  switch (kind) {
    case 'threat': // skull
      return (
        <g {...common}>
          <path d="M12 4c-4 0-7 3-7 6.5 0 2.2 1.2 3.9 3 4.9V18h8v-2.6c1.8-1 3-2.7 3-4.9C19 7 16 4 12 4Z" />
          <circle cx="9.5" cy="10.5" r="1.1" fill={stroke} stroke="none" />
          <circle cx="14.5" cy="10.5" r="1.1" fill={stroke} stroke="none" />
          <path d="M10.5 18v2M13.5 18v2" />
        </g>
      );
    case 'tactic': // connected nodes
      return (
        <g {...common}>
          <circle cx="8" cy="8" r="2" />
          <circle cx="16" cy="8" r="2" />
          <circle cx="12" cy="16" r="2" />
          <path d="M9.5 9.5 11 14M14.5 9.5 13 14M10 8h4" />
        </g>
      );
    case 'opp': // crossed swords
      return (
        <g {...common}>
          <path d="M5 5l10 10M19 5L9 15" />
          <path d="M14 16.5 16.5 19M10 16.5 7.5 19" />
          <path d="M4.5 4.5 7 5l-1 1z" fill={stroke} stroke="none" />
          <path d="M19.5 4.5 17 5l1 1z" fill={stroke} stroke="none" />
        </g>
      );
    case 'research': // magnifier
      return (
        <g {...common}>
          <circle cx="10.5" cy="10.5" r="5" />
          <path d="M14.5 14.5 19 19" />
        </g>
      );
    case 'detection': // shield check
      return (
        <g {...common}>
          <path d="M12 4l7 2.5v5c0 4-3 7-7 8.5-4-1.5-7-4.5-7-8.5v-5L12 4Z" />
          <path d="M9 11.5l2 2 4-4" />
        </g>
      );
  }
};

// ─── Graph data ──────────────────────────────────────────────────────────────

type NodeDef = {
  id: string;
  kind: 'threat' | 'tactic' | 'opp' | 'research' | 'detection';
  x: number;
  y: number;
  label: string;
  sub?: string;
  phase: number;      // reveal phase
  muted?: boolean;    // dashed "merged into N opps" style
  count?: number;     // small count badge
  parent?: string;
};

const NODES: NodeDef[] = [
  { id: 'root', kind: 'threat', x: 500, y: 44, label: 'Fake CAPTCHA / ClickFix Social…', phase: 1 },

  { id: 'exec', kind: 'tactic', x: 220, y: 150, label: 'Execution', phase: 2, parent: 'root' },
  { id: 'pers', kind: 'tactic', x: 500, y: 150, label: 'Persistence', phase: 2, parent: 'root' },
  { id: 'defev', kind: 'tactic', x: 780, y: 150, label: 'Defense Evasion', phase: 2, parent: 'root' },

  { id: 'opp1', kind: 'opp', x: 120, y: 258, label: 'Remote HTA File Fetch', sub: 'and Execute', phase: 3, count: 2, parent: 'exec' },
  { id: 'opp2', kind: 'opp', x: 320, y: 258, label: 'Inline VBScript/JScript…', sub: 'merged into 2 opps', phase: 3, muted: true, parent: 'exec' },
  { id: 'opp3', kind: 'opp', x: 500, y: 258, label: 'Registry Run Key', sub: 'Persistence via Mshta', phase: 3, count: 1, parent: 'pers' },
  { id: 'opp4', kind: 'opp', x: 680, y: 258, label: 'AppLocker Bypass', sub: 'merged into 1 opp', phase: 3, muted: true, parent: 'defev' },
  { id: 'opp5', kind: 'opp', x: 880, y: 258, label: 'Indirect Invocation via', sub: 'Forfiles or Other LOLBi…', phase: 3, count: 1, parent: 'defev' },

  { id: 'res1', kind: 'research', x: 120, y: 356, label: 'Mshta.exe with URL or', sub: 'inline script URI in…', phase: 4, parent: 'opp1' },
  { id: 'res2', kind: 'research', x: 500, y: 356, label: 'Mshta.exe referenced in', sub: 'autorun/persistence…', phase: 4, parent: 'opp3' },
  { id: 'res3', kind: 'research', x: 880, y: 356, label: 'Mshta.exe spawned by', sub: 'anomalous LOLBin…', phase: 4, parent: 'opp5' },

  { id: 'det1', kind: 'detection', x: 120, y: 452, label: 'Mshta URL Execution', sub: 'pass with concerns', phase: 5, parent: 'res1' },
  { id: 'det2', kind: 'detection', x: 500, y: 452, label: 'Mshta Autorun Persistence', sub: 'pass with concerns', phase: 5, parent: 'res2' },
  { id: 'det3', kind: 'detection', x: 880, y: 452, label: 'Anomalous LOLBin Spawn', sub: 'pass with concerns', phase: 5, parent: 'res3' },
];

const NODE_HALF = 21; // node box is 42x42

const edgePath = (from: NodeDef, to: NodeDef) => {
  const x1 = from.x, y1 = from.y + NODE_HALF + (from.sub ? 26 : 16);
  const x2 = to.x, y2 = to.y - NODE_HALF - 2;
  const my = (y1 + y2) / 2;
  return `M ${x1} ${y1} C ${x1} ${my}, ${x2} ${my}, ${x2} ${y2}`;
};

// ─── Phase captions ──────────────────────────────────────────────────────────

const PHASE_CAPTIONS: Record<number, string> = {
  1: 'Ingesting threat — parsing campaign intel into scope…',
  2: 'Modeling attack surface — mapping tactics in play…',
  3: 'Deriving attack opportunities — deduping and merging…',
  4: 'Researching telemetry — agents mining execution evidence…',
  5: 'Engineering rules — drafting and validating against baselines…',
  6: 'Session complete — 3 validated detections in your review queue',
};

const HOLD_PHASES = 3; // extra ticks to hold the finished graph before looping
const TICK_MS = 1700;

export const ThreatResearchMockup: React.FC = () => {
  const [phase, setPhase] = useState(0);
  const ref = useRef<HTMLDivElement>(null);
  const started = useRef(false);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    let interval: ReturnType<typeof setInterval> | undefined;
    const obs = new IntersectionObserver(([e]) => {
      if (e.isIntersecting && !started.current) {
        started.current = true;
        setPhase(1);
        interval = setInterval(() => {
          setPhase((p) => (p >= 6 + HOLD_PHASES ? 1 : p + 1));
        }, TICK_MS);
      }
    }, { threshold: 0.2 });
    obs.observe(el);
    return () => { obs.disconnect(); if (interval) clearInterval(interval); };
  }, []);

  const shown = Math.min(phase, 6);
  const nodeById = Object.fromEntries(NODES.map((n) => [n.id, n]));

  return (
    <MockupFrame title="THREAT RESEARCH — AUTONOMOUS SESSION" accent={ACCENT}>
      <div ref={ref}>
        {/* App header chrome */}
        <div className="mb-3">
          <div className="mono text-[9px] text-outline mb-1">
            Threat Research <span className="mx-1">›</span> Fake Captcha threat campaign
          </div>
          <div className="flex items-start justify-between gap-3 flex-wrap">
            <h4 className="text-sm font-bold text-on-surface leading-tight">
              Fake CAPTCHA / ClickFix Social Engineering Campaign
            </h4>
            {/* Canvas / List / Research toggle */}
            <div className="flex items-center rounded-full border border-outline-variant bg-surface-container-low p-0.5 shrink-0">
              <span className="mono text-[9px] font-bold px-3 py-1 rounded-full text-white" style={{ backgroundColor: ACCENT }}>Canvas</span>
              <span className="mono text-[9px] px-3 py-1 text-on-surface-variant">List</span>
              <span className="mono text-[9px] px-3 py-1 text-on-surface-variant">Research</span>
            </div>
          </div>
          <div className="flex items-center gap-1.5 mt-2 flex-wrap">
            <span className="mono text-[8px] px-2 py-0.5 rounded-full border border-outline-variant bg-surface-container-low text-on-surface-variant">
              {phase >= 6 ? 'completed' : 'running'}
            </span>
            <span className="mono text-[8px] px-2 py-0.5 rounded-full border" style={{ borderColor: `${ACCENT}30`, backgroundColor: `${ACCENT}0d`, color: `${ACCENT}cc` }}>Campaign</span>
            <span className="mono text-[8px] px-2 py-0.5 rounded-full border border-amber-500/30 bg-amber-500/5 text-amber-600">⚠ Microsoft Sentinel only · 1 uncovered</span>
            <span className="mono text-[8px] px-2 py-0.5 rounded-full border border-outline-variant bg-surface-container-low text-on-surface-variant">519 / 800 model</span>
            <span className="mono text-[8px] px-2 py-0.5 rounded-full border border-outline-variant bg-surface-container-low text-on-surface-variant">510 / 800 tools</span>
          </div>
        </div>

        {/* Dotted canvas */}
        <div
          className="relative rounded-xl border border-outline-variant overflow-hidden"
          style={{
            backgroundColor: '#f2f2f5',
            backgroundImage: 'radial-gradient(rgba(0,0,0,0.10) 1px, transparent 1px)',
            backgroundSize: '18px 18px',
          }}
        >
          <svg viewBox="0 0 1000 510" className="w-full h-auto" fill="none">
            {/* Edges */}
            {NODES.filter((n) => n.parent).map((n) => {
              const parent = nodeById[n.parent!];
              const visible = shown >= n.phase;
              return (
                <path
                  key={`e-${n.id}`}
                  d={edgePath(parent, n)}
                  stroke="#b6b6c0"
                  strokeWidth="1.3"
                  strokeDasharray={n.muted ? '4 4' : undefined}
                  pathLength={1}
                  style={{
                    strokeDasharray: n.muted ? '0.02 0.02' : '1',
                    strokeDashoffset: visible ? 0 : 1,
                    opacity: visible ? (n.muted ? 0.55 : 0.9) : 0,
                    transition: 'stroke-dashoffset 0.9s ease-out, opacity 0.4s ease-out',
                  }}
                />
              );
            })}

            {/* Nodes */}
            {NODES.map((n) => {
              const visible = shown >= n.phase;
              return (
                <g
                  key={n.id}
                  style={{
                    opacity: visible ? 1 : 0,
                    transform: visible ? 'scale(1)' : 'scale(0.6)',
                    transformOrigin: `${n.x}px ${n.y}px`,
                    transition: 'opacity 0.55s ease-out, transform 0.55s cubic-bezier(0.34, 1.56, 0.64, 1)',
                  }}
                >
                  {/* Box */}
                  <rect
                    x={n.x - NODE_HALF} y={n.y - NODE_HALF} width={NODE_HALF * 2} height={NODE_HALF * 2} rx="11"
                    fill="#ffffff"
                    stroke={n.muted ? '#c2c2ca' : ACCENT}
                    strokeWidth="1.4"
                    strokeDasharray={n.muted ? '4 3' : undefined}
                  />
                  {/* Glyph centered in box */}
                  <g transform={`translate(${n.x - 12}, ${n.y - 12})`}>
                    <Glyph kind={n.kind} muted={n.muted} />
                  </g>
                  {/* Expand / collapse chip */}
                  {!n.muted && (
                    <g>
                      <circle cx={n.x + NODE_HALF - 2} cy={n.y - NODE_HALF + 2} r="6" fill="#ffffff" stroke={ACCENT} strokeOpacity="0.5" strokeWidth="1" />
                      <path d={n.kind === 'threat' || n.kind === 'tactic' ? `M ${n.x + NODE_HALF - 5} ${n.y - NODE_HALF + 2} h 6` : `M ${n.x + NODE_HALF - 5} ${n.y - NODE_HALF + 2} h 6 M ${n.x + NODE_HALF - 2} ${n.y - NODE_HALF - 1} v 6`} stroke={ACCENT} strokeOpacity="0.7" strokeWidth="1.2" strokeLinecap="round" />
                    </g>
                  )}
                  {/* Count badge */}
                  {n.count != null && (
                    <g>
                      <circle cx={n.x - NODE_HALF + 2} cy={n.y - NODE_HALF + 2} r="7" fill="#3d3d46" />
                      <text x={n.x - NODE_HALF + 2} y={n.y - NODE_HALF + 5} textAnchor="middle" fontSize="8.5" fontWeight="700" fill="#ffffff" fontFamily="Inter, sans-serif">{n.count}</text>
                    </g>
                  )}
                  {/* Labels */}
                  <text x={n.x} y={n.y + NODE_HALF + 13} textAnchor="middle" fontSize="9.5" fontWeight="600" fill={n.muted ? '#9ca3af' : '#2b2b30'} fontFamily="Inter, sans-serif">{n.label}</text>
                  {n.sub && (
                    <text x={n.x} y={n.y + NODE_HALF + 25} textAnchor="middle" fontSize={n.muted || n.kind === 'detection' ? 8 : 9} fill={n.kind === 'detection' ? '#8c8c96' : n.muted ? '#a8a8b2' : '#2b2b30'} fontStyle={n.muted || n.kind === 'detection' ? 'italic' : undefined} fontWeight={n.muted || n.kind === 'detection' ? 400 : 600} fontFamily="Inter, sans-serif">{n.sub}</text>
                  )}
                </g>
              );
            })}
          </svg>

          {/* Canvas chrome: zoom + fit controls */}
          <div className="absolute bottom-3 right-3 flex flex-col items-center gap-1 rounded-lg border border-outline-variant bg-white/90 backdrop-blur-sm py-1.5 px-1 shadow-sm">
            <span className="text-[11px] text-on-surface-variant leading-none px-1.5 cursor-default">+</span>
            <span className="text-[11px] text-on-surface-variant leading-none px-1.5 cursor-default">−</span>
            <span className="mono text-[7px] font-bold text-on-surface-variant px-1 cursor-default">FIT</span>
          </div>
          <div className="absolute bottom-3 left-3 rounded-full border border-outline-variant bg-white/90 backdrop-blur-sm px-2.5 py-1 shadow-sm">
            <span className="mono text-[8px] text-on-surface-variant">100%</span>
          </div>
        </div>

        {/* Status footer */}
        <div className="flex items-center justify-between mt-3 mono text-[9px] text-on-surface-variant">
          <span key={Math.min(phase, 6)} className="hfs-caption flex items-center gap-2">
            <span
              className={`w-1.5 h-1.5 rounded-full shrink-0 ${phase < 6 ? 'animate-pulse' : ''}`}
              style={{ backgroundColor: phase >= 6 ? TEAL : ACCENT }}
            />
            {PHASE_CAPTIONS[Math.min(Math.max(phase, 1), 6)]}
          </span>
          <span className="hidden sm:block text-outline">AGENTS: PREFLIGHT · RESEARCH · ATTACK · ENGINEER · QA</span>
        </div>
      </div>
    </MockupFrame>
  );
};
