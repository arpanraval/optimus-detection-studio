import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import path from 'path';

export default defineConfig({
  plugins: [react()],
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: ['./vitest.setup.ts'],

    // src/lib/supabaseClient.ts throws at MODULE scope when these are unset,
    // so any suite that transitively imports it fails to load rather than
    // failing an assertion. That made the suite pass on a developer machine
    // (where .env.local supplies them) and fail in CI, which has no
    // .env.local because the file is gitignored.
    //
    // Declaring them here makes the run hermetic: identical locally and in
    // CI, and independent of whatever .env.local happens to hold. These are
    // placeholders and must stay that way — every suite stubs the client, so
    // nothing here should ever reach a real project.
    env: {
      VITE_SUPABASE_URL: 'http://localhost:54321',
      VITE_SUPABASE_ANON_KEY: 'test-anon-key',
    },
    include: [
      'src/**/__tests__/**/*.test.{ts,tsx}',
      'supabase/functions/_shared/__tests__/**/*.test.ts',
      // Threat-research orchestrator tests. These are no longer restricted to
      // import-safe leaf modules: the aliases below resolve the Deno-targeted
      // remote imports, so orchestrator.ts and the agents load here too.
      'supabase/functions/threat-research-orchestrator/lib/__tests__/**/*.test.ts',
    ],
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),

      // The edge functions import Deno-style remote URLs, which vitest cannot
      // fetch or resolve. Mapping them to local equivalents is what makes the
      // orchestrator import chain (orchestrator -> agent-loop ->
      // anthropic-direct -> aiTelemetry) loadable under test.
      //
      // Why this rather than refactoring the source: the ONLY module-scope
      // blocker is the import specifier itself. No module in that chain builds
      // a Supabase client or reads Deno.env at module scope — every such call
      // sits inside a function body, and anthropic-raw.ts is already guarded
      // with `typeof Deno`. So a one-line resolution fix buys the same
      // testability that a dependency-injection rewrite would, without
      // refactoring 1,600 lines of the only working pipeline before any test
      // exists to protect it. The DI extraction still follows — this is what
      // makes it safe to attempt.
      //
      // Version skew is deliberate and acceptable: production pins 2.39.3,
      // node_modules carries 2.90.1, and the surface under test
      // (createClient, SupabaseClient, PostgrestError) is unchanged between
      // them. Tests stub the client anyway; what matters is that the module
      // graph resolves.
      'https://esm.sh/@supabase/supabase-js@2.39.3': '@supabase/supabase-js',
      'https://esm.sh/@supabase/supabase-js@2': '@supabase/supabase-js',

      // Entrypoints call serve() at module scope. The shim captures the
      // handler instead of binding a socket, so a test can drive the real
      // routing and action dispatch with a plain Request.
      'https://deno.land/std@0.177.0/http/server.ts': path.resolve(
        __dirname,
        './vitest.shims/deno-std-http-server.ts',
      ),
    },
  },
});
