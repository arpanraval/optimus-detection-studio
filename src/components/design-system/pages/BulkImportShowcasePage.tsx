import React, { useState, useEffect, useRef } from 'react';
import { DesignSystemPage, Section } from '../shared';
import { Icon } from '../../Icon';
import type { IconName } from '../../Icon';

const BRAND = '#783264';
const COLORS = {
  success: '#4D7C6F',
  failure: '#A63D40',
  warning: '#D4A84B',
  brand: BRAND,
  muted: '#78326420',
};

// ============================================================================
// ANIMATION STYLES
// ============================================================================
const AnimationStyles = () => (
  <style>{`
    @keyframes beam-connect { 0% { stroke-dashoffset: 200; } 100% { stroke-dashoffset: 0; } }
    @keyframes radar-sweep { 0% { transform: rotate(0deg); } 100% { transform: rotate(360deg); } }
    @keyframes blip-appear { 0% { transform: scale(0); opacity: 0; } 60% { transform: scale(1.3); opacity: 1; } 100% { transform: scale(1); opacity: 0.9; } }
    @keyframes funnel-flow { 0% { transform: translateY(0); opacity: 1; } 100% { transform: translateY(180px); opacity: 0.6; } }
    @keyframes funnel-deflect { 0% { transform: translate(0, 0); opacity: 1; } 100% { transform: translate(60px, 40px); opacity: 0; } }
    @keyframes card-deal { 0% { transform: translateX(200px) rotate(5deg); opacity: 0; } 100% { transform: translateX(0) rotate(0deg); opacity: 1; } }
    @keyframes ring-fill { 0% { stroke-dashoffset: var(--ring-circumference); } 100% { stroke-dashoffset: var(--ring-target); } }
    @keyframes scan-line { 0% { transform: translateX(-100%); } 100% { transform: translateX(100%); } }
    @keyframes cell-highlight { 0% { opacity: 0; } 100% { opacity: 0.85; } }
    @keyframes belt-move { 0% { transform: translateX(100%); } 100% { transform: translateX(-120%); } }
    @keyframes brick-place { 0% { transform: scale(0.6); opacity: 0; } 70% { transform: scale(1.05); opacity: 1; } 100% { transform: scale(1); opacity: 1; } }
    @keyframes wall-to-shield { 0% { clip-path: inset(0 0 0 0 round 4px); } 100% { clip-path: polygon(50% 0%, 100% 25%, 100% 75%, 50% 100%, 0% 75%, 0% 25%); } }
    @keyframes card-expand { 0% { max-height: 80px; } 100% { max-height: 300px; } }
    @keyframes fly-in-left { 0% { transform: translateX(-40px); opacity: 0; } 100% { transform: translateX(0); opacity: 1; } }
    @keyframes fly-in-right { 0% { transform: translateX(40px); opacity: 0; } 100% { transform: translateX(0); opacity: 1; } }
    @keyframes fly-in-top { 0% { transform: translateY(-40px); opacity: 0; } 100% { transform: translateY(0); opacity: 1; } }
    @keyframes fly-in-bottom { 0% { transform: translateY(40px); opacity: 0; } 100% { transform: translateY(0); opacity: 1; } }
    @keyframes timeline-draw { 0% { width: 0; } 100% { width: 100%; } }
    @keyframes draw-check { 0% { stroke-dashoffset: 100; } 100% { stroke-dashoffset: 0; } }
    @keyframes shimmer { 0% { background-position: -200% 0; } 100% { background-position: 200% 0; } }
    @keyframes pulse-glow { 0%, 100% { opacity: 0.4; } 50% { opacity: 1; } }
    @keyframes reveal-up { 0% { opacity: 0; transform: translateY(12px); } 100% { opacity: 1; transform: translateY(0); } }
    @keyframes count-up-reveal { 0% { transform: translateY(8px); opacity: 0; } 100% { transform: translateY(0); opacity: 1; } }
    @keyframes progress-pulse { 0%, 100% { opacity: 1; } 50% { opacity: 0.6; } }
    @keyframes ticker-scroll { 0% { transform: translateX(0); } 100% { transform: translateX(-50%); } }
    @keyframes hub-pulse { 0%, 100% { filter: drop-shadow(0 0 4px ${BRAND}40); } 50% { filter: drop-shadow(0 0 16px ${BRAND}80); } }
    @keyframes lens-float { 0%, 100% { transform: translateY(0); } 50% { transform: translateY(-6px); } }
  `}</style>
);

// ============================================================================
// SHARED: Wizard Step Indicator
// ============================================================================
function WizardStepIndicator({ activeIndex, variant = 'default' }: { activeIndex: number; variant?: 'default' | 'intel' | 'forge' }) {
  const steps: { label: string; icon: IconName }[] = [
    { label: 'Source', icon: 'upload' },
    { label: 'Scan', icon: 'search' },
    { label: 'Parsing', icon: 'refresh-cw' },
    { label: 'Preview', icon: 'eye' },
    { label: 'Import', icon: 'download' },
    { label: 'Results', icon: 'check-circle' },
  ];
  return (
    <div className="flex items-center justify-center gap-1 mb-6">
      {steps.map((step, i) => {
        const done = i < activeIndex;
        const active = i === activeIndex;
        return (
          <React.Fragment key={step.label}>
            {i > 0 && (
              <div className={`w-8 h-[2px] rounded-full transition-all duration-500 ${done ? 'bg-[#783264]/50' : 'bg-outline-variant/20'}`} />
            )}
            <div className="flex flex-col items-center gap-1 relative">
              <div className={`w-8 h-8 rounded-full flex items-center justify-center text-xs transition-all ${
                done ? 'bg-[#783264]/15 text-[#783264]'
                : active ? 'border-2 border-[#783264] text-[#783264]'
                : 'border border-outline-variant/25 text-on-surface-variant/30'
              }`}>
                {done ? <Icon name="check" className="w-3.5 h-3.5" /> : <Icon name={step.icon} className="w-3.5 h-3.5" />}
              </div>
              <span className={`text-[9px] font-medium ${
                done ? 'text-[#783264]' : active ? 'text-on-surface' : 'text-on-surface-variant/30'
              }`}>{step.label}</span>
            </div>
          </React.Fragment>
        );
      })}
    </div>
  );
}

// ============================================================================
// SHARED UTILITIES
// ============================================================================
function CountUpNumber({ value, suffix = '', className = '' }: { value: number; suffix?: string; className?: string }) {
  const [display, setDisplay] = useState(0);
  useEffect(() => {
    const duration = 1200;
    const startTime = Date.now();
    const tick = () => {
      const elapsed = Date.now() - startTime;
      const progress = Math.min(elapsed / duration, 1);
      const eased = 1 - Math.pow(1 - progress, 3);
      setDisplay(Math.round(eased * value));
      if (progress < 1) requestAnimationFrame(tick);
    };
    const timer = setTimeout(() => requestAnimationFrame(tick), 300);
    return () => clearTimeout(timer);
  }, [value]);
  return <span className={className}>{display.toLocaleString()}{suffix}</span>;
}

// ============================================================================
// SHARED DATA
// ============================================================================
const SOURCES: { id: 'zip' | 'files' | 'github'; label: string; desc: string; icon: IconName }[] = [
  { id: 'zip' as const, label: 'ZIP Archive', desc: 'Upload a ZIP file containing detection rules', icon: 'archive' },
  { id: 'files' as const, label: 'Individual Files', desc: 'Upload one or more YAML/JSON detection rule files', icon: 'file-text' },
  { id: 'github' as const, label: 'GitHub Repository', desc: 'Import directly from a public GitHub repository', icon: 'github' },
];
const VENDORS: { id: string; label: string; icon: IconName }[] = [
  { id: 'auto', label: 'Auto-Detect', icon: 'zap' },
  { id: 'sigma', label: 'Sigma', icon: 'shield' },
  { id: 'splunk_escu', label: 'Splunk ESCU', icon: 'database' },
  { id: 'elastic', label: 'Elastic', icon: 'search' },
  { id: 'kql', label: 'Sentinel', icon: 'cloud' },
  { id: 'crowdstrike', label: 'CrowdStrike', icon: 'crosshair' },
  { id: 'chronicle', label: 'Chronicle', icon: 'layers' },
];
const DUP_OPTIONS: { id: string; label: string; icon: IconName }[] = [
  { id: 'skip', label: 'Skip Duplicates', icon: 'chevron-right' },
  { id: 'update', label: 'Update Existing', icon: 'refresh-cw' },
  { id: 'create_new', label: 'Create New', icon: 'copy' },
];
const MOCK_RULES = [
  { title: 'Suspicious PowerShell Download Cradle', id: 'e0f8ab85-0ac9-423b', severity: 'High', mitre: ['T1059.001', 'T1105'], quality: 82, vendor: 'SIGMA', status: 'valid', selected: true },
  { title: 'Mimikatz Use', id: '06d71506-7beb-4f22', severity: 'Critical', mitre: ['T1003.001'], quality: 95, vendor: 'SIGMA', status: 'valid', selected: true },
  { title: 'Registry Run Key Persistence', id: 'a9b10f3c-55ea-4d7f', severity: 'Medium', mitre: ['T1547.001'], quality: 71, vendor: 'SIGMA', status: 'warning', selected: true },
  { title: 'Scheduled Task Creation', id: 'fbb1a9c0-0e2d-4cc1', severity: 'Medium', mitre: ['T1053.005'], quality: 68, vendor: 'SIGMA', status: 'duplicate', selected: false },
  { title: 'WMI Process Call Create', id: '3a7c2b1f-5d93-41ab', severity: 'High', mitre: ['T1047'], quality: 45, vendor: 'SIGMA', status: 'error', selected: false },
];
const SEVERITY_COLORS: Record<string, string> = { Critical: '#DC2626', High: '#D97706', Medium: '#0D9488', Low: '#3B82F6', Informational: '#6B7280' };
const STATUS_COLORS: Record<string, string> = { valid: COLORS.success, warning: COLORS.warning, error: COLORS.failure, duplicate: BRAND };
const STATUS_ICONS: Record<string, IconName> = { valid: 'check-circle', warning: 'alert-triangle', error: 'x-circle', duplicate: 'copy' };
const TERMINAL_FILES = [
  'rules/windows/process_creation/proc_creation_win_susp_powershell.yml',
  'rules/windows/registry/registry_set_persistence_run_key.yml',
  'rules/linux/process_creation/proc_creation_lnx_base64_decode.yml',
  'rules/network/net_connection_win_binary_susp_com.yml',
  'rules/windows/image_load/image_load_mimikatz.yml',
];
const TACTIC_DATA = [
  { tactic: 'Execution', count: 847, max: 900 },
  { tactic: 'Persistence', count: 612, max: 900 },
  { tactic: 'Defense Evasion', count: 534, max: 900 },
  { tactic: 'Discovery', count: 421, max: 900 },
  { tactic: 'Credential Access', count: 389, max: 900 },
  { tactic: 'Lateral Movement', count: 198, max: 900 },
  { tactic: 'Collection', count: 156, max: 900 },
  { tactic: 'C2', count: 312, max: 900 },
];
const ERROR_GROUPS = [
  { category: 'parse_error', label: 'Parse Errors', icon: 'code', color: '#D97706', count: 12,
    rules: [
      { title: 'Invalid YAML Rule 1', msg: 'Invalid YAML syntax at line 24', suggestion: 'Check rule formatting' },
      { title: 'Broken Detection Logic', msg: 'Missing required field: detection', suggestion: 'Add detection block' },
    ]
  },
  { category: 'duplicate', label: 'Duplicate Conflicts', icon: 'copy', color: BRAND, count: 4,
    rules: [{ title: 'Mimikatz Detection', msg: 'A detection with this ID already exists', suggestion: 'Change strategy to Update' }]
  },
  { category: 'database_error', label: 'Database Errors', icon: 'database', color: COLORS.failure, count: 2,
    rules: [{ title: 'Large Rule Payload', msg: 'Row exceeds maximum size limit', suggestion: 'Reduce rule content size' }]
  },
] satisfies { icon: IconName; [key: string]: unknown }[];

