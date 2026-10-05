import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ invoke: vi.fn(), from: vi.fn() }));
vi.mock('../supabaseClient', () => ({ supabase: { functions: { invoke: mocks.invoke }, from: mocks.from } }));

let integrationService: typeof import('../integrationService').integrationService;
beforeAll(async () => {
  vi.resetModules();
  vi.stubEnv('DEV', true);
  vi.stubEnv('VITE_SIEM_DEV_PROXY', '');
  ({ integrationService } = await import('../integrationService'));
}, 30_000);
beforeEach(() => vi.clearAllMocks());
afterAll(() => vi.unstubAllEnvs());

describe('localhost with hosted credentials', () => {
  it('shows the server pre-flight error instead of the generic non-2xx wrapper', async () => {
    mocks.invoke.mockResolvedValue({ data: null, error: {
      message: 'Edge Function returned a non-2xx status code',
      context: { json: async () => ({ error: 'Sentinel workspace access was denied' }) },
    } });
    await expect(integrationService.runPreflight({ provider: 'sentinel', integrationId: 'sentinel', detectionId: 'd1', windowDays: 7 }))
      .rejects.toThrow('Sentinel workspace access was denied');
  });
  it.each(['crowdstrike', 'defender_xdr', 'sentinel'] as const)('tests and queries %s through the hosted backend', async provider => {
    mocks.invoke.mockResolvedValue({ data: { success: true, status: 'success' }, error: null });
    await integrationService.testConnection(provider);
    expect(mocks.invoke).toHaveBeenLastCalledWith('integration-ops', { body: { action: 'test_connection', integrationId: provider } });
    await integrationService.runPreflight({ provider, integrationId: provider, detectionId: 'd1', windowDays: 7 });
    expect(mocks.invoke).toHaveBeenLastCalledWith('integration-ops', { body: {
      action: 'run_preflight', integrationId: provider, detectionId: 'd1', windowDays: 7,
    } });
    expect(mocks.from).not.toHaveBeenCalled();
  });

  it('saves credentials in the hosted encrypted store instead of browser memory', async () => {
    mocks.invoke.mockResolvedValue({ data: { integration: { id: 'connection' } }, error: null });
    await integrationService.updateCredentials('connection', { tenantId: 'tenant' }, { clientId: 'client', clientSecret: 'fixture-secret' });
    expect(mocks.invoke).toHaveBeenCalledWith('integration-ops', { body: {
      action: 'save_credentials', integrationId: 'connection', config: { tenantId: 'tenant' },
      credentials: { clientId: 'client', clientSecret: 'fixture-secret' }, name: undefined,
    } });
    expect(mocks.from).not.toHaveBeenCalled();
  });

  it('sends authored and reviewed redeploy requests through the backend on localhost', async () => {
    const query = { select: vi.fn(), eq: vi.fn(), single: vi.fn() };
    query.select.mockReturnValue(query);
    query.eq.mockReturnValue(query);
    query.single.mockResolvedValue({ data: { library_type: 'production' }, error: null });
    mocks.from.mockReturnValue(query);
    mocks.invoke.mockResolvedValue({ data: { deployment: { id: 'operation' } }, error: null });
    const request = { integrationId: 'connection', detectionId: 'd1', query: 'SecurityEvent', queryLanguage: 'KQL' };
    await integrationService.deployDetection(request);
    await integrationService.deployDetection({ ...request, expectedHash: 'reviewed', expectedVersion: 2 });
    expect(mocks.invoke).toHaveBeenLastCalledWith('integration-ops', { body: expect.objectContaining({
      action: 'deploy_rule', expectedHash: 'reviewed', expectedVersion: 2,
    }) });
    expect(mocks.from).toHaveBeenCalledTimes(2);
    expect(mocks.from).toHaveBeenCalledWith('detections');
    expect(query.select).toHaveBeenCalledWith('library_type');
    await integrationService.deployDetection({ ...request, vendorRuleId: 'stale-id', ruleConfig: { action: 'create' } });
    expect(mocks.invoke).toHaveBeenLastCalledWith('integration-ops', { body: expect.objectContaining({
      ruleConfig: { action: 'create' }, vendorRuleId: undefined,
    }) });
  });
});
