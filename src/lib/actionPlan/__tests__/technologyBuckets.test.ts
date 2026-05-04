import { describe, it, expect } from 'vitest';
import {
  bucketForPlatform,
  bucketsForPlatforms,
  BUCKET_ORDER,
  BUCKET_LABELS,
} from '../technologyBuckets';

describe('bucketForPlatform', () => {
  it('maps Windows/macOS/Linux to endpoint', () => {
    expect(bucketForPlatform('Windows')).toBe('endpoint');
    expect(bucketForPlatform('macOS')).toBe('endpoint');
    expect(bucketForPlatform('Linux')).toBe('endpoint');
  });

  it('maps IaaS/Containers/ESXi to cloud', () => {
    expect(bucketForPlatform('IaaS')).toBe('cloud');
    expect(bucketForPlatform('Containers')).toBe('cloud');
    expect(bucketForPlatform('ESXi')).toBe('cloud');
  });

  it('maps Identity Provider to identity', () => {
    expect(bucketForPlatform('Identity Provider')).toBe('identity');
  });

  it('maps SaaS and Office Suite to saas', () => {
    expect(bucketForPlatform('SaaS')).toBe('saas');
    expect(bucketForPlatform('Office Suite')).toBe('saas');
    expect(bucketForPlatform('Office 365')).toBe('saas');
    expect(bucketForPlatform('Google Workspace')).toBe('saas');
  });

  it('maps Network to network', () => {
    expect(bucketForPlatform('Network')).toBe('network');
    expect(bucketForPlatform('Network Devices')).toBe('network');
  });

  it('returns null for unknown / mobile / pre-OS platforms', () => {
    expect(bucketForPlatform('Android')).toBeNull();
    expect(bucketForPlatform('iOS')).toBeNull();
    expect(bucketForPlatform('PRE')).toBeNull();
    expect(bucketForPlatform('')).toBeNull();
  });

  it('is case-insensitive', () => {
    expect(bucketForPlatform('WINDOWS')).toBe('endpoint');
    expect(bucketForPlatform('iaas')).toBe('cloud');
  });
});

describe('bucketsForPlatforms', () => {
  it('returns unique buckets across platforms', () => {
    const result = bucketsForPlatforms(['Windows', 'Linux', 'IaaS']);
    expect(result).toEqual(new Set(['endpoint', 'cloud']));
  });

  it('returns empty set for empty input', () => {
    expect(bucketsForPlatforms([])).toEqual(new Set());
  });

  it('skips unmappable platforms', () => {
    expect(bucketsForPlatforms(['Android', 'Windows'])).toEqual(new Set(['endpoint']));
  });
});

describe('BUCKET_ORDER and BUCKET_LABELS', () => {
  it('exposes all 5 buckets in deterministic order', () => {
    expect(BUCKET_ORDER).toEqual(['endpoint', 'cloud', 'identity', 'saas', 'network']);
  });

  it('has a label for every bucket', () => {
    for (const b of BUCKET_ORDER) {
      expect(BUCKET_LABELS[b]).toBeTruthy();
    }
  });
});
