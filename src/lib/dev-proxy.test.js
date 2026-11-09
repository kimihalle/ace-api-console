import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer as createHttpServer } from 'node:http';
import { fileURLToPath } from 'node:url';
import { createServer } from 'vite';

test('the dev server forwards admin pages and assets without loading the customer frontend', async (t) => {
  const requests = [];
  const responses = new Map([
    ['/newapi-admin/users', ['text/html', '<!doctype html><title>Admin console</title>']],
    ['/newapi-admin/sign-in?redirect=%2Fusers', ['text/html', '<!doctype html><title>Admin sign-in</title>']],
    ['/newapi-admin/static/js/main.js', ['application/javascript', 'window.adminConsoleLoaded = true;']],
    ['/newapi-admin/static/css/main.css', ['text/css', '.admin-console { display: block; }']],
  ]);
  const upstream = createHttpServer((request, response) => {
    requests.push(request.url);
    const [contentType, body] = responses.get(request.url) || ['text/plain', 'Unexpected upstream request'];
    response.writeHead(responses.has(request.url) ? 200 : 404, { 'Content-Type': contentType });
    response.end(body);
  });
  await new Promise((resolve) => upstream.listen(0, '127.0.0.1', resolve));
  t.after(async () => {
    upstream.closeAllConnections();
    await new Promise((resolve) => upstream.close(resolve));
  });

  const previousTarget = process.env.NEW_API_TARGET;
  process.env.NEW_API_TARGET = `http://127.0.0.1:${upstream.address().port}`;
  let server;
  try {
    server = await createServer({
      root: fileURLToPath(new URL('../../', import.meta.url)),
      mode: 'test',
      logLevel: 'silent',
      server: { host: '127.0.0.1', port: 0, watch: null },
      optimizeDeps: { noDiscovery: true, include: [] },
    });
  } finally {
    if (previousTarget === undefined) delete process.env.NEW_API_TARGET;
    else process.env.NEW_API_TARGET = previousTarget;
  }
  t.after(() => server.close());
  await server.listen();
  const origin = `http://127.0.0.1:${server.httpServer.address().port}`;

  for (const [path, [contentType, body]] of responses) {
    const response = await fetch(`${origin}${path}`);
    assert.equal(response.status, 200, path);
    assert.ok(response.headers.get('content-type').includes(contentType), path);
    assert.equal(await response.text(), body, path);
  }

  const frontend = await fetch(`${origin}/console/dashboard`);
  assert.equal(frontend.status, 200);
  assert.match(await frontend.text(), /\/@vite\/client/);

  const docs = await fetch(`${origin}/docs/`);
  assert.equal(docs.status, 200);
  assert.match(docs.headers.get('content-type'), /text\/html/);
  assert.match(await docs.text(), /API 接入文档/);
  assert.deepEqual(requests, [...responses.keys()]);
});
