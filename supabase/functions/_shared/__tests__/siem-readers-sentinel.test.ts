// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { normalizeSentinelEntry, isUnsupportedSentinelRule, readSentinelAlertRules } from '../siem-readers/sentinel.ts';
import {
  SENTINEL_SAME_GUID_TWO_WORKSPACES, SENTINEL_SCHEDULED_RULE, SENTINEL_NRT_RULE,
  SENTINEL_FUSION_RULE, SENTINEL_DISABLED_RULE, SENTINEL_PAGE_1, SENTINEL_PAGE_2,
} from './fixtures/sentinel-list.ts';

describe('Sentinel analytics-rule reader', () => {
  it('preserves the full ARM locator for the same GUID in two workspaces without collapsing identity (G21)', () => {
    const [a, b] = SENTINEL_SAME_GUID_TWO_WORKSPACES.map(normalizeSentinelEntry);
    if (isUnsupportedSentinelRule(a) || isUnsupportedSentinelRule(b)) throw new Error('expected supported rules');
    expect(a.vendorRuleId).toBe(b.vendorRuleId); // same GUID name
    expect(a.armId).not.toBe(b.armId); // but different full ARM locators -- caller must scope by workspace/provider_scope
    expect(a.armId).toContain('workspace-a');
    expect(b.armId).toContain('workspace-b');
  });

  it('maps a Scheduled rule fully, including tactics/techniques/threshold/entity mappings', () => {
    const rule = normalizeSentinelEntry(SENTINEL_SCHEDULED_RULE);
    if (isUnsupportedSentinelRule(rule)) throw new Error('expected a supported rule');
    expect(rule.kind).toBe('Scheduled');
    expect(rule.language).toBe('KQL');
    expect(rule.queryFrequency).toBe('PT5M');
    expect(rule.queryPeriod).toBe('PT1H');
    expect(rule.triggerOperator).toBe('GreaterThan');
    expect(rule.triggerThreshold).toBe(0);
    expect(rule.tactics).toEqual(['Execution']);
    expect(rule.techniques).toEqual(['T1059.001']);
    expect(rule.entityMappings).toBeTruthy();
    expect(rule.alertRuleTemplateName).toBe('template-123');
    expect(rule.unmappedFields).toEqual([]);
  });

  it('does not inject Scheduled cadence defaults into an NRT rule and marks unmapped fields', () => {
    const rule = normalizeSentinelEntry(SENTINEL_NRT_RULE);
    if (isUnsupportedSentinelRule(rule)) throw new Error('expected a supported rule');
    expect(rule.kind).toBe('NRT');
    expect(rule.queryFrequency).toBeNull();
    expect(rule.queryPeriod).toBeNull();
    expect(rule.triggerOperator).toBeNull();
    expect(rule.triggerThreshold).toBeNull();
    // Unsettled NRT schema: the undocumented field is surfaced, not silently dropped.
    expect(rule.unmappedFields).toContain('someUndocumentedNrtField');
  });

  it('keeps a non-query kind (Fusion) visible with a precise unsupported-import reason (G19)', () => {
    const result = normalizeSentinelEntry(SENTINEL_FUSION_RULE);
    expect(isUnsupportedSentinelRule(result)).toBe(true);
    if (!isUnsupportedSentinelRule(result)) throw new Error('expected unsupported');
    expect(result.kind).toBe('Fusion');
    expect(result.reason).toMatch(/Fusion/);
    expect(result.reason).toMatch(/not an importable analytics rule/);
  });

  it('reports a disabled Scheduled rule as disabled, never as unknown', () => {
    const rule = normalizeSentinelEntry(SENTINEL_DISABLED_RULE);
    if (isUnsupportedSentinelRule(rule)) throw new Error('expected a supported rule');
    expect(rule.enabled).toBe(false);
  });

  it('reports unknown, never a fabricated boolean, when enabled is absent or non-boolean', () => {
    const rule = normalizeSentinelEntry({ id: 'x', name: 'x', kind: 'Scheduled', properties: { displayName: 'x', query: 'q' } });
    if (isUnsupportedSentinelRule(rule)) throw new Error('expected a supported rule');
    expect(rule.enabled).toBe('unknown');
  });

  it('follows nextLink across pages until exhausted, replacing the single-response read', async () => {
    const requested: string[] = [];
    const fetchPage = async (url: string) => {
      requested.push(url);
      if (url === 'https://management.azure.com/start') return SENTINEL_PAGE_1;
      if (url === SENTINEL_PAGE_1.nextLink) return SENTINEL_PAGE_2;
      throw new Error('unexpected url');
    };
    const outcome = await readSentinelAlertRules(fetchPage, 'https://management.azure.com/start');
    expect(requested).toEqual(['https://management.azure.com/start', SENTINEL_PAGE_1.nextLink]);
    expect(outcome.pagesRead).toBe(2);
    // Page 1: Scheduled + NRT (both supported); Page 2: Fusion (unsupported) + disabled Scheduled (supported).
    expect(outcome.rules).toHaveLength(3);
    expect(outcome.unsupported).toHaveLength(1);
    expect(outcome.stoppedOnRepeatedCursor).toBe(false);
  });

  it('stops bounded on a repeated nextLink rather than looping forever (G11)', async () => {
    const loop = 'https://management.azure.com/loop';
    let calls = 0;
    const fetchPage = async (_url: string) => {
      calls++;
      return { value: [], nextLink: loop }; // always the same link back
    };
    const outcome = await readSentinelAlertRules(fetchPage, loop);
    expect(outcome.stoppedOnRepeatedCursor).toBe(true);
    expect(calls).toBe(1); // seen before the second fetch would have happened
  });

  it('propagates a 403 mid-scan rather than returning an empty successful result, and never reports it as deletion (G18, G32)', async () => {
    let call = 0;
    const fetchPage = async () => {
      call++;
      if (call === 2) throw new Error('403 Forbidden');
      return SENTINEL_PAGE_1;
    };
    await expect(readSentinelAlertRules(fetchPage, 'https://management.azure.com/start')).rejects.toThrow('403 Forbidden');
  });
});
