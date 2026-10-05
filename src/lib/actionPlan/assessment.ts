import type { ProfileIntelligence, RecommendedDetection } from '@/hooks/useProfileIntelligence';
import type { EnvironmentProfile } from '@/types/environment';
import type { MatchResult } from '@/services/logSourceDiscovery';
import { buildActionPlanPreview, type PlanTechnique } from './preview';

export type AssessmentActionKind = 'prerequisite' | 'validate' | 'reuse' | 'research';
export interface AssessmentAction {
  id: string;
  kind: AssessmentActionKind;
  title: string;
  reason: string;
  evidence: string;
  result: string;
  steps: string[];
  doneWhen: string;
  techniques: PlanTechnique[];
  groups: string[];
  ruleId?: string;
  ruleName?: string;
  alternatives: RecommendedDetection[];
  candidate?: RecommendedDetection;
  destination: 'rule' | 'siem' | 'environment' | 'sources';
  blocking?: boolean;
}

/** Assessment actions, not a target rule count or a set-cover optimization over ATT&CK tags. */
export function buildDetectionAssessment(
  intel: ProfileIntelligence,
  profile: EnvironmentProfile,
  matches: MatchResult | null,
) {
  const mapping = buildActionPlanPreview(intel);
  const actions: AssessmentAction[] = [];
  const observed = [...new Map(intel.deployedDetections.map((d) => [d.id, d])).values()];
  const unmapped = observed.filter((d) => d.mitreAttackIds.length === 0);
  const localMetadata = new Map((matches?.matchedDetections ?? []).map((d) => [d.id, d]));
  const hasTelemetry = !!(
    profile.log_sources?.length ||
    profile.custom_log_sources?.length ||
    profile.edr_tools?.length ||
    Object.values(profile.cloud_platforms ?? {}).some((p) => p?.enabled)
  );
  const base = {
    techniques: [] as PlanTechnique[],
    groups: [] as string[],
    alternatives: [] as RecommendedDetection[],
  };

  if (!observed.length)
    actions.push({
      ...base,
      id: 'establish-baseline',
      kind: 'prerequisite',
      blocking: true,
      title: 'Establish the production baseline',
      reason:
        'No enabled, linked production detections are available to this assessment. This does not prove that your SIEM has no rules.',
      evidence: 'Production baseline unavailable',
      result: 'Know what already runs before deciding to add detections.',
      steps: [
        'Fetch the selected integrations and confirm the fetch completed.',
        'Import or link the production rules you want assessed; check enabled state.',
      ],
      doneWhen: 'The inventory has been checked and production rules are linked with saved observations.',
      destination: 'siem',
    });
  if (!hasTelemetry)
    actions.push({
      ...base,
      id: 'confirm-telemetry',
      kind: 'prerequisite',
      blocking: true,
      title: 'Confirm the telemetry available for detection',
      reason: 'Your profile does not identify usable log sources, EDR, or cloud telemetry.',
      evidence: 'Telemetry configuration missing',
      result: 'Evaluate content against the data you actually collect.',
      steps: [
        'Record available log sources in the environment profile.',
        'Confirm sample events and required fields in the target platform.',
      ],
      doneWhen: 'The profile is configured and representative events have been verified.',
      destination: 'environment',
    });
  if (!profile.siem_platforms?.length)
    actions.push({
      ...base,
      id: 'confirm-platform',
      kind: 'prerequisite',
      blocking: true,
      title: 'Choose the platform for this detection plan',
      reason: 'No target detection platform is selected in the environment profile.',
      evidence: 'Target platform unspecified',
      result: 'Evaluate candidate queries against the platform you will use.',
      steps: [
        'Select the SIEM or endpoint platform in the environment profile.',
        'Confirm that the corresponding integration and production inventory are available.',
      ],
      doneWhen: 'The plan has a target platform and an inspectable production baseline.',
      destination: 'environment',
    });
  if (unmapped.length)
    actions.push({
      ...base,
      id: 'check-production-mappings',
      kind: 'prerequisite',
      title: `Check ATT&CK mappings on ${unmapped.length} enabled ${unmapped.length === 1 ? 'rule' : 'rules'}`,
      reason:
        'These enabled rules have no ATT&CK mappings in their remote snapshots. Review them alongside the suggested candidates to avoid duplicating existing behavior.',
      evidence: `${unmapped.length} enabled rules without remote mappings`,
      result: 'Avoid building a rule for behavior already detected in production.',
      steps: [
        'Review what each unmapped rule actually detects.',
        'Correct mappings only where supported by the query, then refresh the inventory.',
      ],
      doneWhen: 'Existing rule behavior has been checked before treating an absent mapping as a detection need.',
      destination: 'siem',
    });
  if (!mapping.total)
    actions.push({
      ...base,
      id: 'define-threat-scope',
      kind: 'prerequisite',
      blocking: true,
      title: 'Confirm which threats matter to this environment',
      reason: 'No technique scope could be derived from your profile and stored targeting intelligence.',
      evidence: 'Threat relevance unavailable',
      result: 'Prioritize behaviors relevant to your systems and organization.',
      steps: [
        'Confirm sector, country and critical assets in the profile.',
        'Check that MITRE and threat-targeting data are available.',
      ],
      doneWhen: 'The profile and intelligence data support a relevant threat scope.',
      destination: 'environment',
    });

  // Offer one focused validation task, not a demand to retest the entire production inventory.
  const validationNeed = mapping.covered.find((t) =>
    t.evidence.some((d) => localMetadata.get(d.id)?.testedAndValidated !== true),
  );
  if (validationNeed) {
    const rule = validationNeed.evidence.find((d) => localMetadata.get(d.id)?.testedAndValidated !== true)!;
    actions.push({
      id: `validate:${rule.id}`,
      kind: 'validate',
      title: `Validate existing detection for ${validationNeed.name}`,
      reason: `A production rule already maps to this behavior used by ${validationNeed.groups.join(', ')}. Check that rule before considering another.`,
      evidence: 'Observed enabled · test evidence not established by this assessment',
      result: 'Establish whether the existing rule detects this behavior; no new rule is proposed.',
      steps: [
        'Review the existing query, required events and intended behavior.',
        'Run preflight, test a representative scenario, and review noise or tuning needs.',
      ],
      doneWhen: 'A representative test and noise review support keeping or tuning the existing detection.',
      techniques: [validationNeed],
      groups: validationNeed.groups,
      ruleId: rule.id,
      ruleName: rule.name,
      alternatives: [],
      destination: 'rule',
    });
  }

  // Prioritize needs by relevant groups; prefer usable candidates by native language, validation flag,
  // and content quality. Number of claimed ATT&CK mappings does not improve a candidate's ranking.
  const compare = (a: RecommendedDetection, b: RecommendedDetection) =>
    Number(b.siemReady) - Number(a.siemReady) ||
    Number(b.testedAndValidated) - Number(a.testedAndValidated) ||
    b.qualityScore - a.qualityScore ||
    a.id.localeCompare(b.id);
  const reuseByRule = new Map<string, AssessmentAction>();
  const assigned = new Set<string>();
  for (const need of mapping.candidates.filter((t) => t.siemDetectable)) {
    if (assigned.has(need.id)) continue;
    const options = [...need.candidates].sort(compare);
    const candidate = options[0];
    if (!candidate) continue;
    // If a selected rule is also the preferred option for another need, make it one task, not two rules.
    let action = reuseByRule.get(candidate.id);
    if (!action) {
      action = {
        id: `reuse:${candidate.id}`,
        kind: 'reuse',
        title: `Evaluate an existing rule for ${need.name}`,
        reason: `This behavior is used by ${need.groups.join(', ')} and has no matching enabled-rule mapping in the assessed baseline.`,
        evidence: `${candidate.queryLanguage} · configured telemetry match · runtime data not verified${unmapped.length ? ` · ${unmapped.length} enabled rules have unconfirmed mappings; check for overlap before adding this rule` : ''}`,
        result:
          'Decide whether this existing content can become a tested production detection, rather than writing from scratch.',
        steps: [
          'Check for an equivalent production rule, including rules with incomplete mappings.',
          candidate.siemReady
            ? 'Verify the target platform, required tables, fields and sample events.'
            : 'Convert the query for the target platform, then verify its tables, fields and sample events.',
          'Adapt and document the query; run preflight and behavior tests, then tune.',
          'Deploy only after validation, and fetch inventory to confirm enabled state.',
        ],
        doneWhen:
          'The candidate is accepted or rejected with evidence; accepted content is tested, tuned and observed enabled after deployment.',
        techniques: [],
        groups: [],
        ruleId: candidate.id,
        ruleName: candidate.name,
        candidate,
        alternatives: [],
        destination: 'rule',
      };
      reuseByRule.set(candidate.id, action);
    }
    action.techniques.push(need);
    action.groups = [...new Set([...action.groups, ...need.groups])];
    action.alternatives = [...new Map([...action.alternatives, ...options.slice(1)].map((d) => [d.id, d])).values()];
    assigned.add(need.id);
  }
  const blocked = actions.some((a) => a.blocking);
  // Missing baseline/platform/telemetry/scope prevents useful recommendations. Partial mappings only add uncertainty;
  // keep the mapping review alongside candidates, whose first step checks existing rule behavior for overlap.
  if (!blocked) actions.push(...reuseByRule.values());
  if (mapping.research.length || mapping.candidates.some((t) => !t.siemDetectable)) {
    const needs = [...mapping.research, ...mapping.candidates.filter((t) => !t.siemDetectable)];
    actions.push({
      id: 'investigate-open-needs',
      kind: 'research',
      title: 'Investigate unresolved detection needs',
      reason:
        'Missing library matches are not a requirement to write one rule per technique. Applicability, telemetry, existing rule behavior and alternate controls still need checking.',
      evidence: 'Detection requirement not yet established',
      result: 'Decide whether to reuse content, enable data, use another control, or justify a custom detection.',
      steps: [
        'Start with relevant systems and critical assets; confirm the behavior applies.',
        'Check existing production queries and telemetry before calling it a gap.',
        'Search vendor content and consider external intelligence or other controls.',
        'Author a custom rule only when the need and data are confirmed and existing content is unsuitable.',
      ],
      doneWhen: 'A specific need has an evidenced disposition, not simply an absent ATT&CK mapping.',
      techniques: needs,
      groups: [...new Set(needs.flatMap((t) => t.groups))],
      alternatives: [],
      destination: 'sources',
    });
  }
  return {
    mapping,
    actions,
    observed,
    unmapped,
    blocked,
    candidateActions: [...reuseByRule.values()],
    /** A first review batch, not a complete deployment target. Prerequisites precede expansion. */
    nextActionIds: actions
      .filter((a) =>
        blocked ? a.blocking : a.kind !== 'research' || !actions.some((task) => task.kind !== 'research'),
      )
      .slice(0, 5)
      .map((a) => a.id),
  };
}
export type DetectionAssessment = ReturnType<typeof buildDetectionAssessment>;

export function summarizeAssessmentActions(actions: AssessmentAction[]) {
  return {
    actions: actions.length,
    validate: actions.filter((a) => a.kind === 'validate').length,
    reuse: actions.filter((a) => a.kind === 'reuse').length,
    prerequisites: actions.filter((a) => a.kind === 'prerequisite').length,
    research: actions.filter((a) => a.kind === 'research').length,
    behaviors: [
      ...new Map(
        actions
          .filter((a) => a.kind === 'reuse')
          .flatMap((a) => a.techniques)
          .map((t) => [t.id, t]),
      ).values(),
    ],
  };
}
