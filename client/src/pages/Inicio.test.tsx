import { screen, within } from '@testing-library/react'
import { ej, instalarApi, PERSONA_YO, verApp } from '../test/utils'

const VARIOS = Array.from({ length: 60 }, (_, i) => ej(`D${i}`))

const RESUMEN = {
  semanas: [], esta_semana: { sesiones: 2, volumen_kg: 755 }, racha: { actual: 3, mejor: 5 }, total_sesiones: 9, volumen_total_kg: 9000, records: [],
  ultima_sesion: { id: 7, titulo: 'Fuerza – Día A', fecha: '2026-11-25T12:00:00.000Z', duracion: 2700, volumen_kg: 405 } as null | { id: number; titulo: string; fecha: string; duracion: number; volumen_kg: number },
  sesion_activa: null as null | { id: number; titulo: string; fecha: string },
}

const RUTINA = { id: 4, nombre: 'Empuje y tirón', descripcion: '', total_ejercicios: 6, dias: [] }

interface Opciones { favoritos?: ReturnType<typeof ej>[]; resumen?: typeof RESUMEN | null; rutinas?: typeof RUTINA[]; persona?: Record<string, unknown> }

function api({ favoritos = [ej('F1', { favorito: true })], resumen = null, rutinas = [], persona }: Opciones = {}) {
  instalarApi((_m, url) => {
    if (url.pathname === '/api/personas' && persona) return [persona]
    if (url.pathname === '/api/progreso/resumen') return resumen ?? undefined
    if (url.pathname === '/api/ejercicios') {
      if (url.searchParams.get('favoritos') === '1') return { total: favoritos.length, limit: 12, offset: 0, items: favoritos }
      const limit = Number(url.searchParams.get('limit'))
      const offset = Number(url.searchParams.get('offset') ?? 0)
      return { total: 60, limit, offset, items: VARIOS.slice(offset, offset + limit) }
    }
    if (url.pathname === '/api/rutinas') return rutinas
    return undefined
  })
}

describe('página Inicio', () => {
  it('no repite la marca ni el texto de portada', async () => {
    api()
    verApp('/')
    await screen.findByRole('region', { name: 'Tu entrenamiento' })
    expect(screen.queryByText(/Hoy se/)).toBeNull()
    expect(screen.queryByText(/guardado en tu PC/)).toBeNull()
    expect(screen.queryByRole('navigation', { name: 'Accesos rápidos' })).toBeNull()
  })

  it('saluda a la persona con la fecha de hoy', async () => {
    api()
    verApp('/')
    expect(await screen.findByRole('heading', { level: 1, name: 'Hola, Yo' })).toBeInTheDocument()
    const crudo = new Date().toLocaleDateString('es-AR', { weekday: 'long', day: 'numeric', month: 'long' })
    const hoy = crudo.charAt(0).toUpperCase() + crudo.slice(1)
    expect(screen.getByText(hoy)).toBeInTheDocument()
    expect(hoy).not.toMatch(/ De /)
  })

  it('con nombre vacío saluda solo con "Hola"', async () => {
    api({ persona: { ...PERSONA_YO, nombre: '' } })
    verApp('/')
    const h1 = await screen.findByRole('heading', { level: 1 })
    expect(h1).toHaveTextContent(/^Hola$/)
  })

  it('con un entrenamiento en curso ofrece continuarlo', async () => {
    api({ resumen: { ...RESUMEN, sesion_activa: { id: 9, titulo: 'Fuerza – Día B', fecha: new Date().toISOString() } } })
    verApp('/')
    const region = await screen.findByRole('region', { name: 'Tu entrenamiento' })
    expect(await within(region).findByText('Fuerza – Día B')).toBeInTheDocument()
    expect(await within(region).findByRole('link', { name: /Continuar/ })).toHaveAttribute('href', '/entrenar')
    expect(within(region).queryByRole('link', { name: /Empezar/ })).toBeNull()
  })

  it('sin entrenamiento en curso ofrece empezar y las rutinas como accesos', async () => {
    api({ resumen: RESUMEN, rutinas: [RUTINA] })
    verApp('/')
    const region = await screen.findByRole('region', { name: 'Tu entrenamiento' })
    expect(await within(region).findByRole('link', { name: /Empezar/ })).toHaveAttribute('href', '/entrenar')
    expect(within(region).queryByRole('link', { name: /Continuar/ })).toBeNull()
    expect(await within(region).findByRole('link', { name: /Empuje y tirón/ })).toHaveAttribute('href', '/entrenar')
  })

  it('sin rutinas invita a crear la primera', async () => {
    api({ resumen: RESUMEN })
    verApp('/')
    const region = await screen.findByRole('region', { name: 'Tu entrenamiento' })
    expect(await within(region).findByRole('link', { name: 'Creá tu primera rutina' })).toHaveAttribute('href', '/rutinas')
  })

  it('muestra el último entrenamiento con duración y volumen', async () => {
    api({ resumen: RESUMEN })
    verApp('/')
    const region = await screen.findByRole('region', { name: 'Último entrenamiento' })
    expect(within(region).getByRole('link', { name: /Fuerza – Día A/ })).toHaveAttribute('href', '/historial/7')
    expect(within(region).getByText('Duración')).toBeInTheDocument()
    expect(within(region).getByText('Volumen')).toBeInTheDocument()
    expect(within(region).getByText('405')).toBeInTheDocument()
  })

  it('sin último entrenamiento no muestra la tarjeta', async () => {
    api({ resumen: { ...RESUMEN, ultima_sesion: null } })
    verApp('/')
    await screen.findByRole('region', { name: 'Tu entrenamiento' })
    expect(screen.queryByRole('region', { name: 'Último entrenamiento' })).toBeNull()
  })

  it('muestra la franja de la semana sin un "0 esta semana" suelto', async () => {
    api()
    verApp('/')
    expect(await screen.findByRole('region', { name: 'Tu semana' })).toBeInTheDocument()
    expect(screen.queryByText(/^0 esta semana/)).toBeNull()
  })

  it('muestra la tira de favoritos con enlace a todos', async () => {
    api()
    verApp('/')
    const tira = await screen.findByRole('region', { name: 'Tus favoritos' })
    expect(await within(tira).findByText('Ejercicio F1')).toBeInTheDocument()
    expect(within(tira).getByRole('link', { name: /Ver todos/ })).toHaveAttribute('href', '/ejercicios?favoritos=1')
  })

  it('sin favoritos invita a marcar alguno', async () => {
    api({ favoritos: [] })
    verApp('/')
    expect(await screen.findByText('Todavía no marcaste favoritos. Tocá el corazón de un ejercicio para tenerlo a mano.')).toBeInTheDocument()
  })

  it('muestra ejercicios destacados', async () => {
    api()
    verApp('/')
    const destacados = await screen.findByRole('region', { name: 'Para probar hoy' })
    expect((await within(destacados).findAllByRole('link')).length).toBeGreaterThanOrEqual(4)
  })

  it('enlaza al historial desde el último entrenamiento', async () => {
    api({ resumen: RESUMEN })
    verApp('/')
    const region = await screen.findByRole('region', { name: 'Último entrenamiento' })
    expect(within(region).getByRole('link', { name: /Ver historial/ })).toHaveAttribute('href', '/historial')
  })
})
