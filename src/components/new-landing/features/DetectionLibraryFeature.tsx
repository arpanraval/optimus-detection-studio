import React, { useState } from 'react';
import { FeatureSlide, MockupFrame, FeatureCarousel } from '../shared/FeatureSlide';

const ACCENT = '#783264';
const BLUE = '#005091';
const TEAL = '#4D7C6F';

/* ------------------------------------------------------------------ */
/*  Helpers                                                           */
/* ------------------------------------------------------------------ */

const QualityRing: React.FC<{ score: number; size?: number }> = ({ score, size = 36 }) => {
  const radius = 14;
  const circumference = 2 * Math.PI * radius;
  const color = score >= 80 ? TEAL : score >= 60 ? BLUE : score >= 40 ? '#f59e0b' : '#ef4444';
  return (
    <div className="relative" style={{ width: size, height: size }}>
      <svg viewBox="0 0 36 36" className="w-full h-full -rotate-90">
        <circle cx="18" cy="18" r={radius} fill="none" stroke="rgb(var(--md-sys-color-outline-variant))" strokeWidth="2.5" />
        <circle cx="18" cy="18" r={radius} fill="none" stroke={color} strokeWidth="2.5"
          strokeDasharray={`${(score / 100) * circumference} ${circumference}`} strokeLinecap="round" />
      </svg>
      <div className="absolute inset-0 flex items-center justify-center">
        <span className="font-brand text-[10px] font-bold text-on-surface">{score}</span>
      </div>
    </div>
  );
};

const SeverityBadge: React.FC<{ level: string }> = ({ level }) => {
  const colors: Record<string, { bg: string; text: string }> = {
    CRITICAL: { bg: 'bg-red-500/15', text: 'text-red-400' },
    HIGH: { bg: 'bg-orange-500/15', text: 'text-orange-400' },
    MEDIUM: { bg: 'bg-amber-500/15', text: 'text-amber-400' },
    LOW: { bg: 'bg-blue-400/15', text: 'text-blue-300' },
  };
  const c = colors[level] ?? colors.LOW;
  return <span className={`mono text-[8px] px-1.5 py-0.5 rounded ${c.bg} ${c.text}`}>{level}</span>;
};

const StatusBadge: React.FC<{ status: string }> = ({ status }) => {
  const map: Record<string, { bg: string; text: string }> = {
    PRODUCTION: { bg: `rgba(120,50,100,0.18)`, text: ACCENT },
    TESTING: { bg: 'rgba(139,92,246,0.15)', text: '#a78bfa' },
    DRAFT: { bg: 'rgb(var(--md-sys-color-surface-container-high))', text: 'rgb(var(--md-sys-color-on-surface-variant))' },
    DEVELOPMENT: { bg: `rgba(0,80,145,0.18)`, text: '#60a5fa' },
  };
  const c = map[status] ?? map.DRAFT;
  return (
    <span className="mono text-[8px] px-1.5 py-0.5 rounded" style={{ backgroundColor: c.bg, color: c.text }}>
      {status}
    </span>
  );
};

const MitreChip: React.FC<{ label: string; color: string }> = ({ label, color }) => (
  <span className="mono text-[7px] px-1.5 py-0.5 rounded-sm" style={{ backgroundColor: `${color}15`, color: `${color}bb` }}>
    {label}
  </span>
);

const LangBadge: React.FC<{ lang: string }> = ({ lang }) => (
  <span className="mono text-[7px] px-1.5 py-0.5 rounded bg-surface-container-low text-on-surface-variant">{lang}</span>
);

/* ------------------------------------------------------------------ */
/*  Slide 1 — Library View (Card Grid)                                */
/* ------------------------------------------------------------------ */

