// supabase/functions/_shared/aiFeatureCodes.ts
// Minimal server-side helper. Canonical taxonomy lives in src/lib/ai/featureCodes.ts.
// Server treats unrecognized strings as 'unknown' so missing tags surface in dashboards
// without rejecting the AI call.

const KNOWN_FEATURES = new Set<string>([
  'optimus-chat',
  'ai-query-gen',
  'sigma-converter',
  'detection-form-assist',
  'multi-query-assist',
  'investigation-assist',
  'threat-intel-digest',
  'auto-digest-classify',
  'auto-digest-full',
  'enrichment-sync',
  'playbook-runner',
  'embedding-detection',
  'embedding-batch',
  'embedding-threat-intel',
  'embedding-internal',
  'optimus-tool-call',
  'tr-research-agent',
  'tr-attack-researcher',
  'tr-detection-engineer',
  'tr-qa-agent',
  'unknown',
]);

export function normalizeFeatureCode(s: unknown): string {
  if (typeof s === 'string' && KNOWN_FEATURES.has(s)) return s;
  return 'unknown';
}
