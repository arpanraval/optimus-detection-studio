import { describe, expect, it } from 'vitest';
import { deriveAutoDigestOutcome } from '../autoDigestOutcome';

describe('deriveAutoDigestOutcome', () => {
  it('does not call a report complete when a required section failed', () => {
    expect(deriveAutoDigestOutcome({
      summaryAvailable: true,
      classificationAvailable: true,
      sectionErrors: { iocs: 'provider timeout' },
    })).toBe('partial');
  });

  it('marks missing required sections failed', () => {
    expect(deriveAutoDigestOutcome({ summaryAvailable: false, classificationAvailable: false })).toBe('failed');
  });

  it('preserves cancellation as a terminal outcome', () => {
    expect(deriveAutoDigestOutcome({
      summaryAvailable: true,
      classificationAvailable: true,
      cancelled: true,
    })).toBe('cancelled');
  });

  it('returns complete only when required sections and all stages succeed', () => {
    expect(deriveAutoDigestOutcome({ summaryAvailable: true, classificationAvailable: true })).toBe('complete');
  });
});
