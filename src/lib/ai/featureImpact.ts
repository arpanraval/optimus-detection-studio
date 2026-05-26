// src/lib/ai/featureImpact.ts
// Per-feature impact estimates: what each AI call produces and roughly how
// much engineer time it saves. The Cost Center uses this to translate raw
// `call_count` per feature into a "value delivered" narrative so cost is
// always shown next to what it bought.
//
// Numbers here are intentionally conservative defaults; tune as we get real
// usage data. Pure data — no React — so it can also be reused server-side.

import type { AiFeatureCode } from './featureCodes';

/**
 * High-level artifact buckets we surface as headline impact tiles.
 * Multiple features can roll into the same bucket (e.g. detection-form-assist
 * and ai-query-gen both produce "detection drafts").
 */
export type ImpactBucket =
  | 'detection-draft'       // a detection rule was authored/iterated with AI
  | 'sigma-conversion'      // a Sigma rule was translated to a target SIEM
  | 'detection-finetune'    // an existing detection was tuned to reduce FP / improve coverage
  | 'investigation'         // an investigation step was assisted
  | 'threat-intel'          // a threat intel article was processed / triaged
  | 'embedding'             // an item was embedded for semantic search
  | 'agent-step'            // a multi-agent threat-research step
  | 'chat'                  // an Optimus chat exchange
  | 'playbook'              // a playbook step
  | 'other';

interface ImpactDef {
  bucket: ImpactBucket;
  /** Singular noun for what one successful call produces. */
  artifactNoun: string;
  /** Plural form. */
  artifactNounPlural: string;
  /** Rough engineer-minutes saved per successful call (conservative). */
  minutesSaved: number;
}

const I = (
  bucket: ImpactBucket,
  artifactNoun: string,
  artifactNounPlural: string,
  minutesSaved: number,
): ImpactDef => ({ bucket, artifactNoun, artifactNounPlural, minutesSaved });

export const FEATURE_IMPACT: Record<AiFeatureCode, ImpactDef> = {
  // ---- AI Tools ----
  'optimus-chat':           I('chat',              'chat exchange',      'chat exchanges',       3),
  'ai-query-gen':           I('detection-draft',   'query generated',    'queries generated',    8),
  'sigma-converter':        I('sigma-conversion',  'Sigma conversion',   'Sigma conversions',    12),

  // ---- Authoring ----
  'detection-form-assist':  I('detection-draft',   'detection draft',    'detection drafts',     20),
  'multi-query-assist':     I('detection-draft',   'multi-platform query','multi-platform queries',15),
  'investigation-assist':   I('investigation',     'investigation step', 'investigation steps',  25),
  'detection-finetune':     I('detection-finetune','detection tune',     'detection tunes',      18),

  // ---- Threat Intel ----
  'threat-intel-digest':    I('threat-intel',      'intel digest',       'intel digests',        10),
  'auto-digest-classify':   I('threat-intel',      'intel triage',       'intel triages',        3),
  'auto-digest-full':       I('threat-intel',      'intel digest',       'intel digests',        10),
  'auto-digest-link':       I('threat-intel',      'intel link',         'intel links',          4),

  // ---- Intelligence / Workflows ----
  'enrichment-sync':        I('other',             'enrichment sync',    'enrichment syncs',      2),
  'playbook-runner':        I('playbook',          'playbook step',      'playbook steps',        8),

  // ---- Embeddings (high volume, low per-call value) ----
  'embedding-detection':    I('embedding',         'detection embedded', 'detections embedded',   0.2),
  'embedding-batch':        I('embedding',         'item embedded',      'items embedded',        0.1),
  'embedding-threat-intel': I('embedding',         'intel embedded',     'intel embedded',        0.2),
  'embedding-internal':     I('embedding',         'item embedded',      'items embedded',        0.1),

  // ---- Optimus tool calls (counted under chat to avoid double-billing impact) ----
  'optimus-tool-call':      I('chat',              'tool call',          'tool calls',            2),

  // ---- Threat Research multi-agent ----
  'tr-research-agent':      I('agent-step',        'research step',      'research steps',        10),
  'tr-attack-researcher':   I('agent-step',        'attack research',    'attack research steps',12),
  'tr-detection-engineer':  I('agent-step',        'engineered detection','engineered detections',20),
  'tr-qa-agent':            I('agent-step',        'QA check',           'QA checks',             6),

  'unknown':                I('other',             'AI call',            'AI calls',              2),
};

