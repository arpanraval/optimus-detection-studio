import { serve } from 'https://deno.land/std@0.177.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.3'
import { getCorsHeaders, handleCorsPreflight, corsErrorResponse } from '../_shared/cors.ts'
import { validateUrl } from '../_shared/url-validator.ts'
import { checkRateLimit } from '../_shared/rate-limiter.ts'

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
}

interface ConnectionTestResult {
  success: boolean
  message: string
  latency_ms: number
}

// -- Deployment validation --

type DeployValidationErrorCode =
  | 'DETECTION_NOT_FOUND'
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
    'integrations:view', 'integrations:configure', 'integrations:sync',
  ],
  admin: [
    'integrations:view', 'integrations:configure', 'integrations:sync',
  ],
  lead: [
    'integrations:view', 'integrations:sync',
  ],
  analyst: [
    'integrations:view',
  ],
  viewer: [
    'integrations:view',
  ],
}

const ACTION_PERMISSIONS: Record<Action, GranularPermission> = {
  save_credentials: 'integrations:configure',
  test_connection: 'integrations:configure',
  deploy_rule: 'integrations:sync',
  list_rules: 'integrations:view',
  delete_rule: 'integrations:sync',
  toggle_rule: 'integrations:sync',
  delete_vendor_rule: 'integrations:sync',
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
    .select('id, user_id, name, description, status, detectionQuery, queryLanguage, queries, qualityScore, mitreTactics, mitreTechniques, version')
    .eq('id', detectionId)
    .single()

  if (detError || !detection) {
    errors.push({ code: 'DETECTION_NOT_FOUND', message: 'Detection not found' })
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

  const response = await withRetry(() =>
    vendorFetch(
      `${baseUrl}/saved/searches?output_mode=json&count=0&search=action.correlationsearch.enabled%3D1`,
      { method: 'GET', headers }
    )
  )

  if (!response.ok) {
    throw new Error(`Splunk list rules failed: ${response.status}`)
  }

  const data = await response.json()
  return (data.entry || []).map((e: any) => ({
    name: e.name,
    id: e.name,
    search: e.content?.search,
    cronSchedule: e.content?.cron_schedule,
    enabled: !e.content?.disabled,
    updated: e.updated,
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

  const response = await withRetry(() =>
    vendorFetch(`${baseUrl}?api-version=2025-06-01`, {
      method: 'GET',
      headers: { 'Authorization': `Bearer ${token}`, 'Accept': 'application/json' },
    })
  )

  if (!response.ok) throw new Error(`Sentinel list rules failed: ${response.status}`)
  const data = await response.json()
  return (data.value || []).map((r: any) => ({
    id: r.name,
    name: r.properties?.displayName,
    kind: r.kind,
    severity: r.properties?.severity,
    enabled: r.properties?.enabled,
    query: r.properties?.query,
  }))
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

// -- Defender XDR --
async function defenderXdrTestConnection(
  config: Record<string, unknown>,
  credentials: Record<string, string>
): Promise<ConnectionTestResult> {
  const tenantId = config.tenantId as string
  const start = Date.now()

  const token = await microsoftGetToken(
    tenantId,
    credentials.clientId,
    credentials.clientSecret,
    'https://api.security.microsoft.com/.default'
  )

  const response = await withRetry(() =>
    vendorFetch('https://api.security.microsoft.com/api/customdetections?$top=1', {
      method: 'GET',
      headers: { 'Authorization': `Bearer ${token}`, 'Accept': 'application/json' },
    })
  )
  const latency = Date.now() - start

  if (!response.ok) {
    const text = await response.text()
    return { success: false, message: `Defender XDR error ${response.status}: ${text.slice(0, 200)}`, latency_ms: latency }
  }

  return { success: true, message: 'Connected to Microsoft Defender XDR', latency_ms: latency }
}

async function defenderXdrListRules(
  config: Record<string, unknown>,
  credentials: Record<string, string>
): Promise<unknown[]> {
  const tenantId = config.tenantId as string
  const token = await microsoftGetToken(tenantId, credentials.clientId, credentials.clientSecret, 'https://api.security.microsoft.com/.default')

  const response = await withRetry(() =>
    vendorFetch('https://api.security.microsoft.com/api/customdetections', {
      method: 'GET',
      headers: { 'Authorization': `Bearer ${token}`, 'Accept': 'application/json' },
    })
  )

  if (!response.ok) throw new Error(`Defender XDR list rules failed: ${response.status}`)
  const data = await response.json()
  return (data.value || []).map((r: any) => ({
    id: r.id,
    name: r.displayName,
    query: r.queryCondition?.queryText,
    frequency: r.frequency,
    enabled: r.isEnabled,
  }))
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
  const token = await microsoftGetToken(tenantId, credentials.clientId, credentials.clientSecret, 'https://api.security.microsoft.com/.default')

  const baseUrl = 'https://api.security.microsoft.com/api/customdetections'
  const headers = { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' }

  if (action === 'delete' && vendorRuleId) {
    const response = await withRetry(() =>
      vendorFetch(`${baseUrl}/${vendorRuleId}`, { method: 'DELETE', headers })
    )
    if (!response.ok) throw new Error(`Defender XDR delete failed: ${response.status}`)
    return { vendorRuleId, response: { deleted: true } }
  }

  const body: Record<string, unknown> = {
    displayName: (ruleConfig.name as string) || `Optimus Detection`,
    description: (ruleConfig.description as string) || 'Deployed from Optimus Detection Studio',
    isEnabled: true,
    queryCondition: { queryText: query },
    frequency: (ruleConfig.frequency as string) || '24h',
  }

  if (action === 'create') {
    const response = await withRetry(() =>
      vendorFetch(baseUrl, { method: 'POST', headers, body: JSON.stringify(body) })
    )
    if (!response.ok) {
      const text = await response.text()
      throw new Error(`Defender XDR create failed: ${response.status} - ${text.slice(0, 300)}`)
    }
    const data = await response.json()
    return { vendorRuleId: data.id, response: data }
  }

  // Update
  if (vendorRuleId) {
    const response = await withRetry(() =>
      vendorFetch(`${baseUrl}/${vendorRuleId}`, { method: 'PATCH', headers, body: JSON.stringify(body) })
    )
    if (!response.ok) {
      const text = await response.text()
      throw new Error(`Defender XDR update failed: ${response.status} - ${text.slice(0, 300)}`)
    }
    const data = await response.json()
    return { vendorRuleId: data.id || vendorRuleId, response: data }
  }

  throw new Error('vendorRuleId required for update action')
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

async function elasticListRules(
  config: Record<string, unknown>,
  credentials: Record<string, string>
): Promise<unknown[]> {
  const { baseUrl, headers } = await elasticGetAuth(config, credentials)

  const allRules: unknown[] = []
  let page = 1
  const perPage = 50

  while (true) {
    const response = await withRetry(() =>
      vendorFetch(`${baseUrl}/api/detection_engine/rules/_find?per_page=${perPage}&page=${page}`, { method: 'GET', headers })
    )
    if (!response.ok) throw new Error(`Elastic list rules failed: ${response.status}`)
    const data = await response.json()
    const rules = (data.data || []).map((r: any) => ({
      id: r.id,
      ruleId: r.rule_id,
      name: r.name,
      type: r.type,
      language: r.language,
      query: r.query,
      severity: r.severity,
      enabled: r.enabled,
    }))
    allRules.push(...rules)
    if (allRules.length >= (data.total || 0)) break
    page++
  }

  return allRules
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

  const allRules: unknown[] = []
  let pageToken = ''

  while (true) {
    const url = pageToken
      ? `${baseUrl}?pageSize=100&pageToken=${encodeURIComponent(pageToken)}`
      : `${baseUrl}?pageSize=100`

    const response = await withRetry(() =>
      vendorFetch(url, { method: 'GET', headers })
    )
    if (!response.ok) throw new Error(`Chronicle list rules failed: ${response.status}`)

    const data = await response.json()
    const rules = (data.rules || []).map((r: any) => ({
      id: r.name?.split('/').pop() || r.ruleId,
      name: r.ruleName || r.metadata?.description || 'Unnamed Rule',
      query: r.ruleText,
      enabled: r.liveRuleEnabled ?? false,
      severity: r.metadata?.severity,
      description: r.metadata?.description,
      lastModified: r.revisionCreateTime,
    }))
    allRules.push(...rules)

    if (!data.nextPageToken) break
    pageToken = data.nextPageToken
  }

  return allRules
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

    // Allowlist config fields to prevent mass assignment
    const ALLOWED_CONFIG_KEYS = [
      'host', 'port', 'ssl', 'spaceId', 'baseUrl', 'region',
      'index', 'workspace', 'tenant', 'apiUrl', 'environment',
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
        JSON.stringify({ error: 'Failed to create integration', details: intError.message }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    integrationId = integration.id
  } else {
    // Update existing integration config
    if (body.config || body.name) {
      const updates: Record<string, unknown> = {}
      if (body.config) updates.config = body.config
      if (body.name) updates.name = body.name

      const { error: updateError } = await serviceClient
        .from('integrations')
        .update(updates)
        .eq('id', integrationId)
        .eq('user_id', userId)

      if (updateError) {
        return new Response(
          JSON.stringify({ error: 'Failed to update integration', details: updateError.message }),
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
        JSON.stringify({ error: 'Failed to save credentials', details: credError.message }),
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
    result = { success: false, message: err instanceof Error ? err.message : 'Connection test failed', latency_ms: 0 }
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
      JSON.stringify({ error: 'Failed to create deployment record', details: depError.message }),
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
    const errorMessage = err instanceof Error ? err.message : 'Deployment failed'
    const completedAt = new Date().toISOString()
    const durationMs = new Date(completedAt).getTime() - new Date(startedAt).getTime()

    await serviceClient
      .from('deployment_history')
      .update({
        status: 'failed',
        error_message: errorMessage,
        completed_at: completedAt,
        duration_ms: durationMs,
      })
      .eq('id', deployment.id)

    return new Response(
      JSON.stringify({ error: errorMessage, deployment: { ...deployment, status: 'failed', error_message: errorMessage } }),
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
    const errorMessage = err instanceof Error ? err.message : 'Delete failed'
    return new Response(
      JSON.stringify({ error: errorMessage }),
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
        const token = await microsoftGetToken(tenantId, credentials.clientId, credentials.clientSecret, 'https://api.security.microsoft.com/.default')
        const response = await withRetry(() =>
          vendorFetch(`https://api.security.microsoft.com/api/customdetections/${body.vendorRuleId}`, {
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
      JSON.stringify({ error: err instanceof Error ? err.message : 'Toggle failed' }),
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
      JSON.stringify({ error: err instanceof Error ? err.message : 'Delete failed' }),
      { status: 502, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }
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

    // Parse body
    const body: IntegrationRequest = await req.json()

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

    // Route to action handler
    switch (body.action) {
      case 'save_credentials':
        return handleSaveCredentials(body, user.id, corsHeaders)
      case 'test_connection':
        return handleTestConnection(body, user.id, corsHeaders)
      case 'deploy_rule':
        return handleDeployRule(body, user.id, corsHeaders)
      case 'list_rules':
        return handleListRules(body, user.id, corsHeaders)
      case 'delete_rule':
        return handleDeleteRule(body, user.id, corsHeaders)
      case 'toggle_rule':
        return handleToggleRule(body, user.id, corsHeaders)
      case 'delete_vendor_rule':
        return handleDeleteVendorRule(body, user.id, corsHeaders)
      default:
        return new Response(
          JSON.stringify({ error: `Unknown action: ${body.action}` }),
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
