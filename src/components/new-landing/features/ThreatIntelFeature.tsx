import { Spinner } from '@/components/ui/Spinner';
import React, { useState, useEffect, useRef } from 'react';
import { FeatureSlide, MockupFrame, FeatureCarousel } from '../shared/FeatureSlide';
import { Icon } from '../../Icon';

const ACCENT = '#783264';
const TEAL = '#4D7C6F';

/* ------------------------------------------------------------------ */
/*  Slide 1 — Intelligence Reports listing grid                       */
/* ------------------------------------------------------------------ */

const REPORTS = [
  {
    severity: 'CRITICAL',
    sevColor: '#dc2626',
    type: 'ZERO-DAY EXPLOIT',
    typeColor: '#ef4444',
    title: 'Defending Against the CVE-2025-55182 React2Shell Vulnerability in Enterprise Environments',
    source: 'Microsoft Security',
    date: 'Jan 22, 2026',
    ttps: 8,
    iocs: 13,
    rules: 3,
    coverage: 50,
  },
  {
    severity: 'HIGH',
    sevColor: '#ef4444',
    type: 'RANSOMWARE',
    typeColor: '#f59e0b',
    title: "Cat's Got Your Files: Lynx Ransomware Targeting Healthcare and Manufacturing",
    source: 'The DFIR Report',
    date: 'Feb 3, 2026',
    ttps: 23,
    iocs: 37,
    rules: 12,
    coverage: 0,
  },
  {
    severity: 'HIGH',
    sevColor: '#ef4444',
    type: 'PHISHING',
    typeColor: '#a78bfa',
    title: 'Meet Scattered Spider: The Group Currently Scattering UK Retail Operations',
    source: 'CrowdStrike Intelligence',
    date: 'Mar 11, 2026',
    ttps: 20,
    iocs: 28,
    rules: 0,
    coverage: 5,
  },
  {
    severity: 'CRITICAL',
    sevColor: '#dc2626',
    type: 'INFOSTEALER',
    typeColor: '#38bdf8',
    title: 'Lumma Stealer Infrastructure Expansion and New Evasion Techniques Observed in the Wild',
    source: 'Recorded Future',
    date: 'Mar 5, 2026',
    ttps: 15,
    iocs: 22,
    rules: 5,
    coverage: 33,
  },
  {
    severity: 'HIGH',
    sevColor: '#ef4444',
    type: 'FINANCIAL CRIME',
    typeColor: '#fbbf24',
    title: 'FIN7 Resurfaces with Novel Supply Chain Compromise Targeting POS Systems',
    source: 'Mandiant',
    date: 'Feb 18, 2026',
    ttps: 18,
    iocs: 31,
    rules: 7,
    coverage: 22,
  },
  {
    severity: 'HIGH',
    sevColor: '#ef4444',
    type: 'ZERO-DAY EXPLOIT',
    typeColor: '#ef4444',
    title: 'Active Exploitation of Ivanti Connect Secure VPN — Patch Immediately',
    source: 'CISA',
    date: 'Jan 30, 2026',
    ttps: 12,
    iocs: 34,
    rules: 8,
    coverage: 42,
  },
];

function coverageColor(pct: number) {
  if (pct >= 50) return '#4D7C6F';
  if (pct >= 20) return '#f59e0b';
  return '#ef4444';
}

const ReportCard: React.FC<{ r: typeof REPORTS[number] }> = ({ r }) => (
  <div className="border border-outline-variant rounded-lg p-4 bg-surface-container-low hover:bg-surface-container-low transition-colors flex flex-col">
    {/* Badges */}
    <div className="flex items-center gap-2 mb-3 flex-wrap">
      <span
        className="mono text-[8px] font-bold px-2 py-0.5 rounded uppercase tracking-wider"
        style={{ backgroundColor: `${r.sevColor}20`, color: `${r.sevColor}cc`, border: `1px solid ${r.sevColor}30` }}
      >
        {r.severity}
      </span>
      <span
        className="mono text-[8px] px-2 py-0.5 rounded uppercase tracking-wider"
        style={{ backgroundColor: `${r.typeColor}15`, color: `${r.typeColor}bb` }}
      >
        {r.type}
      </span>
    </div>

    {/* Title */}
    <h4 className="text-sm text-on-surface-variant font-medium leading-snug mb-3 line-clamp-2 flex-1">
      {r.title}
    </h4>

    {/* Source + Date */}
    <div className="text-[11px] text-on-surface-variant mb-4">
      {r.source} &middot; {r.date}
    </div>

    {/* Stats row */}
    <div className="grid grid-cols-4 gap-2 pt-3 border-t border-outline-variant">
      {[
        { label: 'TTPs', value: r.ttps },
        { label: 'IoCs', value: r.iocs },
        { label: 'Rules', value: r.rules },
      ].map(s => (
        <div key={s.label} className="text-center">
          <div className="mono text-sm font-bold" style={{ color: `${ACCENT}cc` }}>{s.value}</div>
          <div className="mono text-[8px] text-on-surface-variant uppercase tracking-wider">{s.label}</div>
        </div>
      ))}
      <div className="text-center">
        <div className="mono text-sm font-bold" style={{ color: coverageColor(r.coverage) }}>{r.coverage}%</div>
        <div className="mono text-[8px] text-on-surface-variant uppercase tracking-wider">Coverage</div>
      </div>
    </div>
  </div>
);