const detections = [
  {
    title: 'LSASS Credential Dumping via Mimikatz',
    desc: 'Detects process access to lsass.exe with suspicious access rights indicative of credential dumping tools like Mimikatz.',
    tactics: [{ name: 'Credential Access', color: '#ef4444' }],
    techniques: [{ name: 'T1003.001', color: ACCENT }],
    severity: 'CRITICAL',
    status: 'PRODUCTION',
    type: 'TTP',
    lang: 'SPL',
    library: 'Production',
    quality: 92,
  },
  {
    title: 'Encoded PowerShell Command Execution',
    desc: 'Identifies execution of PowerShell with encoded command arguments commonly used to obfuscate malicious scripts.',
    tactics: [{ name: 'Execution', color: '#a855f7' }],
    techniques: [{ name: 'T1059.001', color: ACCENT }],
    severity: 'HIGH',
    status: 'PRODUCTION',
    type: 'TTP',
    lang: 'KQL',
    library: 'Production',
    quality: 87,
  },
  {
    title: 'Scheduled Task Persistence via schtasks',
    desc: 'Monitors for creation of scheduled tasks via schtasks.exe that may indicate persistence or privilege escalation attempts.',
    tactics: [{ name: 'Persistence', color: '#3b82f6' }, { name: 'Execution', color: '#a855f7' }],
    techniques: [{ name: 'T1053.005', color: ACCENT }],
    severity: 'HIGH',
    status: 'TESTING',
    type: 'TTP',
    lang: 'Sigma',
    library: 'Production',
    quality: 74,
  },
  {
    title: 'DCSync Attack via Replication Request',
    desc: 'Detects directory replication service requests from non-domain controller hosts, indicating potential DCSync credential theft.',
    tactics: [{ name: 'Credential Access', color: '#ef4444' }],
    techniques: [{ name: 'T1003.006', color: ACCENT }],
    severity: 'CRITICAL',
    status: 'PRODUCTION',
    type: 'TTP',
    lang: 'SPL',
    library: 'Production',
    quality: 95,
  },
  {
    title: 'Suspicious WMI Remote Process Creation',
    desc: 'Identifies WMI-based remote process execution which may indicate lateral movement or remote code execution by an attacker.',
    tactics: [{ name: 'Execution', color: '#a855f7' }, { name: 'Lateral Movement', color: '#f97316' }],
    techniques: [{ name: 'T1047', color: ACCENT }],
    severity: 'MEDIUM',
    status: 'DRAFT',
    type: 'Anomaly',
    lang: 'KQL',
    library: 'Development',
    quality: 48,
  },
  {
    title: 'Phishing Link Click with Macro Execution',
    desc: 'Correlates email link clicks with subsequent Office macro execution events to detect phishing-based initial access attempts.',
    tactics: [{ name: 'Initial Access', color: TEAL }],
    techniques: [{ name: 'T1566.002', color: ACCENT }],
    severity: 'HIGH',
    status: 'DEVELOPMENT',
    type: 'Correlation',
    lang: 'YARA-L',
    library: 'Development',
    quality: 61,
  },
];

const DetectionCard: React.FC<{ d: typeof detections[number] }> = ({ d }) => (
  <div className="rounded-xl border border-outline-variant bg-surface-container-low p-4 flex flex-col gap-3 hover:border-outline-variant transition-colors cursor-pointer group">
    {/* Title */}
    <div className="text-[13px] text-on-surface-variant font-medium leading-snug group-hover:text-on-surface transition-colors line-clamp-1">
      {d.title}
    </div>

    {/* Description - 2 lines */}
    <p className="text-[11px] text-on-surface-variant leading-relaxed line-clamp-2">{d.desc}</p>

    {/* Tactic + Technique chips */}
    <div className="flex flex-wrap gap-1">
      {d.tactics.map(t => <MitreChip key={t.name} label={t.name} color={t.color} />)}
      {d.techniques.map(t => <MitreChip key={t.name} label={t.name} color={t.color} />)}
    </div>

    {/* Bottom row */}
    <div className="flex items-center justify-between mt-auto pt-2 border-t border-outline-variant">
      <div className="flex items-center gap-1.5">
        <SeverityBadge level={d.severity} />
        <span className="mono text-[7px] px-1.5 py-0.5 rounded bg-surface-container-low text-on-surface-variant">{d.type}</span>
      </div>
      <div className="flex items-center gap-1.5">
        <LangBadge lang={d.lang} />
        <StatusBadge status={d.status} />
        <QualityRing score={d.quality} size={28} />
      </div>
    </div>
  </div>
);

