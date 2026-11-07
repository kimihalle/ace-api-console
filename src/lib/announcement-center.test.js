import test from 'node:test';
import assert from 'node:assert/strict';
import { announcementPreview, announcementState, announcementTransition, sortAnnouncements } from './announcement-center.js';

const items = [{ version: 'new', published: '2026-11-07T12:00:00Z' }, { version: 'old', published: '2026-11-06T12:00:00Z' }];
const sync = (state, overrides = {}) => announcementTransition(state, { type: 'sync', userId: 1, items, read: new Set(), blocked: false, ...overrides });

test('automatic reminders show only the latest unread item, and dismissing does not immediately reopen', () => {
  const initial = sync(announcementState);
  assert.equal(initial.mode, 'reminder');
  assert.equal(initial.selected, 'new');
  const closed = announcementTransition(initial, { type: 'close' });
  assert.equal(sync(closed).mode, 'closed');
  const updated = sync(closed, { items: [{ version: 'edited' }, ...items] });
  assert.equal(updated.mode, 'reminder');
  assert.equal(updated.selected, 'edited');
});

test('manual viewing opens the list and never changes read records or repeats a reminder on close', () => {
  const read = new Set(['old']);
  const state = announcementTransition(sync(announcementState, { read }), { type: 'list', userId: 1, items });
  assert.equal(state.mode, 'list');
  const detail = announcementTransition(state, { type: 'detail', version: 'new' });
  assert.equal(detail.mode, 'detail');
  assert.equal(detail.selected, 'new');
  const back = announcementTransition(detail, { type: 'list', userId: 1, items });
  assert.equal(back.selected, null);
  assert.equal(sync(announcementTransition(back, { type: 'close' }), { read }).mode, 'closed');
  assert.deepEqual([...read], ['old']);
});

test('blocking, account changes, and deleted announcements do not expose a stale detail', () => {
  assert.equal(sync(announcementState, { blocked: true }).mode, 'closed');
  assert.equal(sync(announcementState, { read: new Set(['new', 'old']) }).mode, 'closed');
  const initial = sync(announcementState);
  assert.equal(sync(initial, { items: [items[1]] }).mode, 'list');
  assert.equal(sync(initial, { items: [] }).mode, 'closed');
  const signedOut = sync(initial, { userId: null });
  assert.equal(signedOut.mode, 'closed');
  assert.equal(signedOut.userId, null);
  assert.equal(sync(initial, { userId: 2 }).userId, 2);
  assert.equal(sync(initial, { userId: 2, read: new Set(['new', 'old']) }).mode, 'closed');
});

test('dated notices are newest first, undated legacy Notice stays accessible without mutating input', () => {
  const input = [{ version: 'legacy', published: '' }, items[1], { version: 'invalid', published: 'unknown' }, items[0]];
  assert.deepEqual(sortAnnouncements(input).map((item) => item.version), ['new', 'old', 'legacy', 'invalid']);
  assert.equal(input[0].version, 'legacy');
});

test('list preview extracts readable titles and summaries, not Markdown syntax or link destinations', () => {
  assert.deepEqual(announcementPreview({ content: '# **视频模型上线**\n\n支持 [模型调用](https://example.test/secret) 与 `API`。' }), { title: '视频模型上线', summary: '支持 模型调用 与 API。' });
  assert.deepEqual(announcementPreview({ title: '价格调整', content: '新的计费方式\n更多说明' }), { title: '价格调整', summary: '新的计费方式 更多说明' });
  assert.deepEqual(announcementPreview({ content: '只有一句公告' }), { title: '只有一句公告', summary: '' });
  assert.deepEqual(announcementPreview({ content: '<h2>更新 &amp; 通知</h2><p>说明</p><script>alert(1)</script>' }), { title: '更新 & 通知', summary: '说明' });
  assert.deepEqual(announcementPreview({ content: '![模型图片](https://example.test/image.png)\n\n新增模型' }), { title: '模型图片', summary: '新增模型' });
  assert.ok(announcementPreview({ content: '很长的公告'.repeat(100) }).title.length <= 81);
});
