import { screen, within } from '@testing-library/react'
import { ej, instalarApi, verApp } from '../test/utils'

const VARIOS = Array.from({ length: 60 }, (_, i) => ej(`D${i}`))

const RESUMEN = {
  semanas: [], esta_semana: { sesiones: 2, volumen_kg: 755 }, racha: { actual: 3, mejor: 5 }, total_sesiones: 9, volumen_total_kg: 9000, records: [],
  ultima_sesion: { id: 7, titulo: 'Fuerza – Día A', fecha: '2026-11-25T12:00:00.000Z', duracion: 2700, volumen_kg: 405 },
  sesion_activa: null as null | { id: number; titulo: string; fecha: string },
}

function api(favoritos = [ej('F1', { favorito: true })], resumen: typeof RESUMEN | null = null) {
  instalarApi((_m, url) => {
    if (url.pathname === '/api/progreso/resumen') return resumen ?? undefined
    if (url.pathname === '/api/ejercicios') {
      if (url.searchParams.get('favoritos') === '1') return { total: favoritos.length, limit: 12, offset: 0, items: favoritos }
      const limit = Number(url.searchParams.get('limit'))
      const offset = Number(url.searchParams.get('offset') ?? 0)
      return { total: 60, limit, offset, items: VARIOS.slice(offset, offset + limit) }
    }
    if (url.pathname === '/api/rutinas') return []
    return undefined
  })
}

describe('página Inicio', () => {
  it('muestra los accesos rápidos', async () => {
    api()
    verApp('/')
    const accesos = await screen.findByRole('navigation', { name: 'Accesos rápidos' })
    expect(within(accesos).getByRole('link', { name: /Buscar ejercicios/ })).toHaveAttribute('href', '/ejercicios')
    expect(within(accesos).getByRole('link', { name: /Mis rutinas/ })).toHaveAttribute('href', '/rutinas')
    expect(within(accesos).getByRole('link', { name: /Favoritos/ })).toHaveAttribute('href', '/ejercicios?favoritos=1')
  })

  it('muestra la tira de favoritos', async () => {
    api()
    verApp('/')
    const tira = await screen.findByRole('region', { name: 'Tus favoritos' })
    expect(await within(tira).findByText('Ejercicio F1')).toBeInTheDocument()
  })

  it('sin favoritos invita a marcar alguno', async () => {
    api([])
    verApp('/')
    expect(await screen.findByText('Todavía no marcaste favoritos. Tocá el corazón de un ejercicio para tenerlo a mano.')).toBeInTheDocument()
  })

  it('muestra ejercicios destacados', async () => {
    api()
    verApp('/')
    const destacados = await screen.findByRole('region', { name: 'Para probar hoy' })
    expect((await within(destacados).findAllByRole('link')).length).toBeGreaterThanOrEqual(4)
  })

  it('si hay un entrenamiento en curso ofrece continuarlo', async () => {
    api(undefined, { ...RESUMEN, sesion_activa: { id: 9, titulo: 'Fuerza – Día B', fecha: new Date().toISOString() } })
    verApp('/')
    const region = await screen.findByRole('region', { name: 'Tu entrenamiento' })
    expect(within(region).getByText('Fuerza – Día B')).toBeInTheDocument()
    expect(within(region).getByRole('link', { name: /Continuar entrenamiento/ })).toHaveAttribute('href', '/entrenar')
  })

  it('sin entrenamiento en curso muestra el último y los de esta semana', async () => {
    api(undefined, RESUMEN)
    verApp('/')
    const region = await screen.findByRole('region', { name: 'Tu entrenamiento' })
    expect(within(region).getByRole('link', { name: /Empezar a entrenar/ })).toHaveAttribute('href', '/entrenar')
    expect(within(region).getByText('2 esta semana')).toBeInTheDocument()
    expect(within(region).getByRole('link', { name: /Fuerza – Día A/ })).toHaveAttribute('href', '/historial/7')
  })

  it('tiene acceso al historial', async () => {
    api()
    verApp('/')
    const accesos = await screen.findByRole('navigation', { name: 'Accesos rápidos' })
    expect(within(accesos).getByRole('link', { name: /Historial/ })).toHaveAttribute('href', '/historial')
  })
})
