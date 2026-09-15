// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { providerScope, adapterVersion, resolveProvider, IMPORT_PROVIDERS } from '../siem-providers';
import { providerCapabilities } from '../native-siem-model';

describe('provider registry', () => {
  // The scope column already exists on every identity table and is part of the unique
  // indexes, so CrowdStrike's derivation must not move by a single character.
  it('keeps the existing CrowdStrike scope derivation byte for byte', () => {
    expect(providerScope('crowdstrike', { baseUrl: 'https://api.crowdstrike.com', customerId: 'a'.repeat(32) }))
      .toBe('https://api.crowdstrike.com/correlation-rules/' + 'a'.repeat(32));
  });

  // ADAPTER_VERSION is part of both snapshot tables' unique constraints. Changing
  // CrowdStrike's value would orphan every snapshot already stored.
  it('pins the CrowdStrike adapter version to its stored value', () => {
    expect(adapterVersion('crowdstrike')).toBe('crowdstrike-correlation-v1');
  });

  it('gives every other provider its own adapter version', () => {
    const versions = IMPORT_PROVIDERS.map(adapterVersion);
    expect(new Set(versions).size).toBe(IMPORT_PROVIDERS.length);
  });

  // Defender XDR's connection carries only tenantId -- no workspace, space or app.
  it('scopes Defender XDR by tenant alone', () => {
    expect(providerScope('defender_xdr', { tenantId: 'tenant-1' })).toContain('tenant-1');
  });

  it('refuses a scope it cannot derive rather than inventing one', () => {
    expect(() => providerScope('sentinel', { tenantId: 't' })).toThrow();
  });

  // The provider must come from the integration row, never from the request body.
  it('resolves the provider from the integration row', () => {
    expect(resolveProvider({ provider: 'splunk' })).toBe('splunk');
    expect(() => resolveProvider({ provider: 'jira' })).toThrow();
  });

  // P5 is out of scope: no new provider may claim a write operation.
  it('grants no write operations to any provider but CrowdStrike', () => {
    for (const p of IMPORT_PROVIDERS.filter(p => p !== 'crowdstrike')) {
      expect(providerCapabilities(p).operations).toEqual([]);
    }
    expect(providerCapabilities('crowdstrike').operations).toContain('update');
  });

  it('derives a Sentinel scope from the full Azure chain', () => {
    expect(providerScope('sentinel', {
      tenantId: 'tenant-1', subscriptionId: 'sub-1', resourceGroup: 'rg-1', workspaceName: 'ws-1',
    })).toBe('sentinel:tenant-1/sub-1/rg-1/ws-1');
  });

  it('derives an Elastic scope from host and space', () => {
    expect(providerScope('elastic', { host: 'es.example.com', port: 9243, ssl: true, spaceId: 'default' }))
      .toBe('https://es.example.com:9243/default');
  });

  it('derives a Chronicle scope from region, customer and project', () => {
    expect(providerScope('chronicle', { region: 'us', customerId: 'cust-1', projectId: 'proj-1' }))
      .toBe('chronicle:us/cust-1/proj-1');
  });

  it('derives a Splunk scope from host/port and app', () => {
    expect(providerScope('splunk', { host: 'splunk.example.com', port: 8089, ssl: true, app: 'search' }))
      .toBe('https://splunk.example.com:8089/search');
  });

  it('rejects an unknown provider', () => {
    expect(() => providerScope('jira' as never, {})).toThrow();
  });
});
