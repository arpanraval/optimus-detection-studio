import { logger } from './logger';
import { supabase } from './supabaseClient';
import { supportsNativeImport } from './providerMeta';
import { elasticEndpoint } from '../../supabase/functions/_shared/siem-providers';
import type {
  Integration,
  IntegrationProvider,
  IntegrationCategory,
  IntegrationAuthType,
  IntegrationConfig,
  ConnectionTestResult,
  DeploymentRecord,
  VendorRuleConfig,
  VendorRule,
  PreflightResult,
  PreflightBreakdown,
} from '../types';
import {
  appendOperator,
  buildDerivedQueries,
  detectEntityColumn,
  extractColumns,
  hasTimestampColumn,
  lintCustomDetectionSchema,
  mapHuntingError,
  parseCountResult,
  parseEntityBreakdown,
  parseTimeBreakdown,
} from './preflightQuery';

// =============================================================================
// Integration Service
// =============================================================================
// Direct Supabase reads for non-sensitive data.
// Edge function calls for anything involving credentials.
// Localhost uses the same credential-bearing backend as production. The direct vendor proxy
// is an explicit opt-in for developers connecting to private/local vendor installations.

const IS_DEV = import.meta.env.DEV && import.meta.env.VITE_SIEM_DEV_PROXY === 'true';

// The dev proxy calls the vendor directly from the browser -- no server route, no
// NATIVE_SIEM_MUTATIONS gate, no drift check, no readback. It cannot perform the safety checks
// the native write path uses for a rule Optimus already tracks in a SIEM, so it must refuse one
// rather than silently duplicating or clobbering it. Production builds route tracked rules
// through the server instead, where this guard would break the feature -- so it is dev-proxy only.
async function requireUnboundTarget(detectionId?: string, integrationId?: string, vendorRuleId?: string) {
  let query = supabase.from('siem_rule_bindings').select('id').eq('binding_status', 'active').limit(1);
  if (detectionId) query = query.eq('detection_id', detectionId);
  else if (integrationId && vendorRuleId) query = query.eq('integration_id', integrationId).eq('vendor_rule_id', vendorRuleId);
  else throw new Error('A detection or target rule is required');
  const { data, error } = await query;
  if (error) throw new Error('Unable to verify production rule bindings');
  if (data?.length) throw new Error('This rule is tracked in a SIEM — use Deploy to update it safely instead of the local dev proxy.');
}

/**
 * Whether this exact connection already tracks a rule for this detection.
 *
 * The deploy path uses it to ROUTE rather than to refuse: a tracked rule is an update of something
 * live, which only the server route can do safely, so it goes there in development as well as in a
 * production build. Refusing instead left the Deploy button telling the user to press Deploy.
 */
/**
 * The connection and browser-held credentials the dev proxy would need, or null.
 *
 * Whether this browser holds credentials is a ROUTING question, not an error: the credentials the
 * proxy uses live in this tab's memory (or a legacy config blob), while the real ones are
 * encrypted server-side, where the Edge Function can use them. Treating their absence as a failure
 * meant deploying a new rule from a dev server said "Dev credentials not found" while the deployed
 * app -- and a tracked rule from the same dev server -- went through the server and worked.
 */
async function devProxyTarget(integrationId: string): Promise<
  { integration: Record<string, unknown>; config: Record<string, unknown>; credentials: Record<string, string> } | null
> {
  const { data: integration, error } = await supabase
    .from('integrations')
    .select('*')
    .eq('id', integrationId)
    .single();
  if (error || !integration) return null;
  const config = (integration.config || {}) as Record<string, unknown>;
  const credentials = await migrateDevCredentials(integrationId, config);
  return credentials ? { integration, config, credentials } : null;
}

async function hasActiveBinding(
  integrationId: string,
  target: { detectionId?: string; vendorRuleId?: string },
): Promise<boolean> {
  let query = supabase
    .from('siem_rule_bindings')
    .select('id')
    .eq('binding_status', 'active')
    .eq('integration_id', integrationId)
    .limit(1);
  if (target.detectionId) query = query.eq('detection_id', target.detectionId);
  if (target.vendorRuleId) query = query.eq('vendor_rule_id', target.vendorRuleId);
  const { data, error } = await query;
  if (error) throw new Error('Unable to verify production rule bindings');
  return Boolean(data?.length);
}

/**
 * The reason the server actually gave.
 *
 * supabase-js reports a non-2xx Edge Function response as "Edge Function returned a non-2xx status
 * code" and puts the server's own message in the response body. Throwing the former turned
 * "Review this detection before deploying" and "Production changed since review" into a shrug --
 * the user was told a request failed but never what to do about it.
 */
async function edgeFunctionMessage(
  error: { message: string; context?: { json?: () => Promise<{ error?: string }> } },
  fallback: string,
): Promise<string> {
  try {
    const body = await error.context?.json?.();
    if (body?.error) return body.error;
  } catch {
    /* the response body may not be JSON */
  }
  return error.message || fallback;
}

const PREFLIGHT_POLL_INTERVAL_MS = 10_000;

interface RunPreflightOptions {
  signal?: AbortSignal;
  onStarted?: (run: PreflightResult) => void;
}

function waitForPreflightPoll(signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) {
      reject(new DOMException('Pre-flight cancelled', 'AbortError'));
      return;
    }
    const timer = setTimeout(resolve, PREFLIGHT_POLL_INTERVAL_MS);
    signal?.addEventListener(
      'abort',
      () => {
        clearTimeout(timer);
        reject(new DOMException('Pre-flight cancelled', 'AbortError'));
      },
      { once: true },
    );
  });
}

async function invokePreflightAction(
  action: 'poll_preflight' | 'cancel_preflight',
  preflightRunId: string,
): Promise<PreflightResult> {
  const { data, error } = await supabase.functions.invoke('integration-ops', {
    body: { action, preflightRunId },
  });
  if (error) throw new Error(`Pre-flight failed: ${error.message}`);
  if (data?.error) throw new Error(data.error);
  return data as PreflightResult;
}

// =============================================================================
// Dev Credential Cache (in-memory only, never persisted to DB)
// =============================================================================
// Credentials for local SIEM testing (e.g. Splunk on localhost without TLS).
// Held in memory for the browser session — lost on page refresh by design.
// On first access, migrates legacy _dev_credentials from DB into cache and scrubs DB.
const devCredentialCache = new Map<string, Record<string, string>>();
const devCredentialMigrated = new Set<string>();

export function setDevCredentials(integrationId: string, credentials: Record<string, string>): void {
  devCredentialCache.set(integrationId, credentials);
}

export function getDevCredentials(integrationId: string): Record<string, string> | null {
  return devCredentialCache.get(integrationId) || null;
}

export function clearDevCredentials(integrationId: string): void {
  devCredentialCache.delete(integrationId);
}

/** Migrate legacy _dev_credentials from DB config into memory cache, then scrub from DB. */
async function migrateDevCredentials(integrationId: string, config: Record<string, unknown>): Promise<Record<string, string> | null> {
  // Already in cache — use it
  const cached = devCredentialCache.get(integrationId);
  if (cached) return cached;

  // Already attempted migration for this integration — nothing to recover
  if (devCredentialMigrated.has(integrationId)) return null;
  devCredentialMigrated.add(integrationId);

  // Check for legacy _dev_credentials in DB config
  const legacy = config._dev_credentials as Record<string, string> | undefined;
  if (!legacy || Object.keys(legacy).length === 0) return null;

  // Cache in memory
  devCredentialCache.set(integrationId, legacy);

  // Scrub plaintext credentials from DB — retry once on failure
  const { _dev_credentials: _, ...cleanConfig } = config;
  (async () => {
    for (let attempt = 0; attempt < 2; attempt++) {
      const { error: scrubError } = await supabase.from('integrations').update({ config: cleanConfig }).eq('id', integrationId);
      if (!scrubError) {
        logger.info(`[integrations] Scrubbed legacy dev credentials from DB for ${integrationId}`);
        return;
      }
      logger.warn(`[integrations] Failed to scrub dev credentials (attempt ${attempt + 1}):`, scrubError.message);
    }
    logger.error(`[integrations] CRITICAL: Failed to scrub plaintext dev credentials for ${integrationId} after 2 attempts`);
  })();

  return legacy;
}

// =============================================================================
// Structured Deploy Error
// =============================================================================

export class DeployError extends Error {
  code: string;
  guidance: string;
  retryable: boolean;

  constructor(code: string, message: string, guidance: string, retryable: boolean) {
    super(message);
    this.name = 'DeployError';
    this.code = code;
    this.guidance = guidance;
    this.retryable = retryable;
  }
}

/** Parse a Splunk JSON error body into a user-friendly DeployError. */
function parseSplunkError(status: number, body: string): DeployError {
  // Try to extract the message text from Splunk JSON response
  let text: string;
  try {
    const data = JSON.parse(body);
    const messages: Array<{ type?: string; text?: string }> = data?.messages || [];
    text = messages.map(m => m.text || '').join(' ').trim();
  } catch {
    text = body.slice(0, 300);
  }

  // 401 / Unauthorized
  if (status === 401 || /unauthorized/i.test(text)) {
    return new DeployError(
      'AUTH_FAILED',
      'Authentication failed',
      'Check your credentials in Integration settings. The token may have expired.',
      false,
    );
  }

  // 403 / Forbidden
  if (status === 403 || /forbidden|not authorized/i.test(text)) {
    return new DeployError(
      'AUTH_FAILED',
      'Insufficient permissions',
      'The account does not have permission for this operation. Check the role and capabilities in Splunk.',
      false,
    );
  }

  // Macro not found
  const macroMatch = text.match(/macro\s+'([^']+)'\s+.*cannot be found/i)
    || text.match(/Error in '([^']+)' macro/i);
  if (macroMatch) {
    const macroName = macroMatch[1];
    return new DeployError(
      'SPLUNK_MACRO_NOT_FOUND',
      `Query references macro '${macroName}' which doesn't exist in Splunk`,
      'Install the required Splunk app/add-on, or modify the detection query to remove the macro reference before deploying.',
      false,
    );
  }

  // Connection-level failures
  if (status === 502 || status === 503 || /ECONNREFUSED|ENOTFOUND|ETIMEDOUT|connect/i.test(text)) {
    return new DeployError(
      'CONNECTION_FAILED',
      'Cannot reach Splunk',
      'Verify Splunk is running and the host/port are correct in Integration settings.',
      true,
    );
  }

  // Generic fallback — clean up raw response
  const cleanMsg = text || `Splunk returned status ${status}`;
  return new DeployError(
    'VENDOR_ERROR',
    cleanMsg.length > 200 ? cleanMsg.slice(0, 200) + '...' : cleanMsg,
    'Check Splunk logs for details.',
    true,
  );
}

// =============================================================================
// Dev Proxy — forwards vendor API calls through Vite dev server (avoids CORS)
// =============================================================================

async function devProxy(
  url: string,
  method: string,
  headers: Record<string, string>,
  body?: string
): Promise<{ status: number; ok: boolean; body: string }> {
  const res = await fetch('/dev-proxy', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ url, method, headers, body }),
  });
  return res.json();
}

// =============================================================================
// Dev-mode vendor test functions (mirrors edge function logic, runs client-side)
// =============================================================================

async function devTestSplunk(
  config: Record<string, unknown>,
  credentials: Record<string, string>
): Promise<ConnectionTestResult> {
  const host = config.host as string;
  const port = config.port as number || 8089;
  const ssl = config.ssl !== false;
  const protocol = ssl ? 'https' : 'http';
  const baseUrl = `${protocol}://${host}:${port}`;

  const headers: Record<string, string> = { 'Accept': 'application/json' };
  if (credentials.token) {
    headers['Authorization'] = `Bearer ${credentials.token}`;
  } else if (credentials.username && credentials.password) {
    headers['Authorization'] = `Basic ${btoa(`${credentials.username}:${credentials.password}`)}`;
  }

  const start = Date.now();
  const res = await devProxy(
    `${baseUrl}/services/server/info?output_mode=json`,
    'GET',
    headers
  );
  const latency = Date.now() - start;

  if (!res.ok) {
    return { success: false, message: `Splunk error ${res.status}: ${res.body.slice(0, 200)}`, latency_ms: latency };
  }

  try {
    const data = JSON.parse(res.body);
    const serverName = data?.entry?.[0]?.content?.serverName || 'Unknown';
    const version = data?.entry?.[0]?.content?.version || 'Unknown';
    return { success: true, message: `Connected to ${serverName} (Splunk ${version})`, latency_ms: latency };
  } catch {
    return { success: true, message: 'Connected to Splunk', latency_ms: latency };
  }
}

async function devTestElastic(
  config: Record<string, unknown>,
  credentials: Record<string, string>
): Promise<ConnectionTestResult> {
  const host = config.host as string;
  const port = config.port as number || 9200;
  const ssl = config.ssl !== false;
  const protocol = ssl ? 'https' : 'http';
  let baseUrl = `${protocol}://${host}:${port}`;
  if (config.spaceId) baseUrl += `/s/${encodeURIComponent(String(config.spaceId))}`;

  const headers: Record<string, string> = { 'Accept': 'application/json', 'kbn-xsrf': 'true' };
  if (credentials.apiKey) {
    headers['Authorization'] = `ApiKey ${credentials.apiKey}`;
  } else if (credentials.username && credentials.password) {
    headers['Authorization'] = `Basic ${btoa(`${credentials.username}:${credentials.password}`)}`;
  }

  const start = Date.now();
  const res = await devProxy(
    `${baseUrl}/api/detection_engine/rules/_find?per_page=1`,
    'GET',
    headers
  );
  const latency = Date.now() - start;

  if (!res.ok) {
    return { success: false, message: `Elastic error ${res.status}: ${res.body.slice(0, 200)}`, latency_ms: latency };
  }

  try {
    const data = JSON.parse(res.body);
    return { success: true, message: `Connected to Elastic Security (${data.total ?? 0} existing rules)`, latency_ms: latency };
  } catch {
    return { success: true, message: 'Connected to Elastic Security', latency_ms: latency };
  }
}

// =============================================================================
// Dev-mode Microsoft OAuth2 + Defender XDR (mirrors edge function logic)
// =============================================================================

/** Fetch an OAuth2 client_credentials token via the dev proxy. */
async function devMicrosoftGetToken(
  tenantId: string,
  clientId: string,
  clientSecret: string,
  scope: string
): Promise<string> {
  const tokenUrl = `https://login.microsoftonline.com/${tenantId}/oauth2/v2.0/token`;
  const params = new URLSearchParams({
    grant_type: 'client_credentials',
    client_id: clientId,
    client_secret: clientSecret,
    scope,
  });

  const res = await devProxy(tokenUrl, 'POST', {
    'Content-Type': 'application/x-www-form-urlencoded',
  }, params.toString());

  if (!res.ok) {
    throw parseDefenderError(res.status, res.body);
  }

  const data = JSON.parse(res.body);
  return data.access_token;
}

