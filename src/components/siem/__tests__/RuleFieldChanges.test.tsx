import React from 'react';
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { RuleFieldChanges, ruleFieldChanges } from '../RuleFieldChanges';
import type { RuleContent } from '@/services/nativeSiemService';

const remote: RuleContent = {
  name: 'Okta admin role granted',
  description: 'Someone was granted an admin role in Okta.',
  query: '#Vendor="okta"',
  language: 'CQL',
  severity: 'Medium',
  enabled: true,
  config: { search: { outcome: 'detection', lookback: '1h0m' }, operation: { schedule: { definition: '5m' } } },
};
const local = (overrides: Partial<RuleContent>): RuleContent => ({ ...remote, ...overrides });

describe('ruleFieldChanges', () => {
  it('reports nothing when the update would leave every non-query field alone', () => {
    expect(ruleFieldChanges(local({ query: 'a different query' }), remote)).toEqual([]);
  });

  // The write sends the library's severity, so a library-side severity edit silently re-rates a
  // live rule. It belongs in the review that authorises the write.
  it('names a severity change with production first and the new value second', () => {
    expect(ruleFieldChanges(local({ severity: 'High' }), remote)).toEqual([
      { label: 'Severity', from: 'Medium', to: 'High' },
    ]);
  });

  it('names the configuration leaf that differs rather than the whole object', () => {
    const changes = ruleFieldChanges(
      local({ config: { ...remote.config, search: { outcome: 'detection', lookback: '24h0m' } } }),
      remote,
    );
    expect(changes).toEqual([{ label: 'search.lookback', from: '1h0m', to: '24h0m' }]);
  });

  it('reads an unknown enabled state as unknown rather than as disabled', () => {
    expect(ruleFieldChanges(local({ enabled: null }), remote)).toEqual([
      { label: 'State', from: 'enabled', to: 'unknown' },
    ]);
  });

  it('marks a configuration key present on only one side', () => {
    const changes = ruleFieldChanges(
      local({ config: { ...remote.config, operation: { schedule: { definition: '5m' }, suppression: '1h' } } }),
      remote,
    );
    expect(changes).toEqual([{ label: 'operation.suppression', from: '—', to: '1h' }]);
  });
});

describe('RuleFieldChanges', () => {
  it('says how many settings beyond the query the update would change', () => {
    render(
      <RuleFieldChanges
        local={local({ name: 'Okta admin role granted (tuned)', severity: 'High' })}
        remote={remote}
        remoteTitle="CrowdStrike Falcon Production"
      />,
    );
    expect(screen.getByRole('note').textContent)
      .toBe('Updating would also change 2 settings in CrowdStrike Falcon Production:');
    expect(screen.getByText('Severity').parentElement?.textContent).toBe('Severity: Medium → High');
  });

  it('says plainly when the query is the only thing that would change', () => {
    render(
      <RuleFieldChanges
        local={local({ query: 'changed' })}
        remote={remote}
        remoteTitle="CrowdStrike Falcon Production"
      />,
    );
    expect(screen.getByRole('note').textContent).toContain('Nothing outside the query would change');
  });
});