export const ReportListingMockup = () => (
  <MockupFrame title="INTELLIGENCE REPORTS" accent={ACCENT}>
    {/* Header */}
    <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4 mb-5">
      <div>
        <h3 className="text-base font-semibold text-on-surface mb-1">Intelligence Reports</h3>
        <p className="text-[11px] text-on-surface-variant">Analyze threat intelligence to extract TTPs, indicators, and detection opportunities</p>
      </div>
      <button className="mono text-[10px] px-4 py-2 rounded-lg shrink-0 font-medium" style={{ backgroundColor: ACCENT, color: '#fff' }}>
        + Analyze Report
      </button>
    </div>

    {/* Stats row */}
    <div className="flex flex-wrap items-center gap-x-4 gap-y-1 mono text-[9px] tracking-wider text-on-surface-variant mb-5 pb-4 border-b border-outline-variant">
      <span><span style={{ color: `${ACCENT}cc` }} className="font-bold">8</span> REPORTS</span>
      <span className="text-outline-variant">&middot;</span>
      <span><span className="font-bold text-red-600">3</span> CRITICAL</span>
      <span className="text-outline-variant">&middot;</span>
      <span><span className="font-bold text-orange-600">5</span> HIGH</span>
      <span className="text-outline-variant">&middot;</span>
      <span><span style={{ color: `${ACCENT}cc` }} className="font-bold">116</span> TTPs</span>
      <span className="text-outline-variant">&middot;</span>
      <span><span style={{ color: `${ACCENT}cc` }} className="font-bold">164</span> IoCs</span>
      <span className="text-outline-variant">&middot;</span>
      <span><span style={{ color: `${ACCENT}cc` }} className="font-bold">11%</span> AVG COVERAGE</span>
    </div>

    {/* Filter bar */}
    <div className="flex flex-wrap items-center gap-2 mb-5">
      <div className="flex-1 min-w-[140px] px-3 py-1.5 border border-outline-variant rounded-lg bg-surface-container-low text-[11px] text-on-surface-variant">Search reports...</div>
      <span className="mono text-[9px] text-on-surface-variant px-2.5 py-1.5 rounded-md border border-outline-variant">Severity ▾</span>
      <span className="mono text-[9px] text-on-surface-variant px-2.5 py-1.5 rounded-md border border-outline-variant">+ Filter</span>
      <span className="mono text-[9px] text-on-surface-variant ml-auto">8 reports</span>
      <div className="flex gap-1">
        <span className="px-1.5 py-1 rounded border border-outline-variant bg-surface-container-low">
          <svg className="w-3 h-3 text-on-surface-variant" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path d="M4 6h16M4 12h16M4 18h16" /></svg>
        </span>
        <span className="px-1.5 py-1 rounded border border-outline-variant">
          <svg className="w-3 h-3 text-outline" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><rect x="3" y="3" width="7" height="7" /><rect x="14" y="3" width="7" height="7" /><rect x="3" y="14" width="7" height="7" /><rect x="14" y="14" width="7" height="7" /></svg>
        </span>
      </div>
    </div>

    {/* Report cards grid */}
    <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
      {REPORTS.map(r => <ReportCard key={r.title} r={r} />)}
    </div>
  </MockupFrame>
);

/* ------------------------------------------------------------------ */
/*  Slide 2 — 8-Stage Pipeline with sequential animation              */
/* ------------------------------------------------------------------ */

