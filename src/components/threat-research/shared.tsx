// src/components/threat-research/shared.tsx
//
// Presentation primitives shared across the threat-research views. Both of
// these started as file-local helpers — Section in DetectionLeafCard,
// TrustFlags in ResearchList — and the Research dossier needs both. Extracted
// rather than copied so the three views cannot drift apart in how they render
// a section heading or, more importantly, a trust signal.
//
// Mirrors the existing src/components/threatintel/shared/ convention.

import React from 'react';
import { Icon } from '../Icon';
import type { AttackBehaviour, DetectionOpportunity } from '../../types/threatResearch';

/** A detection with saved_detection_id set is terminal — "already in the
 *  library, nothing more to do" — whether it got there because the user
 *  saved it this session or because reuse-first (Amendment 1) pointed the
 *  leaf at an existing rule instead of generating one. This must be checked
 *  before any qa-based branching in EVERY view. ResearchList already did;
 *  ResearchCanvas didn't, so a reused leaf rendered "qa pending" forever in
 *  Canvas while List correctly showed "Saved to library" for the same leaf.
 *  One shared predicate so that divergence can't reappear. */
export function isDetectionSaved(det: DetectionOpportunity['detection']): boolean {
  return !!det.saved_detection_id;
}

/** Labelled block. The uppercase micro-heading is the threat-research panel
 *  idiom; keep it identical everywhere so the views read as one surface. */
export function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-on-surface-variant">{title}</div>
      {children}
    </div>
  );
}

/** Compact trust-signal cluster for a behaviour: hallucinated MITRE ids,
 *  tactic-inconsistent ids, and training-only (unsourced) behaviours.
 *
 *  These exist so a reader can see how much to trust a behaviour without
 *  opening it. Rendering them only inside the leaf detail would defeat the
 *  point — hence the same component in the list, the dossier, and anywhere a
 *  behaviour is summarised. Renders nothing when there is nothing to flag. */
export function TrustFlags({ behaviour }: { behaviour: AttackBehaviour }) {
  const unverifiedCount = (behaviour.unverified_mitre_ids ?? []).length;
  const inconsistentCount = (behaviour.tactic_inconsistent_mitre_ids ?? []).length;
  const unsourced = behaviour.unsourced === true;
  if (!unverifiedCount && !inconsistentCount && !unsourced) return null;
  return (
    <span className="inline-flex items-center gap-1">
      {unverifiedCount > 0 && (
        <span
          className="inline-flex items-center gap-0.5 rounded bg-error-container px-1 py-0.5 text-[10px] font-medium text-on-error-container"
          title={`${unverifiedCount} MITRE id${unverifiedCount === 1 ? '' : 's'} not in canonical table — possible hallucination`}
        >
          <Icon name="alert-triangle" size={9} />
          {unverifiedCount}
        </span>
      )}
      {inconsistentCount > 0 && (
        <span
          className="inline-flex items-center gap-0.5 rounded bg-secondary-container px-1 py-0.5 text-[10px] font-medium text-on-secondary-container"
          title={`${inconsistentCount} MITRE id${inconsistentCount === 1 ? '' : 's'} canonically belong to a different tactic than this behaviour's tagged tactic`}
        >
          <Icon name="alert-circle" size={9} />
          {inconsistentCount}
        </span>
      )}
      {unsourced && (
        <span
          className="inline-flex items-center rounded bg-secondary-container px-1 py-0.5 text-[10px] font-medium text-on-secondary-container"
          title="Behaviour is from training knowledge, no specific source citation"
        >
          training
        </span>
      )}
    </span>
  );
}

/** Linked source list. Every citation the pipeline collects has a URL (the
 *  merge step drops the ones that don't), so each renders as a link followed
 *  by the claim it supports. */
export function CitationList({
  citations,
  emptyLabel = 'No citations.',
}: {
  citations: { source: string; url: string; claim: string }[];
  emptyLabel?: string;
}) {
  if (!citations || citations.length === 0) {
    return <div className="text-xs italic text-on-surface-variant">{emptyLabel}</div>;
  }
  return (
    <ul className="space-y-1.5">
      {citations.map((c, i) => (
        <li key={`${c.url}-${i}`} className="text-xs">
          <a
            href={c.url}
            target="_blank"
            rel="noopener noreferrer"
            className="font-medium text-primary hover:underline"
          >
            {c.source}
          </a>
          {c.claim && <span className="text-on-surface"> — {c.claim}</span>}
        </li>
      ))}
    </ul>
  );
}
