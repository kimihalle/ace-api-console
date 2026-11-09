import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';

function docsRoute() {
  const rewrite = (request, _response, next) => {
    if (request.url === '/docs' || request.url === '/docs/' || request.url?.startsWith('/docs/?')) {
      request.url = request.url.replace(/^\/docs\/?/, '/docs/index.html');
    }
    next();
  };
  return {
    name: 'docs-route',
    configureServer(server) { server.middlewares.use(rewrite); },
    configurePreviewServer(server) { server.middlewares.use(rewrite); },
  };
}

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '');
  const target = env.NEW_API_TARGET;
  const proxy = target ? {
    '^/newapi-admin(?:/|$)': { target, changeOrigin: true },
    '/api': { target, changeOrigin: true },
    '/v1': { target, changeOrigin: true },
    '/v1beta': { target, changeOrigin: true },
  } : undefined;
  return {
    plugins: [react(), docsRoute()],
    server: { host: '0.0.0.0', proxy },
    preview: { host: '0.0.0.0' },
  };
});
