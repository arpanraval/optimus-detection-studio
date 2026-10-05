import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { BoundRuleConfig, boundConfigFrom, applyBoundConfig, boundConfigChanged }
  from '../BoundRuleConfig';
import type { RuleContent } from '@/services/nativeSiemService';

const content: RuleContent = {
  name: 'Okta admin role granted',
  description: 'Someone was granted an admin role.',
  query: '#Vendor="okta"',
  language: 'CQL',
  severity: 'High',
  enabled: true,
  config: {
    search: { outcome: 'detection', lookback: '1h0m', trigger_mode: '' },
    operation: { schedule: { definition: '@every 1h0m' }, start_on: '2026-02-13T20:17:58.656Z' },
  },
};

describe('boundConfigFrom', () => {
  it('starts from what the rule has now, never from a default', () => {
    expect(boundConfigFrom(content)).toEqual({
      severity: 'High', outcome: 'detection', lookback: '1h0m', schedule: '@every 1h0m', enabled: true,
      scheduleEditable: true, lookbackEditable: true, outcomeEditable: true,
    });
  });

  // Defaulting an unknown state to false would have the update disable a running rule.
  it('does not read an unknown production state as off', () => {
    expect(boundConfigFrom({ ...content, enabled: null }).enabled).toBeNull();
  });
});

describe('applyBoundConfig', () => {
  it('changes only the fields the form owns and leaves the rest of the config alone', () => {
    const edited = applyBoundConfig(content, { ...boundConfigFrom(content), lookback: '24h0m', enabled: false });
    expect(edited.config).toMatchObject({
      search: { outcome: 'detection', lookback: '24h0m', trigger_mode: '' },
      operation: { schedule: { definition: '@every 1h0m' }, start_on: '2026-02-13T20:17:58.656Z' },
    });
    expect(edited.enabled).toBe(false);
    expect(edited.query).toBe(content.query);
  });
});

describe('boundConfigChanged', () => {
  it('is false for the values the rule already has', () => {
    expect(boundConfigChanged(boundConfigFrom(content), boundConfigFrom(content))).toBe(false);
  });
  it('is true once a single field differs', () => {
    expect(boundConfigChanged({ ...boundConfigFrom(content), schedule: '@every 5m' }, boundConfigFrom(content)))
      .toBe(true);
  });
});

describe('BoundRuleConfig', () => {
  it('edits the search window through the draft rather than in place', () => {
    const onChange = vi.fn();
    render(<BoundRuleConfig draft={boundConfigFrom(content)} onChange={onChange} />);
    fireEvent.change(screen.getByDisplayValue('1h0m'), { target: { value: '24h0m' } });
    expect(onChange).toHaveBeenCalledWith(expect.objectContaining({ lookback: '24h0m', schedule: '@every 1h0m' }));
  });

  it('says where the change lands before it is deployed', () => {
    render(<BoundRuleConfig draft={boundConfigFrom(content)} onChange={vi.fn()} />);
    expect(screen.getByText(/saved to the library copy when you deploy/i)).toBeTruthy();
  });
});
