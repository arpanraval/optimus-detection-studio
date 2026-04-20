// pack-deploy-worker
//
// Background worker that processes entries in pack_deploy_jobs.
// Called by the client immediately after job creation, but execution is
// independent — the job will complete even if the client closes the tab.
//
// Uses service_role for job table writes (to bypass RLS for progress updates)
// and the user's JWT when invoking integration-ops (to preserve user context).

import { serve } from 'https://deno.land/std@0.224.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.3';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY')!;

const MAX_RETRIES = 3;
const RETRY_DELAY_MS = 2000;
const RATE_LIMIT_DELAY_MS = 500;
const BLOCKED_STATUSES = new Set(['Draft', 'Deprecated', 'Archived']);

interface DeployJobRow {
  id: string;
  pack_id: string | null;
  integration_id: string;
  total_items: number;
  created_by: string;
  status: string;
  succeeded_count: number | null;
  failed_count: number | null;
  skipped_count: number | null;
}

interface DeployItemRow {
  id: string;
  job_id: string;
  detection_id: string;
  detection_name: string | null;
  retry_count: number;
}

interface DetectionRow {
  id: string;
  name: string;
  status: string;
  library_type: string;
  queries?: Array<{ query?: string; language?: string }>;
  queryLanguage?: string;
  detectionQuery?: string;
}

type DeployAttemptResult =
  | { success: true; vendorRuleId?: string }
  | { success: false; error: string; retryable: boolean; skip?: boolean };

function getServiceClient() {
  return createClient(SUPABASE_URL, SERVICE_ROLE_KEY);
}

