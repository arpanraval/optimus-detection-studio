import { describe, it, expect } from 'vitest';
import { dbRecordToSession, dbRecordToSummary, sessionToDbRecord, type ThreatIntelReportDbRecord } from '../ThreatIntelContext';

/**
 * Guard for the database -> report mapper.
 *
 * dbRecordToSession is hand-written field by field. Five trust fields
 * (outcome, source_quality, quality_warnings, possible_actor_mentions and the
 * overlap percentages) were absent from it AND from its input interface, so
 * they were fetched from the database by `select('*')` and then dropped on the
 * floor with no type error. The visible result was that `report.outcome` was
 * undefined on all 170 reports, `undefined !== 'complete'` held, and every
 * single report rendered "Analysis requires review - degraded".
 *
 * Requiring outcome/sourceQuality on ThreatReport makes omitting *those two* a
 * build failure. This test covers the rest: it asserts that a fully-populated
 * row survives the mapping intact. Add a column to the table, add it here.
 */

/** A row with every field populated and distinguishable from its neighbours. */
function fullRecord(): ThreatIntelReportDbRecord {
  return {
    id: 'rep-1',
    user_id: 'user-1',
    name: 'Test report',
    created_at: '2026-08-06T00:00:00Z',
    updated_at: '2026-08-06T01:00:00Z',
    source_type: 'url',
    source_url: 'https://example.test/article',
    raw_content_preview: 'preview text',
    summary: { title: 'Test report' },
    classification: { primaryType: 'Supply Chain' },
    ttps: [{ mitreId: 'T1059.001' }],
    iocs: [{ value: 'evil.test', type: 'domain' }],
    rules: [{ type: 'sigma', content: 'title: x' }],
    mitre_mapping: { matchedGroups: [] },
    library_matches: [{ detectionId: 'det-1' }],
    processing_stage: 'complete',
    processing_error: undefined,
    section_errors: { evidence: 'evidence extraction failed' },
    outcome: 'partial',
    source_quality: 'feed_summary',
    source_content_length: 1234,
    source_content_hash: 'abc123',
    fetched_url: 'https://example.test/article?utm=1',
    quality_warnings: ['content was truncated'],
    possible_actor_mentions: ['Scattered Spider'],
    library_overlap_percent: 42,
    validated_overlap_percent: 17,
    deployment_readiness_percent: 5,
    selected_ttp_ids: ['T1059.001'],
    selected_ioc_ids: ['ioc-1'],
    coverage_percent: 42,
    source: 'auto',
    source_feed_name: 'Test Feed',
    source_article_url: 'https://example.test/article',
    feasible_gap_count: 3,
    infeasible_gap_count: 1,
    ttp_count: 1,
    ioc_count: 1,
    rule_count: 1,
  };
}

describe('dbRecordToSession', () => {
  it('carries trust metadata through to the report', () => {
    const { report } = dbRecordToSession(fullRecord());

    // The five fields that were silently dropped.
    expect(report.outcome).toBe('partial');
    expect(report.sourceQuality).toBe('feed_summary');
    expect(report.qualityWarnings).toEqual(['content was truncated']);
    expect(report.possibleActorMentions).toEqual(['Scattered Spider']);
    expect(report.sectionErrors).toEqual({ evidence: 'evidence extraction failed' });

    // Provenance and the overlap figures, dropped by the same omission.
    expect(report.sourceContentLength).toBe(1234);
    expect(report.sourceContentHash).toBe('abc123');
    expect(report.fetchedUrl).toBe('https://example.test/article?utm=1');
    expect(report.libraryOverlapPercent).toBe(42);
    expect(report.validatedOverlapPercent).toBe(17);
    expect(report.deploymentReadinessPercent).toBe(5);
  });

  it('marks a complete run as complete rather than degraded', () => {
    const record = { ...fullRecord(), outcome: 'complete' as const, source_quality: 'full_article' as const };
    const { report } = dbRecordToSession(record);

    // The banner renders on `outcome !== 'complete'`. Before the fix this was
    // undefined for every report, so the warning was permanently on.
    expect(report.outcome).toBe('complete');
    expect(report.sourceQuality).toBe('full_article');
  });

  it('reports an absent outcome as unknown, never as degraded or complete', () => {
    const record = { ...fullRecord() };
    delete record.outcome;
    delete record.source_quality;

    const { report } = dbRecordToSession(record);

    // "We do not know" must stay distinguishable from "we know it went badly"
    // and from "it succeeded". Defaulting either way is what caused the bug.
    expect(report.outcome).toBe('unknown');
    expect(report.sourceQuality).toBe('unknown');
  });

  it('keeps absent coverage distinct from zero coverage', () => {
    const absent = { ...fullRecord() };
    delete absent.coverage_percent;
    expect(dbRecordToSession(absent).report.coveragePercent).toBeNull();

    const zero = { ...fullRecord(), coverage_percent: 0 };
    expect(dbRecordToSession(zero).report.coveragePercent).toBe(0);
  });

  it('still carries the extracted content', () => {
    const { report } = dbRecordToSession(fullRecord());
    expect(report.ttps).toHaveLength(1);
    expect(report.iocs).toHaveLength(1);
    expect(report.rules).toHaveLength(1);
    expect(report.libraryMatches).toHaveLength(1);
  });
});

/**
 * Guard for the report -> database mapper.
 *
 * A successful Re-extract saves through this path. It wrote section_errors but
 * not `outcome`, so a retry refreshed the list of what failed while leaving the
 * verdict describing the previous run. The banner reads both fields, so the
 * stored row contradicted itself.
 */
