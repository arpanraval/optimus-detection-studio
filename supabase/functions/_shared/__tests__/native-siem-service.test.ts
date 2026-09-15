// @vitest-environment node
import { describe, expect, it, vi } from 'vitest';
import { applyNativeMutation, handleNativeRequest, processNativeSync, readRuleDetails } from '../native-siem-service';
import { contentHash, crowdStrikeScope, normalizeCrowdStrike } from '../native-siem-model';

const config = { baseUrl: 'https://api.crowdstrike.com', customerId: 'a'.repeat(32) };
/** A library edit, so an update has something to send. */
const EDITED_QUERY = '#event_simpleName=ProcessRollup2 | ParentBaseFileName=explorer.exe';
const raw = { id: 'remote-1', name: 'Rule', description: '', status: 'active', severity: 50,
  search: { filter: 'query', outcome: 'detection', lookback: '1h' }, operation: { schedule: { definition: '@every 1h' } } };

async function fixture(options: { phase?: string; enabled?: boolean; resource?: unknown; stale?: boolean;
  noBaseline?: boolean; localQuery?: string; afterResource?: unknown;
  pendingOperation?: boolean; ruleFamily?: string; connectionStatus?: string;
  writeRejection?: { status: number; message: string } } = {}) {
  const content = normalizeCrowdStrike(raw), hash = await contentHash(content);
  // This fixture exercises the legacy siem_commit_chunk path: kind 'refresh_tracked' is a real
  // kind (re-observing rules already tracked in the library) that Task 8 does not touch, so it
  // still falls through to siem_commit_chunk in processNativeSync. (Task 8 gave 'import_selection'
  // its own branch to siem_commit_import_chunk -- see native-siem-import.test.ts for that path.)
  const run = { id: 'run', kind: 'refresh_tracked', actor_id: 'owner', integration_id: 'connection', provider_scope: crowdStrikeScope(config),
    phase: options.phase || 'discovery', cursor_offset: 0, lease_token: 'lease', attempts: 0 };
  const binding = { id: 'binding', detection_id: 'detection', integration_id: 'connection', provider_scope: crowdStrikeScope(config),
    selected_query_id: 'query-id', desired_content: content,
    baseline_snapshot_id: options.noBaseline ? null : 'snap', latest_remote_snapshot_id: 'snap',
    binding_status: 'active', availability: 'present', vendor_rule_id: raw.id,
    // Set by siem_fail_deployment when a vendor write ended UNCERTAIN: the request was sent and
    // the outcome was never confirmed.
    pending_operation_id: options.pendingOperation ? 'operation-id' : null };
  const detection = { ...content, id: 'detection', version: 1,
    queries: [{ id: 'query-id', language: 'CQL', query: options.localQuery ?? content.query }] };
  const updates: unknown[] = [];
  const from = vi.fn((table: string) => {
    const data = table === 'integrations' ? { id: 'connection', config, provider: 'crowdstrike', status: options.connectionStatus ?? 'connected' } :
      table === 'siem_sync_items' ? [{ vendor_rule_id: raw.id }] : table === 'siem_rule_bindings' ? binding :
      table === 'siem_remote_rules' ? [{ rule_family: options.ruleFamily ?? 'correlation' }] :
      table === 'detections' ? detection : table === 'siem_rule_snapshots' ? [{ id: 'snap', content, content_hash: hash }] : null;
    const query: Record<string, unknown> = {};
    for (const method of ['select', 'eq', 'in', 'order', 'limit', 'single']) query[method] = vi.fn(() => query);
    query.update = vi.fn(value => { updates.push(value); return query; });
    query.then = (resolve: (result: unknown) => void) => resolve({ data, error: null });
    return query;
  });
  const rpc = vi.fn(async (name: string) => ({ data: name === 'siem_claim_sync' ? [run] : name === 'siem_can_import' ? true :
    name === 'siem_begin_deployment' ? 'operation-id' : null, error: null }));
  // A GET after the write must be able to differ from the GET before it -- that is the whole
  // shape of an update: read the current rule, PATCH, read back the changed one.
  let written = false;
  const fetch = vi.fn(async (_url: string, request: RequestInit) => {
    if (request.method === 'PATCH' || request.method === 'DELETE') {
      if (options.writeRejection) {
        return new Response(JSON.stringify({ errors: [{ message: options.writeRejection.message }] }),
          { status: options.writeRejection.status });
      }
      written = true;
      return new Response(JSON.stringify({ resources: [raw] }));
    }
    if (written && options.afterResource) {
      return new Response(JSON.stringify({ resources: options.afterResource }));
    }
    return new Response(JSON.stringify({ resources: options.resource ?? [options.stale ? { ...raw, name: 'Changed remotely' } : raw] }));
  });
  const deps = { db: { from, rpc } as never, credentials: vi.fn(async () => ({ clientId: 'client', clientSecret: 'secret' })),
    token: vi.fn(async () => 'token'), fetch, writesEnabled: options.enabled ?? false };
  return { deps, rpc, from, updates, hash, binding, detection };
}

