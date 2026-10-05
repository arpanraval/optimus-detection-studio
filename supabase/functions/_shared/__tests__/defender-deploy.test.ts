// @vitest-environment node
import { afterAll, beforeAll, expect, it, vi } from 'vitest';
import { verifyDefenderInventory } from '../defender-verification';
import { readPackOutcome } from '../pack-deploy-runtime';

let deploy: typeof import('../../integration-ops/index').defenderXdrDeployRule;
beforeAll(async () => {
  vi.stubGlobal('Deno', { env: { get: () => '' } });
  deploy = (await import('../../integration-ops/index')).defenderXdrDeployRule;
});
afterAll(() => vi.unstubAllGlobals());
const config = { tenantId: 'test' };
const credentials = { clientId: 'test', clientSecret: 'test' };
const query = 'DeviceEvents | take 1';
const id = 'optimus-detection-1';

function mockGraph(options: { listed?: boolean; mismatch?: boolean; rateLimited?: boolean; missingId?: boolean; patchFails?: boolean; inventoryStatus?: number; malformedInventory?: boolean; malformedPatch?: boolean } = {}) {
  let saved: Record<string, unknown> = { id, displayName: 'Test', status: 'enabled', queryCondition: { queryText: query } };
  const fetch = vi.fn(async (url: string, init: RequestInit) => {
    if (url.startsWith('https://login.microsoftonline.com/')) return Response.json({ access_token: 'test' });
    if (init.method === 'PATCH' && options.patchFails) return new Response('boom', { status: 500 });
    if (init.method === 'POST' || init.method === 'PATCH') {
      saved = { id, ...JSON.parse(String(init.body)) };
      if (init.method === 'PATCH' && options.malformedPatch) return new Response('not-json');
      return Response.json(options.missingId && init.method === 'POST' ? { ...saved, id: undefined } : saved, { status: init.method === 'POST' ? 201 : 200 });
    }
    if (url.includes('?$filter=')) {
      if (options.inventoryStatus) return new Response('', { status: options.inventoryStatus });
      if (options.malformedInventory) return Response.json({});
      if (options.rateLimited) return new Response('', { status: 429 });
      return Response.json({ value: options.listed === false ? [{ id: '222' }] : [{ id }] });
    }
    return Response.json(options.mismatch ? { ...saved, status: 'disabled' } : saved);
  });
  vi.stubGlobal('fetch', fetch);
  return fetch;
}
const writes = (fetch: ReturnType<typeof mockGraph>, method: string) =>
  fetch.mock.calls.filter(([url, init]) => !url.includes('login.microsoftonline') && init.method === method);

// Graph accepts a create but never schedules or lists it; a PATCH after creation is what schedules it
// (docs/2026-09-18-defender-xdr-ghost-rules.md). So a create is always followed by exactly one PATCH.
it.each([true, false])('creates with a stable ID, then PATCHes once so Microsoft schedules it (enabled=%s)', async enabled => {
  const fetch = mockGraph();
  const result = await deploy(config, credentials, query, { name: 'Test', enabled }, 'create', undefined, id);
  expect(writes(fetch, 'POST')).toHaveLength(1);
  expect(JSON.parse(String(writes(fetch, 'POST')[0][1].body))).toMatchObject({ id, status: enabled ? 'enabled' : 'disabled', schedule: { frequency: 'P1D' } });
  const patches = writes(fetch, 'PATCH');
  expect(patches).toHaveLength(1);
  expect(patches[0][0]).toContain(`/detectionRules/${id}`);
  expect(JSON.parse(String(patches[0][1].body))).toMatchObject({ status: enabled ? 'enabled' : 'disabled', schedule: { frequency: 'P1D' } });
  expect(result.vendorRuleId).toBe(id);
  expect(result).not.toHaveProperty('verificationError');
  expect(result.response).toHaveProperty('optimusVerification.status', 'verified');
});

it.each([{ listed: false }, { rateLimited: true }])(
  'reports a rule that reads back correctly but is not listed yet as pending, not failed: %j', async options => {
    const fetch = mockGraph(options);
    const result = await deploy(config, credentials, query, { name: 'Test' }, 'create', undefined, id);
    expect(result.vendorRuleId).toBe(id);
    expect(result).not.toHaveProperty('verificationError');
    expect(result.response).toHaveProperty('optimusVerification.status', 'pending');
    expect(writes(fetch, 'POST')).toHaveLength(1);
    expect(writes(fetch, 'PATCH')).toHaveLength(1);
    const outcome = await readPackOutcome(Response.json({ deployment: { vendor_rule_id: result.vendorRuleId, status: 'success' } }, { status: 200 }));
    expect(outcome).toMatchObject({ status: 'succeeded', vendorRuleId: id });
  },
);

