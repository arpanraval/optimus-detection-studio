import { describe, it, expect } from 'vitest';
import { dbRecordToSession, type ThreatIntelReportDbRecord } from '../ThreatIntelContext';

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
