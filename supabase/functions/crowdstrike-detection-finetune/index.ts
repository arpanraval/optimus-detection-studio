import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { getCorsHeaders, handleCorsPreflight } from '../_shared/cors.ts'
import { checkRateLimit } from '../_shared/rate-limiter.ts'
import {
  createSession,
  customToolResult,
  interrupt,
  listEvents,
  sendEvents,
  userMessage,
} from '../_shared/managed-agents.ts'
import {
  buildCrowdStrikeKickoffMessage,
  capCrowdStrikeFinetuneResult,
  normalizeCrowdStrikeEvents,
  validateCrowdStrikeLadder,
} from '../_shared/crowdstrike-finetune-logic.ts'
import {
  decryptCrowdStrikeCredentials,
  getCrowdStrikeToken,
  runCrowdStrikeFinetuneQuery,
  validateBoundedCrowdStrikeCql,
} from '../_shared/crowdstrike-finetune-query.ts'
import {
  isCrowdStrikeQueryRepository,
} from '../_shared/crowdstrike-preflight.ts'
import { selectSiemQuery } from '../_shared/siem-query-selection.ts'

declare const Deno: {
  env: { get(key: string): string | undefined }
  serve(handler: (req: Request) => Promise<Response>): void
}

const QUERY_BUDGET = 8
const RUN_TIMEOUT_MS = 8 * 60 * 1000
const NUDGE_MS = 6 * 60 * 1000
const ANTHROPIC_INPUT_COST = 5 / 1_000_000
const ANTHROPIC_OUTPUT_COST = 25 / 1_000_000

// Supabase is instantiated without generated Database types in the Edge runtime.
// deno-lint-ignore no-explicit-any
type AdminClient = any

interface RequestBody {
  action: 'start' | 'poll' | 'tool' | 'cancel'
  detectionId?: string
  integrationId?: string
  preflightRunId?: string
  runId?: string
  toolUseId?: string
}

const ROLE_PERMISSIONS: Record<string, string[]> = {
  owner: ['integrations:sync'],
  admin: ['integrations:sync'],
  lead: ['integrations:sync'],
  analyst: [],
  viewer: [],
}

async function canSyncIntegrations(admin: AdminClient, userId: string): Promise<boolean> {
  const { data } = await admin
    .from('profiles')
    .select('role, permission_overrides')
    .eq('id', userId)
    .single()
  const role = String(data?.role ?? 'viewer')
  const permissions = new Set(ROLE_PERMISSIONS[role] ?? [])
  const overrides = (data?.permission_overrides ?? {}) as {
    granted?: string[]
    revoked?: string[]
  }
  overrides.granted?.forEach((permission) => permissions.add(permission))
  overrides.revoked?.forEach((permission) => permissions.delete(permission))
  return permissions.has('integrations:sync')
}

function json(data: unknown, req: Request, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...getCorsHeaders(req), 'Content-Type': 'application/json' },
  })
}

async function loadCredentials(
  admin: AdminClient,
  integrationId: string,
): Promise<Record<string, string>> {
  const { data, error } = await admin
    .from('integration_credentials')
    .select('encrypted_data')
    .eq('integration_id', integrationId)
    .order('created_at', { ascending: false })
    .limit(1)
    .single()
  if (error || !data) throw new Error('CrowdStrike integration credentials were not found.')
  return decryptCrowdStrikeCredentials(String(data.encrypted_data))
}

