import React, { useEffect, useRef } from 'react';
import { LibraryViewMockup, DetectionPacksMockup } from './features/DetectionLibraryFeature';
import { ReportListingMockup } from './features/ThreatIntelFeature';
import { AutoDigestMockup } from './features/AutoDigestFeature';
import { GenerateQueryMockup } from './features/AIQueryFeature';
import { CoverageChatMockup, ThreatCoverageMockup } from './features/OptimusPrimeFeature';
import { FullMatrixMockup } from './features/MITREFeature';
import { DashboardMockup } from './features/DashboardFeature';
import { ThreatResearchMockup } from './features/ThreatResearchFeature';

type Layout = 'mockup-right' | 'mockup-left' | 'centered';

type Feature = {
  id: string;
  num: string;
  kicker: string;
  headline: React.ReactNode;
  description: string;
  bullets?: string[];
  layout: Layout;
  primaryMockup: React.ReactNode;
  secondaryMockup?: React.ReactNode;
};

// Ordered as the product's actual workflow: intelligence lands → coverage is
// assessed → agents research the gaps → build by hand when you want → everything
// lives in one catalog → ask the agent → report the posture.
const FEATURES: Feature[] = [
  {
    id: 'auto-digest',
    num: '01',
    kicker: 'AUTO-DIGEST',
    headline: 'Raw intel in. Operational reports out. Daily.',
    description:
      'Every morning Auto-Digest fetches your threat feeds, AI-gates what\'s actually actionable, ranks and digests the winners — extracting TTPs, IoCs, MITRE mappings, and library matches — then links multi-vendor coverage of the same campaign into one story. You wake up to structured intel, not 87 open tabs.',
    bullets: [
      'Five-stage pipeline: harvest → classify → rank → digest → link',
      'Every report scored against your live library for coverage',
      'Multi-vendor stories deduped into a single campaign entry',
    ],
    layout: 'mockup-right',
    primaryMockup: <AutoDigestMockup />,
    secondaryMockup: <ReportListingMockup />,
  },
  {
    id: 'mitre',
    num: '02',
    kicker: 'MITRE ATT&CK COVERAGE',
    headline: 'Your posture, on the actual matrix.',
    description:
      'Every rule mapped onto ATT&CK v18.1. Covered techniques carry live detection counts; hover any cell to see the rules, threat groups, and malware behind it. Filter the whole matrix through the intel graph — 172 groups, 52 campaigns, 786 software entries.',
    bullets: [
      'Production vs development coverage, toggled in one click',
      'Technique cards: detections, groups, malware, campaigns',
      'Filter by threat group, campaign, software, origin, or sector',
    ],
    layout: 'centered',
    primaryMockup: <FullMatrixMockup />,
  },
  {
    id: 'threat-research',
    num: '03',
    kicker: 'AUTONOMOUS THREAT RESEARCH',
    headline: 'Agents research the threat. You review the rule.',
    description:
      'Point the engine at a campaign, technique, or CVE. Agents decompose it into tactics and attack opportunities on a live canvas, research the execution telemetry, then engineer and QA detections against simulated baselines. Every node on the canvas is inspectable — you see exactly how each rule was derived.',
    bullets: [
      'Threat → tactics → opportunities → research → validated rules',
      'Every detection validated against telemetry before it reaches you',
      'Full research trail on an explorable canvas — no black box',
    ],
    layout: 'centered',
    primaryMockup: <ThreatResearchMockup />,
  },
  {
    id: 'ai-query',
    num: '04',
    kicker: 'AI QUERY GENERATOR',
    headline: 'Describe the behavior. Get the query.',
    description:
      'Pick a model, pick a SIEM dialect, describe what you want to catch in plain English. Refine iteratively in chat. Export documented rules to 14+ targets — Splunk, Sentinel, Chronicle, CrowdStrike, Elastic, and more. Sigma conversion runs in your browser via Pyodide — zero round-trips, zero API keys.',
    bullets: [
      'Multi-model: Gemini, GPT, Claude — pick the brain',
      'Compile to 14+ SIEM dialects, one click each',
      'Browser-side Sigma conversion — no server, no latency',
    ],
    layout: 'mockup-left',
    primaryMockup: <GenerateQueryMockup />,
  },
  {
    id: 'library',
    num: '05',
    kicker: 'DETECTION LIBRARY',
    headline: 'One catalog. Every rule you run.',
    description:
      "Everything the loop produces — and everything you already had — lands in one versioned catalog. Pull rules out of scattered Git repos, spreadsheets, and SIEM consoles. Search, filter, and score everything, with health rings telling you what's stale.",
    bullets: [
      'Production library + dev sandbox, side-by-side',
      'Quality score, status, and MITRE mapping on every rule',
      'Curated packs for threat groups, ransomware families, and LOLBins',
    ],
    layout: 'mockup-right',
    primaryMockup: <LibraryViewMockup />,
    secondaryMockup: <DetectionPacksMockup />,
  },
  {
    id: 'optimus-rag',
    num: '06',
    kicker: 'OPTIMUS PRIME — RAG AGENT',
    headline: 'Ask your detection program anything.',
    description:
      'Optimus Prime is the conversational RAG agent that knows your library, your coverage, and the global threat landscape. Ask "what\'s my coverage for Iran-nexus actors?" or "which rules are stale on Sentinel?" — get a grounded answer with the underlying rules and citations.',
    bullets: [
      'Semantic search across your full detection library',
      'Coverage queries grounded in your real rules',
      'Answers cite the underlying detections and sources',
    ],
    layout: 'mockup-left',
    primaryMockup: <CoverageChatMockup />,
    secondaryMockup: <ThreatCoverageMockup />,
  },
  {
    id: 'dashboard',
    num: '07',
    kicker: 'PROGRAM DASHBOARD',
    headline: 'The state of detection, at a glance.',
    description:
      'Readiness, velocity, stale rules, hygiene alerts — one dashboard for engineering and one view for leadership. No more screenshotting graphs into slides every Monday.',
    bullets: [
      'Readiness trends, velocity, and hygiene in one place',
      'Drill from any tile into the underlying rules',
      'Engineer view + executive view, same data',
    ],
    layout: 'centered',
    primaryMockup: <DashboardMockup />,
  },
];

