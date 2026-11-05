import { builtinModules } from 'node:module';
import js from '@eslint/js';
import tseslint from 'typescript-eslint';

export default tseslint.config(
  { ignores: ['.tools/**', '.agents/**', '.codex/**', '**/dist/**', 'apps/web/build/**', '**/node_modules/**', 'coverage/**'] },
  js.configs.recommended,
  ...tseslint.configs.strict,
  {
    files: ['apps/web/src/**/*.ts', 'apps/web/src/**/*.tsx', 'packages/contracts/src/**/*.ts'],
    rules: {
      'no-restricted-imports': ['error', {
        paths: builtinModules,
        patterns: [{
          group: ['node:*', '@filehub/server', '@filehub/server/*', '**/server/**', '@filehub/contracts/*'],
          message: '瀏覽器與公開契約只能引用公開、瀏覽器可用的模組。',
        }],
      }],
    },
  },
  {
    files: ['apps/server/**/*.ts'],
    rules: {
      'no-restricted-imports': ['error', {
        patterns: [{
          group: ['@filehub/web', '@filehub/web/*', '**/web/src/**', '@filehub/contracts/*'],
          message: '後端不得引用前端或另一個 workspace 的內部實作。',
        }],
      }],
    },
  },
);
