import { describe, it, expect } from 'vitest';
import {
  SIEM_TO_QUERY_LANGUAGES, SUPPORTED_SIEM_PLATFORMS, isSupportedSiem, resolveQueryLanguage,
} from '../query-language';

describe('resolveQueryLanguage', () => {
  it('resolves the first configured SIEM that maps to a language', () => {
    expect(resolveQueryLanguage({ siem_platforms: ['Microsoft Sentinel'] })).toBe('KQL');
    expect(resolveQueryLanguage({ siem_platforms: ['Splunk', 'Microsoft Sentinel'] })).toBe('SPL');
  });

  it('skips unrecognised platforms rather than failing', () => {
    expect(resolveQueryLanguage({ siem_platforms: ['Homegrown Thing', 'Splunk'] })).toBe('SPL');
  });

  it('falls back to Sigma with no profile — the behaviour the picker exists to make visible', () => {
    // This fallback is correct as a last resort but was silent: a first-time
    // user with no environment profile got Sigma without ever being asked.
    // The New Research modal now requires a choice in exactly this case.
    expect(resolveQueryLanguage(null)).toBe('Sigma');
    expect(resolveQueryLanguage(undefined)).toBe('Sigma');
    expect(resolveQueryLanguage({})).toBe('Sigma');
    expect(resolveQueryLanguage({ siem_platforms: [] })).toBe('Sigma');
  });

  it('honours a snapshot whose chosen platform was ordered first', () => {
    // How the picker takes effect: the entry point writes the chosen platform
    // first into environment_snapshot.siem_platforms at insert time.
    expect(resolveQueryLanguage({
      siem_platforms: ['CrowdStrike Falcon', 'Splunk'],
    })).toBe('CQL');
  });
});

describe('isSupportedSiem / SUPPORTED_SIEM_PLATFORMS', () => {
  it('accepts every platform the language map knows', () => {
    for (const platform of SUPPORTED_SIEM_PLATFORMS) {
      expect(isSupportedSiem(platform)).toBe(true);
      expect(resolveQueryLanguage({ siem_platforms: [platform] })).not.toBe('Sigma');
    }
  });

  it('rejects unknown platforms and prototype keys', () => {
    expect(isSupportedSiem('QRadar')).toBe(false);
    expect(isSupportedSiem('')).toBe(false);
    // hasOwnProperty, not `in` — a bare `in` check would accept these.
    expect(isSupportedSiem('constructor')).toBe(false);
    expect(isSupportedSiem('toString')).toBe(false);
  });

  it('stays in sync with the language map it validates against', () => {
    expect([...SUPPORTED_SIEM_PLATFORMS].sort())
      .toEqual(Object.keys(SIEM_TO_QUERY_LANGUAGES).sort());
  });
});