describe('durable native sync worker', () => {
  it('checkpoints a discovery page without assuming a missing total is zero', async () => {
    const { deps, rpc } = await fixture({ resource: ['remote-1'] });
    await processNativeSync(deps);
    expect(rpc).toHaveBeenCalledWith('siem_commit_chunk', expect.objectContaining({ p_ids: ['remote-1'], p_next: 1, p_discovery_complete: false }));
    expect(deps.fetch).toHaveBeenCalledTimes(1);
  });
  it('hydrates full payloads into persistent import results', async () => {
    const { deps, rpc } = await fixture({ phase: 'hydration' });
    await processNativeSync(deps);
    expect(rpc).toHaveBeenCalledWith('siem_commit_chunk', expect.objectContaining({ p_results: [expect.objectContaining({ id: raw.id, raw, content: normalizeCrowdStrike(raw) })] }));
  });
  it('marks omitted detail as failed rather than inferring deletion', async () => {
    const { deps, rpc } = await fixture({ phase: 'hydration', resource: [] });
    await processNativeSync(deps);
    expect(rpc).toHaveBeenCalledWith('siem_commit_chunk', expect.objectContaining({ p_results: [expect.objectContaining({ status: 'failed' })] }));
  });
  it('does not advance checkpoints on provider failure and schedules retry', async () => {
    const { deps, rpc, updates } = await fixture();
    deps.fetch.mockResolvedValue(new Response('rate limited', { status: 429 }));
    await processNativeSync(deps);
    expect(rpc.mock.calls.some(([name]) => name === 'siem_commit_chunk')).toBe(false);
    expect(updates).toContainEqual(expect.objectContaining({ status: 'queued', attempts: 1, lease_token: null }));
  });
});

