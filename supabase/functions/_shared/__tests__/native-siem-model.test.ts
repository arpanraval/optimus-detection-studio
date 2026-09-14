// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { canonicalJson, classifyDrift, contentHash, crowdStrikeScope, crowdStrikeUpdate,
  localContent, normalizeCrowdStrike, sanitizeSnapshot } from '../native-siem-model';

const raw = {
  id: 'remote-123', name: 'Existing rule', description: 'A production rule', severity: 70, status: 'active',
  search: { filter: 'field="value"', lookback: '1h0m', outcome: 'detection', use_ingest_time: true },
  operation: { schedule: { definition: '@every 5m' }, suppression: { enabled: true } },
  notifications: [{ type: 'email', config: { to: 'soc@example.test' } }],
};

describe('native SIEM content contracts', () => {
  it('preserves configuration, numeric severity and native query language', () => {
    const rule = normalizeCrowdStrike(raw);
    expect(rule.severity).toBe('High'); expect(rule.language).toBe('CQL');
    const update = crowdStrikeUpdate(raw.id, { ...rule, query: 'field="new"' });
    expect(update).toMatchObject({ id: raw.id, severity: 70, status: 'active', operation: raw.operation,
      notifications: raw.notifications, search: { ...raw.search, filter: 'field="new"' } });
  });
  it('never assumes an unrecognized status is enabled', () => {
    const rule = normalizeCrowdStrike({ ...raw, status: 'unknown' });
    expect(rule.enabled).toBeNull(); expect(() => crowdStrikeUpdate(raw.id, rule)).toThrow('Unknown');
  });
  it('refuses unsupported updates without inventing defaults', () => {
    const rule = normalizeCrowdStrike({ ...raw, search: { ...raw.search, future_field: true } });
    expect(() => crowdStrikeUpdate(raw.id, rule)).toThrow('lossless');
  });
  it('does not create empty editable rules', () => {
    expect(() => normalizeCrowdStrike({ ...raw, search: {} })).toThrow('no CQL query');
    expect(() => normalizeCrowdStrike({ ...raw, id: '' })).toThrow('identity');
  });
  it('hashes canonical objects but preserves array order and query whitespace', async () => {
    expect(await contentHash({ b: 2, a: 1 })).toBe(await contentHash({ a: 1, b: 2 }));
    expect(await contentHash(['a', 'b'])).not.toBe(await contentHash(['b', 'a']));
    expect(canonicalJson({ query: 'a b' })).not.toBe(canonicalJson({ query: 'a  b' }));
  });
  it('removes secret fields recursively without deleting query data', () => {
    expect(sanitizeSnapshot({ access_token: 'secret', nested: [{ password: 'secret', query: 'password="test"' }] }))
      .toEqual({ nested: [{ query: 'password="test"' }] });
  });
  it('scopes customer identities and rejects unsafe API origins', () => {
    const config = { baseUrl: 'https://api.crowdstrike.com/', customerId: 'A'.repeat(32) + '-ff' };
    expect(crowdStrikeScope(config)).toContain('a'.repeat(32));
    expect(() => crowdStrikeScope({ ...config, baseUrl: 'http://localhost/' })).toThrow('HTTPS');
    expect(() => crowdStrikeScope({ ...config, customerId: '' })).toThrow('customer ID');
  });
  it('compares the selected query rather than unrelated detection queries', () => {
    const rule = normalizeCrowdStrike(raw);
    const detection = { ...rule, queries: [{ id: 'bound', language: 'CQL', query: rule.query },
      { id: 'other', language: 'KQL', query: 'edited KQL' }] };
    expect(localContent(detection, 'bound', rule)).toEqual(rule);
    expect(() => localContent(detection, 'other', rule)).toThrow('incompatible');
    expect(() => localContent(detection, 'missing', rule)).toThrow('missing');
  });
  it('distinguishes both directions, conflicts, convergence and missing/unknown states', () => {
    const base = normalizeCrowdStrike(raw), local = { ...base, query: 'local' }, remote = { ...base, query: 'remote' };
    expect(classifyDrift(base, base, base)).toBe('in_sync');
    expect(classifyDrift(base, local, base)).toBe('local_changed');
    expect(classifyDrift(base, base, remote)).toBe('remote_changed');
    expect(classifyDrift(base, local, remote)).toBe('conflict');
    expect(classifyDrift(base, local, local)).toBe('in_sync');
    expect(classifyDrift(base, base, base, 'missing')).toBe('missing');
    expect(classifyDrift(base, base, base, 'unknown')).toBe('unknown');
  });
  it('detects schedule-only changes but ignores vendor timestamps', () => {
    const base = normalizeCrowdStrike(raw);
    expect(classifyDrift(base, base, normalizeCrowdStrike({ ...raw, last_updated_on: 'later' }))).toBe('in_sync');
    expect(classifyDrift(base, base, { ...base, config: { ...base.config, operation: { schedule: { definition: '@every 1m' } } } })).toBe('remote_changed');
  });
});
