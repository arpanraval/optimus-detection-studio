// src/components/threat-research/ResearchDossier.tsx
//
// The Research view — a readable dossier over everything the pipeline already
// produced and persisted but never showed anyone.
//
// Before this view, tree.subject.brief, tree.subject.intel_summary,
// tree.tactic_summary, every behaviour's narrative_description and deep_dive
// (how_it_works, controls_bypassed, attacker_motivation, attacker_gain,
// success_signal, variants), artefacts_required, and all the research
// citations were generated, paid for, written to the session row, and
// referenced ZERO times anywhere in src/. The Canvas and List views are both
// detection-centric; the intelligence that justified those detections had no
// surface at all.
//
// Everything here is read-only rendering of existing tree data. No new
// requests, no new pipeline state.

import React from 'react';
import { Icon } from '../Icon';
import { Section, TrustFlags, CitationList } from './shared';
import type {
  AttackBehaviour, ThreatResearchTree, TacticSummary,
} from '../../types/threatResearch';

/** Kill-chain order. tactic_summary is supposed to carry exactly 14 rows, one
 *  per ATT&CK tactic, but it arrives in whatever order the Research Agent
 *  emitted. Sorting to canonical order makes the walk readable as a chain
 *  rather than a list; anything unrecognised sorts to the end rather than
 *  being dropped. */
const TACTIC_ORDER: string[] = [
  'reconnaissance', 'resource-development', 'initial-access', 'execution',
  'persistence', 'privilege-escalation', 'defense-evasion', 'credential-access',
  'discovery', 'lateral-movement', 'collection', 'command-and-control',
  'exfiltration', 'impact',
];

const TACTIC_LABEL: Record<string, string> = {
  'reconnaissance': 'Reconnaissance',
  'resource-development': 'Resource Development',
  'initial-access': 'Initial Access',
  'execution': 'Execution',
  'persistence': 'Persistence',
  'privilege-escalation': 'Privilege Escalation',
  'defense-evasion': 'Defense Evasion',
  'credential-access': 'Credential Access',
  'discovery': 'Discovery',
  'lateral-movement': 'Lateral Movement',
  'collection': 'Collection',
  'command-and-control': 'Command and Control',
  'exfiltration': 'Exfiltration',
  'impact': 'Impact',
};

const tacticLabel = (t: string) => TACTIC_LABEL[t] ?? t;

function sortTactics(rows: TacticSummary[]): TacticSummary[] {
  return [...rows].sort((a, b) => {
    const ia = TACTIC_ORDER.indexOf(a.tactic);
    const ib = TACTIC_ORDER.indexOf(b.tactic);
    return (ia < 0 ? TACTIC_ORDER.length : ia) - (ib < 0 ? TACTIC_ORDER.length : ib);
  });
}

/** Ordered intel_summary fields. Every one is optional on the type and the
 *  Research Agent routinely fills only some — render what exists rather than
 *  showing empty rows, which read as "we found nothing" instead of "we didn't
 *  look for this". */
const INTEL_FIELDS: { key: keyof NonNullable<ThreatResearchTree['subject']>['intel_summary']; label: string }[] = [
  { key: 'actor',          label: 'Actor' },
  { key: 'attribution',    label: 'Attribution' },
  { key: 'victimology',    label: 'Victimology' },
  { key: 'infrastructure', label: 'Infrastructure' },
  { key: 'tooling',        label: 'Tooling' },
  { key: 'timing',         label: 'Timing' },
];

