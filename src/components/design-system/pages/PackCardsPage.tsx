import React from 'react';
import { Link } from 'react-router-dom';
import { DesignSystemPage, Section } from '../shared';
import { PackIcon } from '../../packs/PackIcon';
import type { DetectionPack } from '../../../types';
import type { PackCardIntegrationStatus } from '../../packs/DetectionPackCard';

// --- Mock data ---------------------------------------------------------------

type MockEntry = {
  pack: DetectionPack;
  deploymentStatus: { deployed: number; total: number };
  integrationStatuses: PackCardIntegrationStatus[];
};

const MOCK_PACKS: MockEntry[] = [
  {
    pack: {
      id: 'mock-ransomware',
      name: 'LockBit Ransomware Coverage',
      description: 'Detections for LockBit 3.0 TTPs across initial access, lateral movement, and encryption phases.',
      source: 'community',
      pack_type: 'ransomware',
      rule_count: 45,
      mitre_technique_ids: ['T1566', 'T1078', 'T1021', 'T1486', 'T1490', 'T1562', 'T1055', 'T1003'],
      platforms: ['Windows', 'Linux', 'macOS', 'Endpoint'],
      tags: ['ransomware', 'lockbit', 'critical'],
      is_active: true,
      updated_at: '2026-04-15T10:00:00Z',
      created_at: '2026-01-10T10:00:00Z',
    } as DetectionPack,
    deploymentStatus: { deployed: 32, total: 45 },
    integrationStatuses: [
      { integration_id: 'splunk', integration_name: 'Splunk', total_detections: 45, deployed_count: 45, failed_count: 0 },
      { integration_id: 'sentinel', integration_name: 'Sentinel', total_detections: 45, deployed_count: 28, failed_count: 2 },
      { integration_id: 'elastic', integration_name: 'Elastic', total_detections: 45, deployed_count: 0, failed_count: 0 },
    ],
  },
  {
    pack: {
      id: 'mock-apt29',
      name: 'APT29 Campaign Pack',
      description: 'Signature detections for APT29 (Cozy Bear) tradecraft.',
      source: 'official',
      pack_type: 'threat_actor',
      rule_count: 28,
      mitre_technique_ids: ['T1566.001', 'T1059.001', 'T1078.004', 'T1114', 'T1550'],
      platforms: ['Windows', 'Office 365', 'Azure AD'],
      tags: ['apt29', 'state-sponsored'],
      is_active: true,
      updated_at: '2026-04-10T10:00:00Z',
      created_at: '2026-02-01T10:00:00Z',
    } as DetectionPack,
    deploymentStatus: { deployed: 28, total: 28 },
    integrationStatuses: [
      { integration_id: 'splunk', integration_name: 'Splunk', total_detections: 28, deployed_count: 28, failed_count: 0 },
      { integration_id: 'sentinel', integration_name: 'Sentinel', total_detections: 28, deployed_count: 28, failed_count: 0 },
    ],
  },
  {
    pack: {
      id: 'mock-cloud',
      name: 'AWS Baseline Detections',
      description: 'Foundational cloud-posture detections for AWS — IAM, S3, CloudTrail integrity.',
      source: 'custom',
      pack_type: 'technology',
      rule_count: 19,
      mitre_technique_ids: ['T1078.004', 'T1530', 'T1580', 'T1098'],
      platforms: ['AWS'],
      tags: ['aws', 'baseline', 'cloud'],
      is_active: false,
      updated_at: '2026-03-28T10:00:00Z',
      created_at: '2026-03-01T10:00:00Z',
    } as DetectionPack,
    deploymentStatus: { deployed: 0, total: 19 },
    integrationStatuses: [
      { integration_id: 'splunk', integration_name: 'Splunk', total_detections: 19, deployed_count: 0, failed_count: 0 },
    ],
  },
  {
    pack: {
      id: 'mock-phishing',
      name: 'Phishing Initial Access',
      description: 'Email-borne attack coverage — malicious attachments, link-based lures, BEC patterns.',
      source: 'community',
      pack_type: 'tactic',
      rule_count: 22,
      mitre_technique_ids: ['T1566.001', 'T1566.002', 'T1204.002'],
      platforms: ['Office 365', 'Email Gateway'],
      tags: ['phishing', 'initial-access'],
      is_active: true,
      updated_at: '2026-04-18T10:00:00Z',
      created_at: '2026-02-12T10:00:00Z',
    } as DetectionPack,
    deploymentStatus: { deployed: 15, total: 22 },
    integrationStatuses: [
      { integration_id: 'splunk', integration_name: 'Splunk', total_detections: 22, deployed_count: 22, failed_count: 0 },
      { integration_id: 'sentinel', integration_name: 'Sentinel', total_detections: 22, deployed_count: 8, failed_count: 0 },
    ],
  },
];

