import React from 'react';
import { Link } from 'react-router-dom';
import { DesignSystemPage, Section } from '../shared';
import { Icon } from '../../Icon';
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

const SOURCE_CHIP: Record<string, { bg: string; text: string; label: string }> = {
  community: { bg: 'bg-primary/15 border-primary/25', text: 'text-primary', label: 'COMMUNITY' },
  custom:    { bg: 'bg-tertiary/15 border-tertiary/25', text: 'text-tertiary', label: 'CUSTOM' },
  official:  { bg: 'bg-secondary/15 border-secondary/25', text: 'text-secondary', label: 'OFFICIAL' },
};

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

function SiemSegmentBar({ statuses }: { statuses: PackCardIntegrationStatus[] }) {
  return (
    <div className="flex items-center gap-0.5 w-full h-1.5 rounded-full overflow-hidden bg-surface-container-highest">
      {statuses.map((s) => {
        const pct = s.total_detections > 0 ? (s.deployed_count / s.total_detections) * 100 : 0;
        const color =
          pct === 100 && s.failed_count === 0 ? 'bg-emerald-500'
          : pct > 0 ? 'bg-yellow-500'
          : 'bg-on-surface-variant/15';
        return (
          <div
            key={s.integration_id}
            className={`h-full ${color}`}
            style={{ flex: `1 1 ${100 / statuses.length}%` }}
            title={`${s.integration_name}: ${s.deployed_count}/${s.total_detections}`}
          />
        );
      })}
    </div>
  );
}

// --- Variant 1: Minimal / Editorial -----------------------------------------

const PackCardV1: React.FC<{ entry: MockEntry }> = ({ entry }) => {
  const { pack } = entry;
  const chip = SOURCE_CHIP[pack.source] ?? SOURCE_CHIP.custom;
  const techniques = pack.mitre_technique_ids?.length ?? 0;
  const platforms = pack.platforms?.length ?? 0;

  return (
    <div className="group relative bg-surface-container-low border border-outline-variant/30 rounded-2xl overflow-hidden cursor-pointer hover:border-primary/40 transition-all duration-300 hover:shadow-lg">
      <div className="p-6 flex flex-col items-center text-center">
        <div className="relative mb-4">
          <div className={`absolute inset-0 blur-2xl opacity-60 ${chip.bg}`} />
          <PackIcon packId={pack.id} packName={pack.name} source={pack.source} size="xl" className="relative" />
        </div>
        <h3 className="text-lg font-brand font-bold text-on-surface mb-2 leading-tight group-hover:text-primary transition-colors">
          {pack.name}
        </h3>
        {pack.description && (
          <p className="text-sm text-on-surface-variant/75 line-clamp-2 mb-5 leading-relaxed">
            {pack.description}
          </p>
        )}
        <div className="flex items-center gap-4 text-xs text-on-surface-variant/80 font-medium mb-4">
          <span><span className="font-mono font-black text-on-surface text-base mr-1">{pack.rule_count}</span>Rules</span>
          <span className="w-1 h-1 rounded-full bg-outline-variant/40" />
          <span><span className="font-mono font-black text-on-surface text-base mr-1">{techniques}</span>TTPs</span>
          <span className="w-1 h-1 rounded-full bg-outline-variant/40" />
          <span><span className="font-mono font-black text-on-surface text-base mr-1">{platforms}</span>Platforms</span>
        </div>
        <span className={`inline-flex items-center px-2.5 py-1 text-[9px] font-black uppercase tracking-widest rounded-full border ${chip.bg} ${chip.text}`}>
          {chip.label}
        </span>
      </div>
      <div className="px-6 py-3 bg-surface-container/50 border-t border-outline-variant/20 flex items-center justify-between">
        <span className="text-[10px] text-on-surface-variant/60 font-mono">{formatDate(pack.updated_at)}</span>
        <Icon name="arrowRight" className="w-4 h-4 text-primary opacity-0 group-hover:opacity-100 -rotate-45 transition-opacity" />
      </div>
    </div>
  );
};

// --- Variant 2: Ops / Status Tile -------------------------------------------

