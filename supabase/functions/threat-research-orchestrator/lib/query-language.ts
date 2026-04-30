// supabase/functions/threat-research-orchestrator/lib/query-language.ts
//
// Resolve the query language for a research run from the user's environment
// profile. Mirrors SIEM_TO_QUERY_LANGUAGES from src/hooks/useProfileIntelligence.ts.
// Falls back to Sigma when no SIEM is configured. EDR-only environments get Sigma
// (no EDR→language map in v1).

import type { ResearchQueryLanguage } from "./types.ts";

const SIEM_TO_QUERY_LANGUAGES: Record<string, ResearchQueryLanguage[]> = {
  'Splunk':                   ['SPL'],
  'Microsoft Sentinel':       ['KQL'],
  'Microsoft Defender XDR':   ['KQL'],
  'Elastic Security':         ['EQL'],
  'CrowdStrike Falcon':       ['CQL'],
  'Google Chronicle':         ['YARA-L'],
};

export function resolveQueryLanguage(envProfile: { siem_platforms?: string[] } | null | undefined): ResearchQueryLanguage {
  const siems = envProfile?.siem_platforms ?? [];
  for (const siem of siems) {
    const langs = SIEM_TO_QUERY_LANGUAGES[siem];
    if (langs && langs.length > 0) return langs[0];
  }
  return 'Sigma';
}