export const PipelineMockup = () => {
  const [revealed, setRevealed] = useState(0);
  const ref = useRef<HTMLDivElement>(null);
  const done = useRef(false);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const obs = new IntersectionObserver(([e]) => {
      if (e.isIntersecting && !done.current) {
        done.current = true;
        let i = 0;
        const go = () => { i++; setRevealed(i); if (i < 8) setTimeout(go, 400); };
        setTimeout(go, 300);
      }
    }, { threshold: 0.2 });
    obs.observe(el);
    return () => obs.disconnect();
  }, []);

  const stages = [
    { name: 'Fetching content', result: 'URL resolved' },
    { name: 'Parsing HTML', result: 'Content extracted' },
    { name: 'Executive summary', result: 'APT29 Midnight Blizzard | CRITICAL' },
    { name: 'Classification', result: 'APT / Espionage / State-sponsored' },
    { name: 'TTP extraction', result: '12 MITRE techniques identified' },
    { name: 'IoC extraction', result: '47 indicators (IPs, domains, hashes)' },
    { name: 'Rule extraction', result: '3 Sigma rules, 1 KQL query' },
    { name: 'Library matching', result: '8/12 covered — 3 critical gaps' },
  ];

  return (
    <MockupFrame title="8-STAGE ANALYSIS PIPELINE" accent={ACCENT}>
      {/* Input area */}
      <div className="border border-outline-variant rounded-lg px-4 py-3 mb-6 bg-surface-container-low">
        <span className="mono text-[10px] text-on-surface-variant block mb-1">SOURCE</span>
        <div className="text-sm text-on-surface-variant">https://www.microsoft.com/en-us/security/blog/midnight-blizzard-apt29...</div>
      </div>

      {/* 8-stage pipeline */}
      <div ref={ref} className="space-y-2.5">
        {stages.map((s, i) => (
          <div key={s.name} className="flex items-center gap-3">
            {i < revealed ? (
              <div className="w-6 h-6 rounded-full flex items-center justify-center shrink-0" style={{ backgroundColor: `${TEAL}25` }}>
                <Icon name="check" className="w-3 h-3" style={{ color: TEAL }} />
              </div>
            ) : i === revealed ? (
              <Spinner className="text-primary" />
            ) : (
              <div className="w-6 h-6 rounded-full border border-outline-variant shrink-0" />
            )}
            <span className={`mono text-xs flex-1 ${i > revealed ? 'text-outline' : 'text-on-surface-variant'}`}>{s.name}</span>
            <span className={`text-xs text-right ${i <= revealed ? 'text-on-surface-variant' : 'text-transparent'}`}>{i <= revealed ? s.result : ''}</span>
          </div>
        ))}
      </div>

      {/* Completion summary */}
      {revealed >= 8 && (
        <div className="mt-6 pt-4 border-t border-outline-variant flex items-center gap-4">
          <div className="mono text-[10px] text-on-surface-variant">Pipeline complete in <span style={{ color: TEAL }} className="font-bold">12.4s</span></div>
          <div className="flex gap-3 ml-auto">
            {[
              { label: 'TTPs', value: '12' },
              { label: 'IoCs', value: '47' },
              { label: 'Rules', value: '4' },
              { label: 'Gaps', value: '3' },
            ].map(s => (
              <div key={s.label} className="text-center">
                <div className="mono text-sm font-bold" style={{ color: `${ACCENT}cc` }}>{s.value}</div>
                <div className="mono text-[7px] text-on-surface-variant uppercase">{s.label}</div>
              </div>
            ))}
          </div>
        </div>
      )}
    </MockupFrame>
  );
};

/* ------------------------------------------------------------------ */
/*  Slide 3 — Coverage Analysis (mini MITRE heatmap + gap list)       */
/* ------------------------------------------------------------------ */

const TACTICS = [
  { name: 'Initial Access', short: 'Init Access', covered: 2, total: 3 },
  { name: 'Execution', short: 'Execution', covered: 1, total: 2 },
  { name: 'Persistence', short: 'Persistence', covered: 2, total: 2 },
  { name: 'Priv Escalation', short: 'Priv Esc', covered: 0, total: 1 },
  { name: 'Defense Evasion', short: 'Def Evasion', covered: 0, total: 3 },
  { name: 'Credential Access', short: 'Cred Access', covered: 1, total: 2 },
  { name: 'Discovery', short: 'Discovery', covered: 1, total: 1 },
  { name: 'Lateral Movement', short: 'Lat Move', covered: 1, total: 1 },
  { name: 'Collection', short: 'Collection', covered: 0, total: 1 },
  { name: 'C2', short: 'C2', covered: 1, total: 1 },
  { name: 'Exfiltration', short: 'Exfil', covered: 0, total: 1 },
  { name: 'Impact', short: 'Impact', covered: 1, total: 1 },
];

