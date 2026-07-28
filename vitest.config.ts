import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import path from 'path';

export default defineConfig({
  plugins: [react()],
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: [],
    include: [
      'src/**/__tests__/**/*.test.{ts,tsx}',
      'supabase/functions/_shared/__tests__/**/*.test.ts',
      // Pure-logic modules extracted out of the threat-research orchestrator.
      // Only import-safe files belong here: orchestrator.ts and the agent
      // modules import the Supabase client from esm.sh at module scope, which
      // vitest cannot resolve without network access.
      'supabase/functions/threat-research-orchestrator/lib/__tests__/**/*.test.ts',
    ],
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
});
