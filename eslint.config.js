import js from '@eslint/js';
import { defineConfig, globalIgnores } from 'eslint/config';
import prettier from 'eslint-config-prettier/flat';
import jsxA11y from 'eslint-plugin-jsx-a11y';
import reactHooks from 'eslint-plugin-react-hooks';
import globals from 'globals';
import tseslint from 'typescript-eslint';

export default defineConfig(
  globalIgnores([
    '**/dist/**',
    '**/.next/**',
    '**/node_modules/**',
    '**/next-env.d.ts',
    'examples/playground/public/r/**',
    '.media-tmp/**',
  ]),
  js.configs.recommended,
  tseslint.configs.recommended,
  reactHooks.configs.flat.recommended,
  jsxA11y.flatConfigs.strict,
  {
    languageOptions: {
      globals: { ...globals.browser, ...globals.node },
    },
    rules: {
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_', varsIgnorePattern: '^_' }],
      '@typescript-eslint/consistent-type-imports': ['error', { fixStyle: 'inline-type-imports' }],
      // Focusable groups are used for roving-tabindex composites (diff hunks) and scrollable code regions.
      'jsx-a11y/no-noninteractive-tabindex': [
        'error',
        { tags: [], roles: ['tabpanel', 'group'], allowExpressionValues: true },
      ],
      // Composite widgets take keys and focus on their container: shortcuts scoped to focus within
      // the approval card and the diff review (sections, WCAG 2.1.4), arrow keys between tool calls
      // (the list) and roving focus between diff hunks (groups). Allowed here rather than with
      // disable comments, which the shadcn registry would copy into apps that lint without this rule.
      'jsx-a11y/no-noninteractive-element-interactions': [
        'error',
        {
          body: ['onError', 'onLoad'],
          iframe: ['onError', 'onLoad'],
          img: ['onError', 'onLoad'],
          section: ['onKeyDown'],
          ol: ['onKeyDown'],
          div: ['onFocus'],
        },
      ],
      // Message images render through Img (lib/primitives.tsx); check its alt text like an <img>.
      'jsx-a11y/alt-text': ['error', { img: ['Img'] }],
    },
  },
  {
    files: ['**/test/**', '**/*.test.{ts,tsx}'],
    rules: {
      '@typescript-eslint/no-non-null-assertion': 'off',
    },
  },
  prettier,
);
