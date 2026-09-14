// @vitest-environment node
import { describe, expect, it, vi } from 'vitest';
import { handleNativeRequest, processNativeSync } from '../native-siem-service';
import { contentHash, crowdStrikeScope, normalizeCrowdStrike } from '../native-siem-model';

const config = { baseUrl: 'https://api.crowdstrike.com', customerId: 'a'.repeat(32) };
const raw = { id: 'remote-1', name: 'Rule', description: '', status: 'active', severity: 50,
  search: { filter: 'query', outcome: 'detection', lookback: '1h' }, operation: { schedule: { definition: '@every 1h' } } };

async function fixture(options: { phase?: string; enabled?: boolean; resource?: unknown; stale?: boolean } = {}) {
  const content = normalizeCrowdStrike(raw), hash = await contentHash(content);
  // TODO(Task 8): this fixture rides the pre-inventory siem_commit_chunk path, which today is
  // where any kind other than 'inventory' or 'legacy_import' falls through. When Task 8 gives
  // import_selection its own branch, re-point this fixture rather than letting it keep passing
  // against a path it no longer represents.
  const run = { id: 'run', kind: 'import_selection', actor_id: 'owner', integration_id: 'connection', provider_scope: crowdStrikeScope(config),
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