/** Parse Defender XDR / Microsoft API errors into user-friendly DeployError. */
function parseDefenderError(status: number, body: string): DeployError {
  let text = '';
  let errorCode = '';
  try {
    const data = JSON.parse(body);
    // Microsoft errors come as { error: { code, message } } or { error: "...", error_description: "..." }
    if (data?.error?.message) {
      text = data.error.message;
      errorCode = data.error.code || '';
    } else if (data?.error_description) {
      text = data.error_description;
      errorCode = data.error || '';
    } else if (typeof data?.error === 'string') {
      text = data.error;
    }
  } catch {
    text = body.slice(0, 300);
  }

  // OAuth2 errors
  if (status === 401 || errorCode === 'InvalidAuthenticationToken' || /unauthorized/i.test(text)) {
    return new DeployError(
      'AUTH_FAILED',
      'Authentication failed',
      'Check your Client ID, Client Secret, and Tenant ID in Integration settings. The secret may have expired.',
      false,
    );
  }

  if (errorCode === 'invalid_client' || /invalid.*client/i.test(text)) {
    return new DeployError(
      'AUTH_FAILED',
      'Invalid client credentials',
      'The Client ID or Client Secret is incorrect. Verify them in your Azure AD App Registration.',
      false,
    );
  }

  if (errorCode === 'invalid_resource' || /AADSTS\d+/i.test(text)) {
    return new DeployError(
      'AUTH_FAILED',
      'Azure AD configuration error',
      `${text.slice(0, 150)}. Check the API permissions on your App Registration and ensure admin consent is granted.`,
      false,
    );
  }

  if (status === 403 || errorCode === 'Forbidden' || /forbidden|insufficient.*privilege/i.test(text)) {
    return new DeployError(
      'AUTH_FAILED',
      'Insufficient API permissions',
      'Grant "CustomDetection.ReadWrite.All" (Application) permission to your App Registration and ensure admin consent is given.',
      false,
    );
  }

  if (status === 404 || errorCode === 'NotFound') {
    return new DeployError(
      'DEFENDER_RULE_NOT_FOUND',
      'Custom detection not found in Defender XDR',
      'The rule may have been deleted from the Defender portal.',
      false,
    );
  }

  if (status === 409 || errorCode === 'Conflict') {
    return new DeployError(
      'DEFENDER_DUPLICATE',
      'A custom detection with this name already exists',
      'Rename the rule or update the existing one instead.',
      false,
    );
  }

  if (status === 429 || errorCode === 'TooManyRequests') {
    return new DeployError(
      'RATE_LIMITED',
      'Microsoft API rate limit reached',
      'Wait a moment and try again. Defender XDR has throttling limits on custom detection APIs.',
      true,
    );
  }

  if (status >= 500 || /ECONNREFUSED|ENOTFOUND|ETIMEDOUT/i.test(text)) {
    return new DeployError(
      'CONNECTION_FAILED',
      'Cannot reach Microsoft Defender XDR API',
      'Microsoft services may be temporarily unavailable. Check status.microsoft.com and try again.',
      true,
    );
  }

  const cleanMsg = text || `Defender XDR returned status ${status}`;
  return new DeployError(
    'VENDOR_ERROR',
    cleanMsg.length > 200 ? cleanMsg.slice(0, 200) + '...' : cleanMsg,
    'Check your Defender XDR portal for details.',
    true,
  );
}

// Defender XDR Custom Detections uses the Microsoft Graph Security API (beta).
// Endpoint: https://graph.microsoft.com/beta/security/rules/detectionRules
// Scope:    https://graph.microsoft.com/.default
// Required: "CustomDetection.ReadWrite.All" Application permission under Microsoft Graph
const GRAPH_DEFENDER_BASE = 'https://graph.microsoft.com/beta/security/rules/detectionRules';
const GRAPH_SCOPE = 'https://graph.microsoft.com/.default';

// CrowdStrike Falcon Correlation Rules API
const CS_RULES_PATH = '/correlation-rules/entities/rules/v1';
const CS_RULES_COMBINED_PATH = '/correlation-rules/combined/rules/v1';

// Chronicle (Google SecOps) Detection Engine API v2
const CHRONICLE_TOKEN_URL = 'https://oauth2.googleapis.com/token';
const CHRONICLE_SCOPE = 'https://www.googleapis.com/auth/chronicle-backstory';

// =============================================================================
// CrowdStrike OAuth2 + Correlation Rules (dev mode)
// =============================================================================

/** Fetch an OAuth2 client_credentials token from CrowdStrike via the dev proxy. */
async function devCrowdStrikeGetToken(
  baseUrl: string,
  clientId: string,
  clientSecret: string
): Promise<string> {
  const tokenUrl = `${baseUrl}/oauth2/token`;
  const params = new URLSearchParams({
    client_id: clientId,
    client_secret: clientSecret,
    grant_type: 'client_credentials',
  });

  const res = await devProxy(tokenUrl, 'POST', {
    'Content-Type': 'application/x-www-form-urlencoded',
  }, params.toString());

  if (!res.ok) {
    throw parseCrowdStrikeError(res.status, res.body);
  }

  const data = JSON.parse(res.body);
  return data.access_token;
}

/** Parse CrowdStrike API errors into user-friendly DeployError. */
function parseCrowdStrikeError(status: number, body: string): DeployError {
  let text = '';
  let code = 0;
  try {
    const data = JSON.parse(body);
    const errors = data?.errors || [];
    if (errors.length > 0) {
      text = errors[0].message || '';
      code = errors[0].code || 0;
    }
  } catch {
    text = body.slice(0, 300);
  }

  if (status === 401 || status === 403) {
    return new DeployError(
      'AUTH_FAILED',
      status === 401 ? 'Authentication failed' : 'Insufficient permissions',
      'Check your Client ID and Client Secret. Ensure the API client has Correlation Rules: Read and Write scope.',
      false,
    );
  }

  if (status === 404) {
    return new DeployError(
      'CS_RULE_NOT_FOUND',
      'Correlation rule not found in CrowdStrike',
      'The rule may have been deleted from the Falcon console.',
      false,
    );
  }

  if (status === 409) {
    return new DeployError(
      'CS_DUPLICATE',
      'A correlation rule with this name already exists',
      'Rename the rule or update the existing one instead.',
      false,
    );
  }

  if (status === 429) {
    return new DeployError(
      'RATE_LIMITED',
      'CrowdStrike API rate limit reached',
      'Wait a moment and try again.',
      true,
    );
  }

  if (status >= 500 || /ECONNREFUSED|ENOTFOUND|ETIMEDOUT/i.test(text)) {
    return new DeployError(
      'CONNECTION_FAILED',
      'Cannot reach CrowdStrike API',
      'CrowdStrike services may be temporarily unavailable. Check your cloud region and try again.',
      true,
    );
  }

  const cleanMsg = text || `CrowdStrike returned status ${status}`;
  return new DeployError(
    'VENDOR_ERROR',
    cleanMsg.length > 200 ? cleanMsg.slice(0, 200) + '...' : cleanMsg,
    'Check the Falcon console for details.',
    true,
  );
}

/** Map detection severity to CrowdStrike integer severity. */
function crowdStrikeSeverityFromString(severity?: string): number {
  switch (severity?.toLowerCase()) {
    case 'critical': return 90;
    case 'high': return 70;
    case 'medium': return 50;
    case 'low': return 30;
    case 'informational': return 10;
    default: return 50;
  }
}

async function devTestCrowdStrike(
  config: Record<string, unknown>,
  credentials: Record<string, string>
): Promise<ConnectionTestResult> {
  const baseUrl = config.baseUrl as string;
  if (!baseUrl) return { success: false, message: 'API Base URL is required', latency_ms: 0 };
  if (!credentials.clientId) return { success: false, message: 'Client ID is required', latency_ms: 0 };
  if (!credentials.clientSecret) return { success: false, message: 'Client Secret is required', latency_ms: 0 };

  const start = Date.now();
  try {
    let token: string;
    try {
      token = await devCrowdStrikeGetToken(baseUrl, credentials.clientId, credentials.clientSecret);
    } catch (tokenErr) {
      const latency = Date.now() - start;
      if (tokenErr instanceof DeployError) {
        return { success: false, message: `Token error: ${tokenErr.message}. ${tokenErr.guidance}`, latency_ms: latency };
      }
      return { success: false, message: `Token error: ${tokenErr instanceof Error ? tokenErr.message : 'Failed to get token'}`, latency_ms: latency };
    }

    const res = await devProxy(
      `${baseUrl}${CS_QUERIES_PATH}?limit=1`,
      'GET',
      { 'Authorization': `Bearer ${token}`, 'Accept': 'application/json' }
    );
    const latency = Date.now() - start;

    if (!res.ok) {
      let detail = '';
      try {
        const errData = JSON.parse(res.body);
        detail = errData?.errors?.[0]?.message || res.body.slice(0, 300);
      } catch { detail = res.body.slice(0, 300); }

      return { success: false, message: `CrowdStrike error ${res.status}: ${detail}`, latency_ms: latency };
    }

    const data = JSON.parse(res.body);
    const total = data.meta?.pagination?.total ?? 'unknown';
    return { success: true, message: `Connected to CrowdStrike Falcon NGSIEM (${total} rules)`, latency_ms: latency };
  } catch (err) {
    const latency = Date.now() - start;
    if (err instanceof DeployError) {
      return { success: false, message: `${err.message}. ${err.guidance}`, latency_ms: latency };
    }
    return { success: false, message: err instanceof Error ? err.message : 'Connection failed', latency_ms: latency };
  }
}

async function devDeployCrowdStrike(
  config: Record<string, unknown>,
  credentials: Record<string, string>,
  query: string,
  ruleConfig?: Record<string, unknown>,
  vendorRuleId?: string
): Promise<{ vendorRuleId: string; response: unknown; autoRetried?: AutoRetryKind }> {
  const baseUrl = config.baseUrl as string;
  // Normalize CID: strip -XX checksum suffix, lowercase, 32-char hex only
  const customerId = (config.customerId as string || '').replace(/-[0-9a-fA-F]{2}$/, '').toLowerCase();
  const token = await devCrowdStrikeGetToken(baseUrl, credentials.clientId, credentials.clientSecret);

  const headers = {
    'Authorization': `Bearer ${token}`,
    'Content-Type': 'application/json',
    'Accept': 'application/json',
  };

  const isUpdate = !!vendorRuleId;

  const ruleName = (ruleConfig?.name as string) || 'Optimus Detection';
  const description = (ruleConfig?.description as string) || 'Deployed from Optimus Detection Studio';
  // Severity must be an integer (10/30/50/70/90). Convert from string if needed.
  const rawSeverity = ruleConfig?.severity;
  const severity = typeof rawSeverity === 'number'
    ? rawSeverity
    : crowdStrikeSeverityFromString(String(rawSeverity || ''));
  const outcome = (ruleConfig?.outcome as string) || 'detection';
  const lookback = (ruleConfig?.lookback as string) || '1h0m';
  const schedule = (ruleConfig?.schedule as string) || '@every 1h0m';
  // Note: trigger_mode appears in API responses but is NOT an accepted input parameter
  const status = (ruleConfig?.status as string) || 'inactive';

  // Extract MITRE info — API expects IDs like "TA0004" / "T1098", not human-readable names.
  // API requires: if technique is specified, tactic MUST also be specified.
  const tactics = (ruleConfig?.tactics as string[]) || [];
  const techniques = (ruleConfig?.techniques as string[]) || [];
  const rawTactic = tactics.length > 0 && /^TA\d+/i.test(tactics[0]) ? tactics[0] : undefined;
  const rawTechnique = techniques.length > 0 && /^T\d+/i.test(techniques[0]) ? techniques[0] : undefined;
  // Only include technique if tactic is also present
  const tactic = rawTactic;
  const technique = rawTactic && rawTechnique ? rawTechnique : undefined;

  // Calculate start_on: 20 minutes from now (API requires strictly >15 min)
  const startOn = new Date(Date.now() + 20 * 60 * 1000).toISOString();

  // Note: trigger_mode appears in API responses but is NOT an accepted input parameter.
  // The official Rule Parameters table does not include it — sending it causes a schema error.

  if (isUpdate) {
    // PATCH takes an array of rule objects
    const updateBody = [{
      id: vendorRuleId,
      name: ruleName,
      description,
      severity,
      ...(tactic ? { tactic } : {}),
      ...(technique ? { technique } : {}),
      search: {
        outcome,
        filter: query,
        lookback,
      },
      operation: {
        schedule: { definition: schedule },
      },
      status,
    }];

    let res = await devProxy(`${baseUrl}${CS_RULES_PATH}`, 'PATCH', headers, JSON.stringify(updateBody));

    // 404 on update = rule was deleted — fall back to create
    if (res.status === 404) {
      const createBody = {
        name: ruleName,
        description,
        customer_id: customerId,
        severity,
        ...(tactic ? { tactic } : {}),
        ...(technique ? { technique } : {}),
        search: {
          outcome,
          filter: query,
          lookback,
        },
        operation: {
          schedule: { definition: schedule },
          start_on: startOn,
        },
        status,
      };

      res = await devProxy(`${baseUrl}${CS_RULES_PATH}`, 'POST', headers, JSON.stringify(createBody));
      if (!res.ok) throw parseCrowdStrikeError(res.status, res.body);
      const data = JSON.parse(res.body);
      const newId = data.resources?.[0]?.id || data.id;
      return { vendorRuleId: newId, response: data, autoRetried: '404_to_create' };
    }

    if (!res.ok) throw parseCrowdStrikeError(res.status, res.body);
    const data = JSON.parse(res.body);
    return { vendorRuleId: data.resources?.[0]?.id || vendorRuleId, response: data };
  }

  // Create
  const createBody = {
    name: ruleName,
    description,
    customer_id: customerId,
    severity,
    ...(tactic ? { tactic } : {}),
    ...(technique ? { technique } : {}),
    search: {
      outcome,
      filter: query,
      lookback,
    },
    operation: {
      schedule: { definition: schedule },
      start_on: startOn,
    },
    status,
  };

  const res = await devProxy(`${baseUrl}${CS_RULES_PATH}`, 'POST', headers, JSON.stringify(createBody));
  if (!res.ok) throw parseCrowdStrikeError(res.status, res.body);
  const data = JSON.parse(res.body);
  const ruleId = data.resources?.[0]?.id || data.id;
  return { vendorRuleId: ruleId, response: data };
}

const CS_QUERIES_PATH = '/correlation-rules/queries/rules/v1';

