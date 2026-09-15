import { serve } from 'https://deno.land/std@0.177.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.3'
import { getCorsHeaders, handleCorsPreflight, corsErrorResponse } from '../_shared/cors.ts'
import { validateUrl } from '../_shared/url-validator.ts'
import { checkRateLimit } from '../_shared/rate-limiter.ts'
import { handleNativeRequest, processNativeSync, applyNativeMutation } from '../_shared/native-siem-service.ts'
import { resolveDeployTarget, deployRouteDecision, nativeOperationFor } from '../_shared/siem-deploy-target.ts'
import { readSplunkCorrelationSearches, type SplunkEntry } from '../_shared/siem-readers/splunk.ts'
import { readSentinelAlertRules, type SentinelRuleEntry } from '../_shared/siem-readers/sentinel.ts'
import { readElasticRules, type ElasticRuleEntry } from '../_shared/siem-readers/elastic.ts'
import { readDefenderXdrRules, DEFENDER_XDR_PREVIEW, type DefenderRuleEntry } from '../_shared/siem-readers/defender-xdr.ts'
import { readChronicleRules, type ChronicleRuleEntry } from '../_shared/siem-readers/chronicle.ts'
import {
  buildCrowdStrikeQueries,
  isCrowdStrikeQueryRepository,
  mapCrowdStrikeQueryError,
  parseCrowdStrikeCount,
  pickCrowdStrikeQuery,
  type CrowdStrikeQueryRepository,
} from '../_shared/crowdstrike-preflight.ts'

// =============================================================================
// Types
// =============================================================================

type Action =
  | 'save_credentials'
  | 'test_connection'
  | 'deploy_rule'
  | 'list_rules'
  | 'delete_rule'
  | 'toggle_rule'
  | 'delete_vendor_rule'
  | 'run_preflight'
  | 'poll_preflight'
  | 'cancel_preflight'
  | 'native_sync_start'
  | 'native_inventory_start'
  | 'native_refresh_tracked'
  | 'native_import_start'
  | 'native_import_cancel'
  | 'native_import_retry'
  | 'native_disconnect'
  | 'native_preview'
  | 'native_accept'
  | 'native_save'
  | 'native_restore'
  | 'native_apply'
  | 'native_match_candidates'
  | 'native_link_existing'
  | 'native_dismiss_match'
  | 'native_sync_tick'

type Provider =
  | 'splunk'
  | 'sentinel'
  | 'defender_xdr'
  | 'elastic'
  | 'crowdstrike'
  | 'chronicle'
  | 'github'
  | 'gitlab'
  | 'azure_devops'
  | 'jira'
  | 'slack'

interface IntegrationRequest {
  action: Action
  integrationId?: string
  provider?: Provider
  name?: string
  category?: string
  config?: Record<string, unknown>
  authType?: string
  credentials?: Record<string, string>
  detectionId?: string
  query?: string
  queryLanguage?: string
  ruleConfig?: Record<string, unknown>
  deploymentId?: string
  vendorRuleId?: string
  enabled?: boolean
  windowDays?: number
  preflightRunId?: string
  bindingId?: string
  expectedHash?: string
  expectedVersion?: number
  operation?: 'update' | 'enable' | 'disable' | 'delete'
  localChanges?: { name: string; description: string; query: string; severity: string; schedule: string; lookback: string }
  revisionId?: string
  runId?: string
  queryId?: string
  detectionVersion?: number
  snapshotId?: string
  remoteRuleId?: string
  ids?: string[]
  excludeIds?: string[]
  allMatching?: boolean
  sourceRunId?: string
  idempotencyKey?: string
}

interface ConnectionTestResult {
  success: boolean
  message: string
  latency_ms: number
}

// -- Deployment validation --

type DeployValidationErrorCode =
  | 'DETECTION_NOT_FOUND'
  | 'LAB_DETECTION'
  | 'DETECTION_NOT_DEPLOYABLE_STATUS'
  | 'DETECTION_NO_QUERY'
  | 'QUERY_LANGUAGE_MISMATCH'
  | 'INTEGRATION_NOT_CONNECTED'
  | 'MISSING_RULE_NAME'
  | 'PERMISSION_DENIED'

type DeployValidationWarningCode =
  | 'LOW_QUALITY_SCORE'
  | 'NO_MITRE_MAPPING'
  | 'NO_DESCRIPTION'

interface DeployValidation {
  eligible: boolean
  errors: Array<{ code: DeployValidationErrorCode; message: string }>
  warnings: Array<{ code: DeployValidationWarningCode; message: string }>
}

// -- RBAC --

type GranularPermission = string

const ROLE_DEFAULT_PERMISSIONS: Record<string, GranularPermission[]> = {
  owner: [
    'integrations:view', 'integrations:configure', 'integrations:sync', 'integrations:import',
  ],
  admin: [
    'integrations:view', 'integrations:configure', 'integrations:sync', 'integrations:import',
  ],
  lead: [
    'integrations:view', 'integrations:sync', 'integrations:import',
  ],
  analyst: [
    'integrations:view',
  ],
  viewer: [
    'integrations:view',
  ],
}

const ACTION_PERMISSIONS: Record<Action, GranularPermission> = {
  native_sync_start: 'integrations:import',
  native_inventory_start: 'integrations:import',
  native_refresh_tracked: 'integrations:import',
  native_import_start: 'integrations:import',
  native_import_cancel: 'integrations:import',
  native_import_retry: 'integrations:import',
  native_disconnect: 'integrations:configure',
  native_preview: 'integrations:view',
  native_accept: 'integrations:import',
  native_save: 'integrations:import',
  native_restore: 'integrations:import',
  native_apply: 'integrations:sync',
  native_match_candidates: 'integrations:view',
  native_link_existing: 'integrations:import',
  native_dismiss_match: 'integrations:import',
  native_sync_tick: 'internal:worker',
  save_credentials: 'integrations:configure',
  test_connection: 'integrations:configure',
  deploy_rule: 'integrations:sync',
  list_rules: 'integrations:view',
  delete_rule: 'integrations:sync',
  toggle_rule: 'integrations:sync',
  delete_vendor_rule: 'integrations:sync',
  // run_preflight requires :sync (not :view) by deliberate product decision — it executes
  // arbitrary KQL against the production SIEM and consumes Defender API quota.
  run_preflight: 'integrations:sync',
  poll_preflight: 'integrations:sync',
  cancel_preflight: 'integrations:sync',
}

function computeEffectivePermissions(
  role: string,
  overrides?: { granted?: string[]; revoked?: string[] }
): Set<string> {
  const perms = new Set<string>(ROLE_DEFAULT_PERMISSIONS[role] || [])
  if (overrides) {
    if (overrides.granted) overrides.granted.forEach(p => perms.add(p))
    if (overrides.revoked) overrides.revoked.forEach(p => perms.delete(p))
  }
  return perms
}

async function checkPermission(
  userId: string,
  requiredPermission: GranularPermission
): Promise<{ allowed: boolean; role: string }> {
  const serviceClient = getServiceClient()
  const { data: profile } = await serviceClient
    .from('profiles')
    .select('role, permission_overrides')
    .eq('id', userId)
    .single()

  const role = profile?.role || 'viewer'
  const overrides = profile?.permission_overrides as { granted?: string[]; revoked?: string[] } | undefined
  const perms = computeEffectivePermissions(role, overrides)
  return { allowed: perms.has(requiredPermission), role }
}

// -- Deployment eligibility --

const DEPLOYABLE_STATUSES = ['Production', 'Testing', 'Review']

const PROVIDER_QUERY_LANGUAGES: Record<string, string[]> = {
  splunk: ['SPL'],
  sentinel: ['KQL'],
  defender_xdr: ['KQL'],
  elastic: ['Lucene', 'EQL', 'ES|QL', 'Elasticsearch DSL'],
  crowdstrike: ['CQL'],
  chronicle: ['YARA-L'],
}

async function validateDeploymentEligibility(
  userId: string,
  detectionId: string,
  integrationId: string,
  provider: string,
  ruleName?: string
): Promise<DeployValidation> {
  const errors: DeployValidation['errors'] = []
  const warnings: DeployValidation['warnings'] = []
  const serviceClient = getServiceClient()

  // 1. Detection exists and is owned by the user
  const { data: detection, error: detError } = await serviceClient
    .from('detections')
    .select('id, user_id, library_type, name, description, status, detectionQuery, queryLanguage, queries, qualityScore, mitreTactics, mitreTechniques, version')
    .eq('id', detectionId)
    .single()

  if (detError || !detection) {
    errors.push({ code: 'DETECTION_NOT_FOUND', message: 'Detection not found' })
    return { eligible: false, errors, warnings }
  }

  // Security: Only Production Library detections can be deployed
  if (detection.library_type !== 'production') {
    errors.push({ code: 'LAB_DETECTION', message: 'Only Production Library detections can be deployed to SIEMs. Promote this detection from Detection Lab first.' })
    return { eligible: false, errors, warnings }
  }

  if (detection.user_id !== userId) {
    errors.push({ code: 'PERMISSION_DENIED', message: 'You do not own this detection' })
    return { eligible: false, errors, warnings }
  }

  // 2. Required fields
  if (!detection.name || detection.name.trim() === '') {
    errors.push({ code: 'MISSING_RULE_NAME', message: 'Detection has no name' })
  }

  // 3. Status allows deployment
  if (!DEPLOYABLE_STATUSES.includes(detection.status)) {
    errors.push({
      code: 'DETECTION_NOT_DEPLOYABLE_STATUS',
      message: `Detection must be in Production, Testing, or Review status (current: ${detection.status})`,
    })
  }

  // 4. Has a query
  const hasQuery = detection.detectionQuery && detection.detectionQuery.trim() !== ''
  const hasQueries = Array.isArray(detection.queries) && detection.queries.length > 0
  if (!hasQuery && !hasQueries) {
    errors.push({ code: 'DETECTION_NO_QUERY', message: 'Detection has no query to deploy' })
  }

  // 5. Query language matches provider
  const acceptedLangs = PROVIDER_QUERY_LANGUAGES[provider] || []
  if (acceptedLangs.length > 0) {
    let hasMatchingLang = false

    // Check queries array first
    if (hasQueries) {
      hasMatchingLang = detection.queries.some(
        (q: { language?: string }) => q.language && acceptedLangs.some(l => l.toUpperCase() === q.language!.toUpperCase())
      )
    }

    // Fall back to primary query language
    if (!hasMatchingLang && detection.queryLanguage) {
      hasMatchingLang = acceptedLangs.some(l => l.toUpperCase() === detection.queryLanguage.toUpperCase())
    }

    if (!hasMatchingLang && (hasQuery || hasQueries)) {
      errors.push({
        code: 'QUERY_LANGUAGE_MISMATCH',
        message: `No ${acceptedLangs.join('/')} query available for this detection (has: ${detection.queryLanguage || 'unknown'})`,
      })
    }
  }

  // 6. Integration is healthy
  const { data: integration } = await serviceClient
    .from('integrations')
    .select('status')
    .eq('id', integrationId)
    .single()

  if (integration && integration.status !== 'connected') {
    errors.push({
      code: 'INTEGRATION_NOT_CONNECTED',
      message: `Integration is not connected (status: ${integration.status})`,
    })
  }

  // Warnings (non-blocking)
  if (typeof detection.qualityScore === 'number' && detection.qualityScore < 60) {
    warnings.push({
      code: 'LOW_QUALITY_SCORE',
      message: `Low quality score (${detection.qualityScore}). Consider improving before deployment`,
    })
  }

  const hasMitre = (Array.isArray(detection.mitreTactics) && detection.mitreTactics.length > 0) ||
    (Array.isArray(detection.mitreTechniques) && detection.mitreTechniques.length > 0)
  if (!hasMitre) {
    warnings.push({
      code: 'NO_MITRE_MAPPING',
      message: 'No MITRE ATT&CK mapping. Vendor rule will lack tactic/technique metadata',
    })
  }

  if (!detection.description || detection.description.trim() === '') {
    warnings.push({
      code: 'NO_DESCRIPTION',
      message: 'No description. Vendor rule will have empty description',
    })
  }

  return { eligible: errors.length === 0, errors, warnings }
}

// =============================================================================
// Encryption Utilities
// =============================================================================

const ENCRYPTION_KEY_ENV = 'INTEGRATION_ENCRYPTION_KEY'

async function getEncryptionKey(): Promise<CryptoKey> {
  const keyHex = Deno.env.get(ENCRYPTION_KEY_ENV)
  if (!keyHex) {
    throw new Error(
      'INTEGRATION_ENCRYPTION_KEY environment variable is not set. ' +
      'Set a 64-character hex string via: supabase secrets set INTEGRATION_ENCRYPTION_KEY=<hex>'
    )
  }

  const keyBytes = new Uint8Array(keyHex.match(/.{1,2}/g)!.map(byte => parseInt(byte, 16)))
  return crypto.subtle.importKey('raw', keyBytes, 'AES-GCM', false, ['encrypt', 'decrypt'])
}

async function encryptCredentials(data: Record<string, string>): Promise<string> {
  const key = await getEncryptionKey()
  const iv = crypto.getRandomValues(new Uint8Array(12))
  const encoder = new TextEncoder()
  const encrypted = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv },
    key,
    encoder.encode(JSON.stringify(data))
  )
  // Pack iv + ciphertext as base64
  const combined = new Uint8Array(iv.length + new Uint8Array(encrypted).length)
  combined.set(iv)
  combined.set(new Uint8Array(encrypted), iv.length)
  return btoa(String.fromCharCode(...combined))
}

async function decryptCredentials(encryptedBase64: string): Promise<Record<string, string>> {
  const key = await getEncryptionKey()
  const combined = Uint8Array.from(atob(encryptedBase64), c => c.charCodeAt(0))
  const iv = combined.slice(0, 12)
  const ciphertext = combined.slice(12)
  const decrypted = await crypto.subtle.decrypt(
    { name: 'AES-GCM', iv },
    key,
    ciphertext
  )
  return JSON.parse(new TextDecoder().decode(decrypted))
}

// =============================================================================
// Retry & Fetch Utilities
// =============================================================================

async function withRetry<T>(
  fn: () => Promise<T>,
  maxAttempts = 3,
  baseDelayMs = 1000
): Promise<T> {
  let lastError: Error | undefined
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      return await fn()
    } catch (err) {
      lastError = err instanceof Error ? err : new Error(String(err))
      if (attempt < maxAttempts) {
        // Exponential backoff with jitter
        const delay = baseDelayMs * Math.pow(2, attempt - 1) + Math.random() * 500
        await new Promise(r => setTimeout(r, delay))
      }
    }
  }
  throw lastError
}

async function vendorFetch(
  url: string,
  options: RequestInit,
  timeoutMs = 30000
): Promise<Response> {
  // SSRF protection: validate the URL before making the request
  const validation = validateUrl(url)
  if (!validation.valid) {
    throw new Error(`SSRF protection: ${validation.error} (url: ${url})`)
  }

  const controller = new AbortController()
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs)
  try {
    const response = await fetch(validation.sanitizedUrl!, { ...options, signal: controller.signal })
    return response
  } finally {
    clearTimeout(timeoutId)
  }
}

// =============================================================================
// Credential Helpers (service-role access)
// =============================================================================

function getServiceClient() {
  return createClient(
    Deno.env.get('SUPABASE_URL') ?? '',
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
  )
}

