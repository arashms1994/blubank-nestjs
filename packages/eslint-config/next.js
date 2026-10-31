import { defineConfig } from 'eslint/config';
import nextPlugin from '@next/eslint-plugin-next';
import base from './base.js';

export default defineConfig([
  {
    ...nextPlugin.configs['core-web-vitals'],
    files: ['**/*.{js,jsx,ts,tsx,mjs,cjs,mts,cts}'],
  },
  ...base,
]);
