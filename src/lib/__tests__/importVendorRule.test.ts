import { describe, expect, it } from 'vitest';
import { integrationService } from '../integrationService';
import type { VendorRule } from '../../types/integration';

// importVendorRule refuses BEFORE touching supabase for any provider whose durable import is
// enabled (supportsNativeImport), so this is testable without mocking auth/db calls -- the
// rejection happens on the first line, exactly like CrowdStrike's original guard.
function rule(provider: VendorRule['provider']): VendorRule {
  return {
    vendorRuleId: 'r1', name: 'Test rule', enabled: true, provider,
    integrationId: 'i1', integrationName: 'Test connection', query: 'x', queryLanguage: 'KQL',
    isFromOptimus: false, rawMetadata: {},
  };
}

describe('legacy single-rule import is retired for every durable-import provider', () => {
  it.each(['crowdstrike', 'splunk', 'sentinel', 'elastic', 'defender_xdr', 'chronicle'] as const)(
    'blocks %s in favor of the durable sync path',
    async (provider) => {
      await expect(integrationService.importVendorRule(rule(provider))).rejects.toThrow(
        /Sync rules to Production Library/,
      );
    },
  );
});
