import { loadImageStudioSource } from './newapi.js';

export async function downloadStudioImage(source, filename) {
  const loaded = await loadImageStudioSource(source);
  try {
    const response = loaded.revoke ? null : await fetch(loaded.url, { credentials: 'omit', referrerPolicy: 'no-referrer' });
    if (response && !response.ok) throw new Error('图片下载失败，请稍后重试');
    const blob = loaded.revoke ? await fetch(loaded.url).then((result) => result.blob()) : await response.blob();
    if (!blob.size) throw new Error('图片下载失败，请稍后重试');
    const extension = { 'image/png': 'png', 'image/jpeg': 'jpg', 'image/webp': 'webp', 'image/gif': 'gif', 'image/avif': 'avif' }[blob.type.split(';')[0]] || 'png';
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `${filename}.${extension}`;
    document.body.append(link);
    link.click();
    link.remove();
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
  } finally {
    if (loaded.revoke) URL.revokeObjectURL(loaded.url);
  }
}
