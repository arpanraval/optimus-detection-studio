// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { canonicalJson, classifyDrift, contentHash, crowdStrikeScope, crowdStrikeUpdate,
  importBlockedReason, mutationBlockedReason, providerCapabilities,
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
    expect(rule.config).toMatchObject({ operation: raw.operation, fields: { notifications: raw.notifications } });
  });

  // The body CrowdStrike accepts is narrower than the object it returns. This test previously
  // asserted that the read shape was echoed back -- including `notifications` and the whole
  // `operation` object -- which is exactly what the API answered with 400.
  it('sends only the parameters the API accepts as input', () => {
    const rule = normalizeCrowdStrike(raw);
    expect(crowdStrikeUpdate(raw.id, { ...rule, query: 'field="new"' })).toEqual({
      id: raw.id,
      name: 'Existing rule',
      description: 'A production rule',
      severity: 70,
      search: { outcome: 'detection', filter: 'field="new"', lookback: '1h0m' },
      operation: { schedule: { definition: '@every 5m' } },
    });
  });

  // "can't be transitioned in state 'inactive' and also update attributes 'schedule', 'start_on'
  // or 'stop_on', these operations should be performed one at a time" -- CrowdStrike, on a body
  // that carried both. The status transition is sent separately by the caller when it changes.
  it('leaves the status transition out of an attribute update', () => {
    const rule = normalizeCrowdStrike(raw);
    expect(crowdStrikeUpdate(raw.id, rule)).not.toHaveProperty('status');
    expect(crowdStrikeUpdate(raw.id, { ...rule, enabled: false })).not.toHaveProperty('status');
  });

  // Every one of these comes back on a read and none is an input parameter. `start_on` is worse
  // than ignored: the API demands a time in the future, and a rule read today carries the one it
  // was created with.
  it('omits the fields the API only ever returns', () => {
    const rule = normalizeCrowdStrike({
      ...raw,
      mitre_attack: [],
      search: { ...raw.search, trigger_mode: '', execution_mode: 'scheduled' },
      operation: { ...raw.operation, start_on: '2026-02-13T20:17:58.656Z' },
    });
    const update = crowdStrikeUpdate(raw.id, rule);
    for (const field of ['trigger_mode', 'execution_mode', 'use_ingest_time']) {
      expect(update.search).not.toHaveProperty(field);
    }
    expect(update.operation).toEqual({ schedule: { definition: '@every 5m' } });
    expect(update).not.toHaveProperty('mitre_attack');
    expect(update).not.toHaveProperty('notifications');
  });

  // The API refuses a technique with no tactic, so one is never sent alone.
  it('never sends a technique without the tactic the API requires with it', () => {
    const rule = normalizeCrowdStrike({ ...raw, technique: 'T1098', tactic: '' });
    expect(crowdStrikeUpdate(raw.id, rule)).not.toHaveProperty('technique');
    const mapped = normalizeCrowdStrike({ ...raw, technique: 'T1098', tactic: 'TA0004' });
    expect(crowdStrikeUpdate(raw.id, mapped)).toMatchObject({ tactic: 'TA0004', technique: 'T1098' });
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
  // siem_link_existing refuses to invent a baseline when the linked query already differs from
  // production. Without a common ancestor, local_changed and remote_changed are indistinguishable,
  // so picking either would be a guess presented as a fact.
  it('reports a link with no agreed baseline rather than guessing a direction', () => {
    const base = normalizeCrowdStrike(raw), local = { ...base, query: 'local' };
    expect(classifyDrift(null, local, base)).toBe('no_baseline');
    // Nothing to reconcile when the two sides already agree, baseline or not.
    expect(classifyDrift(null, base, base)).toBe('in_sync');
    // Availability still wins: we cannot compare against a rule that is gone.
    expect(classifyDrift(null, local, base, 'missing')).toBe('missing');
  });

  // The table used to key eligibility purely off relationship, so a rule the scan never read, or
  // one deleted in CrowdStrike since, advertised "Ready to import" and offered a live checkbox for
  // an import siem_start_import would then record as skipped.
  it('blocks an import the server would skip, for the same reasons the server gives', () => {
    const readable = {
      relationship: 'not_in_library' as const, availability: 'present' as const,
      latest_snapshot_id: 'snap-1', normalization_error: null,
    };
    expect(importBlockedReason(readable)).toBeNull();
    expect(importBlockedReason({ ...readable, latest_snapshot_id: null }))
      .toBe('Not read from CrowdStrike yet');
    expect(importBlockedReason({ ...readable, availability: 'missing' }))
      .toBe('No longer in CrowdStrike');
    expect(importBlockedReason({ ...readable, availability: 'unknown' }))
      .toBe('Could not be read in the last check');
    expect(importBlockedReason({ ...readable, relationship: 'already_in_library' }))
      .toBe('Already in library');
    expect(importBlockedReason({ ...readable, relationship: 'unsupported', normalization_error: 'No CQL query' }))
      .toBe('No CQL query');
  });

  // Each of these was already enforced on the server, but only as a thrown error AFTER the user
  // committed to the action -- so the UI offered buttons that could not work.
  describe('production mutation capability', () => {
    const open = {
      writesEnabled: true, ruleFamily: 'correlation', bindingStatus: 'active',
      availability: 'present', drift: 'local_changed' as const, pendingOperation: false,
    };

    // A provider absent from the table supports nothing. Query-language compatibility is
    // deliberately not a capability: two providers accepting the same query text says nothing
    // about whether their deployment payloads round-trip losslessly.
    it('grants no capability to a provider that has not been qualified', () => {
      // 'splunk' is now a registered import provider (read-only), so this uses a provider name
      // that has never appeared in PROVIDER_CAPABILITIES to exercise the true absent-provider path.
      expect(providerCapabilities('jira')).toEqual({ readFamilies: [], writeFamilies: [], operations: [] });
      expect(providerCapabilities(null)).toEqual({ readFamilies: [], writeFamilies: [], operations: [] });
      expect(mutationBlockedReason('update', { ...open, provider: 'jira' }))
        .toMatch(/cannot update rules in jira/);
    });

    it('allows an update that has something to send', () => {
      expect(mutationBlockedReason('update', open)).toBeNull();
    });

    it('names the installation gate first, before anything about the rule', () => {
      expect(mutationBlockedReason('update', { ...open, writesEnabled: false }))
        .toMatch(/not enabled for this installation/);
      // Even a rule that is otherwise perfectly writable.
      expect(mutationBlockedReason('enable', { ...open, writesEnabled: false, drift: 'in_sync' }))
        .toMatch(/not enabled for this installation/);
    });

    it('refuses a rule family this adapter cannot serialize back', () => {
      // Readable and importable, but crowdStrikeUpdate has no mapping to write it.
      expect(mutationBlockedReason('update', { ...open, ruleFamily: 'ioa' }))
        .toMatch(/cannot change them in CrowdStrike/);
    });

    it('refuses while an earlier write is unresolved', () => {
      expect(mutationBlockedReason('update', { ...open, pendingOperation: true }))
        .toMatch(/has not finished/);
    });

    it('distinguishes a rule that is gone from one it could not read', () => {
      expect(mutationBlockedReason('delete', { ...open, availability: 'missing' }))
        .toBe('This rule is no longer in CrowdStrike.');
      expect(mutationBlockedReason('delete', { ...open, availability: 'unknown' }))
        .toMatch(/could not read this rule/);
    });

    it('refuses every operation on a link that was never reconciled', () => {
      // No common ancestor means no honest description of what a write would do -- including a
      // toggle, which would carry the unreconciled query along with it.
      for (const op of ['update', 'enable', 'disable', 'delete'] as const) {
        expect(mutationBlockedReason(op, { ...open, drift: 'no_baseline' }))
          .toMatch(/never been reconciled/);
      }
    });

    it('does not offer an update when there is nothing to send', () => {
      expect(mutationBlockedReason('update', { ...open, drift: 'in_sync' }))
        .toBe('The library copy already matches CrowdStrike.');
    });

    it('blocks a toggle under remote drift but allows it when only the library moved', () => {
      // Enable/disable resends the current remote content with one field flipped; doing that
      // after production moved on would quietly revert whatever changed there.
      expect(mutationBlockedReason('enable', { ...open, drift: 'remote_changed' }))
        .toMatch(/CrowdStrike changed since you last checked/);
      expect(mutationBlockedReason('disable', { ...open, drift: 'conflict' }))
        .toMatch(/CrowdStrike changed since you last checked/);
      expect(mutationBlockedReason('enable', { ...open, drift: 'local_changed' })).toBeNull();
      expect(mutationBlockedReason('disable', { ...open, drift: 'in_sync' })).toBeNull();
    });
  });

  it('detects schedule-only changes but ignores vendor timestamps', () => {
    const base = normalizeCrowdStrike(raw);
    expect(classifyDrift(base, base, normalizeCrowdStrike({ ...raw, last_updated_on: 'later' }))).toBe('in_sync');
    expect(classifyDrift(base, base, { ...base, config: { ...base.config, operation: { schedule: { definition: '@every 1m' } } } })).toBe('remote_changed');
  });
});
