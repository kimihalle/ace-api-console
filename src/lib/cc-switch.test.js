import test from 'node:test';
import assert from 'node:assert/strict';
import { buildCCSwitchUrl, ccSwitchModels } from './cc-switch.js';

const input = { app: 'claude', name: '测试站 · 项目 & 开发', models: { model: 'custom/model?alias=a&b', haikuModel: 'haiku-custom', sonnetModel: '', opusModel: 'opus-custom', ignored: 'never-export' }, apiKey: 'a'.repeat(48), serverAddress: 'https://relay.example.test/gateway/' };

test('CC Switch URI matches all three upstream client contracts and URL-encodes names, models and the selected full key', () => {
  for (const app of ['claude', 'codex', 'gemini']) {
    const uri = new URL(buildCCSwitchUrl({ ...input, app }));
    assert.equal(uri.protocol, 'ccswitch:');
    assert.equal(uri.hostname, 'v1');
    assert.equal(uri.pathname, '/import');
    const params = uri.searchParams;
    assert.equal(params.get('resource'), 'provider');
    assert.equal(params.get('app'), app);
    assert.equal(params.get('name'), input.name);
    assert.equal(params.get('apiKey'), `sk-${input.apiKey}`);
    assert.equal(params.get('endpoint'), `https://relay.example.test/gateway${app === 'codex' ? '/v1' : ''}`);
    assert.equal(params.get('homepage'), 'https://relay.example.test/gateway');
    assert.equal(params.get('enabled'), 'true');
    assert.equal(params.get('model'), input.models.model);
    assert.equal(params.get('haikuModel'), app === 'claude' ? 'haiku-custom' : null);
    assert.equal(params.get('opusModel'), app === 'claude' ? 'opus-custom' : null);
    assert.equal(params.get('sonnetModel'), null);
    assert.equal(params.get('ignored'), null);
  }
  const uri = new URL(buildCCSwitchUrl({ ...input, app: 'codex', serverAddress: 'http://localhost:8088/v1/', apiKey: `sk-${input.apiKey}` }));
  assert.equal(uri.searchParams.get('endpoint'), 'http://localhost:8088/v1');
  assert.equal(uri.searchParams.get('apiKey'), `sk-${input.apiKey}`);
});

test('CC Switch rejects invalid client, missing fields, masked keys and unsafe server URLs without echoing the secret', () => {
  for (const overrides of [
    { app: 'unknown' }, { name: ' ' }, { models: {} }, { apiKey: 'sk-abc***xyz' }, { apiKey: undefined },
    ...['javascript:alert(1)', 'file:///tmp', '/api', '', 'https://user:password@example.test', 'https://example.test/?apiKey=private', 'https://example.test/#fragment'].map((serverAddress) => ({ serverAddress })),
  ]) {
    assert.throws(() => buildCCSwitchUrl({ ...input, ...overrides }), (error) => !error.message.includes(input.apiKey));
  }
});

test('CC Switch model choices use actual configured group membership and existing token model limits without mutating the catalog', () => {
  const catalog = [{ name: 'custom-alias', groups: ['vip'] }, { name: 'public', groups: ['all'] }, { name: 'private', groups: ['admin-only'] }, { name: 'custom-alias', groups: ['vip'] }];
  const before = JSON.stringify(catalog);
  assert.deepEqual(ccSwitchModels(catalog, { group: 'vip' }), ['custom-alias', 'public']);
  assert.deepEqual(ccSwitchModels(catalog, { group: 'auto', auto_groups: ['vip'] }), ['custom-alias', 'public']);
  assert.deepEqual(ccSwitchModels(catalog, { group: 'vip', model_limits_enabled: true, model_limits: ' custom-alias,private ' }), ['custom-alias']);
  assert.deepEqual(ccSwitchModels(catalog, { group: 'vip', model_limits_enabled: true, model_limits: '' }), []);
  assert.deepEqual(ccSwitchModels([], { group: 'default' }), []);
  assert.equal(JSON.stringify(catalog), before);
});