function kickNativeWorker() {
  // The durable queue/cron recovers a lost hand-off; background execution is only a latency optimization.
  const runtime = (globalThis as unknown as { EdgeRuntime?: { waitUntil: (promise: Promise<unknown>) => void } }).EdgeRuntime
  if (!runtime) return
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || ''
  runtime.waitUntil(fetch(`${Deno.env.get('SUPABASE_URL')}/functions/v1/integration-ops`, {
    method: 'POST', headers: { Authorization: `Bearer ${serviceKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ action: 'native_sync_tick' }), signal: AbortSignal.timeout(30000),
  }).then(response => { if (!response.ok) console.warn('Native SIEM worker hand-off will retry via scheduler') })
    .catch(() => console.warn('Native SIEM worker hand-off will retry via scheduler')))
}

async function getDecryptedCredentials(integrationId: string): Promise<Record<string, string>> {
  const serviceClient = getServiceClient()
  const { data, error } = await serviceClient
    .from('integration_credentials')
    .select('encrypted_data')
    .eq('integration_id', integrationId)
    .order('created_at', { ascending: false })
    .limit(1)
    .single()

  if (error || !data) {
    throw new Error('Credentials not found for this integration')
  }

  return decryptCredentials(data.encrypted_data)
}

// =============================================================================
// Vendor Handlers
// =============================================================================

// -- Splunk --
async function splunkTestConnection(
  config: Record<string, unknown>,
  credentials: Record<string, string>
): Promise<ConnectionTestResult> {
  const host = config.host as string
  const port = config.port as number || 8089
  const ssl = config.ssl !== false
  const protocol = ssl ? 'https' : 'http'
  const baseUrl = `${protocol}://${host}:${port}`

  const headers: Record<string, string> = { 'Accept': 'application/json' }
  if (credentials.token) {
    headers['Authorization'] = `Bearer ${credentials.token}`
  } else if (credentials.username && credentials.password) {
    headers['Authorization'] = `Basic ${btoa(`${credentials.username}:${credentials.password}`)}`
  }

  const start = Date.now()
  const response = await withRetry(() =>
    vendorFetch(`${baseUrl}/services/server/info?output_mode=json`, { method: 'GET', headers })
  )
  const latency = Date.now() - start

  if (!response.ok) {
    const text = await response.text()
    return { success: false, message: `Splunk error ${response.status}: ${text.slice(0, 200)}`, latency_ms: latency }
  }

  const data = await response.json()
  const serverName = data?.entry?.[0]?.content?.serverName || 'Unknown'
  const version = data?.entry?.[0]?.content?.version || 'Unknown'
  return { success: true, message: `Connected to ${serverName} (Splunk ${version})`, latency_ms: latency }
}

/** Bounded page size for the checkpointed count/offset paging below -- replaces the previous
 *  `count=0` ("return everything in one call") shape per the batch-3 brief. */
const SPLUNK_PAGE_SIZE = 100

async function splunkListRules(
  config: Record<string, unknown>,
  credentials: Record<string, string>
): Promise<unknown[]> {
  const host = config.host as string
  const port = config.port as number || 8089
  const ssl = config.ssl !== false
  const protocol = ssl ? 'https' : 'http'
  const owner = (config.owner as string) || '-'
  const app = (config.app as string) || 'search'
  const baseUrl = `${protocol}://${host}:${port}/servicesNS/${owner}/${app}`

  const headers: Record<string, string> = { 'Accept': 'application/json' }
  if (credentials.token) {
    headers['Authorization'] = `Bearer ${credentials.token}`
  } else if (credentials.username && credentials.password) {
    headers['Authorization'] = `Basic ${btoa(`${credentials.username}:${credentials.password}`)}`
  }

  const outcome = await readSplunkCorrelationSearches(async (offset, count) => {
    const response = await withRetry(() =>
      vendorFetch(
        `${baseUrl}/saved/searches?output_mode=json&count=${count}&offset=${offset}` +
          `&search=action.correlationsearch.enabled%3D1`,
        { method: 'GET', headers }
      )
    )
    if (!response.ok) {
      throw new Error(`Splunk list rules failed: ${response.status}`)
    }
    const data = await response.json()
    return { entry: (data.entry ?? []) as SplunkEntry[] }
  }, 0, SPLUNK_PAGE_SIZE)

  // Identity is (owner, app, name), not name alone -- vendorRuleId carries all three since
  // provider_scope only carries the endpoint+app half of the boundary. The full acl and content
  // object are preserved rather than projected down to a handful of keys.
  return outcome.rules.map(rule => ({
    id: rule.vendorRuleId,
    name: rule.name,
    owner: rule.identity.owner,
    app: rule.identity.app,
    acl: rule.acl,
    search: rule.query,
    language: rule.language,
    cronSchedule: rule.content.cron_schedule,
    enabled: rule.observedState === 'unknown' ? null : rule.observedState === 'enabled',
    observedState: rule.observedState,
    stateSignals: rule.stateSignals,
    scopeLabel: rule.scopeLabel,
    content: rule.content,
    updated: rule.raw.updated,
  }))
}

async function splunkDeployRule(
  config: Record<string, unknown>,
  credentials: Record<string, string>,
  query: string,
  ruleConfig: Record<string, unknown>,
  action: string,
  vendorRuleId?: string
): Promise<{ vendorRuleId: string; response: Record<string, unknown> }> {
  const host = config.host as string
  const port = config.port as number || 8089
  const ssl = config.ssl !== false
  const protocol = ssl ? 'https' : 'http'
  const owner = (config.owner as string) || '-'
  const app = (config.app as string) || 'SplunkEnterpriseSecuritySuite'
  const baseUrl = `${protocol}://${host}:${port}/servicesNS/${owner}/${app}`

  const headers: Record<string, string> = {
    'Accept': 'application/json',
    'Content-Type': 'application/x-www-form-urlencoded',
  }
  if (credentials.token) {
    headers['Authorization'] = `Bearer ${credentials.token}`
  } else if (credentials.username && credentials.password) {
    headers['Authorization'] = `Basic ${btoa(`${credentials.username}:${credentials.password}`)}`
  }

  const ruleName = (ruleConfig.name as string) || `Optimus_${Date.now()}`
  const cronSchedule = (ruleConfig.cronSchedule as string) || '*/5 * * * *'
  const earliestTime = (ruleConfig.earliestTime as string) || '-5m@m'
  const latestTime = (ruleConfig.latestTime as string) || 'now'

  if (action === 'delete' && vendorRuleId) {
    const response = await withRetry(() =>
      vendorFetch(`${baseUrl}/saved/searches/${encodeURIComponent(vendorRuleId)}`, {
        method: 'DELETE', headers
      })
    )
    if (!response.ok) throw new Error(`Splunk delete failed: ${response.status}`)
    return { vendorRuleId, response: { deleted: true } }
  }

  if (action === 'enable' && vendorRuleId) {
    const response = await withRetry(() =>
      vendorFetch(`${baseUrl}/saved/searches/${encodeURIComponent(vendorRuleId)}/enable`, {
        method: 'POST', headers
      })
    )
    if (!response.ok) throw new Error(`Splunk enable failed: ${response.status}`)
    return { vendorRuleId, response: { enabled: true } }
  }

  if (action === 'disable' && vendorRuleId) {
    const response = await withRetry(() =>
      vendorFetch(`${baseUrl}/saved/searches/${encodeURIComponent(vendorRuleId)}/disable`, {
        method: 'POST', headers
      })
    )
    if (!response.ok) throw new Error(`Splunk disable failed: ${response.status}`)
    return { vendorRuleId, response: { disabled: true } }
  }

  // Create or update
  const params = new URLSearchParams({
    search: query,
    is_scheduled: '1',
    cron_schedule: cronSchedule,
    'dispatch.earliest_time': earliestTime,
    'dispatch.latest_time': latestTime,
    'action.correlationsearch.enabled': '1',
    'action.correlationsearch.label': ruleName,
    'alert.severity': String(ruleConfig.alertSeverity || '3'),
  })

  if (action === 'create') {
    params.set('name', ruleName)
  }

  // Alert actions
  const alertActionsList: string[] = []
  if (ruleConfig.alertActions) {
    alertActionsList.push(...(ruleConfig.alertActions as string[]))
  }

  // Correlation search annotations (MITRE ATT&CK)
  const annotations: Record<string, unknown> = { mitre_attack: [], cis20: [], kill_chain_phases: [] }
  if (ruleConfig.techniques && Array.isArray(ruleConfig.techniques)) {
    annotations.mitre_attack = ruleConfig.techniques
  }
  params.set('action.correlationsearch.annotations', JSON.stringify(annotations))

  // Notable event action
  const enableNotable = ruleConfig.enableNotable !== false // default on
  if (enableNotable) {
    if (!alertActionsList.includes('notable')) alertActionsList.push('notable')
    params.set('action.notable', '1')
    const securityDomain = (ruleConfig.securityDomain as string) || 'endpoint'
    params.set('action.notable.param.security_domain', securityDomain)
    const severityMap: Record<string, string> = { '5': 'critical', '4': 'high', '3': 'medium', '2': 'low', '1': 'informational' }
    params.set('action.notable.param.severity', severityMap[String(ruleConfig.alertSeverity || '3')] || 'medium')
    params.set('action.notable.param.rule_title', ruleName)
    params.set('action.notable.param.rule_description', (ruleConfig.description as string) || '')
    params.set('action.notable.param.drilldown_name', 'View triggering events')
    params.set('action.notable.param.drilldown_search', (ruleConfig.drilldownSearch as string) || query)
  }

  // Risk-Based Alerting (RBA)
  if (ruleConfig.enableRba) {
    if (!alertActionsList.includes('risk')) alertActionsList.push('risk')
    params.set('action.risk', '1')
    const riskScore = Number(ruleConfig.riskScore) || 50
    params.set('action.risk.param._risk_score', String(riskScore))
    params.set('action.risk.param._risk_message', (ruleConfig.riskMessage as string) || `${ruleName} triggered on $dest$`)
  }

  params.set('actions', alertActionsList.length > 0 ? alertActionsList.join(',') : 'notable')

  const url = action === 'update' && vendorRuleId
    ? `${baseUrl}/saved/searches/${encodeURIComponent(vendorRuleId)}`
    : `${baseUrl}/saved/searches`

  const response = await withRetry(() =>
    vendorFetch(url, { method: 'POST', headers, body: params.toString() })
  )

  if (!response.ok) {
    const text = await response.text()
    throw new Error(`Splunk ${action} failed: ${response.status} - ${text.slice(0, 300)}`)
  }

  const data = await response.json()
  const createdName = data.entry?.[0]?.name || ruleName
  return { vendorRuleId: createdName, response: data }
}

// -- Microsoft Sentinel --
async function microsoftGetToken(
  tenantId: string,
  clientId: string,
  clientSecret: string,
  scope: string
): Promise<string> {
  const tokenUrl = `https://login.microsoftonline.com/${tenantId}/oauth2/v2.0/token`
  const params = new URLSearchParams({
    grant_type: 'client_credentials',
    client_id: clientId,
    client_secret: clientSecret,
    scope,
  })

  const response = await vendorFetch(tokenUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: params.toString(),
  })

  if (!response.ok) {
    const text = await response.text()
    throw new Error(`Microsoft OAuth2 failed: ${response.status} - ${text.slice(0, 300)}`)
  }

  const data = await response.json()
  return data.access_token
}

async function sentinelTestConnection(
  config: Record<string, unknown>,
  credentials: Record<string, string>
): Promise<ConnectionTestResult> {
  const { tenantId, subscriptionId, resourceGroup, workspaceName } = config as Record<string, string>
  const start = Date.now()

  const token = await microsoftGetToken(
    tenantId,
    credentials.clientId,
    credentials.clientSecret,
    'https://management.azure.com/.default'
  )

  const baseUrl = `https://management.azure.com/subscriptions/${subscriptionId}/resourceGroups/${resourceGroup}/providers/Microsoft.OperationalInsights/workspaces/${workspaceName}/providers/Microsoft.SecurityInsights/alertRules`

  const response = await withRetry(() =>
    vendorFetch(`${baseUrl}?api-version=2025-06-01&$top=1`, {
      method: 'GET',
      headers: { 'Authorization': `Bearer ${token}`, 'Accept': 'application/json' },
    })
  )
  const latency = Date.now() - start

  if (!response.ok) {
    const text = await response.text()
    return { success: false, message: `Sentinel error ${response.status}: ${text.slice(0, 200)}`, latency_ms: latency }
  }

  return { success: true, message: `Connected to Sentinel workspace: ${workspaceName}`, latency_ms: latency }
}

async function sentinelListRules(
  config: Record<string, unknown>,
  credentials: Record<string, string>
): Promise<unknown[]> {
  const { tenantId, subscriptionId, resourceGroup, workspaceName } = config as Record<string, string>
  const token = await microsoftGetToken(tenantId, credentials.clientId, credentials.clientSecret, 'https://management.azure.com/.default')

  const baseUrl = `https://management.azure.com/subscriptions/${subscriptionId}/resourceGroups/${resourceGroup}/providers/Microsoft.OperationalInsights/workspaces/${workspaceName}/providers/Microsoft.SecurityInsights/alertRules`
  const authorizedOrigin = new URL(baseUrl).origin
  const headers = { 'Authorization': `Bearer ${token}`, 'Accept': 'application/json' }

  const outcome = await readSentinelAlertRules(async (url) => {
    // G38: nextLink is only ever followed against the authorized ARM origin -- never trusted to
    // redirect the bearer token to an attacker-controlled host.
    if (new URL(url).origin !== authorizedOrigin) {
      throw new Error('Sentinel returned a continuation URL outside the authorized workspace endpoint')
    }
    const response = await withRetry(() => vendorFetch(url, { method: 'GET', headers }))
    if (!response.ok) throw new Error(`Sentinel list rules failed: ${response.status}`)
    const data = await response.json()
    return { value: (data.value ?? []) as SentinelRuleEntry[], nextLink: data.nextLink ?? null }
  }, `${baseUrl}?api-version=2025-06-01`)

  const supported = outcome.rules.map(rule => ({
    id: rule.vendorRuleId,
    armId: rule.armId,
    name: rule.displayName,
    kind: rule.kind,
    severity: rule.severity,
    enabled: rule.enabled,
    query: rule.query,
    language: rule.language,
    queryFrequency: rule.queryFrequency,
    queryPeriod: rule.queryPeriod,
    triggerOperator: rule.triggerOperator,
    triggerThreshold: rule.triggerThreshold,
    tactics: rule.tactics,
    techniques: rule.techniques,
    entityMappings: rule.entityMappings,
    eventGroupingSettings: rule.eventGroupingSettings,
    incidentConfiguration: rule.incidentConfiguration,
    alertDetailsOverride: rule.alertDetailsOverride,
    customDetails: rule.customDetails,
    suppressionEnabled: rule.suppressionEnabled,
    suppressionDuration: rule.suppressionDuration,
    alertRuleTemplateName: rule.alertRuleTemplateName,
    templateVersion: rule.templateVersion,
    unmappedFields: rule.unmappedFields,
    // The preview always names the workspace, per the brief -- kept out of provider_scope but
    // carried on every row so the UI never has to re-derive it.
    workspace: workspaceName,
    properties: rule.properties,
  }))
  const unsupported = outcome.unsupported
    .map(rule => ({
      id: rule.vendorRuleId, armId: rule.armId, name: rule.displayName, kind: rule.kind,
      unsupported: true, unsupportedReason: rule.reason, workspace: workspaceName,
    }))
  return [...supported, ...unsupported]
}

async function sentinelDeployRule(
  config: Record<string, unknown>,
  credentials: Record<string, string>,
  query: string,
  ruleConfig: Record<string, unknown>,
  action: string,
  vendorRuleId?: string
): Promise<{ vendorRuleId: string; response: Record<string, unknown> }> {
  const { tenantId, subscriptionId, resourceGroup, workspaceName } = config as Record<string, string>
  const token = await microsoftGetToken(tenantId, credentials.clientId, credentials.clientSecret, 'https://management.azure.com/.default')

  const baseUrl = `https://management.azure.com/subscriptions/${subscriptionId}/resourceGroups/${resourceGroup}/providers/Microsoft.OperationalInsights/workspaces/${workspaceName}/providers/Microsoft.SecurityInsights/alertRules`
  const headers = { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' }

  if (action === 'delete' && vendorRuleId) {
    const response = await withRetry(() =>
      vendorFetch(`${baseUrl}/${vendorRuleId}?api-version=2025-06-01`, { method: 'DELETE', headers })
    )
    if (!response.ok) throw new Error(`Sentinel delete failed: ${response.status}`)
    return { vendorRuleId, response: { deleted: true } }
  }

  // Create or update via PUT
  const ruleId = vendorRuleId || crypto.randomUUID()

  // Convert tactic display names to API enum values (PascalCase, no spaces)
  const rawTactics = (ruleConfig.tactics as string[]) || []
  const tactics = rawTactics.map((t: string) => t.replace(/\s+/g, ''))

  // Determine rule kind: Scheduled (default) or NRT
  const ruleKind = (ruleConfig.ruleType as string) === 'NRT' ? 'NRT' : 'Scheduled'
  const isNRT = ruleKind === 'NRT'

  // Build properties — NRT rules don't use queryFrequency/queryPeriod/trigger fields
  const properties: Record<string, unknown> = {
    displayName: (ruleConfig.name as string) || `Optimus Detection ${ruleId.slice(0, 8)}`,
    description: (ruleConfig.description as string) || 'Deployed from Optimus Detection Studio',
    severity: (ruleConfig.severity as string) || 'Medium',
    enabled: (ruleConfig.enabled as boolean) ?? false,  // Default disabled for production safety
    query,
    suppressionDuration: (ruleConfig.suppressionDuration as string) || 'PT1H',
    suppressionEnabled: (ruleConfig.suppressionEnabled as boolean) ?? false,
    tactics,
    techniques: (ruleConfig.techniques as string[]) || [],
    eventGroupingSettings: {
      aggregationKind: (ruleConfig.eventGrouping as string) || 'AlertPerResult',
    },
    incidentConfiguration: {
      createIncident: (ruleConfig.createIncident as boolean) ?? true,
      groupingConfiguration: {
        enabled: (ruleConfig.groupAlerts as boolean) ?? false,  // Matches Sentinel default (disabled)
        reopenClosedIncident: false,
        lookbackDuration: 'PT5H',
        matchingMethod: 'AllEntities',
        groupByEntities: [],
        groupByAlertDetails: [],
        groupByCustomDetails: [],
      },
    },
  }

  // Scheduled-only fields
  if (!isNRT) {
    const queryFrequency = (ruleConfig.queryFrequency as string) || 'PT5M'
    const queryPeriod = (ruleConfig.queryPeriod as string) || queryFrequency
    properties.queryFrequency = queryFrequency
    properties.queryPeriod = queryPeriod
    properties.triggerOperator = (ruleConfig.triggerOperator as string) || 'GreaterThan'
    properties.triggerThreshold = (ruleConfig.triggerThreshold as number) ?? 0
  }

  const body = {
    kind: ruleKind,
    properties,
  }

  const response = await withRetry(() =>
    vendorFetch(`${baseUrl}/${ruleId}?api-version=2025-06-01`, {
      method: 'PUT', headers, body: JSON.stringify(body),
    })
  )

  if (!response.ok) {
    const text = await response.text()
    throw new Error(`Sentinel ${action} failed: ${response.status} - ${text.slice(0, 300)}`)
  }

  const data = await response.json()
  return { vendorRuleId: ruleId, response: data }
}

// -- Defender XDR (Microsoft Graph Security API) --
// Custom Detections live on the Graph Security API (beta):
//   https://graph.microsoft.com/beta/security/rules/detectionRules
// Token scope: https://graph.microsoft.com/.default
// Required app permission: CustomDetection.ReadWrite.All (Application) on Microsoft Graph.
// The legacy api.security.microsoft.com/api/customdetections surface is NOT used —
// app registrations are consented for Graph, so a token for that resource fails.
const GRAPH_DEFENDER_BASE = 'https://graph.microsoft.com/beta/security/rules/detectionRules'
const GRAPH_DEFENDER_SCOPE = 'https://graph.microsoft.com/.default'

// First MITRE tactic -> Defender XDR alert category.
const DEFENDER_TACTIC_CATEGORY: Record<string, string> = {
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
}

/** Build the Graph detectionRules request body, shared by create and update. */
function defenderXdrRuleBody(query: string, ruleConfig: Record<string, unknown>): string {
  const displayName = (ruleConfig.name as string) || 'Optimus Detection'
  const description = (ruleConfig.description as string) || 'Deployed from Optimus Detection Studio'
  const severity = ((ruleConfig.severity as string) || 'medium').toLowerCase()
  const period = ((ruleConfig.frequency as string) || '24H').toUpperCase()
  const tactics = (ruleConfig.tactics as string[]) || []
  const category = (ruleConfig.category as string) ||
    (tactics.length > 0
      ? DEFENDER_TACTIC_CATEGORY[tactics[0].toLowerCase()] || 'SuspiciousActivity'
      : 'SuspiciousActivity')
  const techniques = (ruleConfig.techniques as string[]) || []

  return JSON.stringify({
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
          { '@odata.type': '#microsoft.graph.security.impactedDeviceAsset', identifier: 'deviceId' },
        ],
        recommendedActions: null,
      },
      organizationalScope: null,
      responseActions: [],
    },
  })
}

async function defenderXdrTestConnection(
  config: Record<string, unknown>,
  credentials: Record<string, string>
): Promise<ConnectionTestResult> {
  const tenantId = config.tenantId as string
  const start = Date.now()

  let token: string
  try {
    token = await microsoftGetToken(
      tenantId,
      credentials.clientId,
      credentials.clientSecret,
      GRAPH_DEFENDER_SCOPE
    )
  } catch (err) {
    return {
      success: false,
      message: err instanceof Error ? err.message : 'Microsoft authentication failed',
      latency_ms: Date.now() - start,
    }
  }

  const response = await withRetry(() =>
    vendorFetch(`${GRAPH_DEFENDER_BASE}?$top=1`, {
      method: 'GET',
      headers: { 'Authorization': `Bearer ${token}`, 'Accept': 'application/json' },
    })
  )
  const latency = Date.now() - start

  if (!response.ok) {
    const text = await response.text()
    return { success: false, message: `Defender XDR error ${response.status}: ${text.slice(0, 200)}`, latency_ms: latency }
  }

  return { success: true, message: 'Connected to Microsoft Defender XDR via Graph API', latency_ms: latency }
}

async function defenderXdrListRules(
  config: Record<string, unknown>,
  credentials: Record<string, string>
): Promise<unknown[]> {
  if (!DEFENDER_XDR_PREVIEW) {
    throw new Error('Defender XDR import is a Preview capability: the Graph API it reads is beta-only with no v1.0 equivalent')
  }
  const tenantId = config.tenantId as string
  const token = await microsoftGetToken(tenantId, credentials.clientId, credentials.clientSecret, GRAPH_DEFENDER_SCOPE)
  const authorizedOrigin = new URL(GRAPH_DEFENDER_BASE).origin
  const headers = { 'Authorization': `Bearer ${token}`, 'Accept': 'application/json' }

  // `isEnabled` and `schedule.period` are deprecated by Microsoft, removed 2026-10-01 (Graph beta
  // security-detectionrule / security-ruleschedule docs, dated 2026-05-25), replaced by `status`
  // and `schedule.frequency`. The reader (siem-readers/defender-xdr.ts) does the dual read/fallback
  // itself for the durable importer's own normalized shape; this is a read path only -- nothing
  // here executes a response/automated action.
  const outcome = await readDefenderXdrRules(async (url) => {
    // G38: nextLink is only ever followed against the authorized Graph origin -- never trusted to
    // redirect the bearer token to an attacker-controlled host.
    if (new URL(url).origin !== authorizedOrigin) {
      throw new Error('Defender XDR returned a continuation URL outside the authorized Graph endpoint')
    }
    const response = await withRetry(() => vendorFetch(url, { method: 'GET', headers }))
    if (!response.ok) throw new Error(`Defender XDR list rules failed: ${response.status}`)
    const data = await response.json()
    return { value: (data.value ?? []) as DefenderRuleEntry[], '@odata.nextLink': data['@odata.nextLink'] ?? null }
  }, `${GRAPH_DEFENDER_BASE}?$top=50`)

  const supported = outcome.rules.map(rule => ({
    id: rule.vendorRuleId,
    name: rule.displayName,
    query: rule.query,
    status: rule.status,
    observedState: rule.observedState,
    statusSource: rule.statusSource,
    autoDisabled: rule.autoDisabled,
    frequency: rule.frequency,
    continuous: rule.continuous,
    scheduleSource: rule.scheduleSource,
    description: rule.description,
    alertTemplate: rule.alertTemplate,
    mitreTechniques: rule.mitreTechniques,
    automatedActions: rule.automatedActions,
    responseActions: rule.responseActions,
    detectorId: rule.detectorId,
    lastRunDetails: rule.lastRunDetails,
    unmappedFields: rule.unmappedFields,
  }))
  const unsupported = outcome.unsupported.map(entry => ({
    id: entry.raw.id, name: entry.raw.displayName, unsupported: true, unsupportedReason: entry.error,
  }))
  return [...supported, ...unsupported]
}

async function defenderXdrDeployRule(
  config: Record<string, unknown>,
  credentials: Record<string, string>,
  query: string,
  ruleConfig: Record<string, unknown>,
  action: string,
  vendorRuleId?: string
): Promise<{ vendorRuleId: string; response: Record<string, unknown> }> {
  const tenantId = config.tenantId as string
  const token = await microsoftGetToken(tenantId, credentials.clientId, credentials.clientSecret, GRAPH_DEFENDER_SCOPE)

  const headers = {
    'Authorization': `Bearer ${token}`,
    'Content-Type': 'application/json',
    'Accept': 'application/json',
  }

  if (action === 'delete' && vendorRuleId) {
    const response = await withRetry(() =>
      vendorFetch(`${GRAPH_DEFENDER_BASE}/${vendorRuleId}`, { method: 'DELETE', headers })
    )
    if (!response.ok) {
      const text = await response.text()
      throw new Error(`Defender XDR delete failed: ${response.status} - ${text.slice(0, 300)}`)
    }
    return { vendorRuleId, response: { deleted: true } }
  }

  const body = defenderXdrRuleBody(query, ruleConfig)

  // Update an existing rule. A 404 means it was deleted in the portal — fall through to create.
  if (vendorRuleId) {
    const updateRes = await withRetry(() =>
      vendorFetch(`${GRAPH_DEFENDER_BASE}/${vendorRuleId}`, { method: 'PATCH', headers, body })
    )
    if (updateRes.status !== 404) {
      if (!updateRes.ok) {
        const text = await updateRes.text()
        throw new Error(`Defender XDR update failed: ${updateRes.status} - ${text.slice(0, 300)}`)
      }
      const data = await updateRes.json()
      return { vendorRuleId: data.id || vendorRuleId, response: data }
    }
  }

  // Create
  const response = await withRetry(() =>
    vendorFetch(GRAPH_DEFENDER_BASE, { method: 'POST', headers, body })
  )
  if (!response.ok) {
    const text = await response.text()
    throw new Error(`Defender XDR create failed: ${response.status} - ${text.slice(0, 300)}`)
  }
  const data = await response.json()
  return { vendorRuleId: data.id, response: data }
}

// -- Elastic Security --
async function elasticGetAuth(
  config: Record<string, unknown>,
  credentials: Record<string, string>
): Promise<{ baseUrl: string; headers: Record<string, string> }> {
  let baseUrl: string
  if (config.cloudId) {
    // Decode cloud ID: base64(host:port)
    const decoded = atob(String(config.cloudId).split(':')[1] || '')
    const [esHost] = decoded.split('$')
    baseUrl = `https://${esHost}`
  } else {
    const host = config.host as string
    const port = config.port as number || 9200
    const ssl = config.ssl !== false
    const protocol = ssl ? 'https' : 'http'
    baseUrl = `${protocol}://${host}:${port}`
  }

  if (config.spaceId) {
    baseUrl += `/s/${config.spaceId}`
  }

  const headers: Record<string, string> = {
    'Accept': 'application/json',
    'Content-Type': 'application/json',
    'kbn-xsrf': 'true',
  }

  if (credentials.apiKey) {
    // API key format: base64(id:api_key)
    headers['Authorization'] = `ApiKey ${credentials.apiKey}`
  } else if (credentials.username && credentials.password) {
    headers['Authorization'] = `Basic ${btoa(`${credentials.username}:${credentials.password}`)}`
  }

  return { baseUrl, headers }
}

async function elasticTestConnection(
  config: Record<string, unknown>,
  credentials: Record<string, string>
): Promise<ConnectionTestResult> {
  const { baseUrl, headers } = await elasticGetAuth(config, credentials)
  const start = Date.now()

  const response = await withRetry(() =>
    vendorFetch(`${baseUrl}/api/detection_engine/rules/_find?per_page=1`, { method: 'GET', headers })
  )
  const latency = Date.now() - start

  if (!response.ok) {
    const text = await response.text()
    return { success: false, message: `Elastic error ${response.status}: ${text.slice(0, 200)}`, latency_ms: latency }
  }

  const data = await response.json()
  const total = data.total ?? 0
  return { success: true, message: `Connected to Elastic Security (${total} existing rules)`, latency_ms: latency }
}

/** Bounded page size for the checkpointed page/per_page paging below -- replaces the previous
 *  in-invocation `while (true)` loop that compared accumulated length against `data.total` alone
 *  (unsafe: `total` can move during a scan). */
const ELASTIC_PAGE_SIZE = 50

async function elasticListRules(
  config: Record<string, unknown>,
  credentials: Record<string, string>
): Promise<unknown[]> {
  const { baseUrl, headers } = await elasticGetAuth(config, credentials)

  const outcome = await readElasticRules(async (page, perPage) => {
    const response = await withRetry(() =>
      vendorFetch(`${baseUrl}/api/detection_engine/rules/_find?per_page=${perPage}&page=${page}`, { method: 'GET', headers })
    )
    if (!response.ok) throw new Error(`Elastic list rules failed: ${response.status}`)
    const data = await response.json()
    return { page: data.page, perPage: data.perPage, total: data.total, data: (data.data ?? []) as ElasticRuleEntry[] }
  }, 1, ELASTIC_PAGE_SIZE)

  // rule_id is the canonical identity (id is only the current-instance saved-object locator, see
  // siem-readers/elastic.ts header). Space is already carried on provider_scope, so the same
  // rule_id installed in two spaces produces two independent rows, not a collision.
  const supported = outcome.rules.map(rule => ({
    id: rule.vendorRuleId,
    objectId: rule.objectId,
    name: rule.name,
    type: rule.type,
    language: rule.language,
    query: rule.query,
    index: rule.index,
    filters: rule.filters,
    threshold: rule.threshold,
    severity: rule.severity,
    riskScore: rule.riskScore,
    interval: rule.interval,
    from: rule.from,
    enabled: rule.enabled === 'unknown' ? null : rule.enabled,
    observedState: rule.enabled,
    revision: rule.revision,
    version: rule.version,
    exceptionsList: rule.exceptionsList,
    actions: rule.actions,
    alertSuppression: rule.alertSuppression,
    immutable: rule.immutable,
    unmappedFields: rule.unmappedFields,
  }))
  const unsupported = outcome.unsupported.map(rule => ({
    id: rule.vendorRuleId, objectId: rule.objectId, name: rule.name, type: rule.type,
    unsupported: true, unsupportedReason: rule.reason,
  }))
  return [...supported, ...unsupported]
}

async function elasticDeployRule(
  config: Record<string, unknown>,
  credentials: Record<string, string>,
  query: string,
  ruleConfig: Record<string, unknown>,
  action: string,
  vendorRuleId?: string
): Promise<{ vendorRuleId: string; response: Record<string, unknown> }> {
  const { baseUrl, headers } = await elasticGetAuth(config, credentials)

  if (action === 'delete' && vendorRuleId) {
    const response = await withRetry(() =>
      vendorFetch(`${baseUrl}/api/detection_engine/rules?id=${vendorRuleId}`, { method: 'DELETE', headers })
    )
    if (!response.ok) throw new Error(`Elastic delete failed: ${response.status}`)
    return { vendorRuleId, response: { deleted: true } }
  }

  const ruleType = (ruleConfig.type as string) || 'query'
  const language = (ruleConfig.language as string) || 'lucene'

  const body: Record<string, unknown> = {
    name: (ruleConfig.name as string) || `Optimus Detection`,
    description: (ruleConfig.description as string) || 'Deployed from Optimus Detection Studio',
    type: ruleType,
    query,
    language,
    severity: (ruleConfig.severity as string) || 'medium',
    risk_score: (ruleConfig.riskScore as number) ?? 50,
    index: (ruleConfig.index as string[]) || ['logs-*', 'filebeat-*', 'winlogbeat-*'],
    interval: (ruleConfig.interval as string) || '5m',
    from: (ruleConfig.from as string) || 'now-6m',
    max_signals: (ruleConfig.maxSignals as number) || 100,
    enabled: true,
    tags: (ruleConfig.tags as string[]) || ['Optimus'],
  }

  if (action === 'update' && vendorRuleId) {
    body.id = vendorRuleId
    const response = await withRetry(() =>
      vendorFetch(`${baseUrl}/api/detection_engine/rules`, {
        method: 'PATCH', headers, body: JSON.stringify(body),
      })
    )
    if (!response.ok) {
      const text = await response.text()
      throw new Error(`Elastic update failed: ${response.status} - ${text.slice(0, 300)}`)
    }
    const data = await response.json()
    return { vendorRuleId: data.id || vendorRuleId, response: data }
  }

  // Create
  const response = await withRetry(() =>
    vendorFetch(`${baseUrl}/api/detection_engine/rules`, {
      method: 'POST', headers, body: JSON.stringify(body),
    })
  )
  if (!response.ok) {
    const text = await response.text()
    throw new Error(`Elastic create failed: ${response.status} - ${text.slice(0, 300)}`)
  }
  const data = await response.json()
  return { vendorRuleId: data.id, response: data }
}

// -- CrowdStrike Falcon NGSIEM --
async function crowdStrikeGetToken(
  baseUrl: string,
  clientId: string,
  clientSecret: string
): Promise<string> {
  const tokenUrl = `${baseUrl}/oauth2/token`
  const params = new URLSearchParams({
    client_id: clientId,
    client_secret: clientSecret,
    grant_type: 'client_credentials',
  })

  const response = await vendorFetch(tokenUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: params.toString(),
  })

  if (!response.ok) {
    const text = await response.text()
    throw new Error(`CrowdStrike OAuth2 failed: ${response.status} - ${text.slice(0, 300)}`)
  }

  const data = await response.json()
  return data.access_token
}

