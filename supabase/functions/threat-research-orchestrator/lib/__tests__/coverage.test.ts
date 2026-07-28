import { describe, it, expect } from 'vitest';
import { COVERAGE_STATUSES, isDeployedCoverage, isLanguageRunnable } from '../coverage';

describe('isDeployedCoverage', () => {
  it('counts a Production rule as coverage', () => {
    expect(isDeployedCoverage({ status: 'Production' })).toBe(true);
  });

  it('does NOT count a Draft rule as coverage', () => {
    // The bug this guards: handleLibrarySearch passes no p_status, so a Draft
    // rule could clear the match threshold and suppress generation entirely.
    // The user then saw feasibility:'covered' for a rule that detects nothing.
    expect(isDeployedCoverage({ status: 'Draft' })).toBe(false);
  });

  it('does NOT count a Deprecated rule as coverage', () => {
    expect(isDeployedCoverage({ status: 'Deprecated' })).toBe(false);
  });

  it('matches case-insensitively — imported libraries use lowercase', () => {
    expect(isDeployedCoverage({ status: 'production' })).toBe(true);
    expect(isDeployedCoverage({ status: 'PRODUCTION' })).toBe(true);
  });

  it('treats an unknown or missing status as NOT coverage', () => {
    // Fail open to generating a detection rather than claim coverage we
    // cannot prove.
    expect(isDeployedCoverage({ status: '' })).toBe(false);
    expect(isDeployedCoverage({ status: null })).toBe(false);
    expect(isDeployedCoverage({})).toBe(false);
    expect(isDeployedCoverage(null)).toBe(false);
    expect(isDeployedCoverage(undefined)).toBe(false);
  });

  it('exposes the status allowlist so callers can render it', () => {
    expect([...COVERAGE_STATUSES]).toEqual(['Production']);
  });
});

describe('isLanguageRunnable', () => {
  it('accepts a match in the session language, case-insensitively', () => {
    expect(isLanguageRunnable({ query_language: 'KQL' }, 'KQL')).toBe(true);
    expect(isLanguageRunnable({ query_language: 'kql' }, 'KQL')).toBe(true);
  });

  it('rejects a match written for a different SIEM', () => {
    expect(isLanguageRunnable({ query_language: 'SPL' }, 'KQL')).toBe(false);
  });

  it('rejects a match whose language could not be determined', () => {
    // Conservative: fall through to generation rather than veto on low
    // confidence.
    expect(isLanguageRunnable({ query_language: '' }, 'KQL')).toBe(false);
    expect(isLanguageRunnable({}, 'KQL')).toBe(false);
  });

  it('accepts any match when the session has no resolved language', () => {
    // Better than failing closed when we do not know what the user runs.
    expect(isLanguageRunnable({ query_language: 'SPL' }, '')).toBe(true);
    expect(isLanguageRunnable({ query_language: 'SPL' }, null)).toBe(true);
  });

  it('rejects a null match', () => {
    expect(isLanguageRunnable(null, 'KQL')).toBe(false);
  });
});

describe('coverage gate composition (what handleDetection does)', () => {
  const suppresses = (m: { status: string; query_language: string }, target: string) =>
    isLanguageRunnable(m, target) && isDeployedCoverage(m);

  it('suppresses generation only when deployed AND runnable', () => {
    expect(suppresses({ status: 'Production', query_language: 'KQL' }, 'KQL')).toBe(true);
  });

  it('generates anyway for a Production rule in the wrong language', () => {
    expect(suppresses({ status: 'Production', query_language: 'SPL' }, 'KQL')).toBe(false);
  });

  it('generates anyway for a Draft rule in the right language', () => {
    expect(suppresses({ status: 'Draft', query_language: 'KQL' }, 'KQL')).toBe(false);
  });

  it('generates anyway when both gates fail', () => {
    expect(suppresses({ status: 'Draft', query_language: 'SPL' }, 'KQL')).toBe(false);
  });
});
