import React, { useEffect, useRef, useState } from 'react';
import { Icon } from '@/components/Icon';
import { FeatureSlide, MockupFrame, FeatureCarousel } from '../shared/FeatureSlide';

const ACCENT = '#783264';
const TEAL = '#4D7C6F';
const SLATE = '#475069';

/* ─── Shared chat primitives ─── */

const AgentHeader: React.FC = () => (
  <div className="flex items-center gap-2.5 mb-5 pb-4 border-b border-outline-variant">
    <Icon name="optimus-logo" className="w-7 h-7 shrink-0" />
    <span className="text-sm font-bold text-on-surface tracking-tight">Optimus Prime</span>
    <span className="mono text-[8px] px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-700 border border-emerald-500/25">Gemini 3 Flash ▸</span>
    <span className="flex items-center gap-1 mono text-[8px] text-emerald-700/80">
      <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />7 Tools Active
    </span>
    <div className="ml-auto flex items-center gap-2 text-outline">
      <span className="text-[11px] cursor-pointer hover:text-on-surface-variant">⟲</span>
      <span className="text-[13px] cursor-pointer hover:text-on-surface-variant leading-none">+</span>
    </div>
  </div>
);

const UserBubble: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <div className="flex justify-end mb-4">
    <div className="bg-surface-container-high rounded-2xl rounded-br-md px-4 py-2.5 max-w-[80%] text-sm text-on-surface-variant">
      {children}
    </div>
  </div>
);

const ToolActivity: React.FC<{ sources: number; time: string }> = ({ sources, time }) => (
  <div className="flex items-center gap-2 mb-3">
    <span className="text-on-surface-variant text-xs">•</span>
    <span className="text-xs text-on-surface-variant">Analyzed {sources} source{sources === 1 ? '' : 's'} in {time}</span>
    <span className="text-[10px] text-outline cursor-pointer">↓</span>
  </div>
);

/* ─── Coverage chat (primary — mirrors the real product screen) ─── */

const DONUT_R = 40;
const DONUT_C = 2 * Math.PI * DONUT_R;

