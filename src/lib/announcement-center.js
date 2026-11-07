import { marked } from 'marked';

export const announcementState = { userId: null, mode: 'closed', selected: null, prompted: [] };

// Read persistence is deliberately separate: navigating or closing a list never marks it read.
export function announcementTransition(state, action) {
  if (action.type === 'sync') {
    const { userId, items, read, blocked } = action;
    if (state.userId !== userId) state = { ...announcementState, userId };
    if (!userId || !items.length) return state.mode === 'closed' ? state : { ...state, mode: 'closed', selected: null };
    if (state.selected && !items.some((item) => item.version === state.selected)) return { ...state, mode: 'list', selected: null };
    if (blocked || state.mode !== 'closed') return state;
    const next = items.find((item) => !read.has(item.version) && !state.prompted.includes(item.version));
    return next ? { ...state, mode: 'reminder', selected: next.version, prompted: items.map((item) => item.version) } : state;
  }
  if (action.type === 'list') return { ...state, userId: action.userId, mode: 'list', selected: null, prompted: action.items.map((item) => item.version) };
  if (action.type === 'detail') return { ...state, mode: 'detail', selected: action.version };
  if (action.type === 'close') return { ...state, mode: 'closed', selected: null };
  return state;
}

export function sortAnnouncements(items) {
  const timestamp = (item) => Number.isFinite(Date.parse(item.published)) ? Date.parse(item.published) : -Infinity;
  return [...items].sort((a, b) => timestamp(b) - timestamp(a));
}

// This is plain text for React text nodes, never HTML. Full bodies use DOMPurify separately.
function plainTokens(tokens) {
  return tokens.map((token) => {
    if (token.type === 'html') return token.text.replace(/<(script|style)\b[^>]*>[\s\S]*?<\/\1\s*>/gi, '').replace(/<\/?(?:p|h[1-6]|div|li|br)\b[^>]*>/gi, '\n').replace(/<[^>]*>/g, '');
    if (token.type === 'space' || token.type === 'br' || token.type === 'hr') return '\n';
    if (token.type === 'list') return token.items.map((item) => plainTokens(item.tokens)).join('\n');
    if (token.type === 'table') return [token.header, ...token.rows].map((row) => row.map((cell) => plainTokens(cell.tokens)).join(' ')).join('\n');
    const value = token.tokens ? plainTokens(token.tokens) : token.text || '';
    return value + (['heading', 'paragraph', 'blockquote', 'code'].includes(token.type) ? '\n' : '');
  }).join('');
}

function plainText(value) {
  return plainTokens(marked.lexer(typeof value === 'string' ? value : '')).replace(/&(#x[\da-f]+|#\d+|amp|lt|gt|quot|apos|nbsp);/gi, (match, entity) => {
    if (!entity.startsWith('#')) return ({ amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ' })[entity.toLowerCase()] || match;
    const code = entity[1].toLowerCase() === 'x' ? parseInt(entity.slice(2), 16) : Number(entity.slice(1));
    return code > 0 && code <= 0x10ffff ? String.fromCodePoint(code) : '';
  });
}

const shorten = (value, limit) => {
  const chars = Array.from(value);
  return chars.length > limit ? `${chars.slice(0, limit).join('')}…` : value;
};

export function announcementPreview(item) {
  const lines = plainText(item.content).split(/\r?\n/).map((line) => line.replace(/\s+/g, ' ').trim()).filter(Boolean);
  const explicit = plainText(item.title).replace(/\s+/g, ' ').trim();
  return { title: shorten(explicit || lines[0] || '', 80), summary: shorten((explicit ? lines : lines.slice(1)).join(' '), 160) };
}
