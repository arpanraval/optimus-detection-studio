// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { normalizeDefenderEntry, readDefenderXdrRules, DEFENDER_XDR_PREVIEW } from '../siem-readers/defender-xdr.ts';
import {
  DEFENDER_RULE_STATUS_ONLY, DEFENDER_RULE_DEPRECATED_ONLY, DEFENDER_RULE_AUTO_DISABLED,
  DEFENDER_RULE_UNKNOWN_FUTURE_VALUE, DEFENDER_RULE_CONTINUOUS, DEFENDER_RULE_NO_DESCRIPTION_UNKNOWN_FIELD,
  DEFENDER_RULE_TENANT_A, DEFENDER_RULE_TENANT_B, DEFENDER_PAGE_1, DEFENDER_PAGE_2,
  DEFENDER_RULE_MITRE_TACTICS_ONLY, DEFENDER_RULE_MITRE_FIELD_ONLY, DEFENDER_RULE_MITRE_NONE,
} from './fixtures/defender-xdr-list.ts';

describe('Defender XDR custom-detection-rule reader', () => {
  it('is shipped behind an explicit Preview capability', () => {
    expect(DEFENDER_XDR_PREVIEW).toBe(true);
  });

  it('reads status/frequency when present and preserves MITRE mapping', () => {
    const rule = normalizeDefenderEntry(DEFENDER_RULE_STATUS_ONLY);
    expect(rule.observedState).toBe('enabled');
    expect(rule.statusSource).toBe('status');
    expect(rule.frequency).toBe('PT1H');
    expect(rule.scheduleSource).toBe('frequency');
    expect(rule.mitreTechniques).toEqual(['T1059.001']);
    expect(rule.automatedActions).toBeTruthy();
  });

  it('falls back to the deprecated isEnabled/period fields when status/frequency are absent', () => {
    const rule = normalizeDefenderEntry(DEFENDER_RULE_DEPRECATED_ONLY);
    expect(rule.observedState).toBe('enabled');
    expect(rule.statusSource).toBe('isEnabled');
    expect(rule.frequency).toBe('24H');
    expect(rule.scheduleSource).toBe('period');
    expect(rule.detectorId).toBe('legacy-detector-123');
  });

  it('maps autoDisabled to disabled while preserving the reason', () => {
    const rule = normalizeDefenderEntry(DEFENDER_RULE_AUTO_DISABLED);
    expect(rule.observedState).toBe('disabled');
    expect(rule.autoDisabled).toBe(true);
    expect(rule.status).toBe('autoDisabled');
  });

  it('maps unknownFutureValue to unknown, never disabled', () => {
    const rule = normalizeDefenderEntry(DEFENDER_RULE_UNKNOWN_FUTURE_VALUE);
    expect(rule.observedState).toBe('unknown');
  });

  it('preserves period "0" as continuous, never converting it into a fake interval', () => {
    const rule = normalizeDefenderEntry(DEFENDER_RULE_CONTINUOUS);
    expect(rule.continuous).toBe(true);
    expect(rule.frequency).toBeNull();
  });

  it('tolerates an absent description and preserves an unknown/undocumented field', () => {
    const rule = normalizeDefenderEntry(DEFENDER_RULE_NO_DESCRIPTION_UNKNOWN_FIELD);
    expect(rule.description).toBe('');
    expect(rule.unmappedFields.some(field => field.includes('organizationalScope'))).toBe(true);
  });

  it('distinguishes identical display names across two tenants by id (G21)', () => {
    const a = normalizeDefenderEntry(DEFENDER_RULE_TENANT_A);
    const b = normalizeDefenderEntry(DEFENDER_RULE_TENANT_B);
    expect(a.displayName).toBe(b.displayName);
    expect(a.vendorRuleId).not.toBe(b.vendorRuleId);
  });

  it('reads MITRE techniques from the observed tenant field (alertTemplate.mitreTechniques)', () => {
    const rule = normalizeDefenderEntry(DEFENDER_RULE_MITRE_FIELD_ONLY);
    expect(rule.mitreTechniques).toEqual(['T1105', 'T1566']);
    expect(rule.mitreTechniquesSource).toBe('mitreTechniques');
  });

  it('reads MITRE techniques from the documented tactics[].techniques[].technique shape', () => {
    const rule = normalizeDefenderEntry(DEFENDER_RULE_MITRE_TACTICS_ONLY);
    expect(rule.mitreTechniques).toEqual(['T1547.001', 'T1112', 'T1564']);
    expect(rule.mitreTechniquesSource).toBe('tactics');
  });

  it('yields an absent MITRE mapping (never fabricated) when neither shape is present', () => {
    const rule = normalizeDefenderEntry(DEFENDER_RULE_MITRE_NONE);
    expect(rule.mitreTechniques).toBeNull();
    expect(rule.mitreTechniquesSource).toBe('none');
  });

  it('merges both MITRE shapes when a rule carries both, deduped, without fabricating extras', () => {
    // DEFENDER_RULE_STATUS_ONLY carries the same T1059.001 on both mitreTechniques and tactics.
    const rule = normalizeDefenderEntry(DEFENDER_RULE_STATUS_ONLY);
    expect(rule.mitreTechniques).toEqual(['T1059.001']);
    expect(rule.mitreTechniquesSource).toBe('both');
  });

  it('never preserves a response action as anything but an inert reference', () => {
    const rule = normalizeDefenderEntry(DEFENDER_RULE_STATUS_ONLY);
    // The normalizer must not expose any method/function that could execute the action -- only
    // plain data.
    expect(typeof rule.automatedActions).not.toBe('function');
  });

  it('follows @odata.nextLink across multiple pages', async () => {
    const seen: string[] = [];
    const fetchPage = async (url: string) => {
      seen.push(url);
      if (url === 'first') return DEFENDER_PAGE_1;
      return DEFENDER_PAGE_2;
    };
    const outcome = await readDefenderXdrRules(fetchPage, 'first');
    expect(seen.length).toBe(2);
    expect(outcome.rules.length).toBe(3);
    expect(outcome.stoppedOnRepeatedCursor).toBe(false);
  });

  it('stops on a repeated nextLink rather than looping forever (G11)', async () => {
    const fetchPage = async () => ({ value: [DEFENDER_RULE_STATUS_ONLY], '@odata.nextLink': 'same-url' });
    const outcome = await readDefenderXdrRules(fetchPage, 'same-url');
    expect(outcome.stoppedOnRepeatedCursor).toBe(true);
  });

  it('never turns a 403 mid-scan into an empty successful result (G18)', async () => {
    const fetchPage = async (url: string) => {
      if (url === 'first') return DEFENDER_PAGE_1;
      throw new Error('403 Forbidden');
    };
    await expect(readDefenderXdrRules(fetchPage, 'first')).rejects.toThrow('403 Forbidden');
  });
});
