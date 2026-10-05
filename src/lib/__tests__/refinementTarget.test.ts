import { describe, expect, it } from 'vitest';
import { refinementTargetIndex } from '../refinementTarget';

describe('fine-tuning query handoff', () => {
  const queries = [{ language: 'KQL', query: 'DeviceEvents' }, { language: 'KQL', query: 'SecurityEvent' },
    { language: 'CQL', query: '#event_simpleName=ProcessRollup2' }];
  it('selects the original query even when it is not first', () => {
    expect(refinementTargetIndex(queries, 'KQL', 'SecurityEvent')).toBe(1);
    expect(refinementTargetIndex(queries, 'CQL', '#event_simpleName=ProcessRollup2')).toBe(2);
  });
  it('rejects changed or ambiguous queries instead of replacing an unrelated one', () => {
    expect(() => refinementTargetIndex(queries, 'KQL', 'OldQuery')).toThrow(/changed/);
    expect(() => refinementTargetIndex([...queries, queries[1]], 'KQL', 'SecurityEvent')).toThrow(/ambiguous/);
    expect(() => refinementTargetIndex(queries, 'KQL')).toThrow(/Multiple/);
  });
  it('retains an unambiguous legacy handoff without original text', () => {
    expect(refinementTargetIndex(queries, 'CQL')).toBe(2);
    expect(refinementTargetIndex([], 'CQL')).toBe(-1);
  });
});
