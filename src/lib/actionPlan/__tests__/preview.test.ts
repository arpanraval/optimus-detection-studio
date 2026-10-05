import { describe, expect, it } from 'vitest';
import { candidate, fixture } from './preview.fixtures';
import { buildActionPlanPreview, projectReviewBatch, suggestReviewBatch } from '../preview';

describe('action plan preview: a consistent threat scope', () => {
  it('partitions unique techniques across groups and counts observations rather than detail flags', () => {
    const model = buildActionPlanPreview(fixture());
    expect([model.total, model.covered.length, model.candidates.length, model.research.length]).toEqual([4, 1, 2, 1]);
    expect(model.relevantCandidates.map((d) => d.id)).toEqual(['one', 'two']);
    expect(model.research[0].siemDetectable).toBe(false);
  });
  it('projects only uncovered in-scope IDs, deduplicating overlapping candidates and repeated IDs', () => {
    const model = buildActionPlanPreview(fixture());
    const projection = projectReviewBatch(model, ['one', 'two', 'one', 'outside', 'removed']);
    expect(projection.detections).toHaveLength(2);
    expect(projection.techniques.map((t) => t.id)).toEqual(['T1002', 'T1003']);
    expect(projection.potentialCovered).toBe(3);
  });
  it('adding thousands of unrelated rules does not change coverage or projection', () => {
    const intel = fixture();
    const before = buildActionPlanPreview(intel);
    intel.recommendedDetections.push(...Array.from({ length: 10000 }, (_, i) => candidate(`extra-${i}`, ['T9999'])));
    const after = buildActionPlanPreview(intel);
    expect(after.total).toBe(before.total);
    expect(after.covered).toEqual(before.covered);
    expect(after.relevantCandidates).toEqual(before.relevantCandidates);
  });
  it('removing library candidates changes available work, never observed coverage', () => {
    const intel = fixture();
    intel.recommendedDetections = [];
    const model = buildActionPlanPreview(intel);
    expect([model.covered.length, model.candidates.length, model.research.length]).toEqual([1, 0, 3]);
    expect(projectReviewBatch(model, ['one']).potentialCovered).toBe(1);
  });
  it('suggests new unique gain before score and does not pad the batch with overlapping rules', () => {
    const intel = fixture();
    intel.recommendedDetections[0].mitreAttackIds.push('T1002');
    expect(suggestReviewBatch(buildActionPlanPreview(intel))).toEqual(['one']);
    intel.recommendedDetections[0].mitreAttackIds = ['T1002'];
    expect(suggestReviewBatch(buildActionPlanPreview(intel))).toEqual(['two']);
  });
  it('deduplicates candidates and treats missing threat scope as unavailable', () => {
    const intel = fixture();
    intel.recommendedDetections.push(intel.recommendedDetections[0]);
    expect(buildActionPlanPreview(intel).candidates[0].candidates).toHaveLength(2);
    intel.groupTechniqueDetails = {};
    const model = buildActionPlanPreview(intel);
    expect(model.total).toBe(0);
    expect(suggestReviewBatch(model)).toEqual([]);
  });
});