describe('comparison without an agreed baseline', () => {
  // The match dialog offers "review changes" for a link whose query already differs from
  // production, but boundRule refused to open one without a baseline ("Sync this rule before
  // reviewing changes") -- a promise the product could not keep, and refreshing was not an escape
  // because the observational commit path would have manufactured the baseline instead.
  it('opens the comparison and names the state instead of refusing', async () => {
    const { deps, hash } = await fixture({ noBaseline: true, localQuery: 'a different query' });
    const preview = await handleNativeRequest(deps,
      { action: 'native_preview', bindingId: 'binding', expectedHash: hash, expectedVersion: 1 }, 'owner') as
      { baseline: unknown; drift: string };
    expect(preview.baseline).toBeNull();
    expect(preview.drift).toBe('no_baseline');
  });

  it('routes the explicit decision to siem_reconcile_baseline without touching content', async () => {
    const { deps, rpc, hash } = await fixture({ noBaseline: true, localQuery: 'a different query' });
    await handleNativeRequest(deps,
      { action: 'native_reconcile', bindingId: 'binding', expectedHash: hash, expectedVersion: 1 }, 'owner');
    expect(rpc).toHaveBeenCalledWith('siem_reconcile_baseline', expect.objectContaining({
      p_actor: 'owner', p_binding: 'binding', p_snapshot: 'snap' }));
    // Keeping the library version is the whole point: no content write, no vendor call.
    expect(rpc).not.toHaveBeenCalledWith('siem_accept_remote', expect.anything());
    expect(deps.fetch).not.toHaveBeenCalled();
  });

  it('still refuses when production has never been observed at all', async () => {
    const { deps, hash } = await fixture();
    const from = deps.db.from as ReturnType<typeof vi.fn>;
    from.mockImplementation((table: string) => {
      const query: Record<string, unknown> = {};
      for (const method of ['select', 'eq', 'in', 'order', 'limit', 'single']) query[method] = vi.fn(() => query);
      const data = table === 'integrations' ? { id: 'connection', config, provider: 'crowdstrike', status: 'connected' } :
        table === 'siem_rule_bindings' ? { id: 'binding', detection_id: 'detection', integration_id: 'connection',
          provider_scope: crowdStrikeScope(config), selected_query_id: 'query-id', desired_content: {},
          baseline_snapshot_id: null, latest_remote_snapshot_id: null, binding_status: 'active',
          availability: 'present', vendor_rule_id: raw.id } :
        table === 'detections' ? { id: 'detection', version: 1, queries: [] } :
        table === 'siem_rule_snapshots' ? [] : null;
      query.then = (resolve: (result: unknown) => void) => resolve({ data, error: null });
      return query;
    });
    await expect(handleNativeRequest(deps,
      { action: 'native_preview', bindingId: 'binding', expectedHash: hash, expectedVersion: 1 }, 'owner'))
      .rejects.toThrow('Sync this rule before reviewing changes');
  });
});