// ============================================================================
// OPTION A: "INTELLIGENCE FEED" — Reusable SVG Components
// ============================================================================

/** A1 Centerpiece: Central connection hub with radiating source nodes */
function ConnectionHub({ activeSource }: { activeSource: string }) {
  const nodes = [
    { id: 'zip', label: 'ZIP', angle: -40, icon: 'M-4,-4 L4,-4 L4,4 L-4,4Z' },
    { id: 'files', label: 'Files', angle: 0, icon: 'M-3,-5 L3,-5 L3,5 L-3,5Z' },
    { id: 'github', label: 'GitHub', angle: 40, icon: 'M0,-5 L5,0 L0,5 L-5,0Z' },
  ];
  const cx = 150, cy = 100, hubR = 32, nodeR = 20, beamLen = 85;

  return (
    <svg viewBox="0 0 300 200" className="w-full" style={{ maxHeight: 200 }}>
      {/* Hub center */}
      <circle cx={cx} cy={cy} r={hubR} fill={`${BRAND}15`} stroke={BRAND} strokeWidth="2"
        style={{ animation: activeSource ? 'hub-pulse 2s ease-in-out infinite' : 'none' }} />
      <circle cx={cx} cy={cy} r={hubR - 8} fill="none" stroke={`${BRAND}40`} strokeWidth="1" strokeDasharray="4 3" />
      <text x={cx} y={cy + 4} textAnchor="middle" className="text-[10px] font-bold" fill={BRAND}>HUB</text>

      {nodes.map((node) => {
        const rad = (node.angle * Math.PI) / 180;
        const nx = cx + Math.sin(rad) * (beamLen + nodeR + hubR);
        const ny = cy - Math.cos(rad) * (beamLen + nodeR + hubR) + 40;
        const isActive = activeSource === node.id;
        const bx1 = cx + Math.sin(rad) * (hubR + 4);
        const by1 = cy - Math.cos(rad) * (hubR + 4) + 40 - 40;
        const bx2 = nx;
        const by2 = ny;

        return (
          <g key={node.id}>
            {/* Beam line */}
            <line x1={bx1} y1={by1 + 40} x2={bx2} y2={by2}
              stroke={isActive ? BRAND : `${BRAND}20`}
              strokeWidth={isActive ? 2.5 : 1}
              strokeDasharray={isActive ? '8 4' : '4 4'}
              style={isActive ? { animation: 'beam-connect 0.8s ease-out forwards', strokeDashoffset: 0 } : {}}
            />
            {isActive && (
              <line x1={bx1} y1={by1 + 40} x2={bx2} y2={by2}
                stroke={BRAND} strokeWidth={4} opacity={0.2}
                strokeDasharray="8 4"
                style={{ animation: 'beam-connect 0.8s ease-out forwards' }}
              />
            )}
            {/* Node circle */}
            <circle cx={nx} cy={ny} r={nodeR}
              fill={isActive ? `${BRAND}25` : 'var(--surface-variant)'}
              stroke={isActive ? BRAND : 'var(--outline-variant)'}
              strokeWidth={isActive ? 2 : 1}
            />
            <text x={nx} y={ny + 3} textAnchor="middle" className="text-[9px] font-medium"
              fill={isActive ? BRAND : 'var(--on-surface-variant)'}>{node.label}</text>
          </g>
        );
      })}
    </svg>
  );
}

/** A2 Centerpiece: Rotating radar sweep with data blips */
function RadarSweep({ blips, scanning = true }: { blips: { x: number; y: number; label: string; delay: number }[]; scanning?: boolean }) {
  const size = 260, cx = size / 2, cy = size / 2, r = 110;
  return (
    <div className="relative flex justify-center">
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
        {/* Concentric rings */}
        {[0.33, 0.66, 1].map((s, i) => (
          <circle key={i} cx={cx} cy={cy} r={r * s} fill="none" stroke={`${BRAND}15`} strokeWidth="1" />
        ))}
        {/* Cross lines */}
        <line x1={cx} y1={cy - r} x2={cx} y2={cy + r} stroke={`${BRAND}10`} strokeWidth="1" />
        <line x1={cx - r} y1={cy} x2={cx + r} y2={cy} stroke={`${BRAND}10`} strokeWidth="1" />

        {/* Sweep line */}
        {scanning && (
          <g style={{ transformOrigin: `${cx}px ${cy}px`, animation: 'radar-sweep 4s linear infinite' }}>
            <line x1={cx} y1={cy} x2={cx} y2={cy - r} stroke={BRAND} strokeWidth="2" opacity={0.8} />
            {/* Sweep gradient trail */}
            <path d={`M${cx},${cy} L${cx},${cy - r} A${r},${r} 0 0,1 ${cx + r * 0.26},${cy - r * 0.97} Z`}
              fill={`${BRAND}12`} />
          </g>
        )}

        {/* Data blips */}
        {blips.map((blip, i) => (
          <g key={i}>
            <circle cx={cx + blip.x} cy={cy + blip.y} r={5} fill={BRAND}
              style={{ animation: `blip-appear 0.5s ease-out ${blip.delay}s both` }} />
            <circle cx={cx + blip.x} cy={cy + blip.y} r={9} fill="none" stroke={`${BRAND}40`} strokeWidth="1"
              style={{ animation: `blip-appear 0.5s ease-out ${blip.delay + 0.1}s both` }} />
          </g>
        ))}

        {/* Center dot */}
        <circle cx={cx} cy={cy} r={4} fill={BRAND} />
      </svg>
    </div>
  );
}

/** A3 Centerpiece: Processing funnel with flowing dots */
function ProcessingFunnel({ phase = 1, validCount = 2092, errorCount = 18 }: { phase?: number; validCount?: number; errorCount?: number }) {
  const w = 280, h = 200;
  const gates = [
    { label: 'Fetch', y: 30 },
    { label: 'Parse', y: 100 },
    { label: 'Validate', y: 170 },
  ];

  return (
    <div className="relative">
      <svg viewBox={`0 0 ${w} ${h}`} className="w-full" style={{ maxHeight: h }}>
        {/* Funnel outline */}
        <path d={`M${w * 0.15},10 L${w * 0.85},10 L${w * 0.65},${h - 10} L${w * 0.35},${h - 10} Z`}
          fill={`${BRAND}05`} stroke={`${BRAND}20`} strokeWidth="1" />

        {/* Gate lines */}
        {gates.map((gate, i) => {
          const shrink = i * 18;
          const isActive = i + 1 <= phase;
          return (
            <g key={gate.label}>
              <line x1={w * 0.15 + shrink} y1={gate.y} x2={w * 0.85 - shrink} y2={gate.y}
                stroke={isActive ? BRAND : `${BRAND}20`} strokeWidth={isActive ? 2 : 1}
                strokeDasharray={isActive ? 'none' : '4 3'} />
              <rect x={w * 0.15 + shrink - 1} y={gate.y - 10} width={w * 0.7 - shrink * 2 + 2} height={20}
                fill={isActive ? `${BRAND}08` : 'transparent'} rx={4} />
              <text x={w / 2} y={gate.y + 4} textAnchor="middle" className="text-[9px] font-semibold"
                fill={isActive ? BRAND : `${BRAND}40`}>{gate.label}</text>
            </g>
          );
        })}

        {/* Flowing dots (valid) */}
        {[0, 1, 2, 3, 4].map(i => (
          <circle key={`v${i}`} r={3.5} fill={COLORS.success}
            style={{
              animation: `funnel-flow 2s ease-in ${i * 0.4}s infinite`,
              cx: w / 2 + (i % 2 === 0 ? -8 : 8),
              cy: 5,
            } as React.CSSProperties} />
        ))}

        {/* Error dot deflecting */}
        <circle r={3.5} fill={COLORS.failure}
          style={{ animation: 'funnel-deflect 1.5s ease-in 1.2s infinite', cx: w / 2 + 15, cy: 100 } as React.CSSProperties} />
      </svg>
    </div>
  );
}

