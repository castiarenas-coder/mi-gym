/** Lunes (00:00 local) de la semana de `hoy`. */
function lunesDe(hoy: Date): Date {
  const l = new Date(hoy.getFullYear(), hoy.getMonth(), hoy.getDate())
  l.setDate(l.getDate() - ((l.getDay() + 6) % 7))
  return l
}

/** 7 posiciones (lunes a domingo de la semana de `hoy`, hora local): true si hubo sesión ese día. */
export function diasEntrenados(fechas: string[], hoy: Date): boolean[] {
  const lunes = lunesDe(hoy)
  const out = new Array<boolean>(7).fill(false)
  for (const f of fechas) {
    const d = new Date(f)
    if (Number.isNaN(d.getTime())) continue
    const dia = new Date(d.getFullYear(), d.getMonth(), d.getDate())
    const pos = Math.round((dia.getTime() - lunes.getTime()) / 86400000)
    if (pos >= 0 && pos < 7) out[pos] = true
  }
  return out
}

/** Posición (0 = lunes) de `hoy` en la semana. */
export function posicionHoy(hoy: Date): number {
  return (hoy.getDay() + 6) % 7
}
