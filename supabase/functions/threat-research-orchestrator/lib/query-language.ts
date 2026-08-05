// supabase/functions/threat-research-orchestrator/lib/query-language.ts
//
// Resolve the query language for a research run from the user's environment
// profile. Mirrors SIEM_TO_QUERY_LANGUAGES from src/hooks/useProfileIntelligence.ts.
// Falls back to Sigma when no SIEM is configured. EDR-only environments get Sigma
// (no EDR→language map in v1).

import type { ResearchQueryLanguage } from "./types.ts";

export const SIEM_TO_QUERY_LANGUAGES: Record<string, ResearchQueryLanguage[]> = {
  'Splunk':                   ['SPL'],
  'Microsoft Sentinel':       ['KQL'],
  'Microsoft Defender XDR':   ['KQL'],
  'Elastic Security':         ['EQL'],
  'CrowdStrike Falcon':       ['CQL'],
  'Google Chronicle':         ['YARA-L'],
};

/** The SIEM platforms a session can target. Same keys as
 *  SIEM_TO_QUERY_LANGUAGES — exported so the HTTP entry point can validate a
 *  caller-supplied siem_platform against one source of truth rather than
 *  keeping a second copy of the list. */
export const SUPPORTED_SIEM_PLATFORMS: readonly string[] = Object.keys(SIEM_TO_QUERY_LANGUAGES);

/** Case-sensitive on purpose: these strings are also what environment_profiles
 *  .siem_platforms stores, and the UI picks them from the same list. */
export function isSupportedSiem(platform: string): boolean {
  return Object.prototype.hasOwnProperty.call(SIEM_TO_QUERY_LANGUAGES, platform);
}

export function resolveQueryLanguage(envProfile: { siem_platforms?: string[] } | null | undefined): ResearchQueryLanguage {
  return resolveQueryTarget(envProfile).language;
}

/** Where a detection is actually going to run.
 *
 *  A language is not a target. Microsoft Sentinel and Microsoft Defender XDR
 *  both write KQL, and the map above collapses them to it — after which the
 *  product is gone and everything downstream has to guess.
 *
 *  Everything then guessed the same way: the orchestrator validates every KQL
 *  query against the Defender XDR schema. So a correct Sentinel query over
 *  SecurityEvent / SigninLogs / AuditLogs is reported as referencing unknown
 *  tables, and QA — reading those findings — can "repair" a working query into
 *  the wrong product's schema. The inverse is just as bad: a Defender
 *  DeviceProcessEvents query looks valid while being unusable in a Sentinel
 *  tenant without the MDE connector.
 *
 *  The product was never missing data. `siem_platforms` already stores
 *  'Microsoft Sentinel' and 'Microsoft Defender XDR' as distinct values; only
 *  the resolution step threw the distinction away. This keeps it. */
export interface ResearchQueryTarget {
  language: ResearchQueryLanguage;
  /** The SIEM platform string from the environment profile, e.g.
   *  'Microsoft Sentinel'. Null when no configured SIEM matched and the
   *  language fell back to Sigma — Sigma is product-agnostic by design, and
   *  claiming a product there would be inventing one. */
  product: string | null;
}

export function resolveQueryTarget(
  envProfile: { siem_platforms?: string[] } | null | undefined,
): ResearchQueryTarget {
  const siems = envProfile?.siem_platforms ?? [];
  for (const siem of siems) {
    const langs = SIEM_TO_QUERY_LANGUAGES[siem];
    if (langs && langs.length > 0) return { language: langs[0], product: siem };
  }
  return { language: 'Sigma', product: null };
}

/** Products whose KQL can be checked against the Defender XDR schema table.
 *
 *  Deliberately a set of one. There is no Sentinel schema in this database, so
 *  a Sentinel query records validation as SKIPPED rather than being measured
 *  against tables it was never meant to use. An honest gap is worth more than
 *  a confident wrong answer — the wrong answer is what reached QA and got
 *  acted on. */
export const DEFENDER_SCHEMA_PRODUCTS: ReadonlySet<string> = new Set([
  'Microsoft Defender XDR',
]);

export function supportsDefenderSchemaValidation(product: string | null | undefined): boolean {
  return product != null && DEFENDER_SCHEMA_PRODUCTS.has(product);
}
