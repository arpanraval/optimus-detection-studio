import { QUERY_LANGUAGES } from '../constants';

/**
 * Canonical query-language vocabulary and the single place inbound values are mapped onto it.
 *
 * `detections.queryLanguage` is a free-text column with several writers, and the ones that are
 * not the authoring form have each written their own dialect into it: the AI query generator
 * wrote its syntax-highlighter slug (`yara`, `crowdstrike`), the threat-intel extractor wrote
 * display labels, and the bulk importer passes the source file's own string through untouched
 * (`Splunk (SPL)`). Consumers then grew private workarounds — `BulkDeployModal` upper-cases
 * before comparing, `useProfileIntelligence` carries a `['SPL', 'Splunk (SPL)']` alias list —
 * and the library filter simply could not find the rules at all.
 *
 * Normalizing at the write boundary replaces all of that with one vocabulary.
 */

export type CanonicalQueryLanguage = typeof QUERY_LANGUAGES[number];

const CANONICAL_BY_LOWER = new Map<string, CanonicalQueryLanguage>(
  QUERY_LANGUAGES.map(language => [language.toLowerCase(), language])
);

/**
 * Exact aliases only — keyed by the lowercased inbound string.
 *
 * IMPORTANT: matching here is exact, never by prefix or substring, because `YARA` and `YARA-L`
 * are different languages that merely share a name. `YARA` is the generic VirusTotal / on-disk
 * file-scanning format; `YARA-L` is Google SecOps' detection language and is the only one any
 * SIEM here accepts (`PROVIDER_QUERY_LANGUAGES.chronicle`). A `startsWith('YARA')` style rule
 * would silently fold every Chronicle rule into an undeployable format, and nothing would
 * notice until someone tried to push to Google SecOps.
 */
const ALIASES: Record<string, CanonicalQueryLanguage> = {
  'sentinelone': 'S1QL 2.0',
  'sentinelone-s1ql': 'S1QL',
  'sentinelone-s1ql2': 'S1QL 2.0',
  'sentinelone-powerquery': 'PowerQuery',
  'sentinelone s1ql': 'S1QL 2.0',
  'sentinel one': 'S1QL 2.0',
  's1ql 2': 'S1QL 2.0',
  's1ql v2': 'S1QL 2.0',
  's1ql2': 'S1QL 2.0',
  's1ql v1': 'S1QL',
  's1ql 1.0': 'S1QL',
  'sentinelone s1ql 2.0': 'S1QL 2.0',
  'sentinelone powerquery': 'PowerQuery',
  'kql-sentinel': 'KQL',
  'kql-defender': 'KQL',
  // Splunk — importers pass the source file's display label straight through
  'splunk': 'SPL',
  'splunk (spl)': 'SPL',
  'splunk spl': 'SPL',
  'splunk search': 'SPL',
  'spl2': 'SPL',

  // Google SecOps. Deliberately adjacent to, and never merged with, plain YARA below.
  'yaral': 'YARA-L',
  'yara l': 'YARA-L',
  'yara-l2': 'YARA-L',
  'chronicle': 'YARA-L',
  'google secops': 'YARA-L',

  // Generic YARA: on-disk and VirusTotal scanning, not a SIEM query language.
  'yara rules': 'YARA',

  // CrowdStrike LogScale — the AI generator wrote its highlighter slug
  'crowdstrike': 'CQL',
  'crowdstrike logscale': 'CQL',
  'logscale': 'CQL',
  'humio': 'CQL',

  // Microsoft — a Sentinel/Defender rule is a KQL detection; the product is not the language
  'kusto': 'KQL',
  'sentinel': 'KQL',
  'microsoft sentinel': 'KQL',
  'defender': 'KQL',
  'defender xdr': 'KQL',

  // Elastic
  'es|ql': 'ESQL',
  'es ql': 'ESQL',
  'elasticsearch dsl': 'Elasticsearch DSL',
  'es dsl': 'Elasticsearch DSL',
  'elasticsearch': 'Elasticsearch DSL',

  // Misc vendors
  'carbonblack': 'Carbon Black',
  'carbon_black': 'Carbon Black',
};

/** Whether a value is already part of the canonical vocabulary, exactly as written. */
export function isCanonicalQueryLanguage(value: string | null | undefined): value is CanonicalQueryLanguage {
  return !!value && (QUERY_LANGUAGES as readonly string[]).includes(value);
}

/**
 * Map an inbound query-language string onto the canonical vocabulary.
 * Returns `null` when the value is genuinely not one of this app's query languages —
 * `Snort`, `Suricata`, `XQL`, `Other` and `Unknown` all reach here and are left alone rather
 * than being forced into the nearest canonical entry.
 */
export function normalizeQueryLanguage(raw: string | null | undefined): CanonicalQueryLanguage | null {
  if (!raw) return null;
  const key = raw.trim().toLowerCase();
  if (!key) return null;
  return CANONICAL_BY_LOWER.get(key) ?? ALIASES[key] ?? null;
}

/**
 * Normalize for storage, keeping the original when it is not recognised.
 *
 * Unrecognised values are preserved rather than dropped or coerced: losing what a rule was
 * written in is worse than storing something outside the vocabulary, and the library filter
 * derives its options from the data, so anything unusual still shows up and stays findable.
 */
export function normalizeQueryLanguageForStorage(raw: string | null | undefined): string {
  if (!raw) return '';
  return normalizeQueryLanguage(raw) ?? raw.trim();
}
