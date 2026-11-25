/** Formato de tiempos, fechas y pesos para mostrar en pantalla (español de Argentina). */

const dos = (n: number) => String(n).padStart(2, '0')

/** 65 -> "1:05"; 3725 -> "1:02:05". */
export function reloj(segundos: number): string {
  const s = Math.max(0, Math.floor(segundos))
  const h = Math.floor(s / 3600)
  const m = Math.floor((s % 3600) / 60)
  return h > 0 ? `${h}:${dos(m)}:${dos(s % 60)}` : `${m}:${dos(s % 60)}`
}

/** 3900 -> "1 h 5 min". */
export function duracionLarga(segundos: number | null): string {
  if (segundos === null) return '–'
  const min = Math.round(segundos / 60)
  if (min < 1) return 'menos de 1 min'
  if (min < 60) return `${min} min`
  const h = Math.floor(min / 60)
  return min % 60 === 0 ? `${h} h` : `${h} h ${min % 60} min`
}

/** Acepta "YYYY-MM-DD" (día local) o un instante ISO. */
export function aFecha(valor: string): Date {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(valor)
  return m ? new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3])) : new Date(valor)
}

const sinPunto = (t: string) => t.replace(/\./g, '')

export const fechaCorta = (valor: string) =>
  sinPunto(aFecha(valor).toLocaleDateString('es-AR', { day: 'numeric', month: 'short' }))

export const fechaConDia = (valor: string) =>
  sinPunto(aFecha(valor).toLocaleDateString('es-AR', { weekday: 'short', day: 'numeric', month: 'short' }))

export const fechaLarga = (valor: string) =>
  aFecha(valor).toLocaleDateString('es-AR', { weekday: 'long', day: 'numeric', month: 'long' })

export const hora = (iso: string) => aFecha(iso).toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit', hour12: false })

/** Fecha local de hoy como "YYYY-MM-DD". */
export function hoyLocal(): string {
  const d = new Date()
  return `${d.getFullYear()}-${dos(d.getMonth() + 1)}-${dos(d.getDate())}`
}

/** 82.5 -> "82,5"; null -> "–". */
export const kg = (n: number | null | undefined) =>
  n === null || n === undefined ? '–' : n.toLocaleString('es-AR', { maximumFractionDigits: 1, useGrouping: false })

/** Cantidades grandes con separador de miles: 12500 -> "12.500". */
export const miles = (n: number) => Math.round(n).toLocaleString('es-AR')
