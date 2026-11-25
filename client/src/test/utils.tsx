import { render } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { MemoryRouter } from 'react-router-dom'
import type { ReactElement } from 'react'
import { vi } from 'vitest'
import { App } from '../App'

export type Manejador = (metodo: string, url: URL, body: unknown) => unknown

/** Reemplaza fetch: el manejador devuelve el JSON, o undefined para responder 404. */
export function instalarApi(manejador: Manejador) {
  const llamadas: { metodo: string; ruta: string; body: unknown }[] = []
  const fetchFalso = vi.fn(async (entrada: RequestInfo | URL, init?: RequestInit) => {
    const url = new URL(String(entrada), 'http://localhost')
    const metodo = (init?.method ?? 'GET').toUpperCase()
    let body: unknown = init?.body
    if (typeof body === 'string') { try { body = JSON.parse(body) } catch { /* texto */ } }
    llamadas.push({ metodo, ruta: url.pathname + url.search, body })
    const out = manejador(metodo, url, body)
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
