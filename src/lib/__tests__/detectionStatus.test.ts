import { describe, expect, it } from 'vitest';
import { Status } from '@/types/enums';
import { parseDetectionStatus, statusMaturityRank } from '../detectionStatus';

describe('parseDetectionStatus', () => {
  it('resolves stored status text case-insensitively', () => {
    expect(parseDetectionStatus('Production')).toBe(Status.Production);
    expect(parseDetectionStatus('production')).toBe(Status.Production);
    expect(parseDetectionStatus(' testing ')).toBe(Status.Testing);
  });

  it('returns null for empty or unrecognised text instead of guessing a stage', () => {
    expect(parseDetectionStatus(undefined)).toBeNull();
    expect(parseDetectionStatus('')).toBeNull();
    expect(parseDetectionStatus('active')).toBeNull();
  });
});

describe('statusMaturityRank', () => {
  it('orders deployed rules ahead of drafts and unknown statuses last', () => {
    const ordered = ['Draft', 'mystery', 'Production', 'Development', 'Testing']
      .sort((a, b) => statusMaturityRank(a) - statusMaturityRank(b));
    expect(ordered).toEqual(['Production', 'Testing', 'Development', 'Draft', 'mystery']);
  });
});
