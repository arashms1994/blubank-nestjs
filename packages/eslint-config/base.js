import { defineConfig, globalIgnores } from 'eslint/config';
import prettier from 'eslint-config-prettier';
import simpleImportSort from 'eslint-plugin-simple-import-sort';
import turbo from 'eslint-plugin-turbo';
import tseslint from 'typescript-eslint';

const typedConfigs = tseslint.configs.recommendedTypeChecked.map((config) => ({
  ...config,
  files: ['**/*.{ts,tsx,mts,cts}'],
}));

export default defineConfig([
  globalIgnores(['**/node_modules/**', '**/.next/**', '**/dist/**', '**/coverage/**']),
  ...typedConfigs,
  {
    files: ['**/*.{ts,tsx,mts,cts}'],
    languageOptions: {
      parserOptions: {
        projectService: true,
      },
    },
    plugins: {
      turbo,
      'simple-import-sort': simpleImportSort,
    },
    rules: {
      '@typescript-eslint/no-explicit-any': 'error',
      '@typescript-eslint/no-non-null-assertion': 'error',
      'simple-import-sort/exports': 'error',
      'simple-import-sort/imports': 'error',
      'turbo/no-undeclared-env-vars': 'error',
    },
  },
  prettier,
]);