const PackCardV2: React.FC<{ entry: MockEntry }> = ({ entry }) => {
  const { pack, deploymentStatus, integrationStatuses } = entry;
  const chip = SOURCE_CHIP[pack.source] ?? SOURCE_CHIP.custom;
  const techniques = pack.mitre_technique_ids?.length ?? 0;
  const pct = deploymentStatus.total > 0 ? Math.round((deploymentStatus.deployed / deploymentStatus.total) * 100) : 0;
  const pctColor = pct === 100 ? 'text-emerald-500' : pct > 0 ? 'text-yellow-500' : 'text-on-surface-variant';

  return (
    <div className="group relative bg-surface-container-low border border-outline-variant/30 rounded-2xl overflow-hidden cursor-pointer hover:border-primary/40 transition-all duration-300 hover:shadow-lg">
      <div className="p-5">
        <div className="flex items-start gap-3 mb-3">
          <PackIcon packId={pack.id} packName={pack.name} source={pack.source} size="md" />
          <div className="flex-1 min-w-0">
            <h3 className="text-base font-brand font-bold text-on-surface truncate group-hover:text-primary transition-colors">
              {pack.name}
            </h3>
            <span className={`inline-flex items-center px-2 py-0.5 mt-1 text-[9px] font-black uppercase tracking-widest rounded-full border ${chip.bg} ${chip.text}`}>
              {chip.label}
            </span>
          </div>
        </div>

        {pack.description && (
          <p className="text-xs text-on-surface-variant/75 line-clamp-1 mb-4">
            {pack.description}
          </p>
        )}

        <div className="bg-surface-container rounded-xl p-4 border border-outline-variant/20 mb-3">
          <div className="flex items-center justify-between mb-2">
            <span className="text-[10px] text-on-surface-variant uppercase tracking-widest font-bold">Deployment</span>
            <span className={`text-[10px] font-mono font-black ${pctColor}`}>{pct}%</span>
          </div>
          <div className="flex items-baseline gap-1.5 mb-3">
            <span className="text-3xl font-mono font-black text-on-surface tabular-nums">{deploymentStatus.deployed}</span>
            <span className="text-base font-mono text-on-surface-variant/60">/ {deploymentStatus.total}</span>
            <span className="text-xs text-on-surface-variant/60 ml-1">rules live</span>
          </div>
          <SiemSegmentBar statuses={integrationStatuses} />
          <div className="flex flex-wrap gap-1.5 mt-2">
            {integrationStatuses.map((s) => (
              <span key={s.integration_id} className="text-[9px] font-bold text-on-surface-variant/70 uppercase tracking-wide">
                {s.integration_name}
              </span>
            ))}
          </div>
        </div>

        <div className="flex items-center gap-3 text-[11px] text-on-surface-variant/70">
          <span className="font-mono"><span className="font-black text-on-surface">{pack.rule_count}</span> rules</span>
          <span className="font-mono"><span className="font-black text-on-surface">{techniques}</span> TTPs</span>
          <span className="ml-auto font-mono">{formatDate(pack.updated_at)}</span>
        </div>
      </div>
    </div>
  );
};

// --- Variant 3: Balanced / Compact ------------------------------------------

