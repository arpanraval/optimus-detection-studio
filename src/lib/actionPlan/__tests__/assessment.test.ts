import { describe, expect, it } from 'vitest';
import type { EnvironmentProfile } from '@/types/environment';
import type { MatchResult } from '@/services/logSourceDiscovery';
import { buildDetectionAssessment, summarizeAssessmentActions } from '../assessment';
import { candidate, fixture } from './preview.fixtures';

export const assessmentProfile = {
  sectors: ['Finance'],
  user_country: 'United States',
  siem_platforms: ['Microsoft Sentinel'],
  log_sources: ['windows_security'],
  custom_log_sources: [],
  edr_tools: [],
  cloud_platforms: {},
} as EnvironmentProfile;

describe('practical detection assessment', () => {
  it('makes one reuse task per preferred rule, with distinct named needs and alternatives', () => {
    const plan = buildDetectionAssessment(fixture(), assessmentProfile, null);
    const reuse = plan.actions.filter((a) => a.kind === 'reuse');
    expect(reuse).toHaveLength(1);
    expect(reuse[0].techniques.map((t) => t.id)).toEqual(['T1002', 'T1003']);
    expect(reuse[0].alternatives.map((d) => d.id)).toEqual(['two']);
    expect(plan.actions.filter((a) => a.kind === 'validate')).toHaveLength(1);
    expect(plan.actions.filter((a) => a.kind === 'research')).toHaveLength(1);
    expect(summarizeAssessmentActions(plan.actions).behaviors).toHaveLength(2);
  });
  it('does not turn thousands of equivalent vendor candidates into thousands of actions', () => {
    const intel = fixture();
    intel.recommendedDetections.push(
      ...Array.from({ length: 3000 }, (_, i) => candidate(`variant-${i}`, ['T1002', 'T1003'])),
    );
    const plan = buildDetectionAssessment(intel, assessmentProfile, null);
    expect(plan.actions.filter((a) => a.kind === 'reuse')).toHaveLength(1);
    expect(plan.nextActionIds).toHaveLength(2);
    expect(summarizeAssessmentActions(plan.actions).behaviors).toHaveLength(2);
  });
  it('prefers recorded suitability over a broad list of claimed ATT&CK mappings or a high priority score', () => {
    const intel = fixture();
    const broad = candidate(
      'a-broad',
      ['T1002', 'T1003', ...Array.from({ length: 200 }, (_, i) => `T${2000 + i}`)],
      999,
    );
    broad.qualityScore = 0;
    intel.recommendedDetections.push(broad);
    const plan = buildDetectionAssessment(intel, assessmentProfile, null);
    expect(plan.actions.filter((a) => a.kind === 'reuse').map((a) => a.ruleId)).not.toContain('a-broad');
    expect(summarizeAssessmentActions(plan.actions).behaviors).toHaveLength(2);
  });
  it('checks existing production coverage before suggesting new content for the same need', () => {
    const intel = fixture();
    intel.deployedDetections[0].mitreAttackIds.push('T1002');
    const plan = buildDetectionAssessment(intel, assessmentProfile, null);
    expect(plan.actions.filter((a) => a.kind === 'reuse').flatMap((a) => a.techniques.map((t) => t.id))).toEqual([
      'T1003',
    ]);
    expect(plan.actions.find((a) => a.kind === 'validate')?.result).toContain('no new rule');
  });
  it('blocks expansion when production evidence is unavailable, without claiming no rules exist', () => {
    const intel = fixture();
    intel.deployedDetections = [];
    const plan = buildDetectionAssessment(intel, assessmentProfile, null);
    expect(plan.blocked).toBe(true);
    expect(plan.actions.some((a) => a.kind === 'reuse')).toBe(false);
    expect(plan.nextActionIds).toContain('establish-baseline');
    expect(plan.actions[0].reason).toContain('does not prove');
  });
  it('keeps mapping review alongside recommendations instead of blocking the whole assessment', () => {
    const intel = fixture();
    intel.deployedDetections.push({
      id: 'unmapped',
      name: 'Unknown behavior',
      mitreAttackIds: [],
      mitreTactics: [],
      queryLanguage: 'KQL',
    });
    const plan = buildDetectionAssessment(intel, assessmentProfile, null);
    expect(plan.blocked).toBe(false);
    expect(plan.nextActionIds).toContain('check-production-mappings');
    const reuse = plan.actions.find((a) => a.kind === 'reuse')!;
    expect(plan.nextActionIds).toContain(reuse.id);
    expect(reuse.evidence).toContain('check for overlap');
    expect(reuse.steps[0]).toContain('equivalent production rule');
  });
  it('requires telemetry and platform selection before adding candidates', () => {
    const plan = buildDetectionAssessment(
      fixture(),
      { ...assessmentProfile, log_sources: [], siem_platforms: [] },
      null,
    );
    expect(plan.nextActionIds).toContain('confirm-telemetry');
    expect(plan.nextActionIds).toContain('confirm-platform');
    expect(plan.actions.some((a) => a.kind === 'reuse')).toBe(false);
  });
  it('keeps reconnaissance and unmatched techniques as research, never an automatic custom-rule requirement', () => {
    const intel = fixture();
    intel.recommendedDetections.push(candidate('recon', ['T1595']));
    const plan = buildDetectionAssessment(intel, assessmentProfile, null);
    expect(plan.actions.some((a) => a.ruleId === 'recon')).toBe(false);
    const research = plan.actions.find((a) => a.kind === 'research')!;
    expect(research.techniques.map((t) => t.id)).toContain('T1595');
    expect(research.reason).toContain('not a requirement to write one rule per technique');
  });
  it('does not invent a failed test when the local rule is marked validated', () => {
    const intel = fixture();
    const matches = { matchedDetections: [{ id: 'enabled', testedAndValidated: true }] } as MatchResult;
    expect(buildDetectionAssessment(intel, assessmentProfile, matches).actions.some((a) => a.kind === 'validate')).toBe(
      false,
    );
  });
  it('keeps the first batch bounded while larger libraries remain options', () => {
    const intel = fixture();
    for (let i = 0; i < 15; i++) {
      const id = `T${3000 + i}`;
      intel.groupTechniqueDetails.a.push({ mitreId: id, name: id, covered: false });
      intel.recommendedDetections.push(candidate(`extra-${i}`, [id]));
    }
    const plan = buildDetectionAssessment(intel, assessmentProfile, null);
    expect(plan.nextActionIds).toHaveLength(5);
    expect(new Set(plan.nextActionIds).size).toBe(5);
    expect(plan.actions.filter((a) => a.kind === 'research')).toHaveLength(1);
  });
  it('suggests investigation when no validation or reuse task remains', () => {
    const intel = fixture();
    intel.recommendedDetections = [];
    const matches = { matchedDetections: [{ id: 'enabled', testedAndValidated: true }] } as MatchResult;
    const plan = buildDetectionAssessment(intel, assessmentProfile, matches);
    expect(plan.nextActionIds).toEqual(['investigate-open-needs']);
  });
});
