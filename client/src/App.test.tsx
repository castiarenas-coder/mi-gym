import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { App } from './App'

function ver(ruta = '/') {
  return render(<MemoryRouter initialEntries={[ruta]}><App /></MemoryRouter>)
}

describe('App', () => {
  it('muestra la barra inferior con las cinco secciones en español', () => {
    ver()
    const nav = screen.getByRole('navigation', { name: 'Secciones' })
    for (const nombre of ['Inicio', 'Ejercicios', 'Rutinas', 'Entrenar', 'Progreso']) {
      expect(within(nav).getByRole('link', { name: nombre })).toBeInTheDocument()
    }
  })

  it('marca la sección activa', () => {
    ver('/rutinas')
    const nav = screen.getByRole('navigation', { name: 'Secciones' })
    expect(within(nav).getByRole('link', { name: 'Rutinas' })).toHaveAttribute('aria-current', 'page')
    expect(within(nav).getByRole('link', { name: 'Inicio' })).not.toHaveAttribute('aria-current')
  })

  it('las rutas sin construir muestran "Próximamente"', () => {
    ver('/progreso')
    expect(screen.getByRole('heading', { name: 'Progreso' })).toBeInTheDocument()
    expect(screen.getByText('Próximamente')).toBeInTheDocument()
  })

  it('navega al tocar una sección', async () => {
    ver()
    await userEvent.click(screen.getByRole('link', { name: 'Entrenar' }))
    expect(screen.getByRole('heading', { name: 'Entrenar' })).toBeInTheDocument()
  })

  it('una ruta desconocida avisa en español', () => {
    ver('/nada')
    expect(screen.getByRole('heading', { name: 'No encontramos esa página' })).toBeInTheDocument()
  })
})