/** A4 Centerpiece: Stacked dossier cards that deal in */
function DossierCards({ rules }: { rules: typeof MOCK_RULES }) {
  return (
    <div className="relative h-[280px] flex items-center justify-center">
      {rules.map((rule, i) => {
        const rotation = (i - 2) * 3;
        const offsetX = (i - 2) * 8;
        const offsetY = i * 2;
        const zIndex = rules.length - Math.abs(i - 2);
        return (
          <div key={rule.id}
            className="absolute w-[320px] rounded-xl border bg-surface-container p-4 shadow-lg hover:scale-105 hover:z-50 transition-transform cursor-pointer"
            style={{
              borderColor: STATUS_COLORS[rule.status] || 'var(--outline-variant)',
              transform: `translateX(${offsetX}px) translateY(${offsetY}px) rotate(${rotation}deg)`,
              zIndex,
              animation: `card-deal 0.5s ease-out ${i * 0.15}s both`,
            }}>
            <div className="flex items-start justify-between mb-2">
              <div>
                <p className="text-sm font-semibold text-on-surface">{rule.title}</p>
                <p className="text-[10px] text-on-surface-variant font-mono mt-0.5">{rule.id}</p>
              </div>
              <span className="px-2 py-0.5 rounded-full text-[10px] font-bold text-white"
                style={{ backgroundColor: SEVERITY_COLORS[rule.severity] }}>{rule.severity}</span>
            </div>
            <div className="flex items-center gap-2 mt-2">
              {rule.mitre.map(t => (
                <span key={t} className="px-1.5 py-0.5 rounded text-[9px] font-mono" style={{ backgroundColor: `${BRAND}15`, color: BRAND }}>{t}</span>
              ))}
              <div className="flex-1" />
              <div className="flex items-center gap-1">
                <div className="w-16 h-1.5 rounded-full bg-surface-variant overflow-hidden">
                  <div className="h-full rounded-full" style={{ width: `${rule.quality}%`, backgroundColor: rule.quality > 70 ? COLORS.success : COLORS.warning }} />
                </div>
                <span className="text-[9px] text-on-surface-variant">{rule.quality}%</span>
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}

/** A5 Centerpiece: Shield SVG with concentric rings filling */
function ShieldConstruction({ percent }: { percent: number }) {
  const size = 240, cx = size / 2, cy = size / 2;
  const rings = [
    { r: 30, label: 'Core' },
    { r: 52, label: 'Inner' },
    { r: 74, label: 'Mid' },
    { r: 96, label: 'Outer' },
  ];
  const filledRings = Math.floor((percent / 100) * rings.length);

  return (
    <div className="flex flex-col items-center">
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
        {/* Shield shape background */}
        <path d={`M${cx},${cy - 105} L${cx + 85},${cy - 60} L${cx + 85},${cy + 30} L${cx},${cy + 105} L${cx - 85},${cy + 30} L${cx - 85},${cy - 60} Z`}
          fill={`${BRAND}05`} stroke={`${BRAND}15`} strokeWidth="1" />

        {rings.map((ring, i) => {
          const circ = 2 * Math.PI * ring.r;
          const isFilled = i < filledRings;
          const isPartial = i === filledRings;
          const partialPercent = isPartial ? (percent % 25) / 25 : 0;
          const offset = isFilled ? 0 : isPartial ? circ * (1 - partialPercent) : circ;

          return (
            <g key={i}>
              <circle cx={cx} cy={cy} r={ring.r} fill="none" stroke={`${BRAND}10`} strokeWidth="6" />
              <circle cx={cx} cy={cy} r={ring.r} fill="none" stroke={BRAND} strokeWidth="6"
                strokeDasharray={circ} strokeDashoffset={offset} strokeLinecap="round"
                opacity={isFilled ? 0.8 : 0.5}
                style={{ transition: 'stroke-dashoffset 1.2s ease-out', transitionDelay: `${i * 0.3}s` }}
                transform={`rotate(-90 ${cx} ${cy})`} />
            </g>
          );
        })}

        {/* Center percentage */}
        <text x={cx} y={cy + 8} textAnchor="middle" className="text-2xl font-black" fill={BRAND}>{percent}%</text>
        <text x={cx} y={cy + 22} textAnchor="middle" className="text-[9px]" fill={`${BRAND}80`}>imported</text>

        {/* Inner glow */}
        <circle cx={cx} cy={cy} r={20} fill={BRAND} opacity={0.08}
          style={{ animation: 'pulse-glow 2s ease-in-out infinite' }} />
      </svg>
    </div>
  );
}

/** A6 Component: Horizontal pipeline timeline */
function PipelineTimeline({ nodes, animate = true }: { nodes: { label: string; value: number }[]; animate?: boolean }) {
  return (
    <div className="relative mt-6">
      {/* Background track */}
      <div className="h-[2px] bg-outline-variant/20 rounded-full relative">
        {animate && (
          <div className="absolute inset-y-0 left-0 rounded-full" style={{ backgroundColor: BRAND, animation: 'timeline-draw 2s ease-out 1.5s both', height: 2 }} />
        )}
      </div>
      {/* Nodes */}
      <div className="flex justify-between -mt-3">
        {nodes.map((node, i) => (
          <div key={node.label} className="flex flex-col items-center"
            style={{ animation: animate ? `reveal-up 0.4s ease-out ${1.5 + i * 0.4}s both` : 'none' }}>
            <div className="w-6 h-6 rounded-full flex items-center justify-center text-white text-[8px] font-bold"
              style={{ backgroundColor: BRAND }}>
              {i + 1}
            </div>
            <span className="text-[9px] text-on-surface-variant mt-1">{node.label}</span>
            <span className="text-xs font-bold text-on-surface"><CountUpNumber value={node.value} /></span>
          </div>
        ))}
      </div>
    </div>
  );
}

// ============================================================================
// OPTION A: "INTELLIGENCE FEED" — Step Components
// ============================================================================

function IntelSourceStep() {
  const [source, setSource] = useState<'zip' | 'files' | 'github'>('github');
  const [vendor, setVendor] = useState('auto');

  return (
    <div className="rounded-2xl border border-outline-variant/20 bg-surface-container overflow-hidden">
      <div className="px-6 pt-5 pb-2"><WizardStepIndicator activeIndex={0} variant="intel" /></div>
      <div className="px-6 pb-6">
        {/* CENTERPIECE: Connection Hub */}
        <ConnectionHub activeSource={source} />

        {/* Source selection as horizontal strip */}
        <div className="flex gap-3 mt-4 overflow-x-auto pb-2">
          {SOURCES.map(s => (
            <button key={s.id} onClick={() => setSource(s.id)}
              className={`flex-shrink-0 px-4 py-3 rounded-xl border-2 text-left transition-all flex items-center gap-3 min-w-[160px] ${
                source === s.id ? '' : 'border-outline-variant/30 hover:bg-surface-container'}`}
              style={source === s.id ? { borderColor: BRAND, backgroundColor: `${BRAND}12` } : {}}>
              <div className="p-2 rounded-full" style={source === s.id ? { backgroundColor: BRAND, color: 'white' } : { backgroundColor: 'var(--surface-variant)' }}>
                <Icon name={s.icon} className="w-4 h-4" />
              </div>
              <div>
                <p className="text-sm font-medium" style={source === s.id ? { color: BRAND } : {}}>{s.label}</p>
                <p className="text-[10px] text-on-surface-variant">{s.desc}</p>
              </div>
            </button>
          ))}
        </div>

        {/* GitHub input */}
        {source === 'github' && (
          <div className="mt-4">
            <div className="flex items-center gap-2 bg-gray-900 rounded-lg px-4 py-2.5">
              <Icon name="github" className="w-4 h-4 text-gray-400" />
              <input type="text" defaultValue="https://github.com/SigmaHQ/sigma" readOnly
                className="bg-transparent text-sm text-green-400 font-mono flex-1 outline-none" />
            </div>
          </div>
        )}

        {/* Compact bottom bar: vendor + library + duplicate */}
        <div className="mt-5 flex items-center gap-4 p-3 rounded-xl bg-surface-variant/10 border border-outline-variant/15">
          <div className="flex items-center gap-2 flex-1">
            <span className="text-[10px] text-on-surface-variant font-medium">Vendor:</span>
            <select value={vendor} onChange={e => setVendor(e.target.value)}
              className="text-xs bg-transparent border border-outline-variant/30 rounded-lg px-2 py-1 text-on-surface">
              {VENDORS.map(v => <option key={v.id} value={v.id}>{v.label}</option>)}
            </select>
          </div>
          <div className="flex items-center gap-2 flex-1">
            <span className="text-[10px] text-on-surface-variant font-medium">Library:</span>
            <span className="text-xs text-on-surface">My Library</span>
          </div>
          <div className="flex items-center gap-2 flex-1">
            <span className="text-[10px] text-on-surface-variant font-medium">Duplicates:</span>
            <span className="text-xs text-on-surface">Skip</span>
          </div>
          <button className="px-5 py-2 rounded-full text-sm font-medium text-white flex items-center gap-2"
            style={{ backgroundColor: BRAND }}>
            Connect <Icon name="zap" className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>
    </div>
  );
}

function IntelScanStep() {
  const blips = [
    { x: -40, y: -50, label: 'windows/', delay: 0.5 },
    { x: 30, y: -30, label: 'linux/', delay: 1.2 },
    { x: -60, y: 20, label: 'network/', delay: 1.8 },
    { x: 50, y: 40, label: 'cloud/', delay: 2.5 },
    { x: -10, y: 60, label: 'web/', delay: 3.0 },
    { x: 70, y: -60, label: 'macos/', delay: 3.5 },
  ];

  return (
    <div className="rounded-2xl border border-outline-variant/20 bg-surface-container overflow-hidden">
      <div className="px-6 pt-5 pb-2"><WizardStepIndicator activeIndex={1} variant="intel" /></div>
      <div className="px-6 pb-6">
        <h3 className="text-lg font-semibold text-on-surface mb-1">Source Analysis</h3>
        <p className="text-xs text-on-surface-variant font-mono mb-4">SigmaHQ/sigma</p>

        {/* CENTERPIECE: Radar Sweep */}
        <RadarSweep blips={blips} />

        {/* Stats at compass points around the radar */}
        <div className="grid grid-cols-3 gap-4 mt-4">
          {([
            { label: 'Matching files', value: 3247, icon: 'file-text' },
            { label: 'Estimated rules', value: 3247, icon: 'shield', prefix: '~' },
            { label: 'Rate limit remaining', value: 4892, icon: 'clock', suffix: '/5,000' },
          ] satisfies { label: string; value: number; icon: IconName; prefix?: string; suffix?: string }[]).map((stat, i) => (
            <div key={stat.label} className="text-center p-3 rounded-xl bg-surface-variant/10 border border-outline-variant/15"
              style={{ animation: `reveal-up 0.4s ease-out ${0.5 + i * 0.3}s both` }}>
              <Icon name={stat.icon} className="w-4 h-4 mx-auto mb-1" style={{ color: BRAND }} />
              <div className="text-xl font-bold text-on-surface">
                {stat.prefix}<CountUpNumber value={stat.value} />{stat.suffix}
              </div>
              <p className="text-[9px] text-on-surface-variant mt-0.5">{stat.label}</p>
            </div>
          ))}
        </div>

        <div className="flex justify-between mt-5">
          <button className="px-4 py-2 text-sm text-on-surface-variant rounded-full flex items-center gap-2">
            <Icon name="arrow-left" className="w-4 h-4" /> Back
          </button>
          <button className="px-6 py-2.5 rounded-full text-sm font-medium text-white flex items-center gap-2"
            style={{ backgroundColor: BRAND }}>
            Begin Scan <Icon name="search" className="w-4 h-4" />
          </button>
        </div>
      </div>
    </div>
  );
}

function IntelScanExceeded() {
  const blips = [
    { x: -40, y: -50, label: '', delay: 0.5 },
    { x: 30, y: -30, label: '', delay: 1.2 },
  ];

  return (
    <div className="rounded-2xl border border-outline-variant/20 bg-surface-container overflow-hidden">
      <div className="px-6 pt-5 pb-2"><WizardStepIndicator activeIndex={1} variant="intel" /></div>
      <div className="px-6 pb-6">
        <h3 className="text-lg font-semibold text-on-surface mb-4">Source Analysis</h3>
        <RadarSweep blips={blips} scanning={false} />
        <div className="mt-4 p-4 rounded-xl border-2 border-dashed flex items-center gap-3"
          style={{ borderColor: COLORS.warning, backgroundColor: `${COLORS.warning}10` }}>
          <Icon name="alert-triangle" className="w-5 h-5" style={{ color: COLORS.warning }} />
          <div>
            <p className="text-sm font-semibold text-on-surface">Rate Limit Exceeded</p>
            <p className="text-xs text-on-surface-variant">GitHub API rate limit reached. Authenticate to get 5,000 requests/hour.</p>
          </div>
          <button className="ml-auto px-4 py-2 rounded-full text-xs font-medium text-white"
            style={{ backgroundColor: BRAND }}>
            <Icon name="github" className="w-3 h-3 inline mr-1" /> Authenticate
          </button>
        </div>
      </div>
    </div>
  );
}

function IntelParsingStep() {
  return (
    <div className="rounded-2xl border border-outline-variant/20 bg-surface-container overflow-hidden">
      <div className="px-6 pt-5 pb-2"><WizardStepIndicator activeIndex={2} variant="intel" /></div>
      <div className="px-6 pb-6">
        {/* VERTICAL COMPOSITION */}

        {/* Top: Scrolling file ticker */}
        <div className="bg-gray-900 rounded-lg px-3 py-2 font-mono text-[10px] text-green-400 overflow-hidden mb-4 relative">
          <div className="flex whitespace-nowrap" style={{ animation: 'ticker-scroll 12s linear infinite' }}>
            {[...TERMINAL_FILES, ...TERMINAL_FILES].map((f, i) => (
              <span key={i} className="mr-6 opacity-70">{f}</span>
            ))}
          </div>
        </div>

        {/* CENTERPIECE: Processing Funnel */}
        <ProcessingFunnel phase={2} />

        {/* Bottom: 4 stat counters */}
        <div className="grid grid-cols-4 gap-3 mt-4">
          {[
            { label: 'Total', value: 2178, color: 'var(--on-surface)' },
            { label: 'Valid', value: 2092, color: COLORS.success },
            { label: 'Warnings', value: 68, color: COLORS.warning },
            { label: 'Errors', value: 18, color: COLORS.failure },
          ].map((stat, i) => (
            <div key={stat.label} className="text-center p-2 rounded-lg bg-surface-variant/10">
              <CountUpNumber value={stat.value} className="text-lg font-bold" />
              <p className="text-[9px] text-on-surface-variant">{stat.label}</p>
              <div className="w-full h-1 mt-1 rounded-full overflow-hidden" style={{ backgroundColor: `${stat.color}20` }}>
                <div className="h-full rounded-full" style={{ backgroundColor: stat.color, width: `${(stat.value / 2178) * 100}%` }} />
              </div>
            </div>
          ))}
        </div>

        {/* Phase indicator */}
        <div className="flex items-center justify-center gap-3 mt-4">
          <span className="text-[10px] text-on-surface-variant">Phase:</span>
          {['Fetch', 'Parse', 'Validate'].map((phase, i) => (
            <span key={phase} className={`px-2 py-0.5 rounded-full text-[10px] font-medium ${
              i <= 1 ? 'text-white' : 'text-on-surface-variant border border-outline-variant/30'}`}
              style={i <= 1 ? { backgroundColor: BRAND } : {}}>
              {i < 1 && <Icon name="check" className="w-2.5 h-2.5 inline mr-0.5" />}{phase}
            </span>
          ))}
        </div>

        {/* Progress */}
        <div className="mt-4 text-center">
          <p className="text-sm text-on-surface-variant">67% complete · ETA 1:24</p>
          <div className="w-full h-2 mt-2 rounded-full bg-surface-variant/30 overflow-hidden">
            <div className="h-full rounded-full" style={{ width: '67%', backgroundColor: BRAND, transition: 'width 0.5s' }} />
          </div>
          <p className="text-[10px] text-on-surface-variant mt-1 font-mono">proc_creation_win_susp_powershell.yml</p>
        </div>
      </div>
    </div>
  );
}

function IntelParsingWaiting() {
  return (
    <div className="rounded-2xl border border-outline-variant/20 bg-surface-container overflow-hidden">
      <div className="px-6 pt-5 pb-2"><WizardStepIndicator activeIndex={2} variant="intel" /></div>
      <div className="px-6 pb-6">
        <ProcessingFunnel phase={1} />
        <div className="mt-4 p-4 rounded-xl border-2 flex items-center gap-3"
          style={{ borderColor: COLORS.warning, backgroundColor: `${COLORS.warning}08` }}>
          <div className="flex-shrink-0">
            <svg width="32" height="32" viewBox="0 0 32 32">
              <circle cx="16" cy="16" r="14" fill="none" stroke={`${COLORS.warning}30`} strokeWidth="3" />
              <circle cx="16" cy="16" r="14" fill="none" stroke={COLORS.warning} strokeWidth="3"
                strokeDasharray="88" strokeDashoffset="44" strokeLinecap="round"
                style={{ animation: 'radar-sweep 1.5s linear infinite', transformOrigin: '16px 16px' }} />
            </svg>
          </div>
          <div>
            <p className="text-sm font-semibold text-on-surface">Rate limit cooldown</p>
            <p className="text-xs text-on-surface-variant">Resuming in <span className="font-mono font-bold">47s</span> · 1,247 of 3,247 processed</p>
          </div>
        </div>
      </div>
    </div>
  );
}

function IntelPreviewStep() {
  return (
    <div className="rounded-2xl border border-outline-variant/20 bg-surface-container overflow-hidden">
      <div className="px-6 pt-5 pb-2"><WizardStepIndicator activeIndex={3} variant="intel" /></div>
      <div className="px-6 pb-6">
        {/* Summary bar */}
        <div className="flex items-center justify-between p-3 rounded-xl bg-surface-variant/10 border border-outline-variant/15 mb-5">
          {[
            { label: 'Total', value: 3247, color: 'var(--on-surface)' },
            { label: 'Valid', value: 3092, color: COLORS.success },
            { label: 'Warnings', value: 68, color: COLORS.warning },
            { label: 'Errors', value: 18, color: COLORS.failure },
            { label: 'Duplicates', value: 69, color: BRAND },
          ].map(stat => (
            <div key={stat.label} className="text-center px-3">
              <CountUpNumber value={stat.value} className="text-lg font-bold" />
              <p className="text-[9px]" style={{ color: stat.color }}>{stat.label}</p>
            </div>
          ))}
        </div>

        {/* CENTERPIECE: Dossier cards */}
        <DossierCards rules={MOCK_RULES} />

        {/* Command bar */}
        <div className="flex items-center gap-3 mt-4 p-3 rounded-xl bg-gray-900 text-gray-300">
          <Icon name="search" className="w-4 h-4 text-gray-500" />
          <span className="text-xs font-mono flex-1">Search rules...</span>
          <button className="px-3 py-1 rounded-lg text-[10px] font-medium bg-surface-variant/20 text-gray-400">Select All Valid</button>
          <button className="px-3 py-1 rounded-lg text-[10px] font-medium bg-surface-variant/20 text-gray-400">Deselect Warnings</button>
        </div>

        <div className="flex justify-between mt-5">
          <button className="px-4 py-2 text-sm text-on-surface-variant rounded-full flex items-center gap-2">
            <Icon name="arrow-left" className="w-4 h-4" /> Back
          </button>
          <button className="px-6 py-2.5 rounded-full text-sm font-medium text-white flex items-center gap-2"
            style={{ backgroundColor: BRAND }}>
            Import 3,092 Rules <Icon name="download" className="w-4 h-4" />
          </button>
        </div>
      </div>
    </div>
  );
}

function IntelImportStep() {
  return (
    <div className="rounded-2xl border border-outline-variant/20 bg-surface-container overflow-hidden">
      <div className="px-6 pt-5 pb-2"><WizardStepIndicator activeIndex={4} variant="intel" /></div>
      <div className="px-6 pb-6 flex flex-col items-center">
        {/* CENTERPIECE: Shield construction */}
        <ShieldConstruction percent={73} />

        {/* Stats row */}
        <div className="flex items-center gap-6 mt-4 text-center">
          {[
            { label: 'Imported', value: '2,258' },
            { label: 'Remaining', value: '834' },
            { label: 'Failed', value: '3' },
            { label: 'Rate', value: '14/sec' },
          ].map(stat => (
            <div key={stat.label}>
              <p className="text-lg font-bold text-on-surface">{stat.value}</p>
              <p className="text-[9px] text-on-surface-variant">{stat.label}</p>
            </div>
          ))}
        </div>

        {/* Timing */}
        <p className="text-xs text-on-surface-variant mt-3">Batch 45 of 62 · Elapsed 1:48 · ETA 0:42</p>

        {/* Cancel button */}
        <button className="mt-4 px-5 py-2 rounded-full text-sm font-medium border-2 text-on-surface-variant hover:border-red-400 hover:text-red-400 transition-colors"
          style={{ borderColor: 'var(--outline-variant)' }}>
          <Icon name="x" className="w-3.5 h-3.5 inline mr-1" /> Cancel Import
        </button>
      </div>
    </div>
  );
}

function IntelImportCancel() {
  return (
    <div className="rounded-2xl border border-outline-variant/20 bg-surface-container overflow-hidden">
      <div className="px-6 pt-5 pb-2"><WizardStepIndicator activeIndex={4} variant="intel" /></div>
      <div className="px-6 pb-6 flex flex-col items-center">
        <ShieldConstruction percent={73} />
        <div className="mt-4 p-4 rounded-xl border-2 border-red-500/50 bg-red-500/5 w-full max-w-sm text-center">
          <Icon name="alert-triangle" className="w-6 h-6 mx-auto mb-2 text-red-400" />
          <p className="text-sm font-semibold text-on-surface">Cancel Import?</p>
          <p className="text-xs text-on-surface-variant mt-1">2,258 rules already imported will be kept.</p>
          <div className="flex gap-3 mt-4 justify-center">
            <button className="px-4 py-2 rounded-full text-xs font-medium bg-surface-variant/30 text-on-surface-variant">Continue Import</button>
            <button className="px-4 py-2 rounded-full text-xs font-medium bg-red-500 text-white">Yes, Cancel</button>
          </div>
        </div>
      </div>
    </div>
  );
}

function IntelResultsStep() {
  const [act, setAct] = useState(0);
  useEffect(() => {
    const t1 = setTimeout(() => setAct(1), 100);
    const t2 = setTimeout(() => setAct(2), 900);
    const t3 = setTimeout(() => setAct(3), 1600);
    return () => { clearTimeout(t1); clearTimeout(t2); clearTimeout(t3); };
  }, []);

  return (
    <div className="rounded-2xl border border-outline-variant/20 bg-surface-container overflow-hidden">
      <div className="px-6 pt-5 pb-2"><WizardStepIndicator activeIndex={5} variant="intel" /></div>
      <div className="px-6 pb-6">
        {/* Act 1: Animated checkmark */}
        {act >= 1 && (
          <div className="flex flex-col items-center mb-6">
            <svg width={64} height={64} viewBox="0 0 48 48">
              <circle cx="24" cy="24" r="20" fill={`${COLORS.success}15`} />
              <circle cx="24" cy="24" r="20" fill="none" stroke={COLORS.success} strokeWidth="2.5" opacity={0.3} />
              <path d="M14 24 L22 32 L34 18" fill="none" stroke={COLORS.success} strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"
                style={{ strokeDasharray: 100, strokeDashoffset: 100, animation: 'draw-check 0.6s ease-out 0.2s forwards' }} />
            </svg>
            <h3 className="text-xl font-bold text-on-surface mt-3" style={{ animation: 'reveal-up 0.4s ease-out 0.3s both' }}>Import Successful!</h3>
            <p className="text-sm text-on-surface-variant mt-1" style={{ animation: 'reveal-up 0.4s ease-out 0.5s both' }}>3,092 detections added to your library</p>
          </div>
        )}

        {/* Act 2: Stats fly in from different directions */}
        {act >= 2 && (
          <div className="grid grid-cols-4 gap-4 mb-6">
            {[
              { label: 'Imported', value: 3092, color: COLORS.success, anim: 'fly-in-left' },
              { label: 'Skipped', value: 50, color: BRAND, anim: 'fly-in-top' },
              { label: 'Failed', value: 18, color: COLORS.failure, anim: 'fly-in-bottom' },
              { label: 'Duration', value: '2m 34s', color: 'var(--on-surface-variant)', anim: 'fly-in-right' },
            ].map((stat, i) => (
              <div key={stat.label} className="text-center p-3 rounded-xl border border-outline-variant/20 bg-surface-variant/5"
                style={{ animation: `${stat.anim} 0.5s ease-out ${i * 0.1}s both` }}>
                <p className="text-xl font-bold" style={{ color: stat.color }}>
                  {typeof stat.value === 'number' ? <CountUpNumber value={stat.value} /> : stat.value}
                </p>
                <p className="text-[9px] text-on-surface-variant">{stat.label}</p>
              </div>
            ))}
          </div>
        )}

        {/* Act 3: Pipeline timeline */}
        {act >= 3 && (
          <PipelineTimeline nodes={[
            { label: 'Fetched', value: 3247 },
            { label: 'Parsed', value: 3160 },
            { label: 'Validated', value: 3092 },
            { label: 'Imported', value: 3092 },
          ]} />
        )}

        {/* Error accordion */}
        <div className="mt-6 space-y-2">
          {ERROR_GROUPS.map(group => (
            <details key={group.category} className="rounded-xl border border-outline-variant/20 overflow-hidden">
              <summary className="px-4 py-3 flex items-center gap-3 cursor-pointer hover:bg-surface-variant/10 text-sm">
                <Icon name={group.icon} className="w-4 h-4" style={{ color: group.color }} />
                <span className="font-medium text-on-surface">{group.label}</span>
                <span className="ml-auto text-xs px-2 py-0.5 rounded-full" style={{ backgroundColor: `${group.color}15`, color: group.color }}>{group.count}</span>
              </summary>
              <div className="px-4 pb-3 space-y-2">
                {group.rules.map((r, i) => (
                  <div key={i} className="p-3 rounded-lg bg-surface-variant/10 text-xs">
                    <p className="font-medium text-on-surface">{r.title}</p>
                    <p className="text-on-surface-variant mt-0.5">{r.msg}</p>
                    <p className="mt-1 text-[10px]" style={{ color: BRAND }}>Suggestion: {r.suggestion}</p>
                  </div>
                ))}
              </div>
            </details>
          ))}
        </div>
      </div>
    </div>
  );
}

// ============================================================================
// OPTION B: "COVERAGE FORGE" — Reusable SVG Components
// ============================================================================

/** B-wide: Persistent coverage bar */
function CoverageBar({ percent, label = 'Coverage' }: { percent: number; label?: string }) {
  return (
    <div className="flex items-center gap-3 p-3 rounded-xl bg-surface-variant/10 border border-outline-variant/15">
      <span className="text-[10px] text-on-surface-variant font-medium w-16">{label}</span>
      <div className="flex-1 h-3 rounded-full bg-surface-variant/30 overflow-hidden relative">
        <div className="h-full rounded-full transition-all duration-1000" style={{ width: `${percent}%`, backgroundColor: BRAND }}>
          <div className="h-full rounded-full" style={{ background: `linear-gradient(90deg, ${BRAND}, ${BRAND}CC)`, animation: 'shimmer 2s linear infinite', backgroundSize: '200% 100%' }} />
        </div>
      </div>
      <span className="text-sm font-bold" style={{ color: BRAND }}>{percent}%</span>
    </div>
  );
}

/** B1: Blueprint card that expands when selected */
function BlueprintCard({ source, isActive, onClick, children }: { source: typeof SOURCES[0]; isActive: boolean; onClick: () => void; children?: React.ReactNode }) {
  return (
    <button onClick={onClick}
      className={`w-full text-left rounded-xl border-2 transition-all overflow-hidden relative ${isActive ? '' : 'border-outline-variant/30 hover:border-outline-variant/50'}`}
      style={isActive ? { borderColor: BRAND, backgroundColor: `${BRAND}06` } : {}}>
      {/* Grid line background */}
      <div className="absolute inset-0 pointer-events-none opacity-[0.04]">
        <svg width="100%" height="100%">
          <defs>
            <pattern id={`bp-${source.id}`} width="20" height="20" patternUnits="userSpaceOnUse">
              <rect width="20" height="20" fill="none" stroke={BRAND} strokeWidth="0.5" />
            </pattern>
          </defs>
          <rect width="100%" height="100%" fill={`url(#bp-${source.id})`} />
        </svg>
      </div>

      <div className="p-4 relative z-10">
        <div className="flex items-center gap-3">
          <div className="p-2 rounded-lg" style={isActive ? { backgroundColor: BRAND, color: 'white' } : { backgroundColor: 'var(--surface-variant)' }}>
            <Icon name={source.icon} className="w-5 h-5" />
          </div>
          <div>
            <p className="text-sm font-semibold" style={isActive ? { color: BRAND } : {}}>{source.label}</p>
            <p className="text-[10px] text-on-surface-variant">{source.desc}</p>
          </div>
          <Icon name={isActive ? 'chevron-down' : 'chevron-right'} className="w-4 h-4 ml-auto text-on-surface-variant" />
        </div>
      </div>

      {/* Expanded content */}
      {isActive && children && (
        <div className="px-4 pb-4 border-t border-outline-variant/15"
          style={{ animation: 'card-expand 0.4s ease-out both' }}>
          <div className="pt-3">{children}</div>
        </div>
      )}
    </button>
  );
}

/** B2 Centerpiece: Horizontal heatmap scan */
function RepoHeatmapScan({ scanning = true }: { scanning?: boolean }) {
  const cols = 40, rows = 8;
  const highlightCells = new Set([2,5,8,12,15,18,22,25,28,33,36,42,45,48,52,55,58,62,65,68,72,75,78,82,85,88,92,95,98,102,105,108,115,118,125,128,132,138,142,148,155,162,168,175,182,188,195,202,208,215,222,228,235,242,248,255,262,268,275,282,288,295,302,308,312,315,318]);

  return (
    <div className="relative overflow-hidden rounded-lg border border-outline-variant/15">
      {/* Scan line */}
      {scanning && (
        <div className="absolute inset-y-0 w-[2px] z-10"
          style={{ backgroundColor: BRAND, boxShadow: `0 0 12px ${BRAND}`, animation: 'scan-line 3s ease-in-out infinite' }} />
      )}

      {/* Grid of cells */}
      <div className="grid gap-[1px] p-2" style={{ gridTemplateColumns: `repeat(${cols}, 1fr)` }}>
        {Array.from({ length: cols * rows }, (_, i) => {
          const isHighlight = highlightCells.has(i);
          return (
            <div key={i} className="aspect-square rounded-[2px]"
              style={{
                backgroundColor: isHighlight ? BRAND : 'var(--surface-variant)',
                opacity: isHighlight ? 0.7 : 0.15,
                animation: isHighlight && scanning ? `cell-highlight 0.3s ease-out ${(i % cols) * 0.05}s both` : 'none',
              }} />
          );
        })}
      </div>
    </div>
  );
}

/** B3 Centerpiece: Horizontal conveyor belt */
function ConveyorBelt() {
  const blocks = [
    { name: 'susp_powershell', status: 'valid' },
    { name: 'mimikatz_use', status: 'valid' },
    { name: 'reg_run_key', status: 'warning' },
    { name: 'invalid_yaml', status: 'error' },
    { name: 'schtask_create', status: 'valid' },
    { name: 'wmi_process', status: 'valid' },
  ];
  const stations = ['Fetch', 'Parse', 'Validate'];

  return (
    <div className="relative py-8">
      {/* Belt track */}
      <div className="absolute left-0 right-0 top-1/2 -translate-y-1/2 h-8 bg-surface-variant/15 rounded-full border border-outline-variant/15" />

      {/* Station archways */}
      <div className="absolute left-0 right-0 top-1/2 -translate-y-1/2 flex justify-around pointer-events-none">
        {stations.map((station, i) => (
          <div key={station} className="flex flex-col items-center">
            <div className="w-20 h-12 rounded-t-xl border-2 border-b-0 flex items-center justify-center -mb-2"
              style={{ borderColor: i <= 1 ? BRAND : `${BRAND}30`, backgroundColor: i <= 1 ? `${BRAND}08` : 'transparent' }}>
              <span className="text-[10px] font-bold" style={{ color: i <= 1 ? BRAND : `${BRAND}50` }}>{station}</span>
            </div>
          </div>
        ))}
      </div>

      {/* Moving blocks */}
      <div className="relative h-8 overflow-hidden">
        {blocks.map((block, i) => {
          const statusColor = STATUS_COLORS[block.status] || BRAND;
          const isError = block.status === 'error';
          return (
            <div key={i} className="absolute top-1 h-6 px-2 rounded text-[8px] font-mono flex items-center gap-1 text-white"
              style={{
                backgroundColor: statusColor,
                animation: isError
                  ? `belt-move 5s linear ${i * 0.8}s infinite`
                  : `belt-move 5s linear ${i * 0.8}s infinite`,
                left: '0%',
              }}>
              {block.name}
              {block.status === 'warning' && <Icon name="alert-triangle" className="w-2.5 h-2.5" />}
              {block.status === 'error' && <Icon name="x" className="w-2.5 h-2.5" />}
            </div>
          );
        })}
      </div>
    </div>
  );
}

/** B4: Magnifying glass inspection lens */
function InspectionLens({ rule }: { rule: typeof MOCK_RULES[0] }) {
  return (
    <div className="flex justify-center mb-4" style={{ animation: 'lens-float 3s ease-in-out infinite' }}>
      <div className="relative">
        <svg width="120" height="120" viewBox="0 0 120 120">
          <circle cx="55" cy="55" r="45" fill={`${BRAND}05`} stroke={`${BRAND}30`} strokeWidth="3" />
          <line x1="88" y1="88" x2="112" y2="112" stroke={`${BRAND}40`} strokeWidth="6" strokeLinecap="round" />
          <circle cx="55" cy="55" r="35" fill="none" stroke={`${BRAND}12`} strokeWidth="1" />
        </svg>
        {/* Lens content */}
        <div className="absolute inset-0 flex items-center justify-center" style={{ width: 90, height: 90, top: 10, left: 10 }}>
          <div className="text-center">
            <p className="text-[8px] font-bold text-on-surface truncate w-20">{rule.title.split(' ').slice(0, 2).join(' ')}</p>
            <span className="text-[7px] px-1 rounded text-white" style={{ backgroundColor: SEVERITY_COLORS[rule.severity] }}>{rule.severity}</span>
            <p className="text-[7px] mt-0.5 font-mono" style={{ color: BRAND }}>{rule.mitre[0]}</p>
          </div>
        </div>
      </div>
    </div>
  );
}

/** B5 Centerpiece: Brick wall being constructed */
function BrickWall({ percent }: { percent: number }) {
  const cols = 12, rows = 8;
  const totalBricks = cols * rows;
  const filledCount = Math.floor((percent / 100) * totalBricks);

  // Fill from bottom-left to top-right
  const isFilled = (row: number, col: number): boolean => {
    const invertedRow = rows - 1 - row;
    const idx = invertedRow * cols + col;
    return idx < filledCount;
  };

  return (
    <div className="flex flex-col items-center">
      <div className="grid gap-[2px] p-2 rounded-lg border border-outline-variant/15 bg-surface-variant/5"
        style={{ gridTemplateColumns: `repeat(${cols}, 1fr)` }}>
        {Array.from({ length: totalBricks }, (_, i) => {
          const row = Math.floor(i / cols);
          const col = i % cols;
          const filled = isFilled(row, col);
          const invertedRow = rows - 1 - row;
          const delayIdx = invertedRow * cols + col;
          return (
            <div key={i} className="w-6 h-4 rounded-[2px]"
              style={{
                backgroundColor: filled ? BRAND : 'var(--surface-variant)',
                opacity: filled ? 0.75 : 0.12,
                animation: filled ? `brick-place 0.3s ease-out ${delayIdx * 0.02}s both` : 'none',
              }} />
          );
        })}
      </div>

      <p className="text-2xl font-black mt-3" style={{ color: BRAND }}>{percent}%</p>
      <p className="text-[10px] text-on-surface-variant">imported</p>
    </div>
  );
}

// ============================================================================
// OPTION B: "COVERAGE FORGE" — Step Components
// ============================================================================

function ForgeSourceStep() {
  const [source, setSource] = useState<'zip' | 'files' | 'github'>('github');

  return (
    <div className="rounded-2xl border border-outline-variant/20 bg-surface-container overflow-hidden">
      <div className="px-6 pt-5 pb-2"><WizardStepIndicator activeIndex={0} variant="forge" /></div>
      <div className="px-6 pb-6">
        <h3 className="text-lg font-semibold text-on-surface mb-4">Select Blueprint</h3>

        {/* CENTERPIECE: Blueprint cards that expand */}
        <div className="space-y-3">
          {SOURCES.map(s => (
            <BlueprintCard key={s.id} source={s} isActive={source === s.id} onClick={() => setSource(s.id)}>
              {s.id === 'github' && (
                <div className="flex items-center gap-2 bg-gray-900 rounded-lg px-3 py-2">
                  <Icon name="github" className="w-4 h-4 text-gray-400" />
                  <input type="text" defaultValue="https://github.com/SigmaHQ/sigma" readOnly
                    className="bg-transparent text-sm text-green-400 font-mono flex-1 outline-none" />
                </div>
              )}
              {s.id === 'zip' && (
                <div className="border-2 border-dashed border-outline-variant/40 rounded-lg p-4 text-center">
                  <Icon name="archive" className="w-5 h-5 mx-auto mb-1 text-on-surface-variant" />
                  <p className="text-xs text-on-surface-variant">Drop a ZIP file here</p>
                </div>
              )}
              {s.id === 'files' && (
                <div className="border-2 border-dashed border-outline-variant/40 rounded-lg p-4 text-center">
                  <Icon name="file-text" className="w-5 h-5 mx-auto mb-1 text-on-surface-variant" />
                  <p className="text-xs text-on-surface-variant">Drop YAML/JSON files here</p>
                </div>
              )}
            </BlueprintCard>
          ))}
        </div>

        {/* Vendor + options row */}
        <div className="mt-5 grid grid-cols-3 gap-3">
          <div className="p-3 rounded-xl bg-surface-variant/10 border border-outline-variant/15">
            <p className="text-[10px] text-on-surface-variant font-medium mb-1">Vendor</p>
            <p className="text-sm font-medium text-on-surface">Auto-Detect</p>
          </div>
          <div className="p-3 rounded-xl bg-surface-variant/10 border border-outline-variant/15">
            <p className="text-[10px] text-on-surface-variant font-medium mb-1">Library</p>
            <p className="text-sm font-medium text-on-surface">My Library</p>
          </div>
          <div className="p-3 rounded-xl bg-surface-variant/10 border border-outline-variant/15">
            <p className="text-[10px] text-on-surface-variant font-medium mb-1">Duplicates</p>
            <p className="text-sm font-medium text-on-surface">Skip</p>
          </div>
        </div>

        {/* Coverage promise bar */}
        <div className="mt-4">
          <CoverageBar percent={0} label="Coverage" />
          <p className="text-[10px] text-on-surface-variant text-center mt-1">0% → ? — Select a source to estimate</p>
        </div>

        <div className="flex justify-end mt-4">
          <button className="px-6 py-2.5 rounded-full text-sm font-medium text-white flex items-center gap-2"
            style={{ backgroundColor: BRAND }}>
            Start Scan <Icon name="search" className="w-4 h-4" />
          </button>
        </div>
      </div>
    </div>
  );
}

function ForgeScanStep() {
  return (
    <div className="rounded-2xl border border-outline-variant/20 bg-surface-container overflow-hidden">
      <div className="px-6 pt-5 pb-2"><WizardStepIndicator activeIndex={1} variant="forge" /></div>
      <div className="px-6 pb-6">
        <h3 className="text-lg font-semibold text-on-surface mb-1">Discovery Scan</h3>
        <p className="text-xs text-on-surface-variant font-mono mb-4">SigmaHQ/sigma</p>

        {/* CENTERPIECE: Repository heatmap scan */}
        <RepoHeatmapScan />

        {/* Stat cards - staggered reveal */}
        <div className="grid grid-cols-3 gap-4 mt-4">
          {[
            { label: 'Matching files', value: '3,247', sub: 'of 4,821 total', delay: '0.3s' },
            { label: 'Existing overlap', value: '142', sub: 'detections in library', delay: '0.6s' },
            { label: 'Rate limit', value: '4,892/5,000', sub: 'Authenticated', delay: '0.9s' },
          ].map(stat => (
            <div key={stat.label} className="p-3 rounded-xl border border-outline-variant/20 bg-surface-variant/5"
              style={{ animation: `reveal-up 0.4s ease-out ${stat.delay} both` }}>
              <p className="text-lg font-bold text-on-surface">{stat.value}</p>
              <p className="text-[9px] text-on-surface-variant">{stat.label}</p>
              <p className="text-[8px] text-on-surface-variant/60 mt-0.5">{stat.sub}</p>
            </div>
          ))}
        </div>

        {/* Coverage bar update */}
        <div className="mt-4">
          <CoverageBar percent={47} label="Est. Coverage" />
          <p className="text-[10px] text-on-surface-variant text-center mt-1">0% → ~47% estimated after import</p>
        </div>

        <div className="flex justify-between mt-5">
          <button className="px-4 py-2 text-sm text-on-surface-variant rounded-full flex items-center gap-2">
            <Icon name="arrow-left" className="w-4 h-4" /> Back
          </button>
          <button className="px-6 py-2.5 rounded-full text-sm font-medium text-white flex items-center gap-2"
            style={{ backgroundColor: BRAND }}>
            Begin Parsing <Icon name="refresh-cw" className="w-4 h-4" />
          </button>
        </div>
      </div>
    </div>
  );
}

function ForgeParsingStep() {
  return (
    <div className="rounded-2xl border border-outline-variant/20 bg-surface-container overflow-hidden">
      <div className="px-6 pt-5 pb-2"><WizardStepIndicator activeIndex={2} variant="forge" /></div>
      <div className="px-6 pb-6">
        {/* CENTERPIECE: Conveyor Belt */}
        <ConveyorBelt />

        {/* Multi-layer progress bars */}
        <div className="space-y-2 mt-2">
          {[
            { label: 'Fetch', percent: 100, color: COLORS.success },
            { label: 'Parse', percent: 67, color: BRAND },
            { label: 'Validate', percent: 34, color: `${BRAND}80` },
          ].map(layer => (
            <div key={layer.label} className="flex items-center gap-3">
              <span className="text-[10px] font-medium w-14 text-right text-on-surface-variant">{layer.label}</span>
              <div className="flex-1 h-2 rounded-full bg-surface-variant/20 overflow-hidden">
                <div className="h-full rounded-full transition-all duration-1000" style={{ width: `${layer.percent}%`, backgroundColor: layer.color }} />
              </div>
              <span className="text-[10px] w-8 text-on-surface-variant">{layer.percent}%</span>
            </div>
          ))}
        </div>

        {/* Current file */}
        <div className="mt-3 text-center">
          <p className="text-xs text-on-surface-variant">2,178 / 3,247 — <span className="font-mono text-[10px]">proc_creation_win_susp_powershell.yml</span></p>
          <p className="text-xs text-on-surface-variant mt-1">ETA 1:24</p>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-4 gap-3 mt-3">
          {[
            { label: 'Total', value: 2178 },
            { label: 'Valid', value: 2092 },
            { label: 'Warnings', value: 68 },
            { label: 'Errors', value: 18 },
          ].map(stat => (
            <div key={stat.label} className="text-center text-xs">
              <span className="font-bold text-on-surface">{stat.value.toLocaleString()}</span>
              <p className="text-[9px] text-on-surface-variant">{stat.label}</p>
            </div>
          ))}
        </div>

        {/* Coverage building */}
        <div className="mt-4">
          <CoverageBar percent={31} label="Building" />
        </div>
      </div>
    </div>
  );
}

function ForgeParsingWaiting() {
  return (
    <div className="rounded-2xl border border-outline-variant/20 bg-surface-container overflow-hidden">
      <div className="px-6 pt-5 pb-2"><WizardStepIndicator activeIndex={2} variant="forge" /></div>
      <div className="px-6 pb-6">
        <ConveyorBelt />
        <div className="mt-3 p-4 rounded-xl border-2 flex items-center gap-3"
          style={{ borderColor: COLORS.warning, backgroundColor: `${COLORS.warning}08` }}>
          <div className="flex-shrink-0">
            <svg width="32" height="32" viewBox="0 0 32 32">
              <circle cx="16" cy="16" r="14" fill="none" stroke={`${COLORS.warning}30`} strokeWidth="3" />
              <circle cx="16" cy="16" r="14" fill="none" stroke={COLORS.warning} strokeWidth="3"
                strokeDasharray="88" strokeDashoffset="44" strokeLinecap="round"
                style={{ animation: 'radar-sweep 1.5s linear infinite', transformOrigin: '16px 16px' }} />
            </svg>
          </div>
          <div>
            <p className="text-sm font-semibold text-on-surface">Rate limit cooldown</p>
            <p className="text-xs text-on-surface-variant">Resuming in <span className="font-mono font-bold">47s</span> · 1,247 of 3,247 processed</p>
          </div>
        </div>
        <div className="mt-4">
          <CoverageBar percent={18} label="Building" />
        </div>
      </div>
    </div>
  );
}

function ForgePreviewStep() {
  return (
    <div className="rounded-2xl border border-outline-variant/20 bg-surface-container overflow-hidden">
      <div className="px-6 pt-5 pb-2"><WizardStepIndicator activeIndex={3} variant="forge" /></div>
      <div className="px-6 pb-6">
        {/* Summary as gauge arcs */}
        <div className="flex justify-center gap-6 mb-4">
          {[
            { label: 'Valid', value: 3092, total: 3247, color: COLORS.success },
            { label: 'Warnings', value: 68, total: 3247, color: COLORS.warning },
            { label: 'Errors', value: 18, total: 3247, color: COLORS.failure },
          ].map(gauge => {
            const pct = Math.round((gauge.value / gauge.total) * 100);
            return (
              <div key={gauge.label} className="text-center">
                <svg width="60" height="36" viewBox="0 0 60 36">
                  <path d="M6 32 A24 24 0 0 1 54 32" fill="none" stroke="var(--surface-variant)" strokeWidth="5" strokeLinecap="round" opacity={0.2} />
                  <path d="M6 32 A24 24 0 0 1 54 32" fill="none" stroke={gauge.color} strokeWidth="5" strokeLinecap="round"
                    strokeDasharray="75" strokeDashoffset={75 - (pct / 100) * 75} />
                </svg>
                <p className="text-xs font-bold text-on-surface -mt-1">{gauge.value.toLocaleString()}</p>
                <p className="text-[9px] text-on-surface-variant">{gauge.label}</p>
              </div>
            );
          })}
        </div>

        {/* CENTERPIECE: Inspection lens */}
        <InspectionLens rule={MOCK_RULES[0]} />

        {/* Rules table with quality strip */}
        <div className="rounded-xl border border-outline-variant/15 overflow-hidden">
          {MOCK_RULES.map((rule, i) => (
            <div key={rule.id} className={`flex items-center gap-0 ${i > 0 ? 'border-t border-outline-variant/10' : ''} hover:bg-surface-variant/10 transition-colors`}>
              {/* Quality strip */}
              <div className="w-1.5 self-stretch" style={{ backgroundColor: rule.quality > 70 ? COLORS.success : rule.quality > 50 ? COLORS.warning : COLORS.failure }} />

              <div className="flex-1 px-3 py-2.5 flex items-center gap-3">
                <input type="checkbox" defaultChecked={rule.selected} className="rounded" />
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-medium text-on-surface truncate">{rule.title}</p>
                  <div className="flex items-center gap-2 mt-0.5">
                    <span className="text-[9px] font-mono text-on-surface-variant">{rule.id}</span>
                    {rule.mitre.map(t => (
                      <span key={t} className="text-[8px] px-1 rounded" style={{ backgroundColor: `${BRAND}10`, color: BRAND }}>{t}</span>
                    ))}
                  </div>
                </div>
                <span className="text-[10px] font-bold px-2 py-0.5 rounded-full text-white" style={{ backgroundColor: SEVERITY_COLORS[rule.severity] }}>{rule.severity}</span>
                <div className="flex items-center gap-1">
                  <Icon name={STATUS_ICONS[rule.status]} className="w-3.5 h-3.5" style={{ color: STATUS_COLORS[rule.status] }} />
                </div>
              </div>
            </div>
          ))}
        </div>

        <div className="flex justify-between mt-5">
          <button className="px-4 py-2 text-sm text-on-surface-variant rounded-full flex items-center gap-2">
            <Icon name="arrow-left" className="w-4 h-4" /> Back
          </button>
          <button className="px-6 py-2.5 rounded-full text-sm font-medium text-white flex items-center gap-2"
            style={{ backgroundColor: BRAND }}>
            Import 3,092 Rules <Icon name="download" className="w-4 h-4" />
          </button>
        </div>
      </div>
    </div>
  );
}

function ForgeImportStep() {
  return (
    <div className="rounded-2xl border border-outline-variant/20 bg-surface-container overflow-hidden">
      <div className="px-6 pt-5 pb-2"><WizardStepIndicator activeIndex={4} variant="forge" /></div>
      <div className="px-6 pb-6 flex flex-col items-center">
        {/* CENTERPIECE: Brick wall */}
        <BrickWall percent={73} />

        {/* Stats */}
        <div className="flex items-center gap-6 mt-4 text-center">
          {[
            { label: 'Imported', value: '2,258' },
            { label: 'Remaining', value: '834' },
            { label: 'Failed', value: '3' },
            { label: 'Rate', value: '14/sec' },
          ].map(stat => (
            <div key={stat.label}>
              <p className="text-lg font-bold text-on-surface">{stat.value}</p>
              <p className="text-[9px] text-on-surface-variant">{stat.label}</p>
            </div>
          ))}
        </div>
        <p className="text-xs text-on-surface-variant mt-2">Layer 45 of 62 · Elapsed 1:48 · ETA 0:42</p>

        {/* Coverage bar growing */}
        <div className="w-full mt-4">
          <CoverageBar percent={34} label="Building" />
        </div>

        <button className="mt-4 px-5 py-2 rounded-full text-sm font-medium border-2 text-on-surface-variant hover:border-red-400 hover:text-red-400 transition-colors"
          style={{ borderColor: 'var(--outline-variant)' }}>
          <Icon name="x" className="w-3.5 h-3.5 inline mr-1" /> Cancel Import
        </button>
      </div>
    </div>
  );
}

function ForgeImportCancel() {
  return (
    <div className="rounded-2xl border border-outline-variant/20 bg-surface-container overflow-hidden">
      <div className="px-6 pt-5 pb-2"><WizardStepIndicator activeIndex={4} variant="forge" /></div>
      <div className="px-6 pb-6 flex flex-col items-center">
        <BrickWall percent={73} />
        <div className="mt-4 p-4 rounded-xl border-2 border-red-500/50 bg-red-500/5 w-full max-w-sm text-center">
          <Icon name="alert-triangle" className="w-6 h-6 mx-auto mb-2 text-red-400" />
          <p className="text-sm font-semibold text-on-surface">Cancel Import?</p>
          <p className="text-xs text-on-surface-variant mt-1">2,258 rules already imported will be kept.</p>
          <div className="flex gap-3 mt-4 justify-center">
            <button className="px-4 py-2 rounded-full text-xs font-medium bg-surface-variant/30 text-on-surface-variant">Continue Import</button>
            <button className="px-4 py-2 rounded-full text-xs font-medium bg-red-500 text-white">Yes, Cancel</button>
          </div>
        </div>
      </div>
    </div>
  );
}

function ForgeResultsStep() {
  return (
    <div className="rounded-2xl border border-outline-variant/20 bg-surface-container overflow-hidden">
      <div className="px-6 pt-5 pb-2"><WizardStepIndicator activeIndex={5} variant="forge" /></div>
      <div className="px-6 pb-6">
        {/* Before / After comparison */}
        <div className="grid grid-cols-2 gap-6 mb-6">
          {/* Before */}
          <div className="text-center">
            <p className="text-[10px] font-medium text-on-surface-variant uppercase tracking-wider mb-2">Before</p>
            <div className="rounded-xl border border-outline-variant/15 p-3 bg-surface-variant/5">
              <BrickWall percent={12} />
            </div>
          </div>

          {/* After */}
          <div className="text-center">
            <p className="text-[10px] font-medium text-on-surface-variant uppercase tracking-wider mb-2">After</p>
            <div className="rounded-xl border-2 p-3" style={{ borderColor: `${BRAND}30`, backgroundColor: `${BRAND}03` }}>
              <BrickWall percent={60} />
            </div>
          </div>
        </div>

        {/* Coverage boost */}
        <div className="text-center mb-6">
          <span className="text-4xl font-black" style={{ color: BRAND }}>+48%</span>
          <p className="text-sm text-on-surface-variant mt-1">coverage improvement</p>
        </div>

        {/* Stats as "construction report" */}
        <div className="rounded-xl border border-outline-variant/20 overflow-hidden">
          <div className="px-4 py-2 bg-surface-variant/10 border-b border-outline-variant/15">
            <p className="text-xs font-bold text-on-surface">Construction Report</p>
          </div>
          <div className="p-4 grid grid-cols-2 gap-3">
            {[
              { label: 'Total Processed', value: '3,160' },
              { label: 'Successfully Imported', value: '3,092' },
              { label: 'Skipped (duplicates)', value: '50' },
              { label: 'Failed', value: '18' },
              { label: 'Duration', value: '2m 34s' },
              { label: 'Avg. Quality Score', value: '78%' },
            ].map(row => (
              <div key={row.label} className="flex justify-between items-center py-1 border-b border-outline-variant/10">
                <span className="text-[10px] text-on-surface-variant">{row.label}</span>
                <span className="text-xs font-bold text-on-surface">{row.value}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Tactic distribution */}
        <div className="mt-5">
          <p className="text-xs font-bold text-on-surface mb-3">Tactic Distribution</p>
          <div className="space-y-1.5">
            {TACTIC_DATA.map((d, i) => (
              <div key={d.tactic} className="flex items-center gap-2 text-[10px]">
                <span className="w-24 text-on-surface-variant truncate text-right">{d.tactic}</span>
                <div className="flex-1 h-2.5 bg-surface-variant/20 rounded-full overflow-hidden">
                  <div className="h-full rounded-full" style={{
                    width: `${(d.count / d.max) * 100}%`, backgroundColor: BRAND,
                    animation: `timeline-draw 0.7s ease-out ${i * 0.1}s both`,
                  }} />
                </div>
                <span className="w-8 text-on-surface-variant text-right">{d.count}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Coverage bar final */}
        <div className="mt-5">
          <CoverageBar percent={60} label="Final" />
        </div>

        {/* Error accordion */}
        <div className="mt-5 space-y-2">
          {ERROR_GROUPS.map(group => (
            <details key={group.category} className="rounded-xl border border-outline-variant/20 overflow-hidden">
              <summary className="px-4 py-3 flex items-center gap-3 cursor-pointer hover:bg-surface-variant/10 text-sm">
                <Icon name={group.icon} className="w-4 h-4" style={{ color: group.color }} />
                <span className="font-medium text-on-surface">{group.label}</span>
                <span className="ml-auto text-xs px-2 py-0.5 rounded-full" style={{ backgroundColor: `${group.color}15`, color: group.color }}>{group.count}</span>
              </summary>
              <div className="px-4 pb-3 space-y-2">
                {group.rules.map((r, i) => (
                  <div key={i} className="p-3 rounded-lg bg-surface-variant/10 text-xs">
                    <p className="font-medium text-on-surface">{r.title}</p>
                    <p className="text-on-surface-variant mt-0.5">{r.msg}</p>
                    <p className="mt-1 text-[10px]" style={{ color: BRAND }}>Suggestion: {r.suggestion}</p>
                  </div>
                ))}
              </div>
            </details>
          ))}
        </div>
      </div>
    </div>
  );
}

// ============================================================================
// MAIN PAGE EXPORT
// ============================================================================
export const BulkImportShowcasePage: React.FC = () => {
  return (
    <DesignSystemPage
      title="Bulk Import Wizard — Design Options"
      description="Two visual design directions for the 6-step import wizard. Option A: Intelligence Feed (SOC command center). Option B: Coverage Forge (building your defenses). Each step has a unique layout and animated centerpiece."
    >
      <AnimationStyles />

      {/* === OPTION A: INTELLIGENCE FEED === */}
      <div className="mb-16">
        <div className="text-center mb-8">
          <h2 className="text-2xl font-bold text-on-surface">Option A: Intelligence Feed</h2>
          <p className="text-sm text-on-surface-variant mt-2 max-w-2xl mx-auto">
            SOC command center running an intelligence gathering operation. Each step is a phase with its own unique visual center: connection hub, radar sweep, processing funnel, dossier cards, shield construction, and pipeline reveal.
          </p>
        </div>

        <div className="space-y-10">
          <Section title="A1. Source — Open Connection" description="Central hub SVG with radiating source nodes. Beam connects when source is selected. Compact bottom bar for vendor/library/duplicates.">
            <IntelSourceStep />
          </Section>

          <Section title="A2. Scan — Radar Sweep" description="Rotating radar with data blips appearing as files are discovered. Stats animate in at compass points.">
            <div className="space-y-8">
              <div>
                <div className="text-[10px] font-medium uppercase tracking-wider text-on-surface-variant/50 mb-3">Normal — Authenticated, within limits</div>
                <IntelScanStep />
              </div>
              <div>
                <div className="text-[10px] font-medium uppercase tracking-wider text-on-surface-variant/50 mb-3">Rate Limit Exceeded — Unauthenticated</div>
                <IntelScanExceeded />
              </div>
            </div>
          </Section>

          <Section title="A3. Parsing — Processing Stream" description="Scrolling file ticker, processing funnel with flowing/deflecting dots, phase indicators.">
            <div className="grid grid-cols-2 gap-6">
              <div>
                <div className="text-[10px] font-medium uppercase tracking-wider text-on-surface-variant/50 mb-3">Normal — Parsing in progress</div>
                <IntelParsingStep />
              </div>
              <div>
                <div className="text-[10px] font-medium uppercase tracking-wider text-on-surface-variant/50 mb-3">Rate Limit Waiting</div>
                <IntelParsingWaiting />
              </div>
            </div>
          </Section>

          <Section title="A4. Preview — Intel Briefing" description="Rules as overlapping dossier cards dealt onto a surface. Click to focus. Command bar for search/selection.">
            <IntelPreviewStep />
          </Section>

          <Section title="A5. Import — Shield Construction" description="Shield SVG with concentric rings filling as import progresses. Percentage in center.">
            <div className="grid grid-cols-2 gap-6">
              <div>
                <div className="text-[10px] font-medium uppercase tracking-wider text-on-surface-variant/50 mb-3">Normal — Importing</div>
                <IntelImportStep />
              </div>
              <div>
                <div className="text-[10px] font-medium uppercase tracking-wider text-on-surface-variant/50 mb-3">Cancel Confirmation</div>
                <IntelImportCancel />
              </div>
            </div>
          </Section>

          <Section title="A6. Results — Mission Debrief" description="Three-act staggered reveal: checkmark draws → stats fly in from 4 directions → pipeline timeline draws.">
            <IntelResultsStep />
          </Section>
        </div>
      </div>

      {/* === OPTION B: COVERAGE FORGE === */}
      <div className="mb-16">
        <div className="text-center mb-8">
          <h2 className="text-2xl font-bold text-on-surface">Option B: Coverage Forge</h2>
          <p className="text-sm text-on-surface-variant mt-2 max-w-2xl mx-auto">
            Building your detection coverage. Each step is a phase of construction. A persistent coverage bar grows across steps. Blueprint cards, heatmap scans, conveyor belts, brick walls, and before/after comparisons.
          </p>
        </div>

        <div className="space-y-10">
          <Section title="B1. Source — Select Blueprint" description="Expandable blueprint cards with grid-line backgrounds. Coverage promise bar starts empty.">
            <ForgeSourceStep />
          </Section>

          <Section title="B2. Scan — Discovery Scan" description="Horizontal heatmap with scan line revealing matching files. Coverage estimate updates.">
            <ForgeScanStep />
          </Section>

          <Section title="B3. Parsing — Assembly Line" description="Horizontal conveyor belt with blocks passing through sorting stations. Multi-layer progress.">
            <div className="grid grid-cols-2 gap-6">
              <div>
                <div className="text-[10px] font-medium uppercase tracking-wider text-on-surface-variant/50 mb-3">Normal — Parsing</div>
                <ForgeParsingStep />
              </div>
              <div>
                <div className="text-[10px] font-medium uppercase tracking-wider text-on-surface-variant/50 mb-3">Rate Limit Waiting</div>
                <ForgeParsingWaiting />
              </div>
            </div>
          </Section>

          <Section title="B4. Preview — Quality Inspection" description="Magnifying glass lens floats above. Rules table with full-height quality strip. Arc gauges for stats.">
            <ForgePreviewStep />
          </Section>

          <Section title="B5. Import — Wall Construction" description="Brick wall grid filling from bottom-left. Each brick bounces into place. Coverage bar grows.">
            <div className="grid grid-cols-2 gap-6">
              <div>
                <div className="text-[10px] font-medium uppercase tracking-wider text-on-surface-variant/50 mb-3">Normal — Importing</div>
                <ForgeImportStep />
              </div>
              <div>
                <div className="text-[10px] font-medium uppercase tracking-wider text-on-surface-variant/50 mb-3">Cancel Confirmation</div>
                <ForgeImportCancel />
              </div>
            </div>
          </Section>

          <Section title="B6. Results — Fortress Complete" description="Before/after brick walls, +48% coverage boost, construction report, tactic distribution bars.">
            <ForgeResultsStep />
          </Section>
        </div>
      </div>

      {/* === COMPARISON === */}
      <Section title="Comparison">
        <div className="grid grid-cols-2 gap-6">
          <div className="rounded-2xl bg-surface-container border border-outline-variant/20 p-6">
            <h4 className="font-semibold text-on-surface mb-3 flex items-center gap-2">
              <span className="w-2 h-2 rounded-full" style={{ backgroundColor: BRAND }} />
              Option A: Intelligence Feed
            </h4>
            <ul className="space-y-1.5 text-xs text-on-surface-variant">
              <li>+ Each step has a unique visual centerpiece (hub, radar, funnel, dossiers, shield, pipeline)</li>
              <li>+ Strong SOC/command-center narrative — "running an operation"</li>
              <li>+ Three-act results reveal creates dramatic payoff</li>
              <li>+ Dossier card layout makes preview feel like intel briefing</li>
              <li>- More complex animations = higher CPU on lower-end machines</li>
              <li>- Radar/funnel SVGs are less informational, more theatrical</li>
            </ul>
          </div>
          <div className="rounded-2xl bg-surface-container border border-outline-variant/20 p-6">
            <h4 className="font-semibold text-on-surface mb-3 flex items-center gap-2">
              <span className="w-2 h-2 rounded-full" style={{ backgroundColor: BRAND }} />
              Option B: Coverage Forge
            </h4>
            <ul className="space-y-1.5 text-xs text-on-surface-variant">
              <li>+ Persistent coverage bar creates narrative continuity across steps</li>
              <li>+ Before/after brick comparison is highly motivating</li>
              <li>+ Conveyor belt and heatmap are intuitive visual metaphors</li>
              <li>+ Construction report format feels concrete and actionable</li>
              <li>- Brick wall and conveyor are simpler than A's SVG compositions</li>
              <li>- Coverage percentage relies on accurate detection metadata</li>
            </ul>
          </div>
        </div>
      </Section>
    </DesignSystemPage>
  );
};
