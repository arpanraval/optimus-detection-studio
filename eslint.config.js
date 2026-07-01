import js from '@eslint/js';
import tseslint from 'typescript-eslint';
import reactHooks from 'eslint-plugin-react-hooks';

export default tseslint.config(
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    plugins: {
      'react-hooks': reactHooks,
    },
    rules: {
      'react-hooks/rules-of-hooks': 'error',
      'react-hooks/exhaustive-deps': 'warn',
      '@typescript-eslint/no-explicit-any': 'warn',
      '@typescript-eslint/no-unused-vars': ['warn', { argsIgnorePattern: '^_', varsIgnorePattern: '^_' }],
      'no-console': ['warn', { allow: ['warn', 'error'] }],
    },
  },
  {
    ignores: [
      'dist/**',
      'node_modules/**',
      'supabase/functions/**',
      'public/**',
      '.internal/**',
      // Local/tooling artifacts that are not project source
      '~/**',
      '.bun/**',
      '.tmp/**',
      '.vercel/**',
      '.playwright-mcp/**',
      'docs/**',
      // Loose scratch files kept out of the app build
      'current_git_landing.tsx',
      'initial_auth.tsx',
    ],
  },
  {
    // CLI setup scripts are allowed to write to stdout.
    files: ['scripts/**/*.ts'],
    rules: { 'no-console': 'off' },
  },
);
