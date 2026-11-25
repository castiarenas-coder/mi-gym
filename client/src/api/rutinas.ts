import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { api, enviar } from './cliente'
import type { DiaRutina, ItemRutina, RutinaDetalle, RutinaResumen } from './tipos'

export function useRutinas() {
  return useQuery({ queryKey: ['rutinas', 'lista'], queryFn: () => api<RutinaResumen[]>('/rutinas') })
}

export function useRutina(id: string | undefined) {
  return useQuery({ queryKey: ['rutinas', 'detalle', id], queryFn: () => api<RutinaDetalle>(`/rutinas/${id}`), enabled: !!id })
}

/** Mutación que, al terminar, refresca todo lo de rutinas. */
export function useMutacionRutinas<V, R = unknown>(fn: (v: V) => Promise<R>) {
  const qc = useQueryClient()
  return useMutation({ mutationFn: fn, onSuccess: () => qc.invalidateQueries({ queryKey: ['rutinas'] }) })
}

export const useCrearRutina = () =>
  useMutacionRutinas((v: { nombre: string; descripcion?: string; dias?: string[] }) => enviar<RutinaDetalle>('POST', '/rutinas', v))

export const useEditarRutina = () =>
  useMutacionRutinas(({ id, ...cambios }: { id: number; nombre?: string; descripcion?: string }) => enviar<RutinaDetalle>('PATCH', `/rutinas/${id}`, cambios))

export const useDuplicarRutina = () =>
  useMutacionRutinas((id: number) => enviar<RutinaDetalle>('POST', `/rutinas/${id}/duplicar`))

export const useBorrarRutina = () =>
  useMutacionRutinas((id: number) => enviar<{ ok: true }>('DELETE', `/rutinas/${id}`))

export const useAgregarDia = () =>
  useMutacionRutinas(({ rutina, nombre }: { rutina: number; nombre: string }) => enviar<DiaRutina>('POST', `/rutinas/${rutina}/dias`, { nombre }))

export const useRenombrarDia = () =>
  useMutacionRutinas(({ rutina, dia, nombre }: { rutina: number; dia: number; nombre: string }) => enviar<DiaRutina>('PATCH', `/rutinas/${rutina}/dias/${dia}`, { nombre }))

export const useBorrarDia = () =>
  useMutacionRutinas(({ rutina, dia }: { rutina: number; dia: number }) => enviar<{ ok: true }>('DELETE', `/rutinas/${rutina}/dias/${dia}`))

export const useOrdenarDias = () =>
  useMutacionRutinas(({ rutina, ids }: { rutina: number; ids: number[] }) => enviar<RutinaDetalle>('PUT', `/rutinas/${rutina}/dias/orden`, { ids }))

export const useAgregarEjercicio = () =>
  useMutacionRutinas(({ rutina, dia, ejercicio }: { rutina: number; dia: number; ejercicio: string }) =>
    enviar<ItemRutina>('POST', `/rutinas/${rutina}/dias/${dia}/ejercicios`, { ejercicio_id: ejercicio }))

export const useEditarItem = () =>
  useMutacionRutinas(({ rutina, dia, item, ...cambios }: { rutina: number; dia: number; item: number; series?: number; reps?: string; descanso_seg?: number; nota?: string | null }) =>
    enviar<ItemRutina>('PATCH', `/rutinas/${rutina}/dias/${dia}/ejercicios/${item}`, cambios))

export const useQuitarItem = () =>
  useMutacionRutinas(({ rutina, dia, item }: { rutina: number; dia: number; item: number }) =>
    enviar<{ ok: true }>('DELETE', `/rutinas/${rutina}/dias/${dia}/ejercicios/${item}`))

export const useOrdenarItems = () =>
  useMutacionRutinas(({ rutina, dia, ids }: { rutina: number; dia: number; ids: number[] }) =>
    enviar<RutinaDetalle>('PUT', `/rutinas/${rutina}/dias/${dia}/ejercicios/orden`, { ids }))