export function ResearchDossier({ tree }: { tree: ThreatResearchTree }) {
  const subject = tree.subject;
  const tactics = sortTactics(tree.tactic_summary ?? []);
  const observedCount = tactics.filter(t => t.observed).length;

  // Research hasn't landed yet. The Canvas view has its own in-progress
  // chrome; here just say so rather than rendering a page of empty sections.
  if (!subject || (!subject.brief && tree.behaviours.length === 0)) {
    return (
      <div className="flex flex-1 items-center justify-center px-6 py-10 text-center">
        <div className="max-w-md">
          <Icon name="search" size={24} className="mx-auto mb-3 text-on-surface-variant" />
          <div className="text-sm font-medium text-on-surface">No research yet</div>
          <p className="mt-1 text-sm text-on-surface-variant">
            The Research agent hasn&apos;t returned a threat profile for this session. Once it does,
            the subject brief, kill-chain walk and per-behaviour deep dives appear here.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex-1 overflow-y-auto px-6 py-5">
      <div className="mx-auto max-w-4xl space-y-8">

        {/* planner_status === 'degraded' banner intentionally NOT rendered
            here — ThreatResearchDetailPage already renders it once, above
            every view (including this one), with the actionable "Re-run
            planner" button. Duplicating a decorative-only copy of the same
            banner here just showed it twice on the Research tab. */}

        {/* ── Subject ───────────────────────────────────────────────────── */}
        <section className="space-y-4 rounded-2xl border border-outline-variant bg-surface p-5">
          <div>
            <h2 className="text-lg font-semibold text-on-surface">{subject.subject}</h2>
            {subject.classification && (
              <span className="mt-1 inline-flex items-center rounded-full bg-primary/10 px-2 py-0.5 text-xs font-medium text-primary ring-1 ring-inset ring-primary/25">
                {subject.classification}
              </span>
            )}
          </div>

          {subject.brief && (
            <Section title="Brief">
              <p className="whitespace-pre-line text-sm leading-relaxed text-on-surface">{subject.brief}</p>
            </Section>
          )}

          {INTEL_FIELDS.some(f => subject.intel_summary?.[f.key]) && (
            <Section title="Intelligence summary">
              <dl className="grid gap-x-6 gap-y-3 sm:grid-cols-2">
                {INTEL_FIELDS.map(f => {
                  const value = subject.intel_summary?.[f.key];
                  if (!value) return null;
                  return (
                    <div key={f.key}>
                      <dt className="text-[11px] font-medium uppercase tracking-wide text-on-surface-variant">{f.label}</dt>
                      <dd className="mt-0.5 text-sm text-on-surface">{value}</dd>
                    </div>
                  );
                })}
              </dl>
            </Section>
          )}

          <Section title="Sources">
            <CitationList
              citations={subject.citations ?? []}
              emptyLabel="The Research agent cited no sources for this subject."
            />
          </Section>
        </section>

        {/* ── Kill-chain walk ───────────────────────────────────────────── */}
        {tactics.length > 0 && (
          <section className="rounded-2xl border border-outline-variant bg-surface p-5">
            <div className="mb-1 flex flex-wrap items-baseline justify-between gap-2">
              <h2 className="text-base font-semibold text-on-surface">Kill-chain walk</h2>
              <span className="text-xs text-on-surface-variant">
                {observedCount} of {tactics.length} tactics observed
              </span>
            </div>
            {/* The NOT-observed rows carry as much signal as the observed
                ones — they are the agent stating, with a rationale, where it
                looked and found nothing. Showing only the hits would turn a
                deliberate walk into an unfalsifiable highlight reel. */}
            <p className="mb-3 text-xs text-on-surface-variant">
              Every ATT&amp;CK tactic, including the ones with no observed activity and why.
            </p>
            <ul className="divide-y divide-outline-variant">
              {tactics.map(t => (
                <li key={t.tactic} className="flex gap-3 py-2.5">
                  <span className="mt-0.5 flex-shrink-0">
                    {t.observed
                      ? <Icon name="check-circle" size={14} className="text-ext-teal" />
                      : <Icon name="eye-off" size={14} className="text-on-surface-variant/60" />}
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className={`text-sm ${t.observed ? 'font-medium text-on-surface' : 'text-on-surface-variant'}`}>
                      {tacticLabel(t.tactic)}
                    </div>
                    {t.rationale && (
                      <p className="mt-0.5 text-xs leading-relaxed text-on-surface-variant">{t.rationale}</p>
                    )}
                  </div>
                </li>
              ))}
            </ul>
          </section>
        )}

        {/* ── Behaviours ────────────────────────────────────────────────── */}
        {tree.behaviours.length > 0 && (
          <section className="space-y-4">
            <h2 className="text-base font-semibold text-on-surface">
              Behaviours <span className="font-normal text-on-surface-variant">({tree.behaviours.length})</span>
            </h2>
            {tree.behaviours.map(b => <BehaviourCard key={b.id} behaviour={b} />)}
          </section>
        )}

        {tree.open_questions?.length > 0 && (
          <section className="rounded-2xl border border-outline-variant bg-surface p-5">
            <h2 className="mb-2 text-base font-semibold text-on-surface">Open questions</h2>
            <ul className="space-y-2">
              {tree.open_questions.map((q, i) => (
                <li key={i} className="text-sm text-on-surface">
                  <span className="mr-1.5 inline-flex items-center rounded bg-surface-variant px-1.5 py-0.5 text-[10px] font-medium uppercase text-on-surface-variant">
                    {q.agent}
                  </span>
                  {q.question}
                  {q.context && <span className="text-on-surface-variant"> — {q.context}</span>}
                </li>
              ))}
            </ul>
          </section>
        )}
      </div>
    </div>
  );
}

function BehaviourCard({ behaviour }: { behaviour: AttackBehaviour }) {
  const dd = behaviour.deep_dive;
  const artefacts = behaviour.artefacts_required ?? [];

  return (
    <article className="rounded-2xl border border-outline-variant bg-surface p-5">
      <header className="mb-3">
        <div className="mb-1 flex flex-wrap items-center gap-2">
          <span className="inline-flex items-center rounded-full bg-surface-variant px-2 py-0.5 text-[11px] font-medium text-on-surface-variant">
            {tacticLabel(behaviour.tactic)}
          </span>
          {behaviour.mitre_technique_ids.map(id => (
            <a
              key={id}
              href={`https://attack.mitre.org/techniques/${id.replace('.', '/')}/`}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center rounded-md bg-primary-container px-2 py-0.5 text-[11px] font-medium text-on-primary-container hover:opacity-80"
            >
              {id}
            </a>
          ))}
          <TrustFlags behaviour={behaviour} />
        </div>
        <h3 className="text-sm font-semibold text-on-surface">{behaviour.title}</h3>
      </header>

      {behaviour.narrative_description && (
        <p className="mb-4 whitespace-pre-line text-sm leading-relaxed text-on-surface">
          {behaviour.narrative_description}
        </p>
      )}

      {dd ? (
        <div className="space-y-4 border-t border-outline-variant pt-4">
          {dd.how_it_works && (
            <Section title="How it works">
              <p className="whitespace-pre-line text-sm leading-relaxed text-on-surface">{dd.how_it_works}</p>
            </Section>
          )}

          <div className="grid gap-4 sm:grid-cols-2">
            {dd.attacker_motivation && (
              <Section title="Why an attacker does this">
                <p className="text-sm text-on-surface">{dd.attacker_motivation}</p>
              </Section>
            )}
            {dd.attacker_gain && (
              <Section title="What it gets them">
                <p className="text-sm text-on-surface">{dd.attacker_gain}</p>
              </Section>
            )}
          </div>

          {dd.success_signal && (
            <Section title="What success looks like">
              <p className="text-sm text-on-surface">{dd.success_signal}</p>
            </Section>
          )}

          {dd.controls_bypassed?.length > 0 && (
            <Section title="Controls bypassed">
              {/* Warning tone, not error. error-container is reserved across
                  this feature for things that are WRONG (hallucinated MITRE
                  ids); a bypassed control is a true finding the reader should
                  weigh, and at full error saturation a few chips dominated the
                  card in dark mode. */}
              <Chips items={dd.controls_bypassed} tone="warning" />
            </Section>
          )}

          {dd.variants?.length > 0 && (
            <Section title="Variants">
              <ul className="list-disc space-y-1 pl-4 text-sm text-on-surface">
                {dd.variants.map((v, i) => <li key={i}>{v}</li>)}
              </ul>
            </Section>
          )}

          {artefacts.length > 0 && (
            <Section title="Telemetry this needs">
              <Chips items={artefacts} tone="neutral" />
            </Section>
          )}

          <Section title="Sources">
            <CitationList
              citations={[...(behaviour.citations ?? []), ...(dd.citations ?? [])]}
              emptyLabel="No sources cited for this behaviour."
            />
          </Section>
        </div>
      ) : (
        <div className="border-t border-outline-variant pt-4">
          {/* Distinguish "not yet researched" from "researched, nothing found" —
              a blank space reads as the latter. */}
          <p className="text-xs italic text-on-surface-variant">
            The Attack Researcher hasn&apos;t produced a deep dive for this behaviour yet.
          </p>
          {(behaviour.citations?.length ?? 0) > 0 && (
            <div className="mt-3">
              <Section title="Sources">
                <CitationList citations={behaviour.citations} />
              </Section>
            </div>
          )}
        </div>
      )}
    </article>
  );
}

function Chips({ items, tone }: { items: string[]; tone: 'warning' | 'neutral' }) {
  const cls = tone === 'warning'
    ? 'bg-secondary-container text-on-secondary-container'
    : 'bg-surface-variant text-on-surface-variant';
  return (
    <div className="flex flex-wrap gap-1.5">
      {items.map((item, i) => (
        <span key={i} className={`inline-flex items-center rounded-md px-2 py-1 text-xs ${cls}`}>
          {item}
        </span>
      ))}
    </div>
  );
}

export default ResearchDossier;
