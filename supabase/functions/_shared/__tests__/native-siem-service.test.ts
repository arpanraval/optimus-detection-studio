// @vitest-environment node
import { describe, expect, it, vi } from 'vitest';
import { handleNativeRequest, processNativeSync, readRuleDetails } from '../native-siem-service';
import { contentHash, crowdStrikeScope, normalizeCrowdStrike } from '../native-siem-model';

const config = { baseUrl: 'https://api.crowdstrike.com', customerId: 'a'.repeat(32) };
const raw = { id: 'remote-1', name: 'Rule', description: '', status: 'active', severity: 50,
  search: { filter: 'query', outcome: 'detection', lookback: '1h' }, operation: { schedule: { definition: '@every 1h' } } };

async function fixture(options: { phase?: string; enabled?: boolean; resource?: unknown; stale?: boolean } = {}) {
  const content = normalizeCrowdStrike(raw), hash = await contentHash(content);
  // This fixture exercises the legacy siem_commit_chunk path: kind 'refresh_tracked' is a real
  // kind (re-observing rules already tracked in the library) that Task 8 does not touch, so it
  // still falls through to siem_commit_chunk in processNativeSync. (Task 8 gave 'import_selection'
  // its own branch to siem_commit_import_chunk -- see native-siem-import.test.ts for that path.)
  const run = { id: 'run', kind: 'refresh_tracked', actor_id: 'owner', integration_id: 'connection', provider_scope: crowdStrikeScope(config),
    phase: options.phase || 'discovery', cursor_offset: 0, lease_token: 'lease', attempts: 0 };
  const binding = { id: 'binding', detection_id: 'detection', integration_id: 'connection', provider_scope: crowdStrikeScope(config),
    selected_query_id: 'query-id', desired_content: content, baseline_snapshot_id: 'snap', latest_remote_snapshot_id: 'snap',
    binding_status: 'active', availability: 'present', vendor_rule_id: raw.id };
  const detection = { ...content, id: 'detection', version: 1, queries: [{ id: 'query-id', language: 'CQL', query: content.query }] };
  const updates: unknown[] = [];
  const from = vi.fn((table: string) => {
    const data = table === 'integrations' ? { id: 'connection', config, provider: 'crowdstrike' } :
      table === 'siem_sync_items' ? [{ vendor_rule_id: raw.id }] : table === 'siem_rule_bindings' ? binding :
      table === 'detections' ? detection : table === 'siem_rule_snapshots' ? [{ id: 'snap', content, content_hash: hash }] : null;
    const query: Record<string, unknown> = {};
    for (const method of ['select', 'eq', 'in', 'order', 'limit', 'single']) query[method] = vi.fn(() => query);
    query.update = vi.fn(value => { updates.push(value); return query; });
    query.then = (resolve: (result: unknown) => void) => resolve({ data, error: null });
    return query;
  });
  const rpc = vi.fn(async (name: string) => ({ data: name === 'siem_claim_sync' ? [run] : name === 'siem_can_import' ? true :
    name === 'siem_begin_deployment' ? 'operation-id' : null, error: null }));
  const fetch = vi.fn(async (_url: string, request: RequestInit) => {
    if (request.method === 'PATCH' || request.method === 'DELETE') return new Response(JSON.stringify({ resources: [raw] }));
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

describe('native production mutation boundary', () => {
  it('blocks writes before vendor access when the installation gate is off', async () => {
    const { deps, hash } = await fixture();
    await expect(handleNativeRequest(deps, { action: 'native_apply', bindingId: 'binding', expectedHash: hash, expectedVersion: 1 }, 'owner')).rejects.toThrow('not enabled');
    expect(deps.fetch).not.toHaveBeenCalled();
  });
  it('does not PATCH after a production change since review', async () => {
    const { deps, hash, rpc } = await fixture({ enabled: true, stale: true });
    await expect(handleNativeRequest(deps, { action: 'native_apply', bindingId: 'binding', expectedHash: hash, expectedVersion: 1 }, 'owner')).rejects.toThrow('Production changed');
    expect(deps.fetch.mock.calls.every(([, request]) => request.method !== 'PATCH')).toBe(true);
    expect(rpc).toHaveBeenCalledWith('siem_fail_deployment', expect.objectContaining({ p_uncertain: false }));
  });
  it('updates the original ID and verifies readback without creating a rule', async () => {
    const { deps, hash, rpc } = await fixture({ enabled: true });
    await handleNativeRequest(deps, { action: 'native_apply', bindingId: 'binding', expectedHash: hash, expectedVersion: 1 }, 'owner');
    const writes = deps.fetch.mock.calls.filter(([, request]) => request.method === 'PATCH');
    expect(writes).toHaveLength(1);
    expect(JSON.parse(String(writes[0][1].body))[0].id).toBe(raw.id);
    expect(deps.fetch.mock.calls.some(([, request]) => request.method === 'POST')).toBe(false);
    expect(rpc).toHaveBeenCalledWith('siem_finish_deployment', expect.objectContaining({ p_operation: 'operation-id' }));
  });
  it('records uncertainty when a write fails instead of blindly retrying', async () => {
    const { deps, hash, rpc } = await fixture({ enabled: true });
    deps.fetch.mockImplementation(async (_url, request) => {
      if (request.method === 'PATCH') throw new Error('timeout');
      return new Response(JSON.stringify({ resources: [raw] }));
    });
    await expect(handleNativeRequest(deps, { action: 'native_apply', bindingId: 'binding', expectedHash: hash, expectedVersion: 1 }, 'owner')).rejects.toThrow('timeout');
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

  it('propagates a thrown error from an individual retry instead of reporting the rule unreadable', async () => {
    const request = vi.fn(async (path: string) => {
      if (path.includes('ids=a&ids=b')) return { resources: [{ id: 'a' }] };
      throw new Error('CrowdStrike request failed (429); retry the sync after checking access');
    });
    await expect(readRuleDetails(request as never, ['a', 'b']))
      .rejects.toThrow('CrowdStrike request failed (429); retry the sync after checking access');
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
      throw new Error('CrowdStrike request failed (401); retry the sync after checking access');
    });
    await expect(readRuleDetails(thrown as never, ['a', 'b'])).rejects.toThrow(/401/);
  });
});