async function crowdStrikeTestConnection(
  config: Record<string, unknown>,
  credentials: Record<string, string>
): Promise<ConnectionTestResult> {
  const baseUrl = config.baseUrl as string
  const start = Date.now()

  const token = await crowdStrikeGetToken(baseUrl, credentials.clientId, credentials.clientSecret)

  const response = await withRetry(() =>
    vendorFetch(`${baseUrl}/correlation-rules/queries/rules/v1?limit=1`, {
      method: 'GET',
      headers: { 'Authorization': `Bearer ${token}`, 'Accept': 'application/json' },
    })
  )
  const latency = Date.now() - start

  if (!response.ok) {
    const text = await response.text()
    return { success: false, message: `CrowdStrike error ${response.status}: ${text.slice(0, 200)}`, latency_ms: latency }
  }

  const data = await response.json()
  const total = data.meta?.pagination?.total ?? 'unknown'
  return { success: true, message: `Connected to CrowdStrike Falcon NGSIEM (${total} rules)`, latency_ms: latency }
}

async function crowdStrikeListRules(
  config: Record<string, unknown>,
  credentials: Record<string, string>
): Promise<unknown[]> {
  const baseUrl = config.baseUrl as string
  const token = await crowdStrikeGetToken(baseUrl, credentials.clientId, credentials.clientSecret)
  const headers = { 'Authorization': `Bearer ${token}`, 'Accept': 'application/json' }
  const queriesPath = '/correlation-rules/queries/rules/v1'
  const entitiesPath = '/correlation-rules/entities/rules/v1'

  // Step 1: Paginate through queries endpoint to get all rule IDs
  const allIds: string[] = []
  let offset = 0
  const pageSize = 500

  while (true) {
    const queryRes = await withRetry(() =>
      vendorFetch(`${baseUrl}${queriesPath}?limit=${pageSize}&offset=${offset}`, { method: 'GET', headers })
    )
    if (!queryRes.ok) throw new Error(`CrowdStrike query rules failed: ${queryRes.status}`)
    const queryData = await queryRes.json()
    const ids: string[] = queryData.resources || []

    if (ids.length === 0) break
    allIds.push(...ids)

    const total = queryData.meta?.pagination?.total ?? 0
    offset += ids.length
    if (offset >= total || ids.length < pageSize) break
  }

  if (allIds.length === 0) return []

  // Step 2: Fetch full details in batches of 100 IDs
  const allRules: unknown[] = []
  const batchSize = 100

  for (let i = 0; i < allIds.length; i += batchSize) {
    const batchIds = allIds.slice(i, i + batchSize)
    const idsParam = batchIds.map((id: string) => `ids=${encodeURIComponent(id)}`).join('&')
    const entRes = await withRetry(() =>
      vendorFetch(`${baseUrl}${entitiesPath}?${idsParam}`, { method: 'GET', headers })
    )
    if (!entRes.ok) throw new Error(`CrowdStrike get rules failed: ${entRes.status}`)
    const entData = await entRes.json()
    const rules = (entData.resources || []).map((r: any) => ({
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
    }))
    allRules.push(...rules)
  }

  return allRules
}

