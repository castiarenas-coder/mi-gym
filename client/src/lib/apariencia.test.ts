import { ACENTOS, APARIENCIA_DEFECTO, aplicarApariencia, guardarApariencia, leerApariencia, temaEfectivo } from './apariencia'

function luz(hex: string) {
  const c = [1, 3, 5].map(i => parseInt(hex.slice(i, i + 2), 16) / 255)
    .map(v => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4))
  return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2]
}
const contraste = (a: string, b: string) => {
  const [x, y] = [luz(a), luz(b)].sort((p, q) => q - p)
  return (x + 0.05) / (y + 0.05)
}

describe('apariencia', () => {
  beforeEach(() => localStorage.clear())

  it('si el almacenamiento tira error (datos del sitio bloqueados) usa el defecto y no rompe', () => {
    const roto = { getItem() { throw new Error('SecurityError') }, setItem() { throw new Error('SecurityError') } } as unknown as Storage
    expect(leerApariencia(roto)).toEqual(APARIENCIA_DEFECTO)
    expect(() => guardarApariencia({ tema: 'claro', acento: 'cian' }, roto)).not.toThrow()
  })

  it('si acceder a localStorage tira error, los valores por defecto del parámetro tampoco rompen', () => {
    const desc = Object.getOwnPropertyDescriptor(globalThis, 'localStorage')!
    Object.defineProperty(globalThis, 'localStorage', { configurable: true, get() { throw new Error('SecurityError') } })
    try {
      expect(leerApariencia()).toEqual(APARIENCIA_DEFECTO)
      expect(() => guardarApariencia({ tema: 'claro', acento: 'cian' })).not.toThrow()
    } finally {
      Object.defineProperty(globalThis, 'localStorage', desc)
    }
  })

  it('sin dato devuelve el defecto', () => {
    expect(leerApariencia()).toEqual({ tema: 'oscuro', acento: 'lima' })
    expect(APARIENCIA_DEFECTO).toEqual({ tema: 'oscuro', acento: 'lima' })
  })

  it('con JSON inválido o valores inválidos usa el defecto en el campo inválido', () => {
    localStorage.setItem('mi-gym:apariencia', '{no es json')
    expect(leerApariencia()).toEqual(APARIENCIA_DEFECTO)
    localStorage.setItem('mi-gym:apariencia', JSON.stringify({ tema: 'azul', acento: ACENTOS[2].id }))
    expect(leerApariencia()).toEqual({ tema: 'oscuro', acento: ACENTOS[2].id })
    localStorage.setItem('mi-gym:apariencia', JSON.stringify({ tema: 'claro', acento: 'xx' }))
    expect(leerApariencia()).toEqual({ tema: 'claro', acento: 'lima' })
  })

  it('guardar y leer devuelve lo guardado', () => {
    guardarApariencia({ tema: 'claro', acento: ACENTOS[3].id })
    expect(leerApariencia()).toEqual({ tema: 'claro', acento: ACENTOS[3].id })
  })

  it('temaEfectivo resuelve el tema del sistema', () => {
    expect(temaEfectivo('sistema', true)).toBe('oscuro')
    expect(temaEfectivo('sistema', false)).toBe('claro')
    expect(temaEfectivo('sistema', null)).toBe('oscuro')
    expect(temaEfectivo('claro', true)).toBe('claro')
    expect(temaEfectivo('oscuro', false)).toBe('oscuro')
  })

  it('aplicarApariencia pone data-tema y las variables de acento', () => {
    const raiz = document.createElement('div')
    aplicarApariencia({ tema: 'claro', acento: ACENTOS[1].id }, raiz)
    expect(raiz.dataset.tema).toBe('claro')
    expect(raiz.style.getPropertyValue('--acento')).toBe(ACENTOS[1].colorClaro)
    expect(raiz.style.getPropertyValue('--acento-texto')).toBe(ACENTOS[1].textoClaro)
  })

  it('con tema sistema usa la preferencia recibida', () => {
    const raiz = document.createElement('div')
    aplicarApariencia({ tema: 'sistema', acento: 'lima' }, raiz, false)
    expect(raiz.dataset.tema).toBe('claro')
  })

  it('hay 6 acentos con texto legible (AA) sobre su color', () => {
    expect(ACENTOS).toHaveLength(6)
    expect(ACENTOS[0]).toMatchObject({ id: 'lima', nombre: 'Lima', color: '#c6ff3d', texto: '#0b0d10' })
    for (const a of ACENTOS) expect(contraste(a.color, a.texto)).toBeGreaterThanOrEqual(4.5)
  })

  it('usa la variante del tema efectivo: clara en claro, original en oscuro', () => {
    const raiz = document.createElement('div')
    aplicarApariencia({ tema: 'claro', acento: 'lima' }, raiz)
    expect(raiz.style.getPropertyValue('--acento')).toBe(ACENTOS[0].colorClaro)
    expect(raiz.style.getPropertyValue('--acento-texto')).toBe(ACENTOS[0].textoClaro)
    aplicarApariencia({ tema: 'oscuro', acento: 'lima' }, raiz)
    expect(raiz.style.getPropertyValue('--acento')).toBe(ACENTOS[0].color)
    aplicarApariencia({ tema: 'sistema', acento: 'lima' }, raiz, false)
    expect(raiz.style.getPropertyValue('--acento')).toBe(ACENTOS[0].colorClaro)
    aplicarApariencia({ tema: 'sistema', acento: 'lima' }, raiz, true)
    expect(raiz.style.getPropertyValue('--acento')).toBe(ACENTOS[0].color)
  })

  it('las variantes claras cumplen AA: color como texto sobre el fondo claro y texto sobre color', () => {
    for (const a of ACENTOS) {
      expect(contraste(a.colorClaro, '#f5f5f1')).toBeGreaterThanOrEqual(4.5)
      expect(contraste(a.colorClaro, a.textoClaro)).toBeGreaterThanOrEqual(4.5)
    }
  })
})
