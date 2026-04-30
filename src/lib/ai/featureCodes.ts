// src/lib/ai/featureCodes.ts
// Canonical AI feature taxonomy. Every AI call site imports a code from here.
// The Cost Center page uses FEATURE_DISPLAY for labels/groups/icons.
// The server-side telemetry wrapper (Deno) treats the feature string as a
// free-form text label and only enforces an "unknown" fallback —
// see supabase/functions/_shared/aiFeatureCodes.ts.

export const AI_FEATURE_CODES = {
  // User-facing AI tools
  OPTIMUS_CHAT:           'optimus-chat',
  AI_QUERY_GEN:           'ai-query-gen',
  SIGMA_CONVERTER:        'sigma-converter',

  // Detection authoring assists
  DETECTION_FORM_ASSIST:  'detection-form-assist',
  MULTI_QUERY_ASSIST:     'multi-query-assist',
  INVESTIGATION_ASSIST:   'investigation-assist',

  // Threat intel
  THREAT_INTEL_DIGEST:    'threat-intel-digest',
  AUTO_DIGEST_CLASSIFY:   'auto-digest-classify',
  AUTO_DIGEST_FULL:       'auto-digest-full',

  // MITRE / enrichment
  ENRICHMENT_SYNC:        'enrichment-sync',
  PLAYBOOK_RUNNER:        'playbook-runner',

  // Embeddings (high-volume, low cost)
  EMBEDDING_DETECTION:    'embedding-detection',
  EMBEDDING_BATCH:        'embedding-batch',
  EMBEDDING_THREAT_INTEL: 'embedding-threat-intel',

  // Optimus tool calls (when invoked from agent)
  OPTIMUS_TOOL_CALL:      'optimus-tool-call',

  // Threat Research (multi-agent)
  TR_RESEARCH:            'tr-research-agent',
  TR_ATTACK_RESEARCHER:   'tr-attack-researcher',
  TR_DETECTION_ENGINEER:  'tr-detection-engineer',
  TR_QA:                  'tr-qa-agent',

  // Catch-all for new code that hasn't been classified yet
  UNKNOWN:                'unknown',
} as const;

export type AiFeatureCode = typeof AI_FEATURE_CODES[keyof typeof AI_FEATURE_CODES];

export const AI_FEATURE_CODE_VALUES: AiFeatureCode[] =
  Object.values(AI_FEATURE_CODES) as AiFeatureCode[];

export function isValidFeatureCode(s: string): s is AiFeatureCode {
  return (AI_FEATURE_CODE_VALUES as string[]).includes(s);
}

export const FEATURE_DISPLAY: Record<AiFeatureCode, { label: string; group: string; icon: string }> = {
  'optimus-chat':           { label: 'Optimus Chat',           group: 'AI Tools',         icon: 'message-square' },
  'ai-query-gen':           { label: 'AI Query Generator',     group: 'AI Tools',         icon: 'sparkles' },
  'sigma-converter':        { label: 'Sigma Converter',        group: 'AI Tools',         icon: 'shuffle' },
  'detection-form-assist':  { label: 'Detection Form Assist',  group: 'Authoring',        icon: 'edit' },
  'multi-query-assist':     { label: 'Multi-Query Assist',     group: 'Authoring',        icon: 'edit' },
  'investigation-assist':   { label: 'Investigation Assist',   group: 'Authoring',        icon: 'edit' },
  'threat-intel-digest':    { label: 'Threat Intel Digest',    group: 'Threat Intel',     icon: 'file-text' },
  'auto-digest-classify':   { label: 'Auto-Digest Classifier', group: 'Threat Intel',     icon: 'filter' },
  'auto-digest-full':       { label: 'Auto-Digest Full',       group: 'Threat Intel',     icon: 'file-text' },
  'enrichment-sync':        { label: 'Enrichment Sync',        group: 'Intelligence',     icon: 'refresh-cw' },
  'playbook-runner':        { label: 'Playbook Runner',        group: 'Workflows',        icon: 'play' },
  'embedding-detection':    { label: 'Detection Embedding',    group: 'Embeddings',       icon: 'database' },
  'embedding-batch':        { label: 'Batch Embedding',        group: 'Embeddings',       icon: 'database' },
  'embedding-threat-intel': { label: 'Threat Intel Embedding', group: 'Embeddings',       icon: 'database' },
  'optimus-tool-call':      { label: 'Optimus Tool Call',      group: 'AI Tools',         icon: 'tool' },
  'tr-research-agent':      { label: 'TR · Research',          group: 'Threat Research',  icon: 'compass' },
  'tr-attack-researcher':   { label: 'TR · Attack Researcher', group: 'Threat Research',  icon: 'crosshair' },
  'tr-detection-engineer':  { label: 'TR · Detection Engineer',group: 'Threat Research',  icon: 'shield' },
  'tr-qa-agent':            { label: 'TR · QA',                group: 'Threat Research',  icon: 'check-circle' },
  'unknown':                { label: 'Unclassified',           group: 'Other',            icon: 'help-circle' },
};