async function crowdStrikeDeployRule(
  config: Record<string, unknown>,
  credentials: Record<string, string>,
  query: string,
  ruleConfig: Record<string, unknown>,
  action: string,
  vendorRuleId?: string
): Promise<{ vendorRuleId: string; response: Record<string, unknown> }> {
  const baseUrl = config.baseUrl as string
  // Normalize CID: strip -XX checksum suffix, lowercase, 32-char hex only
  const customerId = (config.customerId as string || '').replace(/-[0-9a-fA-F]{2}$/, '').toLowerCase()
  const token = await crowdStrikeGetToken(baseUrl, credentials.clientId, credentials.clientSecret)

  const headers = {
    'Authorization': `Bearer ${token}`,
    'Content-Type': 'application/json',
    'Accept': 'application/json',
  }

  const rulesPath = '/correlation-rules/entities/rules/v1'

  if (action === 'delete' && vendorRuleId) {
    const response = await withRetry(() =>
      vendorFetch(`${baseUrl}${rulesPath}?ids=${encodeURIComponent(vendorRuleId)}`, { method: 'DELETE', headers })
    )
    if (!response.ok) throw new Error(`CrowdStrike delete failed: ${response.status}`)
    return { vendorRuleId, response: { deleted: true } }
  }

  // Note: trigger_mode appears in API responses but is NOT an accepted input parameter
  const ruleName = (ruleConfig.name as string) || 'Optimus Detection'
  const description = (ruleConfig.description as string) || 'Deployed from Optimus Detection Studio'
  // Severity must be integer (10/30/50/70/90). Convert from string if needed.
  const rawSeverity = ruleConfig.severity
  const severity = typeof rawSeverity === 'number' ? rawSeverity : ((): number => {
    const s = String(rawSeverity || '').toLowerCase()
    if (s === 'critical') return 90
    if (s === 'high') return 70
    if (s === 'medium') return 50
    if (s === 'low') return 30
    if (s === 'informational') return 10
    return 50
  })()
  const outcome = (ruleConfig.outcome as string) || 'detection'
  const lookback = (ruleConfig.lookback as string) || '1h0m'
  const schedule = (ruleConfig.schedule as string) || '@every 1h0m'
  const status = (ruleConfig.status as string) || 'inactive'

  // API expects MITRE IDs like "TA0004" / "T1098", not human-readable names.
  // API requires: if technique is specified, tactic MUST also be specified.
  const tactics = (ruleConfig.tactics as string[]) || []
  const techniques = (ruleConfig.techniques as string[]) || []
  const rawTactic = tactics.length > 0 && /^TA\d+/i.test(tactics[0]) ? tactics[0] : undefined
  const rawTechnique = techniques.length > 0 && /^T\d+/i.test(techniques[0]) ? techniques[0] : undefined
  const tactic = rawTactic
  const technique = rawTactic && rawTechnique ? rawTechnique : undefined

  // API requires strictly >15 min in the future
  const startOn = new Date(Date.now() + 20 * 60 * 1000).toISOString()

  if (action === 'update' && vendorRuleId) {
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
    }]

    const response = await withRetry(() =>
      vendorFetch(`${baseUrl}${rulesPath}`, { method: 'PATCH', headers, body: JSON.stringify(updateBody) })
    )
    if (!response.ok) {
      const text = await response.text()
      throw new Error(`CrowdStrike update failed: ${response.status} - ${text.slice(0, 300)}`)
    }
    const data = await response.json()
    return { vendorRuleId: data.resources?.[0]?.id || vendorRuleId, response: data }
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
  }

  const response = await withRetry(() =>
    vendorFetch(`${baseUrl}${rulesPath}`, { method: 'POST', headers, body: JSON.stringify(createBody) })
  )
  if (!response.ok) {
    const text = await response.text()
    throw new Error(`CrowdStrike create failed: ${response.status} - ${text.slice(0, 300)}`)
  }
  const data = await response.json()
  return { vendorRuleId: data.resources?.[0]?.id || data.id, response: data }
}

// -- Chronicle (Google SecOps) --

const CHRONICLE_TOKEN_URL = 'https://oauth2.googleapis.com/token'
const CHRONICLE_SCOPE = 'https://www.googleapis.com/auth/chronicle-backstory'

function chronicleBaseUrl(region: string, customerId: string): string {
  return `https://${region}-chronicle.googleapis.com/v2/${customerId}/rules`
}

/** Import a PEM-encoded RSA private key for JWT signing. */
async function importRsaPrivateKeyEdge(pem: string): Promise<CryptoKey> {
  const pemContents = pem
    .replace(/-----BEGIN (RSA )?PRIVATE KEY-----/g, '')
    .replace(/-----END (RSA )?PRIVATE KEY-----/g, '')
    .replace(/\s/g, '')
  const binaryDer = Uint8Array.from(atob(pemContents), (c: string) => c.charCodeAt(0))

  return crypto.subtle.importKey(
    'pkcs8',
    binaryDer,
    { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' },
    false,
    ['sign']
  )
}

/** Base64url encode (no padding). */
function base64urlEdge(data: Uint8Array | string): string {
  const str = typeof data === 'string' ? data : btoa(String.fromCharCode(...data))
  return str.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '')
}

/** Build and sign a Google service account JWT, exchange for an access token. */
async function chronicleGetToken(
  clientEmail: string,
  privateKey: string
): Promise<string> {
  const now = Math.floor(Date.now() / 1000)
  const header = base64urlEdge(btoa(JSON.stringify({ alg: 'RS256', typ: 'JWT' })))
  const payload = base64urlEdge(btoa(JSON.stringify({
    iss: clientEmail,
    scope: CHRONICLE_SCOPE,
    aud: CHRONICLE_TOKEN_URL,
    iat: now,
    exp: now + 3600,
  })))

  const signingInput = `${header}.${payload}`
  const key = await importRsaPrivateKeyEdge(privateKey)
  const signature = await crypto.subtle.sign(
    'RSASSA-PKCS1-v1_5',
    key,
    new TextEncoder().encode(signingInput)
  )
  const signedJwt = `${signingInput}.${base64urlEdge(new Uint8Array(signature))}`

  const params = new URLSearchParams({
    grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
    assertion: signedJwt,
  })

  const response = await vendorFetch(CHRONICLE_TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: params.toString(),
  })

  if (!response.ok) {
    const text = await response.text()
    throw new Error(`Chronicle OAuth2 failed: ${response.status} - ${text.slice(0, 300)}`)
  }

  const data = await response.json()
  return data.access_token
}

async function chronicleTestConnection(
  config: Record<string, unknown>,
  credentials: Record<string, string>
): Promise<ConnectionTestResult> {
  const region = config.region as string || 'us'
  const customerId = config.customerId as string
  const start = Date.now()

  const token = await chronicleGetToken(credentials.clientEmail, credentials.privateKey)

  const baseUrl = chronicleBaseUrl(region, customerId)
  const response = await withRetry(() =>
    vendorFetch(`${baseUrl}?pageSize=1`, {
      method: 'GET',
      headers: { 'Authorization': `Bearer ${token}`, 'Accept': 'application/json' },
    })
  )
  const latency = Date.now() - start

  if (!response.ok) {
    const text = await response.text()
    return { success: false, message: `Chronicle error ${response.status}: ${text.slice(0, 200)}`, latency_ms: latency }
  }

  return { success: true, message: `Connected to Google SecOps (Chronicle) - ${region}`, latency_ms: latency }
}

async function chronicleListRules(
  config: Record<string, unknown>,
  credentials: Record<string, string>
): Promise<unknown[]> {
  const region = config.region as string || 'us'
  const customerId = config.customerId as string
  const token = await chronicleGetToken(credentials.clientEmail, credentials.privateKey)
  const baseUrl = chronicleBaseUrl(region, customerId)
  const headers = { 'Authorization': `Bearer ${token}`, 'Accept': 'application/json' }

  const outcome = await readChronicleRules(async (pageToken) => {
    const url = pageToken
      ? `${baseUrl}?pageSize=100&pageToken=${encodeURIComponent(pageToken)}`
      : `${baseUrl}?pageSize=100`
    const response = await withRetry(() => vendorFetch(url, { method: 'GET', headers }))
    if (!response.ok) throw new Error(`Chronicle list rules failed: ${response.status}`)
    const data = await response.json()
    return { rules: (data.rules ?? []) as ChronicleRuleEntry[], nextPageToken: data.nextPageToken ?? null }
  }, null)

  // Execution/alerting/archived are separate observations -- liveExecution/alerting/archived are
  // each 'true'/'false'/'unknown', never a single `enabled` boolean defaulted from absence.
  const supported = outcome.rules.map(rule => ({
    id: rule.vendorRuleId,
    resourceName: rule.resourceName,
    name: rule.name,
    query: rule.query,
    language: rule.language,
    liveExecution: rule.liveExecution,
    alerting: rule.alerting,
    archived: rule.archived,
    severity: rule.severity,
    description: rule.description,
    revisionId: rule.revisionId,
    lastModified: rule.revisionCreateTime,
    compilationState: rule.compilationState,
    compilationError: rule.compilationError,
    unmappedFields: rule.unmappedFields,
  }))
  const unsupported = outcome.unsupported.map(entry => ({
    id: entry.raw.name?.split('/').pop() ?? entry.raw.ruleId,
    name: entry.raw.ruleName, unsupported: true, unsupportedReason: entry.error,
  }))
  return [...supported, ...unsupported]
}

function chronicleSeverityFromString(severity?: string): string {
  switch (severity?.toLowerCase()) {
    case 'critical': return 'CRITICAL'
    case 'high': return 'HIGH'
    case 'medium': return 'MEDIUM'
    case 'low': return 'LOW'
    case 'informational': return 'INFORMATIONAL'
    default: return 'MEDIUM'
  }
}

async function chronicleDeployRule(
  config: Record<string, unknown>,
  credentials: Record<string, string>,
  query: string,
  ruleConfig: Record<string, unknown>,
  action: string,
  vendorRuleId?: string
): Promise<{ vendorRuleId: string; response: Record<string, unknown> }> {
  const region = config.region as string || 'us'
  const customerId = config.customerId as string
  const token = await chronicleGetToken(credentials.clientEmail, credentials.privateKey)
  const baseUrl = chronicleBaseUrl(region, customerId)
  const headers = {
    'Authorization': `Bearer ${token}`,
    'Content-Type': 'application/json',
    'Accept': 'application/json',
  }

  const severity = chronicleSeverityFromString(ruleConfig.severity as string)
  const description = (ruleConfig.description as string) || 'Deployed from Optimus Detection Studio'

  if (action === 'delete' && vendorRuleId) {
    const response = await withRetry(() =>
      vendorFetch(`${baseUrl}/${vendorRuleId}`, { method: 'DELETE', headers })
    )
    if (!response.ok) throw new Error(`Chronicle delete failed: ${response.status}`)
    return { vendorRuleId, response: { deleted: true } }
  }

  const body = JSON.stringify({
    ruleText: query,
    metadata: {
      severity,
      description,
      author: 'Optimus Detection Studio',
    },
  })

  if (action === 'update' && vendorRuleId) {
    const response = await withRetry(() =>
      vendorFetch(`${baseUrl}/${vendorRuleId}`, { method: 'PATCH', headers, body })
    )
    if (!response.ok) {
      const text = await response.text()
      throw new Error(`Chronicle update failed: ${response.status} - ${text.slice(0, 300)}`)
    }
    const data = await response.json()
    return { vendorRuleId: data.name?.split('/').pop() || vendorRuleId, response: data }
  }

  // Create
  const response = await withRetry(() =>
    vendorFetch(baseUrl, { method: 'POST', headers, body })
  )
  if (!response.ok) {
    const text = await response.text()
    throw new Error(`Chronicle create failed: ${response.status} - ${text.slice(0, 300)}`)
  }
  const data = await response.json()
  return { vendorRuleId: data.name?.split('/').pop() || data.ruleId, response: data }
}