/** Display metadata for the headline artifact buckets (in render order). */
export const BUCKET_DISPLAY: Record<
  ImpactBucket,
  { label: string; icon: string; accent: string }
> = {
  'detection-draft':    { label: 'Detections drafted',  icon: 'edit',           accent: 'rgb(var(--md-sys-color-primary))' },
  'sigma-conversion':   { label: 'Sigma converted',     icon: 'exchange',       accent: 'rgb(var(--md-ext-color-cyan))' },
  'detection-finetune': { label: 'Detections tuned',    icon: 'sliders',        accent: 'rgb(var(--md-ext-color-violet))' },
  'investigation':      { label: 'Investigations',      icon: 'search',         accent: 'rgb(var(--md-ext-color-teal))' },
  'threat-intel':       { label: 'Intel processed',     icon: 'file-text',      accent: 'rgb(var(--md-ext-color-indigo))' },
  'agent-step':         { label: 'Research steps',      icon: 'radar',          accent: 'rgb(var(--md-ext-color-amber))' },
  'embedding':          { label: 'Items embedded',      icon: 'database',       accent: 'rgb(var(--md-ext-color-blue))' },
  'chat':               { label: 'Chat exchanges',      icon: 'message-square', accent: 'rgb(var(--md-sys-color-tertiary))' },
  'playbook':           { label: 'Playbook steps',      icon: 'play',           accent: 'rgb(var(--md-ext-color-green))' },
  'other':              { label: 'Other',               icon: 'circle',         accent: 'rgb(var(--md-sys-color-outline))' },
};

/** Render order for the headline tile row (top buckets first). */
export const HEADLINE_BUCKETS: ImpactBucket[] = [
  'detection-draft',
  'sigma-conversion',
  'detection-finetune',
  'investigation',
  'threat-intel',
  'agent-step',
];

export interface BucketRollup {
  bucket: ImpactBucket;
  count: number;
  minutesSaved: number;
  costUsd: number;
}

/**
 * Aggregate a per-feature breakdown into bucket-level rollups.
 *
 * `successfulCalls(row)` lets the caller decide how to compute the "good"
 * call count — typically `call_count - failure_count`. We only credit
 * successful calls toward impact (a budget_blocked or provider_error call
 * costs money but produces nothing).
 */
export function rollupByBucket(
  rows: { feature: string; call_count: number; failure_count: number; cost_usd: number }[],
): Map<ImpactBucket, BucketRollup> {
  const out = new Map<ImpactBucket, BucketRollup>();
  for (const row of rows) {
    const def = FEATURE_IMPACT[row.feature as AiFeatureCode] ?? FEATURE_IMPACT.unknown;
    const successful = Math.max(0, row.call_count - row.failure_count);
    const existing = out.get(def.bucket);
    const contribution: BucketRollup = {
      bucket: def.bucket,
      count: successful,
      minutesSaved: successful * def.minutesSaved,
      costUsd: row.cost_usd,
    };
    if (existing) {
      existing.count += contribution.count;
      existing.minutesSaved += contribution.minutesSaved;
      existing.costUsd += contribution.costUsd;
    } else {
      out.set(def.bucket, contribution);
    }
  }
  return out;
}

/** Default blended engineer cost used to estimate $ value of time saved. */
export const DEFAULT_ENGINEER_HOURLY_USD = 100;

export function hoursSavedToUsd(hours: number, hourlyUsd = DEFAULT_ENGINEER_HOURLY_USD): number {
  return hours * hourlyUsd;
}