// --- Shared helpers ----------------------------------------------------------

function formatShortDate(iso: string) {
  return new Date(iso).toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: '2-digit' });
}

function deployPct(entry: MockEntry) {
  const { deployed, total } = entry.deploymentStatus;
  return total > 0 ? Math.round((deployed / total) * 100) : 0;
}

// =============================================================================
// V1 — INTEL DOSSIER (manila folder / classified file)
// =============================================================================
// Visual DNA: paper + ink. Tab at top-left, classification header stripe,
// typography-forward body, rubber-stamp platform chips at the bottom. Serif
// name, monospace metadata. Minimal color — mostly parchment / ink.

const DOSSIER_TAB_COLOR: Record<string, string> = {
  ransomware:   'bg-[#A63D40] text-white',
  threat_actor: 'bg-[#1e3a5f] text-white',
  campaign:     'bg-[#4a5d23] text-white',
  technology:   'bg-[#5a4a2a] text-white',
  tactic:       'bg-[#7a3a5f] text-white',
  use_case:     'bg-[#2a5a5a] text-white',
  siem_ready:   'bg-[#5a2a4a] text-white',
};

const PackCardV1Dossier: React.FC<{ entry: MockEntry }> = ({ entry }) => {
  const { pack, deploymentStatus } = entry;
  const techniques = pack.mitre_technique_ids?.length ?? 0;
  const tabColor = (pack.pack_type && DOSSIER_TAB_COLOR[pack.pack_type]) || 'bg-[#2a2a2a] text-white';

  return (
    <div
      className="group relative cursor-pointer bg-[#f5efe4] text-[#2a1f14] rounded-sm shadow-md hover:shadow-xl transition-shadow duration-300 overflow-hidden"
      style={{
        backgroundImage:
          'radial-gradient(circle at 20% 30%, rgba(120,80,40,0.05) 0%, transparent 40%), radial-gradient(circle at 70% 70%, rgba(120,80,40,0.04) 0%, transparent 40%)',
      }}
    >
      {/* Classification header stripe */}
      <div className="flex items-center justify-between px-4 py-1.5 border-b border-[#2a1f14]/20 bg-[#2a1f14]/5">
        <span className="font-mono text-[9px] font-black tracking-[0.25em] text-[#2a1f14]/70">CLASSIFIED</span>
        <span className="font-mono text-[9px] font-black tracking-[0.25em] text-[#2a1f14]/70">{pack.source.toUpperCase()}</span>
      </div>

      {/* Tab + body */}
      <div className="relative px-5 pt-5 pb-4">
        {/* Corner tab */}
        {pack.pack_type && (
          <span
            className={`absolute -top-0 right-4 ${tabColor} px-2.5 py-1 text-[8px] font-mono font-black tracking-[0.3em] shadow-sm`}
            style={{ clipPath: 'polygon(0 0, 100% 0, 100% 100%, 10% 100%)' }}
          >
            {pack.pack_type.replace('_', ' ').toUpperCase()}
          </span>
        )}

        <h3 className="text-xl font-serif font-bold leading-tight mt-2 mb-1.5 pr-24">
          {pack.name}
        </h3>
        <p className="font-mono text-[10px] text-[#2a1f14]/60 mb-4">
          Rev. {formatShortDate(pack.updated_at)}
        </p>

        {pack.description && (
          <p className="text-[13px] leading-relaxed text-[#2a1f14]/85 mb-5 italic border-l-2 border-[#2a1f14]/30 pl-3">
            {pack.description}
          </p>
        )}

        {/* Contents divider */}
        <div className="flex items-center gap-2 mb-3">
          <span className="flex-1 h-px bg-[#2a1f14]/30" />
          <span className="font-mono text-[9px] font-bold tracking-[0.3em] text-[#2a1f14]/60">— CONTENTS —</span>
          <span className="flex-1 h-px bg-[#2a1f14]/30" />
        </div>

        <div className="space-y-1.5 font-mono text-[11px] mb-5">
          <div className="flex justify-between">
            <span className="text-[#2a1f14]/60">Rules</span>
            <span className="font-bold">{pack.rule_count}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-[#2a1f14]/60">TTPs mapped</span>
            <span className="font-bold">{techniques}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-[#2a1f14]/60">Deployed to SIEM</span>
            <span className="font-bold">{deploymentStatus.deployed} / {deploymentStatus.total}</span>
          </div>
        </div>

        {/* Platform stamps */}
        <div className="flex flex-wrap gap-2 pt-3 border-t border-[#2a1f14]/20">
          {(pack.platforms ?? []).slice(0, 4).map((p, i) => (
            <span
              key={p}
              className="px-2 py-0.5 border-2 border-[#A63D40]/70 text-[#A63D40] font-mono text-[9px] font-black tracking-widest"
              style={{ transform: `rotate(${(i % 2 === 0 ? -1 : 1) * (1 + (i * 0.3))}deg)`, opacity: 0.85 }}
            >
              {p.toUpperCase()}
            </span>
          ))}
        </div>
      </div>
    </div>
  );
};

// =============================================================================
// V2 — ALBUM COVER / POSTER ART (art-forward tile)
// =============================================================================
// Visual DNA: Spotify album tile. Generative PackIcon fills the top 2/3 as
// hero artwork; bottom is a solid dark band with minimal text. Description
// appears only on hover via an overlay. Source lives as a tiny ribbon on the
// left edge. Deployment progress is a thin 2px bar under the title.

const SOURCE_RIBBON_COLOR: Record<string, string> = {
  community: 'bg-primary',
  custom:    'bg-tertiary',
  official:  'bg-secondary',
};

const PackCardV2Album: React.FC<{ entry: MockEntry }> = ({ entry }) => {
  const { pack, deploymentStatus } = entry;
  const pct = deployPct(entry);
  const ribbon = SOURCE_RIBBON_COLOR[pack.source] ?? 'bg-tertiary';

  return (
    <div className="group relative cursor-pointer overflow-hidden rounded-2xl shadow-md hover:shadow-2xl transition-all duration-500 hover:-translate-y-1 aspect-[3/4] bg-black">
      {/* Source ribbon — vertical stripe on left edge */}
      <div className={`absolute top-0 left-0 bottom-0 w-1 ${ribbon} z-10`} />

      {/* Hero art region — fills top 65% */}
      <div className="absolute top-0 left-0 right-0 h-[65%] flex items-center justify-center overflow-hidden">
        {/* soft radial glow behind art */}
        <div className={`absolute inset-0 ${ribbon} opacity-30 blur-3xl`} />
        {/* grain overlay */}
        <div
          className="absolute inset-0 opacity-20 mix-blend-overlay pointer-events-none"
          style={{
            backgroundImage:
              "url(\"data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='120' height='120'><filter id='n'><feTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='2'/></filter><rect width='100%' height='100%' filter='url(%23n)' opacity='0.5'/></svg>\")",
          }}
        />
        <div className="relative scale-[1.8] transition-transform duration-700 group-hover:scale-[2.0]">
          <PackIcon packId={pack.id} packName={pack.name} source={pack.source} size="xl" />
        </div>
      </div>

      {/* Hover overlay — description */}
      <div className="absolute inset-0 bg-black/80 opacity-0 group-hover:opacity-100 transition-opacity duration-300 flex items-center justify-center p-6 z-20">
        <p className="text-sm text-white/90 leading-relaxed text-center">{pack.description}</p>
      </div>

      {/* Bottom text band */}
      <div className="absolute bottom-0 left-0 right-0 h-[35%] bg-gradient-to-t from-black via-black/95 to-transparent p-4 pl-5 flex flex-col justify-end z-10">
        <h3 className="text-white font-bold uppercase tracking-wider leading-tight text-base line-clamp-2 mb-2">
          {pack.name}
        </h3>
        {/* 2px progress bar */}
        <div className="h-[2px] bg-white/15 overflow-hidden mb-2">
          <div className={`h-full ${ribbon} transition-all duration-700`} style={{ width: `${pct}%` }} />
        </div>
        <p className="font-mono text-[10px] text-white/60 tracking-wide">
          {pack.rule_count} rules · {deploymentStatus.deployed} live · {formatShortDate(pack.updated_at)}
        </p>
      </div>
    </div>
  );
};

// =============================================================================
// V3 — TERMINAL / CLI OUTPUT (operator aesthetic)
// =============================================================================
// Visual DNA: `pack describe` CLI output. All monospace. Dark background,
// muted green prompt, right-padded key-value table, ASCII block-char progress
// bars per SIEM. No rounded corners. No chrome. A blinking cursor at the end.

function rightPad(s: string, len: number) {
  return s.length >= len ? s : s + ' '.repeat(len - s.length);
}
function asciiBar(deployed: number, total: number, width = 8) {
  const filled = total > 0 ? Math.round((deployed / total) * width) : 0;
  return '█'.repeat(filled) + '░'.repeat(width - filled);
}

const PackCardV3Terminal: React.FC<{ entry: MockEntry }> = ({ entry }) => {
  const { pack, deploymentStatus, integrationStatuses } = entry;
  const pct = deployPct(entry);
  const techniques = pack.mitre_technique_ids?.length ?? 0;
  const pctColor =
    pct === 100 ? 'text-emerald-400' : pct > 0 ? 'text-amber-400' : 'text-zinc-500';

  const kv = (k: string, v: React.ReactNode) => (
    <div className="flex">
      <span className="text-zinc-500 whitespace-pre">{rightPad(k + ':', 11)}</span>
      <span className="text-zinc-200">{v}</span>
    </div>
  );

  return (
    <div className="group relative cursor-pointer bg-[#0b0b0c] text-zinc-200 font-mono text-[12px] leading-[1.5] p-0 border border-zinc-800 hover:border-emerald-500/40 transition-colors duration-200 overflow-hidden">
      {/* Top title-bar like a terminal window */}
      <div className="flex items-center gap-2 px-3 py-1.5 bg-zinc-900 border-b border-zinc-800">
        <span className="w-2.5 h-2.5 rounded-full bg-red-500/80" />
        <span className="w-2.5 h-2.5 rounded-full bg-yellow-500/80" />
        <span className="w-2.5 h-2.5 rounded-full bg-green-500/80" />
        <span className="ml-2 text-[10px] text-zinc-500 tracking-wider">pack.sh — describe</span>
      </div>

      {/* Prompt + body */}
      <div className="p-4 space-y-1">
        <div className="mb-3">
          <span className="text-emerald-400">$</span>{' '}
          <span className="text-zinc-400">pack describe </span>
          <span className="text-cyan-300">{pack.id.replace(/^mock-/, '')}</span>
        </div>

        {kv('name', pack.name)}
        {kv('source', pack.source)}
        {kv('type', pack.pack_type ?? '—')}
        {kv('rules', pack.rule_count.toString())}
        {kv('deployed', <span className={pctColor}>{deploymentStatus.deployed}/{deploymentStatus.total} ({pct}%)</span>)}
        {kv('ttps', techniques.toString())}
        {kv('platforms', (pack.platforms ?? []).join(', '))}
        {kv('updated', new Date(pack.updated_at).toISOString().slice(0, 10))}

        <div className="pt-3 mt-3 border-t border-zinc-800">
          <div className="text-zinc-500 mb-1.5">&gt; siem_status:</div>
          {integrationStatuses.map((s) => {
            const sp = s.total_detections > 0 ? s.deployed_count / s.total_detections : 0;
            const color = sp === 1 && s.failed_count === 0 ? 'text-emerald-400' : sp > 0 ? 'text-amber-400' : 'text-zinc-500';
            return (
              <div key={s.integration_id} className="flex">
                <span className="text-zinc-500 whitespace-pre">{rightPad('  ' + (s.integration_name?.toLowerCase() ?? s.integration_id), 13)}</span>
                <span className={color}>[{asciiBar(s.deployed_count, s.total_detections)}] {s.deployed_count}/{s.total_detections}</span>
              </div>
            );
          })}
        </div>

        <div className="pt-3 mt-1 flex items-center">
          <span className="text-emerald-400">$</span>
          <span className="ml-1.5 w-2 h-4 bg-emerald-400/90 animate-pulse" />
        </div>
      </div>
    </div>
  );
};

// =============================================================================
// V4 — COVERAGE GAUGE (data-viz tile)
// =============================================================================
// Visual DNA: Grafana panel. A radial SVG donut IS the visual centerpiece —
// the arc is split into per-SIEM segments colored by deployment state. Big
// percentage and "deployed" label live inside the ring. Pack name + metadata
// are secondary annotations above/below.

const SIEM_ARC_COLORS = {
  full: '#10b981',    // emerald
  partial: '#f59e0b', // amber
  empty: '#3f3f46',   // zinc-700
};

function siemArcColor(s: PackCardIntegrationStatus): string {
  const pct = s.total_detections > 0 ? s.deployed_count / s.total_detections : 0;
  if (pct === 1 && s.failed_count === 0) return SIEM_ARC_COLORS.full;
  if (pct > 0) return SIEM_ARC_COLORS.partial;
  return SIEM_ARC_COLORS.empty;
}

const CoverageDonut: React.FC<{ entry: MockEntry; size?: number }> = ({ entry, size = 140 }) => {
  const { deploymentStatus, integrationStatuses } = entry;
  const pct = deployPct(entry);
  const radius = 48;
  const circumference = 2 * Math.PI * radius;
  const totalSegments = integrationStatuses.reduce((sum, s) => sum + s.total_detections, 0) || 1;

  let cumulative = 0;
  const segments = integrationStatuses.map((s, i) => {
    const arcLen = (s.total_detections / totalSegments) * circumference;
    const gap = 2;
    const dashArray = `${Math.max(arcLen - gap, 0)} ${circumference}`;
    const offset = circumference - cumulative;
    cumulative += arcLen;
    return (
      <circle
        key={s.integration_id + i}
        cx="60"
        cy="60"
        r={radius}
        fill="none"
        stroke={siemArcColor(s)}
        strokeWidth="12"
        strokeDasharray={dashArray}
        strokeDashoffset={offset}
        strokeLinecap="butt"
      />
    );
  });

  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 120 120"
      className="drop-shadow-[0_0_20px_rgba(16,185,129,0.1)]"
    >
      {/* background track */}
      <circle cx="60" cy="60" r={radius} fill="none" stroke="rgb(63,63,70)" strokeWidth="12" />
      <g transform="rotate(-90 60 60)">{segments}</g>
      <text x="60" y="58" textAnchor="middle" fontSize="22" fontWeight="800" fill="rgb(228,228,231)" fontFamily="ui-monospace, SFMono-Regular, Menlo, monospace">
        {pct}%
      </text>
      <text x="60" y="74" textAnchor="middle" fontSize="8" fontWeight="600" fill="rgb(161,161,170)" letterSpacing="0.15em">
        {deploymentStatus.deployed}/{deploymentStatus.total}
      </text>
    </svg>
  );
};

const PackCardV4Gauge: React.FC<{ entry: MockEntry }> = ({ entry }) => {
  const { pack, integrationStatuses } = entry;
  const techniques = pack.mitre_technique_ids?.length ?? 0;

  return (
    <div className="group relative cursor-pointer bg-zinc-900 text-zinc-200 rounded-xl border border-zinc-800 hover:border-emerald-500/40 transition-all duration-300 p-5 flex flex-col aspect-square">
      {/* Header: pack name */}
      <div className="mb-4">
        <h3 className="text-base font-bold text-zinc-100 leading-snug truncate">{pack.name}</h3>
        <p className="text-[10px] text-zinc-500 uppercase tracking-widest font-bold mt-1">
          {pack.pack_type?.replace('_', ' ') ?? 'pack'} · {pack.source}
        </p>
      </div>

      {/* Gauge hero */}
      <div className="flex-1 flex items-center justify-center">
        <CoverageDonut entry={entry} />
      </div>

      {/* SIEM legend */}
      <div className="mt-3 space-y-1">
        {integrationStatuses.map((s) => (
          <div key={s.integration_id} className="flex items-center gap-2 text-[10px]">
            <span
              className="w-2 h-2 rounded-sm flex-shrink-0"
              style={{ backgroundColor: siemArcColor(s) }}
            />
            <span className="text-zinc-400 font-mono flex-1 truncate">{s.integration_name}</span>
            <span className="text-zinc-500 font-mono tabular-nums">
              {s.deployed_count}/{s.total_detections}
            </span>
          </div>
        ))}
      </div>

      {/* Footer meta */}
      <div className="mt-3 pt-3 border-t border-zinc-800 flex items-center justify-between text-[10px] text-zinc-500 font-mono">
        <span>{pack.rule_count} rules · {techniques} ttps</span>
        <span>{formatShortDate(pack.updated_at)}</span>
      </div>
    </div>
  );
};

// =============================================================================
// Page
// =============================================================================

type Variant = {
  id: string;
  title: string;
  metaphor: string;
  notes: string[];
  Component: React.FC<{ entry: MockEntry }>;
  gridClass: string;
};

const VARIANTS: Variant[] = [
  {
    id: 'v1',
    title: 'V1 — Intel Dossier',
    metaphor: 'Classified paper file. Serif headline, mono metadata, rubber-stamp platforms.',
    notes: [
      'Paper/ink palette — cream background, dark ink text',
      'Corner tab colored by pack type (ransomware = red, campaign = blue, etc.)',
      '"CLASSIFIED · SOURCE" header stripe',
      'Serif name · mono revision · italic description with left rule',
      'Bottom: rubber-stamp platform chips with slight rotation',
    ],
    Component: PackCardV1Dossier,
    gridClass: 'grid-cols-1 md:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4',
  },
  {
    id: 'v2',
    title: 'V2 — Album Cover',
    metaphor: 'Spotify tile. Art-forward. Text minimal. Hover reveals description.',
    notes: [
      '3:4 aspect ratio, full-bleed generative PackIcon in the top 65%',
      'Source = thin vertical color ribbon on the left edge',
      'Progress = thin 2px bar under the title (no text %)',
      'Noise/grain overlay on the art for texture',
      'Hover: dark overlay reveals the description',
    ],
    Component: PackCardV2Album,
    gridClass: 'grid-cols-2 md:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5',
  },
  {
    id: 'v3',
    title: 'V3 — Terminal CLI',
    metaphor: '`pack describe lockbit` output. Operator aesthetic.',
    notes: [
      'All monospace, all dark. No rounded corners except the parent card.',
      'Terminal window chrome: three-dot header',
      'Key-value table with right-padded keys for alignment',
      'Per-SIEM ASCII block-char progress bars',
      'Blinking cursor at the bottom',
    ],
    Component: PackCardV3Terminal,
    gridClass: 'grid-cols-1 md:grid-cols-2 xl:grid-cols-2 2xl:grid-cols-3',
  },
  {
    id: 'v4',
    title: 'V4 — Coverage Gauge',
    metaphor: 'Grafana tile. The chart is the card. Everything else is annotation.',
    notes: [
      'Radial donut IS the focal element — center-stage',
      'Donut split into per-SIEM arc segments colored by deployment state',
      'Big percentage + ratio live inside the ring',
      'Legend strip below names each SIEM with its color and count',
      'No description on front, data-dense, dashboard feel',
    ],
    Component: PackCardV4Gauge,
    gridClass: 'grid-cols-1 md:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4',
  },
];

export const PackCardsPage: React.FC = () => {
  return (
    <DesignSystemPage
      title="Pack Cards"
      description="Four candidate pack card redesigns — each with a distinct visual metaphor. Pick one (or ask for more)."
    >
      <div className="mb-8 p-4 bg-[#783264]/5 border border-[#783264]/20 rounded-xl text-sm text-on-surface-variant">
        Each variant below uses a different visual DNA — not the same card with content shuffled. Squint at the page: V1 looks like paper, V2 like an album sleeve, V3 like a terminal window, V4 like a dashboard tile. That&apos;s the spread we want.
        <div className="mt-2 text-xs">
          Live page for comparison: <Link to="/packs" className="text-[#783264] underline font-medium">/packs</Link>
        </div>
      </div>

      {VARIANTS.map(({ id, title, metaphor, notes, Component, gridClass }) => (
        <Section key={id} title={title} description={metaphor}>
          <ul className="mb-4 text-xs text-on-surface-variant/80 space-y-1 list-disc list-inside">
            {notes.map((n) => (
              <li key={n}>{n}</li>
            ))}
          </ul>
          <div className={`grid ${gridClass} gap-4`}>
            {MOCK_PACKS.map((entry) => (
              <Component key={entry.pack.id} entry={entry} />
            ))}
          </div>
        </Section>
      ))}
    </DesignSystemPage>
  );
};

export default PackCardsPage;