export const LibraryViewMockup = () => (
  <MockupFrame title="DETECTION LIBRARY" accent={TEAL}>
    {/* Header tabs + actions */}
    <div className="flex flex-wrap items-center justify-between gap-3 mb-5">
      <div className="flex items-center gap-1">
        <button className="mono text-[10px] px-3 py-1.5 rounded-lg text-on-surface border border-outline bg-surface-container-high">
          Production Library <span className="font-brand text-on-surface-variant ml-1">(129)</span>
        </button>
        <button className="mono text-[10px] px-3 py-1.5 rounded-lg text-on-surface-variant border border-outline-variant hover:text-on-surface-variant">
          Development <span className="font-brand text-outline ml-1">(11,688)</span>
        </button>
      </div>
      <div className="flex items-center gap-2">
        <div className="px-3 py-1.5 border border-outline-variant rounded-lg bg-surface-container-low text-[10px] text-on-surface-variant min-w-[140px]">
          Search detections...
        </div>
        <span className="mono text-[9px] text-on-surface-variant px-2 py-1.5 rounded-md border border-outline-variant">Severity ▾</span>
        <span className="mono text-[9px] text-on-surface-variant px-2 py-1.5 rounded-md border border-outline-variant">MITRE ▾</span>
        <span className="mono text-[9px] text-on-surface-variant px-2 py-1.5 rounded-md border border-outline-variant">Language ▾</span>
        {/* View toggle */}
        <div className="flex border border-outline-variant rounded-md overflow-hidden">
          <span className="mono text-[9px] px-2 py-1.5 bg-surface-container-high text-on-surface-variant">▦</span>
          <span className="mono text-[9px] px-2 py-1.5 text-outline">≡</span>
        </div>
        <button className="mono text-[10px] px-3 py-1.5 rounded-lg text-on-surface font-medium" style={{ backgroundColor: ACCENT }}>
          + New Detection
        </button>
      </div>
    </div>

    {/* Card grid — 3 columns */}
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
      {detections.map(d => <DetectionCard key={d.title} d={d} />)}
    </div>

    {/* Bottom bar */}
    <div className="flex items-center justify-between mt-5 text-xs text-outline">
      <span className="mono text-[9px]">Showing 6 of 129 detections</span>
      <div className="flex gap-2">
        <span className="mono text-[9px] px-2.5 py-1 rounded border border-outline-variant text-on-surface-variant">← Prev</span>
        <span className="mono text-[9px] px-2.5 py-1 rounded border border-outline-variant text-on-surface-variant">1</span>
        <span className="mono text-[9px] px-2.5 py-1 rounded border border-outline-variant bg-surface-container-high text-on-surface-variant">2</span>
        <span className="mono text-[9px] px-2.5 py-1 rounded border border-outline-variant text-on-surface-variant">3</span>
        <span className="mono text-[9px] px-2.5 py-1 rounded border border-outline-variant text-on-surface-variant">Next →</span>
      </div>
    </div>
  </MockupFrame>
);

/* ------------------------------------------------------------------ */
/*  Slide 2 — Detection Packs                                         */
/* ------------------------------------------------------------------ */

const packs = [
  {
    name: 'BlackBasta Ransomware',
    rules: 47,
    ttps: 23,
    platforms: 4,
    coverage: 78,
    platformBadges: ['Splunk', 'Sentinel', 'Elastic', 'Chronicle'],
    tags: ['Ransomware', 'Double Extortion', 'QakBot'],
  },
  {
    name: 'Scattered Spider',
    rules: 38,
    ttps: 19,
    platforms: 3,
    coverage: 85,
    platformBadges: ['Splunk', 'Sentinel', 'CrowdStrike'],
    tags: ['Social Engineering', 'MFA Bypass', 'SIM Swap'],
  },
  {
    name: 'Living Off the Land (LOLBins)',
    rules: 92,
    ttps: 41,
    platforms: 5,
    coverage: 64,
    platformBadges: ['Splunk', 'Sentinel', 'Elastic', 'Chronicle', 'CrowdStrike'],
    tags: ['LOLBins', 'Fileless', 'Defense Evasion'],
  },
  {
    name: 'APT29 — Cozy Bear',
    rules: 55,
    ttps: 31,
    platforms: 3,
    coverage: 71,
    platformBadges: ['Splunk', 'Sentinel', 'Elastic'],
    tags: ['Nation State', 'Supply Chain', 'SolarWinds'],
  },
];

