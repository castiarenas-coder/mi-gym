import { describe, expect, it } from 'vitest'
import { diasEntrenados } from './semana'

const HOY = new Date(2026, 10, 25, 12) // miércoles
const iso = (a: number, m: number, d: number, h = 10, mi = 0) => new Date(a, m, d, h, mi).toISOString()
const SIN = [false, false, false, false, false, false, false]

describe('diasEntrenados', () => {
  it('sin fechas devuelve 7 falsos', () => {
    expect(diasEntrenados([], HOY)).toEqual(SIN)
  })
  it('marca lunes y miércoles', () => {
    expect(diasEntrenados([iso(2026, 10, 23), iso(2026, 10, 25)], HOY)).toEqual([true, false, true, false, false, false, false])
  })
  it('el domingo anterior no cuenta y el domingo siguiente sí', () => {
    expect(diasEntrenados([iso(2026, 10, 22, 23, 30)], HOY)).toEqual(SIN)
    expect(diasEntrenados([iso(2026, 10, 29, 23, 30)], HOY)[6]).toBe(true)
  })
  it('dos sesiones el mismo día marcan una sola posición', () => {
    const r = diasEntrenados([iso(2026, 10, 24, 8), iso(2026, 10, 24, 19)], HOY)
    expect(r.filter(Boolean)).toHaveLength(1)
    expect(r[1]).toBe(true)
  })
  it('cruza de año', () => {
    expect(diasEntrenados([iso(2026, 11, 28)], new Date(2027, 0, 1))[0]).toBe(true)
  })
})
