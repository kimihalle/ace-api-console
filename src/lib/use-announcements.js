import { useEffect, useMemo, useState } from 'react';
import { markAnnouncementsRead, readAnnouncementVersions, siteAnnouncements } from './site-content.js';

export function useAnnouncements({ userId, status, notice, blocked }) {
  const items = useMemo(() => siteAnnouncements(status, notice), [status, notice]);
  const [dialogUser, setDialogUser] = useState(null);
  const [revision, setRevision] = useState(0);
  const open = Boolean(userId && dialogUser === userId && items.length && !blocked);
  useEffect(() => {
    if (!userId || blocked || open || !items.length) return;
    const read = readAnnouncementVersions(userId);
    if (items.some((item) => !read.has(item.version))) setDialogUser(userId);
  }, [userId, items, blocked, open, revision]);
  return {
    items, open,
    show: () => { if (userId && items.length) setDialogUser(userId); },
    close: () => {
      if (userId) markAnnouncementsRead(userId, items);
      setDialogUser(null);
      setRevision((value) => value + 1);
    },
  };
}