const FeatureHeader: React.FC<{
  feature: Feature;
  align?: 'left' | 'center';
}> = ({ feature, align = 'left' }) => (
  <div className={align === 'center' ? 'text-center max-w-3xl mx-auto' : 'max-w-xl'}>
    <div className={`flex items-center gap-3 mb-5 ${align === 'center' ? 'justify-center' : ''}`}>
      <span className="mono text-xs font-bold tracking-[0.25em] text-primary">{feature.num}</span>
      <span className="h-px w-10 bg-primary/40" />
      <span className="mono text-[10px] font-bold tracking-[0.25em] text-on-surface-variant uppercase">{feature.kicker}</span>
    </div>
    <h3 className="font-brand text-3xl sm:text-4xl lg:text-5xl font-bold text-on-surface leading-[1.05] tracking-tight mb-5">
      {feature.headline}
    </h3>
    <p className="text-base sm:text-lg text-on-surface-variant leading-relaxed font-light mb-6">
      {feature.description}
    </p>
    {feature.bullets && (
      <ul className={`space-y-2.5 ${align === 'center' ? 'inline-block text-left' : ''}`}>
        {feature.bullets.map((b) => (
          <li key={b} className="flex items-start gap-3 text-sm text-on-surface-variant">
            <span className="mt-2 w-1 h-1 rounded-full bg-primary shrink-0" />
            <span>{b}</span>
          </li>
        ))}
      </ul>
    )}
  </div>
);

const Reveal: React.FC<{ children: React.ReactNode; delay?: number; className?: string }> = ({ children, delay = 0, className = '' }) => {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const obs = new IntersectionObserver(([e]) => {
      if (e.isIntersecting) el.classList.add('visible');
    }, { threshold: 0.08, rootMargin: '0px 0px -40px 0px' });
    obs.observe(el);
    return () => obs.disconnect();
  }, []);
  return <div ref={ref} className={`reveal-up ${className}`} style={{ transitionDelay: `${delay}ms` }}>{children}</div>;
};

const FeatureSection: React.FC<{ feature: Feature; index: number }> = ({ feature, index }) => {
  const isLast = index === FEATURES.length - 1;

  if (feature.layout === 'centered') {
    return (
      <section
        id={`feature-${feature.id}`}
        className={`relative py-24 lg:py-32 px-6 sm:px-12 ${!isLast ? 'border-b border-outline-variant/40' : ''}`}
      >
        <div className="max-w-[1500px] mx-auto">
          <Reveal>
            <FeatureHeader feature={feature} align="center" />
          </Reveal>
          <Reveal delay={140}>
            <div className="mt-12 feature-mockup-shell">
              {feature.primaryMockup}
            </div>
          </Reveal>
        </div>
      </section>
    );
  }

  const mockupOnLeft = feature.layout === 'mockup-left';

  return (
    <section
      id={`feature-${feature.id}`}
      className={`relative py-24 lg:py-32 px-6 sm:px-12 ${!isLast ? 'border-b border-outline-variant/40' : ''}`}
    >
      <div className="max-w-[1500px] mx-auto grid grid-cols-1 lg:grid-cols-12 gap-10 lg:gap-16 items-center">
        {/* Text column */}
        <div className={`lg:col-span-5 ${mockupOnLeft ? 'lg:order-2' : 'lg:order-1'}`}>
          <Reveal>
            <FeatureHeader feature={feature} align="left" />
          </Reveal>
        </div>

        {/* Mockup column */}
        <div className={`lg:col-span-7 ${mockupOnLeft ? 'lg:order-1' : 'lg:order-2'}`}>
          <Reveal delay={120}>
            <div className="feature-mockup-shell">
              {feature.primaryMockup}
            </div>
          </Reveal>
          {feature.secondaryMockup && (
            <Reveal delay={220} className="mt-6 hidden xl:block">
              <div className="feature-mockup-shell feature-mockup-secondary">
                {feature.secondaryMockup}
              </div>
            </Reveal>
          )}
        </div>
      </div>
    </section>
  );
};

export const PlatformShowcase: React.FC = () => {
  return (
    <div id="features" className="relative bg-surface">
      {FEATURES.map((feature, i) => (
        <FeatureSection key={feature.id} feature={feature} index={i} />
      ))}
    </div>
  );
};
