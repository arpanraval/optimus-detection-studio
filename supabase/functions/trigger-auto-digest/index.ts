/**
 * Trigger Auto-Digest — user-facing edge function.
 *
 * Accepts a user JWT, inserts a pending auto_digest_jobs row,
 * then fires the orchestrator (service-role) so the run starts immediately
 * rather than waiting for the pg_cron schedule.
 */

import { serve } from 'https://deno.land/std@0.177.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.3'
import { handleCorsPreflight, corsJsonResponse, corsErrorResponse } from '../_shared/cors.ts'

declare const Deno: {
  env: { get(key: string): string | undefined };
};

serve(async (req: Request) => {
  const preflight = handleCorsPreflight(req);
  if (preflight) return preflight;

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const anonKey = Deno.env.get('SUPABASE_ANON_KEY')!;

    if (!supabaseUrl || !serviceRoleKey || !anonKey) {
      throw new Error('Supabase environment variables are not set.');
    }

    // Authenticate via user JWT — explicit-token pattern (matches ai-generate).
    // The global-Authorization-header + auth.getUser() pattern used in review-ops
    // does NOT work reliably with the pinned @supabase/supabase-js@2.39.3 in this
    // Deno runtime — it returns 401 inside the function even when the JWT is
    // valid (the platform-level verify_jwt has already passed). Pass the token
    // explicitly instead.
    const authHeader = req.headers.get('Authorization');
    if (!authHeader?.startsWith('Bearer ')) {
      return corsErrorResponse('Missing or invalid authorization header', req, 401);
    }
    const token = authHeader.replace('Bearer ', '');
    const userClient = createClient(supabaseUrl, anonKey);
    const { data: { user }, error: authError } = await userClient.auth.getUser(token);
    if (authError || !user) {
      console.error('[trigger-auto-digest] Auth error:', authError?.message);
      return corsErrorResponse('Unauthorized', req, 401);
    }

    const adminClient = createClient(supabaseUrl, serviceRoleKey);
    const { data: profile, error: profileError } = await adminClient
      .from('profiles').select('role').eq('id', user.id).single();
    if (profileError || !['owner', 'admin'].includes(profile?.role)) {
      return corsErrorResponse('Only admins can run the team digest', req, 403);
    }
    const { data: team, error: teamError } = await adminClient
      .from('auto_digest_team').select('user_id').single();
    if (teamError || !team?.user_id) {
      return corsErrorResponse('The team digest has not been configured', req, 409);
    }

    // Read prompt templates from the body (Plan A: frontend is the canonical
    // source of truth for AI prompts; the orchestrator can't access them
    // directly so we cache them per-user here at trigger time and the
    // orchestrator reads from auto_digest_settings.prompt_templates). The
    // exact shape is whatever getAllThreatIntelPromptTemplates() in
    // src/lib/ai/prompts/threat-intel/index.ts emits — we don't validate
    // structure here so prompt evolution doesn't require touching this
    // function. We do guard against accidentally clobbering an existing
    // cache with empty/missing values.
    let promptTemplatesFromBody: Record<string, unknown> | null = null;
    try {
      const body = await req.json();
      const pt = body?.promptTemplates;
      if (pt && typeof pt === 'object' && Object.keys(pt).length > 0) {
        promptTemplatesFromBody = pt;
      }
    } catch {
      // No body or unparseable — that's fine. Cron-triggered runs and
      // legacy clients won't send one.
    }

    if (promptTemplatesFromBody) {
      // Persist to settings so the orchestrator can read them when it picks
      // up the job — and so future cron-triggered runs (no UI) inherit the
      // most recent set of templates the user provided.
      const { error: cacheError } = await adminClient
        .from('auto_digest_settings')
        .update({
          prompt_templates: promptTemplatesFromBody,
          updated_at: new Date().toISOString(),
        })
        .eq('user_id', team.user_id);
      if (cacheError) {
        // Log but don't fail the trigger — the orchestrator will surface
        // a clear "no templates cached" error if needed.
        console.warn('[trigger-auto-digest] Failed to cache prompt templates:', cacheError.message);
      }
    }

    const { data: requestedJob, error: requestError } = await adminClient.rpc('request_auto_digest_job', {
      p_user_id: team.user_id,
      p_reason: 'manual',
    });

    if (requestError || !requestedJob?.[0]?.job_id) {
      return corsErrorResponse('Failed to create job: ' + (requestError?.message || 'No job was returned'), req, 500);
    }

    const job = requestedJob[0];
    fetch(`${supabaseUrl}/functions/v1/auto-digest-queue-consumer`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${serviceRoleKey}`, apikey: serviceRoleKey },
      body: '{}',
    }).catch(() => {
      // The scheduled watchdog will recover the durable job if the wake-up fails.
    });
    return corsJsonResponse(
      {
        job_id: job.job_id,
        status: job.status,
        created: job.created,
        message: job.created ? 'Digest pipeline started' : 'A digest job is already in progress',
      },
      req,
      200,
    );
  } catch (err: any) {
    console.error('[trigger-auto-digest] Error:', err.message);
    return corsErrorResponse(err.message || 'Internal server error', req, 500);
  }
});
