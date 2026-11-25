export interface Escala { min: number; max: number; paso: number; ticks: number[] }

function pasoLindo(bruto: number): number {
  const exp = Math.floor(Math.log10(bruto))
  const f = bruto / 10 ** exp
  const lindo = f <= 1 ? 1 : f <= 2 ? 2 : f <= 2.5 ? 2.5 : f <= 5 ? 5 : 10
  return lindo * 10 ** exp
}

/** Escala con marcas "lindas" (1, 2, 2.5, 5 × 10ⁿ) que abarca todos los valores. */
export function escala(valores: number[], marcas = 4, { desdeCero = false, entero = false }: { desdeCero?: boolean; entero?: boolean } = {}): Escala {
  let min = desdeCero ? 0 : Math.min(...valores)
  let max = Math.max(...valores)
  if (!Number.isFinite(min) || !Number.isFinite(max)) { min = 0; max = 1 }
  if (max === min) {
    const margen = Math.max(Math.abs(max) * 0.1, 1)
    max += margen
    if (!desdeCero) min -= margen
  }
  const paso = entero ? Math.max(1, Math.ceil(pasoLindo((max - min) / marcas))) : pasoLindo((max - min) / marcas)
  const lo = desdeCero ? 0 : Math.floor(min / paso) * paso
  const hi = Math.ceil(max / paso) * paso
  const ticks: number[] = []
  for (let v = lo; v <= hi + paso / 1000; v += paso) ticks.push(Math.round(v * 1000) / 1000)
  return { min: lo, max: ticks.at(-1) ?? hi, paso, ticks }
}
