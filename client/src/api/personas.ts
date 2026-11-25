import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { api, enviar } from './cliente'

export interface Persona { id: number; nombre: string; color: string; avatar: string; creada: string }
export interface DatosPersona { nombre: string; color?: string; avatar?: string }

export const CLAVE_PERSONAS = ['personas'] as const

export function usePersonas() {
  return useQuery({ queryKey: CLAVE_PERSONAS, queryFn: () => api<Persona[]>('/personas'), staleTime: 30_000 })
}

export function useCrearPersona() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (d: DatosPersona) => enviar<Persona>('POST', '/personas', d),
    // La persona nueva trae sus 2 rutinas de ejemplo.
    onSuccess: () => qc.invalidateQueries({ queryKey: CLAVE_PERSONAS }),
  })
}

export function useEditarPersona() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, ...d }: Partial<DatosPersona> & { id: number }) => enviar<Persona>('PATCH', `/personas/${id}`, d),
    onSuccess: () => qc.invalidateQueries({ queryKey: CLAVE_PERSONAS }),
  })
}

export function useBorrarPersona() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: number) => enviar<{ ok: true }>('DELETE', `/personas/${id}`),
    onSuccess: () => qc.invalidateQueries(),
  })
}
