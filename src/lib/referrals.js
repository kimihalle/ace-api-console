// Use New API's existing key so both consoles share the same invitation code.
export function getReferralCode(search = '', storage) {
  const supplied = new URLSearchParams(search).get('aff');
  const code = supplied?.trim() || '';
  const valid = /^[A-Za-z0-9_-]{1,32}$/.test(code);
  try {
    storage ??= globalThis.localStorage;
    if (supplied !== null) {
      if (valid) storage?.setItem('aff', code);
      else storage?.removeItem('aff');
      return valid ? code : '';
    }
    const saved = storage?.getItem('aff') || '';
    if (/^[A-Za-z0-9_-]{1,32}$/.test(saved)) return saved;
    storage?.removeItem('aff');
  } catch {
    // Blocked browser storage must not prevent direct-link registration.
  }
  return valid ? code : '';
}

export function clearReferralCode(storage) {
  try { (storage ?? globalThis.localStorage)?.removeItem('aff'); } catch { /* Storage may be blocked. */ }
}
