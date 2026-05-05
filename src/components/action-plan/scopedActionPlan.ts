import type { TechBucket } from '../../lib/actionPlan/technologyBuckets';

interface DetectionLike {
  id: string;
  mitreAttackIds?: string[];
  threatGroupNames?: string[];
}

interface GapLike {
  mitreId: string;
  name: string;
  threatGroupCount?: number;
  threatGroupNames?: string[];
}

type BucketMap = Map<string, Set<TechBucket>>;

function detectionTouchesBucket(
  d: DetectionLike,
  bucket: TechBucket,
  buckets: BucketMap,
): boolean {
  const ids = d.mitreAttackIds ?? [];
  for (const id of ids) {
    if (buckets.get(id)?.has(bucket)) return true;
  }
  return false;
}

export function filterDetectionsByBucket<T extends DetectionLike>(
  detections: T[],
  bucket: TechBucket,
  buckets: BucketMap,
): T[] {
  return detections.filter(d => detectionTouchesBucket(d, bucket, buckets));
}

export function filterGapsByBucket<T extends GapLike>(
  gaps: T[],
  bucket: TechBucket,
  buckets: BucketMap,
): T[] {
  return gaps.filter(g => buckets.get(g.mitreId)?.has(bucket) ?? false);
}

export function bucketCountsFor(
  detections: DetectionLike[],
  buckets: BucketMap,
): Record<TechBucket, number> {
  const out: Record<TechBucket, number> = {
    endpoint: 0,
    cloud: 0,
    identity: 0,
    saas: 0,
    network: 0,
  };
  for (const d of detections) {
    const seen = new Set<TechBucket>();
    for (const id of d.mitreAttackIds ?? []) {
      const set = buckets.get(id);
      if (!set) continue;
      for (const b of set) seen.add(b);
    }
    for (const b of seen) out[b] += 1;
  }
  return out;
}

interface TechniqueLike {
  mitreId: string;
  covered: boolean;
}

interface TacticCoverageLike {
  techniques: TechniqueLike[];
}

/**
 * For a given bucket, count how many of the threat-relevant techniques are covered.
 * Used by the landing page widget to show coverage % per bucket — the same
 * metric ThreatLandscapeWidget shows for actor groups.
 */
export function bucketCoverage(
  tacticCoverage: TacticCoverageLike[],
  bucket: TechBucket,
  buckets: BucketMap,
): { covered: number; total: number; pct: number } {
  let covered = 0;
  let total = 0;
  const seen = new Set<string>();
  for (const t of tacticCoverage) {
    for (const tech of t.techniques) {
      if (seen.has(tech.mitreId)) continue;
      if (!buckets.get(tech.mitreId)?.has(bucket)) continue;
      seen.add(tech.mitreId);
      total++;
      if (tech.covered) covered++;
    }
  }
  const pct = total === 0 ? 100 : Math.round((covered / total) * 100);
  return { covered, total, pct };
}

export function filterDetectionsByThreatGroup<T extends DetectionLike>(
  detections: T[],
  groupName: string,
): T[] {
  const norm = groupName.toLowerCase().trim();
  return detections.filter(d =>
    (d.threatGroupNames ?? []).some(g => g.toLowerCase().trim() === norm),
  );
}

export function filterGapsByThreatGroup<T extends GapLike>(
  gaps: T[],
  groupName: string,
): T[] {
  const norm = groupName.toLowerCase().trim();
  return gaps.filter(g =>
    (g.threatGroupNames ?? []).some(n => n.toLowerCase().trim() === norm),
  );
}