function mapCrowdStrikeRule(r: any) {
  return {
    id: r.id,
    name: r.name,
    query: r.search?.filter,
    enabled: r.status === 'active',
    severity: r.severity,
    lookback: r.search?.lookback,
    schedule: r.operation?.schedule?.definition,
    trigger_mode: r.search?.trigger_mode,
    status: r.status,
    last_updated_on: r.last_updated_on,
    description: r.description,
  };
}

async function devListCrowdStrikeRules(
  config: Record<string, unknown>,
  credentials: Record<string, string>
): Promise<unknown[]> {
  const baseUrl = (config.baseUrl as string || '').replace(/\/+$/, '');
  const token = await devCrowdStrikeGetToken(baseUrl, credentials.clientId, credentials.clientSecret);
  const headers = { 'Authorization': `Bearer ${token}`, 'Accept': 'application/json' };

  // Step 1: Use queries endpoint to get rule IDs (paginated)
  const allIds: string[] = [];
  let offset = 0;
  const pageSize = 500;

  while (true) {
    const queryRes = await devProxy(
      `${baseUrl}${CS_QUERIES_PATH}?limit=${pageSize}&offset=${offset}`,
      'GET',
      headers
    );

    if (!queryRes.ok) throw parseCrowdStrikeError(queryRes.status, queryRes.body);
    const queryData = JSON.parse(queryRes.body);
    const ids: string[] = queryData.resources || [];

    if (ids.length === 0) break;
    allIds.push(...ids);

    const total = queryData.meta?.pagination?.total ?? 0;
    offset += ids.length;
    if (offset >= total || ids.length < pageSize) break;
  }

  if (allIds.length === 0) return [];

  // Step 2: Fetch full details in batches of 100 IDs via entities endpoint
  const allRules: unknown[] = [];
  const batchSize = 100;

  for (let i = 0; i < allIds.length; i += batchSize) {
    const batchIds = allIds.slice(i, i + batchSize);
    const idsParam = batchIds.map(id => `ids=${encodeURIComponent(id)}`).join('&');

    const entRes = await devProxy(
      `${baseUrl}${CS_RULES_PATH}?${idsParam}`,
      'GET',
      headers
    );

    if (!entRes.ok) throw parseCrowdStrikeError(entRes.status, entRes.body);
    const entData = JSON.parse(entRes.body);
    const rules = (entData.resources || []).map(mapCrowdStrikeRule);
    allRules.push(...rules);
  }

  logger.debug(`CrowdStrike: fetched details for ${allRules.length} rules`);
  return allRules;
}

async function devToggleCrowdStrikeRule(
  config: Record<string, unknown>,
  credentials: Record<string, string>,
  vendorRuleId: string,
  enabled: boolean
): Promise<void> {
  const baseUrl = config.baseUrl as string;
  const token = await devCrowdStrikeGetToken(baseUrl, credentials.clientId, credentials.clientSecret);

  const res = await devProxy(
    `${baseUrl}${CS_RULES_PATH}`,
    'PATCH',
    {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json',
      'Accept': 'application/json',
    },
    JSON.stringify([{ id: vendorRuleId, status: enabled ? 'active' : 'inactive' }])
  );

  if (!res.ok) throw parseCrowdStrikeError(res.status, res.body);
}

async function devDeleteCrowdStrikeRule(
  config: Record<string, unknown>,
  credentials: Record<string, string>,
  vendorRuleId: string
): Promise<void> {
  const baseUrl = config.baseUrl as string;
  const token = await devCrowdStrikeGetToken(baseUrl, credentials.clientId, credentials.clientSecret);

  const res = await devProxy(
    `${baseUrl}${CS_RULES_PATH}?ids=${encodeURIComponent(vendorRuleId)}`,
    'DELETE',
    { 'Authorization': `Bearer ${token}`, 'Accept': 'application/json' }
  );

  if (!res.ok) throw parseCrowdStrikeError(res.status, res.body);
}

// =============================================================================
// Chronicle (Google SecOps) — JWT signing + OAuth2 + CRUD (dev mode)
// =============================================================================

function chronicleBaseUrl(region: string, customerId: string): string {
  return `https://${region}-chronicle.googleapis.com/v2/${customerId}/rules`;
}

