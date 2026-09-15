/** Server-side provider registry for the durable SIEM import engine.
 *
 *  The six values below are exactly the `provider` strings stored on `integrations` rows
 *  (confirmed at `integration-ops/index.ts:2166-2187`). Never invent a new spelling, and never
 *  trust a client-submitted provider string -- `resolveProvider` is the only sanctioned way to
 *  turn an integration row into a provider, because it reads `row.provider` rather than anything
 *  the caller supplied. */
import { crowdStrikeScope } from './native-siem-model.ts';

export type ImportProvider = 'crowdstrike' | 'splunk' | 'sentinel' | 'elastic' | 'defender_xdr' | 'chronicle';

export const IMPORT_PROVIDERS: ImportProvider[] = [
  'crowdstrike', 'splunk', 'sentinel', 'elastic', 'defender_xdr', 'chronicle',
];

const IMPORT_PROVIDER_SET = new Set<string>(IMPORT_PROVIDERS);

function isImportProvider(value: string): value is ImportProvider {
  return IMPORT_PROVIDER_SET.has(value);
}

/** Resolves the provider from an integration row -- never from a client-submitted string.
 *  Throws for anything not in `IMPORT_PROVIDERS` (e.g. non-SIEM integrations like Jira/GitHub). */
export function resolveProvider(row: { provider: string }): ImportProvider {
  if (!isImportProvider(row.provider)) {
    throw new Error(`Unsupported provider: ${row.provider}`);
  }
  return row.provider;
}

/** Adapter version stored in the snapshot tables' unique constraints. CrowdStrike's value is
 *  pinned forever -- see native-siem-model.ts ADAPTER_VERSION. Every other provider gets its own
 *  distinct string so a new adapter's snapshots never collide with, or manufacture drift against,
 *  another provider's stored rows. */
const ADAPTER_VERSIONS: Record<ImportProvider, string> = {
  crowdstrike: 'crowdstrike-correlation-v1',
  splunk: 'splunk-savedsearch-v1',
  sentinel: 'sentinel-analytics-v1',
  elastic: 'elastic-rule-v1',
  defender_xdr: 'defender-xdr-detection-v1',
  chronicle: 'chronicle-rule-v1',
};

export function adapterVersion(provider: ImportProvider): string {
  return ADAPTER_VERSIONS[provider];
}

function requireString(value: unknown, message: string): string {
  if (typeof value !== 'string' || !value.trim()) throw new Error(message);
  return value;
}

function requirePort(value: unknown, message: string): number {
  const port = Number(value);
  if (!Number.isFinite(port) || port <= 0) throw new Error(message);
  return port;
}

function endpointScope(config: Record<string, unknown>, providerLabel: string): string {
  const host = requireString(config.host, `${providerLabel} requires a host to derive a scope`);
  const port = requirePort(config.port, `${providerLabel} requires a port to derive a scope`);
  const scheme = config.ssl === false ? 'http' : 'https';
  return `${scheme}://${host}:${port}`;
}

/** Derives the stable `provider_scope` identity string for a provider's connection config.
 *  Must THROW when the config lacks what it needs -- never return a placeholder, an empty
 *  string, or a partially-derived scope, since a wrong scope silently merges or splits rule
 *  identities in the unique indexes that key off this value. */
export function providerScope(provider: ImportProvider, config: Record<string, unknown>): string {
  switch (provider) {
    case 'crowdstrike':
      // Reused verbatim: this value is stored in unique indexes on three tables and must not
      // move by a single character from the existing crowdStrikeScope() derivation.
      return crowdStrikeScope(config);

    case 'sentinel': {
      const tenantId = requireString(config.tenantId, 'Sentinel requires a tenant ID to derive a scope');
      const subscriptionId = requireString(config.subscriptionId, 'Sentinel requires a subscription ID to derive a scope');
      const resourceGroup = requireString(config.resourceGroup, 'Sentinel requires a resource group to derive a scope');
      const workspaceName = requireString(config.workspaceName, 'Sentinel requires a workspace name to derive a scope');
      return `sentinel:${tenantId}/${subscriptionId}/${resourceGroup}/${workspaceName}`;
    }

    case 'elastic': {
      const base = endpointScope(config, 'Elastic');
      const spaceId = requireString(config.spaceId, 'Elastic requires a space ID to derive a scope');
      return `${base}/${spaceId}`;
    }

    case 'chronicle': {
      const region = requireString(config.region, 'Chronicle requires a region to derive a scope');
      const customerId = requireString(config.customerId, 'Chronicle requires a customer ID to derive a scope');
      const projectOrInstance = config.projectId ?? config.instanceId;
      const suffix = requireString(projectOrInstance, 'Chronicle requires a project or instance ID to derive a scope');
      return `chronicle:${region}/${customerId}/${suffix}`;
    }

    case 'splunk': {
      const base = endpointScope(config, 'Splunk');
      const app = requireString(config.app, 'Splunk requires an app to derive a scope');
      return `${base}/${app}`;
    }

    case 'defender_xdr': {
      // Defender XDR's connection carries only tenantId -- no workspace/space/app field exists.
      const tenantId = requireString(config.tenantId, 'Defender XDR requires a tenant ID to derive a scope');
      return `defender_xdr:${tenantId}`;
    }

    default: {
      const exhaustive: never = provider;
      throw new Error(`Unsupported provider: ${exhaustive as string}`);
    }
  }
}
