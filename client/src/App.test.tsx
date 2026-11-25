import { screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { instalarApi, verApp } from './test/utils'

async function ver(ruta = '/') {
  instalarApi((_m, url) => (url.pathname === '/api/sesiones/activa' ? null : url.pathname === '/api/rutinas' ? [] : url.pathname === '/api/progreso/resumen' ? undefined : { total: 0, limit: 1, offset: 0, items: [] }))
  verApp(ruta)
  // La app primero averigua quién entrena (una sola persona entra directo).
  await screen.findByRole('navigation', { name: 'Secciones' })
}

describe('App', () => {
  it('muestra la barra inferior con las cinco secciones en español', async () => {
    await ver()
    const nav = screen.getByRole('navigation', { name: 'Secciones' })
    for (const nombre of ['Inicio', 'Ejercicios', 'Rutinas', 'Entrenar', 'Progreso']) {
      expect(within(nav).getByRole('link', { name: nombre })).toBeInTheDocument()
    }
  })

  it('marca la sección activa', async () => {
    await ver('/entrenar')
    const nav = screen.getByRole('navigation', { name: 'Secciones' })
    expect(within(nav).getByRole('link', { name: 'Entrenar' })).toHaveAttribute('aria-current', 'page')
    expect(within(nav).getByRole('link', { name: 'Inicio' })).not.toHaveAttribute('aria-current')
  })

  it('las secciones nuevas ya no son "Próximamente"', async () => {
    await ver('/progreso')
    expect(await screen.findByRole('heading', { name: 'Progreso' })).toBeInTheDocument()
    expect(screen.queryByText('Próximamente')).not.toBeInTheDocument()
  })

  it('navega al tocar una sección', async () => {
    await ver()
    await userEvent.click(screen.getByRole('link', { name: 'Entrenar' }))
    expect(await screen.findByRole('heading', { name: 'Entrenar' })).toBeInTheDocument()
  })

  it('una ruta desconocida avisa en español', async () => {
    await ver('/nada')
    expect(screen.getByRole('heading', { name: 'No encontramos esa página' })).toBeInTheDocument()
  })
})
