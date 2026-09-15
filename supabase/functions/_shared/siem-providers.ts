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

export function requireString(value: unknown, message: string): string {
  if (typeof value !== 'string' || !value.trim()) throw new Error(message);
  return value;
}

function requirePort(value: unknown, message: string): number {
  const port = Number(value);
  if (!Number.isFinite(port) || port <= 0) throw new Error(message);
  return port;
}

export function endpointScope(config: Record<string, unknown>, providerLabel: string): string {
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

/** Where the durable import engine's generic HTTP client should reach a provider, and what to
 *  insert between its base URL and a caller-supplied relative path. This is deliberately about
 *  *connectivity* only -- provider_scope (above) is the stored identity string and must not be
 *  derived from this or vice versa.
 *
 *  Only CrowdStrike is exercised by a real reader today; the other five entries exist so the
 *  engine's client() seam can reach any registered provider, ahead of the per-provider readers
 *  (Tasks 7-12) that will actually page through their responses. */
export interface ProviderEndpoint {
  /** No trailing slash. */
  baseUrl: string;
  /** Inserted between baseUrl and the path a reader asks for, e.g. `correlation-rules/`. May be empty. */
  pathPrefix: string;
}

export function providerEndpoint(provider: ImportProvider, config: Record<string, unknown>): ProviderEndpoint {
  switch (provider) {
    case 'crowdstrike':
      // Reused verbatim: crowdStrikeScope() below is what actually validates this config; this
      // branch only has to agree with it on where requests go.
      return { baseUrl: requireString(config.baseUrl, 'CrowdStrike requires a base URL').replace(/\/$/, ''),
        pathPrefix: 'correlation-rules/' };

    case 'splunk': {
      // CF1 verified against docs (siem-multi-provider-library-import-plan/recon-provider-apis.md
      // section 1): `GET /servicesNS/{owner}/{app}/saved/searches` is the namespaced endpoint the
      // Splunk REST manual documents for owner/app-scoped listing. `owner` defaults to `-` (all
      // users) exactly as the REST manual's basic-concepts page describes for that segment.
      const base = endpointScope(config, 'Splunk');
      const app = requireString(config.app, 'Splunk requires an app to connect');
      const owner = typeof config.owner === 'string' && config.owner.trim() ? config.owner : '-';
      return { baseUrl: base, pathPrefix: `servicesNS/${encodeURIComponent(owner)}/${encodeURIComponent(app)}/` };
    }

    case 'sentinel': {
      // CF1 verified against docs (recon-provider-apis.md section 2): matches
      // `GET https://management.azure.com/subscriptions/{subscriptionId}/resourceGroups/
      // {resourceGroupName}/providers/Microsoft.OperationalInsights/workspaces/{workspaceName}/
      // providers/Microsoft.SecurityInsights/alertRules?api-version=2025-06-01` verbatim (the
      // `alertRules?api-version=...` suffix is supplied by the reader, not baked into pathPrefix).
      const subscriptionId = requireString(config.subscriptionId, 'Sentinel requires a subscription ID to connect');
      const resourceGroup = requireString(config.resourceGroup, 'Sentinel requires a resource group to connect');
      const workspaceName = requireString(config.workspaceName, 'Sentinel requires a workspace name to connect');
      return { baseUrl: 'https://management.azure.com',
        pathPrefix: `subscriptions/${subscriptionId}/resourceGroups/${resourceGroup}/providers/` +
          `Microsoft.OperationalInsights/workspaces/${workspaceName}/providers/Microsoft.SecurityInsights/` };
    }

    case 'defender_xdr':
      // Confirmed by resolveProvider/providerScope: only tenantId lives on this config. Graph
      // itself carries the tenant via the token, not the URL.
      return { baseUrl: 'https://graph.microsoft.com/v1.0', pathPrefix: 'security/' };

    case 'elastic': {
      const base = endpointScope(config, 'Elastic');
      const spaceId = requireString(config.spaceId, 'Elastic requires a space ID to connect');
      return { baseUrl: `${base}/s/${spaceId}`, pathPrefix: 'api/' };
    }

    case 'chronicle': {
      const region = requireString(config.region, 'Chronicle requires a region to derive a scope');
      const customerId = requireString(config.customerId, 'Chronicle requires a customer ID to derive a scope');
      return { baseUrl: `https://${region}-chronicle.googleapis.com/v2/${customerId}`, pathPrefix: '' };
    }

    default: {
      const exhaustive: never = provider;
      throw new Error(`Unsupported provider: ${exhaustive as string}`);
    }
  }
}
