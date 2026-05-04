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