describe('sessionToDbRecord', () => {
  const session = () => {
    const { report, ...rest } = dbRecordToSession(fullRecord());
    return { ...rest, report };
  };

  it('writes the trust metadata alongside the section errors it belongs to', () => {
    const record = sessionToDbRecord(session(), 'user-1');

    expect(record.outcome).toBe('partial');
    expect(record.source_quality).toBe('feed_summary');
    expect(record.quality_warnings).toEqual(['content was truncated']);
    expect(record.possible_actor_mentions).toEqual(['Scattered Spider']);
    expect(record.section_errors).toEqual({ evidence: 'evidence extraction failed' });
    expect(record.source_content_length).toBe(1234);
    expect(record.source_content_hash).toBe('abc123');
    expect(record.fetched_url).toBe('https://example.test/article?utm=1');
  });

  it('survives a round trip without changing the verdict', () => {
    const record = sessionToDbRecord(session(), 'user-1');

    expect(record.outcome).toBe(fullRecord().outcome);
    expect(record.source_quality).toBe(fullRecord().source_quality);
  });

  // 'unknown' is a read-side sentinel for "the row did not tell us". Writing it
  // back would invent a value the column has never held and would overwrite
  // whatever the server did know. Omitting the key leaves the stored value be.
  it('never persists the unknown sentinel', () => {
    const record = fullRecord();
    delete record.outcome;
    delete record.source_quality;

    const { report, ...rest } = dbRecordToSession(record);
    expect(report.outcome).toBe('unknown');

    const written = sessionToDbRecord({ ...rest, report }, 'user-1');
    expect(written.outcome).toBeUndefined();
    expect(written.source_quality).toBeUndefined();
    expect('outcome' in written ? written.outcome : undefined).toBeUndefined();
  });

  // This mapper used to recompute coverage from `hasExistingDetection` over
  // every TTP and upsert the result -- a fourth formula, and the only one that
  // writes. The server can now report "coverage could not be assessed" (no
  // detection passes the eligibility gate), and a save that recomputed would
  // immediately overwrite that null with a number of its own.
  it('persists the server verdict on coverage rather than recomputing one', () => {
    const { report, ...rest } = dbRecordToSession(fullRecord());
    const covered = {
      ...report,
      coveragePercent: 42,
      ttps: [{ mitreId: 'T1059', hasExistingDetection: true }, { mitreId: 'T1027' }],
    } as typeof report;

    expect(sessionToDbRecord({ ...rest, report: covered }, 'user-1').coverage_percent).toBe(42);
  });

  // Absent must stay distinguishable from zero (constraint 5). Writing 0 here
  // turns "could not be assessed" into "assessed as none" the moment a report
  // is opened and saved.
  it('writes an unassessed coverage as null, not zero', () => {
    const { report, ...rest } = dbRecordToSession(fullRecord());
    const unassessed = {
      ...report,
      coveragePercent: null,
      ttps: [{ mitreId: 'T1059', hasExistingDetection: true }],
    } as typeof report;

    expect(sessionToDbRecord({ ...rest, report: unassessed }, 'user-1').coverage_percent).toBeNull();
  });

  // Feasibility is the orchestrator's to compute. The digest clears it when a
  // retry replaces the TTP set; that clearing only reaches the row if this
  // mapper writes it.
  it('persists a cleared feasibility so stale counts cannot survive', () => {
    const { report, ...rest } = dbRecordToSession(fullRecord());
    const cleared = { ...report, feasibleGapCount: null, infeasibleGapCount: null } as typeof report;

    const written = sessionToDbRecord({ ...rest, report: cleared }, 'user-1');
    expect(written.feasible_gap_count).toBeNull();
    expect(written.infeasible_gap_count).toBeNull();
  });

  // ...but a session that never carried the field must not blank a row the
  // orchestrator populated.
  it('leaves feasibility untouched when the report does not carry it', () => {
    const { report, ...rest } = dbRecordToSession(fullRecord());
    const { feasibleGapCount: _f, infeasibleGapCount: _i, ...withoutFeasibility } = report as any;

    const written = sessionToDbRecord({ ...rest, report: withoutFeasibility }, 'user-1');
    expect('feasible_gap_count' in written).toBe(false);
    expect('infeasible_gap_count' in written).toBe(false);
  });
});

// A2's list path. dbRecordToSession preserved absence; its list-path twin
// coerced it to 0, so a report the server declined to score read "Unknown" on
// its own page and a percentage in the library. The type was the blocker.
describe('dbRecordToSummary', () => {
  it('preserves an unassessed coverage as null rather than zero', () => {
    const record = fullRecord();
    delete record.coverage_percent;

    expect(dbRecordToSummary(record).coveragePercent).toBeNull();
  });

  it('keeps a genuine zero distinguishable from absence', () => {
    expect(dbRecordToSummary({ ...fullRecord(), coverage_percent: 0 }).coveragePercent).toBe(0);
  });

  it('carries a real percentage through unchanged', () => {
    expect(dbRecordToSummary({ ...fullRecord(), coverage_percent: 42 }).coveragePercent).toBe(42);
  });

  // The two mappers must agree; they are the same question asked from two
  // pages, and every defect in this area has been them answering differently.
  it('agrees with dbRecordToSession on absence', () => {
    const record = fullRecord();
    delete record.coverage_percent;

    expect(dbRecordToSummary(record).coveragePercent)
      .toBe(dbRecordToSession(record).report.coveragePercent);
  });
});
