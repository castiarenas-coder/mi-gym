import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { api, enviar } from './cliente'

export interface Info {
  version: string
  schema_version: number
  db: string | null
  respaldos_dir: string | null
  ultimo_respaldo: string | null
  lan: boolean
  urls: string[]
  qr: string | null
}

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
    onSuccess: () => qc.invalidateQueries(),
  })
}

export function useImportar() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (datos: unknown) => enviar<{ ok: true }>('POST', '/respaldo/importar', datos),
    onSuccess: () => qc.invalidateQueries(),
  })
}
