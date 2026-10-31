import test from 'node:test';
import assert from 'node:assert/strict';
import { announcementReadKey, markAnnouncementsRead, readAnnouncementVersions, siteAnnouncements, topUpDestination } from './site-content.js';

test('purchase destination uses the backend topup_link and only accepts complete HTTP(S) URLs', () => {
  assert.equal(topUpDestination({ topup_link: ' https://billing.example.test/shop?plan=abc&from=console ' }), 'https://billing.example.test/shop?plan=abc&from=console');
  assert.equal(topUpDestination({ topup_link: 'http://localhost:9090/shop' }), 'http://localhost:9090/shop');
  for (const link of ['', 'javascript:alert(1)', 'data:text/html,test', '//example.test/shop', '/console/plans', 'https://u:secret@example.test/', 'https://', 'https://example.test/\nshop']) assert.equal(topUpDestination({ topup_link: link }), '');
  assert.equal(topUpDestination({ TopUpLink: 'https://wrong-field.example.test' }), '');
  assert.equal(topUpDestination(null), '');
});

test('standalone Notice is shown even if the separate dashboard announcements panel is disabled', () => {
  const items = siteAnnouncements({ announcements_enabled: false, announcements: [{ content: 'Disabled panel' }] }, '  # System maintenance\nDetails  ');
  assert.equal(items.length, 1);
  assert.equal(items[0].source, 'notice');
  assert.equal(items[0].content, '# System maintenance\nDetails');
  assert.deepEqual(siteAnnouncements({}, ''), []);
});

test('published panel entries follow Notice, exclude future and empty items, and sort newest first', () => {
  const status = { announcements_enabled: true, announcements: [
    { id: 1, content: 'Earlier', publishDate: '2026-10-01T12:00:00Z' },
    { id: 2, content: 'Scheduled', publish_date: '2026-10-20T12:00:00Z' },
    { id: 3, content: 'Latest', publishDate: '2026-10-19T08:00:00Z', title: 'Update' },
    { id: 4, content: '  ' }, null,
  ] };
  const items = siteAnnouncements(status, 'Main Notice', Date.parse('2026-10-19T12:00:00Z'));
  assert.deepEqual(items.map(({ content }) => content), ['Main Notice', 'Latest', 'Earlier']);
  assert.equal(items[1].title, 'Update');
  assert.equal(status.announcements[0].id, 1, 'Do not mutate the server response');
});

test('editing a notice with the same id creates a new unread version, independent of UI language', () => {
  const status = { announcements_enabled: true, announcements: [{ id: 7, title: 'Release', content: 'First' }] };
  const original = siteAnnouncements(status, '')[0];
  const identical = siteAnnouncements(JSON.parse(JSON.stringify(status)), '')[0];
  const edited = siteAnnouncements({ ...status, announcements: [{ ...status.announcements[0], content: 'Second' }] }, '')[0];
  assert.equal(original.version, identical.version);
  assert.notEqual(original.version, edited.version);
});

test('announcement read state persists per user; malformed and blocked storage do not break viewing', () => {
  const values = new Map();
  const storage = { getItem: (key) => values.get(key), setItem: (key, value) => values.set(key, value) };
  const items = siteAnnouncements({}, 'Read once');
  markAnnouncementsRead('unit-user-1', items, storage);
  assert.equal(readAnnouncementVersions('unit-user-1', storage).has(items[0].version), true);
  assert.equal(readAnnouncementVersions('unit-user-2', storage).size, 0);
  values.set(announcementReadKey('unit-user-2'), '{invalid');
  assert.equal(readAnnouncementVersions('unit-user-2', storage).size, 0);
  const blocked = { getItem() { throw Error('blocked'); }, setItem() { throw Error('blocked'); } };
  markAnnouncementsRead('blocked-user', items, blocked);
  assert.equal(readAnnouncementVersions('blocked-user', blocked).has(items[0].version), true);
});
