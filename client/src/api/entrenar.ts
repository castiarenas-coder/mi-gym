import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { api, enviar } from './cliente'
import type { HistorialEjercicio, PaginaSesiones, SerieSesion, Sesion, UltimaVez } from './tipos'

const CLAVE_ACTIVA = ['sesiones', 'activa'] as const

export function useSesionActiva() {
  return useQuery({ queryKey: CLAVE_ACTIVA, queryFn: () => api<Sesion | null>('/sesiones/activa'), staleTime: 0 })
}

export function useSesion(id: string | undefined) {
  return useQuery({ queryKey: ['sesiones', 'detalle', id], queryFn: () => api<Sesion>(`/sesiones/${id}`), enabled: !!id })
}

export function useSesiones(limit: number) {
  return useQuery({
    queryKey: ['sesiones', 'lista', limit],
    queryFn: () => api<PaginaSesiones>(`/sesiones?estado=finalizada&limit=${limit}`),
    placeholderData: previa => previa,
  })
}

export function useUltimaVez(ejercicio: string | undefined) {
  return useQuery({ queryKey: ['ejercicio', ejercicio, 'ultima'], queryFn: () => api<UltimaVez>(`/ejercicios/${ejercicio}/ultima`), enabled: !!ejercicio })
}

export function useHistorialEjercicio(ejercicio: string | undefined) {
  return useQuery({ queryKey: ['ejercicio', ejercicio, 'historial'], queryFn: () => api<HistorialEjercicio>(`/ejercicios/${ejercicio}/historial`), enabled: !!ejercicio })
}

/** Mutación que al terminar refresca sesiones y todo lo que depende del historial. */
function useMutacionSesiones<V, R = unknown>(fn: (v: V) => Promise<R>) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: fn,
    onSettled: () => Promise.all([
      qc.invalidateQueries({ queryKey: ['sesiones'] }),
      qc.invalidateQueries({ queryKey: ['progreso'] }),
      qc.invalidateQueries({ queryKey: ['ejercicio'] }),
    ]),
  })
}

export const useIniciarSesion = () =>
  useMutacionSesiones((v: { rutina_id?: number; dia_id?: number }) => enviar<Sesion>('POST', '/sesiones', v))

export const useFinalizarSesion = () =>
  useMutacionSesiones(({ id, nota }: { id: number; nota?: string }) => enviar<Sesion>('PATCH', `/sesiones/${id}`, { finalizar: true, ...(nota ? { nota } : {}) }))

export const useBorrarSesion = () =>
  useMutacionSesiones((id: number) => enviar<{ ok: true }>('DELETE', `/sesiones/${id}`))

export const useAgregarSerie = () =>
  useMutacionSesiones(({ sesion, ejercicio, ...datos }: { sesion: number; ejercicio: string; peso_kg?: number | null; reps?: number | null }) =>
    enviar<SerieSesion>('POST', `/sesiones/${sesion}/series`, { ejercicio_id: ejercicio, ...datos }))

export const useQuitarSerie = () =>
  useMutacionSesiones(({ sesion, ejercicio, n }: { sesion: number; ejercicio: string; n: number }) =>
    enviar<{ ok: true }>('DELETE', `/sesiones/${sesion}/series/${encodeURIComponent(ejercicio)}/${n}`))

export const useQuitarEjercicioSesion = () =>
  useMutacionSesiones(({ sesion, ejercicio }: { sesion: number; ejercicio: string }) =>
    enviar<{ ok: true }>('DELETE', `/sesiones/${sesion}/ejercicios/${encodeURIComponent(ejercicio)}`))

export interface CambioSerie { sesion: number; ejercicio: string; n: number; peso_kg?: number | null; reps?: number | null; hecha?: boolean }

/** Edita una serie y refleja el cambio al instante; si falla, vuelve atrás. */
export function useActualizarSerie() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ sesion, ejercicio, n, ...cambios }: CambioSerie) =>
      enviar<SerieSesion>('PATCH', `/sesiones/${sesion}/series/${encodeURIComponent(ejercicio)}/${n}`, cambios),
    onMutate: async ({ ejercicio, n, sesion: _s, ...cambios }) => {
      await qc.cancelQueries({ queryKey: CLAVE_ACTIVA })
      const previa = qc.getQueryData<Sesion | null>(CLAVE_ACTIVA)
      qc.setQueryData<Sesion | null>(CLAVE_ACTIVA, s => s && ({
        ...s,
        ejercicios: s.ejercicios.map(e => e.ejercicio_id !== ejercicio ? e : {
          ...e, series: e.series.map(x => x.n === n ? { ...x, ...cambios } : x),
        }),
      }))
      return { previa }
    },
    onError: (_e, _v, ctx) => { if (ctx) qc.setQueryData(CLAVE_ACTIVA, ctx.previa) },
    onSettled: () => Promise.all([
      qc.invalidateQueries({ queryKey: ['sesiones'] }),
      qc.invalidateQueries({ queryKey: ['progreso'] }),
    ]),
  })
}
