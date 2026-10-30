import { afterEach, expect, it, vi } from 'vitest';

const createClient = vi.hoisted(() => vi.fn(() => ({ fake: true })));
vi.mock('@supabase/supabase-js', () => ({ createClient }));
afterEach(() => {
  vi.unstubAllEnvs();
  vi.resetModules();
  vi.clearAllMocks();
});

it.each(['sb_secret_private', `eyJhbGciOiJIUzI1NiJ9.${btoa('{"role":"service_role"}').replace(/=+$/, '')}.signature`])(
  'rejects a backend key before constructing the browser client',
  async (key) => {
    vi.stubEnv('VITE_SUPABASE_ANON_KEY', key);
    await expect(import('../supabaseClient')).rejects.toThrow('Backend keys must not be used in the browser');
    expect(createClient).not.toHaveBeenCalled();
  },
);

it('passes a publishable key to the browser client', async () => {
  vi.stubEnv('VITE_SUPABASE_ANON_KEY', 'sb_publishable_public');
  await import('../supabaseClient');
  expect(createClient).toHaveBeenCalledWith('http://localhost:54321', 'sb_publishable_public');
});