/** Parse a PEM-encoded RSA private key and import it for signing. */
async function importRsaPrivateKey(pem: string): Promise<CryptoKey> {
  // Strip PEM headers, whitespace, and decode base64
  const pemContents = pem
    .replace(/-----BEGIN (RSA )?PRIVATE KEY-----/g, '')
    .replace(/-----END (RSA )?PRIVATE KEY-----/g, '')
    .replace(/\s/g, '');
  const binaryDer = Uint8Array.from(atob(pemContents), c => c.charCodeAt(0));

  return crypto.subtle.importKey(
    'pkcs8',
    binaryDer,
    { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' },
    false,
    ['sign']
  );
}

/** Base64url encode (no padding). */
function base64url(data: Uint8Array | string): string {
  const str = typeof data === 'string' ? data : btoa(String.fromCharCode(...data));
  return str.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
}

/** Build and sign a Google service account JWT, exchange for an access token. */
async function devChronicleGetToken(
  clientEmail: string,
  privateKey: string
): Promise<string> {
  const now = Math.floor(Date.now() / 1000);
  const header = base64url(btoa(JSON.stringify({ alg: 'RS256', typ: 'JWT' })));
  const payload = base64url(btoa(JSON.stringify({
    iss: clientEmail,
    scope: CHRONICLE_SCOPE,
    aud: CHRONICLE_TOKEN_URL,
    iat: now,
    exp: now + 3600,
  })));

  const signingInput = `${header}.${payload}`;
  const key = await importRsaPrivateKey(privateKey);
  const signature = await crypto.subtle.sign(
    'RSASSA-PKCS1-v1_5',
    key,
    new TextEncoder().encode(signingInput)
  );
  const signedJwt = `${signingInput}.${base64url(new Uint8Array(signature))}`;

  // Exchange JWT for access token
  const params = new URLSearchParams({
    grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
    assertion: signedJwt,
  });

  const res = await devProxy(CHRONICLE_TOKEN_URL, 'POST', {
    'Content-Type': 'application/x-www-form-urlencoded',
  }, params.toString());

  if (!res.ok) {
    throw parseChronicleError(res.status, res.body);
  }

  const data = JSON.parse(res.body);
  return data.access_token;
}

/** Parse Chronicle API errors into user-friendly DeployError. */
function parseChronicleError(status: number, body: string): DeployError {
  let text: string;
  let errorCode = '';
  try {
    const data = JSON.parse(body);
    text = data?.error?.message || data?.error_description || '';
    errorCode = data?.error?.status || data?.error?.code || data?.error || '';
  } catch {
    text = body.slice(0, 300);
  }

  if (status === 401 || status === 403 || /UNAUTHENTICATED|PERMISSION_DENIED/i.test(errorCode)) {
    return new DeployError(
      'AUTH_FAILED',
      status === 401 ? 'Authentication failed' : 'Insufficient permissions',
      'Check your service account email and private key. Ensure the service account has Chronicle API Editor role.',
      false,
    );
  }

  if (status === 404 || errorCode === 'NOT_FOUND') {
    return new DeployError(
      'CHRONICLE_RULE_NOT_FOUND',
      'Rule not found in Chronicle',
      'The rule may have been deleted from the SecOps console.',
      false,
    );
  }

  if (status === 409 || errorCode === 'ALREADY_EXISTS') {
    return new DeployError(
      'CHRONICLE_DUPLICATE',
      'A rule with this name already exists',
      'Rename the rule or update the existing one instead.',
      false,
    );
  }

  if (status === 429 || errorCode === 'RESOURCE_EXHAUSTED') {
    return new DeployError(
      'RATE_LIMITED',
      'Chronicle API rate limit reached',
      'Wait a moment and try again.',
      true,
    );
  }

  if (status >= 500 || /ECONNREFUSED|ENOTFOUND|ETIMEDOUT/i.test(text)) {
    return new DeployError(
      'CONNECTION_FAILED',
      'Cannot reach Chronicle API',
      'Google SecOps services may be temporarily unavailable. Check your region and try again.',
      true,
    );
  }

  const cleanMsg = text || `Chronicle returned status ${status}`;
  return new DeployError(
    'VENDOR_ERROR',
    cleanMsg.length > 200 ? cleanMsg.slice(0, 200) + '...' : cleanMsg,
    'Check the SecOps console for details.',
    true,
  );
}

/** Map detection severity to Chronicle severity string. */
function chronicleSeverityFromString(severity?: string): string {
  switch (severity?.toLowerCase()) {
    case 'critical': return 'CRITICAL';
    case 'high': return 'HIGH';
    case 'medium': return 'MEDIUM';
    case 'low': return 'LOW';
    case 'informational': return 'INFORMATIONAL';
    default: return 'MEDIUM';
  }
}

async function devTestChronicle(
  config: Record<string, unknown>,
  credentials: Record<string, string>
): Promise<ConnectionTestResult> {
  const region = config.region as string || 'us';
  const customerId = config.customerId as string;
  if (!customerId) return { success: false, message: 'Customer ID is required', latency_ms: 0 };
  if (!credentials.clientEmail) return { success: false, message: 'Service Account Email is required', latency_ms: 0 };
  if (!credentials.privateKey) return { success: false, message: 'Private Key is required', latency_ms: 0 };

  const start = Date.now();
  try {
    let token: string;
    try {
      token = await devChronicleGetToken(credentials.clientEmail, credentials.privateKey);
    } catch (tokenErr) {
      const latency = Date.now() - start;
      if (tokenErr instanceof DeployError) {
        return { success: false, message: `Token error: ${tokenErr.message}. ${tokenErr.guidance}`, latency_ms: latency };
      }
      return { success: false, message: `Token error: ${tokenErr instanceof Error ? tokenErr.message : 'Failed to get token'}`, latency_ms: latency };
    }

    const baseUrl = chronicleBaseUrl(region, customerId);
    const res = await devProxy(
      `${baseUrl}?pageSize=1`,
      'GET',
      { 'Authorization': `Bearer ${token}`, 'Accept': 'application/json' }
    );
    const latency = Date.now() - start;

    if (!res.ok) {
      let detail = '';
      try {
        const errData = JSON.parse(res.body);
        detail = errData?.error?.message || res.body.slice(0, 300);
      } catch { detail = res.body.slice(0, 300); }
      return { success: false, message: `Chronicle error ${res.status}: ${detail}`, latency_ms: latency };
    }

    return { success: true, message: `Connected to Google SecOps (Chronicle) - ${region}`, latency_ms: latency };
  } catch (err) {
    const latency = Date.now() - start;
    if (err instanceof DeployError) {
      return { success: false, message: `${err.message}. ${err.guidance}`, latency_ms: latency };
    }
    return { success: false, message: err instanceof Error ? err.message : 'Connection failed', latency_ms: latency };
  }
}

async function devDeployChronicle(
  config: Record<string, unknown>,
  credentials: Record<string, string>,
  query: string,
  ruleConfig?: Record<string, unknown>,
  vendorRuleId?: string
): Promise<{ vendorRuleId: string; response: unknown; autoRetried?: AutoRetryKind }> {
  const region = config.region as string || 'us';
  const customerId = config.customerId as string;
  const token = await devChronicleGetToken(credentials.clientEmail, credentials.privateKey);
  const baseUrl = chronicleBaseUrl(region, customerId);

  const headers = {
    'Authorization': `Bearer ${token}`,
    'Content-Type': 'application/json',
    'Accept': 'application/json',
  };

  const isUpdate = !!vendorRuleId;
  const ruleName = (ruleConfig?.name as string) || 'Optimus Detection';
  const description = (ruleConfig?.description as string) || 'Deployed from Optimus Detection Studio';
  const severity = chronicleSeverityFromString(ruleConfig?.severity as string);

  const body = JSON.stringify({
    ruleText: query,
    metadata: {
      severity,
      description,
      author: 'Optimus Detection Studio',
    },
  });

  if (isUpdate) {
    let res = await devProxy(`${baseUrl}/${vendorRuleId}`, 'PATCH', headers, body);

    // 404 on update = rule was deleted — fall back to create
    if (res.status === 404) {
      res = await devProxy(baseUrl, 'POST', headers, body);
      if (!res.ok) throw parseChronicleError(res.status, res.body);
      const data = JSON.parse(res.body);
      const newId = data.name?.split('/').pop() || data.ruleId;
      return { vendorRuleId: newId, response: data, autoRetried: '404_to_create' };
    }

    if (!res.ok) throw parseChronicleError(res.status, res.body);
    const data = JSON.parse(res.body);
    return { vendorRuleId: data.name?.split('/').pop() || vendorRuleId, response: data };
  }

  // Create
  const res = await devProxy(baseUrl, 'POST', headers, body);
  if (!res.ok) throw parseChronicleError(res.status, res.body);
  const data = JSON.parse(res.body);
  const ruleId = data.name?.split('/').pop() || data.ruleId;
  return { vendorRuleId: ruleId, response: data };
}

async function devListChronicleRules(
  config: Record<string, unknown>,
  credentials: Record<string, string>
): Promise<unknown[]> {
  const region = config.region as string || 'us';
  const customerId = config.customerId as string;
  const token = await devChronicleGetToken(credentials.clientEmail, credentials.privateKey);
  const baseUrl = chronicleBaseUrl(region, customerId);
  const headers = { 'Authorization': `Bearer ${token}`, 'Accept': 'application/json' };

  const allRules: unknown[] = [];
  let pageToken = '';

  while (true) {
    const url = pageToken
      ? `${baseUrl}?pageSize=100&pageToken=${encodeURIComponent(pageToken)}`
      : `${baseUrl}?pageSize=100`;

    const res = await devProxy(url, 'GET', headers);
    if (!res.ok) throw parseChronicleError(res.status, res.body);

    const data = JSON.parse(res.body);
    const rules = (data.rules || []).map((r: any) => ({
      id: r.name?.split('/').pop() || r.ruleId,
      name: r.ruleName || r.metadata?.description || 'Unnamed Rule',
      query: r.ruleText,
      // Preserve absence: execution state lives on a separate RuleDeployment
      // resource, so a missing liveRuleEnabled means "unknown", not "disabled".
      enabled: r.liveRuleEnabled,
      severity: r.metadata?.severity,
      description: r.metadata?.description,
      lastModified: r.revisionCreateTime,
    }));
    allRules.push(...rules);

    if (!data.nextPageToken) break;
    pageToken = data.nextPageToken;
  }

  return allRules;
}

async function devToggleChronicleRule(
  config: Record<string, unknown>,
  credentials: Record<string, string>,
  vendorRuleId: string,
  enabled: boolean
): Promise<void> {
  const region = config.region as string || 'us';
  const customerId = config.customerId as string;
  const token = await devChronicleGetToken(credentials.clientEmail, credentials.privateKey);
  const baseUrl = chronicleBaseUrl(region, customerId);

  const action = enabled ? ':enableLiveRule' : ':disableLiveRule';
  const res = await devProxy(
    `${baseUrl}/${vendorRuleId}${action}`,
    'POST',
    {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json',
      'Accept': 'application/json',
    },
    '{}'
  );

  if (!res.ok) throw parseChronicleError(res.status, res.body);
}

async function devDeleteChronicleRule(
  config: Record<string, unknown>,
  credentials: Record<string, string>,
  vendorRuleId: string
): Promise<void> {
  const region = config.region as string || 'us';
  const customerId = config.customerId as string;
  const token = await devChronicleGetToken(credentials.clientEmail, credentials.privateKey);
  const baseUrl = chronicleBaseUrl(region, customerId);

  const res = await devProxy(
    `${baseUrl}/${vendorRuleId}`,
    'DELETE',
    { 'Authorization': `Bearer ${token}`, 'Accept': 'application/json' }
  );

  if (!res.ok) throw parseChronicleError(res.status, res.body);
}

async function devTestDefenderXdr(
  config: Record<string, unknown>,
  credentials: Record<string, string>
): Promise<ConnectionTestResult> {
  const tenantId = config.tenantId as string;
  if (!tenantId) return { success: false, message: 'Tenant ID is required', latency_ms: 0 };
  if (!credentials.clientId) return { success: false, message: 'Client ID is required', latency_ms: 0 };
  if (!credentials.clientSecret) return { success: false, message: 'Client Secret is required', latency_ms: 0 };

  const start = Date.now();
  try {
    let token: string;
    try {
      token = await devMicrosoftGetToken(tenantId, credentials.clientId, credentials.clientSecret, GRAPH_SCOPE);
    } catch (tokenErr) {
      const latency = Date.now() - start;
      if (tokenErr instanceof DeployError) {
        return { success: false, message: `Token error: ${tokenErr.message}. ${tokenErr.guidance}`, latency_ms: latency };
      }
      return { success: false, message: `Token error: ${tokenErr instanceof Error ? tokenErr.message : 'Failed to get token'}`, latency_ms: latency };
    }

    const res = await devProxy(
      `${GRAPH_DEFENDER_BASE}?$top=1`,
      'GET',
      { 'Authorization': `Bearer ${token}`, 'Accept': 'application/json' }
    );
    const latency = Date.now() - start;

    if (!res.ok) {
      let detail = '';
      try {
        const errData = JSON.parse(res.body);
        detail = errData?.error?.message || res.body.slice(0, 300);
      } catch { detail = res.body.slice(0, 300); }

      if (res.status === 403) {
        return {
          success: false,
          message: `Insufficient permissions (HTTP 403). ${detail}`,
          latency_ms: latency,
        };
      }
      return { success: false, message: `API returned ${res.status}. ${detail}`, latency_ms: latency };
    }

    return { success: true, message: 'Connected to Microsoft Defender XDR via Graph API', latency_ms: latency };
  } catch (err) {
    const latency = Date.now() - start;
    if (err instanceof DeployError) {
      return { success: false, message: `${err.message}. ${err.guidance}`, latency_ms: latency };
    }
    return { success: false, message: err instanceof Error ? err.message : 'Connection failed', latency_ms: latency };
  }
}

async function devDeployDefenderXdr(
  config: Record<string, unknown>,
  credentials: Record<string, string>,
  query: string,
  ruleConfig?: Record<string, unknown>,
  vendorRuleId?: string
): Promise<{ vendorRuleId: string; response: unknown; autoRetried?: AutoRetryKind }> {
  const tenantId = config.tenantId as string;
  const token = await devMicrosoftGetToken(tenantId, credentials.clientId, credentials.clientSecret, GRAPH_SCOPE);

  const headers = {
    'Authorization': `Bearer ${token}`,
    'Content-Type': 'application/json',
    'Accept': 'application/json',
  };

  const isUpdate = !!vendorRuleId;

  const displayName = (ruleConfig?.name as string) || 'Optimus Detection';
  const description = (ruleConfig?.description as string) || 'Deployed from Optimus Detection Studio';
  const severity = ((ruleConfig?.severity as string) || 'medium').toLowerCase();
  const period = ((ruleConfig?.frequency as string) || '24H').toUpperCase();

  // Map MITRE tactics to Defender XDR categories (first tactic as category)
  const tacticCategoryMap: Record<string, string> = {
    'reconnaissance': 'Discovery',
    'resource development': 'Malware',
    'initial access': 'InitialAccess',
    'execution': 'Execution',
    'persistence': 'Persistence',
    'privilege escalation': 'PrivilegeEscalation',
    'defense evasion': 'DefenseEvasion',
    'credential access': 'CredentialAccess',
    'discovery': 'Discovery',
    'lateral movement': 'LateralMovement',
    'collection': 'Collection',
    'command and control': 'CommandAndControl',
    'exfiltration': 'Exfiltration',
    'impact': 'Impact',
  };
  // Use explicit category from config if set, otherwise derive from first tactic
  const tactics = (ruleConfig?.tactics as string[]) || [];
  const category = (ruleConfig?.category as string)
    || (tactics.length > 0
      ? tacticCategoryMap[tactics[0].toLowerCase()] || 'SuspiciousActivity'
      : 'SuspiciousActivity');

  // Build MITRE techniques array for the API
  const techniques = (ruleConfig?.techniques as string[]) || [];

  const body = JSON.stringify({
    displayName,
    isEnabled: true,
    queryCondition: { queryText: query },
    schedule: { period },
    detectionAction: {
      alertTemplate: {
        title: displayName,
        description,
        severity,
        category,
        mitreTechniques: techniques,
        impactedAssets: [
          {
            '@odata.type': '#microsoft.graph.security.impactedDeviceAsset',
            identifier: 'deviceId',
          },
        ],
        recommendedActions: null,
      },
      organizationalScope: null,
      responseActions: [],
    },
  });

  if (isUpdate) {
    let res = await devProxy(`${GRAPH_DEFENDER_BASE}/${vendorRuleId}`, 'PATCH', headers, body);

    // 404 on update = rule was deleted — fall back to create
    if (res.status === 404) {
      res = await devProxy(GRAPH_DEFENDER_BASE, 'POST', headers, body);
      if (!res.ok) throw parseDefenderError(res.status, res.body);
      const data = JSON.parse(res.body);
      return { vendorRuleId: data.id, response: data, autoRetried: '404_to_create' };
    }

    if (!res.ok) throw parseDefenderError(res.status, res.body);
    const data = JSON.parse(res.body);
    return { vendorRuleId: data.id || vendorRuleId, response: data };
  }

  // Create
  const res = await devProxy(GRAPH_DEFENDER_BASE, 'POST', headers, body);
  logger.debug('Defender XDR create response status:', res.status, 'ok:', res.ok);
  logger.debug('Defender XDR create response body:', res.body);
  if (!res.ok) throw parseDefenderError(res.status, res.body);
  const data = JSON.parse(res.body);
  const ruleId = data.id;
  logger.debug('Defender XDR created rule ID:', ruleId, 'displayName:', data.displayName);

  // Verify the rule exists by reading it back
  if (ruleId) {
    try {
      const verify = await devProxy(`${GRAPH_DEFENDER_BASE}/${ruleId}`, 'GET', {
        'Authorization': `Bearer ${token}`,
        'Accept': 'application/json',
      });
      logger.debug('Defender XDR verify GET status:', verify.status, 'ok:', verify.ok);
      if (!verify.ok) {
        logger.warn('Defender XDR rule created but verification failed:', verify.body);
      } else {
        const verifiedRule = JSON.parse(verify.body);
        logger.debug('Defender XDR verified rule:', verifiedRule.displayName, 'isEnabled:', verifiedRule.isEnabled);
      }
    } catch (verifyErr) {
      logger.warn('Defender XDR verification check failed:', verifyErr);
    }
  }

  return { vendorRuleId: ruleId, response: data };
}

async function devListDefenderXdrRules(
  config: Record<string, unknown>,
  credentials: Record<string, string>
): Promise<unknown[]> {
  const tenantId = config.tenantId as string;
  const token = await devMicrosoftGetToken(tenantId, credentials.clientId, credentials.clientSecret, GRAPH_SCOPE);

  const res = await devProxy(
    GRAPH_DEFENDER_BASE,
    'GET',
    { 'Authorization': `Bearer ${token}`, 'Accept': 'application/json' }
  );

  if (!res.ok) throw parseDefenderError(res.status, res.body);
  const data = JSON.parse(res.body);
  return (data.value || []).map((r: any) => ({
    id: r.id,
    name: r.displayName,
    query: r.queryCondition?.queryText,
    frequency: r.schedule?.period,
    enabled: r.isEnabled,
  }));
}

async function devDeleteDefenderXdrRule(
  config: Record<string, unknown>,
  credentials: Record<string, string>,
  vendorRuleId: string
): Promise<void> {
  const tenantId = config.tenantId as string;
  const token = await devMicrosoftGetToken(tenantId, credentials.clientId, credentials.clientSecret, GRAPH_SCOPE);

  const res = await devProxy(
    `${GRAPH_DEFENDER_BASE}/${vendorRuleId}`,
    'DELETE',
    { 'Authorization': `Bearer ${token}`, 'Accept': 'application/json' }
  );

  if (!res.ok) throw parseDefenderError(res.status, res.body);
}

// =============================================================================
// Defender XDR Advanced Hunting — pre-flight (dev mode)
// =============================================================================

const GRAPH_HUNTING_URL = 'https://graph.microsoft.com/v1.0/security/runHuntingQuery';

interface DevHuntingResponse {
  ok: boolean;
  status: number;
  body: string;
  schema?: { name: string; type: string }[];
  results?: Record<string, unknown>[];
}

async function devRunHuntingQuery(token: string, query: string): Promise<DevHuntingResponse> {
  const res = await devProxy(
    GRAPH_HUNTING_URL,
    'POST',
    {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json',
      'Accept': 'application/json',
    },
    JSON.stringify({ query }),
  );
  if (!res.ok) return { ok: false, status: res.status, body: res.body };
  try {
    const data = JSON.parse(res.body);
    return { ok: true, status: 200, body: res.body, schema: data.schema, results: data.results };
  } catch {
    return { ok: false, status: res.status, body: res.body };
  }
}

/** Dev-mode mirror of the edge function's run_preflight action. */
async function devRunPreflightDefenderXdr(params: {
  detectionId: string;
  integrationId: string;
  windowDays: number;
}): Promise<PreflightResult> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error('Not authenticated');

  const { data: integration, error: intErr } = await supabase
    .from('integrations')
    .select('*')
    .eq('id', params.integrationId)
    .single();
  if (intErr || !integration) throw new Error('Integration not found');
  if (integration.provider !== 'defender_xdr') {
    throw new Error('Pre-flight currently supports Microsoft Defender XDR integrations only');
  }
  if (integration.status !== 'connected') {
    throw new Error('Integration is not connected (INTEGRATION_NOT_CONNECTED)');
  }

  const { data: detection, error: detErr } = await supabase
    .from('detections')
    .select('id, user_id, queries, queryLanguage, detectionQuery')
    .eq('id', params.detectionId)
    .single();
  if (detErr || !detection) throw new Error('Detection not found');
  if (detection.user_id !== user.id) throw new Error('You do not own this detection');

  // KQL-query extraction — mirrors pickKqlQuery() in supabase/functions/integration-ops/index.ts; keep in sync.
  const kqlFromArray = (detection.queries || []).find(
    (q: { language?: string; query?: string }) =>
      q.language && q.language.toUpperCase() === 'KQL' && q.query && q.query.trim() !== '',
  );
  const kqlQuery =
    kqlFromArray?.query ||
    (detection.detectionQuery &&
    detection.detectionQuery.trim() !== '' &&
    detection.queryLanguage &&
    detection.queryLanguage.toUpperCase() === 'KQL'
      ? detection.detectionQuery
      : null);
  if (!kqlQuery) throw new Error('Detection has no KQL query to run');

  const config = (integration.config || {}) as Record<string, unknown>;
  if (!config.tenantId) {
    throw new Error('Integration is missing tenantId — re-save its credentials in integration settings.');
  }
  const credentials = await migrateDevCredentials(params.integrationId, config);
  if (!credentials) {
    throw new Error('Dev credentials not found — please re-enter credentials in integration settings.');
  }

  const startedAt = Date.now();
  let status = 'success';
  let validationPassed = false;
  let errorMessage: string | null = null;
  let errorGuidance: string | null = null;
  let hitCount: number | null = null;
  let windowApplied = false;
  let schemaWarnings: { code: string; message: string }[] = [];
  let sample: Record<string, unknown>[] = [];
  const breakdown: PreflightBreakdown = { overTime: [], byEntity: [], entityColumn: null };

  try {
    const token = await devMicrosoftGetToken(
      config.tenantId as string,
      credentials.clientId,
      credentials.clientSecret,
      'https://graph.microsoft.com/.default',
    );

    const probe = await devRunHuntingQuery(token, appendOperator(kqlQuery, '| take 1'));
    if (!probe.ok) {
      const mapped = mapHuntingError(probe.status, probe.body);
      status = mapped.status;
      errorMessage = mapped.message;
      errorGuidance = mapped.guidance;
    } else {
      validationPassed = true;
      const columns = extractColumns(probe.schema);
      const hasTimestamp = hasTimestampColumn(columns);
      const entityColumn = detectEntityColumn(columns);
      schemaWarnings = lintCustomDetectionSchema(columns);
      windowApplied = hasTimestamp;
      breakdown.entityColumn = entityColumn;

      const derived = buildDerivedQueries({
        baseQuery: kqlQuery,
        windowDays: params.windowDays,
        hasTimestamp,
        entityColumn,
      });

      const countRes = await devRunHuntingQuery(token, derived.count);
      if (!countRes.ok) {
        const mapped = mapHuntingError(countRes.status, countRes.body);
        status = mapped.status;
        errorMessage = mapped.message;
        errorGuidance = mapped.guidance;
      } else {
        hitCount = parseCountResult(countRes.results || []);
        const sampleRes = await devRunHuntingQuery(token, derived.sample);
        if (sampleRes.ok) sample = (sampleRes.results || []).slice(0, 25);
        if (derived.timeBreakdown) {
          const tRes = await devRunHuntingQuery(token, derived.timeBreakdown);
          if (tRes.ok) breakdown.overTime = parseTimeBreakdown(tRes.results || []);
        }
        if (derived.entityBreakdown && entityColumn) {
          const eRes = await devRunHuntingQuery(token, derived.entityBreakdown);
          if (eRes.ok) breakdown.byEntity = parseEntityBreakdown(eRes.results || [], entityColumn);
        }
      }
    }
  } catch (err) {
    status = 'connection_error';
    errorMessage = err instanceof Error ? err.message : 'Pre-flight failed';
    errorGuidance = 'Could not reach Microsoft Graph. Check the integration and try again.';
  }

  const durationMs = Date.now() - startedAt;

  const { data: row, error: insErr } = await supabase
    .from('detection_preflight_runs')
    .insert({
      user_id: user.id,
      integration_id: params.integrationId,
      detection_id: params.detectionId,
      provider: 'defender_xdr',
      window_days: params.windowDays,
      status,
      validation_passed: validationPassed,
      hit_count: hitCount,
      window_applied: windowApplied,
      error_message: errorMessage,
      error_guidance: errorGuidance,
      schema_warnings: schemaWarnings,
      query_text: kqlQuery,
      query_language: 'KQL',
      sample,
      breakdown,
      duration_ms: durationMs,
    })
    .select()
    .single();
  if (insErr || !row) throw new Error('Pre-flight ran but the result could not be saved');
  return row as PreflightResult;
}