describe('native production mutation boundary', () => {
  it('blocks writes before vendor access when the installation gate is off', async () => {
    const { deps, hash } = await fixture();
    await expect(applyNativeMutation(deps, { bindingId: 'binding', operation: 'update', expectedHash: hash, expectedVersion: 1 }, 'owner')).rejects.toThrow('not enabled');
    expect(deps.fetch).not.toHaveBeenCalled();
  });
  it('does not PATCH after a production change since review', async () => {
    const { deps, hash, rpc } = await fixture({ enabled: true, stale: true, localQuery: EDITED_QUERY });
    await expect(applyNativeMutation(deps, { bindingId: 'binding', operation: 'update', expectedHash: hash, expectedVersion: 1 }, 'owner')).rejects.toThrow('Production changed');
    expect(deps.fetch.mock.calls.every(([, request]) => request.method !== 'PATCH')).toBe(true);
    expect(rpc).toHaveBeenCalledWith('siem_fail_deployment', expect.objectContaining({ p_uncertain: false }));
  });
  it('updates the original ID and verifies readback without creating a rule', async () => {
    const { deps, hash, rpc } = await fixture({
      enabled: true, localQuery: EDITED_QUERY, afterResource: [{ ...raw, search: { ...raw.search, filter: '#event_simpleName=ProcessRollup2 | ParentBaseFileName=explorer.exe' } }] });
    await applyNativeMutation(deps, { bindingId: 'binding', operation: 'update', expectedHash: hash, expectedVersion: 1 }, 'owner');
    const writes = deps.fetch.mock.calls.filter(([, request]) => request.method === 'PATCH');
    expect(writes).toHaveLength(1);
    expect(JSON.parse(String(writes[0][1].body))[0].id).toBe(raw.id);
    expect(deps.fetch.mock.calls.some(([, request]) => request.method === 'POST')).toBe(false);
    expect(rpc).toHaveBeenCalledWith('siem_finish_deployment', expect.objectContaining({ p_operation: 'operation-id' }));
  });
  // Same stable-identity trap the hydration reader hit: an edited rule comes back from the
  // entity endpoint under its CURRENT VERSION's `id`, with the stable id in `rule_id`. Matching
  // `id` alone made preflight declare a present rule missing, so no edited rule could ever be
  // updated -- and made delete verification accept a rule that is still there.
  it('finds an edited rule returned under its version id during preflight', async () => {
    const versionId = 'version-of-remote-1';
    const { deps, hash } = await fixture({
      enabled: true, localQuery: EDITED_QUERY,
      resource: [{ ...raw, id: versionId, rule_id: raw.id }],
      afterResource: [{ ...raw, id: versionId, rule_id: raw.id, search: { ...raw.search, filter: EDITED_QUERY } }],
    });
    await applyNativeMutation(deps, { bindingId: 'binding', operation: 'update', expectedHash: hash, expectedVersion: 1 }, 'owner');
    const writes = deps.fetch.mock.calls.filter(([, request]) => request.method === 'PATCH');
    expect(writes).toHaveLength(1);
    // The write still addresses the stable identity we track, never the version id.
    expect(JSON.parse(String(writes[0][1].body))[0].id).toBe(raw.id);
  });
  it('refuses to confirm a deletion when the rule is still returned under its version id', async () => {
    const { deps, hash, rpc } = await fixture({
      enabled: true, resource: [{ ...raw, id: 'version-of-remote-1', rule_id: raw.id }] });
    await expect(applyNativeMutation(deps, { bindingId: 'binding', operation: 'delete',
      expectedHash: hash, expectedVersion: 1 }, 'owner')).rejects.toThrow('Deletion could not be verified');
    expect(rpc).toHaveBeenCalledWith('siem_fail_deployment', expect.objectContaining({ p_uncertain: true }));
  });
  it('publishes the reason each operation is unavailable, not just a boolean gate', async () => {
    const { deps, hash } = await fixture();
    const preview = await handleNativeRequest(deps,
      { action: 'native_preview', bindingId: 'binding', expectedHash: hash, expectedVersion: 1 }, 'owner') as
      { capabilities: Record<string, string | null> };
    // Gate is off in this fixture, so every operation carries the installation reason.
    for (const op of ['update', 'enable', 'disable', 'delete']) {
      expect(preview.capabilities[op]).toMatch(/not enabled for this installation/);
    }
  });

  it('refuses an apply with the same sentence the preview showed', async () => {
    const { deps, hash } = await fixture({ enabled: true });
    const preview = await handleNativeRequest(deps,
      { action: 'native_preview', bindingId: 'binding', expectedHash: hash, expectedVersion: 1 }, 'owner') as
      { capabilities: Record<string, string | null> };
    // Library and production agree in this fixture, so there is nothing to send.
    expect(preview.capabilities.update).toBe('The library copy already matches CrowdStrike.');
    await expect(applyNativeMutation(deps,
      { bindingId: 'binding', operation: 'update', expectedHash: hash, expectedVersion: 1 }, 'owner'))
      .rejects.toThrow('The library copy already matches CrowdStrike.');
    expect(deps.fetch).not.toHaveBeenCalled();
  });

  // deployRouteDecision sends exactly this shape for enable/disable/delete: no reviewed hash or
  // version at all, because those operations carry no library content to diff. If the pre-write
  // freshness check regressed to compare against the caller's (now-empty) expectedHash instead of
  // the binding's current reviewed hash, this would throw "Production changed since review" for
  // every such request and make enable/disable/delete impossible again.
  it('reaches the vendor for a toggle sent with no reviewed hash or version', async () => {
    const { deps, rpc } = await fixture({ enabled: true });
    await applyNativeMutation(deps, { bindingId: 'binding', operation: 'enable', expectedHash: '', expectedVersion: 0 }, 'owner');
    const writes = deps.fetch.mock.calls.filter(([, request]) => request.method === 'PATCH');
    expect(writes).toHaveLength(1);
    expect(JSON.parse(String(writes[0][1].body))[0]).toMatchObject({ id: raw.id, status: 'active' });
    expect(rpc).toHaveBeenCalledWith('siem_finish_deployment', expect.objectContaining({ p_operation: 'operation-id' }));
  });

  it('reaches the vendor for a delete sent with no reviewed hash or version', async () => {
    const { deps, rpc } = await fixture({ enabled: true, afterResource: [] });
    await applyNativeMutation(deps, { bindingId: 'binding', operation: 'delete', expectedHash: '', expectedVersion: 0 }, 'owner');
    const writes = deps.fetch.mock.calls.filter(([, request]) => request.method === 'DELETE');
    expect(writes).toHaveLength(1);
    expect(rpc).toHaveBeenCalledWith('siem_finish_deployment', expect.objectContaining({ p_operation: 'operation-id' }));
  });

  it('records uncertainty when a write fails instead of blindly retrying', async () => {
    const { deps, hash, rpc } = await fixture({ enabled: true, localQuery: EDITED_QUERY });
    deps.fetch.mockImplementation(async (_url, request) => {
      if (request.method === 'PATCH') throw new Error('timeout');
      return new Response(JSON.stringify({ resources: [raw] }));
    });
    await expect(applyNativeMutation(deps, { bindingId: 'binding', operation: 'update', expectedHash: hash, expectedVersion: 1 }, 'owner')).rejects.toThrow('timeout');
    expect(deps.fetch.mock.calls.filter(([, request]) => request.method === 'PATCH')).toHaveLength(1);
    expect(rpc).toHaveBeenCalledWith('siem_fail_deployment', expect.objectContaining({ p_uncertain: true }));
  });
});

