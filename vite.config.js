import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '');
  const target = env.NEW_API_TARGET;
  const proxy = target ? {
    '/api': { target, changeOrigin: true },
    '/v1': { target, changeOrigin: true },
    '/v1beta': { target, changeOrigin: true },
  } : undefined;
  return {
    plugins: [react()],
    server: { host: '0.0.0.0', proxy },
    preview: { host: '0.0.0.0' },
  };
});
