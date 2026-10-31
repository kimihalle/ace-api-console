import { useEffect, useMemo, useRef } from 'react';
import { createPortal } from 'react-dom';
import { Bell, X } from 'lucide-react';
import { marked } from 'marked';
import DOMPurify from 'dompurify';
import { useLanguage } from '../lib/use-language.js';

export function AnnouncementContent({ content, className = '' }) {
  const html = useMemo(() => DOMPurify.sanitize(marked.parse(content || '', { breaks: true, gfm: true }), {
    USE_PROFILES: { html: true },
    FORBID_TAGS: ['style', 'form', 'input', 'button', 'iframe', 'video', 'audio'],
    FORBID_ATTR: ['style', 'id', 'name', 'target'],
  }), [content]);
  return <div className={`announcement-content ${className}`} dangerouslySetInnerHTML={{ __html: html }} />;
}

export default function AnnouncementDialog({ items, onClose }) {
  const { t, locale } = useLanguage();
  const dialog = useRef(null);
  const close = useRef(onClose);
  close.current = onClose;
  useEffect(() => {
    const previous = document.activeElement;
    const bodyOverflow = document.body.style.overflow;
    const shell = document.querySelector('.app-shell');
    const wasInert = shell?.inert;
    if (shell) shell.inert = true;
    document.body.style.overflow = 'hidden';
    dialog.current?.querySelector('button')?.focus();
    const keydown = (event) => {
      if (event.key === 'Escape') { event.preventDefault(); close.current(); return; }
      if (event.key !== 'Tab') return;
      const elements = [...dialog.current.querySelectorAll('button, a[href], [tabindex="0"]')].filter((element) => !element.disabled);
      const first = elements[0];
      const last = elements.at(-1);
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
    };
    document.addEventListener('keydown', keydown);
    return () => {
      if (shell) shell.inert = wasInert;
      document.body.style.overflow = bodyOverflow;
      document.removeEventListener('keydown', keydown);
      if (previous?.isConnected) previous.focus();
    };
  }, []);
  return createPortal(<div className="modal-backdrop announcement-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
    <section ref={dialog} className="modal announcement-dialog" role="dialog" aria-modal="true" aria-labelledby="announcement-dialog-title">
      <div className="modal-heading"><div className="announcement-dialog-heading"><span className="announcement-symbol"><Bell size={19} /></span><h2 id="announcement-dialog-title">{t('系统公告')}</h2></div><button className="icon-button" onClick={onClose} aria-label={t('关闭')}><X size={19} /></button></div>
      <div className="announcement-dialog-body">{items.map((item) => <article key={item.version} className="announcement-entry">
        {item.title && <h3>{item.title}</h3>}
        {Number.isFinite(Date.parse(item.published)) && <time dateTime={item.published}>{new Date(item.published).toLocaleString(locale)}</time>}
        <AnnouncementContent content={item.content} />
        {item.extra && <p className="announcement-extra">{item.extra}</p>}
      </article>)}</div>
      <div className="announcement-dialog-actions"><button className="button primary" onClick={onClose}>{t('我知道了')}</button></div>
    </section>
  </div>, document.body);
}
