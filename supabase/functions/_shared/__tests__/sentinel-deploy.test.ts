// @vitest-environment node
import { afterAll, beforeAll, expect, it, vi } from 'vitest';
let deploy: typeof import('../../integration-ops/index').sentinelDeployRule;
beforeAll(async () => {
  vi.stubGlobal('Deno', { env: { get: () => '' } });
  deploy = (await import('../../integration-ops/index')).sentinelDeployRule;
});
afterAll(() => vi.unstubAllGlobals());

it.each([true, false])('sends enabled=%s and separate ATT&CK fields to Sentinel', async (enabled) => {
  const fetch = vi.fn(async (url: string, init: RequestInit) => {
    if (url.startsWith('https://login.microsoftonline.com/')) return Response.json({ access_token: 'test-token' });
    expect(url).toContain('api-version=2025-07-01-preview');
    expect(init.method).toBe('PUT');
    const body = JSON.parse(String(init.body));
    expect(body.properties).toMatchObject({ enabled, tactics: ['Execution'], techniques: ['T1059'], subTechniques: ['T1059.001'] });
    return Response.json(body);
  });
  vi.stubGlobal('fetch', fetch);
  await deploy({ tenantId: 'test', subscriptionId: 'test', resourceGroup: 'test', workspaceName: 'test' },
    { clientId: 'test', clientSecret: 'test' }, 'SecurityEvent',
    { enabled, tactics: ['Execution'], techniques: ['T1059.001'] }, 'create');
  expect(fetch).toHaveBeenCalledTimes(2);
});
