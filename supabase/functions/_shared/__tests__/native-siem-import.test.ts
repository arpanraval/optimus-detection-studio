// @vitest-environment node
import { describe, expect, it, vi } from 'vitest';
import { handleNativeRequest, processNativeSync } from '../native-siem-service';
import { contentHash, crowdStrikeScope, normalizeCrowdStrike } from '../native-siem-model';

function fixture() {
  const integrationRow = { id: 'connection', user_id: 'owner', provider: 'crowdstrike', archived_at: null, config: {} };
  const from = vi.fn((table: string) => {
    const data = table === 'integrations' ? integrationRow : null;
    const query: Record<string, unknown> = {};
    for (const method of ['select', 'eq', 'in', 'order', 'limit', 'single', 'update'])
      query[method] = vi.fn(() => query);
    query.then = (resolve: (result: unknown) => void) => resolve({ data, error: null });
    return query;
  });
  const rpc = vi.fn(async (name: string) => ({
    data: name === 'siem_start_import' ? { id: 'run', kind: 'import_selection' } : null, error: null }));
  const deps = { db: { from, rpc } as never, credentials: vi.fn(), token: vi.fn(), fetch: vi.fn(), writesEnabled: false };
  return { deps, rpc };
}

describe('native_import_start', () => {
  it('calls siem_start_import with explicit ids and the caller as actor', async () => {
    const { deps, rpc } = fixture();
    await handleNativeRequest(deps, { action: 'native_import_start', integrationId: 'connection',
      sourceRunId: 'source-run', ids: ['a', 'b'], idempotencyKey: 'key-1' }, 'owner');
    expect(rpc).toHaveBeenCalledWith('siem_start_import', {
      p_actor: 'owner', p_integration: 'connection', p_source_run: 'source-run',
      p_ids: ['a', 'b'], p_exclude: [], p_all_matching: false, p_idempotency: 'key-1',
      p_search: null, p_relationship: null });
  });

  it('passes p_all_matching true with p_exclude when allMatching is set', async () => {
    const { deps, rpc } = fixture();
    await handleNativeRequest(deps, { action: 'native_import_start', integrationId: 'connection',
      sourceRunId: 'source-run', allMatching: true, excludeIds: ['c'], idempotencyKey: 'key-2' }, 'owner');
    expect(rpc).toHaveBeenCalledWith('siem_start_import', {
      p_actor: 'owner', p_integration: 'connection', p_source_run: 'source-run',
      p_ids: [], p_exclude: ['c'], p_all_matching: true, p_idempotency: 'key-2',
      p_search: null, p_relationship: null });
  });

  // "All N matching" is only honest if the predicate the count was computed under reaches the
  // server; without it the freeze spans the whole catalog.
  it('forwards the selection filter so all-matching freezes only the filtered rows', async () => {
    const { deps, rpc } = fixture();
    await handleNativeRequest(deps, { action: 'native_import_start', integrationId: 'connection',
      sourceRunId: 'source-run', allMatching: true, idempotencyKey: 'key-4',
      selectionSearch: 'okta', selectionRelationship: 'not_in_library' }, 'owner');
    expect(rpc).toHaveBeenCalledWith('siem_start_import', expect.objectContaining({
      p_search: 'okta', p_relationship: 'not_in_library' }));
  });

  it('rejects a body with neither ids nor allMatching', async () => {
    const { deps, rpc } = fixture();
    await expect(handleNativeRequest(deps, { action: 'native_import_start', integrationId: 'connection',
      sourceRunId: 'source-run', idempotencyKey: 'key-3' }, 'owner'))
      .rejects.toThrow('Select the rules you want to import');
    expect(rpc).not.toHaveBeenCalledWith('siem_start_import', expect.anything());
  });

  it('rejects a missing idempotencyKey before touching the database', async () => {
    const { deps, rpc } = fixture();
    await expect(handleNativeRequest(deps, { action: 'native_import_start', integrationId: 'connection',
      sourceRunId: 'source-run', ids: ['a'] }, 'owner'))
      .rejects.toThrow('An import request key is required');
    expect(rpc).not.toHaveBeenCalledWith('siem_start_import', expect.anything());
  });
});

