/**
 * Detection Finetuning Edge Function
 *
 * Host-side orchestrator for the agentic AI detection-finetuning feature.
 * Actions: start | poll | tool | cancel. See
 * docs/plans/2026-05-22-ai-finetuning-helper-design.md.
 */

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { getCorsHeaders, handleCorsPreflight } from '../_shared/cors.ts';
import { decryptCredentials, getGraphToken, runHuntingQuery } from '../_shared/defender-hunting.ts';
import { createSession, sendEvents, listEvents, userMessage, customToolResult, interrupt } from '../_shared/managed-agents.ts';
import { buildKickoffMessage, capHuntingResult, mapHuntingError, validateLadder, normalizeEvents } from '../_shared/finetune-logic.ts';
import { checkPermission } from '../_shared/permissions.ts';
import { checkRateLimit } from '../_shared/rate-limiter.ts';

declare const Deno: {
  env: { get(key: string): string | undefined };
  serve(handler: (req: Request) => Promise<Response>): void;
};

const QUERY_BUDGET = 12;
const WINDOW_MAX = 30;
const RUN_TIMEOUT_MS = 6 * 60 * 1000;

type SupabaseClient = ReturnType<typeof createClient>;

interface ReqBody {
  action: 'start' | 'poll' | 'tool' | 'cancel';
  detectionId?: string;
  integrationId?: string;
  windowDays?: number;
  preflightRunId?: string;
  runId?: string;
  toolUseId?: string;
}

function json(data: unknown, req: Request, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...getCorsHeaders(req), 'Content-Type': 'application/json' },
  });
}

/** Picks the first KQL query from a detection row (mirrors integration-ops pickKqlQuery). */
function pickKqlQuery(d: {
  queries?: { language?: string; query?: string }[];
  queryLanguage?: string;
  detectionQuery?: string;
}): string | null {
  const fromArray = (d.queries || []).find(
    (q) => q.language && q.language.toUpperCase() === 'KQL' && q.query && q.query.trim() !== '',
  );
  if (fromArray?.query) return fromArray.query;
  if (d.detectionQuery && d.detectionQuery.trim() !== '' &&
      d.queryLanguage && d.queryLanguage.toUpperCase() === 'KQL') {
    return d.detectionQuery;
  }
  return null;
}

/** Loads + decrypts the Defender credentials for an integration; returns a Graph token. */
async function defenderToken(admin: SupabaseClient, integrationId: string): Promise<string> {
  const { data: integration, error: iErr } = await admin
    .from('integrations')
    .select('id, provider, status, config, user_id')
    .eq('id', integrationId)
    .single();
  if (iErr || !integration) throw new Error('Integration not found.');
  const { data: credRow, error: cErr } = await admin
    .from('integration_credentials')
    .select('encrypted_data')
    .eq('integration_id', integrationId)
    .single();
  if (cErr || !credRow) throw new Error('Integration credentials not found.');
  const creds = await decryptCredentials(credRow.encrypted_data as string);
  const tenantId = (integration.config as Record<string, unknown> | null)?.tenantId as string;
  if (!tenantId || !creds.clientId || !creds.clientSecret) {
    throw new Error('Integration is missing tenantId / clientId / clientSecret.');
  }
  return getGraphToken(tenantId, creds.clientId, creds.clientSecret);
}

