// Microsoft Defender XDR Advanced Hunting helpers (Deno / edge runtime).

declare const Deno: { env: { get(key: string): string | undefined } };

const GRAPH_HUNTING_URL = 'https://graph.microsoft.com/v1.0/security/runHuntingQuery';
const GRAPH_DEFAULT_SCOPE = 'https://graph.microsoft.com/.default';

export interface HuntingSchemaCol { name: string; type: string }

export type HuntingResponse =
  | { ok: true; schema: HuntingSchemaCol[]; results: Record<string, unknown>[] }
  | { ok: false; kind: 'http'; httpStatus: number; body: string; retryAfter?: string }
  | { ok: false; kind: 'oversized' }
  | { ok: false; kind: 'timeout' };

/** Imports INTEGRATION_ENCRYPTION_KEY (64-char hex) as an AES-GCM CryptoKey. */
async function getEncryptionKey(): Promise<CryptoKey> {
  const hex = Deno.env.get('INTEGRATION_ENCRYPTION_KEY');
  if (!hex || hex.length !== 64) {
    throw new Error('INTEGRATION_ENCRYPTION_KEY is not set or not 64 hex chars.');
  }
  const bytes = new Uint8Array(32);
  for (let i = 0; i < 32; i++) bytes[i] = parseInt(hex.slice(i * 2, i * 2 + 2), 16);
  return crypto.subtle.importKey('raw', bytes, { name: 'AES-GCM' }, false, ['decrypt']);
}

/** Decrypts a base64 AES-GCM blob (12-byte IV prefix) into the credential object. */
export async function decryptCredentials(encryptedBase64: string): Promise<Record<string, string>> {
  const key = await getEncryptionKey();
  const combined = Uint8Array.from(atob(encryptedBase64), (c) => c.charCodeAt(0));
  const iv = combined.slice(0, 12);
  const ciphertext = combined.slice(12);
  const decrypted = await crypto.subtle.decrypt({ name: 'AES-GCM', iv }, key, ciphertext);
  return JSON.parse(new TextDecoder().decode(decrypted));
}

/** Acquires a Graph app-only token via the client-credentials flow. */
export async function getGraphToken(
  tenantId: string, clientId: string, clientSecret: string,
): Promise<string> {
  const res = await fetch(`https://login.microsoftonline.com/${tenantId}/oauth2/v2.0/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      scope: GRAPH_DEFAULT_SCOPE,
      grant_type: 'client_credentials',
    }),
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok || !json.access_token) {
    throw new Error(`Graph token request failed (${res.status}): ${JSON.stringify(json).slice(0, 300)}`);
  }
  return json.access_token as string;
}

const MAX_BODY_BYTES = 5_000_000;

/** One Advanced Hunting attempt. */
async function runHuntingQueryOnce(
  token: string, query: string, timespanDays: number, abortMs: number,
): Promise<HuntingResponse> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), abortMs);
  try {
    const res = await fetch(GRAPH_HUNTING_URL, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
      body: JSON.stringify({ Query: query, Timespan: `P${timespanDays}D` }),
      signal: controller.signal,
    });
    const body = await res.text();
    if (body.length > MAX_BODY_BYTES) return { ok: false, kind: 'oversized' };
    if (!res.ok) {
      return {
        ok: false, kind: 'http', httpStatus: res.status, body,
        retryAfter: res.headers.get('Retry-After') ?? undefined,
      };
    }
    try {
      const data = JSON.parse(body);
      return {
        ok: true,
        schema: Array.isArray(data.schema) ? data.schema : [],
        results: Array.isArray(data.results) ? data.results : [],
      };
    } catch {
      return { ok: false, kind: 'http', httpStatus: res.status, body };
    }
  } catch (err) {
    if (err instanceof DOMException && err.name === 'AbortError') return { ok: false, kind: 'timeout' };
    return { ok: false, kind: 'http', httpStatus: 0, body: String(err) };
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Runs a KQL query against Advanced Hunting. `timespanDays` is a hard server-side
 * ceiling (the Timespan parameter); `abortMs` bounds each attempt. On a 429 it
 * retries once, honoring Retry-After (capped at 8s).
 */
export async function runHuntingQuery(
  token: string, query: string, timespanDays: number, abortMs: number,
): Promise<HuntingResponse> {
  const first = await runHuntingQueryOnce(token, query, timespanDays, abortMs);
  if (first.ok || first.kind !== 'http' || first.httpStatus !== 429) return first;
  const waitSec = Math.min(parseInt(first.retryAfter ?? '2', 10) || 2, 8);
  await new Promise((r) => setTimeout(r, waitSec * 1000));
  return runHuntingQueryOnce(token, query, timespanDays, abortMs);
}
