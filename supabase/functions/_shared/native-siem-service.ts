import type { SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2.39.3';
import { ADAPTER_VERSION, contentHash, crowdStrikeScope, normalizeCrowdStrike, sanitizeSnapshot,
  classifyDrift, localContent, crowdStrikeUpdate, mutationBlockedReason,  NATIVE_OPERATIONS, type Json, type NativeOperation, type RuleContent } from './native-siem-model.ts';

type Dependencies = {
  db: SupabaseClient;
  credentials: (id: string) => Promise<Record<string, string>>;
  token: (base: string, client: string, secret: string) => Promise<string>;
  fetch: (url: string, options: RequestInit, timeout?: number) => Promise<Response>;
  writesEnabled: boolean;
};
export type NativeRequest = {
  action: string; integrationId?: string; bindingId?: string; expectedHash?: string; expectedVersion?: number;
  operation?: 'update' | 'enable' | 'disable' | 'delete';
  localChanges?: { name: string; description: string; query: string; severity: string; schedule: string; lookback: string };
  revisionId?: string;
  ids?: string[];
  excludeIds?: string[];
  allMatching?: boolean;
  sourceRunId?: string;
  selectionSearch?: string;
  selectionRelationship?: string;
  idempotencyKey?: string;
  runId?: string;
  vendorRuleId?: string;
  remoteRuleId?: string;
  detectionId?: string;
  queryId?: string;
  detectionVersion?: number;
  snapshotId?: string;
};

function checked<T>(result: { data: T; error: { message: string } | null }): T {
  if (result.error) throw new Error(result.error.message);
  return result.data;
}

async function connection(deps: Dependencies, id: string, actor: string) {
  const row = checked(await deps.db.from('integrations').select('*').eq('id', id).eq('user_id', actor).single());
  if (!row || row.archived_at || row.provider !== 'crowdstrike') throw new Error('Connection unavailable');
  return row;
}

async function client(deps: Dependencies, integration: { id: string; config: Record<string, unknown> }) {
  crowdStrikeScope(integration.config);
  const credentials = await deps.credentials(integration.id);
  const base = String(integration.config.baseUrl).replace(/\/$/, '');
  const token = await deps.token(base, credentials.clientId, credentials.clientSecret);
  return async (path: string, options: RequestInit = {}): Promise<Record<string, Json>> => {
    const response = await deps.fetch(`${base}/correlation-rules/${path}`, {
      ...options, headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    }, 10000);
    if (!response.ok) throw new Error(`CrowdStrike request failed (${response.status}); retry the sync after checking access`);
    const result = await response.json();
    if (Array.isArray(result.errors) && result.errors.length) throw new Error('CrowdStrike returned an incomplete result');
    return result;
  };
}

const DETAIL_UNREADABLE = 'CrowdStrike did not return this rule. It may have been deleted or it ' +
  'may be a rule type this connection cannot read.';
const MAX_DETAIL_RETRIES_PER_CHUNK = 10;
/** siem_claim_sync grants a 45-second lease. Each provider request is allowed 10 seconds, so a
 *  batch read plus ten sequential per-id retries can spend up to 110 seconds -- the commit then
 *  fails its own lease check, the chunk is requeued, and the same slow chunk is reprocessed until
 *  the run gives up. Slow-but-SUCCESSFUL responses are the dangerous case here: nothing errors, so
 *  nothing else stops it. Reserve the tail of the lease for the commit and leave whatever did not
 *  fit pending for the next chunk, which is already how the retry cap behaves. */
const DETAIL_BUDGET_MS = 25000;

/** CrowdStrike's list endpoint (`queries/rules/v1`) returns a rule's STABLE identity, but the
 *  entity endpoint returns a rule that has been edited past version 1 with `id` set to the
 *  CURRENT VERSION's id and `rule_id` holding that stable identity. A version-1 rule has the two
 *  equal, which is why this only ever bites edited rules. EVERY read of an entity response has to
 *  accept either field -- hydration, mutation preflight, readback and delete verification alike --
 *  or an edited rule looks absent to whichever site still compares `id` alone. */
export function matchesVendorRule(raw: Record<string, Json> | undefined, vendorRuleId: string): boolean {
  return raw?.id === vendorRuleId || raw?.rule_id === vendorRuleId;
}

/** A batch detail read that returns fewer resources than requested is not evidence of deletion.
 *  Retry each omitted id once on its own before recording it as unreadable. Retries are capped at
 *  MAX_DETAIL_RETRIES_PER_CHUNK per call; ids beyond the cap are left out of both maps entirely so
 *  the caller leaves them pending for a later chunk instead of stranding them. */
export async function readRuleDetails(
  request: (path: string) => Promise<Record<string, Json>>,
  ids: string[],
  budgetMs = DETAIL_BUDGET_MS,
): Promise<{ found: Map<string, Record<string, Json>>; missing: Map<string, string> }> {
  const found = new Map<string, Record<string, Json>>();
  const missing = new Map<string, string>();
  if (!ids.length) return { found, missing };
  const startedAt = Date.now();
  /** Keyed under the id we asked for, so the caller's identity stays the stable one even when
   *  CrowdStrike answers with a version id (see matchesVendorRule). */
  const collect = (response: Record<string, Json>) => {
    if (!Array.isArray(response.resources)) throw new Error('Invalid rule detail response');
    for (const raw of response.resources as Record<string, Json>[]) {
      const requested = ids.find(id => matchesVendorRule(raw, id));
      if (requested) found.set(requested, raw);
    }
  };
  collect(await request(`entities/rules/v1?${ids.map(id => `ids=${encodeURIComponent(id)}`).join('&')}`));
  let retries = 0;
  for (const id of ids) {
    if (found.has(id)) continue;
    if (retries >= MAX_DETAIL_RETRIES_PER_CHUNK) continue; // beyond the cap: leave pending for the next chunk
    // Out of lease budget: stop reading rather than commit into an expired lease. Everything
    // still unresolved stays out of both maps, so the commit leaves it pending.
    if (Date.now() - startedAt >= budgetMs) break;
    retries++;
    // A throw here is not a missing rule: CrowdStrike answers 200 with empty resources for an
    // unknown id, so request() only throws on a non-OK status or a non-empty errors array --
    // auth failure, rate limit, outage. Reporting that as "this rule may have been deleted"
    // across the chunk would be actively misleading, so let it propagate: the chunk fails,
    // processNativeSync's fenced catch requeues with backoff, and the run gives up after 5
    // attempts rather than limping on with wrong labels.
    collect(await request(`entities/rules/v1?ids=${encodeURIComponent(id)}`));
    if (!found.has(id)) missing.set(id, DETAIL_UNREADABLE);
  }
  return { found, missing };
}

/** One invocation owns one bounded chunk. Cron, not a browser, drives subsequent chunks. */
export async function processNativeSync(deps: Dependencies): Promise<{ processed: boolean }> {
  const runs = checked(await deps.db.rpc('siem_claim_sync'));
  const run = runs?.[0];
  if (!run) return { processed: false };
  try {
    const kind: string = run.kind ?? 'legacy_import';
    if (kind === 'legacy_import') {
      // Superseded semantics. Park it rather than importing rules nobody selected.
      checked(await deps.db.from('siem_sync_runs').update({
        status: 'cancelled', completed_at: new Date().toISOString(),
        error_message: 'This import used an earlier workflow. Open the connection and fetch rules again.',
        lease_token: null, lease_expires_at: null,
      }).eq('id', run.id).eq('lease_token', run.lease_token));
      return { processed: true };
    }
    if (!checked(await deps.db.rpc('siem_can_import', { p_actor: run.actor_id, p_integration: run.integration_id }))) {
      throw new Error('Native import permission revoked');
    }
    const integration = await connection(deps, run.integration_id, run.actor_id);
    if (crowdStrikeScope(integration.config) !== run.provider_scope) throw new Error('Connection scope changed');
    const request = await client(deps, integration);
    let ids: string[] = [], next = run.cursor_offset, done = false;
    const results: Array<Record<string, Json>> = [];
    if (run.phase === 'discovery') {
      const page = await request(`queries/rules/v1?limit=50&offset=${run.cursor_offset}`);
      if (!Array.isArray(page.resources) || page.resources.some(id => typeof id !== 'string' || !id)) {
        throw new Error('Invalid rule discovery response');
      }
      ids = page.resources as string[];
      next += ids.length;
      // An empty page establishes completion; do not trust a missing/unstable total as zero.
      done = ids.length === 0;
    } else {
      const items = checked(await deps.db.from('siem_sync_items').select('vendor_rule_id')
        .eq('run_id', run.id).eq('status', 'pending').order('vendor_rule_id').limit(10)) ?? [];
      const requested = items.map(item => item.vendor_rule_id as string);
      if (requested.length) {
        const { found: byId, missing } = await readRuleDetails(request, requested);
        if (kind === 'inventory') {
          for (const id of requested) {
            const raw = byId.get(id);
            if (!raw) { const reason = missing.get(id); if (reason) results.push({ id, status: 'failed', error: reason }); continue; }
            const sanitized = sanitizeSnapshot(raw) as Record<string, Json>;
            const name = typeof sanitized.name === 'string' ? sanitized.name : id;
            try {
              const content = normalizeCrowdStrike(sanitized);
              results.push({ id, name, content, raw: sanitized, adapter: ADAPTER_VERSION,
                hash: await contentHash(content), raw_hash: await contentHash(sanitized),
                enabled: content.enabled, family: 'correlation' });
            } catch (error) {
              results.push({ id, name, family: 'correlation', status: 'unsupported',
                error: error instanceof Error ? error.message : 'Unsupported rule' });
            }
          }
        } else {
          for (const id of requested) {
            const raw = byId.get(id);
            if (!raw) { const reason = missing.get(id); if (reason) results.push({ id, status: 'failed', error: reason }); continue; }
            try {
              const sanitized = sanitizeSnapshot(raw) as Record<string, Json>;
              const content = normalizeCrowdStrike(sanitized);
              results.push({ id, content, raw: sanitized, adapter: ADAPTER_VERSION,
                hash: await contentHash(content), raw_hash: await contentHash(sanitized) });
            } catch (error) {
              results.push({ id, status: 'unsupported', error: error instanceof Error ? error.message : 'Unsupported rule' });
            }
          }
        }
      }
    }
    if (kind === 'inventory') {
      checked(await deps.db.rpc('siem_commit_inventory_chunk', { p_run: run.id, p_lease: run.lease_token,
        p_ids: ids, p_next: next, p_discovery_complete: done, p_results: results }));
    } else if (kind === 'import_selection') {
      checked(await deps.db.rpc('siem_commit_import_chunk', { p_run: run.id, p_lease: run.lease_token,
        p_results: results }));
    } else {
      checked(await deps.db.rpc('siem_commit_chunk', { p_run: run.id, p_lease: run.lease_token,
        p_ids: ids, p_next: next, p_discovery_complete: done, p_results: results }));
    }
  } catch (error) {
    // Fenced failure: an expired worker cannot change a replacement worker's state.
    checked(await deps.db.from('siem_sync_runs').update({
      status: run.attempts >= 4 ? 'failed' : 'queued', attempts: run.attempts + 1,
      completed_at: run.attempts >= 4 ? new Date().toISOString() : null,
      error_message: error instanceof Error ? error.message : 'Sync failed',
      lease_token: null, lease_expires_at: null,
      next_attempt_at: new Date(Date.now() + Math.min(300000, 15000 * 2 ** run.attempts)).toISOString(),
    }).eq('id', run.id).eq('lease_token', run.lease_token));
  }
  return { processed: true };
}

async function boundRule(deps: Dependencies, bindingId: string, actor: string) {
  const binding = checked(await deps.db.from('siem_rule_bindings').select('*').eq('id', bindingId).single());
  const integration = await connection(deps, binding.integration_id, actor);
  if (crowdStrikeScope(integration.config) !== binding.provider_scope) throw new Error('Connection scope changed');
  const detection = checked(await deps.db.from('detections').select('*').eq('id', binding.detection_id).single());
  // Rule family lives on the catalog row, not the binding: it is a property of the rule in
  // CrowdStrike, and it decides whether this adapter can serialize a write for it at all.
  const catalog = (checked(await deps.db.from('siem_remote_rules')
    .select('rule_family')
    .eq('integration_id', binding.integration_id)
    .eq('provider_scope', binding.provider_scope)
    .eq('vendor_rule_id', binding.vendor_rule_id)) ?? [])[0] ?? null;
  const snapshots = checked(await deps.db.from('siem_rule_snapshots').select('*')
    .in('id', [binding.baseline_snapshot_id, binding.latest_remote_snapshot_id])) ?? [];
  // A missing baseline is a real, reviewable state -- a link whose query differs from production
  // is created that way on purpose -- so only the remote observation is required to open a
  // comparison. Refusing here is what made the match dialog offer a review that could not open.
  const baseline = snapshots.find(s => s.id === binding.baseline_snapshot_id) ?? null;
  const remote = snapshots.find(s => s.id === binding.latest_remote_snapshot_id);
  if (!remote) throw new Error('Sync this rule before reviewing changes');
  const local = localContent(detection, binding.selected_query_id, binding.desired_content);
  return { binding, integration, detection, baseline, remote, local,
           ruleFamily: (catalog?.rule_family as string | undefined) ?? null };
}

export async function handleNativeRequest(deps: Dependencies, body: NativeRequest, actor: string): Promise<unknown> {
  if (body.action === 'native_disconnect') {
    checked(await deps.db.rpc('siem_disconnect', { p_actor: actor, p_integration: body.integrationId }));
    return { success: true };
  }
  if (body.action === 'native_sync_start' || body.action === 'native_inventory_start') {
    const integration = await connection(deps, body.integrationId || '', actor);
    return checked(await deps.db.rpc('siem_start_inventory', { p_actor: actor, p_integration: integration.id,
      p_scope: crowdStrikeScope(integration.config) }));
  }
  if (body.action === 'native_import_cancel') {
    checked(await deps.db.rpc('siem_cancel_import', { p_actor: actor, p_run: body.runId }));
    return { success: true };
  }
  if (body.action === 'native_import_retry') {
    return checked(await deps.db.rpc('siem_retry_import', { p_actor: actor, p_run: body.runId }));
  }
  if (body.action === 'native_refresh_tracked') {
    const integration = await connection(deps, body.integrationId || '', actor);
    return checked(await deps.db.rpc('siem_start_refresh', { p_actor: actor, p_integration: integration.id,
      p_scope: crowdStrikeScope(integration.config) }));
  }
  if (body.action === 'native_import_start') {
    const integration = await connection(deps, body.integrationId || '', actor);
    const ids = body.ids || [];
    if (!body.allMatching && !ids.length) throw new Error('Select the rules you want to import');
    if (!body.idempotencyKey) throw new Error('An import request key is required');
    return checked(await deps.db.rpc('siem_start_import', {
      p_actor: actor, p_integration: integration.id, p_source_run: body.sourceRunId,
      p_ids: body.allMatching ? [] : ids, p_exclude: body.excludeIds || [],
      p_all_matching: Boolean(body.allMatching), p_idempotency: body.idempotencyKey,
      // The filter the count was computed under travels with the selection, so "all N matching"
      // freezes exactly the N rows the table was showing rather than the whole catalog.
      p_search: body.selectionSearch || null, p_relationship: body.selectionRelationship || null }));
  }
  if (body.action === 'native_match_candidates') {
    const integration = await connection(deps, body.integrationId || '', actor);
    if (!body.vendorRuleId) throw new Error('A CrowdStrike rule id is required');
    return checked(await deps.db.rpc('siem_match_candidates', {
      p_actor: actor, p_integration: integration.id, p_vendor_rule_id: body.vendorRuleId,
    }));
  }
  if (body.action === 'native_dismiss_match') {
    const integration = await connection(deps, body.integrationId || '', actor);
    if (!body.remoteRuleId) throw new Error('A catalog rule is required');
    checked(await deps.db.rpc('siem_dismiss_match_candidates', {
      p_actor: actor, p_integration: integration.id, p_remote_rule_id: body.remoteRuleId,
    }));
    return { success: true };
  }
  if (body.action === 'native_link_existing') {
    const integration = await connection(deps, body.integrationId || '', actor);
    if (!body.vendorRuleId || !body.detectionId || !body.queryId || body.detectionVersion == null || !body.snapshotId) {
      throw new Error('Choose a library rule and query to link');
    }
    return checked(await deps.db.rpc('siem_link_existing', {
      p_actor: actor, p_integration: integration.id, p_vendor_rule_id: body.vendorRuleId,
      p_detection: body.detectionId, p_query_id: body.queryId, p_detection_version: body.detectionVersion,
      p_snapshot: body.snapshotId,
    }));
  }
  const state = await boundRule(deps, body.bindingId || '', actor);
  const { binding, detection, baseline, remote, local, integration, ruleFamily } = state;
  const drift = classifyDrift(baseline?.content ?? null, local, remote.content, binding.availability);
  const mutationContext = {
    writesEnabled: deps.writesEnabled, provider: binding.provider as string, ruleFamily,
    bindingStatus: binding.binding_status,
    availability: binding.availability, drift, pendingOperation: binding.pending_operation_id != null,
  };
  if (body.action === 'native_preview') return {
    binding, baseline: baseline?.content ?? null, remote: remote.content, local, drift,
    remoteHash: remote.content_hash, localVersion: detection.version, writesEnabled: deps.writesEnabled,
    // Every reason the UI needs to explain a disabled action, computed by the same predicate the
    // server refuses with — so a button is never offered for an operation that cannot run.
    capabilities: Object.fromEntries(
      NATIVE_OPERATIONS.map(op => [op, mutationBlockedReason(op, mutationContext)]),
    ) as Record<NativeOperation, string | null>,
  };
  if (!checked(await deps.db.rpc('siem_can_import', { p_actor: actor, p_integration: integration.id }))) {
    throw new Error('Native import permission denied');
  }
  if (body.action === 'native_reconcile') {
    // Keep the library version and agree that this is the production revision it diverged from.
    // The sibling decision is native_accept, which takes production's version instead.
    checked(await deps.db.rpc('siem_reconcile_baseline', { p_actor: actor, p_binding: binding.id,
      p_snapshot: remote.id, p_version: detection.version, p_hash: body.expectedHash }));
    return { success: true };
  }
  if (body.action === 'native_accept') {
    checked(await deps.db.rpc('siem_accept_remote', { p_actor: actor, p_binding: binding.id,
      p_snapshot: remote.id, p_version: body.expectedVersion, p_hash: body.expectedHash }));
    return { success: true };
  }
  if (body.action === 'native_save' || body.action === 'native_restore') {
    let desired: RuleContent;
    if (body.action === 'native_restore') {
      const revision = checked(await deps.db.from('siem_local_revisions').select('content,binding_contents')
        .eq('id', body.revisionId || '').eq('detection_id', detection.id).single());
      const config = revision?.binding_contents?.[binding.id];
      if (!config) throw new Error('This revision does not contain configuration for this connection');
      desired = localContent(revision.content, binding.selected_query_id, config);
    } else {
      const changes = body.localChanges;
      if (!changes || Object.values(changes).some(value => typeof value !== 'string') ||
          !changes.name?.trim() || !changes.query?.trim() || !changes.schedule?.trim() || !changes.lookback?.trim() ||
          !['Critical','High','Medium','Low','Informational'].includes(changes.severity)) throw new Error('Invalid rule changes');
      desired = { ...local, name: changes.name, description: changes.description, query: changes.query, severity: changes.severity,
        config: { ...local.config,
          search: { ...(local.config.search as Record<string, Json>), lookback: changes.lookback },
          operation: { ...(local.config.operation as Record<string, Json>), schedule: { definition: changes.schedule } } } };
    }
    checked(await deps.db.rpc('siem_save_local', { p_actor: actor, p_binding: binding.id,
      p_version: body.expectedVersion, p_content: desired }));
    return { success: true };
  }
  if (body.action !== 'native_apply') throw new Error('Unknown native SIEM action');
  return await applyNativeMutation(deps, {
    bindingId: binding.id,
    operation: (body.operation || 'update') as NativeOperation,
    expectedVersion: body.expectedVersion as number,
    expectedHash: body.expectedHash as string,
  }, actor);
}

export interface NativeMutationParams {
  bindingId: string;
  operation: NativeOperation;
  expectedVersion: number;
  expectedHash: string;
}

/**
 * The one production write path. Called by the unified deploy route and, until it is removed, by
 * the `native_apply` action. Both must go through here: the pre-write read, the readback, the
 * uncertain-outcome handling and the capability gate are the reason this path exists, and a second
 * caller that skipped any of them would be the duplicate path this merge exists to delete.
 */
export async function applyNativeMutation(
  deps: Dependencies,
  params: NativeMutationParams,
  actor: string,
): Promise<{ success: true }> {
  const { binding, detection, baseline, remote, local, integration, ruleFamily } =
    await boundRule(deps, params.bindingId, actor);
  if (!checked(await deps.db.rpc('siem_can_import', { p_actor: actor, p_integration: integration.id }))) {
    throw new Error('Native import permission denied');
  }
  const drift = classifyDrift(baseline?.content ?? null, local, remote.content, binding.availability);
  const operation = params.operation;
  // One predicate, used by the preview to explain and here to refuse. Previously these checks
  // lived only here, so the UI learned an action was impossible only after the user chose it.
  const blocked = mutationBlockedReason(operation, {
    writesEnabled: deps.writesEnabled, provider: binding.provider as string, ruleFamily,
    bindingStatus: binding.binding_status, availability: binding.availability, drift,
    pendingOperation: binding.pending_operation_id != null,
  });
  if (blocked) throw new Error(blocked);
  if (params.expectedVersion !== detection.version || params.expectedHash !== remote.content_hash) throw new Error('Review is stale; refresh the diff');
  const isToggle = operation === 'enable' || operation === 'disable';
  const desired = isToggle ? { ...remote.content, enabled: operation === 'enable' } : local;
  // Permission, eligibility and operation lease are checked atomically before any vendor mutation.
  const operationId = checked(await deps.db.rpc('siem_begin_deployment', { p_actor: actor, p_binding: binding.id,
    p_version: detection.version, p_hash: remote.content_hash, p_content: desired, p_action: operation }));
  let attempted = false;
  try {
    const request = await client(deps, integration);
    const read = async () => {
      const response = await request(`entities/rules/v1?ids=${encodeURIComponent(binding.vendor_rule_id)}`);
      const raw = (response.resources as Record<string, Json>[])?.find(row => matchesVendorRule(row, binding.vendor_rule_id));
      if (!raw) throw new Error('Rule is missing in production; automatic recreation is disabled');
      return { raw, content: normalizeCrowdStrike(raw) };
    };
    const before = await read();
    if (await contentHash(before.content) !== params.expectedHash) throw new Error('Production changed since review; sync and review again');
    // Serialize before marking the operation as attempted; unsupported payloads are safe failures.
    const payload = params.operation === 'delete' ? undefined : isToggle ?
      { id: binding.vendor_rule_id, status: desired.enabled ? 'active' : 'inactive' } : crowdStrikeUpdate(binding.vendor_rule_id, desired);
    attempted = true;
    await request(operation === 'delete' ? `entities/rules/v1?ids=${encodeURIComponent(binding.vendor_rule_id)}` : 'entities/rules/v1',
      { method: operation === 'delete' ? 'DELETE' : 'PATCH', ...(payload ? { body: JSON.stringify([payload]) } : {}) });
    let after: { raw: Record<string, Json>; content: RuleContent } | null = null;
    if (operation === 'delete') {
      const response = await request(`entities/rules/v1?ids=${encodeURIComponent(binding.vendor_rule_id)}`);
      if (!Array.isArray(response.resources) || response.resources.some(row => matchesVendorRule(row as Record<string, Json>, binding.vendor_rule_id))) {
        throw new Error('Deletion could not be verified');
      }
    } else {
      after = await read();
      if (await contentHash(after.content) !== await contentHash(desired)) throw new Error('Production readback differs from the reviewed change');
    }
    const raw = after ? sanitizeSnapshot(after.raw) : null;
    checked(await deps.db.rpc('siem_finish_deployment', { p_operation: operationId, p_actor: actor,
      p_content: after?.content || null, p_raw: raw, p_hash: after ? await contentHash(after.content) : null,
      p_raw_hash: raw ? await contentHash(raw) : null, p_adapter: ADAPTER_VERSION }));
    return { success: true };
  } catch (error) {
    checked(await deps.db.rpc('siem_fail_deployment', { p_operation: operationId, p_actor: actor,
      p_uncertain: attempted, p_error: attempted ? 'Vendor write attempted; sync and verify production before retrying' :
        error instanceof Error ? error.message : 'Deployment failed' }));
    throw error;
  }
}
