export async function downloadStudioImage(source, filename) {
  const response = await fetch(source, { credentials: source.startsWith('/api/') ? 'include' : 'omit', referrerPolicy: 'no-referrer' });
  if (!response.ok) throw new Error('图片下载失败，请稍后重试');
  const blob = await response.blob();
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
}