const CoverageBar: React.FC<{ percent: number }> = ({ percent }) => {
  const color = percent >= 80 ? TEAL : percent >= 60 ? BLUE : '#f59e0b';
  return (
    <div className="flex items-center gap-2 w-full">
      <div className="flex-1 h-2 rounded-full bg-surface-container-high overflow-hidden">
        <div className="h-full rounded-full" style={{ width: `${percent}%`, backgroundColor: color }} />
      </div>
      <span className="font-brand text-sm font-bold" style={{ color }}>{percent}%</span>
    </div>
  );
};

const DetectionPacksMockup = () => (
  <MockupFrame title="DETECTION PACKS" accent={ACCENT}>
    {/* Header */}
    <div className="flex items-center justify-between mb-5">
      <div className="flex items-center gap-3">
        <span className="text-sm text-on-surface-variant">
          <span className="font-brand text-on-surface-variant text-lg mr-1">12</span> Detection Packs
        </span>
        <div className="px-3 py-1.5 border border-outline-variant rounded-lg bg-surface-container-low text-[10px] text-on-surface-variant min-w-[140px]">
          Search packs...
        </div>
      </div>
      <button className="mono text-[10px] px-3 py-1.5 rounded-lg text-on-surface font-medium" style={{ backgroundColor: ACCENT }}>
        Create Pack
      </button>
    </div>

    {/* Pack cards - 2 columns */}
    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
      {packs.map(p => (
        <div key={p.name} className="rounded-xl border border-outline-variant bg-surface-container-low p-5 hover:border-outline-variant transition-colors cursor-pointer group">
          <div className="text-[14px] text-on-surface-variant font-medium mb-3 group-hover:text-on-surface transition-colors">{p.name}</div>

          {/* Stats row */}
          <div className="flex items-center gap-5 mb-4">
            <div className="flex flex-col items-center">
              <span className="font-brand text-lg font-bold text-on-surface">{p.rules}</span>
              <span className="mono text-[8px] text-on-surface-variant">RULES</span>
            </div>
            <div className="flex flex-col items-center">
              <span className="font-brand text-lg font-bold text-on-surface">{p.ttps}</span>
              <span className="mono text-[8px] text-on-surface-variant">TTPs</span>
            </div>
            <div className="flex flex-col items-center">
              <span className="font-brand text-lg font-bold text-on-surface">{p.platforms}</span>
              <span className="mono text-[8px] text-on-surface-variant">PLATFORMS</span>
            </div>
            <div className="flex-1 ml-2">
              <span className="mono text-[8px] text-on-surface-variant block mb-1">COVERAGE</span>
              <CoverageBar percent={p.coverage} />
            </div>
          </div>

          {/* Platform badges */}
          <div className="flex flex-wrap gap-1 mb-3">
            {p.platformBadges.map(pl => (
              <span key={pl} className="mono text-[7px] px-1.5 py-0.5 rounded bg-surface-container-low text-on-surface-variant">{pl}</span>
            ))}
          </div>

          {/* Tags */}
          <div className="flex flex-wrap gap-1">
            {p.tags.map(tag => (
              <span key={tag} className="mono text-[7px] px-1.5 py-0.5 rounded-sm" style={{ backgroundColor: `${ACCENT}15`, color: `${ACCENT}bb` }}>
                {tag}
              </span>
            ))}
          </div>
        </div>
      ))}
    </div>
  </MockupFrame>
);

/* ------------------------------------------------------------------ */
/*  Slide 3 — Bulk Import Wizard                                      */
/* ------------------------------------------------------------------ */