describe('import entry point', () => {
  it('starting from a connection opens an inventory job, not an auto-import', async () => {
    const { deps, rpc } = await fixture();
    await handleNativeRequest(deps, { action: 'native_inventory_start', integrationId: 'connection' }, 'owner');
    expect(rpc).toHaveBeenCalledWith('siem_start_inventory', expect.objectContaining({
      p_actor: 'owner', p_integration: 'connection' }));
    expect(rpc).not.toHaveBeenCalledWith('siem_start_sync', expect.anything());
  });

  it('keeps the legacy action name working without importing anything', async () => {
    const { deps, rpc } = await fixture();
    await handleNativeRequest(deps, { action: 'native_sync_start', integrationId: 'connection' }, 'owner');
    expect(rpc).toHaveBeenCalledWith('siem_start_inventory', expect.anything());
    expect(rpc).not.toHaveBeenCalledWith('siem_start_sync', expect.anything());
  });

  it('refreshing tracked rules is a distinct job that imports nothing new', async () => {
    const { deps, rpc } = await fixture();
    await handleNativeRequest(deps, { action: 'native_refresh_tracked', integrationId: 'connection' }, 'owner');
    expect(rpc).toHaveBeenCalledWith('siem_start_refresh', expect.anything());
  });
});

describe('uncertain outcomes and unsupported families', () => {
  // A write whose outcome was never confirmed leaves pending_operation_id set. Retrying blind
  // could duplicate a change that actually landed, so production has to be observed first --
  // and the user has to be told that, not just refused.
  it('blocks every further write while an earlier one is unresolved, and says why', async () => {
    const { deps, hash } = await fixture({ enabled: true, pendingOperation: true, localQuery: EDITED_QUERY });
    const preview = await handleNativeRequest(deps,
      { action: 'native_preview', bindingId: 'binding', expectedHash: hash, expectedVersion: 1 }, 'owner') as
      { capabilities: Record<string, string | null> };
    for (const op of ['update', 'enable', 'disable', 'delete']) {
      expect(preview.capabilities[op]).toMatch(/has not finished/);
    }
    await expect(applyNativeMutation(deps,
      { bindingId: 'binding', operation: 'update', expectedHash: hash, expectedVersion: 1 }, 'owner'))
      .rejects.toThrow(/has not finished/);
    expect(deps.fetch).not.toHaveBeenCalled();
  });

  // A rule family the adapter can read but has no serializer for must not offer writes at all:
  // crowdStrikeUpdate would have to invent fields it has no mapping for.
  it('offers no production write for a rule family it cannot serialize back', async () => {
    const { deps, hash } = await fixture({ enabled: true, ruleFamily: 'ioa', localQuery: EDITED_QUERY });
    const preview = await handleNativeRequest(deps,
      { action: 'native_preview', bindingId: 'binding', expectedHash: hash, expectedVersion: 1 }, 'owner') as
      { capabilities: Record<string, string | null> };
    expect(preview.capabilities.update).toMatch(/cannot change them in CrowdStrike/);
    await expect(applyNativeMutation(deps,
      { bindingId: 'binding', operation: 'delete', expectedHash: hash, expectedVersion: 1 }, 'owner'))
      .rejects.toThrow(/cannot change them in CrowdStrike/);
    expect(deps.fetch).not.toHaveBeenCalled();
  });
});

