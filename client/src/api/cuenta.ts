import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { api, enviar } from './cliente'
import { renovarTodo } from './personas'

export interface SesionCuenta {
  email: string
  /** null = sin conexión después de reiniciar: no se sabe todavía (no es "gratis"). */
  plan: 'gratis' | 'pro' | null
  /** null = no se pudo consultar. */
  consentimiento: boolean | null
}

export interface EstadoCuenta {
  habilitada: boolean
  google: boolean
  sesion: SesionCuenta | null
  vinculado: boolean
  ultimaSincronizacion: string | null
  error: string | null
}

export type ModoVinculo = 'subir' | 'bajar' | 'juntar' | 'reemplazar'

export interface Duplicada { conservar: string; duplicada: string; nombre: string }

export interface Vinculo {
  estado: 'cuenta_vacia' | 'equipo_vacio' | 'ambos_con_datos'
  vinculado: boolean
  duplicadas: Duplicada[]
}

export interface ResultadoSync {
  ok: boolean
  resultado: { subidos: number; bajados: number; enEspera: number; rechazados: number; parcial?: boolean }
  ultimaSincronizacion: string | null
  error: string | null
}

/** "hace 5 minutos", en castellano. */
export function haceCuanto(iso: string, ahora: Date = new Date()): string {
  const seg = Math.max(0, Math.round((ahora.getTime() - new Date(iso).getTime()) / 1000))
  const plural = (n: number, uno: string, varios: string) => `hace ${n} ${n === 1 ? uno : varios}`
  if (seg < 60) return 'hace un momento'
  const min = Math.floor(seg / 60)
  if (min < 60) return plural(min, 'minuto', 'minutos')
  const horas = Math.floor(min / 60)
  if (horas < 24) return plural(horas, 'hora', 'horas')
  const dias = Math.floor(horas / 24)
  return plural(dias, 'día', 'días')
}

/** `refetchInterval` se usa para esperar el regreso de Google: cuando aparece la sesión, se corta solo. */
export function useCuenta(refetchInterval: number | false = false) {
  return useQuery({ queryKey: ['cuenta'], queryFn: () => api<EstadoCuenta>('/cuenta'), staleTime: 0, retry: false, refetchInterval })
}

export function useVinculo(activo: boolean) {
  return useQuery({ queryKey: ['cuenta', 'vinculo'], queryFn: () => api<Vinculo>('/cuenta/vinculo'), enabled: activo, staleTime: 0, retry: false })
}

function useMutacionCuenta<V, R>(fn: (v: V) => Promise<R>, opciones: { datos?: boolean } = {}) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: fn,
    // Al bajar o juntar datos cambia todo lo local; siempre se vuelve a pedir el estado de la cuenta.
    onSettled: () => qc.invalidateQueries({ queryKey: ['cuenta'] }),
    onSuccess: () => (opciones.datos ? renovarTodo(qc) : undefined),
  })
}

export const useEnviarCodigo = () => useMutacionCuenta((email: string) => enviar<{ ok: true }>('POST', '/cuenta/codigo', { email }))
export const useVerificarCodigo = () => useMutacionCuenta((v: { email: string; codigo: string }) => enviar<{ ok: true }>('POST', '/cuenta/verificar', v))
export const useAceptarConsentimiento = () => useMutacionCuenta(() => enviar<{ ok: true }>('POST', '/cuenta/consentimiento', {}))
/** Devuelve las duplicadas ya con los datos juntos: se piden de nuevo, porque antes de juntar no se pueden ver las de otros equipos. */
export const useVincular = () => useMutacionCuenta(
  async (v: { modo: ModoVinculo; forzar?: boolean }) => {
    const r = await enviar<{ ok: true; ultimaSincronizacion: string | null }>('POST', '/cuenta/vincular', v.forzar ? v : { modo: v.modo })
    let duplicadas: Duplicada[] = []
    if (v.modo === 'juntar') duplicadas = await api<Vinculo>('/cuenta/vinculo').then(x => x.duplicadas).catch(() => [])
    return { ...r, duplicadas }
  },
  { datos: true },
)
export const useUnificar = () => useMutacionCuenta((v: { conservar: string; duplicada: string }) => enviar<{ ok: true }>('POST', '/cuenta/unificar', v), { datos: true })
export const useSincronizar = () => useMutacionCuenta(() => enviar<ResultadoSync>('POST', '/cuenta/sincronizar', {}), { datos: true })
export const useSalir = () => useMutacionCuenta(() => enviar<{ ok: true }>('POST', '/cuenta/salir', {}))
export const useBorrarCuenta = () => useMutacionCuenta(() => enviar<{ ok: true }>('DELETE', '/cuenta'))