export const CoverageChatMockup: React.FC = () => {
  const [on, setOn] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const obs = new IntersectionObserver(([e]) => {
      if (e.isIntersecting) setOn(true);
    }, { threshold: 0.25 });
    obs.observe(el);
    return () => obs.disconnect();
  }, []);

  const rows = [
    { label: 'Production Coverage', detail: <><b>28</b> of 356 · actively deployed</>, pct: '8%', bar: ACCENT, pctColor: ACCENT },
    { label: 'Development Coverage', detail: <><b>171</b> of 356 · promotable to production</>, pct: '48%', bar: SLATE, pctColor: 'rgb(var(--md-sys-color-on-surface))' },
    { label: 'Coverage Gaps', detail: <><b>157</b> of 356 · no detection at any tier</>, pct: '44%', bar: '#c0392b', pctColor: '#c0392b' },
  ];

  return (
    <MockupFrame title="OPTIMUS PRIME — RAG AGENT" accent={ACCENT}>
      <div ref={ref}>
        <AgentHeader />
        <ToolActivity sources={1} time="3.8s" />

        {/* Coverage card */}
        <div className="border border-outline-variant rounded-xl bg-surface-container-highest overflow-hidden mb-4 shadow-sm">
          <div className="px-4 pt-4 pb-2 flex items-start justify-between gap-3">
            <div>
              <div className="mono text-[8px] font-bold tracking-[0.22em] text-on-surface-variant uppercase mb-1">Overall Detection Coverage</div>
              <div className="text-[11px] text-on-surface-variant">199 of 356 techniques have a detection</div>
            </div>
            <span className="mono text-[7px] px-2 py-1 rounded border border-outline-variant text-on-surface-variant tracking-widest shrink-0">MITRE ATT&CK</span>
          </div>

          <div className="px-4 py-3 flex flex-col sm:flex-row items-center gap-6">
            {/* Donut */}
            <div className="relative shrink-0">
              <svg width="120" height="120" viewBox="0 0 120 120">
                <circle cx="60" cy="60" r={DONUT_R} fill="none" stroke="rgb(var(--md-sys-color-surface-container-low))" strokeWidth="13" />
                {/* Development band (48%) */}
                <circle
                  cx="60" cy="60" r={DONUT_R} fill="none" stroke={SLATE} strokeWidth="13" strokeLinecap="butt"
                  strokeDasharray={`${DONUT_C * 0.48} ${DONUT_C}`}
                  strokeDashoffset={on ? -DONUT_C * 0.08 : DONUT_C * 0.4}
                  transform="rotate(-90 60 60)"
                  style={{ transition: 'stroke-dashoffset 1.2s cubic-bezier(0.16, 1, 0.3, 1) 0.3s' }}
                />
                {/* Production arc (8%) */}
                <circle
                  cx="60" cy="60" r={DONUT_R} fill="none" stroke={ACCENT} strokeWidth="13" strokeLinecap="butt"
                  strokeDasharray={`${DONUT_C * 0.08} ${DONUT_C}`}
                  strokeDashoffset={on ? 0 : DONUT_C * 0.08}
                  transform="rotate(-90 60 60)"
                  style={{ transition: 'stroke-dashoffset 1s cubic-bezier(0.16, 1, 0.3, 1) 0.2s' }}
                />
              </svg>
              <div className="absolute inset-0 flex flex-col items-center justify-center">
                <span className="text-2xl font-black text-on-surface leading-none">8%</span>
                <span className="mono text-[6.5px] tracking-[0.25em] text-on-surface-variant mt-1">PROTECTED</span>
              </div>
            </div>

            {/* Tier rows */}
            <div className="flex-1 w-full space-y-3">
              {rows.map((r, i) => (
                <div
                  key={r.label}
                  className="flex items-center gap-3 transition-all duration-700"
                  style={{ opacity: on ? 1 : 0, transform: on ? 'translateX(0)' : 'translateX(12px)', transitionDelay: `${300 + i * 180}ms` }}
                >
                  <span className="w-[3px] h-8 rounded-full shrink-0" style={{ backgroundColor: r.bar }} />
                  <div className="flex-1 min-w-0">
                    <div className="text-xs font-bold text-on-surface">{r.label}</div>
                    <div className="text-[10px] text-on-surface-variant [&_b]:font-semibold [&_b]:text-on-surface">{r.detail}</div>
                  </div>
                  <span className="text-sm font-black tabular-nums shrink-0" style={{ color: r.pctColor }}>{r.pct}</span>
                </div>
              ))}
            </div>
          </div>

          {/* Action buttons */}
          <div className="px-4 pb-4 pt-1 flex flex-wrap gap-2">
            <button className="mono text-[9px] font-semibold px-3.5 py-2 rounded-lg text-white cursor-pointer" style={{ backgroundColor: ACCENT }}>
              Review Development Detections
            </button>
            <button className="mono text-[9px] font-semibold px-3.5 py-2 rounded-lg border border-outline-variant text-on-surface cursor-pointer bg-surface-container-highest">
              View Ransomware Readiness
            </button>
          </div>
        </div>

        {/* Narrative analysis */}
        <div className="text-[11px] text-on-surface-variant leading-relaxed space-y-2.5 mb-4 transition-opacity duration-700" style={{ opacity: on ? 1 : 0, transitionDelay: '700ms' }}>
          <p>
            Our current detection posture shows <span className="font-semibold text-on-surface">8% coverage</span> (28 techniques) in the{' '}
            <span className="font-semibold text-on-surface">Production Library</span>. We can rapidly expand defense by promoting detections from development into production.
          </p>
          <div>
            <div className="text-xs font-bold text-on-surface mb-1">Coverage Summary</div>
            <ul className="space-y-1">
              <li className="flex gap-2"><span className="text-outline mt-0.5">•</span><span><span className="font-semibold text-on-surface">Development Library (48%):</span> 171 techniques have "promotable" starter detections — the fastest path to coverage.</span></li>
              <li className="flex gap-2"><span className="text-outline mt-0.5">•</span><span><span className="font-semibold text-on-surface">Total Gaps (44%):</span> 157 techniques need new detection engineering from scratch.</span></li>
            </ul>
          </div>
          <p>
            Critical gaps in <span className="font-semibold text-on-surface">Resource Development (0%)</span> and <span className="font-semibold text-on-surface">Impact (11%)</span> — no visibility into{' '}
            <span className="italic">Data Compressed (T1002)</span> or <span className="italic">Winlogon Helper DLL (T1004)</span>.
          </p>
        </div>

        {/* Chat input */}
        <div className="flex items-center gap-2 border border-outline-variant rounded-xl px-4 py-2.5 bg-surface-container-highest">
          <span className="text-[11px] text-outline flex-1">Ask about coverage, search detections, or request a draft…</span>
          <span className="w-6 h-6 rounded-lg flex items-center justify-center shrink-0" style={{ backgroundColor: `${ACCENT}15` }}>
            <svg className="w-3 h-3" viewBox="0 0 24 24" fill="none" stroke={ACCENT} strokeWidth="2.5"><path d="M12 19V5M5 12l7-7 7 7" strokeLinecap="round" strokeLinejoin="round" /></svg>
          </span>
        </div>
      </div>
    </MockupFrame>
  );
};

