import test from 'node:test';
import assert from 'node:assert/strict';
import { consolePages, consolePage, consolePath, consoleReturnPath, isConsolePath } from './routes.js';

test('every console page has a stable URL, with the existing console URL retained', () => {
  for (const page of consolePages) {
    assert.equal(consolePage(consolePath(page)), page);
    assert.equal(isConsolePath(consolePath(page)), true);
  }
  assert.equal(consolePage('/console'), 'dashboard');
  assert.equal(consolePage('/console/keys/'), 'keys');
  assert.equal(consolePage('/console/unknown'), null);
  assert.equal(isConsolePath('/console-other'), false);
});

test('login return paths never accept external addresses or non-console routes', () => {
  assert.equal(consoleReturnPath('?redirect=%2Fconsole%2Fmodels'), '/console/models');
  for (const path of ['https://example.test', '//example.test', '/newapi-admin/users', '/console/unknown', '/console/keys?redirect=//example.test']) {
    assert.equal(consoleReturnPath(`?redirect=${encodeURIComponent(path)}`), '/console/dashboard');
  }
});
