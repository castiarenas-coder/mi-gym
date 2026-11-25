// Aviso de versión nueva: compara la versión instalada con la última release de GitHub.
// Sin internet (o si GitHub no responde) falla en silencio: simplemente no avisa.
const REPO = 'castiarenas-coder/mi-gym';
const DOCE_HORAS = 12 * 3600_000;
const REINTENTO = 30 * 60_000;

const partes = v => String(v).replace(/^v/i, '').split(/[.-]/).map(n => parseInt(n, 10) || 0);

export function compararVersiones(a, b) {
  const x = partes(a); const y = partes(b);
  for (let i = 0; i < Math.max(x.length, y.length); i++) {
    const d = (x[i] ?? 0) - (y[i] ?? 0);
    if (d) return d > 0 ? 1 : -1;
  }
  return 0;
}

export function crearComprobador({ version, fetchFn = globalThis.fetch, ahora = Date.now, repo = REPO }) {
  let cache = null; // { hasta, valor }
  return async function comprobar() {
    if (cache && ahora() < cache.hasta) return cache.valor;
    let valor = { actual: version, ultima: null, hay_nueva: false, url: null };
    let ttl = REINTENTO;
    try {
      const res = await fetchFn(`https://api.github.com/repos/${repo}/releases/latest`, {
        headers: { Accept: 'application/vnd.github+json', 'User-Agent': 'mi-gym' },
        signal: AbortSignal.timeout(5000),
      });
      if (res.ok) {
        const rel = await res.json();
        const ultima = typeof rel?.tag_name === 'string' ? rel.tag_name.replace(/^v/i, '') : null;
        if (ultima) {
          valor = { actual: version, ultima, hay_nueva: compararVersiones(ultima, version) > 0, url: rel.html_url ?? `https://github.com/${repo}/releases/latest` };
          ttl = DOCE_HORAS;
        }
      }
    } catch { /* sin internet: no avisa */ }
    cache = { hasta: ahora() + ttl, valor };
    return valor;
  };
}
