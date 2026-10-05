import { beforeEach, expect, it, vi } from 'vitest';
const mocks = vi.hoisted(() => ({ invoke: vi.fn(), from: vi.fn() }));
vi.mock('../supabaseClient', () => ({ supabase: { functions: { invoke: mocks.invoke }, from: mocks.from } }));
import { createDeployJob, retryFailedItems, cancelJob, previewDeployJob } from '../packDeployJobService';
import type { Detection } from '../../types';
beforeEach(() => vi.clearAllMocks());
it('queues deduplicated IDs atomically with a stable request key', async () => {
  mocks.invoke.mockResolvedValue({ data: { jobId: 'job' }, error: null });
  const d = { id: 'd1' } as Detection;
  expect(
    await createDeployJob({ packId: 'pack', integrationId: 'siem', detections: [d, d], requestKey: 'request' }),
  ).toBe('job');
  expect(mocks.invoke).toHaveBeenCalledWith('pack-deploy-worker', {
    body: {
      action: 'create',
      reconcile: false,
      packId: 'pack',
      integrationId: 'siem',
      detectionIds: ['d1'],
      ruleConfig: {},
      requestKey: 'request',
    },
  });
  expect(mocks.from).not.toHaveBeenCalled();
});
it('uses the read-only reconciliation action without updating historical records', async () => {
  mocks.invoke.mockResolvedValue({ data: { items: [] } });
  await previewDeployJob({ packId: 'pack', integrationId: 'siem', detections: [{ id: 'd1' } as Detection], reconcile: true });
  expect(mocks.invoke).toHaveBeenCalledWith('pack-deploy-worker', { body: {
    action: 'reconcile', integrationId: 'siem', detectionIds: ['d1'], ruleConfig: {},
  } });
  expect(mocks.from).not.toHaveBeenCalled();
});
it('surfaces HTTP error bodies from launch/control', async () => {
  mocks.invoke.mockResolvedValue({
    error: { message: 'non-2xx', context: { json: async () => ({ error: 'No safely retryable items' }) } },
  });
  await expect(retryFailedItems('job')).rejects.toThrow('No safely retryable items');
});
it('cancels through the server transition rather than a direct RLS update', async () => {
  mocks.invoke.mockResolvedValue({ data: { ok: true } });
  await cancelJob('job');
  expect(mocks.invoke).toHaveBeenCalledWith('pack-deploy-worker', { body: { action: 'cancel', jobId: 'job' } });
  expect(mocks.from).not.toHaveBeenCalled();
});
