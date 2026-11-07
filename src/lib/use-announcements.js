import { useEffect, useMemo, useReducer, useState } from 'react';
import { announcementReadKey, markAnnouncementsRead, readAnnouncementVersions, siteAnnouncements } from './site-content.js';
import { announcementState, announcementTransition, sortAnnouncements } from './announcement-center.js';

export function useAnnouncements({ userId, status, notice, blocked }) {
  const items = useMemo(() => sortAnnouncements(siteAnnouncements(status, notice)), [status, notice]);
  const [state, dispatch] = useReducer(announcementTransition, announcementState);
  const [revision, setRevision] = useState(0);
  const read = useMemo(() => readAnnouncementVersions(userId), [userId, revision]);
  const open = Boolean(userId && state.userId === userId && state.mode !== 'closed' && items.length && !blocked);
  const selected = items.find((item) => item.version === state.selected);
  useEffect(() => {
    dispatch({ type: 'sync', userId, items, read, blocked });
  }, [userId, items, read, blocked, state]);
  useEffect(() => {
    const onStorage = (event) => {
      if (event.key === null || event.key === announcementReadKey(userId)) setRevision((value) => value + 1);
    };
    window.addEventListener('storage', onStorage);
    return () => window.removeEventListener('storage', onStorage);
  }, [userId]);

  const markRead = (entries) => {
    if (!userId || !entries.length) return;
    markAnnouncementsRead(userId, entries);
    setRevision((value) => value + 1);
  };
  const acknowledgeReminder = () => {
    if (state.userId === userId && state.mode === 'reminder' && selected) markRead([selected]);
  };
  return {
    items, open, mode: state.mode, selected, read,
    unreadCount: items.filter((item) => !read.has(item.version)).length,
    show: () => {
      if (!userId || !items.length) return;
      acknowledgeReminder();
      dispatch({ type: 'list', userId, items });
    },
    select: (item) => {
      if (!userId || !items.some((entry) => entry.version === item.version)) return;
      markRead([item]);
      dispatch({ type: 'detail', version: item.version });
    },
    markAllRead: () => markRead(items),
    close: () => {
      acknowledgeReminder();
      dispatch({ type: 'close' });
    },
  };
}
