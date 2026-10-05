// @vitest-environment node
import { expect, it, vi } from 'vitest';
import { sentinelPackPresence } from '../pack-deploy-presence';
import type { PackUncertainItem } from '../pack-deploy-presence';

const rule = (name: string) => ({ name, kind: 'Scheduled', properties: { displayName: name, query: 'SecurityEvent' } });
it('verifies every page before treating a historical rule as deleted', async () => {
  const request = vi.fn().mockResolvedValueOnce({ value: [rule('one')], nextLink: 'next-page' })
    .mockResolvedValueOnce({ value: [rule('two')] });
  expect(await sentinelPackPresence(request, ['ONE', 'two', 'deleted'])).toEqual(new Map([
    ['ONE', 'present'], ['two', 'present'], ['deleted', 'missing'],
  ]));
  expect(request).toHaveBeenCalledTimes(2);
});
it('uses a direct GET and recognizes a confirmed 404 immediately before a single rule write', async () => {
  const request = vi.fn().mockRejectedValue(Object.assign(new Error('Rule not found'), { status: 404 }));
  expect(await sentinelPackPresence(request, ['deleted'])).toEqual(new Map([['deleted', 'missing']]));
  expect(request).toHaveBeenCalledWith(expect.stringContaining('alertRules/deleted?api-version='));
});
it.each([401, 403, 429, 500])('does not mistake HTTP %s for deletion', async (status) => {
  await expect(sentinelPackPresence(vi.fn().mockRejectedValue(Object.assign(new Error('Cannot read'), { status })), ['rule']))
    .rejects.toThrow('Cannot verify');
});
it('rejects malformed or incomplete inventory instead of declaring all rules missing', async () => {
  await expect(sentinelPackPresence(vi.fn().mockResolvedValue({}), ['one', 'two'])).rejects.toThrow();
  const repeated = vi.fn().mockResolvedValue({ value: [], nextLink: 'same-page' });
  await expect(sentinelPackPresence(repeated, ['one', 'two'])).rejects.toThrow();
});

const uncertain: PackUncertainItem = { id: 'item', vendor_rule_id: null,
  error_message: 'Vendor write succeeded but recording it failed: duplicate key',
  payload: { query: 'SecurityEvent | take 5', ruleConfig: { name: 'Old rule' } },
  pack_deploy_jobs: { status: 'cancelled' } };
it('reconciles a legacy recording failure from complete inventory without changing history', async () => {
  const request = vi.fn().mockResolvedValue({ value: [rule('Manual rule')] });
  expect(await sentinelPackPresence(request, [], [uncertain])).toEqual(new Map([['item:item', 'missing']]));
  expect(request).toHaveBeenCalledExactlyOnceWith(expect.stringContaining('alertRules?'));
});
it.each([
  { displayName: 'Old rule', query: 'Changed query' },
  { displayName: 'Renamed rule', query: 'SecurityEvent | take 5' },
])('keeps either a name or query match blocked', async (properties) => {
  const request = vi.fn().mockResolvedValue({ value: [{ name: 'remote', kind: 'Scheduled', properties }] });
  expect((await sentinelPackPresence(request, [], [uncertain])).get('item:item')).toBe('present');
});
it('does not clear active jobs, arbitrary unknown writes or incomplete content', async () => {
  const request = vi.fn().mockResolvedValue({ value: [] });
  expect(await sentinelPackPresence(request, [], [{ ...uncertain, pack_deploy_jobs: { status: 'running' } }])).toEqual(new Map());
  expect(await sentinelPackPresence(request, [], [{ ...uncertain, error_message: 'Network timeout' }])).toEqual(new Map());
  await expect(sentinelPackPresence(vi.fn().mockResolvedValue({ value: [{ name: 'id', kind: 'Scheduled' }] }), [], [uncertain])).rejects.toThrow('incomplete');
});
