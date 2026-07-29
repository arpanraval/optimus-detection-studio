import React, { useEffect, useRef, useState } from 'react';
import { MockupFrame } from '../shared/FeatureSlide';

const ACCENT = '#783264';
const TEAL = '#4D7C6F';

/**
 * AutoDigestMockup — animated concept of the real Auto-Digest orchestrator.
 *
 * Mirrors the actual 5-stage pipeline (JobTranscript.tsx): Harvest → Classify →
 * Rank & Select → Digest → Link to Story. Left column plays the run transcript;
 * right column shows a raw advisory transforming into a structured intel report.
 * Loops continuously once scrolled into view.
 */

const STAGES = [
  {
    title: 'Harvest',
    subtitle: 'Fetch RSS/Atom feeds, dedupe and store new articles',
    summary: <><b>24</b> feeds fetched · <b>87</b> new articles</>,
  },
  {
    title: 'Classify',
    subtitle: 'AI gate — is this actionable threat research?',
    summary: <><b>12</b> passed · <b>71</b> not relevant</>,
  },
  {
    title: 'Rank & Select',
    subtitle: 'Score relevance and apply your daily article cap',
    summary: <><b>6</b> selected · <b>4</b> held by cap</>,
  },
  {
    title: 'Digest',
    subtitle: 'Full extraction — TTPs, IoCs, MITRE, library matches',
    summary: <><b>6</b> reports · <b>4m 12s</b> total</>,
  },
  {
    title: 'Link to Story',
    subtitle: 'Group multi-vendor coverage into one campaign entry',
    summary: <><b>2</b> new stories · <b>3</b> joined · <b>1</b> standalone</>,
  },
];

const STEP_MS = 2200;
const TOTAL_STEPS = STAGES.length + 2; // 5 stages + settle + reset pause

const StageRow: React.FC<{
  index: number;
  title: string;
  subtitle: string;
  summary: React.ReactNode;
  state: 'idle' | 'active' | 'done';
}> = ({ index, title, subtitle, summary, state }) => (
  <div className={`flex items-start gap-3 py-2.5 transition-opacity duration-500 ${state === 'idle' ? 'opacity-40' : 'opacity-100'}`}>
    <span className="mono text-[10px] font-bold text-on-surface-variant/60 tabular-nums w-3 shrink-0 mt-0.5">{index}</span>
    <span className="shrink-0 mt-1">
      {state === 'done' ? (
        <span className="w-4 h-4 rounded-full flex items-center justify-center" style={{ backgroundColor: `${TEAL}25` }}>
          <svg className="w-2.5 h-2.5" viewBox="0 0 24 24" fill="none" stroke={TEAL} strokeWidth="3"><path d="M5 13l4 4L19 7" strokeLinecap="round" strokeLinejoin="round" /></svg>
        </span>
      ) : state === 'active' ? (
        <span className="block w-4 h-4 rounded-full border-2 border-t-transparent animate-spin" style={{ borderColor: `${ACCENT} transparent ${ACCENT}40 ${ACCENT}40` }} />
      ) : (
        <span className="block w-4 h-4 rounded-full border border-outline-variant" />
      )}
    </span>
    <div className="flex-1 min-w-0">
      <div className="flex items-baseline justify-between gap-2">
        <span className="text-xs font-semibold text-on-surface">{title}</span>
        <span className={`text-[10px] text-on-surface-variant tabular-nums text-right transition-opacity duration-500 [&_b]:font-semibold [&_b]:text-on-surface ${state === 'idle' ? 'opacity-0' : 'opacity-100'}`}>
          {summary}
        </span>
      </div>
      <div className="text-[9px] text-outline leading-snug mt-0.5">{subtitle}</div>
    </div>
  </div>
);

const TtpChip: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <span className="mono text-[8px] px-1.5 py-0.5 rounded border" style={{ backgroundColor: `${ACCENT}0d`, color: `${ACCENT}cc`, borderColor: `${ACCENT}25` }}>
    {children}
  </span>
);

