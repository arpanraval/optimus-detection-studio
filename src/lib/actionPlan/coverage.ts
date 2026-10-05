/** Coverage comes from observed remote rules, never from a local workflow label. */
export interface DeployedDetection {
  id: string;
  name: string;
  mitreAttackIds: string[];
  mitreTactics: string[];
  queryLanguage: string;
}

export interface CoverageBinding {
  detection_id: string;
  binding_status: string;
  availability: string;
  observed_enabled: boolean | null;
  detection: { library_type: string } | null;
  snapshot: { content: unknown } | null;
}

function record(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
}

/** Read the same structured ATT&CK fields as siem_native_attack_metadata, not arbitrary query text. */
export function observedAttackIds(config: Record<string, unknown>): string[] {
  const fields = [
    config.technique, config.techniques, config.mitreTechniques, config.threat,
    config['action.correlationsearch.annotations'], record(config.fields).mitre_attack,
  ];
  return [...new Set((JSON.stringify(fields).match(/\bT\d{4}(?:\.\d{3})?\b/g) ?? []))];
}

export function deployedDetectionsFromBindings(bindings: CoverageBinding[]): DeployedDetection[] {
  const deployed = new Map<string, DeployedDetection>();
  for (const binding of bindings) {
    if (
      binding.detection?.library_type !== 'production' ||
      binding.binding_status !== 'active' ||
      binding.availability !== 'present' ||
      binding.observed_enabled !== true ||
      !binding.snapshot
    ) continue;

    const content = record(binding.snapshot.content);
    // Missing or contradictory snapshots cannot substantiate deployed coverage.
    if (content.enabled !== true) continue;
    const config = record(content.config);
    const previous = deployed.get(binding.detection_id);
    const tactics = Array.isArray(config.tactics) ? config.tactics.filter((v): v is string => typeof v === 'string') : [];
    deployed.set(binding.detection_id, {
      id: binding.detection_id,
      name: typeof content.name === 'string' ? content.name : '',
      queryLanguage: typeof content.language === 'string' ? content.language : '',
      mitreAttackIds: [...new Set([...(previous?.mitreAttackIds ?? []), ...observedAttackIds(config)])],
      mitreTactics: [...new Set([...(previous?.mitreTactics ?? []), ...tactics])],
    });
  }
  return [...deployed.values()];
}

interface Candidate {
  id: string;
  mitreAttackIds: string[];
  library_type?: string;
}

/** Including My Lab changes available work, never the set of deployed techniques. */
export function partitionActionPlan<T extends Candidate>(
  deployed: DeployedDetection[],
  compatible: T[],
  includeMyLab: boolean,
) {
  const deployedIds = new Set(deployed.map((d) => d.id));
  const coveredTechniqueIds = new Set(deployed.flatMap((d) => d.mitreAttackIds));
  const candidates = compatible.filter((d) =>
    !deployedIds.has(d.id) &&
    (d.library_type === 'production' || (includeMyLab && d.library_type === 'development')) &&
    d.mitreAttackIds.some((id) => id && !coveredTechniqueIds.has(id)),
  );
  const candidateTechniqueIds = new Set(
    candidates.flatMap((d) => d.mitreAttackIds).filter((id) => id && !coveredTechniqueIds.has(id)),
  );
  return { coveredTechniqueIds, candidateTechniqueIds, candidates };
}
