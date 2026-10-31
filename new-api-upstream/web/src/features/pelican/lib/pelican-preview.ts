// Render only in an iframe with sandbox="allow-scripts" and no same-origin grant.
export function pelicanPreviewDocument(
  source: string,
  format: 'html' | 'svg' = 'html'
): string {
  if (source.length > 1048576) throw new Error('Invalid sample document')
  const policy =
    "default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; img-src data:; font-src data:; connect-src 'none'; frame-src 'none'; worker-src 'none'; object-src 'none'; base-uri 'none'; form-action 'none'"
  const document =
    format === 'svg'
      ? `<html><head><style>html,body{margin:0;width:100%;height:100%;overflow:hidden}body>svg{display:block;width:100%;height:100%}</style></head><body>${source}</body></html>`
      : source
  return `<!doctype html><meta http-equiv="Content-Security-Policy" content="${policy}"><meta name="referrer" content="no-referrer">${document}`
}
