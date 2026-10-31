import assert from 'node:assert/strict';
import { afterEach, test } from 'node:test';
import { loadPelicanImage, loadPelicanDocument } from './newapi.js';
import { readFile } from 'node:fs/promises';
import { mergePelicanHistory, pelicanPreviewDocument } from './pelican-preview.js';

const originalFetch = globalThis.fetch;
afterEach(() => { globalThis.fetch = originalFetch; });

test('pelican images use the authenticated API request and return SVG blobs', async () => {
  let calledUrl;
  let calledInit;
  globalThis.fetch = async (url, init) => {
    calledUrl = url;
    calledInit = init;
    return new Response('<svg/>', { headers: { 'Content-Type': 'image/svg+xml' } });
  };

  const controller = new AbortController();
  const image = await loadPelicanImage('sample-7', controller.signal);

  assert.equal(calledUrl, '/api/pelican/image/sample-7');
  assert.equal(calledInit.credentials, 'include');
  assert.equal(calledInit.signal, controller.signal);
  assert.equal(image.type, 'image/svg+xml');
  assert.equal(await image.text(), '<svg/>');
});

test('pelican image errors retain the server response', async () => {
  globalThis.fetch = async () => new Response(JSON.stringify({ success: false, message: 'sample is unpublished' }), { status: 404, headers: { 'Content-Type': 'application/json' } });
  await assert.rejects(loadPelicanImage('1'), /sample is unpublished/);
});

test('active previews enforce an opaque iframe and place CSP before generated code', async () => {
  const component = await readFile(new URL('../components/PelicanPreview.jsx', import.meta.url), 'utf8');
  assert.ok(component.includes('sandbox="allow-scripts"'));
  assert.ok(!component.includes('allow-same-origin'));
  const source = '<html><head></head><body><script>window.animation = true</script></body></html>';
  const preview = pelicanPreviewDocument(source);
  assert.ok(preview.indexOf('Content-Security-Policy') < preview.indexOf('<script>'));
  assert.ok(preview.includes("connect-src 'none'"));
  assert.ok(preview.includes("frame-src 'none'"));
  assert.ok(preview.endsWith(source));
  assert.throws(() => pelicanPreviewDocument('x'.repeat(1048577)));
  const legacy = pelicanPreviewDocument('<svg></svg>', 'svg');
  assert.ok(legacy.includes('body>svg{display:block;width:100%;height:100%}'));
  assert.ok(legacy.includes('<body><svg></svg></body>'));
});

test('retrying a later history page replaces records instead of duplicating them', () => {
  assert.deepEqual(mergePelicanHistory([{ id: 1 }, { id: 2, status: 'running' }], [{ id: 2, status: 'success' }, { id: 3 }]), [{ id: 1 }, { id: 2, status: 'success' }, { id: 3 }]);
});

test('generated HTML is loaded as JSON data through the existing request boundary', async () => {
  globalThis.fetch = async (url, init) => {
    assert.equal(url, '/api/pelican/document/7');
    assert.equal(init.credentials, 'include');
    return new Response(JSON.stringify({ success: true, data: { format: 'html', source: '<html></html>' } }), { headers: { 'Content-Type': 'application/json' } });
  };
  assert.deepEqual(await loadPelicanDocument(7), { format: 'html', source: '<html></html>' });
});
