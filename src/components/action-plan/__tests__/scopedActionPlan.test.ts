import { describe, it, expect } from 'vitest';
import {
  filterDetectionsByBucket,
  filterGapsByBucket,
  filterDetectionsByThreatGroup,
  filterGapsByThreatGroup,
  bucketCountsFor,
} from '../scopedActionPlan';
import type { TechBucket } from '../../../lib/actionPlan/technologyBuckets';

const BUCKETS = new Map<string, Set<TechBucket>>([
  ['T1003', new Set<TechBucket>(['endpoint'])],
  ['T1078', new Set<TechBucket>(['endpoint', 'cloud', 'identity', 'saas'])],
  ['T1190', new Set<TechBucket>(['cloud', 'saas'])],
  ['T1110', new Set<TechBucket>(['identity'])],
  ['T1046', new Set<TechBucket>(['network'])],
]);

const detections = [
  { id: 'd1', mitreAttackIds: ['T1003'] },
  { id: 'd2', mitreAttackIds: ['T1078', 'T1110'] },
  { id: 'd3', mitreAttackIds: ['T1190'] },
  { id: 'd4', mitreAttackIds: ['T1046'] },
  { id: 'd5', mitreAttackIds: [] },
];

describe('filterDetectionsByBucket', () => {
  it('keeps detections whose techniques touch the bucket', () => {
    const result = filterDetectionsByBucket(detections, 'endpoint', BUCKETS);
    expect(result.map(d => d.id)).toEqual(['d1', 'd2']);
  });

  it('returns empty when no detections match', () => {
    const result = filterDetectionsByBucket([], 'endpoint', BUCKETS);
    expect(result).toEqual([]);
  });

  it('skips detections with empty mitreAttackIds', () => {
    const result = filterDetectionsByBucket(detections, 'network', BUCKETS);
    expect(result.map(d => d.id)).toEqual(['d4']);
  });

  it('handles unknown technique IDs', () => {
    const dets = [{ id: 'd6', mitreAttackIds: ['T9999'] }];
    expect(filterDetectionsByBucket(dets, 'endpoint', BUCKETS)).toEqual([]);
  });
});

describe('bucketCountsFor', () => {
  it('counts unique detections per bucket', () => {
    const counts = bucketCountsFor(detections, BUCKETS);
    expect(counts.endpoint).toBe(2); // d1, d2
    expect(counts.cloud).toBe(2);    // d2, d3
    expect(counts.identity).toBe(1); // only d2 (T1078 + T1110 both → identity but same det)
    expect(counts.saas).toBe(2);     // d2, d3
    expect(counts.network).toBe(1);  // d4
  });

  it('returns all zeros for empty input', () => {
    const counts = bucketCountsFor([], BUCKETS);
    expect(counts).toEqual({ endpoint: 0, cloud: 0, identity: 0, saas: 0, network: 0 });
  });

  it('does not double-count when detection has multiple techniques in same bucket', () => {
    const dets = [{ id: 'x', mitreAttackIds: ['T1003', 'T1078'] }]; // both touch endpoint
    const counts = bucketCountsFor(dets, BUCKETS);
    expect(counts.endpoint).toBe(1);
  });
});

describe('filterDetectionsByThreatGroup', () => {
  const dets = [
    { id: 'd1', threatGroupNames: ['Wizard Spider'] },
    { id: 'd2', threatGroupNames: ['Wizard Spider', 'APT41'] },
    { id: 'd3', threatGroupNames: ['CURIUM'] },
  ];

  it('matches by group name (case-insensitive)', () => {
    expect(filterDetectionsByThreatGroup(dets, 'wizard spider').map(d => d.id))
      .toEqual(['d1', 'd2']);
  });

  it('returns empty when group not present', () => {
    expect(filterDetectionsByThreatGroup(dets, 'unknown')).toEqual([]);
  });

  it('handles detections with missing threatGroupNames', () => {
    const sparse = [{ id: 'x' }];
    expect(filterDetectionsByThreatGroup(sparse, 'APT41')).toEqual([]);
  });
});

describe('filterGapsByThreatGroup', () => {
  const gaps = [
    { mitreId: 'T1003', name: 'Cred', threatGroupCount: 3, threatGroupNames: ['APT41', 'Wizard Spider'] },
    { mitreId: 'T1078', name: 'Valid', threatGroupCount: 1, threatGroupNames: ['CURIUM'] },
  ];

  it('keeps gaps that include the group name', () => {
    const result = filterGapsByThreatGroup(gaps, 'APT41');
    expect(result.map(g => g.mitreId)).toEqual(['T1003']);
  });

  it('handles missing threatGroupNames', () => {
    const sparse = [{ mitreId: 'T9', name: 'x' }];
    expect(filterGapsByThreatGroup(sparse, 'APT41')).toEqual([]);
  });
});

describe('filterGapsByBucket', () => {
  it('keeps gaps whose technique touches the bucket', () => {
    const gaps = [
      { mitreId: 'T1003', name: 'a' },
      { mitreId: 'T1190', name: 'b' },
      { mitreId: 'T1046', name: 'c' },
    ];
    expect(filterGapsByBucket(gaps, 'cloud', BUCKETS).map(g => g.mitreId))
      .toEqual(['T1190']);
  });

  it('drops gaps for unknown techniques', () => {
    const gaps = [{ mitreId: 'T9999', name: 'unknown' }];
    expect(filterGapsByBucket(gaps, 'endpoint', BUCKETS)).toEqual([]);
  });
});