const GAPS = [
  { tech: 'T1055', name: 'Process Injection', tactic: 'Defense Evasion', impact: 'Core evasion technique — used by 140+ groups' },
  { tech: 'T1070', name: 'Indicator Removal', tactic: 'Defense Evasion', impact: 'Anti-forensics, log tampering' },
  { tech: 'T1003', name: 'OS Credential Dumping', tactic: 'Credential Access', impact: 'LSASS dumping, Mimikatz, DCSync' },
  { tech: 'T1560', name: 'Archive Collected Data', tactic: 'Collection', impact: 'Data staging before exfiltration' },
  { tech: 'T1048', name: 'Exfiltration Over Alt Protocol', tactic: 'Exfiltration', impact: 'DNS / HTTPS tunneling' },
];

export const CoverageMockup = () => (
  <MockupFrame title="COVERAGE ANALYSIS — Lynx Ransomware Report" accent={TEAL}>
    <div className="grid md:grid-cols-[1fr_1fr] gap-6">
      {/* Mini MITRE heatmap */}
      <div>
        <div className="mono text-[10px] text-on-surface-variant mb-3 tracking-wider">TECHNIQUE COVERAGE FROM REPORT</div>
        <div className="grid grid-cols-4 gap-1.5 mb-5">
          {TACTICS.map(t => {
            const pct = t.total > 0 ? t.covered / t.total : 0;
            const bg = pct >= 1 ? `${TEAL}50` : pct > 0 ? `${TEAL}25` : '#ef444420';
            return (
              <div key={t.short} className="text-center">
                <div className="h-10 rounded mb-1 flex items-center justify-center relative" style={{ backgroundColor: bg }}>
                  <span className="mono text-[8px] font-bold" style={{ color: pct >= 1 ? TEAL : pct > 0 ? `${TEAL}aa` : '#ef444488' }}>
                    {t.covered}/{t.total}
                  </span>
                </div>
                <span className="mono text-[7px] text-on-surface-variant leading-none">{t.short}</span>
              </div>
            );
          })}
        </div>

        {/* Coverage bar */}
        <div className="flex items-center gap-3 mb-2">
          <span className="mono text-[10px] text-on-surface-variant">Coverage: 10/19 (53%)</span>
          <span className="mono text-[9px] px-2 py-0.5 rounded bg-red-500/10 text-red-400/80 border border-red-500/20">5 GAPS</span>
        </div>
        <div className="h-3 rounded-full bg-surface-container-high overflow-hidden mb-4">
          <div className="h-full rounded-full" style={{ width: '53%', backgroundColor: ACCENT }} />
        </div>

        {/* Legend */}
        <div className="flex gap-4 text-[8px] mono text-on-surface-variant">
          <span className="flex items-center gap-1"><span className="inline-block w-2.5 h-2.5 rounded" style={{ backgroundColor: `${TEAL}50` }} /> Full coverage</span>
          <span className="flex items-center gap-1"><span className="inline-block w-2.5 h-2.5 rounded" style={{ backgroundColor: `${TEAL}25` }} /> Partial</span>
          <span className="flex items-center gap-1"><span className="inline-block w-2.5 h-2.5 rounded bg-red-500/20" /> No coverage</span>
        </div>
      </div>

      {/* Gap details */}
      <div>
        <div className="mono text-[10px] text-on-surface-variant mb-3 tracking-wider">CRITICAL GAPS</div>
        <div className="space-y-2">
          {GAPS.map(g => (
            <div key={g.tech} className="border border-red-500/10 rounded-lg p-3 bg-red-500/[0.02]">
              <div className="flex items-center gap-2 mb-1">
                <span className="mono text-xs text-on-surface-variant font-bold">{g.tech}</span>
                <span className="text-xs text-on-surface-variant">{g.name}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="mono text-[9px] text-on-surface-variant">{g.tactic} &middot; {g.impact}</span>
              </div>
              <button className="mono text-[9px] px-2 py-0.5 rounded mt-2" style={{ backgroundColor: `${ACCENT}20`, color: `${ACCENT}cc` }}>+ Create Detection</button>
            </div>
          ))}
        </div>
      </div>
    </div>
  </MockupFrame>
);

/* ------------------------------------------------------------------ */
/*  Slide 4 — Intel to Detection (before/after comparison)            */
/* ------------------------------------------------------------------ */

