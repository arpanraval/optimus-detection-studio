import { describe, it, expect } from 'vitest';
import { PROVIDER_META, getDisplayStatus } from '../providerMeta';

// Only providers validated end-to-end against a live tenant may be connectable. Adding a provider
// here should follow a real connect → deploy → sync test, not just a working connection test.
const TESTED_PROVIDERS = ['splunk', 'sentinel', 'defender_xdr', 'crowdstrike'];

describe('provider availability', () => {
  it('only tested providers are connectable', () => {
    const connectable = PROVIDER_META.filter((p) => !p.comingSoon).map((p) => p.id);
    expect(connectable.sort()).toEqual([...TESTED_PROVIDERS].sort());
  });

  it('untested providers render as coming soon', () => {
    for (const meta of PROVIDER_META.filter((p) => !TESTED_PROVIDERS.includes(p.id))) {
      expect(getDisplayStatus(meta)).toBe('coming-soon');
    }
  });
});
