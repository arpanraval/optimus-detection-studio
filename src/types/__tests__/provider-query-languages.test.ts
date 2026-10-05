import { describe, it, expect } from 'vitest';
import { PROVIDER_QUERY_LANGUAGES } from '../integration';
import { QUERY_LANGUAGES } from '../../constants';
import { isCanonicalQueryLanguage } from '../../lib/queryLanguage';

/**
 * PROVIDER_QUERY_LANGUAGES decides which detections a SIEM will accept, by comparing its entries
 * against `detection.queryLanguage`. Any entry that is not itself a canonical query language can
 * never match a stored rule, so that provider silently accepts nothing in that language.
 *
 * Elastic listed 'ES|QL' — the product's display name — while rules are stored as 'ESQL' and
 * `siem_rule_bindings.query_language` only accepts 'ESQL'. The result was a language that looked
 * supported, matched no rule, and could not have been bound even if it had.
 */
describe('PROVIDER_QUERY_LANGUAGES', () => {
  it('only names languages from the canonical vocabulary', () => {
    const offenders: string[] = [];
    for (const [provider, languages] of Object.entries(PROVIDER_QUERY_LANGUAGES)) {
      for (const language of languages) {
        if (!isCanonicalQueryLanguage(language)) offenders.push(`${provider}: ${language}`);
      }
    }
    expect(offenders).toEqual([]);
  });

  it('lists Elastic with the stored spelling, not the product name', () => {
    expect(PROVIDER_QUERY_LANGUAGES.elastic).toContain('ESQL');
    expect(PROVIDER_QUERY_LANGUAGES.elastic).not.toContain('ES|QL');
  });

  it('gives Google SecOps YARA-L and never plain YARA', () => {
    // Generic YARA is an on-disk / VirusTotal scanning format, not a SIEM query language,
    // so no provider should ever claim to accept it.
    expect(PROVIDER_QUERY_LANGUAGES.chronicle).toEqual(['YARA-L']);
    for (const languages of Object.values(PROVIDER_QUERY_LANGUAGES)) {
      expect(languages).not.toContain('YARA');
    }
  });

  it('every provider offers at least one language', () => {
    for (const [provider, languages] of Object.entries(PROVIDER_QUERY_LANGUAGES)) {
      expect(languages.length, provider).toBeGreaterThan(0);
    }
  });

  it('QUERY_LANGUAGES has no duplicate or case-colliding entries', () => {
    // Two entries differing only by case would make normalization ambiguous.
    const lowered = QUERY_LANGUAGES.map(l => l.toLowerCase());
    expect(new Set(lowered).size).toBe(QUERY_LANGUAGES.length);
  });
});
