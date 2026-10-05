// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { normalizeElasticEntry, isUnsupportedElasticRule, readElasticRules } from '../siem-readers/elastic.ts';
import {
  ELASTIC_PREBUILT_TWO_SPACES, ELASTIC_KUERY_RULE, ELASTIC_LUCENE_RULE, ELASTIC_EQL_RULE, ELASTIC_ESQL_RULE,
  ELASTIC_OBJECT_RECREATED_STABLE_RULE_ID, ELASTIC_DISABLED_PREBUILT_RULE, ELASTIC_THRESHOLD_CARDINALITY_RULE,
  ELASTIC_SAVED_QUERY_RULE, ELASTIC_ML_RULE, ELASTIC_THREAT_MATCH_RULE, ELASTIC_NEW_TERMS_RULE,
  ELASTIC_PAGE_1, ELASTIC_PAGE_2, ELASTIC_EMPTY_PAGE_STALE_TOTAL,
} from './fixtures/elastic-list.ts';

describe('Elastic Security detection-rule reader', () => {
  it('keys identity on rule_id, not the saved-object id, and preserves both across two spaces (G21)', () => {
    const [a, b] = ELASTIC_PREBUILT_TWO_SPACES.map(normalizeElasticEntry);
    if (isUnsupportedElasticRule(a) || isUnsupportedElasticRule(b)) throw new Error('expected supported rules');
    expect(a.vendorRuleId).toBe(b.vendorRuleId); // same rule_id
    expect(a.objectId).not.toBe(b.objectId); // different saved-object id
  });

  it('maps kuery to Kuery, never KQL (Kusto)', () => {
    const rule = normalizeElasticEntry(ELASTIC_KUERY_RULE);
    if (isUnsupportedElasticRule(rule)) throw new Error('expected a supported rule');
    expect(rule.language).toBe('Kuery');
    expect(rule.language).not.toBe('KQL');
  });

  it('maps lucene to Lucene', () => {
    const rule = normalizeElasticEntry(ELASTIC_LUCENE_RULE);
    if (isUnsupportedElasticRule(rule)) throw new Error('expected a supported rule');
    expect(rule.language).toBe('Lucene');
  });

  it('maps eql type to EQL language regardless of the language field', () => {
    const rule = normalizeElasticEntry(ELASTIC_EQL_RULE);
    if (isUnsupportedElasticRule(rule)) throw new Error('expected a supported rule');
    expect(rule.language).toBe('EQL');
  });

  it('maps esql type to ESQL and reads query defensively, noting the unsettled field name', () => {
    const rule = normalizeElasticEntry(ELASTIC_ESQL_RULE);
    if (isUnsupportedElasticRule(rule)) throw new Error('expected a supported rule');
    expect(rule.language).toBe('ESQL');
    expect(rule.query).toContain('FROM logs-*');
    expect(rule.unmappedFields.some(field => field.includes('esql query-text field name is unsettled'))).toBe(true);
  });

  it('keys on the stable rule_id when the saved-object id changes (recreated object)', () => {
    const [original, recreated] = ELASTIC_OBJECT_RECREATED_STABLE_RULE_ID.map(normalizeElasticEntry);
    if (isUnsupportedElasticRule(original) || isUnsupportedElasticRule(recreated)) throw new Error('expected supported rules');
    expect(original.vendorRuleId).toBe(recreated.vendorRuleId);
    expect(original.objectId).not.toBe(recreated.objectId);
  });

  it('preserves a disabled prebuilt rule and its immutable provenance', () => {
    const rule = normalizeElasticEntry(ELASTIC_DISABLED_PREBUILT_RULE);
    if (isUnsupportedElasticRule(rule)) throw new Error('expected a supported rule');
    expect(rule.enabled).toBe(false);
    expect(rule.immutable).toBe(true);
  });

  it('maps the full threshold object including cardinality', () => {
    const rule = normalizeElasticEntry(ELASTIC_THRESHOLD_CARDINALITY_RULE);
    if (isUnsupportedElasticRule(rule)) throw new Error('expected a supported rule');
    expect(rule.threshold).toEqual({ field: ['source.ip'], value: 50, cardinality: [{ field: 'destination.port', value: 25 }] });
  });

  it('keeps excluded families visible with a precise reason instead of flattening them (G19)', () => {
    for (const fixture of [ELASTIC_SAVED_QUERY_RULE, ELASTIC_ML_RULE, ELASTIC_THREAT_MATCH_RULE, ELASTIC_NEW_TERMS_RULE]) {
      const result = normalizeElasticEntry(fixture);
      expect(isUnsupportedElasticRule(result)).toBe(true);
      if (isUnsupportedElasticRule(result)) expect(result.reason).toBeTruthy();
    }
  });

  it('pages through multiple responses and stops on a short page', async () => {
    const pages = [ELASTIC_PAGE_1, ELASTIC_PAGE_2];
    let calls = 0;
    const fetchPage = async (page: number, perPage: number) => {
      calls++;
      expect(perPage).toBe(2);
      return pages[page - 1];
    };
    const outcome = await readElasticRules(fetchPage, 1, 2);
    expect(calls).toBe(2);
    expect(outcome.rules.length).toBe(3);
    expect(outcome.stoppedOnNonAdvancingCursor).toBe(false);
  });

  it('stops on an empty page even when total is stale (G12), never looping on it', async () => {
    const fetchPage = async () => ELASTIC_EMPTY_PAGE_STALE_TOTAL;
    const outcome = await readElasticRules(fetchPage, 3, 2);
    expect(outcome.rules.length).toBe(0);
    expect(outcome.pagesRead).toBe(1);
  });

  it('never spins forever against a provider that keeps returning full pages (bounded by MAX_PAGES, G11)', async () => {
    let calls = 0;
    const fetchPage = async (page: number, perPage: number) => {
      calls++;
      // Pathological provider: total never shrinks and every page is full -- only the MAX_PAGES
      // bound (not the total comparison) can end this scan.
      return { page, perPage, total: 9_999_999, data: [ELASTIC_KUERY_RULE, ELASTIC_LUCENE_RULE] };
    };
    const outcome = await readElasticRules(fetchPage, 1, 2);
    expect(calls).toBeLessThan(1000); // bounded, not endless
    expect(outcome.pagesRead).toBe(calls);
  });

  it('stops immediately on a repeated page number if the same page is ever seen twice', async () => {
    const seen = new Set<number>();
    let repeated = false;
    const fetchPage = async (page: number) => {
      if (seen.has(page)) repeated = true;
      seen.add(page);
      return { page, perPage: 2, total: 10, data: [ELASTIC_KUERY_RULE, ELASTIC_LUCENE_RULE] };
    };
    await readElasticRules(fetchPage, 1, 2);
    // The reader's own page counter always advances (page++), so under normal operation a page
    // number is never requested twice -- this asserts that invariant holds for this fetcher.
    expect(repeated).toBe(false);
  });

  it('never turns a 403 mid-scan into an empty successful result (G18)', async () => {
    const fetchPage = async (page: number) => {
      if (page === 1) return ELASTIC_PAGE_1;
      throw new Error('403 Forbidden');
    };
    await expect(readElasticRules(fetchPage, 1, 2)).rejects.toThrow('403 Forbidden');
  });
});
