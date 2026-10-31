import { useEffect, useId, useRef } from 'react';
import { createPortal } from 'react-dom';
import { X } from 'lucide-react';
import { useLanguage } from '../lib/use-language.js';

export default function Dialog({ title, onClose, children, className = '' }) {
  const { t } = useLanguage();
  const titleId = useId();
  const dialog = useRef(null);
  const close = useRef(onClose);
  close.current = onClose;
  useEffect(() => {
    const previous = document.activeElement;
    const overflow = document.body.style.overflow;
    const shell = document.querySelector('.app-shell');
    const wasInert = shell?.inert;
    if (shell) shell.inert = true;
    document.body.style.overflow = 'hidden';
    (dialog.current?.querySelector('[data-initial-focus]') || dialog.current?.querySelector('button'))?.focus();
    const keydown = (event) => {
      if (event.key === 'Escape' && !event.defaultPrevented) { event.preventDefault(); close.current(); }
      if (event.key !== 'Tab') return;
      const elements = [...dialog.current.querySelectorAll('button:not(:disabled), input:not(:disabled), a[href], [tabindex="0"]')].filter((el) => el.tabIndex >= 0 && el.getClientRects().length);
      const first = elements[0]; const last = elements.at(-1);
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
    };
    document.addEventListener('keydown', keydown);
    return () => {
      if (shell) shell.inert = wasInert;
      document.body.style.overflow = overflow;
      document.removeEventListener('keydown', keydown);
      if (previous?.isConnected) previous.focus({ preventScroll: true });
    };
  }, []);
  useEffect(() => {
    if (dialog.current && !dialog.current.contains(document.activeElement)) (dialog.current.querySelector('[data-initial-focus]') || dialog.current.querySelector('button'))?.focus();
  }, [title]);
  return createPortal(<div className="modal-backdrop compact-dialog-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
    <section ref={dialog} className={`modal compact-dialog ${className}`} role="dialog" aria-modal="true" aria-labelledby={titleId}>
      <div className="modal-heading"><h2 id={titleId}>{title}</h2><button className="icon-button" aria-label={t('关闭')} onClick={onClose}><X size={19} /></button></div>
      {children}
    </section>
  </div>, document.body);
}
