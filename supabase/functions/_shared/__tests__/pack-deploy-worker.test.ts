// @vitest-environment node
import { beforeEach, afterEach, expect, it, vi } from 'vitest';
import { getRegisteredHandler } from '../../../../vitest.shims/deno-std-http-server';
const mocks = vi.hoisted(() => ({
  getUser: vi.fn(),
  rpc: vi.fn(),
  preview: vi.fn(),
  process: vi.fn(),
  permission: vi.fn(),
}));
vi.mock('@supabase/supabase-js', () => ({
  createClient: () => ({ auth: { getUser: mocks.getUser }, rpc: mocks.rpc }),
}));
vi.mock('../permissions', () => ({ checkPermission: mocks.permission }));
vi.mock('../pack-deploy-runtime', () => ({ previewPack: mocks.preview, processPackItem: mocks.process }));
let handler: NonNullable<ReturnType<typeof getRegisteredHandler>>;
beforeEach(async () => {
  vi.clearAllMocks();
  vi.stubGlobal('Deno', {
    env: { get: (key: string) => (key === 'SUPABASE_SERVICE_ROLE_KEY' ? 'service-secret' : 'http://localhost') },
  });
  vi.stubGlobal('EdgeRuntime', { waitUntil: vi.fn() });
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('{}', { status: 202 })));
  mocks.getUser.mockResolvedValue({ data: { user: { id: 'owner' } }, error: null });
  mocks.permission.mockResolvedValue({ allowed: true });
  await import('../../pack-deploy-worker/index');
  handler = getRegisteredHandler()!;
});
afterEach(() => vi.unstubAllGlobals());
const request = (body: unknown, token?: string) =>
  new Request('http://localhost', {
    method: 'POST',
    headers: token ? { Authorization: `Bearer ${token}` } : {},
    body: JSON.stringify(body),
  });
it('rejects unauthenticated and invalid user requests before mutations', async () => {
  expect((await handler(request({ action: 'cancel', jobId: 'victim' }))).status).toBe(401);
  mocks.getUser.mockResolvedValue({ data: { user: null }, error: new Error('Invalid') });
  expect((await handler(request({ action: 'cancel', jobId: 'victim' }, 'invalid'))).status).toBe(401);
  expect(mocks.rpc).not.toHaveBeenCalled();
});
it('does not allow a user token to invoke internal work', async () => {
  expect((await handler(request({ action: 'tick' }, 'user-token'))).status).toBe(403);
  expect(mocks.process).not.toHaveBeenCalled();
});
it('checks deployment permission before accepting queue actions', async () => {
  mocks.permission.mockResolvedValue({ allowed: false });
  expect((await handler(request({ action: 'retry', jobId: 'job' }, 'user-token'))).status).toBe(403);
  expect(mocks.rpc).not.toHaveBeenCalled();
});
it('passes verified identity rather than body identity to cancellation', async () => {
  mocks.rpc.mockResolvedValue({ data: null, error: null });
  const response = await handler(request({ action: 'cancel', jobId: 'job', actor: 'victim' }, 'user-token'));
  expect(response.status).toBe(200);
  expect(mocks.rpc).toHaveBeenCalledWith('pack_deploy_control', { p_actor: 'owner', p_job: 'job', p_action: 'cancel' });
});
it('does not accept the old arbitrary jobId restart API', async () => {
  expect((await handler(request({ jobId: 'victim' }, 'user-token'))).status).toBe(400);
  expect(mocks.rpc).not.toHaveBeenCalled();
});
it('refuses to queue when durable recovery is not configured', async () => {
  mocks.rpc.mockResolvedValue({ data: false, error: null });
  const response = await handler(
    request({ action: 'create', integrationId: 'siem', detectionIds: ['rule'] }, 'user-token'),
  );
  expect(response.status).toBe(503);
  expect(mocks.preview).not.toHaveBeenCalled();
  expect(mocks.rpc).toHaveBeenCalledExactlyOnceWith('pack_deploy_ready');
});

it('reconciles under the verified user without creating or restarting a job', async () => {
  mocks.preview.mockResolvedValue([{ detection_id: 'rule', reason: null }]);
  const response = await handler(request({ action: 'reconcile', integrationId: 'siem', detectionIds: ['rule'], actor: 'other' }, 'user-token'));
  expect(response.status).toBe(200);
  expect(mocks.preview).toHaveBeenCalledWith(expect.anything(), 'owner', 'siem', ['rule'], {}, expect.any(Function), true);
  expect(mocks.rpc).not.toHaveBeenCalled();
  expect(mocks.process).not.toHaveBeenCalled();
});
