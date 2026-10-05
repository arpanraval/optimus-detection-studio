// @vitest-environment node
import { expect, it } from 'vitest';
import { sentinelTechniques, sentinelAttackMapping } from '../sentinel-mitre';

it('serializes the sub-techniques rejected by the demo job as deduplicated parent techniques', () => {
  const original = ['T1059.005', 'T1078.004', 'T1078.004', 'T1569.002', 'T1562.007', 'T1562.008', 'T1059.001', 'T1078.004', 'T1562.007'];
  const copy = [...original];
  expect(sentinelTechniques(original)).toEqual(['T1059', 'T1078', 'T1569', 'T1562']);
  expect(original).toEqual(copy);
});
it('retains parent techniques and normalizes case/spacing', () => {
  expect(sentinelTechniques(['T1059', ' t1059.001 ', 'T1547'])).toEqual(['T1059', 'T1547']);
  expect(sentinelTechniques()).toEqual([]);
});
it('rejects malformed metadata instead of silently dropping it', () => {
  expect(() => sentinelTechniques(['T1059.abc'])).toThrow('Invalid ATT&CK technique ID');
});

it('preserves subtechniques separately and includes their unique parents', () => {
  expect(sentinelAttackMapping(['T1059.001', 'T1059', 't1059.005', 'T1059.001', 'T1078.004'])).toEqual({
    techniques: ['T1059', 'T1078'], subTechniques: ['T1059.001', 'T1059.005', 'T1078.004'],
  });
});
