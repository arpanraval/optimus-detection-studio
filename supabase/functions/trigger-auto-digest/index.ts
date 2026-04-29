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

    // If a job is already pending or processing, return it instead of creating a duplicate
    const { data: existingJob } = await adminClient
      .from('auto_digest_jobs')
      .select('id, status')
      .eq('user_id', user.id)
      .in('status', ['pending', 'processing'])
      .limit(1)
      .maybeSingle();

    if (existingJob) {
      return corsJsonResponse(
        { job_id: existingJob.id, status: existingJob.status, message: 'A digest job is already in progress' },
        req,
        200,
      );
    }

    // Insert a new pending job
    const { data: newJob, error: insertError } = await adminClient
      .from('auto_digest_jobs')
      .insert({ user_id: user.id, status: 'pending' })
      .select('id')
      .single();

    if (insertError || !newJob) {
      return corsErrorResponse(`Failed to create job: ${insertError?.message}`, req, 500);
    }

    // Fire-and-forget: wake up the orchestrator so the job runs immediately
    fetch(`${supabaseUrl}/functions/v1/auto-digest-orchestrator`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${serviceRoleKey}`,
      },
      body: '{}',
    }).catch(() => {
      // Orchestrator will pick up the pending job on its next scheduled invocation if this fails
    });

    return corsJsonResponse({ job_id: newJob.id, message: 'Digest pipeline started' }, req, 200);
  } catch (err: any) {
    console.error('[trigger-auto-digest] Error:', err.message);
    return corsErrorResponse(err.message || 'Internal server error', req, 500);
  }
});
