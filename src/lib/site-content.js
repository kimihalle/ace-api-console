const text = (value) => typeof value === 'string' ? value.trim() : '';

export function topUpDestination(info) {
  const value = text(info?.topup_link);
  if (!/^https?:\/\//i.test(value) || /[\u0000-\u001f\u007f]/.test(value)) return '';
  try {
    const url = new URL(value);
    return url.hostname && !url.username && !url.password ? url.href : '';
  } catch { return ''; }
}

// Include content even when an id is present: editing an existing notice makes it unread.
export function announcementVersion(item) {
  const value = JSON.stringify([item.source, item.id, item.title, item.content, item.extra, item.published, item.link]);
  let first = 2166136261;
  let second = 5381;
  for (let index = 0; index < value.length; index += 1) {
    first = Math.imul(first ^ value.charCodeAt(index), 16777619);
    second = Math.imul(second, 33) ^ value.charCodeAt(index);
  }
  return `${value.length}-${(first >>> 0).toString(36)}-${(second >>> 0).toString(36)}`;
}

export function siteAnnouncements(status, notice, now = Date.now()) {
  const items = [];
  const content = text(notice);
  // Site Notice is independent of the optional dashboard announcements panel.
  if (content) items.push({ source: 'notice', title: '', content, published: '', extra: '', link: '' });
  if (status?.announcements_enabled && Array.isArray(status.announcements)) {
    items.push(...status.announcements.filter((item) => item && text(item.content)).map((item) => ({
      source: 'announcement', id: item.id, title: text(item.title), content: text(item.content),
      extra: text(item.extra), published: text(item.publishDate || item.publish_date), link: text(item.link),
    })).filter((item) => !item.published || !Number.isFinite(Date.parse(item.published)) || Date.parse(item.published) <= now)
      .sort((a, b) => (Date.parse(b.published) || 0) - (Date.parse(a.published) || 0)));
  }
  return items.map((item) => ({ ...item, version: announcementVersion(item) }));
}

const memoryRead = new Map();
export const announcementReadKey = (userId) => `relay-console.announcements.read.${userId}`;

export function readAnnouncementVersions(userId, storage) {
  const key = announcementReadKey(userId);
  const known = memoryRead.get(key) || [];
  try {
    storage ??= globalThis.localStorage;
    const value = JSON.parse(storage?.getItem(key) || '[]');
    return new Set([...known, ...(Array.isArray(value) ? value.filter((item) => typeof item === 'string') : [])]);
  } catch { return new Set(known); }
}

export function markAnnouncementsRead(userId, items, storage) {
  const key = announcementReadKey(userId);
  const read = readAnnouncementVersions(userId, storage);
  items.forEach((item) => read.add(item.version));
  const value = [...read].slice(-100);
  memoryRead.set(key, value);
  try { (storage ?? globalThis.localStorage)?.setItem(key, JSON.stringify(value)); } catch { /* Keep read state for this session if storage is unavailable. */ }
}
