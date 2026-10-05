// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { IMPORT_READERS } from '../siem-readers/import-readers';
import { normalizeSentinelEntry } from '../siem-readers/sentinel';

describe('durable discovery completeness', () => {
  it.each([
    ['sentinel', { value: [{ kind: 'Fusion' }] }],
    ['elastic', { data: [{ type: 'machine_learning' }] }],
  ] as const)('rejects %s entries whose identity cannot be recorded', async (provider, page) => {
    await expect(IMPORT_READERS[provider]!.discover(async () => page as never,
      { offset: 0, token: null })).rejects.toThrow(/without an identity/);
  });

  it.each([
    ['sentinel', { value: [{ name: 'unsupported', kind: 'Fusion' }] }],
    ['elastic', { data: [{ rule_id: 'unsupported', type: 'machine_learning' }] }],
    ['defender_xdr', { value: [{ id: 'unsupported' }] }],
    ['chronicle', { rules: [{ ruleId: 'unsupported' }] }],
  ] as const)('records unsupported %s rules instead of treating them as absent', async (provider, page) => {
    expect(await IMPORT_READERS[provider]!.discover(async () => page as never,
      { offset: 0, token: null })).toMatchObject({ ids: ['unsupported'], done: true });
  });

  it('uses the rule name from an ARM locator when Sentinel omits name', () => {
    expect(normalizeSentinelEntry({ id: '/subscriptions/sub/workspaces/ws/providers/Microsoft.SecurityInsights/alertRules/id-1',
      kind: 'Fusion' }).vendorRuleId).toBe('id-1');
  });
});
