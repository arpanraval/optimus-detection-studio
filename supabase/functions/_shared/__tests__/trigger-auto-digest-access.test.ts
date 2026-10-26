import { beforeEach, describe, expect, it, vi } from 'vitest';
import { getRegisteredHandler } from '../../../../vitest.shims/deno-std-http-server';

const mocks = vi.hoisted(() => ({ role: 'viewer', rpc: vi.fn(), update: vi.fn(), filters: [] as unknown[][] }));
vi.mock('@supabase/supabase-js', () => ({
  createClient: () => ({
    auth: { getUser: async () => ({ data: { user: { id: 'caller' } }, error: null }) },
    rpc: mocks.rpc,
    from: (table: string) => {
      const query = {
        select: () => query,
        eq: (...args: unknown[]) => { mocks.filters.push(args); return query; },
        update: (payload: unknown) => { mocks.update(payload); return query; },
        single: () => query,
        then: (resolve: (value: unknown) => void) => Promise.resolve({
          data: table === 'profiles' ? { role: mocks.role } : { user_id: 'pipeline-owner' }, error: null,
        }).then(resolve),
      };
      return query;
    },
  }),
}));

beforeEach(async () => {
  vi.clearAllMocks();
  mocks.filters = [];
  vi.stubGlobal('Deno', { env: { get: () => 'test-value' } });
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('{}')));
  mocks.rpc.mockResolvedValue({ data: [{ job_id: 'job', status: 'pending', created: true }], error: null });
  await import('../../trigger-auto-digest/index');
});

describe('team digest trigger authorization', () => {
  it.each(['viewer', 'analyst', 'lead'])('rejects %s before caching prompts or enqueueing work', async (role) => {
    mocks.role = role;
    const response = await getRegisteredHandler()!(new Request('https://example.test', {
      method: 'POST', headers: { Authorization: 'Bearer token' }, body: JSON.stringify({ promptTemplates: { summary: 'prompt' } }),
    }));
    expect(response.status).toBe(403);
    expect(mocks.rpc).not.toHaveBeenCalled();
    expect(mocks.update).not.toHaveBeenCalled();
  });

  it.each(['owner', 'admin'])('runs the shared pipeline for %s, even when owned by someone else', async (role) => {
    mocks.role = role;
    const response = await getRegisteredHandler()!(new Request('https://example.test', {
      method: 'POST', headers: { Authorization: 'Bearer token' }, body: JSON.stringify({ promptTemplates: { summary: 'prompt' } }),
    }));
    expect(response.status).toBe(200);
    expect(mocks.rpc).toHaveBeenCalledWith('request_auto_digest_job', { p_user_id: 'pipeline-owner', p_reason: 'manual' });
    expect(mocks.filters).toContainEqual(['user_id', 'pipeline-owner']);
  });
});
