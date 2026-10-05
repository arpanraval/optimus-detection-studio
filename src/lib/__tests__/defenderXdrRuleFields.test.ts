import { describe, expect, it } from 'vitest';
import { normalizeVendorRule } from '../integrationService';
import {
  legacyShapeRule,
  currentShapeRule,
  noStateShapeRule,
  continuousLegacyShapeRule,
} from '../../../supabase/functions/_shared/__tests__/fixtures/defender-xdr-list';

// Microsoft removes `isEnabled` and `schedule.period` on 2026-10-01 (Graph
// beta security-detectionrule / security-ruleschedule docs, dated
// 2026-05-25). These tests pin the dual read: prefer the current field,
// fall back to the deprecated one, and never call a missing state "disabled".
describe('Defender XDR field deprecation (isEnabled/schedule.period -> status/schedule.frequency)', () => {
  it('reads a legacy-shape disabled rule as disabled', () => {
    const rule = normalizeVendorRule(legacyShapeRule, 'defender_xdr', 'int-1', 'My Defender');
    expect(rule.observedState).toBe('disabled');
    expect(rule.enabled).toBe(false);
  });

  it('reads a current-shape autoDisabled rule as disabled, with the autoDisabled reason preserved', () => {
    const rule = normalizeVendorRule(currentShapeRule, 'defender_xdr', 'int-1', 'My Defender');
    expect(rule.observedState).toBe('disabled');
    expect(rule.enabled).toBe(false);
    expect(rule.rawMetadata.stateReason).toBe('autoDisabled');
  });

  it('calls a rule with neither state field unknown, never disabled', () => {
    const rule = normalizeVendorRule(noStateShapeRule, 'defender_xdr', 'int-1', 'My Defender');
    expect(rule.observedState).toBe('unknown');
    expect(rule.enabled).toBe(false); // boolean projection stays false, but observedState is the source of truth
  });

  it('reads the deprecated schedule.period', () => {
    const rule = normalizeVendorRule(legacyShapeRule, 'defender_xdr', 'int-1', 'My Defender');
    expect(rule.schedule).toBe('24H');
  });

  it('reads the current schedule.frequency (ISO-8601 duration) over the deprecated period', () => {
    const rule = normalizeVendorRule(currentShapeRule, 'defender_xdr', 'int-1', 'My Defender');
    expect(rule.schedule).toBe('PT1H');
  });

  it('represents a continuous legacy schedule (period === "0") as continuous, not a fake interval', () => {
    const rule = normalizeVendorRule(continuousLegacyShapeRule, 'defender_xdr', 'int-1', 'My Defender');
    expect(rule.schedule).toBe('continuous');
  });

  it('preserves mitreTechniques from the alert template', () => {
    const rule = normalizeVendorRule(legacyShapeRule, 'defender_xdr', 'int-1', 'My Defender');
    expect((rule.rawMetadata as any).detectionAction.alertTemplate.mitreTechniques).toEqual(['T1204']);
  });

  it('preserves organizationalScope and responseActions even though the current docs omit them', () => {
    const rule = normalizeVendorRule(legacyShapeRule, 'defender_xdr', 'int-1', 'My Defender');
    expect((rule.rawMetadata as any).detectionAction.organizationalScope).toEqual({ deviceGroups: ['all'] });
    expect((rule.rawMetadata as any).detectionAction.responseActions).toEqual([{ action: 'isolateDevice' }]);
  });

  it('preserves automatedActions on the current shape', () => {
    const rule = normalizeVendorRule(currentShapeRule, 'defender_xdr', 'int-1', 'My Defender');
    expect((rule.rawMetadata as any).detectionAction.automatedActions).toEqual([{ action: 'requireMfa' }]);
  });
});