async function handleStart(body: ReqBody, userId: string, admin: SupabaseClient, req: Request): Promise<Response> {
  if (!body.detectionId || !body.integrationId) {
    return json({ error: 'detectionId and integrationId are required.' }, req, 400);
  }

  // RBAC — finetuning runs arbitrary KQL against the production SIEM, exactly like
  // run_preflight, which requires integrations:sync (a deliberate product decision).
  const { allowed: hasPerm } = await checkPermission(admin, userId, 'integrations:sync');
  if (!hasPerm) {
    return json({ error: 'Permission denied — finetuning requires integrations:sync.' }, req, 403);
  }

  // Rate limit — an Opus 4.7 agent session is expensive; cap new runs per user.
  const { allowed: underLimit } = await checkRateLimit(admin, `user:${userId}:finetune-start`, 5, 3600);
  if (!underLimit) {
    return json({ error: 'Finetuning rate limit reached — you can start 5 runs per hour.' }, req, 429);
  }

  // Detection: load via service role, verify the caller owns it.
  const { data: detection, error: dErr } = await admin
    .from('detections')
    .select('id, name, user_id, queries, queryLanguage, detectionQuery')
    .eq('id', body.detectionId)
    .single();
  if (dErr || !detection) return json({ error: 'Detection not found.' }, req, 404);
  if (detection.user_id !== userId) {
    return json({ error: 'You can only finetune your own detections.' }, req, 403);
  }

  const kql = pickKqlQuery(detection);
  if (!kql) return json({ error: 'This detection has no KQL query to finetune.' }, req, 400);

  // Integration ownership.
  const { data: integration, error: iErr } = await admin
    .from('integrations')
    .select('id, provider, status, user_id')
    .eq('id', body.integrationId)
    .single();
  if (iErr || !integration) return json({ error: 'Integration not found.' }, req, 404);
  if (integration.user_id !== userId || integration.provider !== 'defender_xdr') {
    return json({ error: 'Invalid Defender XDR integration.' }, req, 403);
  }
  if (integration.status !== 'connected') {
    return json({ error: 'Integration is not connected.' }, req, 400);
  }

  const windowDays = Math.min(Math.max(Math.round(body.windowDays ?? 14), 1), WINDOW_MAX);

  // Resume guard: return any in-progress run for this detection+user.
  const { data: existing } = await admin
    .from('detection_finetune_runs')
    .select('id, anthropic_session_id')
    .eq('detection_id', body.detectionId)
    .eq('user_id', userId)
    .eq('status', 'running')
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (existing) {
    return json({ runId: existing.id, sessionId: existing.anthropic_session_id, resumed: true }, req);
  }

  // Connectivity probe — fail fast on auth errors before spending a session.
  let token: string;
  try {
    token = await defenderToken(admin, body.integrationId);
    const probe = await runHuntingQuery(token, 'DeviceInfo | take 1', 1, 30000);
    if (!probe.ok && probe.kind === 'http' && (probe.httpStatus === 401 || probe.httpStatus === 403)) {
      return json({
        error: 'Defender authentication failed. Check the integration permissions (ThreatHunting.Read.All, Application).',
      }, req, 403);
    }
  } catch (e) {
    return json({ error: `Could not reach Defender: ${e instanceof Error ? e.message : e}` }, req, 502);
  }

  // Baseline from the seeding pre-flight run (if any).
  let baseline: number | null = null;
  let breakdown: unknown = null;
  if (body.preflightRunId) {
    const { data: pf } = await admin
      .from('detection_preflight_runs')
      .select('hit_count, breakdown')
      .eq('id', body.preflightRunId)
      .eq('user_id', userId)
      .maybeSingle();
    if (pf) { baseline = pf.hit_count as number | null; breakdown = pf.breakdown; }
  }

  // Create the Anthropic session and send the kickoff.
  const agentId = Deno.env.get('FINETUNE_AGENT_ID');
  const environmentId = Deno.env.get('FINETUNE_ENVIRONMENT_ID');
  if (!agentId || !environmentId) {
    return json({ error: 'Finetuning agent is not provisioned (missing FINETUNE_AGENT_ID / FINETUNE_ENVIRONMENT_ID).' }, req, 500);
  }
  const sessionId = await createSession(agentId, environmentId, `Finetune: ${detection.name}`);
  await sendEvents(sessionId, [userMessage(buildKickoffMessage({
    detectionName: detection.name as string,
    windowDays,
    baselineHitCount: baseline,
    originalQuery: kql,
    breakdown,
  }))]);

  const { data: run, error: insErr } = await admin
    .from('detection_finetune_runs')
    .insert({
      user_id: userId,
      detection_id: body.detectionId,
      integration_id: body.integrationId,
      preflight_run_id: body.preflightRunId ?? null,
      anthropic_session_id: sessionId,
      status: 'running',
      window_days: windowDays,
      original_query: kql,
      baseline_hit_count: baseline,
    })
    .select('id')
    .single();
  if (insErr) {
    // Unique-index race: a concurrent start already created the run for this detection.
    if ((insErr as { code?: string }).code === '23505') {
      const { data: dup } = await admin
        .from('detection_finetune_runs')
        .select('id, anthropic_session_id')
        .eq('detection_id', body.detectionId)
        .eq('user_id', userId)
        .eq('status', 'running')
        .maybeSingle();
      if (dup) return json({ runId: dup.id, sessionId: dup.anthropic_session_id, resumed: true }, req);
    }
    // The session was created but no run row owns it — interrupt it (best effort)
    // so the orphaned agent stops burning tokens.
    try { await sendEvents(sessionId, [interrupt()]); } catch { /* best effort */ }
    return json({ error: 'Failed to create the finetuning run.' }, req, 500);
  }
  if (!run) return json({ error: 'Failed to create the finetuning run.' }, req, 500);

  return json({ runId: run.id, sessionId }, req);
}

