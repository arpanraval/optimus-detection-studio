import React, { useState, useEffect } from 'react';
import { LibraryViewMockup } from './features/DetectionLibraryFeature';
import { ReportListingMockup } from './features/ThreatIntelFeature';
import { GenerateQueryMockup } from './features/AIQueryFeature';
import { ThreatCoverageMockup } from './features/OptimusPrimeFeature';
import { FullMatrixMockup } from './features/MITREFeature';
import { DashboardMockup } from './features/DashboardFeature';
import { ThreatResearchMockup } from './features/ThreatResearchFeature';

const CHECKPOINTS = [
  {
    id: 'library',
    num: '01',
    kicker: 'CENTRALIZED INGESTION',
    headline: 'Unify your entire detection catalog.',
    description: 'Instead of scattering rules across Git repositories, spreadsheets, and different SIEM consoles, bring everything together. Ingest, catalog, and query your active production rules, drafts, and custom packs with complete version history, quality scores, and visual health rings.',
    mockup: <LibraryViewMockup />
  },
  {
    id: 'threat-intel',
    num: '02',
    kicker: 'AUTOMATED THREAT PARSING',
    headline: 'From threat report to active coverage in minutes.',
    description: 'Paste any CISA, Mandiant, or Microsoft threat report URL. Our 8-stage automated pipeline instantly extracts all TTPs, active indicators, and generates relevant detection rules mapped to your current library — showing you exactly where your exposures lie.',
    mockup: <ReportListingMockup />
  },
  {
    id: 'ai-query',
    num: '03',
    kicker: 'AI QUERY COMPILATION',
    headline: 'Describe the threat. Compile to any SIEM.',
    description: 'Select your preferred LLM and target SIEM dialect. Describe the malicious behavior in plain English. Refine queries iteratively within our conversational interface, and export fully documented rules to 14+ targets including Splunk, Sentinel, and Chronicle.',
    mockup: <GenerateQueryMockup />
  },
  {
    id: 'agent',
    num: '04',
    kicker: 'AUTONOMOUS ADVERSARY SIMULATION',
    headline: 'Guided ransomware & threat group assessments.',
    description: 'Instruct our autonomous RAG agent to run guided security assessments. Check coverage against specific threat actors (like Cozy Bear or BlackBasta) or critical late-stage ransomware techniques, receiving instant priority recommendations to draft missing rules.',
    mockup: <ThreatCoverageMockup />
  },
  {
    id: 'threat-research',
    num: '05',
    kicker: 'AUTONOMOUS THREAT RESEARCH',
    headline: 'Orchestrate agents. Compile live threat digests.',
    description: 'Deploy specialized AI agents working in sync. The Preflight agent harvests TTPs, the Research agent maps execution telemetry, the Engineer writes SIEM rules, and the QA agent validates performance against log baselines. Instantly compile a full Auto-Digest of your threat posture.',
    mockup: <ThreatResearchMockup />
  },
  {
    id: 'mitre',
    num: '06',
    kicker: 'MITRE ATT&CK ALIGNMENT',
    headline: 'Your coverage mapped to the global matrix.',
    description: 'Visualize your active defense capabilities across the complete ATT&CK framework. Highlight production rules, identify coverage gaps, filter by threat groups or campaigns, and export beautiful coverage reports with a single click.',
    mockup: <FullMatrixMockup />
  },
  {
    id: 'dashboard',
    num: '07',
    kicker: 'EXECUTIVE READINESS VISION',
    headline: 'Real-time metrics for complete program clarity.',
    description: 'Track overall readiness trends, velocity metrics, stale rules, and hygiene alerts in a high-fidelity control dashboard. Empower engineering teams and security leadership with total clarity on detection coverage and security posture.',
    mockup: <DashboardMockup />
  }
];

export const PlatformShowcase: React.FC = () => {
  const [activeId, setActiveId] = useState('library');

  useEffect(() => {
    const observerOptions = {
      root: null,
      rootMargin: '-35% 0px -45% 0px', // Trigger when section is reading in the active middle viewport
      threshold: 0.1,
    };

    const observers = CHECKPOINTS.map((cp) => {
      const el = document.getElementById(`story-card-${cp.id}`);
      if (!el) return null;

      const observer = new IntersectionObserver(([entry]) => {
        if (entry.isIntersecting) {
          setActiveId(cp.id);
        }
      }, observerOptions);

      observer.observe(el);
      return { observer, el };
    });

    return () => {
      observers.forEach((obs) => {
        if (obs) obs.observer.disconnect();
      });
    };
  }, []);

  return (
    <section id="features" className="relative bg-surface py-28 lg:py-40 border-t border-outline-variant/60">
      <div className="max-w-[1500px] mx-auto px-6 sm:px-12">
        
        {/* Storyteller Container */}
        <div className="storyteller-grid gap-12 lg:gap-20">
          
          {/* LEFT COLUMN: Narrative Scrolling Cards */}
          <div className="storyteller-scroll space-y-28 lg:space-y-40">
            {CHECKPOINTS.map((cp) => {
              const active = activeId === cp.id;
              return (
                <div
                  key={cp.id}
                  id={`story-card-${cp.id}`}
                  className={`checkpoint-card flex flex-col justify-center ${active ? 'active' : ''}`}
                >
                  {/* Step kicker */}
                  <div className="flex items-center gap-3 mb-5">
                    <span className={`mono text-xs font-bold tracking-[0.25em] transition-colors duration-500 ${active ? 'text-[#e040a6]' : 'text-outline'}`}>
                      {cp.num}
                    </span>
                    <div className={`h-px transition-all duration-500 ${active ? 'w-12 bg-[#e040a6] shadow-[0_0_8px_rgba(224,64,166,0.6)]' : 'w-8 bg-outline-variant'}`} />
                    <span className={`mono text-[9px] font-bold tracking-[0.2em] uppercase transition-colors duration-500 ${active ? 'text-[#00bcff]' : 'text-on-surface-variant'}`}>
                      {cp.kicker}
                    </span>
                  </div>

                  {/* Headline & description */}
                  <h3 className={`font-brand text-3xl sm:text-4xl font-bold tracking-tight mb-5 leading-tight transition-colors duration-500 ${active ? 'text-on-surface' : 'text-on-surface-variant'}`}>
                    {cp.headline}
                  </h3>
                  <p className="text-base sm:text-lg text-on-surface-variant leading-relaxed font-light mb-8 max-w-xl">
                    {cp.description}
                  </p>

                  {/* Mobile mockup viewport: inline fallback for smaller screens */}
                  <div className="block lg:hidden w-full overflow-hidden mt-6 shadow-[0_8px_30px_rgb(0,0,0,0.5)] rounded-2xl border border-outline-variant/60">
                    {cp.mockup}
                  </div>
                </div>
              );
            })}
          </div>

          {/* RIGHT COLUMN: Sticky Viewport container (hidden on mobile, sticky on desktop) */}
          <div className="hidden lg:block">
            <div className="storyteller-sticky w-full h-[620px]">
              <div className="relative w-full h-full">
                {CHECKPOINTS.map((cp) => {
                  const active = activeId === cp.id;
                  return (
                    <div
                      key={cp.id}
                      className={`mockup-slide absolute inset-0 w-full h-full ${active ? 'active' : ''}`}
                    >
                      {cp.mockup}
                    </div>
                  );
                })}
              </div>
            </div>
          </div>

        </div>

      </div>
    </section>
  );
};
