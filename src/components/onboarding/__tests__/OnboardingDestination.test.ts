import { describe, expect, it } from 'vitest';
import { ONBOARDING_TARGET_LIBRARY } from '../OnboardingContext';

describe('detection onboarding destination', () => {
  it('stages imported vendor rules in Development', () => {
    expect(ONBOARDING_TARGET_LIBRARY).toBe('development');
  });
});