// =============================================================================
// Microsoft Sentinel (Azure Management API)
// =============================================================================

const SENTINEL_MANAGEMENT_SCOPE = 'https://management.azure.com/.default';

function sentinelBaseUrl(config: Record<string, unknown>): string {
  const { subscriptionId, resourceGroup, workspaceName } = config as Record<string, string>;
  return `https://management.azure.com/subscriptions/${subscriptionId}/resourceGroups/${resourceGroup}/providers/Microsoft.OperationalInsights/workspaces/${workspaceName}/providers/Microsoft.SecurityInsights/alertRules`;
}

async function devTestSentinel(
  config: Record<string, unknown>,
  credentials: Record<string, string>
): Promise<ConnectionTestResult> {
  const tenantId = config.tenantId as string;
  if (!tenantId) return { success: false, message: 'Tenant ID is required', latency_ms: 0 };
  if (!config.subscriptionId) return { success: false, message: 'Subscription ID is required', latency_ms: 0 };
  if (!config.resourceGroup) return { success: false, message: 'Resource Group is required', latency_ms: 0 };
  if (!config.workspaceName) return { success: false, message: 'Workspace Name is required', latency_ms: 0 };
  if (!credentials.clientId) return { success: false, message: 'Client ID is required', latency_ms: 0 };
  if (!credentials.clientSecret) return { success: false, message: 'Client Secret is required', latency_ms: 0 };

  const start = Date.now();
  try {
    const token = await devMicrosoftGetToken(tenantId, credentials.clientId, credentials.clientSecret, SENTINEL_MANAGEMENT_SCOPE);
    const baseUrl = sentinelBaseUrl(config);

    const res = await devProxy(
      `${baseUrl}?api-version=2025-06-01&$top=1`,
      'GET',
      { 'Authorization': `Bearer ${token}`, 'Accept': 'application/json' }
    );
    const latency = Date.now() - start;

    if (!res.ok) {
      let detail = '';
      try { detail = JSON.parse(res.body)?.error?.message || res.body.slice(0, 300); } catch { detail = res.body.slice(0, 300); }
      return { success: false, message: `Sentinel error ${res.status}: ${detail}`, latency_ms: latency };
    }

    return { success: true, message: `Connected to Sentinel workspace: ${config.workspaceName}`, latency_ms: latency };
  } catch (err) {
    const latency = Date.now() - start;
    if (err instanceof DeployError) return { success: false, message: `${err.message}. ${err.guidance}`, latency_ms: latency };
    return { success: false, message: err instanceof Error ? err.message : 'Connection failed', latency_ms: latency };
  }
}

async function devDeploySentinel(
  config: Record<string, unknown>,
  credentials: Record<string, string>,
  query: string,
  ruleConfig?: Record<string, unknown>,
  vendorRuleId?: string
): Promise<{ vendorRuleId: string; response: unknown; autoRetried?: AutoRetryKind }> {
  const tenantId = config.tenantId as string;
  const token = await devMicrosoftGetToken(tenantId, credentials.clientId, credentials.clientSecret, SENTINEL_MANAGEMENT_SCOPE);
  const baseUrl = sentinelBaseUrl(config);

  const headers = {
    'Authorization': `Bearer ${token}`,
    'Content-Type': 'application/json',
    'Accept': 'application/json',
  };

  const ruleId = vendorRuleId || crypto.randomUUID();

  // Convert tactic display names to API enum values (PascalCase, no spaces)
  const rawTactics = (ruleConfig?.tactics as string[]) || [];
  const tactics = rawTactics.map(t => t.replace(/\s+/g, ''));

  // Techniques should be T#### IDs (from mitreAttackIds, not technique names)
  const techniques = (ruleConfig?.techniques as string[]) || [];

  // Determine rule kind: Scheduled (default) or NRT
  const ruleKind = (ruleConfig?.ruleType as string) === 'NRT' ? 'NRT' : 'Scheduled';
  const isNRT = ruleKind === 'NRT';

  // Build properties — NRT rules don't use queryFrequency/queryPeriod/trigger fields
  const properties: Record<string, unknown> = {
    displayName: (ruleConfig?.name as string) || `Optimus Detection ${ruleId.slice(0, 8)}`,
    description: (ruleConfig?.description as string) || 'Deployed from Optimus Detection Studio',
    severity: (ruleConfig?.severity as string) || 'Medium',
    enabled: (ruleConfig?.enabled as boolean) ?? false,  // Default disabled for production safety
    query,
    suppressionDuration: (ruleConfig?.suppressionDuration as string) || 'PT1H',
    suppressionEnabled: (ruleConfig?.suppressionEnabled as boolean) ?? false,
    tactics,
    techniques,
    eventGroupingSettings: {
      aggregationKind: (ruleConfig?.eventGrouping as string) || 'AlertPerResult',
    },
    incidentConfiguration: {
      createIncident: (ruleConfig?.createIncident as boolean) ?? true,
      groupingConfiguration: {
        enabled: (ruleConfig?.groupAlerts as boolean) ?? false,  // Matches Sentinel default (disabled)
        reopenClosedIncident: false,
        lookbackDuration: 'PT5H',
        matchingMethod: 'AllEntities',
        groupByEntities: [],
        groupByAlertDetails: [],
        groupByCustomDetails: [],
      },
    },
  };

  // Scheduled-only fields
  if (!isNRT) {
    const queryFrequency = (ruleConfig?.queryFrequency as string) || 'PT5M';
    const queryPeriod = (ruleConfig?.queryPeriod as string) || queryFrequency;
    properties.queryFrequency = queryFrequency;
    properties.queryPeriod = queryPeriod;
    properties.triggerOperator = (ruleConfig?.triggerOperator as string) || 'GreaterThan';
    properties.triggerThreshold = (ruleConfig?.triggerThreshold as number) ?? 0;
  }

  const body = JSON.stringify({
    kind: ruleKind,
    properties,
  });

  // Sentinel uses PUT for both create and update
  const res = await devProxy(`${baseUrl}/${ruleId}?api-version=2025-06-01`, 'PUT', headers, body);

  if (!res.ok) {
    let detail: string;
    try { detail = JSON.parse(res.body)?.error?.message || res.body.slice(0, 300); } catch { detail = res.body.slice(0, 300); }
    throw new DeployError('VENDOR_ERROR', `Sentinel deploy failed (${res.status}): ${detail}`, 'Check Azure Portal for details.', true);
  }

  const data = JSON.parse(res.body);
  return { vendorRuleId: data.name || ruleId, response: data };
}

async function devListSentinelRules(
  config: Record<string, unknown>,
  credentials: Record<string, string>
): Promise<unknown[]> {
  const tenantId = config.tenantId as string;
  const token = await devMicrosoftGetToken(tenantId, credentials.clientId, credentials.clientSecret, SENTINEL_MANAGEMENT_SCOPE);
  const baseUrl = sentinelBaseUrl(config);

  const res = await devProxy(
    `${baseUrl}?api-version=2025-06-01`,
    'GET',
    { 'Authorization': `Bearer ${token}`, 'Accept': 'application/json' }
  );

  if (!res.ok) throw new DeployError('VENDOR_ERROR', `Sentinel list rules failed: ${res.status}`, 'Check Azure Portal.', false);
  const data = JSON.parse(res.body);
  return (data.value || []).map((r: any) => ({
    id: r.name,
    name: r.properties?.displayName,
    query: r.properties?.query,
    severity: r.properties?.severity,
    enabled: r.properties?.enabled,
  }));
}

async function devDeleteSentinelRule(
  config: Record<string, unknown>,
  credentials: Record<string, string>,
  vendorRuleId: string
): Promise<void> {
  const tenantId = config.tenantId as string;
  const token = await devMicrosoftGetToken(tenantId, credentials.clientId, credentials.clientSecret, SENTINEL_MANAGEMENT_SCOPE);
  const baseUrl = sentinelBaseUrl(config);

  const res = await devProxy(
    `${baseUrl}/${vendorRuleId}?api-version=2025-06-01`,
    'DELETE',
    { 'Authorization': `Bearer ${token}`, 'Accept': 'application/json' }
  );

  if (!res.ok) throw new DeployError('VENDOR_ERROR', `Sentinel delete failed: ${res.status}`, 'Check Azure Portal.', false);
}

async function devTestConnection(
  integration: Integration,
  credentials: Record<string, string>
): Promise<ConnectionTestResult> {
  switch (integration.provider) {
    case 'splunk':
      return devTestSplunk((integration.config || {}) as Record<string, unknown>, credentials);
    case 'elastic':
      return devTestElastic((integration.config || {}) as Record<string, unknown>, credentials);
    case 'defender_xdr':
      return devTestDefenderXdr((integration.config || {}) as Record<string, unknown>, credentials);
    case 'sentinel':
      return devTestSentinel((integration.config || {}) as Record<string, unknown>, credentials);
    case 'crowdstrike':
      return devTestCrowdStrike((integration.config || {}) as Record<string, unknown>, credentials);
    case 'chronicle':
      return devTestChronicle((integration.config || {}) as Record<string, unknown>, credentials);
    default:
      return {
        success: false,
        code: 'TEST_NOT_SUPPORTED',
        message: `Connection testing is not supported for ${integration.provider}. Credentials have not been verified.`,
        latency_ms: 0,
      };
  }
}

function devSplunkBaseUrl(config: Record<string, unknown>): string {
  const host = config.host as string;
  const port = config.port as number || 8089;
  const ssl = config.ssl !== false;
  const protocol = ssl ? 'https' : 'http';
  const owner = (config.owner as string) || 'nobody';
  const app = (config.app as string) || 'search';
  return `${protocol}://${host}:${port}/servicesNS/${owner}/${app}`;
}

function devSplunkHeaders(credentials: Record<string, string>): Record<string, string> {
  const headers: Record<string, string> = {
    'Accept': 'application/json',
    'Content-Type': 'application/x-www-form-urlencoded',
  };
  if (credentials.token) {
    headers['Authorization'] = `Bearer ${credentials.token}`;
  } else if (credentials.username && credentials.password) {
    headers['Authorization'] = `Basic ${btoa(`${credentials.username}:${credentials.password}`)}`;
  }
  return headers;
}

export type AutoRetryKind = '409_to_update' | '404_to_create';

async function devDeploySplunk(
  config: Record<string, unknown>,
  credentials: Record<string, string>,
  query: string,
  ruleConfig?: Record<string, unknown>,
  vendorRuleId?: string
): Promise<{ vendorRuleId: string; response: unknown; autoRetried?: AutoRetryKind }> {
  const baseUrl = devSplunkBaseUrl(config);
  const headers = devSplunkHeaders(credentials);
  const isUpdate = !!vendorRuleId;

  const ruleName = (ruleConfig?.name as string) || `Optimus - Detection ${Date.now()}`;
  const description = (ruleConfig?.description as string) || '';

  const severityMap: Record<string, string> = {
    informational: '1', low: '2', medium: '3', high: '4', critical: '5',
  };
  const severity = severityMap[(ruleConfig?.severity as string)?.toLowerCase() || ''] || '3';

  const params = new URLSearchParams({
    output_mode: 'json',
    search: query,
    is_scheduled: '1',
    disabled: '0',
    cron_schedule: (ruleConfig?.cronSchedule as string) || '*/5 * * * *',
    'dispatch.earliest_time': (ruleConfig?.earliestTime as string) || '-5m@m',
    'dispatch.latest_time': (ruleConfig?.latestTime as string) || 'now',
    description,
    // Alert type settings — makes this an Alert, not a Report
    alert_type: 'number of events',
    alert_comparator: 'greater than',
    alert_threshold: '0',
    'alert.severity': severity,
    'alert.suppress': '0',
    'alert.track': '1',
  });

  if (!isUpdate) {
    params.set('name', ruleName);
  }

  const url = isUpdate
    ? `${baseUrl}/saved/searches/${encodeURIComponent(vendorRuleId)}`
    : `${baseUrl}/saved/searches`;

  let res = await devProxy(url, 'POST', headers, params.toString());
  let autoRetried: AutoRetryKind | undefined;

  // 409 = already exists — auto-retry as update
  if (!isUpdate && res.status === 409) {
    params.delete('name');
    const updateUrl = `${baseUrl}/saved/searches/${encodeURIComponent(ruleName)}`;
    res = await devProxy(updateUrl, 'POST', headers, params.toString());
    if (res.ok) autoRetried = '409_to_update';
  }

  // 404 on update = rule was deleted from Splunk — fall back to create
  if (isUpdate && res.status === 404) {
    params.set('name', vendorRuleId || ruleName);
    const createUrl = `${baseUrl}/saved/searches`;
    res = await devProxy(createUrl, 'POST', headers, params.toString());
    if (res.ok) autoRetried = '404_to_create';
  }

  if (!res.ok) {
    throw parseSplunkError(res.status, res.body);
  }

  const data = JSON.parse(res.body);
  const savedName = data?.entry?.[0]?.name || vendorRuleId || ruleName;
  return { vendorRuleId: savedName, response: data, autoRetried };
}

async function devListSplunkRules(
  config: Record<string, unknown>,
  credentials: Record<string, string>
): Promise<unknown[]> {
  const baseUrl = devSplunkBaseUrl(config);
  const headers = devSplunkHeaders(credentials);

  const res = await devProxy(
    `${baseUrl}/saved/searches?output_mode=json&count=200`,
    'GET',
    headers
  );

  if (!res.ok) {
    throw new Error(`Splunk list rules failed (${res.status}): ${res.body.slice(0, 200)}`);
  }

  const data = JSON.parse(res.body);
  return (data?.entry || []).map((e: any) => ({
    name: e.name,
    search: e.content?.search,
    isScheduled: e.content?.is_scheduled === '1',
    cronSchedule: e.content?.cron_schedule,
    // Same contract as the production edge function's `splunkListRules` projection
    // (supabase/functions/integration-ops/index.ts): emit `enabled`, never `disabled`,
    // so normalizeVendorRule's Splunk branch reads one consistent shape in dev and prod.
    enabled: e.content?.disabled === '1' ? false : true,
    updatedAt: e.updated,
  }));
}