const BulkImportMockup = () => (
  <MockupFrame title="BULK IMPORT WIZARD" accent={BLUE}>
    {/* Step indicators */}
    <div className="flex items-center gap-0 mb-6 overflow-hidden">
      {['Source', 'Scan', 'Parsing', 'Preview', 'Import', 'Results'].map((step, i) => (
        <div key={step} className="flex items-center">
          <div className={`flex items-center gap-2 px-3 py-1.5 rounded-lg ${i === 0 ? 'bg-surface-container-high border border-outline-variant' : ''}`}>
            <div
              className="w-5 h-5 rounded-full flex items-center justify-center mono text-[9px] font-bold"
              style={i === 0 ? { backgroundColor: `${BLUE}30`, color: `${BLUE}cc` } : {}}
            >
              <span className={i === 0 ? '' : 'text-outline'}>{i + 1}</span>
            </div>
            <span className={`mono text-[10px] ${i === 0 ? 'text-on-surface-variant' : 'text-outline'}`}>{step}</span>
          </div>
          {i < 5 && <div className="w-6 h-px bg-outline-variant mx-1" />}
        </div>
      ))}
    </div>

    <div className="grid md:grid-cols-[1fr_280px] gap-6">
      <div>
        {/* Import Source cards */}
        <div className="mono text-[10px] text-on-surface-variant mb-3 tracking-wider">SELECT IMPORT SOURCE</div>
        <div className="grid grid-cols-3 gap-3 mb-6">
          {[
            { icon: '📦', label: 'ZIP Archive', desc: 'Upload a ZIP containing detection rules', active: true },
            { icon: '📄', label: 'Individual Files', desc: 'Upload one or more rule files directly', active: false },
            { icon: '🔗', label: 'GitHub Repository', desc: 'Clone rules from a public or private repo', active: false },
          ].map(s => (
            <div
              key={s.label}
              className={`rounded-xl border p-4 cursor-pointer transition-colors text-center ${
                s.active
                  ? 'border-outline bg-surface-container-high'
                  : 'border-outline-variant bg-surface-container-low hover:border-outline-variant'
              }`}
              style={s.active ? { borderColor: `${BLUE}50` } : undefined}
            >
              <div className="text-2xl mb-2">{s.icon}</div>
              <div className="text-[12px] text-on-surface-variant font-medium mb-1">{s.label}</div>
              <div className="text-[9px] text-on-surface-variant leading-relaxed">{s.desc}</div>
            </div>
          ))}
        </div>

        {/* Vendor Format selector */}
        <div className="mono text-[10px] text-on-surface-variant mb-3 tracking-wider">VENDOR FORMAT</div>
        <div className="flex flex-wrap gap-2 mb-6">
          {['Auto-Detect', 'Sigma', 'Splunk ESCU', 'Elastic', 'Microsoft Sentinel', 'CrowdStrike', 'Chronicle'].map((v, i) => (
            <button
              key={v}
              className={`mono text-[9px] px-3 py-1.5 rounded-lg border transition-colors ${
                i === 0
                  ? 'text-on-surface-variant border-outline bg-surface-container-high'
                  : 'text-on-surface-variant border-outline-variant hover:text-on-surface-variant'
              }`}
              style={i === 0 ? { borderColor: `${BLUE}50` } : undefined}
            >
              {v}
            </button>
          ))}
        </div>

        {/* Drop zone */}
        <div className="border-2 border-dashed border-outline-variant rounded-xl p-8 text-center hover:border-outline transition-colors">
          <div className="text-3xl text-outline-variant mb-2">↑</div>
          <div className="text-[12px] text-on-surface-variant mb-1">Drop your ZIP file here</div>
          <div className="text-[10px] text-outline-variant">or click to browse &mdash; up to 500MB</div>
        </div>
      </div>

      {/* Right sidebar — import options */}
      <div className="space-y-5">
        <div>
          <div className="mono text-[10px] text-on-surface-variant mb-2 tracking-wider">IMPORT DESTINATION</div>
          <div className="space-y-2">
            {['Production Library', 'Development Library'].map((dest, i) => (
              <label key={dest} className="flex items-center gap-2.5 text-[11px] cursor-pointer">
                <div className={`w-3.5 h-3.5 rounded-full border-2 flex items-center justify-center ${i === 1 ? 'border-blue-400/60' : 'border-outline'}`}>
                  {i === 1 && <div className="w-1.5 h-1.5 rounded-full bg-blue-400/80" />}
                </div>
                <span className={i === 1 ? 'text-on-surface-variant' : 'text-on-surface-variant'}>{dest}</span>
              </label>
            ))}
          </div>
        </div>

        <div>
          <div className="mono text-[10px] text-on-surface-variant mb-2 tracking-wider">DUPLICATE HANDLING</div>
          <div className="space-y-2">
            {['Skip Duplicates', 'Update Existing', 'Create New'].map((opt, i) => (
              <label key={opt} className="flex items-center gap-2.5 text-[11px] cursor-pointer">
                <div className={`w-3.5 h-3.5 rounded-full border-2 flex items-center justify-center ${i === 0 ? 'border-blue-400/60' : 'border-outline'}`}>
                  {i === 0 && <div className="w-1.5 h-1.5 rounded-full bg-blue-400/80" />}
                </div>
                <span className={i === 0 ? 'text-on-surface-variant' : 'text-on-surface-variant'}>{opt}</span>
              </label>
            ))}
          </div>
        </div>

        <div className="rounded-lg border border-outline-variant bg-surface-container-low p-3">
          <div className="mono text-[9px] text-on-surface-variant mb-2">IMPORT PREVIEW</div>
          <div className="flex items-center justify-between text-[10px] mb-1">
            <span className="text-on-surface-variant">Estimated rules</span>
            <span className="font-brand text-on-surface-variant">—</span>
          </div>
          <div className="flex items-center justify-between text-[10px] mb-1">
            <span className="text-on-surface-variant">Vendor format</span>
            <span className="mono text-on-surface-variant">Auto-Detect</span>
          </div>
          <div className="flex items-center justify-between text-[10px]">
            <span className="text-on-surface-variant">Destination</span>
            <span className="mono text-on-surface-variant">Development</span>
          </div>
        </div>

        <button className="mono text-[10px] w-full px-4 py-2.5 rounded-lg text-on-surface-variant border border-outline-variant bg-surface-container-low cursor-not-allowed">
          Upload &amp; Scan →
        </button>
      </div>
    </div>
  </MockupFrame>
);

