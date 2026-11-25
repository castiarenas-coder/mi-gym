import { render } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { MemoryRouter } from 'react-router-dom'
import type { ReactElement } from 'react'
import { vi } from 'vitest'
import { App } from '../App'

export type Manejador = (metodo: string, url: URL, body: unknown) => unknown

export const PERSONA_YO = { id: 1, nombre: 'Yo', color: '#c6ff3d', avatar: '', creada: '2026-01-01T00:00:00.000Z' }
export const PERSONA_ANA = { id: 2, nombre: 'Ana', color: '#ff7a1a', avatar: '🦊', creada: '2026-01-02T00:00:00.000Z' }

/** Reemplaza fetch: el manejador devuelve el JSON, o undefined para responder 404. */
export function instalarApi(manejador: Manejador) {
  const llamadas: { metodo: string; ruta: string; body: unknown; persona: string | null }[] = []
  const fetchFalso = vi.fn(async (entrada: RequestInfo | URL, init?: RequestInit) => {
    const url = new URL(String(entrada), 'http://localhost')
    const metodo = (init?.method ?? 'GET').toUpperCase()
    let body: unknown = init?.body
    if (typeof body === 'string') { try { body = JSON.parse(body) } catch { /* texto */ } }
    const cabeceras = (init?.headers ?? {}) as Record<string, string>
    llamadas.push({ metodo, ruta: url.pathname + url.search, body, persona: cabeceras['X-Persona'] ?? null })
    let out = manejador(metodo, url, body)
    // Por defecto hay una sola persona ("Yo"): así las pantallas no piden elegir quién entrena.
    if (metodo === 'GET' && url.pathname === '/api/personas' && !Array.isArray(out)) out = [PERSONA_YO]
    if (out instanceof Response) return out
    if (out === undefined) return new Response(JSON.stringify({ error: 'No existe' }), { status: 404 })
    return new Response(JSON.stringify(out), { status: 200, headers: { 'Content-Type': 'application/json' } })
  })
  vi.stubGlobal('fetch', fetchFalso)
  return { llamadas, fetch: fetchFalso }
}

export function conProveedores(ui: ReactElement, ruta = '/') {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false, staleTime: 0 }, mutations: { retry: false } } })
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={[ruta]}>{ui}</MemoryRouter>
    </QueryClientProvider>,
  )
}

export function verApp(ruta = '/') {
  return conProveedores(<App />, ruta)
}

export const ej = (id: string, extra: Record<string, unknown> = {}) => ({
  id, nombre: `Ejercicio ${id}`, nombre_en: `Exercise ${id}`, musculo_principal: 'Pecho', musculos_sec: ['Tríceps'],
  equipo: 'Barra', categoria: 'Fuerza', nivel: 'Principiante', img_ini: `${id}/0.jpg`, img_fin: `${id}/1.jpg`,
  media_propia: null, favorito: false, traducido: 1, ...extra,
})

export const FILTROS = {
  musculos: [{ valor: 'Pecho', cantidad: 3 }, { valor: 'Cuádriceps', cantidad: 2 }],
  equipos: [{ valor: 'Barra', cantidad: 4 }, { valor: 'Mancuernas', cantidad: 1 }],
  niveles: [{ valor: 'Principiante', cantidad: 4 }, { valor: 'Intermedio', cantidad: 1 }],
  categorias: [{ valor: 'Fuerza', cantidad: 5 }],
}
