/** Preferencias de apariencia (tema y color de acento): por dispositivo, iguales para todas las personas. */
export type Tema = 'sistema' | 'oscuro' | 'claro'

export const ACENTOS: { id: string; nombre: string; color: string; texto: string }[] = [
  { id: 'lima', nombre: 'Lima', color: '#c6ff3d', texto: '#0b0d10' },
  { id: 'cian', nombre: 'Cian', color: '#22d3ee', texto: '#0b0d10' },
  { id: 'azul', nombre: 'Azul', color: '#60a5fa', texto: '#0b0d10' },
  { id: 'violeta', nombre: 'Violeta', color: '#a78bfa', texto: '#0b0d10' },
  { id: 'rosa', nombre: 'Rosa', color: '#ff6b9d', texto: '#0b0d10' },
  { id: 'naranja', nombre: 'Naranja', color: '#ff9f43', texto: '#0b0d10' },
]

export interface Apariencia { tema: Tema; acento: string }
export const APARIENCIA_DEFECTO: Apariencia = { tema: 'oscuro', acento: 'lima' }
const CLAVE = 'mi-gym:apariencia'
const TEMAS: Tema[] = ['sistema', 'oscuro', 'claro']

export function leerApariencia(almacen: Storage = localStorage): Apariencia {
  try {
    const dato = JSON.parse(almacen.getItem(CLAVE) ?? 'null')
    return {
      tema: TEMAS.includes(dato?.tema) ? dato.tema : APARIENCIA_DEFECTO.tema,
      acento: ACENTOS.some(a => a.id === dato?.acento) ? dato.acento : APARIENCIA_DEFECTO.acento,
    }
  } catch {
    return { ...APARIENCIA_DEFECTO }
  }
}

export function guardarApariencia(a: Apariencia, almacen: Storage = localStorage): void {
  try { almacen.setItem(CLAVE, JSON.stringify(a)) } catch { /* sin almacenamiento: se aplica solo en esta sesión */ }
}

export function temaEfectivo(tema: Tema, prefiereOscuro: boolean | null): 'oscuro' | 'claro' {
  if (tema === 'sistema') return prefiereOscuro === false ? 'claro' : 'oscuro'
  return tema
}

export function prefiereOscuro(): boolean | null {
  return typeof matchMedia === 'function' ? matchMedia('(prefers-color-scheme: dark)').matches : null
}

export function aplicarApariencia(a: Apariencia, raiz: HTMLElement = document.documentElement, oscuro: boolean | null = prefiereOscuro()): void {
  const acento = ACENTOS.find(x => x.id === a.acento) ?? ACENTOS[0]
  raiz.dataset.tema = temaEfectivo(a.tema, oscuro)
  raiz.style.setProperty('--acento', acento.color)
  raiz.style.setProperty('--acento-texto', acento.texto)
}