/* ------------------------------------------------------------------ */
/*  Slide 4 — Complete Detection Document                              */
/* ------------------------------------------------------------------ */

const CompleteDetectionMockup = () => (
  <MockupFrame title="CREATE DETECTION" accent={ACCENT}>
    {/* Top bar — title + AI button */}
    <div className="flex items-center justify-between mb-5">
      <div className="flex items-center gap-3">
        <StatusBadge status="DRAFT" />
        <span className="text-[14px] text-on-surface-variant font-medium">New Detection</span>
      </div>
      <button className="mono text-[10px] px-3 py-1.5 rounded-lg text-on-surface font-medium flex items-center gap-1.5"
        style={{ backgroundColor: `${ACCENT}90` }}>
        <span className="text-sm">✦</span> AI Suggest
      </button>
    </div>

    {/* Tabs */}
    <div className="flex gap-0.5 mb-6 border-b border-outline-variant">
      {['Overview', 'Detection Query', 'Investigation', 'Validation & Tuning'].map((t, i) => (
        <span
          key={t}
          className={`mono text-[10px] px-4 py-2.5 border-b-2 cursor-pointer transition-colors ${
            i === 0 ? 'text-on-surface border-outline' : 'text-on-surface-variant border-transparent hover:text-on-surface-variant'
          }`}
        >
          {t}
        </span>
      ))}
    </div>

    <div className="grid md:grid-cols-[1fr_260px] gap-6">
      {/* Main form */}
      <div className="space-y-4">
        {/* Detection Name */}
        <div>
          <label className="mono text-[9px] text-on-surface-variant tracking-wider block mb-1.5">DETECTION NAME</label>
          <div className="w-full px-3 py-2 rounded-lg border border-outline-variant bg-surface-container-low text-[12px] text-on-surface-variant">
            Suspicious WMI Remote Process Creation
          </div>
        </div>

        {/* Description */}
        <div>
          <label className="mono text-[9px] text-on-surface-variant tracking-wider block mb-1.5">DESCRIPTION</label>
          <div className="w-full px-3 py-2 rounded-lg border border-outline-variant bg-surface-container-low text-[11px] text-on-surface-variant leading-relaxed min-h-[52px]">
            Identifies WMI-based remote process execution which may indicate lateral movement or remote code execution by an adversary who has obtained valid credentials.
          </div>
        </div>

        {/* Status / Severity row */}
        <div className="grid grid-cols-2 gap-3">
          {[
            { label: 'STATUS', value: 'Draft', valueColor: 'text-on-surface-variant' },
            { label: 'SEVERITY', value: 'Medium', valueColor: 'text-amber-400/70' },
          ].map(f => (
            <div key={f.label}>
              <label className="mono text-[8px] text-on-surface-variant tracking-wider block mb-1">{f.label}</label>
              <div className={`px-2.5 py-1.5 rounded-lg border border-outline-variant bg-surface-container-low text-[11px] ${f.valueColor} flex items-center justify-between`}>
                {f.value} <span className="text-outline-variant text-[9px]">▾</span>
              </div>
            </div>
          ))}
        </div>

        {/* Author + Detection Type */}
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="mono text-[8px] text-on-surface-variant tracking-wider block mb-1">AUTHOR</label>
            <div className="px-2.5 py-1.5 rounded-lg border border-outline-variant bg-surface-container-low text-[11px] text-on-surface-variant">
              John Park
            </div>
          </div>
          <div>
            <label className="mono text-[8px] text-on-surface-variant tracking-wider block mb-1">DETECTION TYPE</label>
            <div className="px-2.5 py-1.5 rounded-lg border border-outline-variant bg-surface-container-low text-[11px] text-on-surface-variant flex items-center justify-between">
              TTP <span className="text-outline-variant text-[9px]">▾</span>
            </div>
          </div>
        </div>

        {/* Data Sources & Platforms section */}
        <div className="border border-outline-variant rounded-xl p-4 bg-surface-container-low">
          <div className="mono text-[9px] text-on-surface-variant tracking-wider mb-3">DATA SOURCES &amp; PLATFORMS</div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="mono text-[8px] text-on-surface-variant block mb-1.5">LOG SOURCES</label>
              <div className="flex flex-wrap gap-1">
                {['Windows Security', 'Sysmon', 'WMI-Activity'].map(s => (
                  <span key={s} className="mono text-[8px] px-2 py-0.5 rounded bg-surface-container-low text-on-surface-variant flex items-center gap-1">
                    {s} <span className="text-outline-variant cursor-pointer">×</span>
                  </span>
                ))}
              </div>
            </div>
            <div>
              <label className="mono text-[8px] text-on-surface-variant block mb-1.5">PLATFORMS</label>
              <div className="flex flex-wrap gap-1">
                {['Windows', 'Azure AD'].map(p => (
                  <span key={p} className="mono text-[8px] px-2 py-0.5 rounded bg-surface-container-low text-on-surface-variant flex items-center gap-1">
                    {p} <span className="text-outline-variant cursor-pointer">×</span>
                  </span>
                ))}
              </div>
            </div>
          </div>
        </div>

        {/* Threat Context section */}
        <div className="border border-outline-variant rounded-xl p-4 bg-surface-container-low">
          <div className="mono text-[9px] text-on-surface-variant tracking-wider mb-3">THREAT CONTEXT</div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="mono text-[8px] text-on-surface-variant block mb-1.5">MITRE TACTICS</label>
              <div className="flex flex-wrap gap-1">
                <MitreChip label="Execution" color="#a855f7" />
                <MitreChip label="Lateral Movement" color="#f97316" />
              </div>
            </div>
            <div>
              <label className="mono text-[8px] text-on-surface-variant block mb-1.5">MITRE TECHNIQUES</label>
              <div className="flex flex-wrap gap-1">
                <MitreChip label="T1047 — WMI" color={ACCENT} />
              </div>
            </div>
          </div>
          <div className="mt-3">
            <label className="mono text-[8px] text-on-surface-variant block mb-1.5">RELATED THREAT GROUPS</label>
            <div className="flex flex-wrap gap-1">
              {['APT29', 'APT41', 'Lazarus Group'].map(g => (
                <span key={g} className="mono text-[7px] px-1.5 py-0.5 rounded-sm" style={{ backgroundColor: `${BLUE}18`, color: `${BLUE}aa` }}>
                  {g}
                </span>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* Right sidebar — completeness + quality */}
      <div className="space-y-4">
        {/* Quality score */}
        <div className="rounded-xl border border-outline-variant bg-surface-container-low p-4 flex flex-col items-center">
          <div className="mono text-[9px] text-on-surface-variant tracking-wider mb-3">QUALITY SCORE</div>
          <QualityRing score={48} size={72} />
          <span className="mono text-[9px] mt-2 px-2 py-0.5 rounded" style={{ backgroundColor: '#f59e0b18', color: '#f59e0bbb' }}>
            Grade: D — Needs Work
          </span>
        </div>

        {/* Completeness checklist */}
        <div className="rounded-xl border border-outline-variant bg-surface-container-low p-4">
          <div className="mono text-[9px] text-on-surface-variant tracking-wider mb-3">DETECTION COMPLETENESS</div>
          {[
            { label: 'Detection Name', done: true },
            { label: 'Description', done: true },
            { label: 'Detection Query', done: false },
            { label: 'MITRE Mapping', done: true },
            { label: 'Data Sources', done: true },
            { label: 'Investigation Steps', done: false },
            { label: 'False Positive Guide', done: false },
            { label: 'Response Actions', done: false },
            { label: 'Test Cases', done: false },
            { label: 'References', done: false },
          ].map(c => (
            <div key={c.label} className="flex items-center gap-2 mb-1.5 text-[10px]">
              <div className={`w-3.5 h-3.5 rounded border flex items-center justify-center ${c.done ? 'border-emerald-500/40 bg-emerald-500/10' : 'border-outline-variant'}`}>
                {c.done && <span style={{ color: TEAL }} className="text-[8px]">✓</span>}
              </div>
              <span className={c.done ? 'text-on-surface-variant' : 'text-outline'}>{c.label}</span>
            </div>
          ))}
          <div className="mt-3 pt-3 border-t border-outline-variant flex items-center justify-between">
            <span className="mono text-[8px] text-on-surface-variant">Completed</span>
            <span className="font-brand text-[13px] text-on-surface-variant">4 / 10</span>
          </div>
        </div>

        {/* Actions */}
        <div className="space-y-2">
          <button className="mono text-[10px] w-full px-3 py-2 rounded-lg text-on-surface-variant" style={{ backgroundColor: `${ACCENT}40` }}>
            Save Draft
          </button>
          <button className="mono text-[10px] w-full px-3 py-2 rounded-lg text-on-surface-variant border border-outline-variant">
            Submit for Review
          </button>
        </div>
      </div>
    </div>
  </MockupFrame>
);

/* ------------------------------------------------------------------ */
/*  Exported Component                                                 */
/* ------------------------------------------------------------------ */

export const DetectionLibraryFeature: React.FC = () => {
  const [active, setActive] = useState(0);

  const slides = [
    { label: 'Library View', content: <LibraryViewMockup /> },
    { label: 'Detection Packs', content: <DetectionPacksMockup /> },
    { label: 'Bulk Import', content: <BulkImportMockup /> },
    { label: 'Complete Detection Document', content: <CompleteDetectionMockup /> },
  ];

  return (
    <FeatureSlide
      headline="Your detection library. Not spreadsheets, not scattered SIEM rules."
      description="A centralized, searchable library with card views, detection packs, bulk import from any vendor, and thorough documentation for every detection — from query to investigation runbook."
    >
      <FeatureCarousel slides={slides} activeIndex={active} onSelect={setActive} />
    </FeatureSlide>
  );
};
