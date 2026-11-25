import { duracionLarga, fechaCorta, fechaConDia, kg, reloj } from './formato'

describe('formato', () => {
  it('reloj muestra mm:ss y h:mm:ss', () => {
    expect(reloj(0)).toBe('0:00')
    expect(reloj(65)).toBe('1:05')
    expect(reloj(3725)).toBe('1:02:05')
    expect(reloj(-4)).toBe('0:00')
  })

  it('duracionLarga es legible', () => {
    expect(duracionLarga(20)).toBe('menos de 1 min')
    expect(duracionLarga(45 * 60)).toBe('45 min')
    expect(duracionLarga(3600)).toBe('1 h')
    expect(duracionLarga(3900)).toBe('1 h 5 min')
  })

  it('fechas en español', () => {
    expect(fechaCorta('2026-11-25')).toBe('25 nov')
    expect(fechaCorta(new Date(2026, 10, 25, 22, 0).toISOString())).toBe('25 nov')
    expect(fechaConDia('2026-11-25')).toMatch(/^mié,? 25 nov$/)
  })

  it('kg quita decimales innecesarios', () => {
    expect(kg(80)).toBe('80')
    expect(kg(82.5)).toBe('82,5')
    expect(kg(null)).toBe('–')
  })
})