async function integrationAccess(
  admin: AdminClient,
  integrationId: string,
  userId: string,
): Promise<{
  baseUrl: string
  repository: string
  credentials: Record<string, string>
}> {
  const { data, error } = await admin
    .from('integrations')
    .select('id, provider, status, user_id, config')
    .eq('id', integrationId)
    .single()
  if (error || !data) throw new Error('CrowdStrike integration was not found.')
  if (data.user_id !== userId || data.provider !== 'crowdstrike') {
    throw new Error('Invalid CrowdStrike integration.')
  }
  if (data.status !== 'connected') throw new Error('CrowdStrike integration is not connected.')
  const config = (data.config ?? {}) as Record<string, unknown>
  const baseUrl = String(config.baseUrl ?? '').replace(/\/+$/u, '')
  const repository = String(config.repository ?? 'search-all')
  if (!baseUrl) throw new Error('CrowdStrike API base URL is missing.')
  if (!isCrowdStrikeQueryRepository(repository)) throw new Error('CrowdStrike NGSIEM repository is invalid.')
  return {
    baseUrl,
    repository,
    credentials: await loadCredentials(admin, integrationId),
  }
}

async function handleStart(
  body: RequestBody,
  userId: string,
  admin: AdminClient,
  req: Request,
): Promise<Response> {
  if (!body.detectionId || !body.integrationId || !body.preflightRunId) {
    return json({ error: 'detectionId, integrationId, and preflightRunId are required.' }, req, 400)
  }
  if (!await canSyncIntegrations(admin, userId)) {
    return json({ error: 'CrowdStrike finetuning requires integrations:sync.' }, req, 403)
  }
  const rateLimit = await checkRateLimit(admin, `user:${userId}:crowdstrike-finetune-start`, 5, 3600)
  if (!rateLimit.allowed) return json({ error: 'CrowdStrike finetuning is limited to 5 runs per hour.' }, req, 429)

  const { data: existing } = await admin
    .from('crowdstrike_finetune_runs')
    .select('id, anthropic_session_id, integration_id')
    .eq('detection_id', body.detectionId)
    .eq('user_id', userId)
    .eq('status', 'running')
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()
  if (existing) {
    if (existing.integration_id !== body.integrationId) {
      return json({ error: 'A fine-tuning run is active on another integration. Finish or cancel it first.' }, req, 409)
    }
    return json({ runId: existing.id, sessionId: existing.anthropic_session_id, resumed: true }, req)
  }

  const { data: detection, error: detectionError } = await admin
    .from('detections')
    .select('id, name, user_id, queries, queryLanguage, detectionQuery')
    .eq('id', body.detectionId)
    .single()
  if (detectionError || !detection) return json({ error: 'Detection not found.' }, req, 404)
  if (detection.user_id !== userId) return json({ error: 'You can only finetune your own detections.' }, req, 403)
  const { data: bindings, error: bindingError } = await admin.from('siem_rule_bindings')
    .select('selected_query_id').eq('detection_id', body.detectionId)
    .eq('integration_id', body.integrationId).eq('binding_status', 'active')
  if (bindingError) return json({ error: 'Could not resolve the tracked query.' }, req, 500)
  let cql: string | null
  try {
    cql = selectSiemQuery(detection, 'CQL', (bindings ?? []).map((binding: { selected_query_id: string }) => binding.selected_query_id))
  } catch (error) {
    return json({ error: error instanceof Error ? error.message : 'Invalid tracked query.' }, req, 400)
  }
  if (!cql) return json({ error: 'This detection has no CrowdStrike CQL query to finetune.' }, req, 400)

  const { data: preflight, error: preflightError } = await admin
    .from('detection_preflight_runs')
    .select('id, user_id, integration_id, detection_id, provider, status, validation_passed, hit_count, sample, window_days, query_text')
    .eq('id', body.preflightRunId)
    .single()
  if (preflightError || !preflight) return json({ error: 'CrowdStrike pre-flight run not found.' }, req, 404)
  if (
    preflight.user_id !== userId ||
    preflight.integration_id !== body.integrationId ||
    preflight.detection_id !== body.detectionId ||
    preflight.provider !== 'crowdstrike' ||
    preflight.status !== 'success' ||
    preflight.validation_passed !== true ||
    preflight.query_text !== cql ||
    typeof preflight.hit_count !== 'number'
  ) {
    return json({ error: 'A successful matching CrowdStrike pre-flight run is required.' }, req, 400)
  }

  let access: Awaited<ReturnType<typeof integrationAccess>>
  try {
    access = await integrationAccess(admin, body.integrationId, userId)
    await getCrowdStrikeToken(access.baseUrl, access.credentials.clientId, access.credentials.clientSecret)
  } catch (error) {
    return json({ error: error instanceof Error ? error.message : 'Could not reach CrowdStrike.' }, req, 502)
  }

  const agentId = Deno.env.get('CROWDSTRIKE_FINETUNE_AGENT_ID')
  const environmentId = Deno.env.get('CROWDSTRIKE_FINETUNE_ENVIRONMENT_ID')
  if (!agentId || !environmentId) {
    return json({ error: 'CrowdStrike finetuning agent is not provisioned.' }, req, 500)
  }
  const sessionId = await createSession(agentId, environmentId, `CrowdStrike finetune: ${detection.name}`)
  await sendEvents(sessionId, [userMessage(buildCrowdStrikeKickoffMessage({
    detectionName: String(detection.name),
    repository: access.repository,
    windowDays: Number(preflight.window_days),
    baselineHitCount: Number(preflight.hit_count),
    originalQuery: cql,
    sample: preflight.sample,
  }))])

  const { data: run, error: insertError } = await admin
    .from('crowdstrike_finetune_runs')
    .insert({
      user_id: userId,
      detection_id: body.detectionId,
      integration_id: body.integrationId,
      preflight_run_id: body.preflightRunId,
      anthropic_session_id: sessionId,
      repository: access.repository,
      window_days: Number(preflight.window_days),
      original_query: cql,
      baseline_hit_count: Number(preflight.hit_count),
    })
    .select('id')
    .single()
  if (insertError) {
    if ((insertError as { code?: string }).code === '23505') {
      const { data: duplicate } = await admin
        .from('crowdstrike_finetune_runs')
        .select('id, anthropic_session_id, integration_id')
        .eq('detection_id', body.detectionId)
        .eq('user_id', userId)
        .eq('status', 'running')
        .maybeSingle()
      try { await sendEvents(sessionId, [interrupt()]) } catch { /* best effort */ }
      if (duplicate && duplicate.integration_id === body.integrationId) {
        return json({
          runId: duplicate.id,
          sessionId: duplicate.anthropic_session_id,
          resumed: true,
        }, req)
      }
    }
    try { await sendEvents(sessionId, [interrupt()]) } catch { /* best effort */ }
    return json({ error: 'Failed to create the CrowdStrike finetuning run.' }, req, 500)
  }
  if (!run) return json({ error: 'Failed to create the CrowdStrike finetuning run.' }, req, 500)
  return json({ runId: run.id, sessionId }, req)
}

