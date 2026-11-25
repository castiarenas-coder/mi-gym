import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { instalarApi, verApp } from '../test/utils'

const fecha = new Date(2026, 10, 25, 18, 30).toISOString()

const ITEM = { id: 7, fecha, titulo: 'Fuerza – Día A', estado: 'finalizada', duracion: 2700, nota: null, series_hechas: 5, volumen_kg: 1480, ejercicios: 2, nombres: ['Press de banca', 'Sentadilla'] }

const DETALLE = {
  id: 7, rutina_id: 1, dia_id: 10, titulo: 'Fuerza – Día A', fecha, fin: fecha, duracion: 2700, nota: 'Buen día', estado: 'finalizada',
  ejercicios: [
    { ejercicio_id: 'Bench', nombre: 'Press de banca', musculo_principal: 'Pecho', equipo: 'Barra', img_ini: null, img_fin: null, media_propia: null, orden: 0, series_plan: 2, reps_plan: '8', descanso_seg: 90,
      series: [{ n: 1, peso_kg: 60, reps: 8, rpe: null, hecha: true }, { n: 2, peso_kg: 62.5, reps: 6, rpe: null, hecha: true }] },
  ],
  resumen: { series_hechas: 2, ejercicios: 1, volumen_kg: 855, records: [] },
}

function api(items = [ITEM]) {
  return instalarApi((metodo, url) => {
    if (url.pathname === '/api/sesiones' && metodo === 'GET') return { total: items.length, limit: 20, offset: 0, items }
    if (url.pathname === '/api/sesiones/7' && metodo === 'GET') return DETALLE
    if (url.pathname === '/api/sesiones/7' && metodo === 'DELETE') return { ok: true }
    return undefined
  })
}

describe('Historial', () => {
  it('lista los entrenamientos pasados con fecha, duración y volumen', async () => {
    api()
    verApp('/historial')
    expect(await screen.findByRole('heading', { name: 'Historial' })).toBeInTheDocument()
    const enlace = await screen.findByRole('link', { name: /Fuerza – Día A/ })
    expect(enlace).toHaveAttribute('href', '/historial/7')
    expect(enlace).toHaveTextContent('25 nov')
    expect(enlace).toHaveTextContent('45 min')
    expect(enlace).toHaveTextContent('1.480 kg')
    expect(enlace).toHaveTextContent('Press de banca, Sentadilla')
  })

  it('sin entrenamientos muestra un estado vacío con acceso a entrenar', async () => {
    api([])
    verApp('/historial')
    expect(await screen.findByText(/Todavía no registraste entrenamientos/)).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Ir a entrenar' })).toHaveAttribute('href', '/entrenar')
  })

  it('muestra el detalle con las series de cada ejercicio', async () => {
    api()
    verApp('/historial/7')
    expect(await screen.findByRole('heading', { name: 'Fuerza – Día A' })).toBeInTheDocument()
    const ej = within(await screen.findByRole('region', { name: 'Press de banca' }))
    expect(ej.getByText('60 kg × 8')).toBeInTheDocument()
    expect(ej.getByText('62,5 kg × 6')).toBeInTheDocument()
    expect(screen.getByText(/Buen día/)).toBeInTheDocument()
  })

  it('borra un entrenamiento con confirmación y vuelve a la lista', async () => {
    const { llamadas } = api()
    verApp('/historial/7')
    await screen.findByRole('heading', { name: 'Fuerza – Día A' })
    await userEvent.click(screen.getByRole('button', { name: 'Eliminar entrenamiento' }))
    const dialogo = await screen.findByRole('dialog')
    expect(within(dialogo).getByText(/No se puede deshacer/)).toBeInTheDocument()
    await userEvent.click(within(dialogo).getByRole('button', { name: 'Eliminar' }))
    await waitFor(() => expect(llamadas.some(l => l.metodo === 'DELETE' && l.ruta === '/api/sesiones/7')).toBe(true))
    expect(await screen.findByRole('heading', { name: 'Historial' })).toBeInTheDocument()
  })

  it('cancelar la confirmación no borra nada', async () => {
    const { llamadas } = api()
    verApp('/historial/7')
    await screen.findByRole('heading', { name: 'Fuerza – Día A' })
    await userEvent.click(screen.getByRole('button', { name: 'Eliminar entrenamiento' }))
    await userEvent.click(within(await screen.findByRole('dialog')).getByRole('button', { name: 'Cancelar' }))
    expect(llamadas.some(l => l.metodo === 'DELETE')).toBe(false)
  })
})
