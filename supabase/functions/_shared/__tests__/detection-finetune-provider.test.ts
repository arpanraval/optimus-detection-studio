// @vitest-environment node
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

const state = vi.hoisted(() => ({ provider: 'sentinel', owner: 'owner', role: 'admin', action: 'start', inserted: null as unknown,
  graphToken: vi.fn(), graphQuery: vi.fn(), sentinelToken: vi.fn(), sentinelQuery: vi.fn(),
  createSession: vi.fn(), sendEvents: vi.fn(), from: vi.fn(),
}));
vi.mock('https://esm.sh/@supabase/supabase-js@2', () => ({ createClient: () => ({
  auth: { getUser: async () => ({ data: { user: { id: 'owner' } }, error: null }) },
  from: state.from, rpc: async () => ({ data: 1, error: null }),
}) }));
vi.mock('../rate-limiter', () => ({ checkRateLimit: async () => ({ allowed: true }) }));
vi.mock('../defender-hunting', () => ({
  decryptCredentials: async () => ({ clientId: 'fixture-client', clientSecret: 'fixture-secret' }),
  getGraphToken: state.graphToken, runHuntingQuery: state.graphQuery,
}));
vi.mock('../sentinel-query', () => ({ sentinelToken: state.sentinelToken, runSentinelQuery: state.sentinelQuery }));
vi.mock('../managed-agents', () => ({
  createSession: state.createSession, sendEvents: state.sendEvents,
  listEvents: async () => [{ type: 'agent.custom_tool_use', id: 'tool-1', name: 'run_hunting_query', input: { query: 'SecurityEvent | count' } }],
  userMessage: (text: string) => ({ type: 'user.message', text }),
  customToolResult: (_id: string, text: string, isError: boolean) => ({ text, isError }),
  interrupt: () => ({ type: 'user.interrupt' }),
}));

let handler: (request: Request) => Promise<Response>;
beforeAll(async () => {
  vi.stubGlobal('Deno', { env: { get: () => 'fixture' }, serve: (fn: typeof handler) => { handler = fn; } });
  await import('../../detection-finetune/index');
});
afterAll(() => vi.unstubAllGlobals());
beforeEach(() => {
  vi.clearAllMocks();
  state.provider = 'sentinel'; state.owner = 'owner'; state.role = 'admin'; state.action = 'start'; state.inserted = null;
  state.graphToken.mockResolvedValue('graph-token'); state.sentinelToken.mockResolvedValue('sentinel-token');
  state.graphQuery.mockResolvedValue({ ok: true, schema: [], results: [] });
  state.sentinelQuery.mockResolvedValue({ ok: true, schema: [], results: [] });
  state.createSession.mockResolvedValue('session-1'); state.sendEvents.mockResolvedValue(undefined);
  state.from.mockImplementation((table: string) => {
    let inserted = false;
    const integration = { id: 'connection', provider: state.provider, status: 'connected', user_id: state.owner,
      config: { tenantId: 'tenant', subscriptionId: 'sub', resourceGroup: 'rg', workspaceName: 'ws' } };
    const data = () => table === 'profiles' ? { role: state.role } : table === 'integrations' ? integration : table === 'detections' ? {
      id: 'detection', name: 'Test', user_id: 'owner', queries: [
        { id: 'first', language: 'KQL', query: 'WrongTable' }, { id: 'bound', language: 'KQL', query: 'SecurityEvent' },
      ],
    } : table === 'siem_rule_bindings' ? [{ selected_query_id: 'bound' }] : table === 'integration_credentials'
      ? { encrypted_data: 'fixture-ciphertext' } : table === 'detection_finetune_runs'
        ? inserted ? { id: 'run-1' } : state.action === 'tool' ? { id: 'run-1', user_id: 'owner', status: 'running',
          anthropic_session_id: 'session-1', integration_id: 'connection', window_days: 7, provider: state.provider } : null : null;
    const chain: Record<string, unknown> = {};
    for (const method of ['select', 'eq', 'order', 'limit']) chain[method] = () => chain;
    chain.insert = (value: unknown) => { state.inserted = value; inserted = true; return chain; };
    chain.single = chain.maybeSingle = async () => ({ data: data(), error: null });
    chain.then = (resolve: (value: unknown) => void) => resolve({ data: data(), error: null });
    return chain;
  });
});
const request = (body: unknown) => handler(new Request('http://localhost/finetune', {
  method: 'POST', headers: { Authorization: 'Bearer fixture', 'Content-Type': 'application/json' }, body: JSON.stringify(body),
}));

describe('Microsoft fine-tuning provider routing', () => {
  it('denies a viewer before opening an agent session', async () => {
    state.role = 'viewer';
    const response = await request({ action: 'start', detectionId: 'detection', integrationId: 'connection' });
    expect(response.status).toBe(403);
    expect(state.createSession).not.toHaveBeenCalled();
    expect(state.graphToken).not.toHaveBeenCalled();
    expect(state.sentinelToken).not.toHaveBeenCalled();
  });
  it.each(['sentinel', 'defender_xdr'])('starts %s using its executor and the bound query', async provider => {
    state.provider = provider;
    const response = await request({ action: 'start', detectionId: 'detection', integrationId: 'connection', windowDays: 7 });
    expect(response.status).toBe(200);
    expect(state.inserted).toMatchObject({ provider, original_query: 'SecurityEvent', window_days: 7 });
    const execute = provider === 'sentinel' ? state.sentinelQuery : state.graphQuery;
    expect(execute).toHaveBeenCalled();
    expect(provider === 'sentinel' ? state.graphQuery : state.sentinelQuery).not.toHaveBeenCalled();
    expect(JSON.stringify(state.sendEvents.mock.calls)).toContain('SecurityEvent');
    expect(JSON.stringify(state.sendEvents.mock.calls)).not.toContain('WrongTable');
    const overrides = state.createSession.mock.calls[0][3];
    if (provider === 'sentinel') {
      expect(overrides.system).toContain('Microsoft Sentinel');
      expect(overrides.tools.map((tool: { name: string }) => tool.name)).toEqual(['run_hunting_query', 'submit_refinement_ladder']);
    } else expect(overrides).toBeUndefined();
  });

  it('runs Sentinel tool queries through the workspace executor', async () => {
    state.action = 'tool';
    const response = await request({ action: 'tool', runId: 'run-1', toolUseId: 'tool-1' });
    expect(response.status).toBe(200);
    expect(state.sentinelQuery).toHaveBeenCalledWith('sentinel-token', expect.objectContaining({ workspaceName: 'ws' }), 'SecurityEvent | count', 7, expect.any(Number));
    expect(state.graphQuery).not.toHaveBeenCalled();
  });

  it('rejects another owner before opening an agent session or loading query credentials', async () => {
    state.owner = 'other';
    const response = await request({ action: 'start', detectionId: 'detection', integrationId: 'connection' });
    expect(response.status).toBe(403);
    expect(state.createSession).not.toHaveBeenCalled();
    expect(state.sentinelToken).not.toHaveBeenCalled();
  });
});
