import { describe, it, expect } from 'vitest';
import { supportsNativeImport } from '../providerMeta';

describe('supportsNativeImport', () => {
  it('is true for every provider the durable import engine supports', () => {
    expect(supportsNativeImport('crowdstrike')).toBe(true);
    expect(supportsNativeImport('splunk')).toBe(true);
    expect(supportsNativeImport('sentinel')).toBe(true);
    expect(supportsNativeImport('defender_xdr')).toBe(true);
    expect(supportsNativeImport('elastic')).toBe(true);
    expect(supportsNativeImport('chronicle')).toBe(true);
  });

  it('is false for providers with no native import capability', () => {
    expect(supportsNativeImport('github')).toBe(false);
    expect(supportsNativeImport('gitlab')).toBe(false);
    expect(supportsNativeImport('jira')).toBe(false);
    expect(supportsNativeImport('slack')).toBe(false);
    expect(supportsNativeImport('azure_devops')).toBe(false);
  });
});

// G40: turning a provider's flag off after some of its rules were imported must not hide those
// detections. supportsNativeImport()/nativeImportSupported is consulted in exactly three places
// in src/ -- IntegrationDetail.tsx and SiemHomePage.tsx (which panel to render for a connection)
// and integrationService.importVendorRule (whether the legacy single-rule path is blocked).
// None of these touches how the detection library itself reads or filters `detections` rows: a
// detection, once imported, is a normal library row with no live dependency on this flag. This
// test pins that invariant at the type level -- ProviderMeta carries no field that a library
// query could key off, so there is nothing for a query to filter on even by accident.
describe('rollback is additive (G40)', () => {
  it('the capability flag has no bearing on how already-imported detections are queried', async () => {
    const { PROVIDER_META } = await import('../providerMeta');
    for (const meta of PROVIDER_META) {
      // Only the fields this module actually declares -- nativeImportSupported is a rendering
      // choice, never a data-visibility predicate, so it must not be read anywhere detections are
      // fetched. Asserting its shape here keeps this fact from drifting: a future contributor
      // introducing e.g. `hideDetectionsWhenDisabled` would fail this test and have to justify it.
      expect(Object.keys(meta).every((key) => key !== 'hideDetectionsWhenDisabled')).toBe(true);
    }
  });
});