it('keeps the accepted identity without claiming success when the readback differs', async () => {
  const fetch = mockGraph({ mismatch: true });
  const result = await deploy(config, credentials, query, { name: 'Test' }, 'create', undefined, id);
  expect(result.vendorRuleId).toBe(id);
  expect(result.verificationError).toContain('Microsoft accepted the write');
  expect(result.response).toHaveProperty('optimusVerification.status', 'unverified');
  expect(writes(fetch, 'POST')).toHaveLength(1);
});

it.each([{ inventoryStatus: 403 }, { malformedInventory: true }])('does not disguise inventory errors as a scheduling delay: %j', async options => {
  mockGraph(options);
  const result = await deploy(config, credentials, query, { name: 'Test' }, 'create', undefined, id);
  expect(result.vendorRuleId).toBe(id);
  expect(result.verificationError).toContain('verification failed');
  expect(result.response).toHaveProperty('optimusVerification.status', 'unverified');
});

it('explains throttling without claiming the rule was absent from inventory', async () => {
  mockGraph({ rateLimited: true });
  const result = await deploy(config, credentials, query, { name: 'Test' }, 'create', undefined, id);
  expect(result.response).toHaveProperty('optimusVerification.message', expect.stringContaining('throttled'));
});

it('keeps the created identity and verifies by GET when the PATCH response is unreadable', async () => {
  const fetch = mockGraph({ malformedPatch: true });
  const result = await deploy(config, credentials, query, { name: 'Test' }, 'create', undefined, id);
  expect(result.vendorRuleId).toBe(id);
  expect(result).not.toHaveProperty('verificationError');
  expect(writes(fetch, 'POST')).toHaveLength(1);
  expect(writes(fetch, 'PATCH')).toHaveLength(1);
});

it('falls back to the client-provided ID when the create response omits it', async () => {
  const fetch = mockGraph({ missingId: true });
  const result = await deploy(config, credentials, query, { name: 'Test' }, 'create', undefined, id);
  expect(result.vendorRuleId).toBe(id);
  expect(writes(fetch, 'PATCH')[0][0]).toContain(`/detectionRules/${id}`);
  expect(result).not.toHaveProperty('verificationError');
});

it('keeps the created identity and reports unverified when the scheduling PATCH fails', async () => {
  const fetch = mockGraph({ patchFails: true });
  const result = await deploy(config, credentials, query, { name: 'Test' }, 'create', undefined, id);
  expect(result.vendorRuleId).toBe(id);
  expect(result.verificationError).toContain('scheduling update failed');
  expect(result.response).toHaveProperty('optimusVerification.status', 'unverified');
  expect(writes(fetch, 'POST')).toHaveLength(1);
  const outcome = await readPackOutcome(Response.json({ error: result.verificationError,
    deployment: { vendor_rule_id: result.vendorRuleId, status: 'failed' }, uncertain: true, retryable: false }, { status: 502 }));
  expect(outcome).toMatchObject({ status: 'failed', vendorRuleId: id, uncertain: true, retryable: false });
});

it('updates a rule that Graph created but never listed, because the PATCH is what schedules it', async () => {
  const fetch = mockGraph({ listed: false });
  const result = await deploy(config, credentials, query, { name: 'Test' }, 'update', id, id);
  expect(writes(fetch, 'POST')).toHaveLength(0);
  expect(writes(fetch, 'PATCH')).toHaveLength(1);
  expect(result.vendorRuleId).toBe(id);
  expect(result).not.toHaveProperty('verificationError');
  expect(result.response).toHaveProperty('optimusVerification.status', 'pending');
});

it('verifies an update before reporting success', async () => {
  const fetch = mockGraph();
  const result = await deploy(config, credentials, query, { name: 'Test' }, 'update', id, id);
  expect(result).not.toHaveProperty('verificationError');
  expect(result.response).toHaveProperty('optimusVerification.status', 'verified');
  expect(writes(fetch, 'PATCH')).toHaveLength(1);
});

it('does not accept a malformed inventory or confuse another ID with the target', async () => {
  await expect(verifyDefenderInventory(async () => ({}), id)).rejects.toThrow('invalid');
  await expect(verifyDefenderInventory(async () => ({ value: [{ id: 'different' }] }), id)).rejects.toThrow('not visible');
});
