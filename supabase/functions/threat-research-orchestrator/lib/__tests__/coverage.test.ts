import { describe, it, expect } from 'vitest';
import { COVERAGE_STATUSES, hasMitreOverlap, isDeployedCoverage, isLanguageRunnable, adjudicateReuse } from '../coverage';

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

describe('hasMitreOverlap', () => {
  it('accepts an exact technique overlap case-insensitively', () => {
    expect(hasMitreOverlap(['T1218.015'], ['t1218.015', 'T1059'])).toBe(true);
  });

  it('rejects the false-positive mappings observed in the live T1218.015 run', () => {
    expect(hasMitreOverlap(['T1218.015'], ['T1497'])).toBe(false);
    expect(hasMitreOverlap(['T1218.015'], ['T1574', 'T1574.001'])).toBe(false);
    expect(hasMitreOverlap(['T1218.015'], ['T1190', 'T1059.004'])).toBe(false);
  });

  it('rejects an unmapped library rule when the opportunity is mapped', () => {
    expect(hasMitreOverlap(['T1218.015'], [])).toBe(false);
  });

  it('preserves score-only matching for an unmapped legacy opportunity', () => {
    expect(hasMitreOverlap([], ['T1497'])).toBe(true);
    expect(hasMitreOverlap(undefined, undefined)).toBe(true);
  });
});

describe('feasibility labelling (what handleDetection does with these now)', () => {
  // These helpers no longer GATE reuse. handleDetection reuses any library
  // match; status and language only decide how the reused leaf is LABELLED:
  //   feasibility = deployed && runnable ? 'covered' : 'partial'
  // Reuse itself is unconditional — see Amendment 1 in
  // docs/plans/2026-07-28-threat-research-remediation-plan.md.
  const feasibility = (m: { status: string; query_language: string }, target: string) =>
    isDeployedCoverage(m) && isLanguageRunnable(m, target) ? 'covered' : 'partial';

  it("labels a deployed, runnable rule 'covered'", () => {
    expect(feasibility({ status: 'Production', query_language: 'KQL' }, 'KQL')).toBe('covered');
  });

  it("labels a Production rule in another language 'partial' — still reused", () => {
    expect(feasibility({ status: 'Production', query_language: 'SPL' }, 'KQL')).toBe('partial');
  });

  it("labels a Draft rule in the right language 'partial' — still reused", () => {
    expect(feasibility({ status: 'Draft', query_language: 'KQL' }, 'KQL')).toBe('partial');
  });

  it("labels an undeployed rule in another language 'partial' — still reused", () => {
    expect(feasibility({ status: 'Draft', query_language: 'SPL' }, 'KQL')).toBe('partial');
  });
});

// ---------------------------------------------------------------------------
// adjudicateReuse
// ---------------------------------------------------------------------------

