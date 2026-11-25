import { act, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { vi } from 'vitest'
import { AnimacionEjercicio } from './AnimacionEjercicio'

const base = { nombre: 'Sentadilla', img_ini: 'S/0.jpg', img_fin: 'S/1.jpg', media_propia: null }

function estado(contenedor: HTMLElement) {
  return [...contenedor.querySelectorAll('img')].map(i => i.getAttribute('data-activa'))
}

beforeEach(() => {
  vi.useFakeTimers()
  vi.stubGlobal('matchMedia', (q: string) => ({ matches: false, media: q, addEventListener() {}, removeEventListener() {} }))
})
afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals() })

describe('AnimacionEjercicio', () => {
  it('precarga las dos fotos y las alterna cada ~800 ms', () => {
    const { container } = render(<AnimacionEjercicio ejercicio={base} />)
    const imgs = container.querySelectorAll('img')
    expect(imgs).toHaveLength(2)
    expect(imgs[0]).toHaveAttribute('src', '/img/S/0.jpg')
    expect(imgs[1]).toHaveAttribute('src', '/img/S/1.jpg')
    expect(estado(container)).toEqual(['true', 'false'])
    act(() => { vi.advanceTimersByTime(800) })
    expect(estado(container)).toEqual(['false', 'true'])
    act(() => { vi.advanceTimersByTime(800) })
    expect(estado(container)).toEqual(['true', 'false'])
  })

  it('se pausa cuando sale de pantalla (IntersectionObserver)', () => {
    let callback: (e: { isIntersecting: boolean }[]) => void = () => {}
    vi.stubGlobal('IntersectionObserver', class {
      constructor(cb: typeof callback) { callback = cb }
      observe() {} disconnect() {} unobserve() {}
    })
    const { container } = render(<AnimacionEjercicio ejercicio={base} />)
    act(() => callback([{ isIntersecting: false }]))
    act(() => { vi.advanceTimersByTime(2000) })
    expect(estado(container)).toEqual(['true', 'false'])
    act(() => callback([{ isIntersecting: true }]))
    act(() => { vi.advanceTimersByTime(800) })
    expect(estado(container)).toEqual(['false', 'true'])
  })

  it('con prefers-reduced-motion muestra una foto fija y un botón para reproducir', async () => {
    vi.useRealTimers()
    vi.stubGlobal('matchMedia', (q: string) => ({ matches: q.includes('reduce'), media: q, addEventListener() {}, removeEventListener() {} }))
    const { container } = render(<AnimacionEjercicio ejercicio={base} />)
    expect(estado(container)).toEqual(['true', 'false'])
    const boton = screen.getByRole('button', { name: 'Reproducir animación' })
    await userEvent.click(boton)
    expect(screen.getByRole('button', { name: 'Pausar animación' })).toBeInTheDocument()
  })

  it('muestra un marcador cuando no hay fotos', () => {
    render(<AnimacionEjercicio ejercicio={{ ...base, img_ini: null, img_fin: null }} />)
    expect(screen.getByRole('img', { name: 'Sin imagen de Sentadilla' })).toBeInTheDocument()
  })

  it('con una sola foto no anima', () => {
    const { container } = render(<AnimacionEjercicio ejercicio={{ ...base, img_fin: null }} />)
    expect(container.querySelectorAll('img')).toHaveLength(1)
  })

  it('embebe YouTube con youtube-nocookie cuando hay un link', () => {
    render(<AnimacionEjercicio ejercicio={{ ...base, media_propia: 'https://youtu.be/dQw4w9WgXcQ' }} />)
    const frame = screen.getByTitle('Video de Sentadilla')
    expect(frame).toHaveAttribute('src', expect.stringContaining('https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ'))
  })

  it('usa un video propio (mp4/webm)', () => {
    const { container } = render(<AnimacionEjercicio ejercicio={{ ...base, media_propia: '/media/S.mp4?v=1' }} />)
    const video = container.querySelector('video')!
    expect(video).toHaveAttribute('src', '/media/S.mp4?v=1')
    expect(video.muted).toBe(true)
    expect(video.loop).toBe(true)
  })

  it('usa un GIF o foto propia en lugar de las fotos del catálogo', () => {
    const { container } = render(<AnimacionEjercicio ejercicio={{ ...base, media_propia: '/media/S.gif?v=1' }} />)
    const imgs = container.querySelectorAll('img')
    expect(imgs).toHaveLength(1)
    expect(imgs[0]).toHaveAttribute('src', '/media/S.gif?v=1')
  })

  it('en miniatura ignora los videos y usa las fotos del catálogo', () => {
    const { container } = render(<AnimacionEjercicio miniatura ejercicio={{ ...base, media_propia: '/media/S.mp4' }} />)
    expect(container.querySelector('video')).toBeNull()
    expect(container.querySelectorAll('img')).toHaveLength(2)
  })
})