function getUserClient(userJwt: string) {
  return createClient(SUPABASE_URL, ANON_KEY, {
    global: { headers: { Authorization: `Bearer ${userJwt}` } },
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

async function updateJobStatus(
  service: ReturnType<typeof getServiceClient>,
  jobId: string,
  updates: Record<string, unknown>,
) {
  await service.from('pack_deploy_jobs').update(updates).eq('id', jobId);
}

async function updateItemStatus(
  service: ReturnType<typeof getServiceClient>,
  itemId: string,
  updates: Record<string, unknown>,
) {
  await service.from('pack_deploy_job_items').update(updates).eq('id', itemId);
}

async function isJobCancelled(service: ReturnType<typeof getServiceClient>, jobId: string): Promise<boolean> {
  const { data } = await service.from('pack_deploy_jobs').select('status').eq('id', jobId).single();
  return data?.status === 'cancelled';
}

interface PackDeployConfig {
  severity_override?: string | null;
  schedule_override?: string | null;
  enabled?: boolean;
  notes?: string | null;
}

async function deployOne(
  service: ReturnType<typeof getServiceClient>,
  userClient: ReturnType<typeof getUserClient>,
  integrationId: string,
  detectionId: string,
  packConfig: PackDeployConfig,
): Promise<DeployAttemptResult> {
  try {
    // Read detection via service client so RLS doesn't block worker
    const { data: detection, error: detError } = await service
      .from('detections')
      .select('id, name, status, library_type, queries, queryLanguage, detectionQuery')
      .eq('id', detectionId)
      .single();

    if (detError || !detection) {
      return { success: false, error: 'Detection not found', retryable: false, skip: true };
    }

    const typed = detection as DetectionRow;

    if (typed.library_type !== 'production') {
      return { success: false, error: 'Lab detection — promote to Production first', retryable: false, skip: true };
    }

    if (BLOCKED_STATUSES.has(typed.status)) {
      return { success: false, error: `Cannot deploy ${typed.status} detection`, retryable: false, skip: true };
    }

    // Extract query + language (prefer multi-query array, fall back to legacy fields)
    const primaryQuery = typed.queries?.[0]?.query || typed.detectionQuery || '';
    const queryLanguage = typed.queries?.[0]?.language || typed.queryLanguage || '';

    if (!primaryQuery.trim()) {
      return { success: false, error: 'Detection has no query text', retryable: false, skip: true };
    }

    // Build ruleConfig from pack-level overrides. Individual detection settings
    // are used by integration-ops; overrides here take precedence at the pack level.
    const ruleConfig: Record<string, unknown> = {};
    if (packConfig.severity_override) {
      ruleConfig.severity = packConfig.severity_override;
    }
    if (packConfig.schedule_override) {
      ruleConfig.schedule = packConfig.schedule_override;
    }
    if (packConfig.enabled === false) {
      ruleConfig.enabled = false;
    }
    if (packConfig.notes) {
      ruleConfig.description = packConfig.notes;
    }

    // Invoke integration-ops using the user's JWT so user_id filter passes
    const { data, error } = await userClient.functions.invoke('integration-ops', {
      body: {
        action: 'deploy_rule',
        integrationId,
        detectionId,
        query: primaryQuery,
        queryLanguage,
        ...(Object.keys(ruleConfig).length > 0 ? { ruleConfig } : {}),
      },
    });

    if (error) {
      // Network / function invocation error — retryable
      return { success: false, error: error.message || 'Invocation failed', retryable: true };
    }

    // integration-ops returns {error: "..."} on validation failure (non-retryable)
    // or {vendor_rule_id: "..."} on success
    if (data?.error) {
      return {
        success: false,
        error: data.error,
        retryable: false,
      };
    }

    return { success: true, vendorRuleId: data?.vendor_rule_id || data?.deployment?.vendor_rule_id };
  } catch (err) {
    return {
      success: false,
      error: err instanceof Error ? err.message : String(err),
      retryable: true,
    };
  }
}

async function processJob(jobId: string, userJwt: string) {
  const service = getServiceClient();
  const userClient = getUserClient(userJwt);

  // Mark job as running
  await updateJobStatus(service, jobId, {
    status: 'running',
    started_at: new Date().toISOString(),
  });

  const { data: job } = await service.from('pack_deploy_jobs').select('*').eq('id', jobId).single();
  if (!job) return;

  const typedJob = job as unknown as DeployJobRow;

  // Fetch the pack's deploy_config (overrides applied to every detection in this job)
  let packConfig: PackDeployConfig = {};
  if (typedJob.pack_id) {
    const { data: packData } = await service
      .from('detection_packs')
      .select('deploy_config')
      .eq('id', typedJob.pack_id)
      .maybeSingle();
    if (packData && packData.deploy_config) {
      packConfig = packData.deploy_config as PackDeployConfig;
    }
  }

  // Fetch all pending + failed items (failed items are retry candidates)
  const { data: items } = await service
    .from('pack_deploy_job_items')
    .select('*')
    .eq('job_id', jobId)
    .in('status', ['pending', 'failed']);

  if (!items) return;

  const typedItems = items as unknown as DeployItemRow[];

  // Track running totals. On retry, packDeployJobService.retryFailedItems resets
  // failed_count to 0 but preserves succeeded/skipped — seed from DB so we don't
  // erase prior progress on the first updateJobStatus call.
  let succeeded = typedJob.succeeded_count ?? 0;
  let failed = typedJob.failed_count ?? 0;
  let skipped = typedJob.skipped_count ?? 0;

  for (const item of typedItems) {
    // Check for cancellation every iteration
    if (await isJobCancelled(service, jobId)) {
      return;
    }

    await updateItemStatus(service, item.id, {
      status: 'running',
      attempted_at: new Date().toISOString(),
    });
    await updateJobStatus(service, jobId, { current_detection_id: item.detection_id });

    let attempt = 0;
    let result: DeployAttemptResult | null = null;

    while (attempt < MAX_RETRIES) {
      result = await deployOne(service, userClient, typedJob.integration_id, item.detection_id, packConfig);
      if (result.success) break;
      if (!result.retryable) break;
      attempt++;
      if (attempt < MAX_RETRIES) {
        // Exponential backoff
        await new Promise((r) => setTimeout(r, RETRY_DELAY_MS * attempt));
      }
    }

    if (result?.success) {
      succeeded++;
      await updateItemStatus(service, item.id, {
        status: 'succeeded',
        vendor_rule_id: result.vendorRuleId ?? null,
        retry_count: attempt,
        error_message: null,
      });
    } else if (result?.skip) {
      skipped++;
      await updateItemStatus(service, item.id, {
        status: 'skipped',
        error_message: result.error,
        retry_count: attempt,
      });
    } else {
      failed++;
      await updateItemStatus(service, item.id, {
        status: 'failed',
        error_message: result?.error ?? 'Unknown error',
        retry_count: attempt,
      });
    }

    await updateJobStatus(service, jobId, {
      succeeded_count: succeeded,
      failed_count: failed,
      skipped_count: skipped,
    });

    // Rate limit between deploys to avoid hammering the SIEM
    await new Promise((r) => setTimeout(r, RATE_LIMIT_DELAY_MS));
  }

  // Determine final status
  let finalStatus: string;
  if (failed === 0 && succeeded > 0) {
    finalStatus = 'succeeded';
  } else if (succeeded === 0 && failed > 0) {
    finalStatus = 'failed';
  } else if (succeeded > 0 && failed > 0) {
    finalStatus = 'partial';
  } else if (skipped > 0) {
    // All items were skipped (e.g., all detections were lab-only or blocked status)
    finalStatus = 'succeeded';
  } else {
    // Empty job — nothing was processed at all
    finalStatus = 'failed';
  }

  await updateJobStatus(service, jobId, {
    status: finalStatus,
    completed_at: new Date().toISOString(),
    current_detection_id: null,
  });
}

serve(async (req) => {
  const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
  };

  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    // Extract the user's JWT from the Authorization header
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      return new Response(JSON.stringify({ error: 'Missing authorization' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }
    const userJwt = authHeader.replace('Bearer ', '');

    const { jobId } = await req.json();
    if (!jobId) {
      return new Response(JSON.stringify({ error: 'jobId required' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Run processing. Edge functions have a default timeout of 300s;
    // for very large packs this may need to be split into multiple invocations.
    await processJob(jobId, userJwt);

    return new Response(JSON.stringify({ ok: true }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (err) {
    return new Response(
      JSON.stringify({ error: err instanceof Error ? err.message : String(err) }),
      {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    );
  }
});