/* ─── Slide 1: Library Search ─── */

export const LibrarySearchMockup = () => (
  <MockupFrame title="OPTIMUS PRIME AGENT" accent={ACCENT}>
    <AgentHeader />
    <UserBubble>Find all detections related to credential theft</UserBubble>
    <ToolActivity sources={3} time="4.2s" />

    <div className="ml-1">
      <p className="text-sm text-on-surface-variant mb-3">
        Found <span className="text-on-surface font-medium">23 detections</span> across credential access techniques.
        Search matched intent across <span className="text-on-surface-variant">T1003, T1555, T1552, T1558</span>.
      </p>

      {/* Results breakdown */}
      <div className="grid grid-cols-3 gap-2 mb-4">
        {[
          { count: 15, label: 'Production', color: 'text-emerald-400/70', bg: 'bg-emerald-500/5 border-emerald-500/10' },
          { count: 5, label: 'In Review', color: 'text-blue-400/70', bg: 'bg-blue-500/5 border-blue-500/10' },
          { count: 3, label: 'Draft', color: 'text-on-surface-variant', bg: 'bg-surface-container-low border-outline-variant' },
        ].map(b => (
          <div key={b.label} className={`rounded-lg p-2.5 border ${b.bg}`}>
            <div className={`mono text-lg font-bold ${b.color}`}>{b.count}</div>
            <div className="text-[10px] text-on-surface-variant">{b.label}</div>
          </div>
        ))}
      </div>

      {/* Top matches */}
      <div className="mono text-[9px] text-on-surface-variant tracking-widest mb-2">TOP MATCHES</div>
      {[
        { name: 'LSASS Credential Dump via Procdump', lang: 'SPL', mitre: 'T1003.001', status: 'prod' },
        { name: 'Kerberoasting via GetSPNs', lang: 'KQL', mitre: 'T1558.003', status: 'prod' },
        { name: 'DCSync Replication Attack', lang: 'Sigma', mitre: 'T1003.006', status: 'review' },
        { name: 'Credential Vault Access', lang: 'SPL', mitre: 'T1555.004', status: 'prod' },
        { name: 'Suspicious NTDS.dit Copy', lang: 'KQL', mitre: 'T1003.003', status: 'draft' },
      ].map(d => (
        <div key={d.name} className="flex items-center gap-2 mb-1.5 py-1 px-2 rounded hover:bg-surface-container-low group">
          <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${
            d.status === 'prod' ? 'bg-emerald-400/60' : d.status === 'review' ? 'bg-blue-400/60' : 'bg-outline'
          }`} />
          <span className="text-xs text-on-surface-variant flex-1 truncate">{d.name}</span>
          <span className="mono text-[8px] px-1.5 py-0.5 rounded bg-surface-container-low text-on-surface-variant">{d.lang}</span>
          <span className="mono text-[8px] text-outline">{d.mitre}</span>
        </div>
      ))}

      <p className="text-[11px] text-on-surface-variant mt-3 italic">
        Semantic search matched "credential theft" across 4 MITRE techniques, including sub-techniques for LSASS, Kerberos, and credential stores.
      </p>
    </div>
  </MockupFrame>
);

/* ─── Slide 2: Threat Coverage (Iran example from screenshot) ─── */

export const ThreatCoverageMockup = () => (
  <MockupFrame title="OPTIMUS PRIME AGENT" accent={ACCENT}>
    <AgentHeader />
    <UserBubble>whats my coverage for threats originating from Iran?</UserBubble>
    <ToolActivity sources={6} time="13.8s" />

    <div className="ml-1">
      {/* THREAT ACTOR card */}
      <div className="border border-outline-variant rounded-xl bg-surface-container-low overflow-hidden mb-4">
        {/* Card header */}
        <div className="px-4 pt-4 pb-3">
          <div className="flex items-start justify-between mb-1">
            <div>
              <span className="mono text-[8px] tracking-[0.2em] font-bold px-2 py-0.5 rounded"
                style={{ color: ACCENT, backgroundColor: `${ACCENT}15` }}>⊙ THREAT ACTOR</span>
            </div>
          </div>
          <div className="flex items-start justify-between mt-3">
            <div>
              <div className="text-base font-bold text-on-surface leading-tight">Iranian Threat Groups (Combined)</div>
              <div className="text-xs text-on-surface-variant mt-0.5">Iran-Nexus · Magic Hound, APT39</div>
            </div>
            <div className="text-right shrink-0 ml-4">
              <div className="text-3xl font-black text-on-surface leading-none">95%</div>
              <div className="text-[10px] text-on-surface-variant mt-0.5">coverage</div>
            </div>
          </div>

          {/* Progress bar */}
          <div className="mt-3 mb-1">
            <div className="h-2 rounded-full bg-surface-container-high overflow-hidden">
              <div className="h-full rounded-full" style={{ width: '95%', backgroundColor: TEAL }} />
            </div>
            <div className="flex justify-between mt-1">
              <span className="mono text-[9px] text-on-surface-variant">125 techniques covered</span>
              <span className="mono text-[9px] text-outline">132 total</span>
            </div>
          </div>
        </div>

        {/* Your Coverage section */}
        <div className="px-4 py-3 border-t border-outline-variant">
          <div className="flex items-center gap-2 mb-1">
            <span className="text-[10px] text-on-surface-variant">⊕</span>
            <span className="mono text-[10px] text-on-surface-variant font-medium tracking-wide">Your Coverage</span>
          </div>
          <p className="text-xs text-on-surface-variant leading-relaxed">
            <span className="text-on-surface-variant font-medium">125</span> detections cover techniques used by Iranian Threat Groups (Combined).
            <span className="text-xs ml-1 cursor-pointer" style={{ color: `${ACCENT}bb` }}>View detections →</span>
          </p>
        </div>

        {/* Coverage Gaps section */}
        <div className="px-4 py-3 border-t border-outline-variant">
          <div className="flex items-center gap-2 mb-3">
            <span className="text-[10px]" style={{ color: ACCENT }}>⚠</span>
            <span className="mono text-[10px] text-on-surface-variant font-medium tracking-wide">Coverage Gaps</span>
            <span className="mono text-[8px] px-1.5 py-0.5 rounded-full font-bold"
              style={{ backgroundColor: `${ACCENT}20`, color: `${ACCENT}cc` }}>5 techniques</span>
          </div>
          {[
            { id: 'T1016.002', name: 'Wi-Fi Discovery' },
            { id: 'T1591.001', name: 'Determine Physical Locations' },
          ].map(gap => (
            <div key={gap.id} className="flex items-center justify-between mb-2 py-1.5 px-2 rounded-lg bg-surface-container-low">
              <div className="flex items-center gap-2">
                <span className="mono text-[10px] text-on-surface-variant font-bold">{gap.id}</span>
                <span className="text-xs text-on-surface-variant">{gap.name}</span>
              </div>
              <button className="mono text-[9px] px-2.5 py-1 rounded-md font-medium cursor-pointer"
                style={{ backgroundColor: `${ACCENT}20`, color: `${ACCENT}cc`, border: `1px solid ${ACCENT}30` }}>
                Draft detection
              </button>
            </div>
          ))}
          <div className="text-[10px] text-outline mt-1 pl-2">Showing 2 of 5 gaps</div>
        </div>

        {/* Action buttons */}
        <div className="px-4 py-3 border-t border-outline-variant flex gap-2">
          <button className="flex-1 mono text-[10px] py-2 rounded-lg font-medium cursor-pointer"
            style={{ backgroundColor: `${ACCENT}25`, color: `${ACCENT}cc`, border: `1px solid ${ACCENT}35` }}>
            View Magic Hound Gaps
          </button>
          <button className="flex-1 mono text-[10px] py-2 rounded-lg font-medium cursor-pointer bg-surface-container-low text-on-surface-variant border border-outline-variant">
            Review Iranian Actor Posture
          </button>
        </div>
      </div>

      {/* Narrative text below card */}
      <div className="text-xs text-on-surface-variant leading-relaxed mb-3">
        Your library has strong coverage against Iran-nexus threat groups. Both <span className="text-on-surface-variant font-medium">Magic Hound</span> and <span className="text-on-surface-variant font-medium">APT39</span> are well-covered across initial access (<span className="mono text-[10px] text-on-surface-variant">T1190</span>, <span className="mono text-[10px] text-on-surface-variant">T1059.001</span>) and persistence techniques.
      </div>

      {/* Summary bullets */}
      <div className="mono text-[9px] text-on-surface-variant tracking-widest mb-2">IRAN THREAT ACTOR COVERAGE SUMMARY</div>
      <div className="space-y-2 text-xs text-on-surface-variant leading-relaxed">
        <div className="flex items-start gap-2">
          <span className="text-outline mt-0.5 shrink-0">•</span>
          <span><span className="text-on-surface-variant font-medium">Magic Hound (G0059): 92% Coverage</span> — strong across exploitation and C2, minor gaps in discovery sub-techniques</span>
        </div>
        <div className="flex items-start gap-2">
          <span className="text-outline mt-0.5 shrink-0">•</span>
          <span><span className="text-on-surface-variant font-medium">APT39 (G0087): 98% Coverage</span> — near-complete with only 1 gap in reconnaissance</span>
        </div>
      </div>
    </div>
  </MockupFrame>
);

/* ─── Slide 3: Guided Assessment ─── */

const GuidedAssessmentMockup = () => (
  <MockupFrame title="OPTIMUS PRIME AGENT" accent={ACCENT}>
    <AgentHeader />
    <UserBubble>Run a ransomware readiness assessment for our environment</UserBubble>

    {/* Tool calls cascade */}
    <div className="mb-4 ml-1">
      <div className="flex items-center gap-2 mb-2">
        <span className="text-on-surface-variant text-xs">•</span>
        <span className="text-xs text-on-surface-variant">Running assessment with 4 tools...</span>
      </div>
      <div className="flex flex-wrap gap-1.5 mb-3">
        {['get_coverage_summary', 'identify_coverage_gaps', 'search_library', 'find_threat_actor'].map(t => (
          <span key={t} className="mono text-[8px] px-2 py-0.5 rounded border border-emerald-500/15 bg-emerald-500/5 text-emerald-400/50 flex items-center gap-1">
            <span className="w-1 h-1 rounded-full bg-emerald-400/50" />{t}
          </span>
        ))}
      </div>
      <ToolActivity sources={8} time="22.1s" />
    </div>

    <div className="ml-1">
      {/* Readiness Score Card */}
      <div className="border border-outline-variant rounded-xl bg-surface-container-low overflow-hidden mb-4">
        <div className="px-4 pt-4 pb-3">
          <span className="mono text-[8px] tracking-[0.2em] font-bold px-2 py-0.5 rounded text-amber-400/80 bg-amber-400/10">⊙ READINESS ASSESSMENT</span>
          <div className="flex items-start justify-between mt-3">
            <div>
              <div className="text-base font-bold text-on-surface">Ransomware Readiness</div>
              <div className="text-xs text-on-surface-variant mt-0.5">Kill chain coverage across 28 techniques</div>
            </div>
            <div className="text-right shrink-0 ml-4">
              <div className="text-3xl font-black text-amber-400/90 leading-none">71%</div>
              <div className="text-[10px] text-on-surface-variant mt-0.5">readiness</div>
            </div>
          </div>

          {/* Progress bar */}
          <div className="mt-3">
            <div className="h-2 rounded-full bg-surface-container-high overflow-hidden">
              <div className="h-full rounded-full bg-amber-400/70" style={{ width: '71%' }} />
            </div>
            <div className="flex justify-between mt-1">
              <span className="mono text-[9px] text-on-surface-variant">20 techniques covered</span>
              <span className="mono text-[9px] text-outline">28 in kill chain</span>
            </div>
          </div>
        </div>

        {/* Kill chain breakdown */}
        <div className="px-4 py-3 border-t border-outline-variant">
          <div className="mono text-[9px] text-on-surface-variant tracking-widest mb-2">KILL CHAIN PHASES</div>
          {[
            { phase: 'Initial Access', score: 100, color: TEAL },
            { phase: 'Execution', score: 85, color: TEAL },
            { phase: 'Lateral Movement', score: 60, color: '#c9963a' },
            { phase: 'Exfiltration', score: 40, color: '#c9633a' },
            { phase: 'Impact', score: 33, color: '#c9433a' },
          ].map(p => (
            <div key={p.phase} className="flex items-center gap-2 mb-1.5">
              <span className="text-[10px] text-on-surface-variant w-28 shrink-0">{p.phase}</span>
              <div className="flex-1 h-1.5 rounded-full bg-surface-container-high overflow-hidden">
                <div className="h-full rounded-full" style={{ width: `${p.score}%`, backgroundColor: p.color }} />
              </div>
              <span className="mono text-[9px] text-on-surface-variant w-8 text-right">{p.score}%</span>
            </div>
          ))}
        </div>

        {/* Critical recommendations */}
        <div className="px-4 py-3 border-t border-outline-variant">
          <div className="flex items-center gap-2 mb-3">
            <span className="text-[10px] text-red-400/60">⚠</span>
            <span className="mono text-[10px] text-on-surface-variant font-medium tracking-wide">Critical Recommendations</span>
          </div>
          {[
            { id: 'T1486', name: 'Data Encryption for Impact', priority: 'CRITICAL' },
            { id: 'T1490', name: 'Inhibit System Recovery', priority: 'CRITICAL' },
            { id: 'T1048', name: 'Exfiltration Over Alternative Protocol', priority: 'HIGH' },
          ].map(r => (
            <div key={r.id} className="flex items-center justify-between mb-2 py-1.5 px-2 rounded-lg bg-surface-container-low">
              <div className="flex items-center gap-2">
                <span className={`mono text-[7px] px-1 py-0.5 rounded font-bold ${
                  r.priority === 'CRITICAL' ? 'bg-red-500/15 text-red-400/70' : 'bg-amber-500/15 text-amber-400/70'
                }`}>{r.priority}</span>
                <span className="mono text-[10px] text-on-surface-variant font-bold">{r.id}</span>
                <span className="text-xs text-on-surface-variant">{r.name}</span>
              </div>
              <button className="mono text-[9px] px-2.5 py-1 rounded-md font-medium cursor-pointer"
                style={{ backgroundColor: `${ACCENT}20`, color: `${ACCENT}cc`, border: `1px solid ${ACCENT}30` }}>
                Draft detection
              </button>
            </div>
          ))}
        </div>
      </div>

      {/* Summary narrative */}
      <div className="text-xs text-on-surface-variant leading-relaxed">
        <span className="text-on-surface-variant font-medium">Bottom line:</span> Your initial access and execution coverage is solid, but the
        late-stage kill chain (exfiltration and impact) has critical gaps. Prioritize <span className="mono text-[10px] text-on-surface-variant">T1486</span> and <span className="mono text-[10px] text-on-surface-variant">T1490</span> immediately
        — these are the techniques that differentiate a contained incident from a full ransomware event.
      </div>
    </div>
  </MockupFrame>
);

/* ─── Main export ─── */

export const OptimusPrimeFeature: React.FC = () => {
  const [active, setActive] = useState(0);

  const slides = [
    { label: 'Library Search', content: <LibrarySearchMockup /> },
    { label: 'Threat Coverage', content: <ThreatCoverageMockup /> },
    { label: 'Guided Assessment', content: <GuidedAssessmentMockup /> },
  ];

  return (
    <FeatureSlide
      headline="An AI agent that knows your detection library."
      description="RAG-powered, 8 specialized tools. Ask about coverage, threat actors, gaps — in natural language. Optimus Prime searches your library semantically and grounds every answer in your data."
    >
      <FeatureCarousel slides={slides} activeIndex={active} onSelect={setActive} />
    </FeatureSlide>
  );
};