const QUERY_ABORT_MS = 60000;

async function handleTool(body: ReqBody, userId: string, admin: SupabaseClient, req: Request): Promise<Response> {
  if (!body.runId || !body.toolUseId) {
    return json({ error: 'runId and toolUseId are required.' }, req, 400);
  }
  const { data: run, error } = await admin
    .from('detection_finetune_runs')
    .select('id, user_id, status, anthropic_session_id, integration_id, window_days')
    .eq('id', body.runId)
    .single();
  if (error || !run) return json({ error: 'Run not found.' }, req, 404);
  if (run.user_id !== userId) return json({ error: 'Forbidden.' }, req, 403);
  if (run.status !== 'running') return json({ status: run.status }, req);

  const sessionId = run.anthropic_session_id as string;

  // Anti-spoof + integrity: the toolUseId must be a real, still-unresolved tool call,
  // and the query/intent are read from the AGENT'S event — never from the client
  // request — so a caller cannot substitute its own KQL.
  const events = await listEvents(sessionId);
  const toolEvent = events.find(
    (e) => e.type === 'agent.custom_tool_use' && e.id === body.toolUseId,
  );
  const alreadyResolved = events.some(
    (e) => e.type === 'user.custom_tool_result' && e.custom_tool_use_id === body.toolUseId,
  );
  if (!toolEvent || alreadyResolved) {
    return json({ status: 'running', note: 'tool already resolved or unknown' }, req);
  }
  const toolName = String(toolEvent.name ?? '');
  const toolInput = (toolEvent.input ?? {}) as Record<string, unknown>;

  if (toolName === 'submit_refinement_ladder') {
    const v = validateLadder(toolInput);
    if (!v.ok) {
      await sendEvents(sessionId, [customToolResult(
        body.toolUseId,
        `Ladder rejected: ${v.reason} Fix it and call submit_refinement_ladder again.`,
        true,
      )]);
      return json({ status: 'running' }, req);
    }
    const { error: saveErr } = await admin.from('detection_finetune_runs').update({
      result: v.ladder, status: 'completed',
      completed_at: new Date().toISOString(), updated_at: new Date().toISOString(),
    }).eq('id', run.id);
    if (saveErr) {
      await sendEvents(sessionId, [customToolResult(
        body.toolUseId,
        'The ladder could not be saved due to a server error. Call submit_refinement_ladder again.',
        true,
      )]);
      return json({ status: 'running' }, req);
    }
    await sendEvents(sessionId, [customToolResult(
      body.toolUseId, 'Ladder received and saved. You are done — end your turn.', false,
    )]);
    return json({ status: 'completed' }, req);
  }

  if (toolName === 'run_hunting_query') {
    // Atomically reserve a budget slot.
    const { data: reserved } = await admin.rpc('reserve_finetune_query_slot', {
      p_run_id: run.id, p_budget: QUERY_BUDGET,
    });
    if (reserved == null) {
      await sendEvents(sessionId, [customToolResult(body.toolUseId, JSON.stringify({
        error: 'query_budget_exhausted',
        guidance: 'You have used your query budget. Call submit_refinement_ladder now with the evidence you have gathered.',
      }), false)]);
      return json({ status: 'running' }, req);
    }

    const query = String(toolInput.query ?? '');
    let payload: string;
    let isError = false;
    try {
      const token = await defenderToken(admin, run.integration_id as string);
      const result = await runHuntingQuery(token, query, run.window_days as number, QUERY_ABORT_MS);
      if (result.ok) {
        const capped = capHuntingResult(result.schema, result.results);
        capped.window_days = run.window_days as number;
        payload = JSON.stringify(capped);
      } else if (result.kind === 'oversized') {
        payload = JSON.stringify({ error: 'result_too_large',
          guidance: 'The result exceeded 5MB. Add | summarize or | take N to bound it.' });
        isError = true;
      } else if (result.kind === 'timeout') {
        payload = JSON.stringify({ error: 'query_timeout',
          guidance: 'The query exceeded 60s. Narrow it with a tighter filter or summarize.' });
        isError = true;
      } else {
        payload = JSON.stringify(mapHuntingError(result.httpStatus, result.body));
        isError = true;
      }
    } catch (e) {
      payload = JSON.stringify({ error: 'execution_error',
        message: e instanceof Error ? e.message : String(e),
        guidance: 'The query could not be executed.' });
      isError = true;
    }
    await sendEvents(sessionId, [customToolResult(body.toolUseId, payload, isError)]);
    return json({ status: 'running' }, req);
  }

  // Unknown tool — resolve the call with an error so the agent does not stall.
  await sendEvents(sessionId, [customToolResult(
    body.toolUseId, `Unknown tool: ${toolName}. Use run_hunting_query or submit_refinement_ladder.`, true,
  )]);
  return json({ status: 'running' }, req);
}

