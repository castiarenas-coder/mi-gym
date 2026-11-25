import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { api, enviar } from './cliente'
import type { Medida, Perfil, RespuestaPerfil, ResumenProgreso } from './tipos'

export function useResumenProgreso() {
  return useQuery({ queryKey: ['progreso', 'resumen'], queryFn: () => api<ResumenProgreso>('/progreso/resumen'), staleTime: 0 })
}

export function useMedidas() {
  return useQuery({ queryKey: ['progreso', 'medidas'], queryFn: () => api<Medida[]>('/medidas') })
}

export function useGuardarMedida() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (m: Partial<Medida> & { fecha: string }) => enviar<Medida>('POST', '/medidas', m),
    onSuccess: () => Promise.all([qc.invalidateQueries({ queryKey: ['progreso'] }), qc.invalidateQueries({ queryKey: ['perfil'] })]),
  })
}

export function useBorrarMedida() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (fecha: string) => enviar<{ ok: true }>('DELETE', `/medidas/${fecha}`),
    onSuccess: () => Promise.all([qc.invalidateQueries({ queryKey: ['progreso'] }), qc.invalidateQueries({ queryKey: ['perfil'] })]),
  })
}

export function usePerfil() {
  return useQuery({ queryKey: ['perfil'], queryFn: () => api<RespuestaPerfil>('/perfil') })
}

export function useGuardarPerfil() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (p: Partial<Perfil>) => enviar<RespuestaPerfil>('PUT', '/perfil', p),
    onSuccess: r => qc.setQueryData(['perfil'], r),
  })
}
