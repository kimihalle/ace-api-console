import test from 'node:test';
import assert from 'node:assert/strict';
import { fullTokenKey, tokenId, tokenRows } from './tokens.js';
import { newApi } from './newapi.js';

test('missing or invalid token ids never become /undefined requests', () => {
  for (const id of [undefined, null, '', 'undefined', 'abc', -1, 0, 1.5, Number.MAX_SAFE_INTEGER + 1]) {
    assert.throws(() => tokenId(id));
    assert.throws(() => newApi.tokenKey(id));
    assert.throws(() => newApi.deleteToken(id));
    assert.throws(() => newApi.setTokenStatus(id, 2));
  }
  assert.equal(tokenId('17'), 17);
});

test('token rows use authenticated plaintext responses, never masked keys or phantom create records', () => {
  const records = [{ id: 1, name: 'Project', key: 'sk-abc*****xyz', status: 1 }, { name: 'phantom' }, { id: 2, name: 'Other' }];
  const rows = tokenRows(records, { 1: 'sk-actual-test-value', 2: 'sk-…' });
  assert.equal(rows.length, 2);
  assert.equal(rows[0].secret, 'sk-actual-test-value');
  assert.equal(rows[1].secret, '');
  assert.equal(tokenRows(records)[0].secret, '');
  assert.equal(fullTokenKey('abc'), '');
  assert.equal(fullTokenKey('sk-abc***xyz'), '');
  assert.equal(fullTokenKey('a'.repeat(48)), 'sk-'+'a'.repeat(48));
  assert.equal(fullTokenKey('sk-'+'a'.repeat(48)), 'sk-'+'a'.repeat(48));
});

test('batch key retrieval uses real numeric ids and referral transfer forwards raw internal quota', async () => {
  const previous = globalThis.fetch;
  const calls = [];
  globalThis.fetch = async (url, init) => { calls.push({ url, body: JSON.parse(init.body) }); return new Response(JSON.stringify({ success: true, data: {} }), { headers: { 'Content-Type': 'application/json' } }); };
  try {
    await newApi.tokenKeys([1, '2']);
    await newApi.transferAffiliate(1234567);
    assert.deepEqual(calls, [{ url: '/api/token/batch/keys', body: { ids: [1, 2] } }, { url: '/api/user/aff_transfer', body: { quota: 1234567 } }]);
  } finally { globalThis.fetch = previous; }
});