export const AutoDigestMockup: React.FC = () => {
  const [step, setStep] = useState(0);
  const ref = useRef<HTMLDivElement>(null);
  const started = useRef(false);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    let interval: ReturnType<typeof setInterval> | undefined;
    const obs = new IntersectionObserver(([e]) => {
      if (e.isIntersecting && !started.current) {
        started.current = true;
        setStep(1);
        interval = setInterval(() => {
          setStep((s) => (s >= TOTAL_STEPS ? 1 : s + 1));
        }, STEP_MS);
      }
    }, { threshold: 0.25 });
    obs.observe(el);
    return () => { obs.disconnect(); if (interval) clearInterval(interval); };
  }, []);

  // step 1..5 = stages running; step >= 4 shows digested report; step >= 5 shows story link
  const digested = step >= 4;
  const linked = step >= 5;
  const complete = step >= 6;

  return (
    <MockupFrame title="AUTO-DIGEST — SCHEDULED RUN" accent={ACCENT}>
      <div ref={ref}>
        {/* Run header */}
        <div className="flex items-center justify-between border-b border-outline-variant pb-3 mb-3">
          <div className="flex items-center gap-2.5">
            <div className="w-6 h-6 rounded-md flex items-center justify-center border" style={{ backgroundColor: `${ACCENT}10`, borderColor: `${ACCENT}25` }}>
              <svg className="w-3 h-3" viewBox="0 0 24 24" fill="none" stroke={ACCENT} strokeWidth="2"><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 3" strokeLinecap="round" /></svg>
            </div>
            <div>
              <h4 className="text-xs font-semibold text-on-surface">Daily digest run</h4>
              <p className="text-[9px] text-outline">Today · 06:00 UTC · no analyst involved</p>
            </div>
          </div>
          <span
            className="mono text-[8px] px-2 py-0.5 rounded font-bold border transition-colors duration-500"
            style={complete
              ? { backgroundColor: `${TEAL}15`, color: TEAL, borderColor: `${TEAL}30` }
              : { backgroundColor: `${ACCENT}10`, color: `${ACCENT}cc`, borderColor: `${ACCENT}25` }}
          >
            {complete ? 'COMPLETE' : 'PROCESSING'}
          </span>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
          {/* Left: run transcript */}
          <div className="lg:col-span-6 divide-y divide-outline-variant/40">
            {STAGES.map((s, i) => (
              <StageRow
                key={s.title}
                index={i + 1}
                title={s.title}
                subtitle={s.subtitle}
                summary={s.summary}
                state={step > i + 1 || complete ? 'done' : step === i + 1 ? 'active' : 'idle'}
              />
            ))}
          </div>

          {/* Right: raw advisory → structured intel report */}
          <div className="lg:col-span-6 relative min-h-[280px]">
            {/* Raw article card */}
            <div className={`absolute inset-x-0 top-0 transition-all duration-700 ${digested ? 'opacity-0 -translate-y-3 pointer-events-none' : 'opacity-100'}`}>
              <div className="rounded-xl border border-outline-variant bg-surface-container-low p-4">
                <div className="flex items-center gap-2 mb-2.5">
                  <span className="w-4 h-4 rounded-sm bg-surface-container-high border border-outline-variant flex items-center justify-center">
                    <span className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: `${ACCENT}80` }} />
                  </span>
                  <span className="mono text-[9px] text-on-surface-variant">Mandiant · RSS feed</span>
                  <span className="mono text-[8px] text-outline ml-auto">raw advisory</span>
                </div>
                <h5 className="text-xs font-semibold text-on-surface leading-snug mb-3">
                  Lazarus Group Deploys Trojanized PDF Readers in Fresh Espionage Wave
                </h5>
                {/* Skeleton body lines */}
                <div className="space-y-1.5">
                  {[100, 92, 96, 78, 88, 60].map((w, i) => (
                    <div key={i} className="h-1.5 rounded-full bg-surface-container-high" style={{ width: `${w}%` }} />
                  ))}
                </div>
                <div className="flex items-center gap-2 mt-3 pt-2.5 border-t border-outline-variant/60">
                  <span className="mono text-[8px] text-outline">4,200 words · unstructured</span>
                  {step >= 2 && (
                    <span className="mono text-[8px] px-1.5 py-0.5 rounded font-bold ml-auto" style={{ backgroundColor: `${TEAL}15`, color: TEAL }}>
                      PASSED GATE · conf 0.94
                    </span>
                  )}
                </div>
              </div>
            </div>

            {/* Digested report card */}
            <div className={`absolute inset-x-0 top-0 transition-all duration-700 ${digested ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-3 pointer-events-none'}`}>
              <div className="rounded-xl border overflow-hidden bg-surface-container-highest" style={{ borderColor: `${ACCENT}30` }}>
                <div className="px-4 pt-3.5 pb-3">
                  <div className="flex items-center gap-2 mb-2 flex-wrap">
                    <span className="mono text-[8px] font-bold px-2 py-0.5 rounded uppercase tracking-wider bg-red-500/10 text-red-500/90 border border-red-500/20">Critical</span>
                    <span className="mono text-[8px] px-2 py-0.5 rounded uppercase tracking-wider" style={{ backgroundColor: `${ACCENT}12`, color: `${ACCENT}cc` }}>Espionage</span>
                    <span className="mono text-[8px] text-outline ml-auto">intel report · 2m 41s</span>
                  </div>
                  <h5 className="text-xs font-bold text-on-surface leading-snug mb-2">
                    Lazarus Trojanized PDF Reader Campaign
                  </h5>
                  <p className="text-[10px] text-on-surface-variant leading-relaxed mb-3">
                    Rogue FoxitReader updates sideload an evasive DLL and write a registry Run key for boot persistence. Full TTP, IoC, and rule extraction complete.
                  </p>
                  <div className="flex flex-wrap gap-1.5 mb-3">
                    <TtpChip>T1547.001</TtpChip>
                    <TtpChip>T1574.002</TtpChip>
                    <TtpChip>T1218.005</TtpChip>
                    <TtpChip>+5 techniques</TtpChip>
                  </div>
                  <div className="grid grid-cols-4 gap-2 pt-2.5 border-t border-outline-variant">
                    {[
                      { label: 'TTPs', value: '8' },
                      { label: 'IoCs', value: '13' },
                      { label: 'Rules', value: '3' },
                      { label: 'Coverage', value: '42%', color: '#f59e0b' },
                    ].map((s) => (
                      <div key={s.label} className="text-center">
                        <div className="mono text-sm font-bold" style={{ color: s.color ?? `${ACCENT}cc` }}>{s.value}</div>
                        <div className="mono text-[7px] text-on-surface-variant uppercase tracking-wider">{s.label}</div>
                      </div>
                    ))}
                  </div>
                </div>
                {/* Story link footer */}
                <div className={`px-4 py-2.5 border-t border-outline-variant bg-surface-container-low flex items-center gap-2 transition-opacity duration-500 ${linked ? 'opacity-100' : 'opacity-0'}`}>
                  <span className="w-1.5 h-1.5 rounded-full shrink-0" style={{ backgroundColor: TEAL }} />
                  <span className="text-[9px] text-on-surface-variant">
                    Joined story: <span className="font-semibold text-on-surface">Lazarus PDF Campaign</span> — 3 vendor sources, one entry
                  </span>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="flex flex-wrap gap-3 items-center justify-between mt-4 pt-3 border-t border-outline-variant mono text-[9px] text-on-surface-variant">
          <span>
            RAW ADVISORY → OPERATIONAL INTEL IN{' '}
            <span className="font-bold" style={{ color: TEAL }}>MINUTES</span>
            <span className="text-outline-variant mx-2">|</span>
            ZERO ANALYST MINUTES SPENT
          </span>
          <span className="flex items-center gap-1.5">
            <span className="w-1.5 h-1.5 rounded-full animate-pulse shrink-0" style={{ backgroundColor: ACCENT }} />
            SCHEDULED · RUNS DAILY
          </span>
        </div>
      </div>
    </MockupFrame>
  );
};
