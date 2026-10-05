import type { ProfileIntelligence, RecommendedDetection } from '@/hooks/useProfileIntelligence';
import { isSiemDetectable } from '@/lib/prioritization/prioritizationEngine';

export type TechniqueBucket = 'candidates' | 'research' | 'covered';

export interface PlanTechnique {
  id: string;
  name: string;
  groups: string[];
  bucket: TechniqueBucket;
  siemDetectable: boolean;
  candidates: RecommendedDetection[];
  evidence: ProfileIntelligence['deployedDetections'];
}

/** One denominator throughout: the union of techniques used by profile-matched groups. */
export function buildActionPlanPreview(
  intel: Pick<
    ProfileIntelligence,
    'groupTechniqueDetails' | 'threatGroups' | 'deployedDetections' | 'recommendedDetections'
  >,
) {
  const techniqueMap = new Map<string, { name: string; groups: Set<string> }>();
  for (const group of intel.threatGroups) {
    for (const detail of intel.groupTechniqueDetails[group.stixId] ?? []) {
      const entry = techniqueMap.get(detail.mitreId) ?? { name: detail.name, groups: new Set<string>() };
      entry.groups.add(group.name);
      techniqueMap.set(detail.mitreId, entry);
    }
  }
  const uniqueCandidates = [...new Map(intel.recommendedDetections.map((d) => [d.id, d])).values()];
  const techniques: PlanTechnique[] = [...techniqueMap].map(([id, { name, groups }]) => {
    const evidence = intel.deployedDetections.filter((d) => d.mitreAttackIds.includes(id));
    const candidates = evidence.length
      ? []
      : uniqueCandidates
          .filter((d) => d.mitreAttackIds.includes(id))
          .sort(
            (a, b) => b.priorityScore - a.priorityScore || a.name.localeCompare(b.name) || a.id.localeCompare(b.id),
          );
    return {
      id,
      name,
      groups: [...groups].sort(),
      evidence,
      candidates,
      siemDetectable: isSiemDetectable(id),
      bucket: evidence.length ? 'covered' : candidates.length ? 'candidates' : 'research',
    };
  });
  techniques.sort((a, b) => b.groups.length - a.groups.length || a.id.localeCompare(b.id));
  const covered = techniques.filter((t) => t.bucket === 'covered');
  const candidates = techniques.filter((t) => t.bucket === 'candidates');
  const research = techniques.filter((t) => t.bucket === 'research');
  const relevantIds = new Set(candidates.flatMap((t) => t.candidates.map((d) => d.id)));
  const relevantCandidates = uniqueCandidates.filter((d) => relevantIds.has(d.id));
  return { techniques, covered, candidates, research, relevantCandidates, total: techniques.length };
}

export type ActionPlanPreviewModel = ReturnType<typeof buildActionPlanPreview>;

/** A projection is a union of currently uncovered, in-scope technique IDs, never a sum of rule counts. */
export function projectReviewBatch(model: ActionPlanPreviewModel, detectionIds: string[]) {
  const selected = new Set(detectionIds);
  const detections = model.relevantCandidates.filter((d) => selected.has(d.id));
  const techniques = model.candidates.filter((t) => t.candidates.some((d) => selected.has(d.id)));
  return { detections, techniques, potentialCovered: model.covered.length + techniques.length };
}

/** Greedy review suggestion: largest remaining in-scope gain, then existing priority score. */
export function suggestReviewBatch(model: ActionPlanPreviewModel, limit = 5): string[] {
  const remaining = new Set(model.candidates.map((t) => t.id));
  const selected: string[] = [];
  while (selected.length < limit) {
    const ranked = model.relevantCandidates
      .filter((d) => !selected.includes(d.id))
      .map((d) => ({
        detection: d,
        gain: new Set(d.mitreAttackIds.filter((id) => remaining.has(id))).size,
      }))
      .filter((d) => d.gain > 0)
      .sort(
        (a, b) =>
          b.gain - a.gain ||
          b.detection.priorityScore - a.detection.priorityScore ||
          a.detection.id.localeCompare(b.detection.id),
      );
    const next = ranked[0]?.detection;
    if (!next) break;
    selected.push(next.id);
    next.mitreAttackIds.forEach((id) => remaining.delete(id));
  }
  return selected;
}
