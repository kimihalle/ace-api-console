import { t } from './i18n.js';

export async function copyText(value) {
  if (typeof value !== 'string' || !value) throw new Error(t('没有可复制的内容'));
  try {
    if (navigator.clipboard?.writeText) { await navigator.clipboard.writeText(value); return; }
  } catch { /* Older browsers and HTTP deployments can still use selection-based copying. */ }
  const previous = document.activeElement;
  const selection = document.getSelection();
  const ranges = selection ? Array.from({ length: selection.rangeCount }, (_, index) => selection.getRangeAt(index).cloneRange()) : [];
  const field = document.createElement('textarea');
  field.value = value;
  field.setAttribute('readonly', '');
  field.style.cssText = 'position:fixed;top:0;left:0;width:1px;height:1px;opacity:0;pointer-events:none;';
  document.body.append(field);
  try {
    field.focus(); field.select(); field.setSelectionRange(0, value.length);
    if (typeof document.execCommand !== 'function' || !document.execCommand('copy')) throw new Error(t('复制失败，请手动选择并复制'));
  } finally {
    field.remove();
    if (previous?.isConnected) previous.focus({ preventScroll: true });
    if (selection) { selection.removeAllRanges(); ranges.forEach((range) => selection.addRange(range)); }
  }
}
