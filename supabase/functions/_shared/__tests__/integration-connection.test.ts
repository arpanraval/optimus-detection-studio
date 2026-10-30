// @vitest-environment node
import { afterAll, beforeAll, beforeEach, expect, it, vi } from 'vitest';
import { getRegisteredHandler } from '../../../../vitest.shims/deno-std-http-server';

const mocks = vi.hoisted(() => ({ client: vi.fn(), from: vi.fn() }));
vi.mock('@supabase/supabase-js', () => ({ createClient: mocks.client }));
vi.mock('../rate-limiter', () => ({ checkRateLimit: vi.fn(async () => ({ allowed: true })) }));
let handler: NonNullable<ReturnType<typeof getRegisteredHandler>>;
let provider = 'jira';
let updates: Record<string, unknown>[];
let credentialsMissing = true;
let encryptedCredentials = '';
const vendorFetch = vi.fn();

beforeAll(async () => {
  vi.stubGlobal('Deno', { env: { get: (name: string) => name === 'INTEGRATION_ENCRYPTION_KEY' ? '01'.repeat(32) : '' } });
  const key = await crypto.subtle.importKey('raw', new Uint8Array(32).fill(1), 'AES-GCM', false, ['encrypt']);
  const iv = new Uint8Array(12);
  const ciphertext = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, new TextEncoder().encode('{"token":"fixture-token"}')));
  encryptedCredentials = Buffer.concat([iv, ciphertext]).toString('base64');
  vi.stubGlobal('fetch', vendorFetch);
  await import('../../integration-ops/index');
  handler = getRegisteredHandler()!;
});
afterAll(() => vi.unstubAllGlobals());
beforeEach(() => {
  vi.clearAllMocks();
  updates = [];
  credentialsMissing = true;
  mocks.client.mockReturnValue({
    from: mocks.from,
    auth: { getUser: async () => ({ data: { user: { id: 'user' } }, error: null }) },
  });
  mocks.from.mockImplementation((table: string) => {
    const query = {
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      order: vi.fn().mockReturnThis(),
      limit: vi.fn().mockReturnThis(),
      update: vi.fn((value) => { updates.push(value); return query; }),
      single: async () => {
        if (table === 'profiles') return { data: { role: 'owner' } };
        if (table === 'integrations') return { data: { id: 'connection', provider, config: { host: 'splunk.example.com' } } };
        if (credentialsMissing) return { data: null, error: { message: 'No credentials' } };
        return { data: { encrypted_data: encryptedCredentials } };
      },
    };
    return query;
  });
});

async function testConnection() {
  return handler(new Request('http://localhost', {
    method: 'POST',
    headers: { Authorization: 'Bearer user-token', 'Content-Type': 'application/json' },
    body: JSON.stringify({ action: 'test_connection', integrationId: 'connection' }),
  }));
}

it.each(['jira', 'slack', 'github', 'gitlab', 'azure_devops'])('does not claim to verify %s', async (value) => {
  provider = value;
  credentialsMissing = false;
  const response = await testConnection();
  expect(response.status).toBe(200);
  expect(await response.json()).toMatchObject({ success: false, code: 'TEST_NOT_SUPPORTED', latency_ms: 0 });
  expect(updates).toEqual([expect.objectContaining({ status: 'configured', last_tested_at: null })]);
  expect(mocks.from).not.toHaveBeenCalledWith('integration_credentials');
});

it('continues to reject missing credentials for an implemented provider', async () => {
  provider = 'splunk';
  const response = await testConnection();
  expect(await response.json()).toMatchObject({ success: false, message: 'No credentials found' });
  expect(updates.map((value) => value.status)).toEqual(['testing', 'error']);
});

it.each([200, 401])('preserves supported vendor verification for HTTP %s', async (status) => {
  provider = 'splunk';
  credentialsMissing = false;
  vendorFetch.mockResolvedValue(new Response(JSON.stringify({ entry: [{ content: { serverName: 'fixture', version: '9' } }] }), { status }));
  const response = await testConnection();
  expect(await response.json()).toMatchObject({ success: status === 200 });
  expect(updates.map((value) => value.status)).toEqual(['testing', status === 200 ? 'connected' : 'error']);
  expect(vendorFetch).toHaveBeenCalledWith('https://splunk.example.com:8089/services/server/info?output_mode=json', expect.objectContaining({
    headers: expect.objectContaining({ Authorization: 'Bearer fixture-token' }),
  }));
});