const NUDGE_MS = 4 * 60 * 1000;
const ANTHROPIC_INPUT_COST = 5 / 1_000_000;   // Opus 4.7 $/token
const ANTHROPIC_OUTPUT_COST = 25 / 1_000_000;

async function logUsage(admin: SupabaseClient, run: Record<string, unknown>, usage: {
  input_tokens: number; output_tokens: number; cache_read_input_tokens: number;
}, status: string): Promise<void> {
  const costUsd =
    usage.input_tokens * ANTHROPIC_INPUT_COST + usage.output_tokens * ANTHROPIC_OUTPUT_COST;
  // Claim ticket: the run-row update only succeeds while `usage` is still null,
  // so exactly one poll wins it. Only that poll inserts the telemetry row —
  // this prevents a double-write when two concurrent polls both observe a
  // freshly-terminal run.
  const { data: claimed, error: claimErr } = await admin
    .from('detection_finetune_runs')
    .update({ usage: { ...usage, cost_usd: Number(costUsd.toFixed(6)) } })
    .eq('id', run.id)
    .is('usage', null)
    .select('id')
    .maybeSingle();
  if (claimErr) {
    console.error('logUsage: run-row usage update failed:', claimErr);
    return;
  }
  if (!claimed) return; // another poll already logged this run
  const { error: insErr } = await admin.from('ai_usage_events').insert({
    user_id: run.user_id,
    feature: 'detection-finetune',
    model: 'claude-opus-4-7',
    provider: 'anthropic',
    category: 'llm',
    input_tokens: usage.input_tokens,
    output_tokens: usage.output_tokens,
    cached_input_tokens: usage.cache_read_input_tokens,
    cost_usd: Number(costUsd.toFixed(6)),
    status: status === 'completed' ? 'success' : 'provider_error',
  });
  if (insErr) console.error('logUsage: ai_usage_events insert failed:', insErr);
}

