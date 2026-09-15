import React from 'react';
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { RuleConfigSummary, ruleConfigSummary } from '../RuleConfigSummary';
import type { RuleContent } from '@/services/nativeSiemService';

const content: RuleContent = {
  name: 'Okta admin role granted',
  description: 'Someone was granted an admin role.',
  query: '#Vendor="okta"',
  language: 'CQL',
  severity: 'High',
  enabled: true,
  config: {
    search: { outcome: 'detection', lookback: '24h0m', trigger_mode: '' },
    operation: { schedule: { definition: '@every 1h0m' }, start_on: '2026-02-13T20:17:58.656Z' },
  },
};

describe('ruleConfigSummary', () => {
  // These five are exactly what the update writes. Showing more would imply the write controls
  // settings it leaves alone.
  it('lists the settings the update actually sends', () => {
    expect(ruleConfigSummary(content)).toEqual([
      { label: 'Severity', value: 'High' },
      { label: 'Outcome', value: 'detection' },
      { label: 'Search window (lookback)', value: '24h0m' },
      { label: 'Schedule frequency', value: '@every 1h0m' },
      { label: 'Status', value: 'Active' },
    ]);
  });

  it('says a setting is absent rather than inventing a default for it', () => {
    const rows = ruleConfigSummary({ ...content, config: {} });
    expect(rows.find((row) => row.label === 'Outcome')?.value).toBe('—');
    expect(rows.find((row) => row.label === 'Schedule frequency')?.value).toBe('—');
  });

  // An unknown remote state must not read as "off" -- the write would then disable a live rule.
  it('does not read an unknown state as inactive', () => {
    expect(ruleConfigSummary({ ...content, enabled: null }).find((row) => row.label === 'Status')?.value)
      .toBe('—');
  });
});

describe('RuleConfigSummary', () => {
  it('shows the values and says where they are edited', () => {
    render(<RuleConfigSummary content={content} />);
    expect(screen.getByText('24h0m')).toBeTruthy();
    expect(screen.getByText('@every 1h0m')).toBeTruthy();
    expect(screen.getByText(/Edit library copy/)).toBeTruthy();
  });
});
