// @vitest-environment node
import { beforeAll, afterAll, expect, it, vi } from 'vitest';
import { getRegisteredHandler } from '../../../../vitest.shims/deno-std-http-server';
const mocks = vi.hoisted(() => ({ write: vi.fn(), client: vi.fn() }));
vi.mock('@supabase/supabase-js', () => ({ createClient: mocks.client }));
vi.mock('../pack-deploy-runtime', () => ({ executePackWrite: mocks.write }));
let handler: NonNullable<ReturnType<typeof getRegisteredHandler>>;
beforeAll(async () => {
  vi.stubGlobal('Deno', {
    env: { get: (name: string) => (name === 'SUPABASE_SERVICE_ROLE_KEY' ? 'service-secret' : '') },
  });
  await import('../../integration-ops/index');
  handler = getRegisteredHandler()!;
});
afterAll(() => vi.unstubAllGlobals());
it.each(['pack_deploy_item', 'pack_deploy_presence'])('does not let a user select internal action %s', async (action) => {
  const response = await handler(
    new Request('http://localhost', {
      method: 'POST',
      headers: { Authorization: 'Bearer user-token' },
      body: JSON.stringify({ action, jobId: 'job', itemId: 'item', lease: 'lease' }),
    }),
  );
  expect(response.status).toBe(403);
  expect(mocks.write).not.toHaveBeenCalled();
});
it('routes internal deployment through leased-item validation, ignoring supplied content', async () => {
  mocks.write.mockResolvedValue(new Response('{"skipped":true}'));
  const body = { action: 'pack_deploy_item', jobId: 'job', itemId: 'item', lease: 'lease', query: 'untrusted' };
  const response = await handler(
    new Request('http://localhost', {
      method: 'POST',
      headers: { Authorization: 'Bearer service-secret' },
      body: JSON.stringify(body),
    }),
  );
  expect(response.status).toBe(200);
  expect(mocks.write).toHaveBeenCalledWith(undefined, body, expect.any(Function), expect.any(Function));
});
