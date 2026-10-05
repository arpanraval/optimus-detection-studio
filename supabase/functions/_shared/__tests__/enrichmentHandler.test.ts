// @vitest-environment node
import { afterEach, beforeAll, beforeEach, expect, it, vi } from 'vitest';
import { getRegisteredHandler } from '../../../../vitest.shims/deno-std-http-server';
const state = vi.hoisted(() => ({ role: 'admin', status: 'active', insert: vi.fn(), rpc: vi.fn(), groups: [] as unknown[] }));
vi.mock('@supabase/supabase-js', () => ({ createClient: () => ({
  auth: { getUser: async () => ({ data: { user: { id: 'admin-user' } } }) },
  from: (table: string) => {
    const query: Record<string, unknown> = {};
    for (const method of ['select', 'eq', 'in']) query[method] = () => query;
    query.insert = (...args: unknown[]) => { state.insert(...args); return query; };
    query.single = async () => ({ data: table === 'profiles' ? { role: state.role, status: state.status } : { id: 'audit-test' } });
    query.then = (resolve: (value: unknown) => unknown) => Promise.resolve({ data: table === 'mitre_objects' ? state.groups : [] }).then(resolve);
    return query;
  },
  rpc: state.rpc,
}) }));
beforeAll(async () => {
  vi.stubGlobal('Deno', { env: { get: () => 'test' } });
  await import('../../enrich-threat-groups/index');
});
beforeEach(() => {
  state.role = 'admin'; state.status = 'active'; state.insert.mockClear(); state.rpc.mockClear();
  state.rpc.mockResolvedValue({ error: null });
  state.groups = [{ stix_id: 'group-a', mitre_id: 'G0001', name: 'Group A', data: { aliases: ['Group A'] } }];
  vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({ values: [{ uuid: 'misp-a', value: 'Group A', meta: { country: 'US' } }] }))));
});
afterEach(() => { vi.unstubAllGlobals(); vi.stubGlobal('Deno', { env: { get: () => 'test' } }); });
function request(body: unknown) {
  return getRegisteredHandler()!(new Request('https://example.test/enrich', {
    method: 'POST', headers: { Authorization: 'Bearer test', 'Content-Type': 'application/json' }, body: JSON.stringify(body),
  }));
}
it('accepts the UI check action and returns its expected top-level summary without writes', async () => {
  const response = await request({ action: 'check' });
  expect(response.status).toBe(200);
  expect(await response.json()).toMatchObject({ success: true, hasUpdates: true, previewHash: expect.any(String), summary: { newMatches: 1, changedMatches: 0, unchangedMatches: 0 } });
  expect(state.insert).not.toHaveBeenCalled();
  expect(state.rpc).not.toHaveBeenCalled();
});
it('rejects changed previews before creating an audit or updating any group', async () => {
  const response = await request({ action: 'apply', previewHash: 'outdated' });
  expect(response.status).toBe(409);
  expect(state.insert).not.toHaveBeenCalled();
  expect(state.rpc).not.toHaveBeenCalled();
});
it('rejects non-admin callers before loading upstream data', async () => {
  state.role = 'analyst';
  expect((await request({ action: 'check' })).status).toBe(403);
  expect(fetch).not.toHaveBeenCalled();
});
it('applies a checked preview and normalizes the incident lists present in real MISP data', async () => {
  vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({ values: [{ uuid: 'misp-a', value: 'Group A', meta: { country: 'US', 'cfr-type-of-incident': ['Espionage', 'Sabotage'] } }] }))));
  const check = await (await request({ action: 'check' })).json();
  const applied = await (await request({ action: 'apply', previewHash: check.previewHash })).json();
  expect(applied).toMatchObject({ success: true, applied: { successCount: 1, errorCount: 0 } });
  expect(state.rpc).toHaveBeenCalledWith('update_targeting_intel', expect.objectContaining({ p_targeting_intel: expect.objectContaining({ activity_type: 'Espionage, Sabotage' }) }));
});
it('reports a failed group update as failure instead of a successful enrichment', async () => {
  state.rpc.mockResolvedValue({ error: { message: 'write failed' } });
  const check = await (await request({ action: 'check' })).json();
  const applied = await (await request({ action: 'apply', previewHash: check.previewHash })).json();
  expect(applied).toMatchObject({ success: false, error: expect.stringContaining('1 group updates failed') });
});