// =============================================================================
// Action Handlers
// =============================================================================

async function handleSaveCredentials(
  body: IntegrationRequest,
  userId: string,
  corsHeaders: Record<string, string>
): Promise<Response> {
  const serviceClient = getServiceClient()

  // Create or update integration record (via service role to bypass RLS for atomic operation)
  let integrationId = body.integrationId

  if (!integrationId) {
    // Create new integration
    if (!body.provider || !body.name || !body.category || !body.authType) {
      return new Response(
        JSON.stringify({ error: 'provider, name, category, and authType are required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // Allowlist config fields to prevent mass assignment.
    // MUST stay in sync with the isConfig keys in integrationFormConfig.ts PROVIDER_FIELDS.
    const ALLOWED_CONFIG_KEYS = [
      'host', 'port', 'ssl', 'app', 'owner',
      'tenantId', 'subscriptionId', 'resourceGroup', 'workspaceName',
      'cloudId', 'spaceId', 'baseUrl', 'customerId', 'region', 'instanceId',
      'repo', 'branch', 'projectId', 'projectKey', 'channel',
    ]
    const rawConfig = body.config || {}
    const sanitizedConfig: Record<string, unknown> = {}
    for (const key of ALLOWED_CONFIG_KEYS) {
      if (key in rawConfig) sanitizedConfig[key] = rawConfig[key]
    }

    const { data: integration, error: intError } = await serviceClient
      .from('integrations')
      .insert({
        user_id: userId,
        provider: body.provider,
        name: body.name,
        category: body.category,
        config: sanitizedConfig,
        auth_type: body.authType,
        status: 'configured',
      })
      .select()
      .single()

    if (intError) {
      return new Response(
        JSON.stringify({ error: 'Failed to create integration' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    integrationId = integration.id
  } else {
    // OWNERSHIP CHECK: an existing integrationId must belong to the caller
    // before any of its config or credentials are touched. Without this, a user
    // with integrations:configure could pass another user's integrationId and
    // overwrite their stored credentials.
    const { data: owned } = await serviceClient
      .from('integrations')
      .select('id')
      .eq('id', integrationId)
      .eq('user_id', userId)
      .maybeSingle()
    if (!owned) {
      return new Response(
        JSON.stringify({ error: 'Forbidden: integration not found or not owned by you' }),
        { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }
    // Update existing integration config
    if (body.config || body.name) {
      const updates: Record<string, unknown> = {}
      if (body.config) {
        // Allowlist config fields to prevent mass assignment (same as create path).
        // MUST stay in sync with the isConfig keys in integrationFormConfig.ts PROVIDER_FIELDS.
        const ALLOWED_CONFIG_KEYS = [
          'host', 'port', 'ssl', 'app', 'owner',
          'tenantId', 'subscriptionId', 'resourceGroup', 'workspaceName',
          'cloudId', 'spaceId', 'baseUrl', 'customerId', 'region', 'instanceId',
          'repo', 'branch', 'projectId', 'projectKey', 'channel',
        ]
        const rawConfig = body.config as Record<string, unknown>
        const sanitizedConfig: Record<string, unknown> = {}
        for (const key of ALLOWED_CONFIG_KEYS) {
          if (key in rawConfig) sanitizedConfig[key] = rawConfig[key]
        }
        updates.config = sanitizedConfig
      }
      if (body.name) updates.name = body.name

      const { error: updateError } = await serviceClient
        .from('integrations')
        .update(updates)
        .eq('id', integrationId)
        .eq('user_id', userId)

      if (updateError) {
        return new Response(
          JSON.stringify({ error: 'Failed to update integration' }),
          { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        )
      }
    }
  }

  // Save encrypted credentials
  if (body.credentials) {
    const encrypted = await encryptCredentials(body.credentials)

    // Delete old credentials for this integration
    await serviceClient
      .from('integration_credentials')
      .delete()
      .eq('integration_id', integrationId)

    const { error: credError } = await serviceClient
      .from('integration_credentials')
      .insert({
        integration_id: integrationId,
        encrypted_data: encrypted,
        credential_type: body.authType || 'token',
      })

    if (credError) {
      return new Response(
        JSON.stringify({ error: 'Failed to save credentials' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }
  }

  // Return the integration
  const { data: result } = await serviceClient
    .from('integrations')
    .select('*')
    .eq('id', integrationId)
    .single()

  return new Response(
    JSON.stringify({ integration: result }),
    { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
  )
}

async function handleTestConnection(
  body: IntegrationRequest,
  userId: string,
  corsHeaders: Record<string, string>
): Promise<Response> {
  if (!body.integrationId) {
    return new Response(
      JSON.stringify({ error: 'integrationId is required' }),
      { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }

  const serviceClient = getServiceClient()

  // Get integration
  const { data: integration, error } = await serviceClient
    .from('integrations')
    .select('*')
    .eq('id', body.integrationId)
    .eq('user_id', userId)
    .single()

  if (error || !integration) {
    return new Response(
      JSON.stringify({ error: 'Integration not found' }),
      { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }

  // Update status to testing
  await serviceClient
    .from('integrations')
    .update({ status: 'testing' })
    .eq('id', body.integrationId)

  // Get credentials
  let credentials: Record<string, string>
  try {
    credentials = await getDecryptedCredentials(body.integrationId)
  } catch {
    const result: ConnectionTestResult = { success: false, message: 'No credentials found', latency_ms: 0 }
    await serviceClient
      .from('integrations')
      .update({ status: 'error', last_tested_at: new Date().toISOString(), last_test_result: result })
      .eq('id', body.integrationId)

    return new Response(
      JSON.stringify(result),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }

  // Route to vendor-specific test
  let result: ConnectionTestResult
  try {
    switch (integration.provider) {
      case 'splunk':
        result = await splunkTestConnection(integration.config, credentials)
        break
      case 'sentinel':
        result = await sentinelTestConnection(integration.config, credentials)
        break
      case 'defender_xdr':
        result = await defenderXdrTestConnection(integration.config, credentials)
        break
      case 'elastic':
        result = await elasticTestConnection(integration.config, credentials)
        break
      case 'crowdstrike':
        result = await crowdStrikeTestConnection(integration.config, credentials)
        break
      case 'chronicle':
        result = await chronicleTestConnection(integration.config, credentials)
        break
      default:
        result = { success: true, message: `${integration.provider} connection test not yet implemented`, latency_ms: 0 }
    }
  } catch (err) {
    console.error('Connection test error:', err instanceof Error ? err.message : err)
    result = { success: false, message: 'Connection test failed', latency_ms: 0 }
  }

  // Update integration status
  await serviceClient
    .from('integrations')
    .update({
      status: result.success ? 'connected' : 'error',
      last_tested_at: new Date().toISOString(),
      last_test_result: result,
    })
    .eq('id', body.integrationId)

  return new Response(
    JSON.stringify(result),
    { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
  )
}

async function handleDeployRule(
  body: IntegrationRequest,
  userId: string,
  corsHeaders: Record<string, string>
): Promise<Response> {
  if (!body.integrationId || !body.detectionId || !body.query) {
    return new Response(
      JSON.stringify({ error: 'integrationId, detectionId, and query are required' }),
      { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }

  const serviceClient = getServiceClient()

  // Get integration
  const { data: integration, error } = await serviceClient
    .from('integrations')
    .select('*')
    .eq('id', body.integrationId)
    .eq('user_id', userId)
    .single()

  if (error || !integration) {
    return new Response(
      JSON.stringify({ error: 'Integration not found' }),
      { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }

  // F1: Integration health gating
  if (integration.status !== 'connected') {
    return new Response(
      JSON.stringify({
        error: 'Integration is not connected',
        code: 'INTEGRATION_NOT_CONNECTED',
        status: integration.status,
      }),
      { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }

  // A: Server-side deployment eligibility validation
  const validation = await validateDeploymentEligibility(
    userId,
    body.detectionId,
    body.integrationId,
    integration.provider,
    body.ruleConfig?.name as string
  )

  if (!validation.eligible) {
    return new Response(
      JSON.stringify({
        error: 'Detection is not eligible for deployment',
        validation,
      }),
      { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }

  const credentials = await getDecryptedCredentials(body.integrationId)

  let action = body.ruleConfig?.action as string || 'create'
  const ruleConfig = body.ruleConfig || {}
  const startedAt = new Date().toISOString()

  // E2: Duplicate detection — check for existing active deployment
  let existingVendorRuleId: string | null = null
  if (action === 'create') {
    const { data: existingDeploy } = await serviceClient
      .from('deployment_history')
      .select('vendor_rule_id')
      .eq('detection_id', body.detectionId)
      .eq('integration_id', body.integrationId)
      .eq('action', 'create')
      .eq('status', 'success')
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle()

    if (existingDeploy?.vendor_rule_id) {
      // Auto-upgrade to update
      action = 'update'
      existingVendorRuleId = existingDeploy.vendor_rule_id
    }
  }

  const vendorRuleIdToUse = body.vendorRuleId || existingVendorRuleId

  // Compute detection hash for version tracking
  const encoder = new TextEncoder()
  const queryBytes = encoder.encode(body.query)
  const hashBuffer = await crypto.subtle.digest('SHA-256', queryBytes)
  const hashArray = Array.from(new Uint8Array(hashBuffer))
  const detectionHash = hashArray.map(b => b.toString(16).padStart(2, '0')).join('')

  // Fetch detection version
  const { data: detRecord } = await serviceClient
    .from('detections')
    .select('version')
    .eq('id', body.detectionId)
    .single()

  // Create deployment record
  const { data: deployment, error: depError } = await serviceClient
    .from('deployment_history')
    .insert({
      user_id: userId,
      integration_id: body.integrationId,
      detection_id: body.detectionId,
      action,
      status: 'in_progress',
      query_language: body.queryLanguage,
      deployed_query: body.query,
      rule_config: ruleConfig,
      started_at: startedAt,
      detection_version: detRecord?.version || null,
      detection_hash: detectionHash,
    })
    .select()
    .single()

  if (depError) {
    return new Response(
      JSON.stringify({ error: 'Failed to create deployment record' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }

  try {
    let result: { vendorRuleId: string; response: Record<string, unknown> }

    switch (integration.provider) {
      case 'splunk':
        result = await splunkDeployRule(integration.config, credentials, body.query, ruleConfig, action, vendorRuleIdToUse || undefined)
        break
      case 'sentinel':
        result = await sentinelDeployRule(integration.config, credentials, body.query, ruleConfig, action, vendorRuleIdToUse || undefined)
        break
      case 'defender_xdr':
        result = await defenderXdrDeployRule(integration.config, credentials, body.query, ruleConfig, action, vendorRuleIdToUse || undefined)
        break
      case 'elastic':
        result = await elasticDeployRule(integration.config, credentials, body.query, ruleConfig, action, vendorRuleIdToUse || undefined)
        break
      case 'crowdstrike':
        result = await crowdStrikeDeployRule(integration.config, credentials, body.query!, ruleConfig, action, vendorRuleIdToUse || undefined)
        break
      case 'chronicle':
        result = await chronicleDeployRule(integration.config, credentials, body.query!, ruleConfig, action, vendorRuleIdToUse || undefined)
        break
      default:
        throw new Error(`Deployment not supported for provider: ${integration.provider}`)
    }

    const completedAt = new Date().toISOString()
    const durationMs = new Date(completedAt).getTime() - new Date(startedAt).getTime()

    // Update deployment record
    await serviceClient
      .from('deployment_history')
      .update({
        status: 'success',
        vendor_rule_id: result.vendorRuleId,
        response: result.response,
        completed_at: completedAt,
        duration_ms: durationMs,
      })
      .eq('id', deployment.id)

    // Update last synced
    await serviceClient
      .from('integrations')
      .update({ last_synced_at: completedAt })
      .eq('id', body.integrationId)

    return new Response(
      JSON.stringify({
        deployment: {
          ...deployment,
          status: 'success',
          vendor_rule_id: result.vendorRuleId,
          response: result.response,
          action, // may differ from original if auto-upgraded from create→update
        },
        validation, // include warnings for the client
        autoUpgraded: existingVendorRuleId !== null,
      }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  } catch (err) {
    console.error('Deployment error:', err instanceof Error ? err.message : err)
    const completedAt = new Date().toISOString()
    const durationMs = new Date(completedAt).getTime() - new Date(startedAt).getTime()

    await serviceClient
      .from('deployment_history')
      .update({
        status: 'failed',
        error_message: err instanceof Error ? err.message : 'Deployment failed',
        completed_at: completedAt,
        duration_ms: durationMs,
      })
      .eq('id', deployment.id)

    return new Response(
      JSON.stringify({ error: 'Deployment failed', deployment: { ...deployment, status: 'failed' } }),
      { status: 502, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }
}

async function handleListRules(
  body: IntegrationRequest,
  userId: string,
  corsHeaders: Record<string, string>
): Promise<Response> {
  if (!body.integrationId) {
    return new Response(
      JSON.stringify({ error: 'integrationId is required' }),
      { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }

  const serviceClient = getServiceClient()
  const { data: integration, error } = await serviceClient
    .from('integrations')
    .select('*')
    .eq('id', body.integrationId)
    .eq('user_id', userId)
    .single()

  if (error || !integration) {
    return new Response(
      JSON.stringify({ error: 'Integration not found' }),
      { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }

  const credentials = await getDecryptedCredentials(body.integrationId)

  let rules: unknown[]
  switch (integration.provider) {
    case 'splunk':
      rules = await splunkListRules(integration.config, credentials)
      break
    case 'sentinel':
      rules = await sentinelListRules(integration.config, credentials)
      break
    case 'defender_xdr':
      rules = await defenderXdrListRules(integration.config, credentials)
      break
    case 'elastic':
      rules = await elasticListRules(integration.config, credentials)
      break
    case 'crowdstrike':
      rules = await crowdStrikeListRules(integration.config, credentials)
      break
    case 'chronicle':
      rules = await chronicleListRules(integration.config, credentials)
      break
    default:
      rules = []
  }

  return new Response(
    JSON.stringify({ rules }),
    { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
  )
}

async function handleDeleteRule(
  body: IntegrationRequest,
  userId: string,
  corsHeaders: Record<string, string>
): Promise<Response> {
  if (!body.deploymentId) {
    return new Response(
      JSON.stringify({ error: 'deploymentId is required' }),
      { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }

  const serviceClient = getServiceClient()

  // Get deployment record
  const { data: deployment, error } = await serviceClient
    .from('deployment_history')
    .select('*, integrations(*)')
    .eq('id', body.deploymentId)
    .eq('user_id', userId)
    .single()

  if (error || !deployment) {
    return new Response(
      JSON.stringify({ error: 'Deployment not found' }),
      { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }

  if (!deployment.vendor_rule_id) {
    return new Response(
      JSON.stringify({ error: 'No vendor rule ID to delete' }),
      { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }

  const integration = deployment.integrations
  const credentials = await getDecryptedCredentials(integration.id)

  try {
    switch (integration.provider) {
      case 'splunk':
        await splunkDeployRule(integration.config, credentials, '', {}, 'delete', deployment.vendor_rule_id)
        break
      case 'sentinel':
        await sentinelDeployRule(integration.config, credentials, '', {}, 'delete', deployment.vendor_rule_id)
        break
      case 'defender_xdr':
        await defenderXdrDeployRule(integration.config, credentials, '', {}, 'delete', deployment.vendor_rule_id)
        break
      case 'elastic':
        await elasticDeployRule(integration.config, credentials, '', {}, 'delete', deployment.vendor_rule_id)
        break
      case 'crowdstrike':
        await crowdStrikeDeployRule(integration.config, credentials, '', {}, 'delete', deployment.vendor_rule_id)
        break
      case 'chronicle':
        await chronicleDeployRule(integration.config, credentials, '', {}, 'delete', deployment.vendor_rule_id)
        break
      default:
        throw new Error(`Delete not supported for provider: ${integration.provider}`)
    }

    // Record the delete action
    await serviceClient
      .from('deployment_history')
      .insert({
        user_id: userId,
        integration_id: integration.id,
        detection_id: deployment.detection_id,
        action: 'delete',
        status: 'success',
        vendor_rule_id: deployment.vendor_rule_id,
        completed_at: new Date().toISOString(),
      })

    return new Response(
      JSON.stringify({ success: true, message: 'Rule deleted from vendor' }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  } catch (err) {
    console.error('Delete error:', err instanceof Error ? err.message : err)
    return new Response(
      JSON.stringify({ error: 'Delete failed' }),
      { status: 502, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }
}

// =============================================================================
// Toggle Rule Handler
// =============================================================================

async function handleToggleRule(
  body: IntegrationRequest,
  userId: string,
  corsHeaders: Record<string, string>
): Promise<Response> {
  if (!body.integrationId || !body.vendorRuleId || body.enabled === undefined) {
    return new Response(
      JSON.stringify({ error: 'integrationId, vendorRuleId, and enabled are required' }),
      { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }

  const serviceClient = getServiceClient()
  const { data: integration, error } = await serviceClient
    .from('integrations')
    .select('*')
    .eq('id', body.integrationId)
    .eq('user_id', userId)
    .single()

  if (error || !integration) {
    return new Response(
      JSON.stringify({ error: 'Integration not found' }),
      { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }

  const credentials = await getDecryptedCredentials(body.integrationId)
  const enabled = body.enabled

  try {
    switch (integration.provider) {
      case 'splunk': {
        const host = integration.config.host as string
        const port = integration.config.port as number || 8089
        const ssl = integration.config.ssl !== false
        const protocol = ssl ? 'https' : 'http'
        const owner = (integration.config.owner as string) || '-'
        const app = (integration.config.app as string) || 'search'
        const baseUrl = `${protocol}://${host}:${port}/servicesNS/${owner}/${app}`
        const headers: Record<string, string> = { 'Accept': 'application/json' }
        if (credentials.token) headers['Authorization'] = `Bearer ${credentials.token}`
        else if (credentials.username && credentials.password) headers['Authorization'] = `Basic ${btoa(`${credentials.username}:${credentials.password}`)}`

        const endpoint = enabled ? 'enable' : 'disable'
        const response = await withRetry(() =>
          vendorFetch(`${baseUrl}/saved/searches/${encodeURIComponent(body.vendorRuleId!)}/${endpoint}`, { method: 'POST', headers })
        )
        if (!response.ok) throw new Error(`Splunk ${endpoint} failed: ${response.status}`)
        break
      }
      case 'sentinel': {
        const { tenantId, subscriptionId, resourceGroup, workspaceName } = integration.config as Record<string, string>
        const token = await microsoftGetToken(tenantId, credentials.clientId, credentials.clientSecret, 'https://management.azure.com/.default')
        const baseUrl = `https://management.azure.com/subscriptions/${subscriptionId}/resourceGroups/${resourceGroup}/providers/Microsoft.OperationalInsights/workspaces/${workspaceName}/providers/Microsoft.SecurityInsights/alertRules`
        const authHeaders = { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json', 'Accept': 'application/json' }

        // GET current, toggle enabled, PUT back
        const getRes = await withRetry(() =>
          vendorFetch(`${baseUrl}/${body.vendorRuleId}?api-version=2025-06-01`, { method: 'GET', headers: { 'Authorization': `Bearer ${token}`, 'Accept': 'application/json' } })
        )
        if (!getRes.ok) throw new Error(`Sentinel GET failed: ${getRes.status}`)
        const ruleData = await getRes.json()
        if (ruleData.properties) ruleData.properties.enabled = enabled

        const putRes = await withRetry(() =>
          vendorFetch(`${baseUrl}/${body.vendorRuleId}?api-version=2025-06-01`, { method: 'PUT', headers: authHeaders, body: JSON.stringify(ruleData) })
        )
        if (!putRes.ok) throw new Error(`Sentinel toggle failed: ${putRes.status}`)
        break
      }
      case 'defender_xdr': {
        const tenantId = integration.config.tenantId as string
        const token = await microsoftGetToken(tenantId, credentials.clientId, credentials.clientSecret, GRAPH_DEFENDER_SCOPE)
        const response = await withRetry(() =>
          vendorFetch(`${GRAPH_DEFENDER_BASE}/${body.vendorRuleId}`, {
            method: 'PATCH',
            headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
            body: JSON.stringify({ isEnabled: enabled }),
          })
        )
        if (!response.ok) throw new Error(`Defender XDR toggle failed: ${response.status}`)
        break
      }
      case 'elastic': {
        const { baseUrl: elasticBase, headers: elasticHeaders } = await elasticGetAuth(integration.config, credentials)
        const response = await withRetry(() =>
          vendorFetch(`${elasticBase}/api/detection_engine/rules/_bulk_action`, {
            method: 'POST',
            headers: elasticHeaders,
            body: JSON.stringify({ ids: [body.vendorRuleId], action: enabled ? 'enable' : 'disable' }),
          })
        )
        if (!response.ok) throw new Error(`Elastic toggle failed: ${response.status}`)
        break
      }
      case 'crowdstrike': {
        const csBaseUrl = integration.config.baseUrl as string
        const csToken = await crowdStrikeGetToken(csBaseUrl, credentials.clientId, credentials.clientSecret)
        const response = await withRetry(() =>
          vendorFetch(`${csBaseUrl}/correlation-rules/entities/rules/v1`, {
            method: 'PATCH',
            headers: { 'Authorization': `Bearer ${csToken}`, 'Content-Type': 'application/json', 'Accept': 'application/json' },
            body: JSON.stringify([{ id: body.vendorRuleId, status: enabled ? 'active' : 'inactive' }]),
          })
        )
        if (!response.ok) throw new Error(`CrowdStrike toggle failed: ${response.status}`)
        break
      }
      case 'chronicle': {
        const chrRegion = integration.config.region as string || 'us'
        const chrCustomerId = integration.config.customerId as string
        const chrToken = await chronicleGetToken(credentials.clientEmail, credentials.privateKey)
        const chrBaseUrl = chronicleBaseUrl(chrRegion, chrCustomerId)
        const chrAction = enabled ? ':enableLiveRule' : ':disableLiveRule'
        const chrRes = await withRetry(() =>
          vendorFetch(`${chrBaseUrl}/${body.vendorRuleId}${chrAction}`, {
            method: 'POST',
            headers: { 'Authorization': `Bearer ${chrToken}`, 'Content-Type': 'application/json', 'Accept': 'application/json' },
            body: '{}',
          })
        )
        if (!chrRes.ok) throw new Error(`Chronicle toggle failed: ${chrRes.status}`)
        break
      }
      default:
        throw new Error(`Toggle not supported for provider: ${integration.provider}`)
    }

    return new Response(
      JSON.stringify({ success: true, enabled }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  } catch (err) {
    return new Response(
      JSON.stringify({ error: 'Toggle failed' }),
      { status: 502, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }
}

// =============================================================================
// Delete Vendor Rule Handler (standalone — no deployment record needed)
// =============================================================================

async function handleDeleteVendorRule(
  body: IntegrationRequest,
  userId: string,
  corsHeaders: Record<string, string>
): Promise<Response> {
  if (!body.integrationId || !body.vendorRuleId) {
    return new Response(
      JSON.stringify({ error: 'integrationId and vendorRuleId are required' }),
      { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }

  const serviceClient = getServiceClient()
  const { data: integration, error } = await serviceClient
    .from('integrations')
    .select('*')
    .eq('id', body.integrationId)
    .eq('user_id', userId)
    .single()

  if (error || !integration) {
    return new Response(
      JSON.stringify({ error: 'Integration not found' }),
      { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }

  const credentials = await getDecryptedCredentials(body.integrationId)

  try {
    switch (integration.provider) {
      case 'splunk':
        await splunkDeployRule(integration.config, credentials, '', {}, 'delete', body.vendorRuleId)
        break
      case 'sentinel':
        await sentinelDeployRule(integration.config, credentials, '', {}, 'delete', body.vendorRuleId)
        break
      case 'defender_xdr':
        await defenderXdrDeployRule(integration.config, credentials, '', {}, 'delete', body.vendorRuleId)
        break
      case 'elastic':
        await elasticDeployRule(integration.config, credentials, '', {}, 'delete', body.vendorRuleId)
        break
      case 'crowdstrike':
        await crowdStrikeDeployRule(integration.config, credentials, '', {}, 'delete', body.vendorRuleId!)
        break
      case 'chronicle':
        await chronicleDeployRule(integration.config, credentials, '', {}, 'delete', body.vendorRuleId!)
        break
      default:
        throw new Error(`Delete not supported for provider: ${integration.provider}`)
    }

    // Mark related deployment_history as rolled_back
    await serviceClient
      .from('deployment_history')
      .update({ status: 'rolled_back' })
      .eq('integration_id', body.integrationId)
      .eq('vendor_rule_id', body.vendorRuleId)
      .eq('status', 'success')

    return new Response(
      JSON.stringify({ success: true, message: 'Rule deleted from vendor' }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  } catch (err) {
    return new Response(
      JSON.stringify({ error: 'Delete failed' }),
      { status: 502, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }
}

// =============================================================================
// SIEM Query Pre-flight — Microsoft Defender XDR (Advanced Hunting)
// ISOLATED BLOCK. Pure helpers below mirror src/lib/preflightQuery.ts — keep in sync.
// =============================================================================

const GRAPH_HUNTING_URL = 'https://graph.microsoft.com/v1.0/security/runHuntingQuery'
const GRAPH_DEFAULT_SCOPE = 'https://graph.microsoft.com/.default'

const PREFLIGHT_ENTITY_COLUMNS = [
  'DeviceName', 'DeviceId', 'AccountName', 'AccountUpn', 'AccountObjectId',
  'AccountSid', 'InitiatingProcessAccountName', 'RemoteIP', 'FileName',
]

function pfNormalizeQuery(query: string): string {
  return query.trim().replace(/;+$/g, '').trim()
}
function pfAppendOperator(baseQuery: string, operator: string): string {
  return `${pfNormalizeQuery(baseQuery)}\n${operator}`
}
function pfBuildWindowClause(windowDays: number, hasTimestamp: boolean): string {
  return hasTimestamp ? `| where Timestamp > ago(${windowDays}d)` : ''
}
function pfExtractColumns(schema: { name: string }[] | undefined): string[] {
  return (schema || []).map((s) => s.name)
}
function pfHasTimestamp(columns: string[]): boolean {
  return columns.includes('Timestamp')
}
function pfDetectEntityColumn(columns: string[]): string | null {
  const set = new Set(columns)
  for (const col of PREFLIGHT_ENTITY_COLUMNS) if (set.has(col)) return col
  return null
}
function pfBuildDerivedQueries(opts: {
  baseQuery: string; windowDays: number; hasTimestamp: boolean; entityColumn: string | null
}): { count: string; sample: string; timeBreakdown: string | null; entityBreakdown: string | null } {
  const base = pfNormalizeQuery(opts.baseQuery)
  const win = pfBuildWindowClause(opts.windowDays, opts.hasTimestamp)
  const withWin = win ? `${base}\n${win}` : base
  return {
    count: `${withWin}\n| count`,
    sample: `${withWin}\n| take 25`,
    timeBreakdown: opts.hasTimestamp
      ? `${withWin}\n| summarize Hits = count() by bin(Timestamp, 1d)\n| order by Timestamp asc`
      : null,
    entityBreakdown: opts.entityColumn
      ? `${withWin}\n| summarize Hits = count() by ${opts.entityColumn}\n| top 10 by Hits`
      : null,
  }
}
function pfLintSchema(columns: string[]): { code: string; message: string }[] {
  const warnings: { code: string; message: string }[] = []
  const set = new Set(columns)
  if (!set.has('Timestamp')) warnings.push({ code: 'MISSING_TIMESTAMP', message: 'Query does not return a Timestamp column — required to save it as a Defender custom detection.' })
  if (!set.has('ReportId')) warnings.push({ code: 'MISSING_REPORTID', message: 'Query does not return a ReportId column — required to save it as a Defender custom detection.' })
  if (!pfDetectEntityColumn(columns)) warnings.push({ code: 'MISSING_ENTITY', message: 'Query does not return a recognized entity column (e.g. DeviceId, AccountSid) — Defender custom detections require at least one impacted-asset identifier.' })
  return warnings
}
function pfParseCount(results: Record<string, unknown>[]): number {
  if (!results || results.length === 0) return 0
  const row = results[0]
  const raw = row.Count ?? row.count ?? Object.values(row)[0]
  const n = Number(raw)
  return Number.isFinite(n) ? n : 0
}
function pfParseTime(results: Record<string, unknown>[]): { date: string; hits: number }[] {
  return (results || []).map((r) => ({ date: String(r.Timestamp ?? ''), hits: Number(r.Hits ?? 0) || 0 })).filter((b) => b.date)
}
function pfParseEntity(results: Record<string, unknown>[], col: string): { name: string; hits: number }[] {
  return (results || []).map((r) => ({ name: String(r[col] ?? '(unknown)'), hits: Number(r.Hits ?? 0) || 0 }))
}
function pfMapError(httpStatus: number, body: string): { status: string; message: string; guidance: string } {
  let text = ''
  try {
    const data = JSON.parse(body)
    text = data?.error?.message || data?.error_description || data?.message || ''
  } catch { text = body ? body.slice(0, 300) : '' }
  const insufficientPerms = { status: 'permission_denied', message: 'Insufficient Graph API permissions for Advanced Hunting', guidance: 'Add ThreatHunting.Read.All as an Application permission (not Delegated) on Microsoft Graph for your Azure AD app registration, then grant admin consent for the tenant.' }
  const authFailed = { status: 'permission_denied', message: 'Authentication failed', guidance: 'Check the Client ID, Client Secret, and Tenant ID configured for this integration.' }
  // Route by explicit HTTP status first — a definite status always wins over text matching.
  if (httpStatus === 403) return insufficientPerms
  if (httpStatus === 401) return authFailed
  if (httpStatus === 429) {
    return { status: 'connection_error', message: 'Microsoft Advanced Hunting API rate limit reached', guidance: 'Defender throttles hunting queries. Wait a moment and run the pre-flight again.' }
  }
  if (httpStatus >= 500) {
    return { status: 'connection_error', message: 'Microsoft Graph is unavailable', guidance: 'Graph returned a server error. Try again shortly.' }
  }
  // Text-based fallback — only for ambiguous statuses (e.g. a 2xx wrapper that embeds an error).
  if (/forbidden|insufficient|privilege/i.test(text)) return insufficientPerms
  if (/unauthorized|invalid.*token|expired/i.test(text)) return authFailed
  return { status: 'query_error', message: text ? `Query error: ${text.slice(0, 240)}` : `Query failed (HTTP ${httpStatus})`, guidance: 'Fix the KQL query so it compiles in Defender Advanced Hunting, then run the pre-flight again.' }
}

interface HuntingResponse {
  ok: boolean; httpStatus: number; body: string
  schema?: { name: string; type: string }[]; results?: Record<string, unknown>[]
}

async function runHuntingQuery(token: string, query: string): Promise<HuntingResponse> {
  const response = await vendorFetch(
    GRAPH_HUNTING_URL,
    {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json',
        'Accept': 'application/json',
      },
      body: JSON.stringify({ query }),
    },
    60000,
  )
  const body = await response.text()
  if (!response.ok) return { ok: false, httpStatus: response.status, body }
  try {
    const data = JSON.parse(body)
    return { ok: true, httpStatus: 200, body, schema: data.schema, results: data.results }
  } catch {
    return { ok: false, httpStatus: response.status, body }
  }
}

function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  return Promise.race([
    promise,
    new Promise<T>((_, reject) => setTimeout(() => reject(new Error('PREFLIGHT_TIMEOUT')), ms)),
  ])
}

/** Pick the KQL query from a detection, preferring the queries[] array. */
function pickKqlQuery(detection: {
  queries?: { language?: string; query?: string }[]
  queryLanguage?: string
  detectionQuery?: string
}): string | null {
  const fromArray = (detection.queries || []).find(
    (q) => q.language && q.language.toUpperCase() === 'KQL' && q.query && q.query.trim() !== '',
  )
  if (fromArray?.query) return fromArray.query
  if (
    detection.detectionQuery && detection.detectionQuery.trim() !== '' &&
    detection.queryLanguage && detection.queryLanguage.toUpperCase() === 'KQL'
  ) {
    return detection.detectionQuery
  }
  return null
}

const CROWDSTRIKE_PREFLIGHT_TIMEOUT_MS = 5 * 60 * 1000

interface CrowdStrikeQueryJobState {
  repository: CrowdStrikeQueryRepository
  count_job_id: string
  sample_job_id: string
  count_done: boolean
  sample_done: boolean
}

interface CrowdStrikeQueryJobResult {
  cancelled?: boolean
  done?: boolean
  events?: Record<string, unknown>[]
  errors?: Array<{ message?: string }>
}

function crowdStrikeQueryJobsUrl(
  baseUrl: string,
  repository: CrowdStrikeQueryRepository,
  jobId?: string,
): string {
  const root = `${baseUrl.replace(/\/+$/, '')}/humio/api/v1/repositories/${encodeURIComponent(repository)}/queryjobs`
  return jobId ? `${root}/${encodeURIComponent(jobId)}` : root
}

async function crowdStrikeStartQueryJob(
  baseUrl: string,
  repository: CrowdStrikeQueryRepository,
  token: string,
  queryString: string,
  windowDays: number,
): Promise<{ ok: boolean; status: number; body: string; id?: string }> {
  let response: Response
  try {
    response = await vendorFetch(crowdStrikeQueryJobsUrl(baseUrl, repository), {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json',
        'Accept': 'application/json',
      },
      body: JSON.stringify({
        queryString,
        start: `${windowDays}d`,
        end: 'now',
        useIngestTime: false,
      }),
    })
  } catch (error) {
    return {
      ok: false,
      status: 503,
      body: error instanceof Error ? error.message : 'CrowdStrike query job request failed',
    }
  }
  const responseBody = await response.text()
  if (!response.ok) return { ok: false, status: response.status, body: responseBody }
  try {
    const data = JSON.parse(responseBody)
    if (typeof data.id !== 'string' || data.id.length === 0) {
      return { ok: false, status: 502, body: 'CrowdStrike did not return a query job ID' }
    }
    return { ok: true, status: response.status, body: responseBody, id: data.id }
  } catch {
    return { ok: false, status: 502, body: 'CrowdStrike returned an invalid query job response' }
  }
}

async function crowdStrikeGetQueryJob(
  baseUrl: string,
  repository: CrowdStrikeQueryRepository,
  token: string,
  jobId: string,
): Promise<{ ok: boolean; status: number; body: string; job?: CrowdStrikeQueryJobResult }> {
  let response: Response
  try {
    response = await vendorFetch(crowdStrikeQueryJobsUrl(baseUrl, repository, jobId), {
      method: 'GET',
      headers: { 'Authorization': `Bearer ${token}`, 'Accept': 'application/json' },
    })
  } catch (error) {
    return {
      ok: false,
      status: 503,
      body: error instanceof Error ? error.message : 'CrowdStrike query job polling failed',
    }
  }
  const responseBody = await response.text()
  if (!response.ok) return { ok: false, status: response.status, body: responseBody }
  try {
    return { ok: true, status: response.status, body: responseBody, job: JSON.parse(responseBody) }
  } catch {
    return { ok: false, status: 502, body: 'CrowdStrike returned an invalid query job response' }
  }
}

async function crowdStrikeDeleteQueryJob(
  baseUrl: string,
  repository: CrowdStrikeQueryRepository,
  token: string,
  jobId: string,
): Promise<void> {
  await vendorFetch(crowdStrikeQueryJobsUrl(baseUrl, repository, jobId), {
    method: 'DELETE',
    headers: { 'Authorization': `Bearer ${token}`, 'Accept': 'application/json' },
  })
}

async function crowdStrikeCancelJobState(
  baseUrl: string,
  token: string,
  state: CrowdStrikeQueryJobState,
): Promise<void> {
  const jobs = [
    state.count_done ? null : state.count_job_id,
    state.sample_done ? null : state.sample_job_id,
  ].filter((jobId): jobId is string => Boolean(jobId))
  await Promise.allSettled(
    jobs.map((jobId) => crowdStrikeDeleteQueryJob(baseUrl, state.repository, token, jobId)),
  )
}

type IntegrationServiceClient = ReturnType<typeof getServiceClient>

async function updateCrowdStrikePreflightRun(
  serviceClient: IntegrationServiceClient,
  runId: string,
  changes: Record<string, unknown>,
) {
  const { data, error } = await serviceClient
    .from('detection_preflight_runs')
    .update(changes)
    .eq('id', runId)
    .select()
    .single()
  if (error || !data) throw new Error('CrowdStrike pre-flight result could not be updated')
  return data
}

function parseCrowdStrikeJobState(value: unknown): CrowdStrikeQueryJobState | null {
  if (!value || typeof value !== 'object') return null
  const state = value as Record<string, unknown>
  if (
    !isCrowdStrikeQueryRepository(state.repository) ||
    typeof state.count_job_id !== 'string' ||
    typeof state.sample_job_id !== 'string'
  ) {
    return null
  }
  return {
    repository: state.repository,
    count_job_id: state.count_job_id,
    sample_job_id: state.sample_job_id,
    count_done: state.count_done === true,
    sample_done: state.sample_done === true,
  }
}

async function startCrowdStrikePreflight(
  serviceClient: IntegrationServiceClient,
  integration: Record<string, unknown>,
  detection: {
    id: string
    queries?: { language?: string; query?: string }[]
    queryLanguage?: string
    detectionQuery?: string
  },
  userId: string,
  windowDays: number,
  corsHeaders: Record<string, string>,
): Promise<Response> {
  const json = (payload: unknown, status = 200) =>
    new Response(JSON.stringify(payload), {
      status, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  const integrationId = String(integration.id)
  const cqlQuery = pickCrowdStrikeQuery(detection)
  if (!cqlQuery) {
    return json({ error: 'Detection has no CQL query to run', code: 'DETECTION_NO_CQL_QUERY' }, 400)
  }

  const config = (integration.config || {}) as Record<string, unknown>
  const baseUrl = String(config.baseUrl || '').replace(/\/+$/, '')
  if (!baseUrl) {
    return json({ error: 'Integration is missing its CrowdStrike API base URL', code: 'MISSING_BASE_URL' }, 400)
  }
  const configuredRepository = config.repository || 'search-all'
  if (!isCrowdStrikeQueryRepository(configuredRepository)) {
    return json({ error: 'Integration has an unsupported CrowdStrike NGSIEM repository' }, 400)
  }

  const startedAt = new Date()
  const queries = buildCrowdStrikeQueries(cqlQuery)
  const insertTerminalResult = async (
    mapped: { status: string; message: string; guidance: string },
  ): Promise<Response> => {
    const completedAt = new Date()
    const { data, error } = await serviceClient
      .from('detection_preflight_runs')
      .insert({
        user_id: userId,
        integration_id: integrationId,
        detection_id: detection.id,
        provider: 'crowdstrike',
        window_days: windowDays,
        status: mapped.status,
        validation_passed: false,
        hit_count: null,
        window_applied: true,
        error_message: mapped.message,
        error_guidance: mapped.guidance,
        schema_warnings: [],
        query_text: cqlQuery,
        query_language: 'CQL',
        sample: [],
        breakdown: null,
        duration_ms: completedAt.getTime() - startedAt.getTime(),
        provider_job_state: null,
        started_at: startedAt.toISOString(),
        completed_at: completedAt.toISOString(),
      })
      .select()
      .single()
    if (error || !data) return json({ error: 'Pre-flight result could not be saved' }, 500)
    return json(data)
  }

  let token: string
  try {
    const credentials = await getDecryptedCredentials(integrationId)
    token = await crowdStrikeGetToken(baseUrl, credentials.clientId, credentials.clientSecret)
  } catch (error) {
    return insertTerminalResult({
      status: 'permission_denied',
      message: error instanceof Error ? error.message : 'CrowdStrike authentication failed',
      guidance: 'Check the CrowdStrike credentials, cloud region, and API client scopes.',
    })
  }

  const countJob = await crowdStrikeStartQueryJob(
    baseUrl, configuredRepository, token, queries.count, windowDays,
  )
  if (!countJob.ok || !countJob.id) {
    return insertTerminalResult(mapCrowdStrikeQueryError(countJob.status, countJob.body))
  }
  const sampleJob = await crowdStrikeStartQueryJob(
    baseUrl, configuredRepository, token, queries.sample, windowDays,
  )
  if (!sampleJob.ok || !sampleJob.id) {
    await Promise.allSettled([
      crowdStrikeDeleteQueryJob(baseUrl, configuredRepository, token, countJob.id),
    ])
    return insertTerminalResult(mapCrowdStrikeQueryError(sampleJob.status, sampleJob.body))
  }

  const jobState: CrowdStrikeQueryJobState = {
    repository: configuredRepository,
    count_job_id: countJob.id,
    sample_job_id: sampleJob.id,
    count_done: false,
    sample_done: false,
  }
  const { data: row, error: insertError } = await serviceClient
    .from('detection_preflight_runs')
    .insert({
      user_id: userId,
      integration_id: integrationId,
      detection_id: detection.id,
      provider: 'crowdstrike',
      window_days: windowDays,
      status: 'running',
      validation_passed: false,
      hit_count: null,
      window_applied: true,
      error_message: null,
      error_guidance: null,
      schema_warnings: [],
      query_text: cqlQuery,
      query_language: 'CQL',
      sample: [],
      breakdown: null,
      duration_ms: null,
      provider_job_state: jobState,
      started_at: startedAt.toISOString(),
      completed_at: null,
    })
    .select()
    .single()
  if (insertError || !row) {
    await crowdStrikeCancelJobState(baseUrl, token, jobState)
    return json({ error: 'Pre-flight jobs started but the run could not be saved' }, 500)
  }
  return json(row)
}

async function handlePollCrowdStrikePreflight(
  body: IntegrationRequest,
  userId: string,
  corsHeaders: Record<string, string>,
): Promise<Response> {
  const json = (payload: unknown, status = 200) =>
    new Response(JSON.stringify(payload), {
      status, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  if (!body.preflightRunId) return json({ error: 'preflightRunId is required' }, 400)

  const serviceClient = getServiceClient()
  const { data: run, error: runError } = await serviceClient
    .from('detection_preflight_runs')
    .select('*')
    .eq('id', body.preflightRunId)
    .eq('user_id', userId)
    .single()
  if (runError || !run) return json({ error: 'Pre-flight run not found' }, 404)
  if (run.provider !== 'crowdstrike') return json({ error: 'Run is not a CrowdStrike pre-flight' }, 400)
  if (run.status !== 'running') return json(run)

  const state = parseCrowdStrikeJobState(run.provider_job_state)
  if (!state) {
    const completedAt = new Date()
    return json(await updateCrowdStrikePreflightRun(serviceClient, run.id, {
      status: 'connection_error',
      error_message: 'CrowdStrike query job state is missing or invalid',
      error_guidance: 'Run pre-flight again.',
      duration_ms: completedAt.getTime() - new Date(run.started_at || run.created_at).getTime(),
      completed_at: completedAt.toISOString(),
    }))
  }
  const { data: integration, error: integrationError } = await serviceClient
    .from('integrations')
    .select('*')
    .eq('id', run.integration_id)
    .eq('user_id', userId)
    .single()
  if (integrationError || !integration) return json({ error: 'Integration not found' }, 404)

  const config = (integration.config || {}) as Record<string, unknown>
  const baseUrl = String(config.baseUrl || '').replace(/\/+$/, '')
  let token: string
  try {
    const credentials = await getDecryptedCredentials(run.integration_id)
    token = await crowdStrikeGetToken(baseUrl, credentials.clientId, credentials.clientSecret)
  } catch (error) {
    const completedAt = new Date()
    return json(await updateCrowdStrikePreflightRun(serviceClient, run.id, {
      status: 'permission_denied',
      error_message: error instanceof Error ? error.message : 'CrowdStrike authentication failed',
      error_guidance: 'Check the CrowdStrike credentials, cloud region, and API client scopes.',
      duration_ms: completedAt.getTime() - new Date(run.started_at || run.created_at).getTime(),
      completed_at: completedAt.toISOString(),
    }))
  }

  const startedAtMs = new Date(run.started_at || run.created_at).getTime()
  if (Date.now() - startedAtMs > CROWDSTRIKE_PREFLIGHT_TIMEOUT_MS) {
    await crowdStrikeCancelJobState(baseUrl, token, state)
    const completedAt = new Date()
    return json(await updateCrowdStrikePreflightRun(serviceClient, run.id, {
      status: 'timeout',
      error_message: 'The CrowdStrike query took too long to run',
      error_guidance: 'Narrow the CQL query or choose a shorter time range, then try again.',
      duration_ms: completedAt.getTime() - startedAtMs,
      completed_at: completedAt.toISOString(),
    }))
  }

  const [countResult, sampleResult] = await Promise.all([
    state.count_done
      ? Promise.resolve(null)
      : crowdStrikeGetQueryJob(baseUrl, state.repository, token, state.count_job_id),
    state.sample_done
      ? Promise.resolve(null)
      : crowdStrikeGetQueryJob(baseUrl, state.repository, token, state.sample_job_id),
  ])
  for (const result of [countResult, sampleResult]) {
    if (result && !result.ok) {
      await crowdStrikeCancelJobState(baseUrl, token, state)
      const mapped = mapCrowdStrikeQueryError(result.status, result.body)
      const completedAt = new Date()
      return json(await updateCrowdStrikePreflightRun(serviceClient, run.id, {
        status: mapped.status,
        validation_passed: false,
        error_message: mapped.message,
        error_guidance: mapped.guidance,
        duration_ms: completedAt.getTime() - startedAtMs,
        completed_at: completedAt.toISOString(),
      }))
    }
    if (result?.job?.errors?.length) {
      await crowdStrikeCancelJobState(baseUrl, token, state)
      const mapped = mapCrowdStrikeQueryError(400, JSON.stringify({ message: result.job.errors[0]?.message }))
      const completedAt = new Date()
      return json(await updateCrowdStrikePreflightRun(serviceClient, run.id, {
        status: mapped.status,
        validation_passed: false,
        error_message: mapped.message,
        error_guidance: mapped.guidance,
        duration_ms: completedAt.getTime() - startedAtMs,
        completed_at: completedAt.toISOString(),
      }))
    }
    if (result?.job?.cancelled) {
      await crowdStrikeCancelJobState(baseUrl, token, state)
      const completedAt = new Date()
      return json(await updateCrowdStrikePreflightRun(serviceClient, run.id, {
        status: 'cancelled',
        error_message: 'CrowdStrike query job was cancelled',
        error_guidance: null,
        duration_ms: completedAt.getTime() - startedAtMs,
        completed_at: completedAt.toISOString(),
      }))
    }
  }

  const nextState: CrowdStrikeQueryJobState = {
    ...state,
    count_done: state.count_done || countResult?.job?.done === true,
    sample_done: state.sample_done || sampleResult?.job?.done === true,
  }
  const changes: Record<string, unknown> = { provider_job_state: nextState }
  if (countResult?.job?.done) changes.hit_count = parseCrowdStrikeCount(countResult.job.events || [])
  if (sampleResult?.job?.done) changes.sample = (sampleResult.job.events || []).slice(0, 25)
  if (nextState.count_done && nextState.sample_done) {
    const completedAt = new Date()
    Object.assign(changes, {
      status: 'success',
      validation_passed: true,
      error_message: null,
      error_guidance: null,
      duration_ms: completedAt.getTime() - startedAtMs,
      completed_at: completedAt.toISOString(),
    })
  }
  return json(await updateCrowdStrikePreflightRun(serviceClient, run.id, changes))
}

async function handleCancelCrowdStrikePreflight(
  body: IntegrationRequest,
  userId: string,
  corsHeaders: Record<string, string>,
): Promise<Response> {
  const json = (payload: unknown, status = 200) =>
    new Response(JSON.stringify(payload), {
      status, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  if (!body.preflightRunId) return json({ error: 'preflightRunId is required' }, 400)
  const serviceClient = getServiceClient()
  const { data: run, error: runError } = await serviceClient
    .from('detection_preflight_runs')
    .select('*')
    .eq('id', body.preflightRunId)
    .eq('user_id', userId)
    .single()
  if (runError || !run) return json({ error: 'Pre-flight run not found' }, 404)
  if (run.provider !== 'crowdstrike') return json({ error: 'Run is not a CrowdStrike pre-flight' }, 400)
  if (run.status !== 'running') return json(run)

  const state = parseCrowdStrikeJobState(run.provider_job_state)
  if (state) {
    const { data: integration } = await serviceClient
      .from('integrations')
      .select('*')
      .eq('id', run.integration_id)
      .eq('user_id', userId)
      .single()
    if (integration) {
      try {
        const config = (integration.config || {}) as Record<string, unknown>
        const credentials = await getDecryptedCredentials(run.integration_id)
        const token = await crowdStrikeGetToken(
          String(config.baseUrl || '').replace(/\/+$/, ''),
          credentials.clientId,
          credentials.clientSecret,
        )
        await crowdStrikeCancelJobState(String(config.baseUrl || ''), token, state)
      } catch (error) {
        console.error('CrowdStrike query job cancellation failed:', error instanceof Error ? error.message : error)
      }
    }
  }
  const completedAt = new Date()
  return json(await updateCrowdStrikePreflightRun(serviceClient, run.id, {
    status: 'cancelled',
    validation_passed: false,
    error_message: 'Pre-flight was cancelled',
    error_guidance: null,
    duration_ms: completedAt.getTime() - new Date(run.started_at || run.created_at).getTime(),
    completed_at: completedAt.toISOString(),
  }))
}

async function handleRunPreflight(
  body: IntegrationRequest,
  userId: string,
  corsHeaders: Record<string, string>,
): Promise<Response> {
  const json = (payload: unknown, status = 200) =>
    new Response(JSON.stringify(payload), {
      status, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })

  if (!body.integrationId || !body.detectionId) {
    return json({ error: 'integrationId and detectionId are required' }, 400)
  }
  // Custom backtest window — clamp to the DB CHECK range (1–90 days); default 30.
  const rawWindow = Math.round(Number(body.windowDays))
  const windowDays = Number.isFinite(rawWindow) ? Math.min(Math.max(rawWindow, 1), 90) : 30

  const serviceClient = getServiceClient()

  // Pre-flight-specific rate limit (10 runs / 5 min), separate from the function-wide limiter.
  const { allowed } = await checkRateLimit(serviceClient, `user:${userId}:preflight`, 10, 300)
  if (!allowed) {
    return json({ error: 'Pre-flight rate limit reached. Wait a few minutes and try again.' }, 429)
  }

  // Integration must be a connected supported pre-flight integration owned by the user.
  const { data: integration, error: intError } = await serviceClient
    .from('integrations')
    .select('*')
    .eq('id', body.integrationId)
    .eq('user_id', userId)
    .single()
  if (intError || !integration) return json({ error: 'Integration not found' }, 404)
  if (integration.provider !== 'defender_xdr' && integration.provider !== 'crowdstrike') {
    return json({ error: 'Pre-flight supports Microsoft Defender XDR and CrowdStrike integrations' }, 400)
  }
  if (integration.status !== 'connected') {
    return json({ error: 'Integration is not connected', code: 'INTEGRATION_NOT_CONNECTED' }, 400)
  }

  // Detection must be owned by the user and have a KQL query. (No production/status gate.)
  const { data: detection, error: detError } = await serviceClient
    .from('detections')
    .select('id, user_id, queries, queryLanguage, detectionQuery')
    .eq('id', body.detectionId)
    .single()
  if (detError || !detection) return json({ error: 'Detection not found' }, 404)
  if (detection.user_id !== userId) return json({ error: 'You do not own this detection' }, 403)

  if (integration.provider === 'crowdstrike') {
    return startCrowdStrikePreflight(
      serviceClient,
      integration,
      detection,
      userId,
      windowDays,
      corsHeaders,
    )
  }

  const kqlQuery = pickKqlQuery(detection)
  if (!kqlQuery) {
    return json({ error: 'Detection has no KQL query to run', code: 'DETECTION_NO_KQL_QUERY' }, 400)
  }

  const credentials = await getDecryptedCredentials(body.integrationId)
  const config = (integration.config || {}) as Record<string, unknown>
  if (!config.tenantId) {
    return json({ error: 'Integration is missing tenantId — re-save its credentials in integration settings.', code: 'MISSING_TENANT_ID' }, 400)
  }
  const startedAt = Date.now()

  let status = 'success'
  let validationPassed = false
  let errorMessage: string | null = null
  let errorGuidance: string | null = null
  let hitCount: number | null = null
  let windowApplied = false
  let schemaWarnings: { code: string; message: string }[] = []
  let sample: Record<string, unknown>[] = []
  const breakdown: {
    overTime: { date: string; hits: number }[]
    byEntity: { name: string; hits: number }[]
    entityColumn: string | null
  } = { overTime: [], byEntity: [], entityColumn: null }

  try {
    // 85s wall-clock cap across the whole probe -> count -> sample -> breakdown sequence;
    // each runHuntingQuery additionally has its own 60s vendorFetch timeout.
    await withTimeout((async () => {
      const token = await microsoftGetToken(
        config.tenantId as string, credentials.clientId, credentials.clientSecret, GRAPH_DEFAULT_SCOPE,
      )

      // 1. Probe — validates the query and reveals its result schema.
      const probe = await runHuntingQuery(token, pfAppendOperator(kqlQuery, '| take 1'))
      if (!probe.ok) {
        const mapped = pfMapError(probe.httpStatus, probe.body)
        status = mapped.status
        errorMessage = mapped.message
        errorGuidance = mapped.guidance
        return
      }
      validationPassed = true
      const columns = pfExtractColumns(probe.schema)
      const hasTimestamp = pfHasTimestamp(columns)
      const entityColumn = pfDetectEntityColumn(columns)
      schemaWarnings = pfLintSchema(columns)
      windowApplied = hasTimestamp
      breakdown.entityColumn = entityColumn

      const derived = pfBuildDerivedQueries({ baseQuery: kqlQuery, windowDays, hasTimestamp, entityColumn })

      // 2. Count.
      const countRes = await runHuntingQuery(token, derived.count)
      if (!countRes.ok) {
        const mapped = pfMapError(countRes.httpStatus, countRes.body)
        status = mapped.status
        errorMessage = mapped.message
        errorGuidance = mapped.guidance
        return
      }
      hitCount = pfParseCount(countRes.results || [])

      // 3. Sample (best-effort).
      const sampleRes = await runHuntingQuery(token, derived.sample)
      if (sampleRes.ok) sample = (sampleRes.results || []).slice(0, 25)

      // 4. Time breakdown (best-effort).
      if (derived.timeBreakdown) {
        const tRes = await runHuntingQuery(token, derived.timeBreakdown)
        if (tRes.ok) breakdown.overTime = pfParseTime(tRes.results || [])
      }
      // 5. Entity breakdown (best-effort).
      if (derived.entityBreakdown && entityColumn) {
        const eRes = await runHuntingQuery(token, derived.entityBreakdown)
        if (eRes.ok) breakdown.byEntity = pfParseEntity(eRes.results || [], entityColumn)
      }
    })(), 85000)
  } catch (err) {
    if (err instanceof Error && err.message === 'PREFLIGHT_TIMEOUT') {
      status = 'timeout'
      errorMessage = 'The query took too long to run'
      errorGuidance = 'Narrow the query or choose a shorter backtest window, then try again.'
    } else {
      status = 'connection_error'
      errorMessage = err instanceof Error ? err.message : 'Pre-flight failed'
      errorGuidance = 'Could not reach Microsoft Graph. Check the integration and try again.'
    }
  }

  const durationMs = Date.now() - startedAt

  const { data: row, error: insErr } = await serviceClient
    .from('detection_preflight_runs')
    .insert({
      user_id: userId,
      integration_id: body.integrationId,
      detection_id: body.detectionId,
      provider: 'defender_xdr',
      window_days: windowDays,
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
    .single()

  if (insErr || !row) {
    return json({ error: 'Pre-flight ran but the result could not be saved' }, 500)
  }
  return json(row)
}

// =============================================================================
// Main Handler
// =============================================================================

serve(async (req: Request) => {
  // Handle CORS preflight
  const preflightResponse = handleCorsPreflight(req)
  if (preflightResponse) return preflightResponse

  const corsHeaders = getCorsHeaders(req)

  try {
    // Auth
    const authHeader = req.headers.get('Authorization')
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return new Response(
        JSON.stringify({ error: 'Missing or invalid authorization header' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    const token = authHeader.replace('Bearer ', '')
    const body: IntegrationRequest = await req.json()
    const nativeDependencies = {
      db: getServiceClient(), credentials: getDecryptedCredentials,
      // One entry per ImportProvider (native-siem-service.ts's Dependencies.token). CrowdStrike,
      // Sentinel and Defender XDR exchange credentials for a bearer token; Chronicle exchanges a
      // signed JWT for one. Splunk and Elastic have no token-issuing endpoint at all -- a static
      // token or HTTP Basic credential IS the auth, so those build the header directly instead of
      // pretending a token step exists.
      token: {
        crowdstrike: async (config: Record<string, unknown>, credentials: Record<string, string>) => ({
          Authorization: `Bearer ${await crowdStrikeGetToken(
            String(config.baseUrl).replace(/\/$/, ''), credentials.clientId, credentials.clientSecret)}`,
        }),
        sentinel: async (config: Record<string, unknown>, credentials: Record<string, string>) => ({
          Authorization: `Bearer ${await microsoftGetToken(
            String(config.tenantId), credentials.clientId, credentials.clientSecret,
            'https://management.azure.com/.default')}`,
        }),
        defender_xdr: async (config: Record<string, unknown>, credentials: Record<string, string>) => ({
          Authorization: `Bearer ${await microsoftGetToken(
            String(config.tenantId), credentials.clientId, credentials.clientSecret, GRAPH_DEFENDER_SCOPE)}`,
        }),
        chronicle: async (_config: Record<string, unknown>, credentials: Record<string, string>) => ({
          Authorization: `Bearer ${await chronicleGetToken(credentials.clientEmail, credentials.privateKey)}`,
        }),
        elastic: async (config: Record<string, unknown>, credentials: Record<string, string>) =>
          (await elasticGetAuth(config, credentials)).headers,
        splunk: async (_config: Record<string, unknown>, credentials: Record<string, string>): Promise<Record<string, string>> =>
          credentials.token ? { Authorization: `Bearer ${credentials.token}` } :
            credentials.username && credentials.password ?
              { Authorization: `Basic ${btoa(`${credentials.username}:${credentials.password}`)}` } : {},
      },
      fetch: vendorFetch, writesEnabled: Deno.env.get('NATIVE_SIEM_MUTATIONS') === 'true',
    }
    if (body.action === 'native_sync_tick') {
      if (!Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || token !== Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')) {
        return corsErrorResponse('Worker authorization required', req, 403)
      }
      const result = await processNativeSync(nativeDependencies)
      if (result.processed) kickNativeWorker()
      return new Response(JSON.stringify(result), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
    }
    const supabaseClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_ANON_KEY') ?? ''
    )

    const { data: { user }, error: authError } = await supabaseClient.auth.getUser(token)
    if (authError || !user) {
      return new Response(
        JSON.stringify({ error: 'Unauthorized' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // Rate limiting
    const { allowed } = await checkRateLimit(
      getServiceClient(),
      `user:${user.id}:fn:integration-ops`,
      30,
      60
    )
    if (!allowed) {
      return corsErrorResponse('Rate limit exceeded. Try again shortly.', req, 429)
    }

    if (!body.action) {
      return new Response(
        JSON.stringify({ error: 'action is required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // C1: RBAC permission check
    const requiredPerm = ACTION_PERMISSIONS[body.action]
    if (requiredPerm) {
      const { allowed } = await checkPermission(user.id, requiredPerm)
      if (!allowed) {
        return new Response(
          JSON.stringify({
            error: 'Permission denied',
            code: 'PERMISSION_DENIED',
            required: requiredPerm,
          }),
          { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        )
      }
    }

    if (body.action.startsWith('native_')) {
      try {
        const result = await handleNativeRequest(nativeDependencies, body, user.id)
        if (['native_sync_start', 'native_inventory_start', 'native_refresh_tracked', 'native_import_start', 'native_import_retry'].includes(body.action)) kickNativeWorker()
        return new Response(JSON.stringify(result), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
      } catch (error) {
        return corsErrorResponse(error instanceof Error ? error.message : 'Native SIEM operation failed', req, 400)
      }
    }

    // A rule Optimus already tracks in a SIEM is UPDATED in place, through the reviewed write
    // path. This used to be a 409 refusal telling the user to go and find another button; the
    // routing is the same question, answered by doing the right thing instead.
    if (['deploy_rule', 'toggle_rule', 'delete_rule', 'delete_vendor_rule'].includes(body.action)) {
      let detectionId = body.detectionId, integrationId = body.integrationId, vendorRuleId = body.vendorRuleId
      if (body.deploymentId) {
        const { data: deployment, error } = await getServiceClient().from('deployment_history')
          .select('detection_id,integration_id,vendor_rule_id').eq('id', body.deploymentId).single()
        if (error) return corsErrorResponse('Deployment not found', req, 404)
        detectionId = deployment.detection_id; integrationId = deployment.integration_id; vendorRuleId = deployment.vendor_rule_id
      }
      // Without a connection there is nothing to resolve the target against, and a resolver that
      // answers from the detection id alone can pick a binding on a connection nobody named.
      if (!integrationId || (!detectionId && !vendorRuleId)) {
        return corsErrorResponse('A connection and a detection or target rule are required', req, 400)
      }
      const resolution = await resolveDeployTarget(getServiceClient(), { detectionId, integrationId, vendorRuleId })
      const decision = deployRouteDecision(resolution, {
        expectedHash: body.expectedHash,
        expectedVersion: body.expectedVersion,
        operation: nativeOperationFor(body.action, body.enabled),
      })
      if (decision.route === 'refuse') return corsErrorResponse(decision.message, req, 409)
      if (decision.route === 'native') {
        try {
          const result = await applyNativeMutation(nativeDependencies, decision.params, user.id)
          // Match the client contract handleDeployRule returns: `data.deployment` must be a
          // defined object after a successful deploy, not the raw { success: true } this route
          // used to send back -- DeployDetectionModal reads fields off it and throws otherwise.
          const { data: deployment, error: deploymentError } = await getServiceClient()
            .from('deployment_history').select('*').eq('id', result.deploymentId).single()
          if (deploymentError || !deployment) return corsErrorResponse('Deployment record not found', req, 500)
          return new Response(JSON.stringify({ deployment }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
        } catch (error) {
          return corsErrorResponse(error instanceof Error ? error.message : 'Production change failed', req, 400)
        }
      }
    }

    // Route to action handler
    // NOTE: each handler is awaited. Returning the promise unawaited would let
    // a handler rejection escape this try/catch — Deno's serve() then emits a
    // bare 500 with no CORS headers, which the browser surfaces as a CORS error.
    switch (body.action) {
      case 'save_credentials':
        return await handleSaveCredentials(body, user.id, corsHeaders)
      case 'test_connection':
        return await handleTestConnection(body, user.id, corsHeaders)
      case 'deploy_rule':
        return await handleDeployRule(body, user.id, corsHeaders)
      case 'list_rules':
        return await handleListRules(body, user.id, corsHeaders)
      case 'delete_rule':
        return await handleDeleteRule(body, user.id, corsHeaders)
      case 'toggle_rule':
        return await handleToggleRule(body, user.id, corsHeaders)
      case 'delete_vendor_rule':
        return await handleDeleteVendorRule(body, user.id, corsHeaders)
      case 'run_preflight':
        return await handleRunPreflight(body, user.id, corsHeaders)
      case 'poll_preflight':
        return await handlePollCrowdStrikePreflight(body, user.id, corsHeaders)
      case 'cancel_preflight':
        return await handleCancelCrowdStrikePreflight(body, user.id, corsHeaders)
      default:
        return new Response(
          JSON.stringify({ error: 'Unknown action' }),
          { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        )
    }
  } catch (err) {
    console.error('Integration-ops error:', err instanceof Error ? err.message : err)
    return new Response(
      JSON.stringify({ error: 'Internal server error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }
})