async function devDeleteSplunkRule(
  config: Record<string, unknown>,
  credentials: Record<string, string>,
  vendorRuleId: string
): Promise<void> {
  const baseUrl = devSplunkBaseUrl(config);
  const headers = devSplunkHeaders(credentials);

  const res = await devProxy(
    `${baseUrl}/saved/searches/${encodeURIComponent(vendorRuleId)}`,
    'DELETE',
    headers
  );

  if (!res.ok) {
    throw new Error(`Splunk delete failed (${res.status}): ${res.body.slice(0, 200)}`);
  }
}

// =============================================================================
// Dev-mode toggle functions (enable/disable vendor rules)
// =============================================================================

async function devToggleSplunkRule(
  config: Record<string, unknown>,
  credentials: Record<string, string>,
  vendorRuleId: string,
  enabled: boolean
): Promise<void> {
  const baseUrl = devSplunkBaseUrl(config);
  const headers = devSplunkHeaders(credentials);

  const endpoint = enabled ? 'enable' : 'disable';
  const res = await devProxy(
    `${baseUrl}/saved/searches/${encodeURIComponent(vendorRuleId)}/${endpoint}`,
    'POST',
    headers
  );

  if (!res.ok) {
    throw parseSplunkError(res.status, res.body);
  }
}

async function devToggleSentinelRule(
  config: Record<string, unknown>,
  credentials: Record<string, string>,
  vendorRuleId: string,
  enabled: boolean
): Promise<void> {
  const tenantId = config.tenantId as string;
  const token = await devMicrosoftGetToken(tenantId, credentials.clientId, credentials.clientSecret, SENTINEL_MANAGEMENT_SCOPE);
  const baseUrl = sentinelBaseUrl(config);
  const headers = {
    'Authorization': `Bearer ${token}`,
    'Content-Type': 'application/json',
    'Accept': 'application/json',
  };

  // Sentinel requires full PUT — GET the current rule first, then PUT back with enabled toggled
  const getRes = await devProxy(
    `${baseUrl}/${vendorRuleId}?api-version=2025-06-01`,
    'GET',
    { 'Authorization': `Bearer ${token}`, 'Accept': 'application/json' }
  );
  if (!getRes.ok) throw new DeployError('VENDOR_ERROR', `Failed to get Sentinel rule: ${getRes.status}`, 'Check Azure Portal.', false);

  const ruleData = JSON.parse(getRes.body);
  if (ruleData.properties) {
    ruleData.properties.enabled = enabled;
  }

  const putRes = await devProxy(
    `${baseUrl}/${vendorRuleId}?api-version=2025-06-01`,
    'PUT',
    headers,
    JSON.stringify(ruleData)
  );
  if (!putRes.ok) throw new DeployError('VENDOR_ERROR', `Sentinel toggle failed: ${putRes.status}`, 'Check Azure Portal.', false);
}

async function devToggleDefenderXdrRule(
  config: Record<string, unknown>,
  credentials: Record<string, string>,
  vendorRuleId: string,
  enabled: boolean
): Promise<void> {
  const tenantId = config.tenantId as string;
  const token = await devMicrosoftGetToken(tenantId, credentials.clientId, credentials.clientSecret, GRAPH_SCOPE);

  const res = await devProxy(
    `${GRAPH_DEFENDER_BASE}/${vendorRuleId}`,
    'PATCH',
    {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json',
      'Accept': 'application/json',
    },
    JSON.stringify({ isEnabled: enabled })
  );

  if (!res.ok) throw parseDefenderError(res.status, res.body);
}

async function devToggleElasticRule(
  config: Record<string, unknown>,
  credentials: Record<string, string>,
  vendorRuleId: string,
  enabled: boolean
): Promise<void> {
  const host = config.host as string;
  const port = config.port as number || 9200;
  const ssl = config.ssl !== false;
  const protocol = ssl ? 'https' : 'http';
  let baseUrl = `${protocol}://${host}:${port}`;
  if (config.spaceId) baseUrl += `/s/${encodeURIComponent(String(config.spaceId))}`;

  const headers: Record<string, string> = {
    'Accept': 'application/json',
    'Content-Type': 'application/json',
    'kbn-xsrf': 'true',
  };
  if (credentials.apiKey) {
    headers['Authorization'] = `ApiKey ${credentials.apiKey}`;
  } else if (credentials.username && credentials.password) {
    headers['Authorization'] = `Basic ${btoa(`${credentials.username}:${credentials.password}`)}`;
  }

  // Elastic Security SIEM Detection Engine bulk action
  const res = await devProxy(
    `${baseUrl}/api/detection_engine/rules/_bulk_action`,
    'POST',
    headers,
    JSON.stringify({
      ids: [vendorRuleId],
      action: enabled ? 'enable' : 'disable',
    })
  );

  if (!res.ok) {
    throw new Error(`Elastic toggle failed (${res.status}): ${res.body.slice(0, 200)}`);
  }
}

// =============================================================================
// Dev-mode list for Elastic (was missing: the toggle/delete dev paths above already existed for
// Elastic, but the list switch below did not have a case for it, so a dev-mode Elastic
// connection fell into the `default` throw for `listVendorRules` alone).
// =============================================================================

async function devListElasticRules(
  config: Record<string, unknown>,
  credentials: Record<string, string>
): Promise<unknown[]> {
  const baseUrl = elasticEndpoint(config);

  const headers: Record<string, string> = {
    'Accept': 'application/json',
    'kbn-xsrf': 'true',
  };
  if (credentials.apiKey) {
    headers['Authorization'] = `ApiKey ${credentials.apiKey}`;
  } else if (credentials.username && credentials.password) {
    headers['Authorization'] = `Basic ${btoa(`${credentials.username}:${credentials.password}`)}`;
  }

  const rules: Array<Record<string, any>> = [];
  const seen = new Set<string>();
  for (let page = 1; page <= 500; page++) {
    const res = await devProxy(`${baseUrl}/api/detection_engine/rules/_find?per_page=200&page=${page}`, 'GET', headers);
    if (!res.ok) throw new Error(`Elastic list rules failed (${res.status}): ${res.body.slice(0, 200)}`);
    const data = JSON.parse(res.body);
    if (!Array.isArray(data.data)) throw new Error('Elastic returned an invalid rule page');
    if (data.data.length && data.data.every((rule: Record<string, unknown>) => seen.has(String(rule.id)))) {
      throw new Error('Elastic returned a repeated page; the rule list is incomplete');
    }
    for (const rule of data.data) {
      if (!rule.id) throw new Error('Elastic returned a rule without an object ID');
      if (!seen.has(rule.id)) { seen.add(rule.id); rules.push(rule); }
    }
    if (data.data.length < 200) break;
    if (page === 500) throw new Error('Elastic pagination limit reached; the rule list is incomplete');
  }
  // Same shape normalizeVendorRule's 'elastic' branch already reads (id/name/enabled/query/
  // language/severity/type) -- matching the projection the production edge function's
  // elasticListRules sends, so dev and prod agree on what a rule looks like.
  return rules.map((rule) => ({
    id: rule.id,
    ruleId: rule.rule_id,
    name: rule.name,
    enabled: rule.enabled === true,
    query: rule.query ?? null,
    language: rule.language,
    severity: rule.severity,
    type: rule.type,
  }));
}

async function devDeleteElasticRule(
  config: Record<string, unknown>,
  credentials: Record<string, string>,
  vendorRuleId: string
): Promise<void> {
  const host = config.host as string;
  const port = config.port as number || 9200;
  const ssl = config.ssl !== false;
  const protocol = ssl ? 'https' : 'http';
  let baseUrl = `${protocol}://${host}:${port}`;
  if (config.spaceId) baseUrl += `/s/${encodeURIComponent(String(config.spaceId))}`;

  const headers: Record<string, string> = {
    'Accept': 'application/json',
    'kbn-xsrf': 'true',
  };
  if (credentials.apiKey) {
    headers['Authorization'] = `ApiKey ${credentials.apiKey}`;
  } else if (credentials.username && credentials.password) {
    headers['Authorization'] = `Basic ${btoa(`${credentials.username}:${credentials.password}`)}`;
  }

  const res = await devProxy(
    `${baseUrl}/api/detection_engine/rules?id=${vendorRuleId}`,
    'DELETE',
    headers
  );

  if (!res.ok) {
    throw new Error(`Elastic delete failed (${res.status}): ${res.body.slice(0, 200)}`);
  }
}

// =============================================================================
// Vendor Rule Normalization
// =============================================================================

/**
 * Derives the observed enable/disable state reported by a vendor's list API.
 *
 * Contract: every provider's list projection (dev proxy AND production edge
 * function alike) must report observed state through one boolean field named
 * `enabled` on the raw rule object — never a `disabled` field, and never a
 * provider-specific name like Chronicle's underlying `liveRuleEnabled` (that
 * gets renamed to `enabled` at projection time, in both
 * `devListChronicleRules` and `chronicleListRules`). When that field is absent
 * — whether because the projection never set it, or because the vendor
 * genuinely didn't return it (Chronicle's execution state lives on a separate
 * RuleDeployment resource and may simply not be present) — the state is
 * "unknown", NOT "disabled". Callers must never default a missing value to
 * `false`.
 *
 * `provider` is accepted (rather than reading `raw.enabled` inline at each
 * call site) so this stays the single place that contract is enforced if a
 * future provider needs a different raw field name.
 */
export function observedState(
  _provider: IntegrationProvider,
  raw: Record<string, any>
): 'enabled' | 'disabled' | 'unknown' {
  if (raw.enabled === true) return 'enabled';
  if (raw.enabled === false) return 'disabled';
  return 'unknown';
}

export function normalizeVendorRule(
  raw: Record<string, any>,
  provider: IntegrationProvider,
  integrationId: string,
  integrationName: string
): VendorRule {
  switch (provider) {
    case 'splunk': {
      const state = observedState(provider, raw);
      return {
        vendorRuleId: raw.name,
        name: raw.name,
        enabled: state === 'enabled',
        observedState: state,
        provider,
        integrationId,
        integrationName,
        query: raw.search || null,
        queryLanguage: 'SPL',
        lastModified: raw.updatedAt || raw.updated,
        schedule: raw.cronSchedule,
        isFromOptimus: false,
        rawMetadata: raw,
      };
    }
    case 'sentinel': {
      const state = observedState(provider, raw);
      return {
        vendorRuleId: raw.id,
        name: raw.name,
        enabled: state === 'enabled',
        observedState: state,
        provider,
        integrationId,
        integrationName,
        query: raw.query || null,
        queryLanguage: 'KQL',
        severity: raw.severity,
        ruleKind: raw.kind,
        isFromOptimus: false,
        rawMetadata: raw,
      };
    }
    case 'defender_xdr': {
      // Microsoft removes `isEnabled` and `schedule.period` on 2026-10-01
      // (Graph beta security-detectionrule / security-ruleschedule docs,
      // dated 2026-05-25). Replacements are `status` (enum) and
      // `schedule.frequency` (ISO-8601 Duration). The tenant evidence we have
      // (deployment_history, 2026-02-12) shows a tenant served ONLY the
      // deprecated shape, so both must be read: prefer the current field,
      // fall back to the deprecated one, and treat absence of both as
      // `unknown` rather than `disabled` (observedState()'s contract).
      let rawEnabled: boolean | undefined;
      let stateReason: string | undefined;
      if (raw.status !== undefined) {
        if (raw.status === 'enabled') rawEnabled = true;
        else if (raw.status === 'disabled') rawEnabled = false;
        else if (raw.status === 'autoDisabled') {
          // Microsoft turned the rule off (not a human) -- preserve why.
          rawEnabled = false;
          stateReason = 'autoDisabled';
        }
        // 'unknownFutureValue' (or any other value) leaves rawEnabled undefined -> unknown.
      } else if (raw.isEnabled !== undefined) {
        rawEnabled = raw.isEnabled === true;
      }
      const state = observedState(provider, { enabled: rawEnabled });

      const frequency = raw.schedule?.frequency;
      const period = raw.schedule?.period;
      const schedule =
        frequency !== undefined
          ? frequency
          : period !== undefined
            ? period === '0'
              ? 'continuous' // '0' means continuous, not a literal zero-length interval.
              : period
            : undefined;

      return {
        vendorRuleId: raw.id,
        name: raw.name,
        enabled: state === 'enabled',
        observedState: state,
        provider,
        integrationId,
        integrationName,
        query: raw.query || null,
        queryLanguage: 'KQL',
        schedule,
        description: raw.description || raw.detectionAction?.alertTemplate?.description,
        isFromOptimus: false,
        // Full raw response preserved (not just the projected fields) so the
        // next real fetch reveals which shape the tenant serves today --
        // including mitreTechniques, organizationalScope, responseActions,
        // automatedActions, detectorId and lastRunDetails where present.
        rawMetadata: stateReason ? { ...raw, stateReason } : raw,
      };
    }
    case 'elastic':
      return {
        vendorRuleId: raw.id,
        name: raw.name,
        enabled: raw.enabled ?? false,
        provider,
        integrationId,
        integrationName,
        query: raw.query || null,
        queryLanguage: raw.language?.toUpperCase() || 'Lucene',
        severity: raw.severity,
        ruleKind: raw.type,
        isFromOptimus: false,
        rawMetadata: raw,
      };
    case 'crowdstrike':
      return {
        vendorRuleId: raw.id,
        name: raw.name,
        enabled: raw.status === 'active' || raw.enabled === true,
        provider,
        integrationId,
        integrationName,
        query: raw.query || raw.search?.filter || null,
        queryLanguage: 'CQL',
        severity: raw.severity != null ? String(raw.severity) : undefined,
        description: raw.description,
        lastModified: raw.last_updated_on,
        schedule: raw.schedule || raw.operation?.schedule?.definition,
        isFromOptimus: false,
        rawMetadata: raw,
      };
    case 'chronicle': {
      const state = observedState(provider, raw);
      return {
        vendorRuleId: raw.id,
        name: raw.name,
        enabled: state === 'enabled',
        observedState: state,
        provider,
        integrationId,
        integrationName,
        query: raw.query || null,
        queryLanguage: 'YARA-L',
        severity: raw.severity,
        description: raw.description,
        lastModified: raw.lastModified,
        isFromOptimus: false,
        rawMetadata: raw,
      };
    }
    default:
      return {
        vendorRuleId: raw.id || raw.name || '',
        name: raw.name || 'Unknown',
        enabled: raw.enabled ?? true,
        provider,
        integrationId,
        integrationName,
        query: raw.query || null,
        queryLanguage: 'Unknown',
        isFromOptimus: false,
        rawMetadata: raw,
      };
  }
}

