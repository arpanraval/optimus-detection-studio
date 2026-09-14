import type { SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2.39.3';
import { ADAPTER_VERSION, contentHash, crowdStrikeScope, normalizeCrowdStrike, sanitizeSnapshot,
  classifyDrift, localContent, crowdStrikeUpdate, type Json, type RuleContent } from './native-siem-model.ts';

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
  idempotencyKey?: string;
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
        .eq('run_id', run.id).eq('status', 'pending').order('vendor_rule_id').limit(10));
      const requested = items.map(item => item.vendor_rule_id as string);
      if (requested.length) {
        const page = await request(`entities/rules/v1?${requested.map(id => `ids=${encodeURIComponent(id)}`).join('&')}`);
        if (!Array.isArray(page.resources)) throw new Error('Invalid rule detail response');
        const byId = new Map((page.resources as Record<string, Json>[]).map(raw => [raw.id, raw]));
        if (kind === 'inventory') {
          for (const id of requested) {
            const raw = byId.get(id);
            if (!raw) { results.push({ id, status: 'failed', error: 'Rule detail was omitted; no deletion inferred' }); continue; }
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
            if (!raw) { results.push({ id, status: 'failed', error: 'Rule detail was omitted; no deletion inferred' }); continue; }
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
  const snapshots = checked(await deps.db.from('siem_rule_snapshots').select('*')
    .in('id', [binding.baseline_snapshot_id, binding.latest_remote_snapshot_id]));
  const baseline = snapshots.find(s => s.id === binding.baseline_snapshot_id);
  const remote = snapshots.find(s => s.id === binding.latest_remote_snapshot_id);
  if (!baseline || !remote) throw new Error('Sync this rule before reviewing changes');
  const local = localContent(detection, binding.selected_query_id, binding.desired_content);
  return { binding, integration, detection, baseline, remote, local };
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
      p_all_matching: Boolean(body.allMatching), p_idempotency: body.idempotencyKey }));
  }
  const state = await boundRule(deps, body.bindingId || '', actor);
  const { binding, detection, baseline, remote, local, integration } = state;
  if (body.action === 'native_preview') return {
    binding, baseline: baseline.content, remote: remote.content, local,
    drift: classifyDrift(baseline.content, local, remote.content, binding.availability),
    remoteHash: remote.content_hash, localVersion: detection.version, writesEnabled: deps.writesEnabled,
  };
  if (!checked(await deps.db.rpc('siem_can_import', { p_actor: actor, p_integration: integration.id }))) {
    throw new Error('Native import permission denied');
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
  if (!deps.writesEnabled) throw new Error('Native production writes are not enabled for this installation');
  if (binding.binding_status !== 'active' || binding.availability !== 'present') throw new Error('Binding is not active in production');
  if (body.expectedVersion !== detection.version || body.expectedHash !== remote.content_hash) throw new Error('Review is stale; refresh the diff');
  const isToggle = body.operation === 'enable' || body.operation === 'disable';
  if (isToggle && ['remote_changed', 'conflict'].includes(classifyDrift(baseline.content, local, remote.content))) {
    throw new Error('Resolve production drift before changing enabled state');
  }
  const desired = isToggle ? { ...remote.content, enabled: body.operation === 'enable' } : local;
  // Permission, eligibility and operation lease are checked atomically before any vendor mutation.
  const operation = checked(await deps.db.rpc('siem_begin_deployment', { p_actor: actor, p_binding: binding.id,
    p_version: detection.version, p_hash: remote.content_hash, p_content: desired, p_action: body.operation || 'update' }));
  let attempted = false;
  try {
    const request = await client(deps, integration);
    const read = async () => {
      const response = await request(`entities/rules/v1?ids=${encodeURIComponent(binding.vendor_rule_id)}`);
      const raw = (response.resources as Record<string, Json>[])?.find(row => row.id === binding.vendor_rule_id);
      if (!raw) throw new Error('Rule is missing in production; automatic recreation is disabled');
      return { raw, content: normalizeCrowdStrike(raw) };
    };
    const before = await read();
    if (await contentHash(before.content) !== body.expectedHash) throw new Error('Production changed since review; sync and review again');
    // Serialize before marking the operation as attempted; unsupported payloads are safe failures.
    const payload = body.operation === 'delete' ? undefined : isToggle ?
      { id: binding.vendor_rule_id, status: desired.enabled ? 'active' : 'inactive' } : crowdStrikeUpdate(binding.vendor_rule_id, desired);
    attempted = true;
    await request(body.operation === 'delete' ? `entities/rules/v1?ids=${encodeURIComponent(binding.vendor_rule_id)}` : 'entities/rules/v1',
      { method: body.operation === 'delete' ? 'DELETE' : 'PATCH', ...(payload ? { body: JSON.stringify([payload]) } : {}) });
    let after: { raw: Record<string, Json>; content: RuleContent } | null = null;
    if (body.operation === 'delete') {
      const response = await request(`entities/rules/v1?ids=${encodeURIComponent(binding.vendor_rule_id)}`);
      if (!Array.isArray(response.resources) || response.resources.some(row => (row as Record<string, Json>).id === binding.vendor_rule_id)) {
        throw new Error('Deletion could not be verified');
      }
    } else {
      after = await read();
      if (await contentHash(after.content) !== await contentHash(desired)) throw new Error('Production readback differs from the reviewed change');
    }
    const raw = after ? sanitizeSnapshot(after.raw) : null;
    checked(await deps.db.rpc('siem_finish_deployment', { p_operation: operation, p_actor: actor,
      p_content: after?.content || null, p_raw: raw, p_hash: after ? await contentHash(after.content) : null,
      p_raw_hash: raw ? await contentHash(raw) : null, p_adapter: ADAPTER_VERSION }));
    return { success: true };
  } catch (error) {
    checked(await deps.db.rpc('siem_fail_deployment', { p_operation: operation, p_actor: actor,
      p_uncertain: attempted, p_error: attempted ? 'Vendor write attempted; sync and verify production before retrying' :
        error instanceof Error ? error.message : 'Deployment failed' }));
    throw error;
  }
}
