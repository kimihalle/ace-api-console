import { useEffect, useLayoutEffect, useMemo, useRef } from 'react';
import { createPortal } from 'react-dom';
import { ArrowLeft, ArrowRight, Bell, CheckCheck, ChevronRight, FileText, X } from 'lucide-react';
import { marked } from 'marked';
import DOMPurify from 'dompurify';
import { useLanguage } from '../lib/use-language.js';
import { announcementPreview } from '../lib/announcement-center.js';
import './announcements.css';

export function AnnouncementContent({ content, className = '' }) {
  const html = useMemo(() => DOMPurify.sanitize(marked.parse(content || '', { breaks: true, gfm: true }), {
    USE_PROFILES: { html: true },
    FORBID_TAGS: ['style', 'form', 'input', 'button', 'iframe', 'video', 'audio'],
    FORBID_ATTR: ['style', 'id', 'name', 'target'],
  }), [content]);
  return <div className={`announcement-content ${className}`} dangerouslySetInnerHTML={{ __html: html }} />;
}

export default function AnnouncementDialog({ items, mode, selected, read, unreadCount, onSelect, onList, onMarkAllRead, onClose }) {
  const { t, locale } = useLanguage();
  const dialog = useRef(null);
  const body = useRef(null);
  const listPosition = useRef({ top: 0, version: null });
  const previousView = useRef(mode);
  const rows = useMemo(() => items.map((item) => ({ item, ...announcementPreview(item) })), [items]);
  const isList = mode === 'list';
  const isReminder = mode === 'reminder';
  const dateText = (item, full = false) => Number.isFinite(Date.parse(item.published))
    ? new Intl.DateTimeFormat(locale, { year: 'numeric', month: 'short', day: 'numeric', ...(full ? { hour: '2-digit', minute: '2-digit' } : {}) }).format(new Date(item.published))
    : '';
  const close = useRef(onClose);
  close.current = onClose;
  useEffect(() => {
    const previous = document.activeElement;
    const bodyOverflow = document.body.style.overflow;
    const shell = document.querySelector('.app-shell');
    const wasInert = shell?.inert;
    if (shell) shell.inert = true;
    document.body.style.overflow = 'hidden';
    dialog.current?.querySelector('[data-announcement-close]')?.focus();
    const keydown = (event) => {
      if (event.key === 'Escape') { event.preventDefault(); close.current(); return; }
      if (event.key !== 'Tab') return;
      const elements = [...dialog.current.querySelectorAll('button, a[href], [tabindex="0"]')].filter((element) => !element.disabled && element.getClientRects().length);
      const first = elements[0];
      const last = elements.at(-1);
      if (event.shiftKey && (document.activeElement === first || !elements.includes(document.activeElement))) { event.preventDefault(); last?.focus(); }
      else if (!event.shiftKey && (document.activeElement === last || !elements.includes(document.activeElement))) { event.preventDefault(); first?.focus(); }
    };
    document.addEventListener('keydown', keydown);
    return () => {
      if (shell) shell.inert = wasInert;
      document.body.style.overflow = bodyOverflow;
      document.removeEventListener('keydown', keydown);
      if (previous?.isConnected) previous.focus();
    };
  }, []);
  useLayoutEffect(() => {
    if (previousView.current === mode) return;
    if (isList) {
      if (body.current) body.current.scrollTop = listPosition.current.top;
      const previousRow = [...dialog.current.querySelectorAll('[data-announcement-version]')].find((row) => row.dataset.announcementVersion === listPosition.current.version);
      (previousRow || dialog.current.querySelector('[data-announcement-close]'))?.focus({ preventScroll: true });
    } else {
      if (body.current) body.current.scrollTop = 0;
      dialog.current.querySelector('#announcement-detail')?.focus({ preventScroll: true });
    }
    previousView.current = mode;
  }, [mode, isList]);

  return createPortal(<div className="modal-backdrop announcement-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
    <section ref={dialog} className={`modal announcement-dialog ${isList ? 'is-list' : 'is-detail'}`} role="dialog" aria-modal="true" aria-labelledby="announcement-dialog-title">
      <div className="modal-heading">
        <div className="announcement-dialog-heading">
          <span className="announcement-symbol"><Bell size={20} aria-hidden="true" /></span>
          <div><h2 id="announcement-dialog-title">{t(isReminder ? '新公告' : '系统公告')}</h2>
            <p className="announcement-count" aria-live="polite">{isList ? <>{t('共 {count} 条公告', { count: items.length })}<span aria-hidden="true">·</span><span className={unreadCount ? 'has-unread' : ''}>{unreadCount ? t('{count} 条未读', { count: unreadCount }) : t('全部已读')}</span></> : t(isReminder ? '最新服务动态，请留意' : '公告详情') }</p>
          </div>
        </div>
        <div className="announcement-heading-actions">
          {isList && <button className="announcement-read-all" aria-label={t('全部标为已读')} disabled={!unreadCount} onClick={onMarkAllRead}><CheckCheck size={16} aria-hidden="true" />{t('全部已读')}</button>}
          <button className="icon-button" data-announcement-close onClick={onClose} aria-label={t('关闭')}><X size={20} /></button>
        </div>
      </div>
      {!isList && !isReminder && <div className="announcement-detail-nav"><button className="announcement-back" onClick={onList}><ArrowLeft size={15} aria-hidden="true" />{t('返回公告列表')}</button></div>}
      <div ref={body} className="announcement-dialog-body">
        {isList ? <ul className="announcement-list" aria-label={t('公告列表')}>
          {rows.map(({ item, title, summary }) => {
            const unread = !read.has(item.version);
            const date = dateText(item);
            return <li key={item.version}>
              <button className={`announcement-row${unread ? ' is-unread' : ''}`} data-announcement-version={item.version} onClick={() => {
                listPosition.current = { top: body.current.scrollTop, version: item.version };
                onSelect(item);
              }}>
                <span className="announcement-row-icon"><FileText size={18} aria-hidden="true" /></span>
                <span className="announcement-row-copy">
                  <span className="announcement-row-title">{title || t('系统公告')}</span>
                  {summary && <span className="announcement-row-summary">{summary}</span>}
                  <span className="announcement-row-meta">{date ? <time dateTime={item.published}>{date}</time> : <span>{t('系统通知')}</span>}{unread ? <span className="announcement-unread"><i aria-hidden="true" />{t('未读')}</span> : <span>{t('已读')}</span>}</span>
                </span>
                <ChevronRight className="announcement-row-arrow" size={18} aria-hidden="true" />
              </button>
            </li>;
          })}
        </ul> : selected && <article id="announcement-detail" tabIndex={-1} className="announcement-entry" aria-label={t('公告详情')}>
          <div className="announcement-detail-meta"><span>{t(isReminder ? '最新公告' : '服务通知')}</span>{dateText(selected, true) && <time dateTime={selected.published}>{dateText(selected, true)}</time>}</div>
          {selected.title && <h3>{selected.title}</h3>}
          <AnnouncementContent content={selected.content} />
          {selected.extra && <p className="announcement-extra">{selected.extra}</p>}
        </article>}
      </div>
      <div className="announcement-dialog-actions">
        {isReminder ? <><button className="announcement-back" onClick={onList}>{t('查看全部公告')}<ArrowRight size={15} aria-hidden="true" /></button><button className="button primary" onClick={onClose}>{t('我知道了')}</button></>
          : <><span className="announcement-footer-note">{t(isList ? '点击公告查看完整内容' : '已读状态已保存')}</span><button className="button outline" onClick={onClose}>{t('关闭')}</button></>}
      </div>
    </section>
  </div>, document.body);
}