async function handlePoll(body: ReqBody, userId: string, admin: SupabaseClient, req: Request): Promise<Response> {
  if (!body.runId) return json({ error: 'runId is required.' }, req, 400);
  const { data: run, error } = await admin
    .from('detection_finetune_runs')
    .select('*')
    .eq('id', body.runId)
    .single();
  if (error || !run) return json({ error: 'Run not found.' }, req, 404);
  if (run.user_id !== userId) return json({ error: 'Forbidden.' }, req, 403);

  const sessionId = run.anthropic_session_id as string;
  const events = sessionId ? await listEvents(sessionId) : [];
  const norm = normalizeEvents(events);

  let status = run.status as string;
  let result = run.result;
  let usage = run.usage;

  if (status === 'running' && sessionId) {
    const elapsed = Date.now() - new Date(run.created_at as string).getTime();
    if (elapsed > RUN_TIMEOUT_MS) {
      status = 'failed';
      await admin.from('detection_finetune_runs')
        .update({ status: 'failed', error_message: 'timeout', updated_at: new Date().toISOString() })
        .eq('id', run.id);
    } else if (elapsed > NUDGE_MS && run.nudged !== true) {
      await sendEvents(sessionId, [userMessage(
        'Time is up — call submit_refinement_ladder now with your best measured ladder.',
      )]);
      await admin.from('detection_finetune_runs').update({ nudged: true }).eq('id', run.id);
    }
  }

  // Re-read status: handleTool may have completed the run between reads.
  if (status === 'running') {
    const { data: fresh } = await admin
      .from('detection_finetune_runs').select('status, result, usage').eq('id', run.id).maybeSingle();
    if (fresh) { status = fresh.status as string; result = fresh.result; usage = fresh.usage; }
  }

  // On first terminal poll, persist usage telemetry.
  if ((status === 'completed' || status === 'failed') && !usage) {
    await logUsage(admin, run, norm.usage, status);
    usage = { ...norm.usage, cost_usd: undefined };
  }

  return json({
    status,
    timeline: norm.timeline,
    pendingTools: status === 'running' ? norm.pendingTools : [],
    queryCount: norm.queryCount,
    result: result ?? null,
    usage: usage ?? null,
  }, req);
}

async function handleCancel(body: ReqBody, userId: string, admin: SupabaseClient, req: Request): Promise<Response> {
  if (!body.runId) return json({ error: 'runId is required.' }, req, 400);
  const { data: run, error } = await admin
    .from('detection_finetune_runs')
    .select('id, user_id, status, anthropic_session_id')
    .eq('id', body.runId)
    .single();
  if (error || !run) return json({ error: 'Run not found.' }, req, 404);
  if (run.user_id !== userId) return json({ error: 'Forbidden.' }, req, 403);
  if (run.status === 'running' && run.anthropic_session_id) {
    try { await sendEvents(run.anthropic_session_id as string, [interrupt()]); } catch { /* best effort */ }
  }
  await admin.from('detection_finetune_runs')
    .update({ status: 'cancelled', updated_at: new Date().toISOString() })
    .eq('id', run.id).eq('status', 'running');
  return json({ status: 'cancelled' }, req);
}

Deno.serve(async (req: Request) => {
  const preflight = handleCorsPreflight(req);
  if (preflight) return preflight;

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL');
    const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
    const anonKey = Deno.env.get('SUPABASE_ANON_KEY');
    if (!supabaseUrl || !serviceKey || !anonKey) throw new Error('Supabase env vars are not set.');

    const admin = createClient(supabaseUrl, serviceKey);
    const userClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: req.headers.get('Authorization') ?? '' } },
    });
    const { data: { user }, error: userErr } = await userClient.auth.getUser();
    if (userErr || !user) return json({ error: 'Authentication failed.' }, req, 401);

    const body: ReqBody = await req.json();
    switch (body.action) {
      case 'start':  return await handleStart(body, user.id, admin, req);
      case 'poll':   return await handlePoll(body, user.id, admin, req);
      case 'tool':   return await handleTool(body, user.id, admin, req);
      case 'cancel': return await handleCancel(body, user.id, admin, req);
      default:       return json({ error: `Unknown action: ${body.action}` }, req, 400);
    }
  } catch (error) {
    console.error('detection-finetune error:', error);
    return json({ error: error instanceof Error ? error.message : 'Internal error' }, req, 500);
  }
});