const PackCardV3: React.FC<{ entry: MockEntry }> = ({ entry }) => {
  const { pack, deploymentStatus, integrationStatuses } = entry;
  const chip = SOURCE_CHIP[pack.source] ?? SOURCE_CHIP.custom;
  const platforms = pack.platforms ?? [];
  const deployPct = deploymentStatus.total > 0 ? Math.round((deploymentStatus.deployed / deploymentStatus.total) * 100) : 0;
  const deployColor = deployPct === 100 ? 'text-emerald-500' : deployPct > 0 ? 'text-yellow-500' : 'text-on-surface-variant';

  return (
    <div className="group relative bg-surface-container-low border border-outline-variant/30 rounded-2xl overflow-hidden cursor-pointer hover:border-primary/40 transition-all duration-300 hover:shadow-lg">
      <div className="p-5">
        <div className="flex items-start gap-3 mb-3">
          <PackIcon packId={pack.id} packName={pack.name} source={pack.source} size="md" />
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-1.5">
              <span className={`inline-flex items-center px-2 py-0.5 text-[9px] font-black uppercase tracking-widest rounded-full border ${chip.bg} ${chip.text}`}>
                {chip.label}
              </span>
            </div>
            <h3 className="text-base font-brand font-bold text-on-surface truncate group-hover:text-primary transition-colors leading-tight">
              {pack.name}
            </h3>
          </div>
        </div>

        {pack.description && (
          <p className="text-xs text-on-surface-variant/75 line-clamp-2 mb-4 leading-relaxed">
            {pack.description}
          </p>
        )}

        <div className="grid grid-cols-2 gap-3 mb-4">
          <div className="bg-surface-container rounded-xl p-3 border border-outline-variant/20">
            <span className="block text-[9px] text-on-surface-variant/70 uppercase tracking-widest font-bold mb-1">Rules</span>
            <span className="text-2xl font-mono font-black text-on-surface tabular-nums">{pack.rule_count}</span>
          </div>
          <div className="bg-surface-container rounded-xl p-3 border border-outline-variant/20">
            <span className="block text-[9px] text-on-surface-variant/70 uppercase tracking-widest font-bold mb-1">Deployed</span>
            <div className="flex items-baseline gap-1 mb-1.5">
              <span className={`text-2xl font-mono font-black tabular-nums ${deployColor}`}>{deploymentStatus.deployed}</span>
              <span className="text-xs font-mono text-on-surface-variant/60">/ {deploymentStatus.total}</span>
            </div>
            <SiemSegmentBar statuses={integrationStatuses} />
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-1.5">
          {pack.pack_type && (
            <span className="px-2 py-0.5 text-[9px] font-bold uppercase tracking-widest rounded bg-secondary/10 text-secondary border border-secondary/20">
              {pack.pack_type.replace('_', ' ')}
            </span>
          )}
          {platforms.slice(0, 2).map((p) => (
            <span key={p} className="px-2 py-0.5 text-[10px] font-semibold bg-surface-container text-on-surface-variant rounded border border-outline-variant/20">
              {p}
            </span>
          ))}
          {platforms.length > 2 && (
            <span className="text-[10px] text-on-surface-variant/50">+{platforms.length - 2}</span>
          )}
          <span className="ml-auto text-[10px] text-on-surface-variant/60 font-mono">{formatDate(pack.updated_at)}</span>
        </div>
      </div>
    </div>
  );
};

// --- Page --------------------------------------------------------------------

type Variant = { id: 'v1' | 'v2' | 'v3'; title: string; notes: string[]; Component: React.FC<{ entry: MockEntry }> };

const VARIANTS: Variant[] = [
  {
    id: 'v1',
    title: 'V1 — Minimal / Editorial',
    notes: [
      'Large hero PackIcon, centered layout',
      'One-line stat row (Rules · TTPs · Platforms), no chips',
      'Removed: coverage meter, SIEM strip, tags, active dot, 3-stat grid',
      'Best for: library browsing, catalog scanning',
    ],
    Component: PackCardV1,
  },
  {
    id: 'v2',
    title: 'V2 — Ops / Status Tile',
    notes: [
      'Deployment block is the hero — big deployed/total + per-SIEM segmented bar',
      'Removed: coverage meter, platform chips, tags, active dot',
      'Best for: SOC leads checking "what\'s live where"',
    ],
    Component: PackCardV2,
  },
  {
    id: 'v3',
    title: 'V3 — Balanced / Compact (recommended default)',
    notes: [
      'Two side-by-side metrics (Rules + Deployed), tight SIEM strip under Deployed',
      'Compact type + platform chips row with date',
      'Removed: coverage meter, tags, active dot, 3-stat grid',
      'Best for: default — keeps ops + discovery signals without the density',
    ],
    Component: PackCardV3,
  },
];

export const PackCardsPage: React.FC = () => {
  return (
    <DesignSystemPage
      title="Pack Cards"
      description="Three candidate redesigns for the Detection Pack card on /packs. Pick one."
    >
      <div className="mb-8 p-4 bg-primary/5 border border-primary/20 rounded-xl text-sm text-on-surface-variant">
        The current card has nine visual zones and feels busy. These three variants each remove different pieces. Compare them on the same data, then tell me which one you want — or ask for a blend (e.g. "V3 with V2's SIEM segment bar as hero").
        <div className="mt-2 text-xs">
          Compare against the live page: <Link to="/packs" className="text-primary underline font-medium">/packs</Link>
        </div>
      </div>

      {VARIANTS.map(({ id, title, notes, Component }) => (
        <Section key={id} title={title} description={undefined}>
          <ul className="mb-4 text-xs text-on-surface-variant/80 space-y-1 list-disc list-inside">
            {notes.map((n) => <li key={n}>{n}</li>)}
          </ul>
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4 gap-4">
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
