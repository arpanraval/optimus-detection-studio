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
import { createSession, sendEvents, listEvents, userMessage, interrupt } from '../_shared/managed-agents.ts';
import { buildKickoffMessage } from '../_shared/finetune-logic.ts';
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
