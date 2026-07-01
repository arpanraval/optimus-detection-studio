import React, { useEffect, useRef } from 'react';
import { LibraryViewMockup, DetectionPacksMockup } from './features/DetectionLibraryFeature';
import { CoverageMockup, PipelineMockup } from './features/ThreatIntelFeature';
import { GenerateQueryMockup } from './features/AIQueryFeature';
import { ThreatCoverageMockup, LibrarySearchMockup } from './features/OptimusPrimeFeature';
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

const FEATURES: Feature[] = [
  {
    id: 'library',
    num: '01',
    kicker: 'DETECTION LIBRARY',
    headline: 'One catalog. Every rule you run.',
    description:
      "Pull production rules, drafts, and vendor packs out of scattered Git repos, spreadsheets, and SIEM consoles. Search, filter, and version everything in one place — with a quality score on every rule and visible health rings telling you what's stale.",
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
    id: 'auto-digest',
    num: '02',
    kicker: 'AUTO-DIGEST',
    headline: 'New threat lands. Coverage answers itself.',
    description:
      'Auto-Digest watches the open intel firehose continuously — CISA, Mandiant, Microsoft, vendor advisories. Each emerging campaign is parsed into TTPs, mapped to ATT&CK, and checked against your library. Gaps surface with one-click drafts. No analyst has to chase "what just happened."',
    bullets: [
      'Continuous ingestion from CISA, Mandiant, vendor advisories',
      'Coverage gap analysis against your live library',
      'One-click rule drafts for every missing technique',
    ],
    layout: 'mockup-left',
    primaryMockup: <CoverageMockup />,
    secondaryMockup: <PipelineMockup />,
  },
  {
    id: 'ai-query',
    num: '03',
    kicker: 'AI QUERY GENERATOR',
    headline: 'Describe the behavior. Get the query.',
    description:
      'Pick a model, pick a SIEM dialect, describe what you want to catch in plain English. Refine iteratively in chat. Export documented rules to 14+ targets — Splunk, Sentinel, Chronicle, CrowdStrike, Elastic, and more. Sigma conversion runs in your browser via Pyodide — zero round-trips, zero API keys.',
    bullets: [
      'Multi-model: Gemini, GPT, Claude — pick the brain',
      'Compile to 14+ SIEM dialects, one click each',
      'Browser-side Sigma conversion — no server, no latency',
    ],
    layout: 'mockup-right',
    primaryMockup: <GenerateQueryMockup />,
  },
  {
    id: 'optimus-rag',
    num: '04',
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
    primaryMockup: <ThreatCoverageMockup />,
    secondaryMockup: <LibrarySearchMockup />,
  },
  {
    id: 'threat-research',
    num: '05',
    kicker: 'THREAT RESEARCH ENGINE',
    headline: 'A team of agents writes detections while you sleep.',
    description:
      'Five specialized agents — Preflight, Research, Attack, Engineer, QA — coordinate on a single threat. They harvest TTPs, map execution telemetry, draft a SIEM rule, and validate it against a baseline before it lands in your review queue. Pure synthesis, not search.',
    bullets: [
      'Five-agent pipeline: TTPs → telemetry → rule → validation',
      'Self-test against simulated log baselines',
      'Drafts arrive review-ready in your queue',
    ],
    layout: 'centered',
    primaryMockup: <ThreatResearchMockup />,
  },
  {
    id: 'mitre',
    num: '06',
    kicker: 'MITRE ATT&CK COVERAGE',
    headline: 'See your defense on the global matrix.',
    description:
      'Every production rule mapped onto ATT&CK. Filter by threat group, campaign, or platform. Spot the holes at a glance and export a coverage report your CISO will actually read.',
    bullets: [
      'Live mapping of every production rule to ATT&CK',
      'Filter by group, campaign, platform, or data source',
      'Exportable coverage report for leadership reviews',
    ],
    layout: 'centered',
    primaryMockup: <FullMatrixMockup />,
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
