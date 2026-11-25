import { afterEach, describe, expect, it, vi } from 'vitest'
import { api, enviar, subirArchivo } from './cliente'

function falso() {
  const f = vi.fn(async () => new Response('{}', { status: 200, headers: { 'Content-Type': 'application/json' } }))
  vi.stubGlobal('fetch', f)
  return f
}
const cabeceras = (f: ReturnType<typeof falso>) => (f.mock.calls[0] as unknown as [string, RequestInit])[1].headers as Record<string, string>

describe('cliente de la API: X-Mi-Gym', () => {
  afterEach(() => vi.unstubAllGlobals())

  it.each(['POST', 'PUT', 'PATCH', 'DELETE'] as const)('enviar(%s) manda X-Mi-Gym', async metodo => {
    const f = falso()
    await enviar(metodo, '/algo', { a: 1 })
    expect(cabeceras(f)['X-Mi-Gym']).toBe('1')
  })

  it('un POST sin cuerpo (apagar, respaldo) también la manda', async () => {
    const f = falso()
    await enviar('POST', '/apagar')
    expect(cabeceras(f)['X-Mi-Gym']).toBe('1')
  })

  it('api() directo y subirArchivo la mandan', async () => {
    const f = falso()
    await api('/salud')
    expect(cabeceras(f)['X-Mi-Gym']).toBe('1')
    const g = falso()
    await subirArchivo('/ejercicios/x/media', new File(['x'], 'a.gif', { type: 'image/gif' }))
    expect(cabeceras(g)['X-Mi-Gym']).toBe('1')
  })
})