describe('adjudicateReuse', () => {
  const KQL_PRODUCTION = {
    status: 'Production',
    query_language: 'KQL',
    detection_query: 'DeviceProcessEvents | where FileName =~ "adfind.exe"',
    mitre_technique_ids: ['T1018'],
  };

  it('reuses a rule only when every condition holds', () => {
    const a = adjudicateReuse({
      opportunityMitreIds: ['T1018'],
      match: KQL_PRODUCTION,
      targetLanguage: 'KQL',
      // Same telemetry as the rule -- without this the observable condition
      // fails and generation correctly proceeds.
      opportunityObservableChain: ['adfind.exe enumerating the domain'],
      opportunityTelemetry: ['DeviceProcessEvents'],
    });
    expect(a.suppressGeneration).toBe(true);
    expect(a.skippedReason).toBeNull();
  });

  it('generates when the rule watches DIFFERENT telemetry', () => {
    // The T1218.005 failure generalised: a rule can be about the right
    // technique, deployed, and runnable here, and still cover a different
    // detection surface. MITRE overlap cannot see that.
    const a = adjudicateReuse({
      opportunityMitreIds: ['T1018'],
      match: KQL_PRODUCTION,
      targetLanguage: 'KQL',
      opportunityObservableChain: ['LDAP query volume from a single host'],
      opportunityTelemetry: ['DeviceNetworkEvents'],
    });
    expect(a.suppressGeneration).toBe(false);
    expect(a.showAsRelatedCoverage).toBe(true);
    expect(a.skippedReason).toBe('different_observables');
  });

  it('declines the short-circuit when the opportunity declares no surface', () => {
    // Costs one generation; the opposite default costs a missed detection.
    const a = adjudicateReuse({
      opportunityMitreIds: ['T1018'],
      match: KQL_PRODUCTION,
      targetLanguage: 'KQL',
    });
    expect(a.suppressGeneration).toBe(false);
    expect(a.reasons.observableOverlap).toBe(false);
  });

  it('generates the gap AND shows a Draft rule as related coverage', () => {
    // Previously any MITRE-overlapping hit suppressed generation outright, so
    // 048fdd12 spent 165K tokens returning six existing rules. The user asked
    // for detections and got a search result.
    const a = adjudicateReuse({
      opportunityMitreIds: ['T1018'],
      match: { ...KQL_PRODUCTION, status: 'Draft' },
      targetLanguage: 'KQL',
    });
    expect(a.suppressGeneration).toBe(false);
    expect(a.showAsRelatedCoverage).toBe(true);
    expect(a.skippedReason).toBe('not_deployed');
  });

  it('generates when the rule is in another SIEM language', () => {
    const a = adjudicateReuse({
      opportunityMitreIds: ['T1018'],
      match: { ...KQL_PRODUCTION, query_language: 'SPL' },
      targetLanguage: 'KQL',
    });
    expect(a.suppressGeneration).toBe(false);
    expect(a.showAsRelatedCoverage).toBe(true);
    expect(a.skippedReason).toBe('language_mismatch');
  });

  it('refuses to treat a rule with no query body as coverage', () => {
    // A title is not a detection. Reusing one hands the user a claim the
    // system cannot substantiate.
    const a = adjudicateReuse({
      opportunityMitreIds: ['T1018'],
      match: { ...KQL_PRODUCTION, detection_query: '   ' },
      targetLanguage: 'KQL',
    });
    expect(a.suppressGeneration).toBe(false);
    expect(a.skippedReason).toBe('no_query_body');
  });

  it('does not surface a technique mismatch as related coverage', () => {
    // The live T1218.015 run reused T1497, T1574.001 and T1190 rules on
    // similarity alone. Those are bad search hits, not related coverage --
    // showing them would train the user to ignore the panel.
    const a = adjudicateReuse({
      opportunityMitreIds: ['T1218.015'],
      match: { ...KQL_PRODUCTION, mitre_technique_ids: ['T1497'] },
      targetLanguage: 'KQL',
    });
    expect(a.suppressGeneration).toBe(false);
    expect(a.showAsRelatedCoverage).toBe(false);
    expect(a.skippedReason).toBe('technique_mismatch');
  });

  it('nothing to adjudicate when there was no match', () => {
    const a = adjudicateReuse({ opportunityMitreIds: ['T1018'], match: null, targetLanguage: 'KQL' });
    expect(a.suppressGeneration).toBe(false);
    expect(a.showAsRelatedCoverage).toBe(false);
    expect(a.skippedReason).toBeNull();
  });

  it('reports every condition so the trail can name the one that failed', () => {
    const a = adjudicateReuse({
      opportunityMitreIds: ['T1018'],
      match: { ...KQL_PRODUCTION, status: 'Deprecated', query_language: 'SPL' },
      targetLanguage: 'KQL',
    });
    expect(a.reasons).toEqual({
      mitreOverlap: true,
      runnableQuery: true,
      compatibleLanguage: false,
      deployedStatus: false,
      observableOverlap: false,
    });
    // Language wins the report: it is the more actionable of the two.
    expect(a.skippedReason).toBe('language_mismatch');
  });
});
