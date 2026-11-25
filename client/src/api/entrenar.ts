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
  useMutacionSesiones((v: { rutina_id?: number; dia_id?: number; acompanantes?: number[] }) => enviar<Sesion>('POST', '/sesiones', v))

export const useQuitarAcompanante = () =>
  useMutacionSesiones(({ sesion, persona }: { sesion: number; persona: number }) =>
    enviar<Sesion | { ok: true }>('DELETE', `/sesiones/${sesion}/acompanantes/${persona}`))

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
    onMutate: async ({ ejercicio, n, sesion, ...cambios }) => {
      // La sesión puede ser la propia (activa) o la de alguien del grupo (detalle).
      const claveDetalle = ['sesiones', 'detalle', String(sesion)]
      await Promise.all([qc.cancelQueries({ queryKey: CLAVE_ACTIVA }), qc.cancelQueries({ queryKey: claveDetalle })])
      const previa = qc.getQueryData<Sesion | null>(CLAVE_ACTIVA)
      const previaDetalle = qc.getQueryData<Sesion>(claveDetalle)
      const aplicar = <T extends Sesion | null | undefined>(s: T): T => (s && s.id === sesion ? ({
        ...s,
        ejercicios: s.ejercicios.map(e => e.ejercicio_id !== ejercicio ? e : {
          ...e, series: e.series.map(x => x.n === n ? { ...x, ...cambios } : x),
        }),
      }) : s) as T
      qc.setQueryData<Sesion | null>(CLAVE_ACTIVA, aplicar)
      if (previaDetalle) qc.setQueryData<Sesion>(claveDetalle, aplicar)
      return { previa, previaDetalle, claveDetalle }
    },
    onError: (_e, _v, ctx) => {
      if (!ctx) return
      qc.setQueryData(CLAVE_ACTIVA, ctx.previa)
      if (ctx.previaDetalle) qc.setQueryData(ctx.claveDetalle, ctx.previaDetalle)
    },
    onSettled: () => Promise.all([
      qc.invalidateQueries({ queryKey: ['sesiones'] }),
      qc.invalidateQueries({ queryKey: ['progreso'] }),
    ]),
  })
}
