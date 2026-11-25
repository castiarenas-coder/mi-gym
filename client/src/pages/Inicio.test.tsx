import { screen, within } from '@testing-library/react'
import { ej, instalarApi, verApp } from '../test/utils'

const VARIOS = Array.from({ length: 60 }, (_, i) => ej(`D${i}`))

function api(favoritos = [ej('F1', { favorito: true })]) {
  instalarApi((_m, url) => {
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
})
