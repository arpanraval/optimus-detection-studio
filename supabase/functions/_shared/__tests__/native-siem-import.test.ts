// @vitest-environment node
import { describe, expect, it, vi } from 'vitest';
import { handleNativeRequest } from '../native-siem-service';

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
      p_ids: ['a', 'b'], p_exclude: [], p_all_matching: false, p_idempotency: 'key-1' });
  });

  it('passes p_all_matching true with p_exclude when allMatching is set', async () => {
    const { deps, rpc } = fixture();
    await handleNativeRequest(deps, { action: 'native_import_start', integrationId: 'connection',
      sourceRunId: 'source-run', allMatching: true, excludeIds: ['c'], idempotencyKey: 'key-2' }, 'owner');
    expect(rpc).toHaveBeenCalledWith('siem_start_import', {
      p_actor: 'owner', p_integration: 'connection', p_source_run: 'source-run',
      p_ids: [], p_exclude: ['c'], p_all_matching: true, p_idempotency: 'key-2' });
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
