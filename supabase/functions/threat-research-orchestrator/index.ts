// supabase/functions/threat-research-orchestrator/index.ts
//
// HTTP entry point for the Threat Research feature. Two actions:
//   - POST /                       — start a new session (creates row, fires
//                                     orchestration in background, returns id)
//   - POST /?action=cancel         — flip an in-progress session to cancelled
//                                     (orchestrator polls and bails)
//
// All requests are user-authenticated (JWT). The orchestration itself runs
// with the service-role key for cross-cutting writes (events, tree mutations).

import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";
import { handleCorsPreflight, corsErrorResponse, corsJsonResponse } from "../_shared/cors.ts";
import { checkRateLimit } from "../_shared/rate-limiter.ts";
import { runOrchestration } from "./lib/orchestrator.ts";

const MAX_INPUT_LEN = 1000;

serve(async (req: Request) => {
  const preflight = handleCorsPreflight(req);
  if (preflight) return preflight;

  try {
    const auth = req.headers.get('Authorization');
    if (!auth?.startsWith('Bearer ')) {
      return corsErrorResponse('Missing authorization header', req, 401);
    }

    const token = auth.replace('Bearer ', '');
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const anonKey = Deno.env.get('SUPABASE_ANON_KEY')!;
    const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

    const userClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: `Bearer ${token}` } },
    });

    const { data: { user }, error: authErr } = await userClient.auth.getUser(token);
    if (authErr || !user) return corsErrorResponse('Unauthorized', req, 401);

    const adminClient = createClient(supabaseUrl, serviceRoleKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });

    // Per-user rate limit: 5 sessions per hour.
    const { allowed } = await checkRateLimit(
      adminClient,
      `user:${user.id}:fn:threat-research-orchestrator`,
      5,
      3600,
    );
    if (!allowed) return corsErrorResponse('Rate limit exceeded — 5 sessions per hour.', req, 429);

    const url = new URL(req.url);
    const action = url.searchParams.get('action');

    if (req.method === 'POST' && !action) {
      // Start a new session.
      let body: any;
      try { body = await req.json(); } catch { return corsErrorResponse('Invalid JSON body', req, 400); }

      const inputText = typeof body?.input_text === 'string' ? body.input_text.trim() : '';
      if (!inputText) return corsErrorResponse('input_text is required', req, 400);
      if (inputText.length > MAX_INPUT_LEN) {
        return corsErrorResponse(`input_text exceeds ${MAX_INPUT_LEN} characters`, req, 400);
      }

      const { data: session, error } = await userClient
        .from('threat_research_sessions')
        .insert({ user_id: user.id, input_text: inputText, status: 'pending' })
        .select('id')
        .single();
      if (error || !session) {
        console.error('[orchestrator] insert session failed:', error?.message);
        return corsErrorResponse('Failed to create session', req, 500);
      }

      // Fire-and-forget orchestration with the service-role client.
      runOrchestration(adminClient, serviceRoleKey, session.id, user.id).catch(e => {
        console.error('[orchestrator] background run failed:', e);
      });

      return corsJsonResponse({ session_id: session.id }, req);
    }

    if (req.method === 'POST' && action === 'cancel') {
      let body: any;
      try { body = await req.json(); } catch { return corsErrorResponse('Invalid JSON body', req, 400); }
      const sessionId = typeof body?.session_id === 'string' ? body.session_id : '';
      if (!sessionId) return corsErrorResponse('session_id is required', req, 400);

      const { error } = await userClient
        .from('threat_research_sessions')
        .update({ status: 'cancelled', completed_at: new Date().toISOString() })
        .eq('id', sessionId)
        .in('status', ['pending', 'running']);
      if (error) {
        console.error('[orchestrator] cancel failed:', error.message);
        return corsErrorResponse('Failed to cancel', req, 500);
      }
      return corsJsonResponse({ ok: true }, req);
    }

    return corsErrorResponse('Bad request', req, 400);
  } catch (e) {
    console.error('[orchestrator] entry:', e);
    return corsErrorResponse('Internal server error', req, 500);
  }
});
