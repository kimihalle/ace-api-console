import { useEffect, useRef, useState } from 'react';
import { pelicanPreviewDocument } from '../lib/pelican-preview.js';

// Browser verification (Chrome with web security enabled): opaque origin,
// parent DOM/cookie/storage denied, connect-src blocked, animation running.
export default function PelicanPreview({ source, title, format = 'html', revision = 0, display = 'responsive' }) {
  const host = useRef(null);
  const [visible, setVisible] = useState(false);
  const [scale, setScale] = useState(1);
  useEffect(() => {
    const observer = new IntersectionObserver(([entry]) => setVisible(entry.isIntersecting), { rootMargin: '100px' });
    if (host.current) observer.observe(host.current);
    return () => observer.disconnect();
  }, []);
  useEffect(() => {
    if (display === 'responsive') return;
    const observer = new ResizeObserver(([entry]) => {
      const { width, height } = entry.contentRect;
      setScale(display === 'actual' ? 1 : Math.min(width / 960, height / 720));
    });
    if (host.current) observer.observe(host.current);
    return () => observer.disconnect();
  }, [display]);
  const sized = display !== 'responsive';
  return <div ref={host} className={`pelican-live-frame${sized ? ' is-sized' : ''}${display === 'actual' ? ' is-actual' : ''}`}>
    <div className="pelican-frame-canvas" style={sized ? { width: 960 * scale, height: 720 * scale } : undefined}>
      {visible && <iframe key={revision} title={title} sandbox="allow-scripts" referrerPolicy="no-referrer" tabIndex={display === 'thumbnail' ? -1 : undefined} style={sized ? { width: 960, height: 720, transform: `scale(${scale})`, transformOrigin: 'top left' } : undefined} srcDoc={pelicanPreviewDocument(source, format)} />}
    </div>
  </div>;
}