const IntelToDetectionMockup = () => (
  <div className="h-full flex items-center justify-center">
    <div className="max-w-3xl w-full">
      {/* Flow diagram */}
      <div className="flex items-center justify-between gap-4 mb-12">
        {[
          { label: 'Threat Report', sub: 'URL or pasted content' },
          { label: '8-Stage AI Pipeline', sub: 'Fully automated' },
          { label: 'Detections Created', sub: 'Ready for review' },
        ].map((step, i) => (
          <React.Fragment key={step.label}>
            <div className="flex-1 text-center">
              <div className="w-12 h-12 rounded-xl mx-auto mb-3 flex items-center justify-center" style={{ backgroundColor: `${ACCENT}20`, border: `1px solid ${ACCENT}30` }}>
                <span className="mono text-lg font-bold" style={{ color: `${ACCENT}cc` }}>{i + 1}</span>
              </div>
              <div className="text-sm text-on-surface-variant font-medium">{step.label}</div>
              <div className="mono text-[9px] text-on-surface-variant mt-1">{step.sub}</div>
            </div>
            {i < 2 && (
              <div className="flex items-center gap-1 text-outline-variant shrink-0">
                <div className="w-10 h-px bg-outline-variant" />
                <svg className="w-3 h-3 text-outline" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" /></svg>
                <div className="w-10 h-px bg-outline-variant" />
              </div>
            )}
          </React.Fragment>
        ))}
      </div>

      {/* Before/After comparison */}
      <div className="grid grid-cols-2 gap-6">
        <div className="border border-outline-variant rounded-xl p-6 bg-surface-container-low">
          <div className="mono text-[10px] text-red-400/60 mb-4 tracking-wider font-bold">WITHOUT OPTIMUS</div>
          <div className="space-y-2.5">
            {[
              'Read 30-page report manually',
              'Extract TTPs by hand into spreadsheet',
              'Cross-reference MITRE ATT&CK database',
              'Audit existing coverage one-by-one',
              'Write detection queries from scratch',
              'Document and submit for peer review',
            ].map(s => (
              <div key={s} className="flex items-center gap-2.5 text-xs text-on-surface-variant">
                <span className="text-red-400/50 text-sm">✕</span> {s}
              </div>
            ))}
          </div>
          <div className="mt-6 pt-4 border-t border-outline-variant">
            <div className="mono text-2xl text-outline font-bold">3-5 days</div>
            <div className="mono text-[9px] text-outline-variant mt-1">per report, per analyst</div>
          </div>
        </div>

        <div className="border rounded-xl p-6" style={{ borderColor: `${TEAL}30`, backgroundColor: `${TEAL}06` }}>
          <div className="mono text-[10px] tracking-wider mb-4 font-bold" style={{ color: `${TEAL}cc` }}>WITH OPTIMUS</div>
          <div className="space-y-2.5">
            {[
              'Paste URL or drop report text',
              'AI extracts all TTPs and IoCs',
              'MITRE mapping generated automatically',
              'Coverage gaps identified instantly',
              'Detection rules created with one click',
              'Auto-documented and ready for review',
            ].map(s => (
              <div key={s} className="flex items-center gap-2.5 text-xs text-on-surface-variant">
                <Icon name="check" className="w-3.5 h-3.5 shrink-0" style={{ color: TEAL }} />
                {s}
              </div>
            ))}
          </div>
          <div className="mt-6 pt-4 border-t" style={{ borderColor: `${TEAL}20` }}>
            <div className="mono text-2xl font-bold" style={{ color: TEAL }}>Under 10 min</div>
            <div className="mono text-[9px] mt-1" style={{ color: `${TEAL}80` }}>fully automated, any report</div>
          </div>
        </div>
      </div>
    </div>
  </div>
);

/* ------------------------------------------------------------------ */
/*  Main export                                                        */
/* ------------------------------------------------------------------ */

export const ThreatIntelFeature: React.FC = () => {
  const [active, setActive] = useState(0);

  const slides = [
    { label: 'Intelligence Reports', content: <ReportListingMockup /> },
    { label: '8-Stage Pipeline', content: <PipelineMockup /> },
    { label: 'Coverage Analysis', content: <CoverageMockup /> },
    { label: 'Intel \u2192 Detection', content: <IntelToDetectionMockup /> },
  ];

  return (
    <FeatureSlide
      headline="Threat report to detections. Minutes, not days."
      description="Paste a URL or report content. An 8-stage AI pipeline extracts TTPs, IoCs, detection rules, and maps everything against your library — showing exactly where you're exposed."
    >
      <FeatureCarousel slides={slides} activeIndex={active} onSelect={setActive} />
    </FeatureSlide>
  );
};
