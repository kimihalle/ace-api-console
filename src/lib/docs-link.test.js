import test from 'node:test';
import assert from 'node:assert/strict';
import { isExternalDocsHref, resolveDocsHref } from './docs-link.js';

test('uses local docs as the default and for invalid URLs', () => {
  assert.equal(resolveDocsHref(''), '/docs/');
  assert.equal(resolveDocsHref(null), '/docs/');
  assert.equal(resolveDocsHref('javascript:alert(1)'), '/docs/');
  assert.equal(resolveDocsHref('//example.com/docs'), '/docs/');
});

test('preserves valid local paths and HTTP(S) documentation URLs', () => {
  assert.equal(resolveDocsHref('/help/api'), '/help/api');
  assert.equal(resolveDocsHref('https://example.com/docs'), 'https://example.com/docs');
  assert.equal(resolveDocsHref('http://example.com/docs'), 'http://example.com/docs');
});

test('identifies external links for safe new-tab behavior', () => {
  assert.equal(isExternalDocsHref('/docs/', 'https://site.example'), false);
  assert.equal(isExternalDocsHref('https://site.example/docs', 'https://site.example'), false);
  assert.equal(isExternalDocsHref('https://docs.example/help', 'https://site.example'), true);
});
