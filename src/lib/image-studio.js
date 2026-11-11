export function imageModels(models) {
  return (models || []).filter((model) => model.pricing?.supported_endpoint_types?.includes('image-generation'));
}

export function imageSources(payload) {
  const rows = Array.isArray(payload?.data) ? payload.data : [];
  return rows.map((item) => item?.b64_json ? `data:image/png;base64,${item.b64_json}` : item?.url).filter((source) => typeof source === 'string' && (/^data:image\/(png|jpeg|webp);base64,/i.test(source) || /^https:\/\//i.test(source)));
}

export function imageRequest({ model, prompt, size, count }) {
  const cleanPrompt = prompt.trim();
  if (!model || !cleanPrompt) throw new Error('请选择模型并填写提示词');
  if (!Number.isInteger(count) || count < 1 || count > 4) throw new Error('生成数量必须是 1 至 4 张');
  return { model, prompt: cleanPrompt, n: count, ...(size ? { size } : {}) };
}