describe('rule detail reads', () => {
  // Regression: production had one rule permanently stranded as "failed". CrowdStrike was
  // returning it every time -- the list endpoint yields a rule's STABLE id, but a rule edited
  // past version 1 comes back from the entity endpoint with `id` set to the CURRENT VERSION's
  // id and `rule_id` carrying the stable one. Matching only on `id` silently discarded it.
  it('matches a rule returned under its version id via rule_id, keyed by the requested id', async () => {
    const stable = '019c5894e8647a57a57fc986b5c84ee9';
    const versionId = '019c770c285b7a59b66a15d27388750f';
    const request = vi.fn(async () => ({
      resources: [{ id: versionId, rule_id: stable, name: 'Edited rule', version: 4 }],
    }));

    const { found, missing } = await readRuleDetails(request as never, [stable]);

    expect(found.has(stable)).toBe(true);
    expect(found.get(stable)).toMatchObject({ id: versionId, rule_id: stable });
    expect(missing.size).toBe(0);
    // One request: the match must happen on the batch, not via a needless retry.
    expect(request).toHaveBeenCalledTimes(1);
  });

  it('still records a rule as unreadable when neither id nor rule_id matches', async () => {
    const request = vi.fn(async () => ({ resources: [{ id: 'other', rule_id: 'also-other' }] }));
    const { found, missing } = await readRuleDetails(request as never, ['wanted']);
    expect(found.size).toBe(0);
    expect(missing.get('wanted')).toContain('did not return this rule');
  });

  it('retries an omitted id individually before giving up on it', async () => {
    const wanted = ['a', 'b', 'c'];
    const request = vi.fn(async (path: string) => {
      if (path.includes('ids=a&ids=b&ids=c')) return { resources: [{ id: 'a' }, { id: 'c' }] };
      if (path.includes('ids=b')) return { resources: [{ id: 'b' }] };
      return { resources: [] };
    });
    const { found, missing } = await readRuleDetails(request as never, wanted);
    expect([...found.keys()].sort()).toEqual(['a', 'b', 'c']);
    expect(missing.size).toBe(0);
    expect(request).toHaveBeenCalledTimes(2);
  });

  it('reports a genuinely unreadable rule without inferring deletion', async () => {
    const request = vi.fn(async (path: string) =>
      path.includes('ids=a&ids=b') ? { resources: [{ id: 'a' }] } : { resources: [] });
    const { found, missing } = await readRuleDetails(request as never, ['a', 'b']);
    expect(found.has('a')).toBe(true);
    expect(missing.get('b')).toBe('CrowdStrike did not return this rule. It may have been deleted or it may be a rule type this connection cannot read.');
    expect(missing.get('b')).not.toMatch(/omitted|deletion inferred/);
  });

  it('does not issue a per-id request when the batch is complete', async () => {
    const request = vi.fn(async () => ({ resources: [{ id: 'a' }, { id: 'b' }] }));
    await readRuleDetails(request as never, ['a', 'b']);
    expect(request).toHaveBeenCalledTimes(1);
  });

  it('surfaces the omitted rule as an actionable item, not a silent failure', async () => {
    const { deps, rpc } = await fixture({ phase: 'hydration', resource: [] });
    await processNativeSync(deps);
    const call = rpc.mock.calls.find(([name]) => String(name).startsWith('siem_commit'));
    expect(call?.[1].p_results[0].error).toContain('may have been deleted');
  });

  it('caps per-id retries at the chunk size and leaves the remainder pending', async () => {
    const ids = Array.from({ length: 15 }, (_, i) => `id-${i}`);
    const request = vi.fn(async () => ({ resources: [] }));
    const { found, missing } = await readRuleDetails(request as never, ids);
    expect(found.size).toBe(0);
    expect(missing.size).toBe(10);
    expect(request).toHaveBeenCalledTimes(11);
    expect(request.mock.calls.length).toBeLessThanOrEqual(ids.length + 1);
    // ids beyond the cap are left out of both maps entirely, so they remain pending for the next chunk.
    const accountedFor = new Set([...found.keys(), ...missing.keys()]);
    expect(ids.filter(id => !accountedFor.has(id))).toHaveLength(5);
  });

  // The 45s database lease, not the retry cap, is the real bound: ten sequential 10s retries
  // outlive it, the commit is then rejected as expired, and the chunk is reprocessed forever.
  it('stops retrying when the lease budget is spent and leaves the rest pending', async () => {
    const request = vi.fn(async () => ({ resources: [] as unknown[] }));
    const { found, missing } = await readRuleDetails(request as never, ['a', 'b', 'c'], 0);
    // Only the batch read happened: no per-id retry fits in a spent budget.
    expect(request).toHaveBeenCalledTimes(1);
    expect(found.size).toBe(0);
    // Unresolved is not the same as unreadable -- leaving them out of both maps is what keeps
    // the commit from recording a definite answer we never got.
    expect(missing.size).toBe(0);
  });

  it('propagates a thrown error from an individual retry instead of reporting the rule unreadable', async () => {
    const request = vi.fn(async (path: string) => {
      if (path.includes('ids=a&ids=b')) return { resources: [{ id: 'a' }] };
      throw new Error('CrowdStrike refused the request (429); fetch rules again if this persists');
    });
    await expect(readRuleDetails(request as never, ['a', 'b']))
      .rejects.toThrow('CrowdStrike refused the request (429); fetch rules again if this persists');
  });

  it('distinguishes a legitimate empty result from a thrown outage', async () => {
    // Empty resources on the individual retry is CrowdStrike's real "not found" signal -> missing.
    const emptyResult = vi.fn(async (path: string) =>
      path.includes('ids=a&ids=b') ? { resources: [{ id: 'a' }] } : { resources: [] });
    const { missing } = await readRuleDetails(emptyResult as never, ['a', 'b']);
    expect(missing.get('b')).toBe('CrowdStrike did not return this rule. It may have been deleted or it may be a rule type this connection cannot read.');

    // A thrown error on the individual retry is not evidence of anything about the rule -> propagate.
    const thrown = vi.fn(async (path: string) => {
      if (path.includes('ids=a&ids=b')) return { resources: [{ id: 'a' }] };
      throw new Error('CrowdStrike refused the request (401); fetch rules again if this persists');
    });
    await expect(readRuleDetails(thrown as never, ['a', 'b'])).rejects.toThrow(/401/);
  });
});

