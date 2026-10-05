import type { SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2.39.3';
import { packRuleConfig, packSkipReason, selectPackQuery, type PackDetection } from './pack-deploy-policy.ts';
import { checkPermission } from './permissions.ts';
import type { PackPresenceChecker } from './pack-deploy-presence.ts';

export interface PackPreviewItem {
  detection_id: string;
  detection_name: string;
  reason: string | null;
  notice?: string;
  can_reconcile?: boolean;
  payload: { query: string; queryLanguage: string; ruleConfig: Record<string, unknown>; version?: number } | null;
}

export async function previewPack(
  db: SupabaseClient,
  actor: string,
  integrationId: string,
  ids: string[],
  config: Record<string, unknown>,
  checkPresence?: PackPresenceChecker,
  reconcile = false,
) {
  const unique = [...new Set(ids)];
  if (!unique.length || unique.length > 1000) throw new Error('Select between 1 and 1000 detections');
  const { data: integration, error } = await db
    .from('integrations')
    .select('id,user_id,provider,status,category,config')
    .eq('id', integrationId)
    .eq('user_id', actor)
    .single();
  if (error || !integration || integration.status !== 'connected' || integration.category !== 'siem') {
    throw new Error('Connected SIEM integration not found');
  }
  const [detections, bindings, uncertain, deployed] = await Promise.all([
    db.from('detections').select('*').in('id', unique).eq('user_id', actor),
    db.from('siem_rule_bindings').select('detection_id').eq('integration_id', integrationId).in('detection_id', unique),
    db
      .from('pack_deploy_job_items')
      .select('id,detection_id,vendor_rule_id,payload,error_message,pack_deploy_jobs!inner(integration_id,status)')
      .eq('pack_deploy_jobs.integration_id', integrationId)
      .eq('needs_reconciliation', true)
      .in('detection_id', unique),
    db.from('deployment_history').select('detection_id,vendor_rule_id')
      .eq('integration_id', integrationId).eq('action', 'create').eq('status', 'success')
      .in('detection_id', unique),
  ]);
  for (const result of [detections, bindings, uncertain, deployed]) if (result.error) throw new Error(result.error.message);
  if (detections.data?.length !== unique.length)
    throw new Error('One or more detections are unavailable or belong to another user');
  const tracked = new Set(bindings.data?.map((b) => b.detection_id));
  const unresolved = new Set(uncertain.data?.map((b) => b.detection_id));
  const previouslyDeployed = new Set(deployed.data?.filter((row) => row.vendor_rule_id).map((row) => row.detection_id));
  const candidates = (detections.data as PackDetection[]).filter((d) =>
    previouslyDeployed.has(d.id) && !packSkipReason(d, integration.provider, tracked.has(d.id)));
  const candidateIds = new Set(candidates.map((d) => d.id));
  const history = (deployed.data ?? []).filter((row) => row.vendor_rule_id && candidateIds.has(row.detection_id));
  const remote = integration.provider === 'sentinel' && checkPresence && (history.length || (reconcile && unresolved.size))
    ? await checkPresence(integration, [...new Set(history.map((row) => row.vendor_rule_id as string))], reconcile ? uncertain.data ?? [] : [])
    : null;
  const reconciled = new Set<string>();
  if (reconcile) for (const id of unresolved) {
    const previous = (uncertain.data ?? []).filter((row) => row.detection_id === id);
    if (previous.length && previous.every((row) => remote?.get(`item:${row.id}`) === 'missing')) {
      unresolved.delete(id);
      reconciled.add(id);
    }
  }
  const deleted = new Set(candidates.filter((d) => {
    const previous = history.filter((row) => row.detection_id === d.id);
    return previous.length > 0 && previous.every((row) => remote?.get(row.vendor_rule_id) === 'missing');
  }).map((d) => d.id));
  return (detections.data as PackDetection[]).map((d): PackPreviewItem => {
    const reason = unresolved.has(d.id)
      ? (uncertain.data ?? []).some((row) => row.detection_id === d.id && remote?.get(`item:${row.id}`) === 'present')
        ? 'A matching rule still exists in Sentinel. Review it individually before deploying again.'
        : 'An earlier deployment has an unknown outcome. Reconcile it with the SIEM first.'
      : previouslyDeployed.has(d.id) && !deleted.has(d.id)
        ? 'Already deployed to this connection: review and update this rule individually.'
        : packSkipReason(d, integration.provider, tracked.has(d.id));
    const selected = selectPackQuery(d, integration.provider);
    return {
      detection_id: d.id,
      detection_name: d.name,
      reason,
      ...(unresolved.has(d.id) && integration.provider === 'sentinel' ? { can_reconcile: true } : {}),
      ...(reconciled.has(d.id) ? { notice: 'No matching rule found in Sentinel. Eligible for a new deployment; historical records are unchanged.' } :
        deleted.has(d.id) ? { notice: 'Previous rule is missing in Sentinel; a new rule will be created.' } : {}),
      payload:
        reason || !selected
          ? null
          : {
              query: selected.query,
              queryLanguage: selected.language,
              ruleConfig: packRuleConfig(d, integration.provider, config),
              version: d.version,
            },
    };
  });
}

export interface PackOutcome {
  status: 'succeeded' | 'failed' | 'skipped';
  vendorRuleId?: string;
  error?: string;
  retryable?: boolean;
  retryAfter?: number;
  uncertain?: boolean;
}

export async function executePackWrite(
  db: SupabaseClient,
  body: { jobId?: string; itemId?: string; lease?: string },
  deploy: (payload: Record<string, unknown>, actor: string, itemId: string) => Promise<Response>,
  checkPresence?: PackPresenceChecker,
) {
  const claim = await db.rpc('pack_deploy_begin_write', {
    p_job: body.jobId,
    p_item: body.itemId,
    p_lease: body.lease,
  });
  const json = (value: unknown, status = 200) =>
    new Response(JSON.stringify(value), { status, headers: { 'Content-Type': 'application/json' } });
  if (claim.error || !claim.data) return json({ error: claim.error?.message || 'Lease unavailable' }, 409);
  const { job, item } = claim.data;
  if (!(await checkPermission(db, job.created_by, 'integrations:sync')).allowed)
    return json({ error: 'Deployment permission revoked' }, 403);
  let current: PackPreviewItem;
  try {
    [current] = await previewPack(db, job.created_by, job.integration_id, [item.detection_id], job.rule_config ?? {}, checkPresence, true);
  } catch (error) {
    // This is still before any vendor request, so it has a known non-writing outcome.
    return json({ error: error instanceof Error ? error.message : String(error), uncertain: false }, 400);
  }
  if (current.reason) return json({ skipped: true, reason: current.reason });
  if (
    !item.payload ||
    current.payload?.query !== item.payload.query ||
    current.payload?.queryLanguage !== item.payload.queryLanguage ||
    current.payload?.version !== item.payload.version
  ) {
    return json({ skipped: true, reason: 'Detection changed after queueing. Review and queue it again.' });
  }
  return deploy(
    { action: 'deploy_rule', integrationId: job.integration_id, detectionId: item.detection_id, ...item.payload },
    job.created_by,
    item.id,
  );
}

export async function readPackOutcome(response: Response): Promise<PackOutcome> {
  const body = await response.json().catch(() => ({}));
  const vendorRuleId = body.deployment?.vendor_rule_id;
  if (response.ok && body.skipped) return { status: 'skipped', error: body.reason };
  if (response.ok && vendorRuleId) return { status: 'succeeded', vendorRuleId };
  const details = body.validation?.errors?.map((e: { message: string }) => e.message).join('; ');
  const uncertain =
    body.uncertain === true ||
    (response.ok && !vendorRuleId) ||
    (response.status >= 500 && body.retryable !== true && body.uncertain !== false);
  return {
    status: 'failed',
    ...(vendorRuleId ? { vendorRuleId } : {}),
    error: details || body.error || `Deployment returned HTTP ${response.status}`,
    retryable: !uncertain && (response.status === 429 || body.retryable === true),
    uncertain,
    retryAfter: Math.max(5, Number(response.headers.get('Retry-After')) || body.retryAfter || 30),
  };
}

// One leased item per invocation bounds runtime. The database owns every transition.
export async function processPackItem(
  db: SupabaseClient,
  deploy: (body: Record<string, unknown>) => Promise<Response>,
  jobId?: string,
) {
  const claim = await db.rpc('pack_deploy_claim', { p_job: jobId ?? null });
  if (claim.error) throw new Error(claim.error.message);
  if (!claim.data) return false;
  const { job, item } = claim.data;
  let outcome: PackOutcome;
  try {
    if (!(await checkPermission(db, job.created_by, 'integrations:sync')).allowed) {
      outcome = { status: 'failed', error: 'Deployment permission was revoked', retryable: false };
    } else {
      outcome = await readPackOutcome(
        await deploy({ action: 'pack_deploy_item', jobId: job.id, itemId: item.id, lease: job.lease_token }),
      );
    }
  } catch (error) {
    outcome = {
      status: 'failed',
      error: `Outcome unknown: ${error instanceof Error ? error.message : String(error)}. Check the SIEM before retrying.`,
      uncertain: true,
      retryable: false,
    };
  }
  const finished = await db.rpc('pack_deploy_finish', {
    p_job: job.id,
    p_item: item.id,
    p_lease: job.lease_token,
    p_result: outcome,
  });
  if (finished.error) throw new Error(finished.error.message);
  return finished.data === true;
}
