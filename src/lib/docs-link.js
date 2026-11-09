const DEFAULT_DOCS_HREF = '/docs/';

export function resolveDocsHref(value) {
  if (typeof value !== 'string' || !value.trim()) return DEFAULT_DOCS_HREF;

  const candidate = value.trim();
  if (candidate.startsWith('/') && !candidate.startsWith('//')) return candidate;

  try {
    const url = new URL(candidate);
    return ['http:', 'https:'].includes(url.protocol) ? url.href : DEFAULT_DOCS_HREF;
  } catch {
    return DEFAULT_DOCS_HREF;
  }
}

export function isExternalDocsHref(href, baseOrigin = globalThis.location?.origin) {
  if (!baseOrigin) return /^https?:\/\//i.test(href);
  try {
    return new URL(href, baseOrigin).origin !== baseOrigin;
  } catch {
    return false;
  }
}