describe('applyNativeMutation as a shared entry point', () => {
  // There is one production write path, reached through deploy_rule. A second HTTP action that
  // also writes is the duplication this merge removed; leaving it callable would let it return.
  it('no longer accepts native_apply as an action', async () => {
    const { deps, hash } = await fixture({ enabled: true, localQuery: EDITED_QUERY });
    await expect(handleNativeRequest(deps,
      { action: 'native_apply', operation: 'update', bindingId: 'binding',
        expectedHash: hash, expectedVersion: 1 }, 'owner'))
      .rejects.toThrow('Unknown native SIEM action');
    expect(deps.fetch).not.toHaveBeenCalled();
  });

  it('performs the write that applyNativeMutation is the single path for', async () => {
    const { deps, hash, rpc } = await fixture({
      enabled: true, localQuery: EDITED_QUERY,
      afterResource: [{ ...raw, search: { ...raw.search, filter: EDITED_QUERY } }],
    });
    await applyNativeMutation(deps,
      { bindingId: 'binding', operation: 'update', expectedVersion: 1, expectedHash: hash }, 'owner');
    const writes = deps.fetch.mock.calls.filter(([, request]) => request.method === 'PATCH');
    expect(writes).toHaveLength(1);
    expect(rpc).toHaveBeenCalledWith('siem_finish_deployment', expect.anything());
  });

  // The route builds its response's `deployment` object from this id -- the client contract
  // (`data.deployment` a defined object) breaks silently if this ever comes back empty.
  it('returns the deployment_history row id it wrote, on success', async () => {
    const { deps, hash } = await fixture({
      enabled: true, localQuery: EDITED_QUERY,
      afterResource: [{ ...raw, search: { ...raw.search, filter: EDITED_QUERY } }],
    });
    const result = await applyNativeMutation(deps,
      { bindingId: 'binding', operation: 'update', expectedVersion: 1, expectedHash: hash }, 'owner');
    expect(result.success).toBe(true);
    expect(result.deploymentId).toBe('operation-id');
  });

  it('refuses through the same capability gate', async () => {
    const { deps, hash } = await fixture({ enabled: false });
    await expect(applyNativeMutation(deps,
      { bindingId: 'binding', operation: 'update', expectedVersion: 1, expectedHash: hash }, 'owner'))
      .rejects.toThrow(/not enabled for this installation/);
    expect(deps.fetch).not.toHaveBeenCalled();
  });

  // A rejected request and a lost one are different facts. CrowdStrike read this one and refused
  // it, so production is untouched: say what it objected to, and leave the rule usable instead of
  // locking it behind a reconciliation for a write that never happened.
  it('reports what CrowdStrike objected to, and does not call the write uncertain', async () => {
    const { deps, rpc, hash } = await fixture({
      enabled: true, localQuery: EDITED_QUERY,
      writeRejection: { status: 400, message: 'operation.start_on must be in the future' },
    });
    await expect(applyNativeMutation(deps,
      { bindingId: 'binding', operation: 'update', expectedVersion: 1, expectedHash: hash }, 'owner'))
      .rejects.toThrow(/operation\.start_on must be in the future/);
    expect(rpc).toHaveBeenCalledWith('siem_fail_deployment', expect.objectContaining({
      p_uncertain: false, p_error: expect.stringContaining('operation.start_on must be in the future'),
    }));
  });

  // A rate limit or an outage after the request was sent IS uncertain: the write may have landed.
  it('still records an uncertain write when the outcome was never learned', async () => {
    const { deps, rpc, hash } = await fixture({
      enabled: true, localQuery: EDITED_QUERY,
      writeRejection: { status: 503, message: 'service unavailable' },
    });
    await expect(applyNativeMutation(deps,
      { bindingId: 'binding', operation: 'update', expectedVersion: 1, expectedHash: hash }, 'owner'))
      .rejects.toThrow(/503/);
    expect(rpc).toHaveBeenCalledWith('siem_fail_deployment', expect.objectContaining({ p_uncertain: true }));
  });

  // The legacy deploy handler has always refused a connection that is not `connected`. The native
  // route returns before that handler, so a connection disabled between the preview and the
  // confirmation would otherwise still reach CrowdStrike.
  it('refuses a connection that is not connected', async () => {
    for (const status of ['disabled', 'error']) {
      const { deps, hash } = await fixture({ connectionStatus: status });
      await expect(applyNativeMutation(deps,
        { bindingId: 'binding', operation: 'update', expectedVersion: 1, expectedHash: hash }, 'owner'))
        .rejects.toThrow(new RegExp(`This connection is ${status}`));
      expect(deps.fetch).not.toHaveBeenCalled();
    }
  });
});
