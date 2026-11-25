import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { vi } from 'vitest'
import { conProveedores, instalarApi } from '../test/utils'
import { SelectorRutina } from './SelectorRutina'

const RUTINAS = [
  { id: 1, nombre: 'Full body', descripcion: '', total_ejercicios: 3, dias: [{ id: 10, nombre: 'Día A', orden: 0, cantidad: 2 }, { id: 11, nombre: 'Día B', orden: 1, cantidad: 1 }] },
]

describe('SelectorRutina', () => {
  it('elige rutina y día y agrega el ejercicio', async () => {
    const { llamadas } = instalarApi((metodo, url) => {
      if (url.pathname === '/api/rutinas' && metodo === 'GET') return RUTINAS
      if (url.pathname === '/api/rutinas/1/dias/11/ejercicios' && metodo === 'POST') return { id: 99 }
      return undefined
    })
    conProveedores(<SelectorRutina ejercicioId="Sentadilla" onCerrar={() => {}} />)
    const dialogo = screen.getByRole('dialog', { name: 'Agregar a rutina' })
    await userEvent.click(await within(dialogo).findByRole('button', { name: /Full body/ }))
    await userEvent.click(within(dialogo).getByRole('button', { name: /Día B/ }))
    await waitFor(() => expect(llamadas.some(l => l.metodo === 'POST' && l.ruta === '/api/rutinas/1/dias/11/ejercicios'
      && (l.body as { ejercicio_id: string }).ejercicio_id === 'Sentadilla')).toBe(true))
    expect(await within(dialogo).findByText(/Agregado a Día B de Full body/)).toBeInTheDocument()
  })

  it('invita a crear una rutina si no hay ninguna', async () => {
    instalarApi(() => [])
    conProveedores(<SelectorRutina ejercicioId="X" onCerrar={() => {}} />)
    expect(await screen.findByRole('link', { name: 'Crear una rutina' })).toHaveAttribute('href', '/rutinas')
  })

  it('se cierra con el botón y con Escape', async () => {
    instalarApi(() => [])
    const onCerrar = vi.fn()
    conProveedores(<SelectorRutina ejercicioId="X" onCerrar={onCerrar} />)
    await userEvent.click(screen.getByRole('button', { name: 'Cerrar' }))
    await userEvent.keyboard('{Escape}')
    expect(onCerrar).toHaveBeenCalledTimes(2)
  })
})
