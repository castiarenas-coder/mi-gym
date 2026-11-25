export type MediaPropia =
  | { tipo: 'youtube'; id: string }
  | { tipo: 'video'; url: string }
  | { tipo: 'imagen'; url: string }

const ID_YOUTUBE = /^[\w-]{11}$/

function idYoutube(url: URL): string | null {
  const host = url.hostname.replace(/^(www|m)\./, '')
  let id: string | null = null
  if (host === 'youtu.be') id = url.pathname.slice(1).split('/')[0]
  else if (host === 'youtube.com' || host === 'youtube-nocookie.com') {
    if (url.pathname === '/watch') id = url.searchParams.get('v')
    else {
      const m = url.pathname.match(/^\/(?:shorts|embed|live)\/([^/]+)/)
      id = m ? m[1] : null
    }
  }
  return id && ID_YOUTUBE.test(id) ? id : null
}

/** Decide cómo mostrar la media propia de un ejercicio (link de YouTube, video o imagen/GIF). */
export function tipoDeMedia(valor: string | null | undefined): MediaPropia | null {
  if (!valor) return null
  let url: URL
  try { url = new URL(valor, 'http://local.invalid') } catch { return null }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') return null
  const yt = idYoutube(url)
  if (yt) return { tipo: 'youtube', id: yt }
  const ext = url.pathname.split('.').pop()?.toLowerCase() ?? ''
  if (ext === 'mp4' || ext === 'webm') return { tipo: 'video', url: valor }
  if (['gif', 'jpg', 'jpeg', 'png', 'webp'].includes(ext)) return { tipo: 'imagen', url: valor }
  return null
}
