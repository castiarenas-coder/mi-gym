import { escala } from './graficos'

describe('escala de gráficos', () => {
  it('redondea a valores "lindos" que contienen todos los datos', () => {
    const e = escala([62, 79.5], 4)
    expect(e.min).toBeLessThanOrEqual(62)
    expect(e.max).toBeGreaterThanOrEqual(79.5)
    expect(e.ticks.length).toBeGreaterThanOrEqual(3)
    expect(e.ticks[0]).toBe(e.min)
    expect(e.ticks.at(-1)).toBe(e.max)
  })

  it('con un solo valor o valores iguales abre un rango', () => {
    const e = escala([80, 80], 4)
    expect(e.min).toBeLessThan(80)
    expect(e.max).toBeGreaterThan(80)
  })

  it('las barras pueden forzar el cero', () => {
    const e = escala([3, 5, 2], 4, { desdeCero: true })
    expect(e.min).toBe(0)
    expect(e.max).toBeGreaterThanOrEqual(5)
  })

  it('todo en cero igual da escala válida', () => {
    const e = escala([0, 0], 4, { desdeCero: true })
    expect(e.max).toBeGreaterThan(e.min)
  })
})
