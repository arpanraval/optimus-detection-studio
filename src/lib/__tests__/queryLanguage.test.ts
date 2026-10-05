import { describe, it, expect } from 'vitest';
import {
  isCanonicalQueryLanguage,
  normalizeQueryLanguage,
  normalizeQueryLanguageForStorage,
} from '../queryLanguage';
import { QUERY_LANGUAGES } from '../../constants';

describe('YARA and YARA-L stay separate', () => {
  // These are different languages that merely share a name. YARA is the generic VirusTotal /
  // on-disk file-scanning format; YARA-L is Google SecOps' detection language and the only one
  // any configured SIEM accepts. Folding one into the other would make 350+ Chronicle rules
  // undeployable, and nothing would surface it until someone pushed to Google SecOps.
  it('never turns a YARA-L value into YARA', () => {
    for (const value of ['YARA-L', 'yara-l', 'YARA-l', 'yaral', 'YARAL', 'yara l', 'chronicle']) {
      expect(normalizeQueryLanguage(value)).toBe('YARA-L');
    }
  });

  it('never turns a YARA value into YARA-L', () => {
    for (const value of ['YARA', 'yara', 'Yara', 'yara rules']) {
      expect(normalizeQueryLanguage(value)).toBe('YARA');
    }
  });

  it('matches exactly, so no prefix rule can merge the two', () => {
    // A `startsWith('YARA')` implementation would pass the cases above and fail here.
    expect(normalizeQueryLanguage('YARA-LANG')).toBeNull();
    expect(normalizeQueryLanguage('YARAX')).toBeNull();
  });
});

describe('normalizeQueryLanguage', () => {
  it('accepts every canonical value unchanged', () => {
    for (const language of QUERY_LANGUAGES) {
      expect(normalizeQueryLanguage(language)).toBe(language);
    }
  });

  it('is case-insensitive', () => {
    expect(normalizeQueryLanguage('kql')).toBe('KQL');
    expect(normalizeQueryLanguage('sigma')).toBe('Sigma');
    expect(normalizeQueryLanguage('LUCENE')).toBe('Lucene');
  });

  it('maps the values found in the library', () => {
    // Each of these was actually stored, and none of them could be filtered for.
    expect(normalizeQueryLanguage('Splunk (SPL)')).toBe('SPL');   // bulk importer passthrough
    expect(normalizeQueryLanguage('crowdstrike')).toBe('CQL');    // AI generator highlighter slug
    expect(normalizeQueryLanguage('yara')).toBe('YARA');          // AI generator highlighter slug
  });

  it('treats a vendor product name as its query language', () => {
    expect(normalizeQueryLanguage('sentinel')).toBe('KQL');
    expect(normalizeQueryLanguage('logscale')).toBe('CQL');
  });

  it('tolerates surrounding whitespace', () => {
    expect(normalizeQueryLanguage('  Splunk (SPL) ')).toBe('SPL');
  });

  it('returns null for things that are not this app\'s query languages', () => {
    // The threat-intel extractor can emit these; coercing them to a nearby language would be
    // a lie about what the rule is written in.
    for (const value of ['Snort', 'Suricata', 'XQL', 'Other', 'Unknown', '', null, undefined]) {
      expect(normalizeQueryLanguage(value)).toBeNull();
    }
  });
});

describe('normalizeQueryLanguageForStorage', () => {
  it('canonicalises what it recognises', () => {
    expect(normalizeQueryLanguageForStorage('Splunk (SPL)')).toBe('SPL');
  });

  it('keeps an unrecognised value rather than dropping it', () => {
    // Losing what a rule was written in is worse than storing something off-vocabulary; the
    // filter derives its options from the data, so it stays findable either way.
    expect(normalizeQueryLanguageForStorage('Snort')).toBe('Snort');
    expect(normalizeQueryLanguageForStorage('  Suricata  ')).toBe('Suricata');
  });

  it('returns an empty string for no value', () => {
    expect(normalizeQueryLanguageForStorage(null)).toBe('');
    expect(normalizeQueryLanguageForStorage(undefined)).toBe('');
  });
});

describe('isCanonicalQueryLanguage', () => {
  it('is exact, not case-insensitive', () => {
    expect(isCanonicalQueryLanguage('YARA-L')).toBe(true);
    expect(isCanonicalQueryLanguage('yara')).toBe(false);
    expect(isCanonicalQueryLanguage('Splunk (SPL)')).toBe(false);
    expect(isCanonicalQueryLanguage(null)).toBe(false);
  });
});
