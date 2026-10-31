export function tokenId(value) {
  const id = Number(value);
  if (!Number.isSafeInteger(id) || id <= 0) throw new Error('密钥编号无效，请刷新列表后重试');
  return id;
}

export function fullTokenKey(value) {
  if (typeof value !== 'string') return '';
  if (/^sk-[A-Za-z0-9_-]+$/.test(value)) return value;
  // New API's owner-only key endpoints return the raw 48-character value.
  return /^[A-Za-z0-9_-]{32,}$/.test(value) ? `sk-${value}` : '';
}

export function tokenRows(records, secrets = {}) {
  return records.filter((record) => Number.isSafeInteger(Number(record?.id)) && Number(record.id) > 0).map((record) => ({
    id: tokenId(record.id), name: record.name || `Key ${record.id}`,
    secret: fullTokenKey(secrets[record.id]), used: record.used_quota ?? 0, raw: record,
  }));
}
