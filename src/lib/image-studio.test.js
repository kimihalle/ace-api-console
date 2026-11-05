import test from 'node:test';
import assert from 'node:assert/strict';
import { imageModels, imageRequest, imageSources } from './image-studio.js';
import { generateImage } from './newapi.js';
import { IMAGE_STUDIO_HISTORY_LIMIT, imageStudioRecordsForUser } from './image-studio-records.js';

test('image generation records are scoped to an account and have a bounded per-user history', () => {
  const records = Array.from({ length: 32 }, (_, index) => ({ userId: 'alice', id: String(index), createdAt: index }))
    .concat({ userId: 'bob', id: 'bob-1', createdAt: 100 });
  const history = imageStudioRecordsForUser(records, 'alice');

  assert.equal(history.length, IMAGE_STUDIO_HISTORY_LIMIT);
  assert.equal(history[0].id, '31');
  assert.equal(history.at(-1).id, '2');
  assert.ok(history.every((record) => record.userId === 'alice'));
  assert.deepEqual(imageStudioRecordsForUser(records, 'unknown'), []);
});

test('image studio offers only models with the image generation endpoint', () => {
  const models = [
    { name: 'image', pricing: { supported_endpoint_types: ['image-generation'] } },
    { name: 'chat', pricing: { supported_endpoint_types: ['openai'] } },
    { name: 'unknown' },
  ];
  assert.deepEqual(imageModels(models).map((model) => model.name), ['image']);
});

test('image request trims prompts and rejects invalid quantity before calling upstream', () => {
  assert.deepEqual(imageRequest({ model: 'image', prompt: '  a tree  ', size: '', count: 2 }), { model: 'image', prompt: 'a tree', n: 2 });
  assert.throws(() => imageRequest({ model: 'image', prompt: 'tree', count: 0 }), /1 至 4/);
  assert.throws(() => imageRequest({ model: 'image', prompt: '', count: 1 }), /提示词/);
});

test('image response accepts URLs and base64 while discarding missing sources', () => {
  assert.deepEqual(imageSources({ data: [{ url: 'https://example.test/a.png' }, { b64_json: 'AAAA' }, {}, { url: 'javascript:alert(1)' }] }), ['https://example.test/a.png', 'data:image/png;base64,AAAA']);
});

test('image request sends the selected full key and studio marker without persisting it', async () => {
  const original = globalThis.fetch;
  globalThis.fetch = async (url, options) => {
    assert.equal(url, '/v1/images/generations');
    assert.equal(options.headers.Authorization, 'Bearer sk-secret');
    assert.equal(options.headers['X-Ace-Image-Studio'], '1');
    assert.deepEqual(JSON.parse(options.body), { model: 'image', prompt: 'tree', n: 1 });
    return Response.json({ data: [{ url: 'https://example.test/a.png' }] });
  };
  try {
    assert.equal(imageSources(await generateImage('sk-secret', { model: 'image', prompt: 'tree', n: 1 })).length, 1);
  } finally {
    globalThis.fetch = original;
  }
});
