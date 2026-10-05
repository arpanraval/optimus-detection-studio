import { describe, expect, it } from 'vitest';
import { observedState } from '../integrationService';

describe('observed provider state', () => {
  // The bug: the edge projection never emits `disabled`, so `!raw.disabled` was always true.
  it('reads a disabled Splunk rule as disabled, not enabled', () => {
    expect(observedState('splunk', { enabled: false })).toBe('disabled');
    expect(observedState('splunk', { enabled: true })).toBe('enabled');
  });

  it('calls a missing state unknown rather than disabled', () => {
    expect(observedState('sentinel', {})).toBe('unknown');
    expect(observedState('chronicle', {})).toBe('unknown');
    expect(observedState('splunk', {})).toBe('unknown');
  });
});
