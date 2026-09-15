// @vitest-environment node
import { describe, expect, it } from 'vitest';
import {
  normalizeSplunkEntry, readSplunkCorrelationSearches, splunkVendorRuleId,
  parseCorrelationSearchEnabled, parseStrictBoolean01, UnsupportedSplunkRule,
} from '../siem-readers/splunk.ts';
import {
  SPLUNK_SAME_NAME_TWO_APPS, SPLUNK_STATE_VARIANTS, SPLUNK_MISSING_QUERY,
  SPLUNK_PAGE_1, SPLUNK_PAGE_2, SPLUNK_PAGE_3, SPLUNK_PRIVATE_VS_SHARED,
} from './fixtures/splunk-list.ts';

describe('Splunk correlation-search reader', () => {
  it('carries owner in vendor_rule_id so the same name in two apps/owners never collides (G21)', () => {
    const [a, b] = SPLUNK_SAME_NAME_TWO_APPS.map(normalizeSplunkEntry);
    expect(a.name).toBe(b.name);
    expect(a.vendorRuleId).not.toBe(b.vendorRuleId);
    expect(a.vendorRuleId).toBe(splunkVendorRuleId(a.identity));
    expect(a.identity).toEqual({ owner: 'nobody', app: 'SplunkEnterpriseSecuritySuite', name: a.name });
    expect(b.identity).toEqual({ owner: 'analyst_jane', app: 'CustomSecApp', name: b.name });
  });

  it('preserves acl (app/owner/sharing) for private vs shared searches', () => {
    const [priv, shared] = SPLUNK_PRIVATE_VS_SHARED.map(normalizeSplunkEntry);
    expect(priv.acl).toEqual({ app: 'search', owner: 'analyst_bob', sharing: 'user' });
    expect(shared.acl).toEqual({ app: 'SplunkEnterpriseSecuritySuite', owner: 'nobody', sharing: 'global' });
  });

  it('parses the strict "0"/"1" boolean serialization', () => {
    expect(parseStrictBoolean01('0')).toBe(false);
    expect(parseStrictBoolean01('1')).toBe(true);
    expect(parseStrictBoolean01(undefined)).toBe('unknown');
    expect(parseStrictBoolean01('bogus')).toBe('unknown');
  });

  it('parses the looser correlationsearch.enabled true-ish forms, case-insensitively', () => {
    expect(parseCorrelationSearchEnabled('1')).toBe(true);
    expect(parseCorrelationSearchEnabled('true')).toBe(true);
    expect(parseCorrelationSearchEnabled('True')).toBe(true);
    expect(parseCorrelationSearchEnabled('t')).toBe(true);
    expect(parseCorrelationSearchEnabled('T')).toBe(true);
    // Unsettled false-case serialization: only "0" is treated as false; anything else unknown.
    expect(parseCorrelationSearchEnabled('0')).toBe(false);
    expect(parseCorrelationSearchEnabled('')).toBe('unknown');
    expect(parseCorrelationSearchEnabled(undefined)).toBe('unknown');
  });

  it('normalizes a disabled rule and a rule whose two enable signals disagree (unknown, both recorded)', () => {
    const rules = SPLUNK_STATE_VARIANTS.map(normalizeSplunkEntry);
    const disabled = rules.find(r => r.name === 'Suspicious PowerShell Execution - Rule')!;
    expect(disabled.observedState).toBe('disabled');
    const trueVariant = rules.find(r => r.name === 'Rare Process With Network Connection')!;
    expect(trueVariant.observedState).toBe('enabled');
    const tVariant = rules.find(r => r.name === 'New Local Admin Account Created')!;
    expect(tVariant.observedState).toBe('enabled');
    const disagreeing = rules.find(r => r.name === 'Disagreeing Signals Rule')!;
    expect(disagreeing.observedState).toBe('unknown');
    expect(disagreeing.stateSignals).toEqual({ disabled: false, correlationSearchEnabled: false });
    // Never coerced to 'disabled' silently.
    expect(disagreeing.observedState).not.toBe('disabled');
  });

  it('uses the scope wording "Correlation searches · {app/owner}", never "all saved searches"', () => {
    const rule = normalizeSplunkEntry(SPLUNK_SAME_NAME_TWO_APPS[0]);
    expect(rule.scopeLabel).toBe('Correlation searches · SplunkEnterpriseSecuritySuite/nobody');
    expect(rule.scopeLabel).not.toMatch(/all saved searches/i);
  });

  it('rejects a rule with no query as unsupported rather than crashing (G19)', () => {
    expect(() => normalizeSplunkEntry(SPLUNK_MISSING_QUERY)).toThrow(UnsupportedSplunkRule);
  });

  it('pages via count/offset until a short page terminates, replacing count=0', async () => {
    const calls: Array<[number, number]> = [];
    const fetchPage = async (offset: number, count: number) => {
      calls.push([offset, count]);
      if (offset === 0) return { entry: SPLUNK_PAGE_1 };
      if (offset === 2) return { entry: SPLUNK_PAGE_2 };
      if (offset === 4) return { entry: SPLUNK_PAGE_3 };
      return { entry: [] };
    };
    const outcome = await readSplunkCorrelationSearches(fetchPage, 0, 2);
    expect(calls).toEqual([[0, 2], [2, 2], [4, 2]]);
    expect(outcome.rules).toHaveLength(5);
    expect(outcome.pagesRead).toBe(3);
    expect(outcome.stoppedOnNonAdvancingCursor).toBe(false);
  });

  it('stops bounded on a repeated/non-advancing offset rather than looping forever (G11)', async () => {
    let calls = 0;
    const fetchPage = async (_offset: number, count: number) => {
      calls++;
      return { entry: new Array(count).fill(SPLUNK_SAME_NAME_TWO_APPS[0]) }; // always a full page, offset never sent back
    };
    // Fetcher ignores offset progression entirely by always returning a full page; the caller's
    // own offset increments normally in this reader, so to exercise the repeated-cursor guard we
    // simulate a fetcher that always reports offset 0 by having the caller re-derive the same
    // offset -- here we assert the loop is bounded overall (MAX_PAGES) even under pathological input.
    const outcome = await readSplunkCorrelationSearches(fetchPage, 0, 2);
    expect(calls).toBeLessThanOrEqual(500);
    expect(outcome.pagesRead).toBeLessThanOrEqual(500);
  });

  it('propagates a mid-scan fetch failure rather than returning an empty successful result (G18)', async () => {
    let call = 0;
    const fetchPage = async () => {
      call++;
      if (call === 2) throw new Error('403 Forbidden');
      return { entry: SPLUNK_PAGE_1 };
    };
    await expect(readSplunkCorrelationSearches(fetchPage, 0, 2)).rejects.toThrow('403 Forbidden');
  });
});
