import { keepPreviousData, useInfiniteQuery, useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { api, enviar, subirArchivo } from './cliente'
import type { ConsultaEjercicios, EjercicioDetalle, EjercicioResumen, Filtros, PaginaEjercicios } from './tipos'

export const TAM_PAGINA = 24

export function paramsDe(consulta: ConsultaEjercicios, extra: Record<string, string | number> = {}) {
  const p = new URLSearchParams()
  if (consulta.q?.trim()) p.set('q', consulta.q.trim())
  for (const c of ['musculo', 'equipo', 'nivel', 'categoria'] as const) if (consulta[c]) p.set(c, consulta[c])
  if (consulta.favoritos) p.set('favoritos', '1')
  for (const [k, v] of Object.entries(extra)) p.set(k, String(v))
  return p.toString()
}

export function useListaEjercicios(consulta: ConsultaEjercicios, tam = TAM_PAGINA) {
  return useInfiniteQuery({
    queryKey: ['ejercicios', 'lista', consulta, tam],
    initialPageParam: 0,
    queryFn: ({ pageParam }) => api<PaginaEjercicios>(`/ejercicios?${paramsDe(consulta, { limit: tam, offset: pageParam })}`),
    getNextPageParam: ultima => (ultima.offset + ultima.items.length < ultima.total ? ultima.offset + ultima.items.length : undefined),
    placeholderData: keepPreviousData,
  })
}

export function useFiltros() {
  return useQuery({ queryKey: ['ejercicios', 'filtros'], queryFn: () => api<Filtros>('/ejercicios/filtros'), staleTime: 10 * 60_000 })
}

export function useEjercicio(id: string | undefined) {
  return useQuery({ queryKey: ['ejercicios', 'detalle', id], queryFn: () => api<EjercicioDetalle>(`/ejercicios/${encodeURIComponent(id!)}`), enabled: !!id })
}

function useMutacionEjercicio<V>(fn: (v: V) => Promise<unknown>) {
  const qc = useQueryClient()
  return useMutation({ mutationFn: fn, onSuccess: () => qc.invalidateQueries({ queryKey: ['ejercicios'] }) })
}

export function useFavorito() {
  return useMutacionEjercicio(({ id, favorito }: { id: string; favorito: boolean }) =>
    enviar<EjercicioResumen>('PATCH', `/ejercicios/${encodeURIComponent(id)}`, { favorito }))
}

export function useLinkMedia() {
  return useMutacionEjercicio(({ id, link }: { id: string; link: string }) =>
    enviar<EjercicioDetalle>('PATCH', `/ejercicios/${encodeURIComponent(id)}`, { media_propia: link }))
}

export function useSubirMedia() {
  return useMutacionEjercicio(({ id, archivo }: { id: string; archivo: File }) =>
    subirArchivo<EjercicioDetalle>(`/ejercicios/${encodeURIComponent(id)}/media`, archivo))
}

export function useQuitarMedia() {
  return useMutacionEjercicio((id: string) => enviar<EjercicioDetalle>('DELETE', `/ejercicios/${encodeURIComponent(id)}/media`))
}

/** Favoritos y destacados para la página de inicio. */
export function useFavoritosInicio() {
  return useQuery({
    queryKey: ['ejercicios', 'inicio', 'favoritos'],
    queryFn: () => api<PaginaEjercicios>('/ejercicios?favoritos=1&limit=12'),
  })
}

export function useDestacados() {
  return useQuery({
    queryKey: ['ejercicios', 'inicio', 'destacados'],
    queryFn: async () => {
      const cabecera = await api<PaginaEjercicios>('/ejercicios?limit=1')
      const dia = Math.floor(Date.now() / 86_400_000)
      const offset = cabecera.total > 60 ? (dia * 37) % (cabecera.total - 60) : 0
      const pagina = await api<PaginaEjercicios>(`/ejercicios?limit=60&offset=${offset}`)
      const conFoto = pagina.items.filter(e => e.img_ini && e.img_fin)
      return conFoto.filter((_, i) => i % 8 === 0).slice(0, 6)
    },
  })
}
