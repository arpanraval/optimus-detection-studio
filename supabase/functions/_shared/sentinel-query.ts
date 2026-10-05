import type { HuntingResponse } from './defender-hunting.ts';

export const SENTINEL_QUERY_SCOPE = 'https://api.loganalytics.io/.default';

/** Uses the existing ARM workspace coordinates, so old connections need no new workspace GUID. */
export function sentinelQueryUrl(config: Record<string, unknown>): string {
  const parts = ['subscriptionId', 'resourceGroup', 'workspaceName'].map(key => {
    if (typeof config[key] !== 'string' || !String(config[key]).trim()) throw new Error(`Sentinel requires ${key}`);
    return encodeURIComponent(String(config[key]));
  });
  return `https://api.loganalytics.azure.com/v1/subscriptions/${parts[0]}/resourceGroups/${parts[1]}` +
    `/providers/Microsoft.OperationalInsights/workspaces/${parts[2]}/query`;
}

export async function sentinelToken(config: Record<string, unknown>, credentials: Record<string, string>): Promise<string> {
  if (!config.tenantId || !credentials.clientId || !credentials.clientSecret) throw new Error('Sentinel credentials are incomplete');
  const response = await fetch(`https://login.microsoftonline.com/${encodeURIComponent(String(config.tenantId))}/oauth2/v2.0/token`, {
    method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ grant_type: 'client_credentials', client_id: credentials.clientId,
      client_secret: credentials.clientSecret, scope: SENTINEL_QUERY_SCOPE }), signal: AbortSignal.timeout(15000),
  });
  const data = await response.json();
  if (!response.ok || !data.access_token) throw new Error(`Sentinel query authentication failed (${response.status})`);
  return data.access_token;
}

export async function runSentinelQuery(token: string, config: Record<string, unknown>, query: string,
  days: number, timeoutMs = 30000): Promise<HuntingResponse> {
  try {
    const response = await fetch(sentinelQueryUrl(config), {
      method: 'POST', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ query, timespan: `P${Math.max(1, Math.min(90, Math.trunc(days)))}D` }),
      signal: AbortSignal.timeout(timeoutMs),
    });
    const body = await response.text();
    if (body.length > 5_000_000) return { ok: false, kind: 'oversized' };
    if (!response.ok) return { ok: false, kind: 'http', httpStatus: response.status, body,
      retryAfter: response.headers.get('Retry-After') ?? undefined };
    const data = JSON.parse(body);
    if (data.error) return { ok: false, kind: 'http', httpStatus: 400, body };
    const table = data.tables?.find((t: { name: string }) => t.name === 'PrimaryResult') ?? data.tables?.[0];
    if (!Array.isArray(table?.columns) || !Array.isArray(table?.rows)) {
      return { ok: false, kind: 'http', httpStatus: 502, body: 'Sentinel returned an invalid query result' };
    }
    const schema = table.columns as Array<{ name: string; type: string }>;
    return { ok: true, schema, results: table.rows.map((row: unknown[]) =>
      Object.fromEntries(schema.map((column, index) => [column.name, row[index]]))) };
  } catch (error) {
    if (error instanceof Error && ['TimeoutError', 'AbortError'].includes(error.name)) return { ok: false, kind: 'timeout' };
    return { ok: false, kind: 'http', httpStatus: 0, body: error instanceof Error ? error.message : 'Sentinel query failed' };
  }
}
