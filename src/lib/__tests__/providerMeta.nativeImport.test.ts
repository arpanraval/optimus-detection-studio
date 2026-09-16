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