describe('native_import_cancel / native_import_retry routing', () => {
  it('routes native_import_cancel to siem_cancel_import with the actor and run', async () => {
    const rpc = vi.fn(async () => ({ data: null, error: null }));
    const deps = { db: { rpc } as never, credentials: vi.fn(), token: vi.fn(), fetch: vi.fn(), writesEnabled: false };
    const result = await handleNativeRequest(deps, { action: 'native_import_cancel', runId: 'run-1' }, 'owner');
    expect(rpc).toHaveBeenCalledWith('siem_cancel_import', { p_actor: 'owner', p_run: 'run-1' });
    expect(result).toEqual({ success: true });
  });

  it('routes native_import_retry to siem_retry_import and returns the requeued run', async () => {
    const requeued = { id: 'run-1', kind: 'import_selection', status: 'queued' };
    const rpc = vi.fn(async () => ({ data: requeued, error: null }));
    const deps = { db: { rpc } as never, credentials: vi.fn(), token: vi.fn(), fetch: vi.fn(), writesEnabled: false };
    const result = await handleNativeRequest(deps, { action: 'native_import_retry', runId: 'run-1' }, 'owner');
    expect(rpc).toHaveBeenCalledWith('siem_retry_import', { p_actor: 'owner', p_run: 'run-1' });
    expect(result).toEqual(requeued);
  });
});

describe('the import_selection worker branch', () => {
  const raw = { id: 'rule-1', name: 'Rule', description: '', status: 'active', severity: 50,
    search: { filter: 'query', outcome: 'detection', lookback: '1h' }, operation: { schedule: { definition: '@every 1h' } } };

  const workerConfig = { baseUrl: 'https://api.crowdstrike.com', customerId: 'a'.repeat(32) };

  function workerFixture(options: { resource?: unknown } = {}) {
    const run = { id: 'run', kind: 'import_selection', actor_id: 'owner', integration_id: 'connection',
      provider_scope: crowdStrikeScope(workerConfig), phase: 'hydration', cursor_offset: 0, lease_token: 'lease', attempts: 0 };
    const from = vi.fn((table: string) => {
      const data = table === 'integrations' ? { id: 'connection', config: workerConfig, provider: 'crowdstrike' } :
        table === 'siem_sync_items' ? [{ vendor_rule_id: raw.id }] : null;
      const query: Record<string, unknown> = {};
      for (const method of ['select', 'eq', 'in', 'order', 'limit', 'single', 'update']) query[method] = vi.fn(() => query);
      query.then = (resolve: (result: unknown) => void) => resolve({ data, error: null });
      return query;
    });
    const rpc = vi.fn(async (name: string) => ({ data: name === 'siem_claim_sync' ? [run] : name === 'siem_can_import' ? true : null, error: null }));
    const fetch = vi.fn(async () => new Response(JSON.stringify({ resources: options.resource ?? [raw] })));
    const deps = { db: { from, rpc } as never, credentials: vi.fn(async () => ({ clientId: 'client', clientSecret: 'secret' })),
      token: vi.fn(async () => 'token'), fetch, writesEnabled: false };
    return { deps, rpc };
  }

  it('reads details for pending ids and commits via siem_commit_import_chunk, never the legacy or inventory RPCs', async () => {
    const { deps, rpc } = workerFixture();
    await processNativeSync(deps);
    expect(rpc).toHaveBeenCalledWith('siem_commit_import_chunk', expect.objectContaining({
      p_run: 'run', p_lease: 'lease',
      p_results: [expect.objectContaining({ id: raw.id, content: normalizeCrowdStrike(raw) })],
    }));
    expect(rpc.mock.calls.some(([name]) => name === 'siem_commit_chunk')).toBe(false);
    expect(rpc.mock.calls.some(([name]) => name === 'siem_commit_inventory_chunk')).toBe(false);
  });

  it('passes through the freshly observed hash so the RPC can detect drift since submission', async () => {
    const changed = { ...raw, name: 'Changed since preview' };
    const { deps, rpc } = workerFixture({ resource: [changed] });
    await processNativeSync(deps);
    const expectedHash = await contentHash(normalizeCrowdStrike(changed));
    expect(rpc).toHaveBeenCalledWith('siem_commit_import_chunk', expect.objectContaining({
      p_results: [expect.objectContaining({ id: raw.id, hash: expectedHash })],
    }));
  });

  it('reports a detail read that omits an id as an error, never a deletion', async () => {
    const { deps, rpc } = workerFixture({ resource: [] });
    await processNativeSync(deps);
    expect(rpc).toHaveBeenCalledWith('siem_commit_import_chunk', expect.objectContaining({
      p_results: [expect.objectContaining({ id: raw.id, error: expect.stringContaining('may have been deleted') })],
    }));
  });
});
