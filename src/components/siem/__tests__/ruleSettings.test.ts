import { describe, expect, it } from 'vitest';
import { ruleSettingRows } from '../ruleSettings';
import type { RuleContent } from '@/services/nativeSiemService';

const content: RuleContent = {
  name: 'Okta admin role granted',
  description: 'Someone was granted an admin role.',
  query: '#Vendor="okta"',
  language: 'CQL',
  severity: 'High',
  enabled: true,
  config: {
    search: { outcome: 'detection', lookback: '1h0m' },
    operation: { schedule: { definition: '@every 1h0m' } },
    tactic: 'TA0004',
    technique: 'T1098',
  },
};

describe('ruleSettingRows', () => {
  // Whether the rule runs was a line of free text above a scrolling block of JSON. It is the
  // field the whole comparison turns on.
  it('answers whether the rule is running as its own labelled field', () => {
    expect(ruleSettingRows(content)[0]).toEqual({ label: 'Status', value: 'Active' });
    expect(ruleSettingRows({ ...content, enabled: false })[0].value).toBe('Inactive');
  });

  it('does not report an unknown state as inactive', () => {
    expect(ruleSettingRows({ ...content, enabled: null })[0].value).toBe('Unknown');
  });

  it('lifts the settings out of the raw configuration', () => {
    expect(ruleSettingRows(content)).toEqual([
      { label: 'Status', value: 'Active' },
      { label: 'Severity', value: 'High' },
      { label: 'Outcome', value: 'detection' },
      { label: 'Search window', value: '1h0m' },
      { label: 'Schedule', value: '@every 1h0m' },
      { label: 'ATT&CK tactic', value: 'TA0004' },
      { label: 'ATT&CK technique', value: 'T1098' },
    ]);
  });

  it('marks a setting the rule does not have rather than leaving a blank', () => {
    const rows = ruleSettingRows({ ...content, config: {} });
    expect(rows.find((row) => row.label === 'ATT&CK tactic')?.value).toBe('—');
    expect(rows.find((row) => row.label === 'Schedule')?.value).toBe('—');
  });
});
