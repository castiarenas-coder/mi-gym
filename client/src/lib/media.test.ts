import { tipoDeMedia } from './media'

describe('tipoDeMedia', () => {
  it('reconoce los links de YouTube y devuelve el id', () => {
    for (const url of [
      'https://www.youtube.com/watch?v=dQw4w9WgXcQ',
      'https://youtu.be/dQw4w9WgXcQ',
      'https://youtu.be/dQw4w9WgXcQ?t=10',
      'https://www.youtube.com/shorts/dQw4w9WgXcQ',
      'https://www.youtube.com/embed/dQw4w9WgXcQ',
      'https://m.youtube.com/watch?v=dQw4w9WgXcQ&list=x',
    ]) {
      expect(tipoDeMedia(url)).toEqual({ tipo: 'youtube', id: 'dQw4w9WgXcQ' })
    }
  })

  it('reconoce video por extensión, ignorando la query', () => {
    expect(tipoDeMedia('/media/X.mp4?v=123')).toEqual({ tipo: 'video', url: '/media/X.mp4?v=123' })
    expect(tipoDeMedia('https://sitio.com/a.webm')).toEqual({ tipo: 'video', url: 'https://sitio.com/a.webm' })
  })

  it('reconoce imágenes y GIF', () => {
    for (const u of ['/media/X.gif?v=1', 'https://s.com/a.jpg', 'https://s.com/a.PNG', 'https://s.com/a.jpeg', 'https://s.com/a.webp']) {
      expect(tipoDeMedia(u)).toEqual({ tipo: 'imagen', url: u })
    }
  })

  it('devuelve null si no hay media o no se reconoce', () => {
    expect(tipoDeMedia(null)).toBeNull()
    expect(tipoDeMedia('')).toBeNull()
    expect(tipoDeMedia('https://sitio.com/pagina')).toBeNull()
    expect(tipoDeMedia('javascript:alert(1)')).toBeNull()
  })
})
