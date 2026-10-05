import { describe, expect, it } from 'vitest';
import { selectSiemQuery } from '../siem-query-selection';

describe('SIEM execution query selection', () => {
  const detection = { queries: [{ id: 'first', language: 'KQL', query: 'WrongTable' },
    { id: 'bound', language: 'KQL', query: 'SecurityEvent' }, { id: 'cs', language: 'CQL', query: '#event_simpleName=ProcessRollup2' }] };
  it('uses the bound query rather than the first compatible query', () => {
    expect(selectSiemQuery(detection, 'KQL', ['bound'])).toBe('SecurityEvent');
  });
  it('refuses a missing or incompatible bound query rather than silently falling back', () => {
    expect(() => selectSiemQuery(detection, 'CQL', ['bound'])).toThrow(/tracked query/);
    expect(() => selectSiemQuery(detection, 'KQL', ['missing'])).toThrow(/tracked query/);
  });
  it('preserves unbound authored detection behavior', () => {
    expect(selectSiemQuery(detection, 'CQL')).toBe('#event_simpleName=ProcessRollup2');
  });
});
