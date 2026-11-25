import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { api, enviar } from './cliente'
import { renovarTodo } from './personas'

export interface Info {
  version: string
  schema_version: number
  db: string | null
  respaldos_dir: string | null
  ultimo_respaldo: string | null
  lan: boolean
  urls: string[]
  qr: string | null
  /** La versión instalada permite cerrar el servidor desde la app. */
  apagable?: boolean
}

export interface Actualizacion { actual: string; ultima: string | null; hay_nueva: boolean; url: string | null }

export interface Respaldo { archivo: string; fecha: string; tamano: number }

export function useInfo() {
  return useQuery({ queryKey: ['info'], queryFn: () => api<Info>('/info'), staleTime: 0 })
}

export function useRespaldos() {
  return useQuery({ queryKey: ['respaldos'], queryFn: () => api<Respaldo[]>('/respaldo/lista'), staleTime: 0 })
}

export function useRespaldoAhora() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: () => enviar<{ archivo: string }>('POST', '/respaldo/ahora'),
    onSuccess: () => Promise.all([qc.invalidateQueries({ queryKey: ['respaldos'] }), qc.invalidateQueries({ queryKey: ['info'] })]),
  })
}

/** Después de reemplazar datos todo lo que estaba en caché queda viejo. */
export function useRestaurar() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (archivo: string) => enviar<{ ok: true }>('POST', '/respaldo/restaurar', { archivo }),
    onSuccess: () => renovarTodo(qc),
  })
}

export function useImportar() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (datos: unknown) => enviar<{ ok: true }>('POST', '/respaldo/importar', datos),
    onSuccess: () => renovarTodo(qc),
  })
}

/** Compara con la última versión publicada en GitHub; sin internet simplemente no hay aviso. */
export function useActualizacion() {
  return useQuery({ queryKey: ['actualizacion'], queryFn: () => api<Actualizacion>('/actualizacion'), staleTime: 60 * 60 * 1000, retry: false })
}

export function useApagar() {
  return useMutation({ mutationFn: () => enviar<{ ok: true }>('POST', '/apagar') })
}
