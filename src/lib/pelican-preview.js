export const pelicanPreviewPolicy = "default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; img-src data:; font-src data:; connect-src 'none'; frame-src 'none'; worker-src 'none'; object-src 'none'; base-uri 'none'; form-action 'none'";

// This document is only for the opaque sandbox in PelicanPreview, never the DOM.
export function pelicanPreviewDocument(source, format = 'html') {
  if (typeof source !== 'string' || source.length > 1048576) throw new Error('Invalid sample document');
  const document = format === 'svg' ? `<html><head><style>html,body{margin:0;width:100%;height:100%;overflow:hidden}body>svg{display:block;width:100%;height:100%}</style></head><body>${source}</body></html>` : source;
  return `<!doctype html><meta http-equiv="Content-Security-Policy" content="${pelicanPreviewPolicy}"><meta name="referrer" content="no-referrer">${document}`;
}

export function mergePelicanHistory(previous, incoming) {
  return [...new Map([...previous, ...incoming].map((sample) => [sample.id, sample])).values()];
}

export const pelicanTargetKey = (target) => JSON.stringify([target.group, target.model]);

export const pelicanWorkKey = (target) => JSON.stringify([target.group, target.model, target.latest?.id]);

export function pelicanGalleryRecords(targets, histories) {
  return targets.flatMap((target) => {
    const history = histories[pelicanTargetKey(target)];
    const records = history?.loaded ? history.records : target.latest ? [target.latest] : [];
    return mergePelicanHistory([], records).map((sample) => ({ group: target.group, model: target.model, latest: sample }));
  }).sort((a, b) => b.latest.hour - a.latest.hour || b.latest.checked_at - a.latest.checked_at || b.latest.id - a.latest.id);
}

export function togglePelicanWorkComparison(selected, work) {
  const key = pelicanWorkKey(work);
  if (selected.some((item) => pelicanWorkKey(item) === key)) return selected.filter((item) => pelicanWorkKey(item) !== key);
  if (selected.length >= 4 || work.latest?.status !== 'success' || !work.latest.id) return selected;
  return [...selected, { group: work.group, model: work.model, latest: { ...work.latest } }];
}

export function togglePelicanComparison(keys, target, targets) {
  const available = new Set(targets.filter((item) => item.latest?.status === 'success' && item.latest.id).map(pelicanTargetKey));
  const current = keys.filter((key) => available.has(key));
  const key = pelicanTargetKey(target);
  if (current.includes(key)) return current.filter((item) => item !== key);
  return available.has(key) && current.length < 4 ? [...current, key] : current;
}

export function snapshotPelicanComparison(keys, targets) {
  return keys.slice(0, 4).map((key) => targets.find((target) => pelicanTargetKey(target) === key))
    .filter((target) => target?.latest?.status === 'success' && target.latest.id)
    .map((target) => ({ group: target.group, model: target.model, latest: { ...target.latest } }));
}
