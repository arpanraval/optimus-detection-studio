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
      'output/**',
      'brag-output*/**',
      'docs/**',
      // Loose scratch files kept out of the app build
      'current_git_landing.tsx',
      'initial_auth.tsx',
    ],
  },
  {
    files: ['src/**/*.{tsx,jsx}'],
    ignores: ['src/components/ui/Select.tsx'],
    rules: {
      'no-restricted-syntax': [
        'error',
        {
          selector: 'JSXOpeningElement[name.name="select"]',
          message:
            'Use Select from @/components/ui/Select for single-value dropdowns. Native form support belongs inside that shared component.',
        },
      ],
    },
  },
  {
    files: ['src/**/*.{tsx,jsx}'],
    ignores: ['src/components/design-system/**', 'src/components/new-landing/**'],
    plugins: {
      'loading-ui': { rules: {
        'shared-spinner': {
          meta: { type: 'problem', schema: [] },
          create(context) {
            return { JSXAttribute(node) {
              if (node.name.name !== 'className') return;
              const value = context.sourceCode.getText(node.value ?? node);
              const tag = node.parent.name.name;
              if (['div', 'span', 'svg'].includes(tag) && /\banimate-spin\b/.test(value) && /\bborder-/.test(value)) {
                context.report({ node, message: 'Use the shared Spinner, LoadingStatus or PagePending component for loading indicators.' });
              }
            } };
          },
        },
      } },
    },
    rules: { 'loading-ui/shared-spinner': 'error' },
  },
  {
    // CLI setup scripts are allowed to write to stdout.
    files: ['scripts/**/*.ts'],
    rules: { 'no-console': 'off' },
  },
);