export const integrationService = {
  // ---------------------------------------------------------------------------
  // Direct Supabase reads (non-sensitive, uses RLS)
  // ---------------------------------------------------------------------------

  async listIntegrations(): Promise<Integration[]> {
    const { data, error } = await supabase
      .from('integrations')
      .select('*')
      .order('created_at', { ascending: false });

    if (error) throw new Error(`Failed to list integrations: ${error.message}`);
    // select('*') works before archived_at is introduced by the native SIEM migration.
    return (data || []).filter((integration) => !integration.archived_at) as Integration[];
  },

  async getIntegration(id: string): Promise<Integration> {
    const { data, error } = await supabase
      .from('integrations')
      .select('*')
      .eq('id', id)
      .single();

    if (error) throw new Error(`Failed to get integration: ${error.message}`);
    return data as Integration;
  },

  async getDeploymentHistory(filters?: {
    detectionId?: string;
    integrationId?: string;
  }): Promise<DeploymentRecord[]> {
    let query = supabase
      .from('deployment_history')
      .select('*')
      .order('created_at', { ascending: false });

    if (filters?.detectionId) {
      query = query.eq('detection_id', filters.detectionId);
    }
    if (filters?.integrationId) {
      query = query.eq('integration_id', filters.integrationId);
    }

    const { data, error } = await query;
    if (error) throw new Error(`Failed to get deployment history: ${error.message}`);
    return (data || []) as DeploymentRecord[];
  },

  async getAllDeployments(options?: {
    limit?: number;
    offset?: number;
  }): Promise<DeploymentRecord[]> {
    const limit = options?.limit ?? 50;
    const offset = options?.offset ?? 0;

    const { data, error } = await supabase
      .from('deployment_history')
      .select('*')
      .order('created_at', { ascending: false })
      .range(offset, offset + limit - 1);

    if (error) throw new Error(`Failed to get deployments: ${error.message}`);
    return (data || []) as DeploymentRecord[];
  },

  async updateIntegrationDirect(
    id: string,
    updates: Partial<Pick<Integration, 'name' | 'is_default' | 'status'>>
  ): Promise<Integration> {
    const { data, error } = await supabase
      .from('integrations')
      .update(updates)
      .eq('id', id)
      .select()
      .single();

    if (error) throw new Error(`Failed to update integration: ${error.message}`);
    return data as Integration;
  },

  async deleteIntegration(id: string): Promise<void> {
    const { data: runs, error: runError } = await supabase.from('siem_sync_runs').select('id').eq('integration_id', id).limit(1);
    const { data: bindings, error: bindingError } = await supabase.from('siem_rule_bindings').select('id').eq('integration_id', id).limit(1);
    if (runError || bindingError) throw new Error('Unable to verify connection history');
    if (runs?.length || bindings?.length) {
      const { data, error } = await supabase.functions.invoke('integration-ops', { body: { action: 'native_disconnect', integrationId: id } });
      if (error || data?.error) throw new Error(data?.error || error?.message);
      devCredentialCache.delete(id);
      return;
    }
    const { error } = await supabase
      .from('integrations')
      .delete()
      .eq('id', id);

    if (error) throw new Error(`Failed to delete integration: ${error.message}`);
  },

  /** Atomically set one integration as default for its provider (clears others first). */
  async setAsDefault(integrationId: string): Promise<void> {
    const { data: integration, error: fetchError } = await supabase
      .from('integrations')
      .select('provider, user_id')
      .eq('id', integrationId)
      .single();

    if (fetchError || !integration) throw new Error('Integration not found');

    // Clear all same-provider defaults for this user
    await supabase
      .from('integrations')
      .update({ is_default: false })
      .eq('user_id', integration.user_id)
      .eq('provider', integration.provider);

    // Set target as default
    const { error } = await supabase
      .from('integrations')
      .update({ is_default: true })
      .eq('id', integrationId);

    if (error) throw new Error(`Failed to set default: ${error.message}`);
  },

  // ---------------------------------------------------------------------------
  // Edge function calls (sensitive - credentials handled server-side)
  // In dev mode: bypasses edge functions, stores credentials in local DB,
  // and uses Vite dev proxy for vendor API calls.
  // ---------------------------------------------------------------------------

  async createIntegration(params: {
    provider: IntegrationProvider;
    name: string;
    category: IntegrationCategory;
    config: IntegrationConfig;
    authType: IntegrationAuthType;
    credentials: Record<string, string>;
  }): Promise<Integration> {
    if (IS_DEV) {
      // Dev mode: write directly to Supabase, store credentials as JSON in config
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('Not authenticated');

      const { data: integration, error } = await supabase
        .from('integrations')
        .insert({
          user_id: user.id,
          provider: params.provider,
          name: params.name,
          category: params.category,
          config: params.config,
          auth_type: params.authType,
          status: 'configured',
        })
        .select()
        .single();

      if (error) throw new Error(`Failed to create integration: ${error.message}`);
      // Store credentials in memory only — never persisted to DB
      devCredentialCache.set(integration.id, params.credentials);

      // Auto-set as default if first connection for this provider
      const { count } = await supabase
        .from('integrations')
        .select('id', { count: 'exact', head: true })
        .eq('user_id', user.id)
        .eq('provider', params.provider);
      if (count === 1) {
        await supabase.from('integrations').update({ is_default: true }).eq('id', integration.id);
        integration.is_default = true;
      }

      return integration as Integration;
    }

    const { data, error } = await supabase.functions.invoke('integration-ops', {
      body: {
        action: 'save_credentials',
        provider: params.provider,
        name: params.name,
        category: params.category,
        config: params.config,
        authType: params.authType,
        credentials: params.credentials,
      },
    });

    if (error) throw new Error(`Failed to create integration: ${error.message}`);
    if (data?.error) throw new Error(data.error);

    // Auto-set as default if first connection for this provider
    const created = data.integration as Integration;
    const { count } = await supabase
      .from('integrations')
      .select('id', { count: 'exact', head: true })
      .eq('provider', params.provider);
    if (count === 1) {
      await supabase.from('integrations').update({ is_default: true }).eq('id', created.id);
      created.is_default = true;
    }

    return created;
  },

  async updateCredentials(
    integrationId: string,
    config?: IntegrationConfig,
    credentials?: Record<string, string>,
    name?: string
  ): Promise<Integration> {
    if (IS_DEV) {
      // Dev mode: update directly
      const updates: Record<string, unknown> = {};
      if (name) updates.name = name;
      if (config) {
        const { data: existing } = await supabase
          .from('integrations')
          .select('config')
          .eq('id', integrationId)
          .single();
        const existingConfig = (existing?.config || {}) as Record<string, unknown>;
        updates.config = {
          ...existingConfig,
          ...config,
        };
      }

      const { data, error } = await supabase
        .from('integrations')
        .update(updates)
        .eq('id', integrationId)
        .select()
        .single();

      if (error) throw new Error(`Failed to update credentials: ${error.message}`);
      // Store credentials in memory only — never persisted to DB
      if (credentials) {
        devCredentialCache.set(integrationId, credentials);
      }
      return data as Integration;
    }

    const { data, error } = await supabase.functions.invoke('integration-ops', {
      body: {
        action: 'save_credentials',
        integrationId,
        config,
        credentials,
        name,
      },
    });

    if (error) throw new Error(`Failed to update credentials: ${error.message}`);
    if (data?.error) throw new Error(data.error);
    return data.integration as Integration;
  },

  async testConnection(integrationId: string): Promise<ConnectionTestResult> {
    if (IS_DEV) {
      // Dev mode: fetch integration from DB, extract dev credentials, test via proxy
      const { data: integration, error } = await supabase
        .from('integrations')
        .select('*')
        .eq('id', integrationId)
        .single();

      if (error || !integration) throw new Error('Integration not found');

      const config = (integration.config || {}) as Record<string, unknown>;
      const credentials = await migrateDevCredentials(integrationId, config);
      if (!credentials) throw new Error('Dev credentials not found — please re-enter credentials in integration settings.');

      await supabase
        .from('integrations')
        .update({ status: 'testing' })
        .eq('id', integrationId);

      let result: ConnectionTestResult;
      try {
        result = await devTestConnection(integration as Integration, credentials);
      } catch (err) {
        result = { success: false, message: err instanceof Error ? err.message : 'Connection test failed', latency_ms: 0 };
      }

      await supabase
        .from('integrations')
        .update({
          status: result.code === 'TEST_NOT_SUPPORTED' ? 'configured' : result.success ? 'connected' : 'error',
          last_tested_at: result.code === 'TEST_NOT_SUPPORTED' ? null : new Date().toISOString(),
          last_test_result: result,
        })
        .eq('id', integrationId);

      return result;
    }

    const { data, error } = await supabase.functions.invoke('integration-ops', {
      body: {
        action: 'test_connection',
        integrationId,
      },
    });

    if (error) throw new Error(`Connection test failed: ${error.message}`);
    if (data?.error && !data?.success && data?.success !== false) throw new Error(data.error);
    return data as ConnectionTestResult;
  },

  async deployDetection(params: {
    integrationId: string;
    detectionId: string;
    query: string;
    queryLanguage: string;
    ruleConfig?: Partial<VendorRuleConfig> & { name?: string; description?: string; action?: string };
    vendorRuleId?: string;
    // Present only for a rule already tracked in a SIEM: the revision the user reviewed
    // in the Deploy modal's production comparison before confirming.
    expectedHash?: string;
    expectedVersion?: number;
  }): Promise<DeploymentRecord> {
    // Guard: only Production Library detections can be deployed
    const { data: detectionCheck } = await supabase
      .from('detections')
      .select('library_type')
      .eq('id', params.detectionId)
      .single();

    if (detectionCheck?.library_type !== 'production') {
      throw new DeployError(
        'LAB_DETECTION',
        'Only Production Library detections can be deployed to SIEMs.',
        'Promote this detection from Detection Lab first.',
        false
      );
    }

    // The dev proxy calls the vendor straight from the browser: no write gate, no drift check, no
    // readback. A rule this connection already tracks is therefore the server route's to write, in
    // development too -- otherwise the only UI route to update it dead-ends. Untracked targets keep
    // the proxy, and requireUnboundTarget still refuses one bound anywhere else.
    // ... and the proxy is only usable at all when this browser holds credentials for the
    // connection. Without them the deploy belongs to the server route, which has the encrypted
    // ones -- the same path the deployed app always takes.
    let devTarget = IS_DEV && !(await hasActiveBinding(params.integrationId, { detectionId: params.detectionId }))
      ? await devProxyTarget(params.integrationId)
      : null;
    // Defender always uses the server's inventory verification, even with the dev proxy enabled.
    if (devTarget?.integration.provider === 'defender_xdr') devTarget = null;
    if (devTarget) {
      await requireUnboundTarget(params.detectionId, params.integrationId, params.vendorRuleId);

      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('Not authenticated');

      const { integration, config, credentials } = devTarget;

      const action = params.ruleConfig?.action || (params.vendorRuleId ? 'update' : 'create');
      const existingVendorRuleId = action === 'update' ? params.vendorRuleId : undefined;

      const startedAt = new Date().toISOString();

      // Create in-progress deployment record
      const { data: deployment, error: depErr } = await supabase
        .from('deployment_history')
        .insert({
          user_id: user.id,
          integration_id: params.integrationId,
          detection_id: params.detectionId,
          action,
          status: 'in_progress',
          query_language: params.queryLanguage,
          deployed_query: params.query,
          rule_config: params.ruleConfig || {},
          started_at: startedAt,
        })
        .select()
        .single();
      if (depErr) throw new Error(`Failed to record deployment: ${depErr.message}`);

      try {
        let result: { vendorRuleId: string; response: unknown; autoRetried?: AutoRetryKind };
        switch (integration.provider) {
          case 'splunk':
            result = await devDeploySplunk(
              config, credentials, params.query,
              params.ruleConfig as Record<string, unknown>,
              existingVendorRuleId
            );
            break;
          case 'defender_xdr':
            result = await devDeployDefenderXdr(
              config, credentials, params.query,
              params.ruleConfig as Record<string, unknown>,
              existingVendorRuleId
            );
            break;
          case 'sentinel':
            result = await devDeploySentinel(
              config, credentials, params.query,
              params.ruleConfig as Record<string, unknown>,
              existingVendorRuleId
            );
            break;
          case 'crowdstrike':
            result = await devDeployCrowdStrike(
              config, credentials, params.query,
              params.ruleConfig as Record<string, unknown>,
              existingVendorRuleId
            );
            break;
          case 'chronicle':
            result = await devDeployChronicle(
              config, credentials, params.query,
              params.ruleConfig as Record<string, unknown>,
              existingVendorRuleId
            );
            break;
          default:
            throw new Error(`Dev mode deploy not implemented for ${integration.provider}`);
        }

        const completedAt = new Date().toISOString();
        const durationMs = new Date(completedAt).getTime() - new Date(startedAt).getTime();

        await supabase
          .from('deployment_history')
          .update({
            status: 'success',
            vendor_rule_id: result.vendorRuleId,
            response: result.response,
            completed_at: completedAt,
            duration_ms: durationMs,
          })
          .eq('id', deployment.id);

        return {
          ...deployment,
          status: 'success',
          vendor_rule_id: result.vendorRuleId,
          duration_ms: durationMs,
          _autoRetried: result.autoRetried,
        } as DeploymentRecord & { _autoRetried?: AutoRetryKind };
      } catch (err) {
        const completedAt = new Date().toISOString();
        const durationMs = new Date(completedAt).getTime() - new Date(startedAt).getTime();

        const errorMessage = err instanceof Error ? err.message : 'Deployment failed';

        await supabase
          .from('deployment_history')
          .update({
            status: 'failed',
            error_message: errorMessage,
            completed_at: completedAt,
            duration_ms: durationMs,
          })
          .eq('id', deployment.id);

        throw err;
      }
    }

    const { data, error } = await supabase.functions.invoke('integration-ops', {
      body: {
        action: 'deploy_rule',
        integrationId: params.integrationId,
        detectionId: params.detectionId,
        query: params.query,
        queryLanguage: params.queryLanguage,
        ruleConfig: params.ruleConfig,
        vendorRuleId: params.ruleConfig?.action === 'create' ? undefined : params.vendorRuleId,
        // Present only for a rule already tracked in a SIEM: the revision the user reviewed.
        expectedHash: params.expectedHash,
        expectedVersion: params.expectedVersion,
      },
    });

    if (error) throw new Error(await edgeFunctionMessage(error, 'Deployment failed'));
    if (data?.error) throw new Error(data.error);
    return data.deployment as DeploymentRecord;
  },

  async runPreflight(params: {
    detectionId: string;
    integrationId: string;
    windowDays: number;
    provider: IntegrationProvider;
  }, options: RunPreflightOptions = {}): Promise<PreflightResult> {
    if (IS_DEV && params.provider === 'defender_xdr') {
      return devRunPreflightDefenderXdr(params);
    }
    const { data, error } = await supabase.functions.invoke('integration-ops', {
      body: {
        action: 'run_preflight',
        detectionId: params.detectionId,
        integrationId: params.integrationId,
        windowDays: params.windowDays,
      },
    });
    if (error) throw new Error(`Pre-flight failed: ${await edgeFunctionMessage(error, 'Request failed')}`);
    if (data?.error) throw new Error(data.error);
    let run = data as PreflightResult;
    if (run.status !== 'running') return run;

    options.onStarted?.(run);
    try {
      while (run.status === 'running') {
        await waitForPreflightPoll(options.signal);
        run = await invokePreflightAction('poll_preflight', run.id);
      }
      return run;
    } catch (pollError) {
      if (pollError instanceof DOMException && pollError.name === 'AbortError') {
        return invokePreflightAction('cancel_preflight', run.id);
      }
      try {
        await invokePreflightAction('cancel_preflight', run.id);
      } catch (cancelError) {
        logger.warn('[preflight] failed to cancel after polling error:', cancelError);
      }
      throw pollError;
    }
  },

  async cancelPreflight(preflightRunId: string): Promise<PreflightResult> {
    return invokePreflightAction('cancel_preflight', preflightRunId);
  },

  async listVendorRules(integrationId: string): Promise<unknown[]> {
    if (IS_DEV) {
      const { data: integration, error } = await supabase
        .from('integrations')
        .select('*')
        .eq('id', integrationId)
        .single();
      if (error || !integration) throw new Error('Integration not found');

      const config = (integration.config || {}) as Record<string, unknown>;
      const credentials = await migrateDevCredentials(integrationId, config);
      if (!credentials) throw new Error('Dev credentials not found — please re-enter credentials in integration settings.');

      switch (integration.provider) {
        case 'splunk':
          return devListSplunkRules(config, credentials);
        case 'defender_xdr':
          return devListDefenderXdrRules(config, credentials);
        case 'sentinel':
          return devListSentinelRules(config, credentials);
        case 'crowdstrike':
          return devListCrowdStrikeRules(config, credentials);
        case 'chronicle':
          return devListChronicleRules(config, credentials);
        case 'elastic':
          return devListElasticRules(config, credentials);
        default:
          throw new Error(`Dev mode list rules not implemented for ${integration.provider}`);
      }
    }

    const { data, error } = await supabase.functions.invoke('integration-ops', {
      body: {
        action: 'list_rules',
        integrationId,
      },
    });

    if (error) throw new Error(`Failed to list vendor rules: ${error.message}`);
    if (data?.error) throw new Error(data.error);
    return data.rules || [];
  },

  async listVendorRulesEnriched(integrationId: string): Promise<VendorRule[]> {
    // 1. Get the integration metadata
    const integration = await this.getIntegration(integrationId);

    // 2. Fetch raw rules + deployment history in parallel
    const [rawRules, deployments] = await Promise.all([
      this.listVendorRules(integrationId),
      this.getDeploymentHistory({ integrationId }),
    ]);

    // 3. Build deployment map: vendor_rule_id → most recent successful deployment
    const deploymentMap = new Map<string, DeploymentRecord>();
    for (const dep of deployments) {
      if (dep.status === 'success' && dep.vendor_rule_id) {
        const existing = deploymentMap.get(dep.vendor_rule_id);
        if (!existing || new Date(dep.created_at) > new Date(existing.created_at)) {
          deploymentMap.set(dep.vendor_rule_id, dep);
        }
      }
    }

    // 4. Normalize + enrich with Optimus linkage
    return (rawRules as Record<string, any>[]).map(raw => {
      const rule = normalizeVendorRule(raw, integration.provider, integrationId, integration.name);
      const deployment = deploymentMap.get(rule.vendorRuleId);
      if (deployment) {
        rule.isFromOptimus = true;
        rule.optimusDetectionId = deployment.detection_id;
        rule.lastDeploymentId = deployment.id;
      }
      return rule;
    });
  },

  async toggleVendorRule(integrationId: string, vendorRuleId: string, enabled: boolean): Promise<void> {
    // A tracked rule's enable/disable goes through the server route in development too: the proxy
    // cannot read production first, refuse under drift, or read the result back.
    if (IS_DEV && !(await hasActiveBinding(integrationId, { vendorRuleId }))) {
      await requireUnboundTarget(undefined, integrationId, vendorRuleId);

      const { data: integration, error } = await supabase
        .from('integrations')
        .select('*')
        .eq('id', integrationId)
        .single();
      if (error || !integration) throw new Error('Integration not found');

      const config = (integration.config || {}) as Record<string, unknown>;
      const credentials = await migrateDevCredentials(integrationId, config);
      if (!credentials) throw new Error('Dev credentials not found — please re-enter credentials in integration settings.');

      switch (integration.provider) {
        case 'splunk':
          await devToggleSplunkRule(config, credentials, vendorRuleId, enabled);
          break;
        case 'sentinel':
          await devToggleSentinelRule(config, credentials, vendorRuleId, enabled);
          break;
        case 'defender_xdr':
          await devToggleDefenderXdrRule(config, credentials, vendorRuleId, enabled);
          break;
        case 'elastic':
          await devToggleElasticRule(config, credentials, vendorRuleId, enabled);
          break;
        case 'crowdstrike':
          await devToggleCrowdStrikeRule(config, credentials, vendorRuleId, enabled);
          break;
        case 'chronicle':
          await devToggleChronicleRule(config, credentials, vendorRuleId, enabled);
          break;
        default:
          throw new Error(`Toggle not supported for ${integration.provider}`);
      }
      return;
    }

    const { data, error } = await supabase.functions.invoke('integration-ops', {
      body: {
        action: 'toggle_rule',
        integrationId,
        vendorRuleId,
        enabled,
      },
    });

    if (error) throw new Error(await edgeFunctionMessage(error, 'Failed to toggle rule'));
    if (data?.error) throw new Error(data.error);
  },

  async deleteVendorRule(integrationId: string, vendorRuleId: string): Promise<void> {
    if (IS_DEV && !(await hasActiveBinding(integrationId, { vendorRuleId }))) {
      await requireUnboundTarget(undefined, integrationId, vendorRuleId);

      const { data: integration, error } = await supabase
        .from('integrations')
        .select('*')
        .eq('id', integrationId)
        .single();
      if (error || !integration) throw new Error('Integration not found');

      const config = (integration.config || {}) as Record<string, unknown>;
      const credentials = await migrateDevCredentials(integrationId, config);
      if (!credentials) throw new Error('Dev credentials not found — please re-enter credentials in integration settings.');

      switch (integration.provider) {
        case 'splunk':
          await devDeleteSplunkRule(config, credentials, vendorRuleId);
          break;
        case 'sentinel':
          await devDeleteSentinelRule(config, credentials, vendorRuleId);
          break;
        case 'defender_xdr':
          await devDeleteDefenderXdrRule(config, credentials, vendorRuleId);
          break;
        case 'elastic':
          await devDeleteElasticRule(config, credentials, vendorRuleId);
          break;
        case 'crowdstrike':
          await devDeleteCrowdStrikeRule(config, credentials, vendorRuleId);
          break;
        case 'chronicle':
          await devDeleteChronicleRule(config, credentials, vendorRuleId);
          break;
        default:
          throw new Error(`Delete not supported for ${integration.provider}`);
      }

      // Mark any matching deployment_history records as rolled_back
      await supabase
        .from('deployment_history')
        .update({ status: 'rolled_back' })
        .eq('integration_id', integrationId)
        .eq('vendor_rule_id', vendorRuleId)
        .eq('status', 'success');

      return;
    }

    const { data, error } = await supabase.functions.invoke('integration-ops', {
      body: {
        action: 'delete_vendor_rule',
        integrationId,
        vendorRuleId,
      },
    });

    if (error) throw new Error(await edgeFunctionMessage(error, 'Failed to delete rule'));
    if (data?.error) throw new Error(data.error);
  },

  async importVendorRule(rule: VendorRule): Promise<string> {
    // Every provider whose durable import is enabled (supportsNativeImport) goes through
    // "Sync rules to Production Library" on the connection instead -- this legacy path predates
    // matching/linking, duplicate detection and event recording, none of which it has. CrowdStrike
    // was blocked here first; this is the same guard applied to the other five now that their
    // durable readers exist. A provider without the capability keeps this path exactly as before.
    if (supportsNativeImport(rule.provider)) throw new Error('Use “Sync rules to Production Library” on the connection to import and link this rule.');
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) throw new Error('Not authenticated');

    const detectionId = crypto.randomUUID();
    const now = new Date().toISOString();

    // Map vendor query language to our standard names
    const queryLanguageMap: Record<string, string> = {
      'SPL': 'SPL',
      'KQL': 'KQL',
      'LUCENE': 'Lucene',
      'EQL': 'EQL',
      'ES|QL': 'ESQL',
      'ESQL': 'ESQL',
      'YARA-L': 'YARA-L',
    };
    const normalizedLang = queryLanguageMap[rule.queryLanguage.toUpperCase()] || rule.queryLanguage;

    // Determine source based on provider
    // This path is unreachable today for every provider supportsNativeImport() covers (blocked
    // above); it only still runs for a provider that has NOT been given durable import, or if one
    // is rolled back later. The map is still fixed here so it is correct the moment that happens.
    //
    // Defender XDR used to share 'microsoft_sentinel' with the actual Sentinel entry -- a
    // confirmed defect, not a deliberate choice, so a Defender-imported row was mislabelled as
    // Sentinel-sourced. There is no dedicated DetectionSource value for Defender XDR (see
    // types/detection.ts), and the durable path's own rows use 'native_siem' (Task 17), so that is
    // what a Defender import through this legacy path gets now instead of colliding with Sentinel.
    // Existing rows already written with 'microsoft_sentinel' are NOT rewritten here -- there is
    // no way to tell, after the fact, which of those rows actually came from Defender vs Sentinel
    // without proven native provenance, and guessing would corrupt correct Sentinel rows.
    const sourceMap: Record<string, string> = {
      splunk: 'splunk_escu',
      sentinel: 'microsoft_sentinel',
      elastic: 'elastic',
      defender_xdr: 'native_siem',
      crowdstrike: 'crowdstrike',
      chronicle: 'chronicle',
    };

    const { data, error } = await supabase
      .from('detections')
      .insert({
        id: detectionId,
        user_id: user.id,
        version: 1,
        name: rule.name,
        description: rule.description || `Imported from ${rule.integrationName} (${rule.provider})`,
        author: user.email || 'Imported',
        status: 'Draft',
        detectionType: 'Detection',
        severity: rule.severity || 'Medium',
        logSource: '',
        logSources: [],
        dataSources: [],
        dataComponents: [],
        platforms: [],
        technology: '',
        queries: rule.query ? [{
          id: crypto.randomUUID(),
          language: normalizedLang,
          query: rule.query,
          isPrimary: true,
          createdDate: now,
          updatedDate: now,
        }] : [],
        queryLanguage: normalizedLang,
        detectionQuery: rule.query || '',
        queryExplanation: '',
        mitreAttackIds: [],
        mitreTactics: [],
        mitreTechniques: [],
        linkedGroups: [],
        linkedSoftware: [],
        linkedCampaigns: [],
        threatActors: [],
        campaigns: [],
        software: [],
        associatedCVEs: [],
        investigationSteps: [],
        responseActions: [],
        falsePositiveGuidance: '',
        prerequisites: [],
        caveats: '',
        fineTuning: '',
        testedAndValidated: false,
        testCases: [],
        qualityScore: 0,
        references: [],
        tags: ['imported', rule.provider],
        auditLog: [{
          id: crypto.randomUUID(),
          timestamp: now,
          userId: user.id,
          userName: user.email || 'Unknown',
          action: 'created',
          details: `Imported from ${rule.integrationName} (vendor rule: ${rule.vendorRuleId})`,
        }],
        library_type: 'production',
        source: sourceMap[rule.provider] || 'custom',
        source_rule_id: null,
        source_url: null,
        external_id: rule.vendorRuleId,
        promotion_status: 'none',
        promoted_to_id: null,
        promoted_at: null,
        createdDate: now,
        updatedDate: now,
      })
      .select('id')
      .single();

    if (error) throw new Error(`Failed to import rule: ${error.message}`);
    return data.id;
  },

  async deleteDeployedRule(deploymentId: string): Promise<void> {
    const { data: target, error: targetError } = await supabase.from('deployment_history')
      .select('detection_id,integration_id,vendor_rule_id').eq('id', deploymentId).single();
    if (targetError) throw new Error('Deployment not found');
    if (IS_DEV && !(await hasActiveBinding(target.integration_id, {
      detectionId: target.detection_id, vendorRuleId: target.vendor_rule_id,
    }))) {
      await requireUnboundTarget(target.detection_id, target.integration_id, target.vendor_rule_id);

      const { data: deployment, error: depErr } = await supabase
        .from('deployment_history')
        .select('*, integration:integrations(*)')
        .eq('id', deploymentId)
        .single();
      if (depErr || !deployment) throw new Error('Deployment not found');
      if (!deployment.vendor_rule_id) throw new Error('No vendor rule ID to delete');

      const integration = deployment.integration as unknown as Integration;
      const config = (integration.config || {}) as Record<string, unknown>;
      const credentials = await migrateDevCredentials(integration.id, config);
      if (!credentials) throw new Error('Dev credentials not found — please re-enter credentials in integration settings.');

      switch (integration.provider) {
        case 'splunk':
          await devDeleteSplunkRule(config, credentials, deployment.vendor_rule_id);
          break;
        case 'defender_xdr':
          await devDeleteDefenderXdrRule(config, credentials, deployment.vendor_rule_id);
          break;
        case 'sentinel':
          await devDeleteSentinelRule(config, credentials, deployment.vendor_rule_id);
          break;
        case 'crowdstrike':
          await devDeleteCrowdStrikeRule(config, credentials, deployment.vendor_rule_id);
          break;
        case 'chronicle':
          await devDeleteChronicleRule(config, credentials, deployment.vendor_rule_id);
          break;
        default:
          throw new Error(`Dev mode delete not implemented for ${integration.provider}`);
      }

      await supabase
        .from('deployment_history')
        .update({ status: 'rolled_back' })
        .eq('id', deploymentId);
      return;
    }

    const { data, error } = await supabase.functions.invoke('integration-ops', {
      body: {
        action: 'delete_rule',
        deploymentId,
      },
    });

    if (error) throw new Error(await edgeFunctionMessage(error, 'Failed to delete rule'));
    if (data?.error) throw new Error(data.error);
  },
};
