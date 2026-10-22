// The Google TypeScript style, as Google's own gts package configures it,
// restated for eslint 10 (gts itself still pins eslint 9). Prettier owns
// formatting; these rules cover what it can't.
import js from '@eslint/js';
import prettier from 'eslint-config-prettier';
import reactHooks from 'eslint-plugin-react-hooks';
import globals from 'globals';
import tseslint from 'typescript-eslint';

export default tseslint.config(
  {ignores: ['dist', 'node_modules', '.superpowers']},
  js.configs.recommended,
  prettier,
  {
    languageOptions: {globals: {...globals.browser, ...globals.node}},
    rules: {
      'block-scoped-var': 'error',
      // The guide allows == null to also catch undefined.
      eqeqeq: ['error', 'always', {null: 'ignore'}],
      'no-var': 'error',
      'prefer-const': 'error',
      'prefer-arrow-callback': 'error',
      'no-restricted-properties': [
        'error',
        {object: 'describe', property: 'only'},
        {object: 'it', property: 'only'},
      ],
    },
  },
  {
    files: ['**/*.ts', '**/*.tsx'],
    extends: [tseslint.configs.recommended],
    languageOptions: {
      parserOptions: {
        projectService: true,
        tsconfigRootDir: import.meta.dirname,
      },
    },
    rules: {
      '@typescript-eslint/ban-ts-comment': 'warn',
      '@typescript-eslint/no-floating-promises': 'error',
      // The guide: no leading or trailing underscores, and named exports only.
      '@typescript-eslint/naming-convention': [
        'error',
        {
          selector: 'default',
          format: null,
          leadingUnderscore: 'forbid',
          trailingUnderscore: 'forbid',
        },
      ],
      'no-restricted-syntax': [
        'error',
        {
          selector: 'ExportDefaultDeclaration',
          message: 'Use named exports (Google TypeScript style).',
        },
      ],
    },
  },
  {
    // Tools that require a default export.
    files: ['vite.config.ts', 'vitest.config.ts'],
    rules: {'no-restricted-syntax': 'off'},
  },
  {
    files: ['src/react/**/*.tsx', 'playground/**/*.tsx'],
    plugins: {'react-hooks': reactHooks},
    rules: {
      'react-hooks/rules-of-hooks': 'error',
      'react-hooks/exhaustive-deps': 'warn',
    },
  },
);
