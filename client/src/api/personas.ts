import { useMutation, useQuery, useQueryClient, type QueryClient } from '@tanstack/react-query'
import { api, enviar } from './cliente'
import { guardarPersona, personaGuardada } from '../lib/persona'

export interface Persona { id: number; nombre: string; color: string; avatar: string; creada: string }
export interface DatosPersona { nombre: string; color?: string; avatar?: string }

export const CLAVE_PERSONAS = ['personas'] as const

/**
 * Después de borrar o reemplazar datos: primero se vuelve a pedir la lista de personas y, si la activa
 * ya no existe, se olvida; recién entonces se descarta el resto (así no se piden datos con una persona inexistente).
 */
export async function renovarTodo(qc: QueryClient) {
  const lista = await qc.fetchQuery({ queryKey: CLAVE_PERSONAS, queryFn: () => api<Persona[]>('/personas'), staleTime: 0 })
  const activa = personaGuardada()
  if (activa !== null && !lista.some(p => p.id === activa)) guardarPersona(null)
  await qc.resetQueries({ predicate: q => q.queryKey[0] !== 'personas' })
}

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
    onSuccess: () => renovarTodo(qc),
  })
}