async function resolveQueryTool(args: {
  admin: AdminClient
  req: Request
  run: Record<string, unknown>
  toolUseId: string
  toolInput: Record<string, unknown>
}): Promise<Response> {
  const { admin, req, run, toolUseId, toolInput } = args
  const query = String(toolInput.query ?? '').trim()
  const purpose = String(toolInput.purpose ?? 'Investigating CrowdStrike NGSIEM events').trim()
  const validationError = validateBoundedCrowdStrikeCql(query)
  if (validationError) {
    await sendEvents(String(run.anthropic_session_id), [
      customToolResult(toolUseId, JSON.stringify({
        error: 'unbounded_or_invalid_query',
        guidance: validationError,
      }), true),
    ])
    return json({ status: 'running' }, req)
  }

  const { data: priorJob } = await admin
    .from('crowdstrike_finetune_query_jobs')
    .select('id, status, result_sample, error_message')
    .eq('run_id', run.id)
    .eq('tool_use_id', toolUseId)
    .maybeSingle()
  if (priorJob) {
    if (priorJob.status === 'completed' && priorJob.result_sample) {
      await sendEvents(String(run.anthropic_session_id), [
        customToolResult(toolUseId, JSON.stringify(priorJob.result_sample), false),
      ])
    } else {
      await sendEvents(String(run.anthropic_session_id), [
        customToolResult(toolUseId, JSON.stringify({
          error: 'previous_query_interrupted',
          message: priorJob.error_message ?? 'The previous NGSIEM query call did not complete.',
          guidance: 'Issue a new bounded query and continue the investigation.',
        }), true),
      ])
    }
    return json({ status: 'running' }, req)
  }

  const { data: reserved } = await admin.rpc('reserve_crowdstrike_finetune_query_slot', {
    p_run_id: run.id,
    p_budget: QUERY_BUDGET,
  })
  if (reserved == null) {
    await sendEvents(String(run.anthropic_session_id), [
      customToolResult(toolUseId, JSON.stringify({
        error: 'query_budget_exhausted',
        guidance: 'Submit the CrowdStrike refinement ladder now using the evidence already gathered.',
      }), false),
    ])
    return json({ status: 'running' }, req)
  }

  const { data: job, error: jobError } = await admin
    .from('crowdstrike_finetune_query_jobs')
    .insert({
      run_id: run.id,
      tool_use_id: toolUseId,
      purpose,
      query_text: query,
      repository: run.repository,
      status: 'queued',
    })
    .select('id')
    .single()
  if (jobError || !job) {
    await sendEvents(String(run.anthropic_session_id), [
      customToolResult(toolUseId, JSON.stringify({
        error: 'query_audit_failed',
        guidance: 'The query was not executed because its audit record could not be created.',
      }), true),
    ])
    return json({ status: 'running' }, req)
  }

  try {
    const access = await integrationAccess(admin, String(run.integration_id), String(run.user_id))
    const token = await getCrowdStrikeToken(
      access.baseUrl,
      access.credentials.clientId,
      access.credentials.clientSecret,
    )
    await admin
      .from('crowdstrike_finetune_query_jobs')
      .update({ status: 'running', updated_at: new Date().toISOString() })
      .eq('id', job.id)

    const result = await runCrowdStrikeFinetuneQuery({
      baseUrl: access.baseUrl,
      repository: String(run.repository),
      token,
      query,
      windowDays: Number(run.window_days),
    })
    const capped = capCrowdStrikeFinetuneResult(result.events)
    await admin
      .from('crowdstrike_finetune_query_jobs')
      .update({
        provider_job_id: result.jobId,
        status: 'completed',
        row_count: capped.row_count,
        result_sample: capped,
        completed_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq('id', job.id)
    await sendEvents(String(run.anthropic_session_id), [
      customToolResult(toolUseId, JSON.stringify({
        ...capped,
        repository: run.repository,
        window_days: run.window_days,
      }), false),
    ])
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    await admin
      .from('crowdstrike_finetune_query_jobs')
      .update({
        status: 'failed',
        error_message: message.slice(0, 1000),
        completed_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq('id', job.id)
    await sendEvents(String(run.anthropic_session_id), [
      customToolResult(toolUseId, JSON.stringify({
        error: 'crowdstrike_query_failed',
        message,
        guidance: 'Fix or narrow the CQL query, then try another bounded NGSIEM query.',
      }), true),
    ])
  }
  return json({ status: 'running' }, req)
}

async function handleTool(
  body: RequestBody,
  userId: string,
  admin: AdminClient,
  req: Request,
): Promise<Response> {
  if (!body.runId || !body.toolUseId) {
    return json({ error: 'runId and toolUseId are required.' }, req, 400)
  }
  const { data: run, error } = await admin
    .from('crowdstrike_finetune_runs')
    .select('*')
    .eq('id', body.runId)
    .single()
  if (error || !run) return json({ error: 'CrowdStrike finetuning run not found.' }, req, 404)
  if (run.user_id !== userId) return json({ error: 'Forbidden.' }, req, 403)
  if (run.status !== 'running') return json({ status: run.status }, req)

  const events = await listEvents(String(run.anthropic_session_id))
  const toolEvent = events.find(
    (event) => event.type === 'agent.custom_tool_use' && event.id === body.toolUseId,
  )
  const resolved = events.some(
    (event) => event.type === 'user.custom_tool_result' && event.custom_tool_use_id === body.toolUseId,
  )
  if (!toolEvent || resolved) return json({ status: 'running', note: 'tool already resolved or unknown' }, req)

  const toolName = String(toolEvent.name ?? '')
  const toolInput = (toolEvent.input ?? {}) as Record<string, unknown>
  if (toolName === 'run_ngsiem_query') {
    return resolveQueryTool({ admin, req, run, toolUseId: body.toolUseId, toolInput })
  }
  if (toolName === 'submit_crowdstrike_refinement_ladder') {
    const validation = validateCrowdStrikeLadder(toolInput)
    if (!validation.ok) {
      await sendEvents(String(run.anthropic_session_id), [
        customToolResult(
          body.toolUseId,
          `Ladder rejected: ${validation.reason} Fix it and submit again.`,
          true,
        ),
      ])
      return json({ status: 'running' }, req)
    }
    const { error: saveError } = await admin
      .from('crowdstrike_finetune_runs')
      .update({
        result: validation.ladder,
        status: 'completed',
        completed_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq('id', run.id)
    if (saveError) {
      await sendEvents(String(run.anthropic_session_id), [
        customToolResult(body.toolUseId, 'The CQL refinement ladder could not be saved. Submit it again.', true),
      ])
      return json({ status: 'running' }, req)
    }
    await sendEvents(String(run.anthropic_session_id), [
      customToolResult(body.toolUseId, 'CrowdStrike CQL refinement ladder saved. End your turn.', false),
    ])
    return json({ status: 'completed' }, req)
  }

  await sendEvents(String(run.anthropic_session_id), [
    customToolResult(body.toolUseId, `Unknown CrowdStrike finetuning tool: ${toolName}.`, true),
  ])
  return json({ status: 'running' }, req)
}

async function handlePoll(
  body: RequestBody,
  userId: string,
  admin: AdminClient,
  req: Request,
): Promise<Response> {
  if (!body.runId) return json({ error: 'runId is required.' }, req, 400)
  const { data: run, error } = await admin
    .from('crowdstrike_finetune_runs')
    .select('*')
    .eq('id', body.runId)
    .single()
  if (error || !run) return json({ error: 'CrowdStrike finetuning run not found.' }, req, 404)
  if (run.user_id !== userId) return json({ error: 'Forbidden.' }, req, 403)

  const sessionId = String(run.anthropic_session_id ?? '')
  const events = sessionId ? await listEvents(sessionId) : []
  const normalized = normalizeCrowdStrikeEvents(events)
  let status = String(run.status)
  let result = run.result
  let usage = run.usage
  const elapsed = Date.now() - new Date(String(run.created_at)).getTime()
  if (status === 'running' && elapsed > RUN_TIMEOUT_MS) {
    status = 'failed'
    await admin
      .from('crowdstrike_finetune_runs')
      .update({
        status: 'failed',
        error_message: 'timeout',
        updated_at: new Date().toISOString(),
      })
      .eq('id', run.id)
    if (sessionId) {
      try { await sendEvents(sessionId, [interrupt()]) } catch { /* best effort */ }
    }
  } else if (status === 'running' && elapsed > NUDGE_MS && run.nudged !== true) {
    await sendEvents(sessionId, [userMessage(
      'Time is nearly up. Submit the best measured CrowdStrike CQL refinement ladder now.',
    )])
    await admin.from('crowdstrike_finetune_runs').update({ nudged: true }).eq('id', run.id)
  }

  if (status === 'running') {
    const { data: fresh } = await admin
      .from('crowdstrike_finetune_runs')
      .select('status, result, usage')
      .eq('id', run.id)
      .maybeSingle()
    if (fresh) {
      status = String(fresh.status)
      result = fresh.result
      usage = fresh.usage
    }
  }

  if ((status === 'completed' || status === 'failed') && !usage) {
    const costUsd =
      normalized.usage.input_tokens * ANTHROPIC_INPUT_COST +
      normalized.usage.output_tokens * ANTHROPIC_OUTPUT_COST
    const persistedUsage = {
      ...normalized.usage,
      cost_usd: Number(costUsd.toFixed(6)),
    }
    const { data: claimed } = await admin
      .from('crowdstrike_finetune_runs')
      .update({ usage: persistedUsage })
      .eq('id', run.id)
      .is('usage', null)
      .select('id')
      .maybeSingle()
    if (claimed) {
      const { error: telemetryError } = await admin.from('ai_usage_events').insert({
        user_id: run.user_id,
        feature: 'crowdstrike-detection-finetune',
        model: 'claude-opus-5',
        provider: 'anthropic',
        category: 'llm',
        input_tokens: normalized.usage.input_tokens,
        output_tokens: normalized.usage.output_tokens,
        cached_input_tokens: normalized.usage.cache_read_input_tokens,
        cost_usd: persistedUsage.cost_usd,
        status: status === 'completed' ? 'success' : 'provider_error',
      })
      if (telemetryError) console.error('CrowdStrike finetuning usage logging failed:', telemetryError)
      usage = persistedUsage
    }
  }

  return json({
    status,
    timeline: normalized.timeline,
    pendingTools: status === 'running' ? normalized.pendingTools : [],
    queryCount: normalized.queryCount,
    result: result ?? null,
    usage: usage ?? null,
  }, req)
}

async function handleCancel(
  body: RequestBody,
  userId: string,
  admin: AdminClient,
  req: Request,
): Promise<Response> {
  if (!body.runId) return json({ error: 'runId is required.' }, req, 400)
  const { data: run, error } = await admin
    .from('crowdstrike_finetune_runs')
    .select('id, user_id, status, anthropic_session_id')
    .eq('id', body.runId)
    .single()
  if (error || !run) return json({ error: 'CrowdStrike finetuning run not found.' }, req, 404)
  if (run.user_id !== userId) return json({ error: 'Forbidden.' }, req, 403)
  if (run.status === 'running' && run.anthropic_session_id) {
    try { await sendEvents(String(run.anthropic_session_id), [interrupt()]) } catch { /* best effort */ }
  }
  await admin
    .from('crowdstrike_finetune_runs')
    .update({ status: 'cancelled', updated_at: new Date().toISOString() })
    .eq('id', run.id)
    .eq('status', 'running')
  return json({ status: 'cancelled' }, req)
}

Deno.serve(async (req: Request) => {
  const preflight = handleCorsPreflight(req)
  if (preflight) return preflight

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')
    const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
    const anonKey = Deno.env.get('SUPABASE_ANON_KEY')
    if (!supabaseUrl || !serviceKey || !anonKey) throw new Error('Supabase environment is incomplete.')

    const admin = createClient(supabaseUrl, serviceKey)
    const userClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: req.headers.get('Authorization') ?? '' } },
    })
    const { data: { user }, error: userError } = await userClient.auth.getUser()
    if (userError || !user) return json({ error: 'Authentication failed.' }, req, 401)

    const body = await req.json() as RequestBody
    switch (body.action) {
      case 'start':
        return handleStart(body, user.id, admin, req)
      case 'poll':
        return handlePoll(body, user.id, admin, req)
      case 'tool':
        return handleTool(body, user.id, admin, req)
      case 'cancel':
        return handleCancel(body, user.id, admin, req)
      default:
        return json({ error: `Unknown action: ${String(body.action)}` }, req, 400)
    }
  } catch (error) {
    console.error('crowdstrike-detection-finetune error:', error)
    return json({ error: error instanceof Error ? error.message : 'Internal error' }, req, 500)
  }
})
