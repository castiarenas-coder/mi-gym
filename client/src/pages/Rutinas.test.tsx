import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { instalarApi, verApp } from '../test/utils'

const LISTA = [
  { id: 1, nombre: 'Full body 3 días', descripcion: 'Cuerpo completo', total_ejercicios: 17,
    dias: [{ id: 10, nombre: 'Día A', orden: 0, cantidad: 5 }, { id: 11, nombre: 'Día B', orden: 1, cantidad: 6 }, { id: 12, nombre: 'Día C', orden: 2, cantidad: 6 }] },
  { id: 2, nombre: 'Rutina vacía', descripcion: '', total_ejercicios: 0, dias: [{ id: 20, nombre: 'Día 1', orden: 0, cantidad: 0 }] },
]

function api(lista = LISTA) {
  return instalarApi((metodo, url) => {
    if (url.pathname === '/api/rutinas' && metodo === 'GET') return lista
    if (url.pathname === '/api/rutinas' && metodo === 'POST') return { id: 7, nombre: 'Nueva', descripcion: '', dias: [] }
    if (url.pathname === '/api/rutinas/7' && metodo === 'GET') return { id: 7, nombre: 'Nueva', descripcion: '', dias: [] }
    if (url.pathname === '/api/rutinas/1/duplicar') return { id: 8, nombre: 'Full body 3 días (copia)', descripcion: '', dias: [] }
    if (url.pathname === '/api/rutinas/1' && metodo === 'DELETE') return { ok: true }
    return undefined
  })
}

describe('página Rutinas', () => {
  it('lista las rutinas con días y ejercicios', async () => {
    api()
    verApp('/rutinas')
    const enlace = await screen.findByRole('link', { name: /Full body 3 días/ })
    expect(enlace).toHaveAttribute('href', '/rutinas/1')
    expect(screen.getByText('3 días · 17 ejercicios')).toBeInTheDocument()
    expect(screen.getByText('1 día · 0 ejercicios')).toBeInTheDocument()
    expect(screen.getByText('Cuerpo completo')).toBeInTheDocument()
  })

  it('invita a crear la primera rutina', async () => {
    api([])
    verApp('/rutinas')
    expect(await screen.findByText('Todavía no tenés rutinas')).toBeInTheDocument()
  })

  it('crea una rutina y abre su edición', async () => {
    const { llamadas } = api()
    verApp('/rutinas')
    await screen.findByRole('link', { name: /Full body 3 días/ })
    await userEvent.click(screen.getByRole('button', { name: 'Nueva rutina' }))
    await userEvent.type(screen.getByRole('textbox', { name: 'Nombre de la rutina' }), 'Nueva')
    await userEvent.click(screen.getByRole('button', { name: 'Crear rutina' }))
    await waitFor(() => expect(llamadas.some(l => l.metodo === 'POST' && l.ruta === '/api/rutinas'
      && (l.body as { nombre: string }).nombre === 'Nueva')).toBe(true))
    await waitFor(() => expect(llamadas.some(l => l.ruta === '/api/rutinas/7')).toBe(true))
  })

  it('no crea una rutina sin nombre', async () => {
    api()
    verApp('/rutinas')
    await screen.findByRole('link', { name: /Full body 3 días/ })
    await userEvent.click(screen.getByRole('button', { name: 'Nueva rutina' }))
    expect(screen.getByRole('button', { name: 'Crear rutina' })).toBeDisabled()
  })

  it('duplica una rutina', async () => {
    const { llamadas } = api()
    verApp('/rutinas')
    await userEvent.click(await screen.findByRole('button', { name: 'Duplicar Full body 3 días' }))
    await waitFor(() => expect(llamadas.some(l => l.metodo === 'POST' && l.ruta === '/api/rutinas/1/duplicar')).toBe(true))
  })

  it('pide confirmación antes de eliminar', async () => {
    const { llamadas } = api()
    verApp('/rutinas')
    await userEvent.click(await screen.findByRole('button', { name: 'Eliminar Full body 3 días' }))
    const dialogo = screen.getByRole('dialog', { name: '¿Eliminar la rutina?' })
    expect(within(dialogo).getByText(/Full body 3 días/)).toBeInTheDocument()
    await userEvent.click(within(dialogo).getByRole('button', { name: 'Cancelar' }))
    expect(llamadas.some(l => l.metodo === 'DELETE')).toBe(false)

    await userEvent.click(screen.getByRole('button', { name: 'Eliminar Full body 3 días' }))
    await userEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Eliminar' }))
    await waitFor(() => expect(llamadas.some(l => l.metodo === 'DELETE' && l.ruta === '/api/rutinas/1')).toBe(true))
  })
})
