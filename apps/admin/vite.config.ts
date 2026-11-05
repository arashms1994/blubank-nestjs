import react from '@vitejs/plugin-react';
import { defineConfig, loadEnv } from 'vite';

// https://vite.dev/config/
export default defineConfig(({ mode }) => ({
  plugins: [react()],
  server: {
    port: Number(loadEnv(mode, process.cwd(), '').PORT ?? process.env.PORT ?? 5173),
    strictPort: true,
  },
  preview: {
    port: Number(loadEnv(mode, process.cwd(), '').PORT ?? process.env.PORT ?? 4173),
    strictPort: true,
  },
}));
