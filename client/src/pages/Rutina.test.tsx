import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { ej, instalarApi, verApp } from '../test/utils'

const item = (id: number, ejercicio_id: string, extra: object = {}) => ({
  id, ejercicio_id, orden: 0, series: 3, reps: '10', descanso_seg: 90, nota: null,
  nombre: `Ejercicio ${ejercicio_id}`, musculo_principal: 'Pecho', equipo: 'Barra', img_ini: `${ejercicio_id}/0.jpg`, media_propia: null, ...extra,
})

const RUTINA = {
  id: 1, nombre: 'Full body', descripcion: 'Tres días',
  dias: [
    { id: 10, nombre: 'Día A', orden: 0, ejercicios: [item(100, 'S', { orden: 0, series: 4, reps: '6-8', descanso_seg: 120 }), item(101, 'B', { orden: 1, nota: 'Lento' })] },
    { id: 11, nombre: 'Día B', orden: 1, ejercicios: [] },
  ],
}

function api() {
  return instalarApi((metodo, url) => {
    if (url.pathname === '/api/rutinas/1' && metodo === 'GET') return RUTINA
    if (url.pathname === '/api/ejercicios/filtros') return { musculos: [{ valor: 'Pecho', cantidad: 2 }], equipos: [], niveles: [], categorias: [] }
    if (url.pathname === '/api/ejercicios') {
      const q = url.searchParams.get('q')
      const items = [ej('X1', { nombre: 'Press de banca' }), ej('X2', { nombre: 'Remo con barra' })].filter(e => !q || e.nombre.toLowerCase().includes(q.toLowerCase()))
      return { total: items.length, limit: 20, offset: 0, items }
    }
    if (url.pathname.startsWith('/api/rutinas/1')) return { ok: true, id: 1, dias: [] }
    return undefined
  })
}

const dia = (nombre: string) => within(screen.getByRole('region', { name: nombre }))

async function abrir() {
  const r = api()
  verApp('/rutinas/1')
  await screen.findByRole('region', { name: 'Día A' })
  return r
}

describe('edición de una rutina', () => {
  it('muestra nombre, días y ejercicios con sus valores', async () => {
    await abrir()
    expect(screen.getByRole('textbox', { name: 'Nombre de la rutina' })).toHaveValue('Full body')
    expect(screen.getByRole('textbox', { name: 'Descripción' })).toHaveValue('Tres días')
    const a = dia('Día A')
    expect(a.getByRole('link', { name: 'Ejercicio S' })).toHaveAttribute('href', '/ejercicios/S')
    expect(a.getByRole('spinbutton', { name: 'Series de Ejercicio S' })).toHaveValue(4)
    expect(a.getByRole('textbox', { name: 'Repeticiones de Ejercicio S' })).toHaveValue('6-8')
    expect(a.getByRole('spinbutton', { name: 'Descanso en segundos de Ejercicio S' })).toHaveValue(120)
    expect(a.getByRole('textbox', { name: 'Nota de Ejercicio B' })).toHaveValue('Lento')
    expect(dia('Día B').getByText('Este día todavía no tiene ejercicios.')).toBeInTheDocument()
  })

  it('renombra la rutina al salir del campo', async () => {
    const { llamadas } = await abrir()
    const campo = screen.getByRole('textbox', { name: 'Nombre de la rutina' })
    await userEvent.clear(campo)
    await userEvent.type(campo, 'Fuerza')
    await userEvent.tab()
    await waitFor(() => expect(llamadas.some(l => l.metodo === 'PATCH' && l.ruta === '/api/rutinas/1' && (l.body as { nombre: string }).nombre === 'Fuerza')).toBe(true))
  })

  it('no manda nada si no cambió el valor', async () => {
    const { llamadas } = await abrir()
    await userEvent.click(screen.getByRole('textbox', { name: 'Nombre de la rutina' }))
    await userEvent.tab()
    expect(llamadas.some(l => l.metodo === 'PATCH')).toBe(false)
  })

  it('edita series, repeticiones, descanso y nota en línea', async () => {
    const { llamadas } = await abrir()
    const a = dia('Día A')
    const patch = (cuerpo: object) => llamadas.some(l => l.metodo === 'PATCH' && l.ruta === '/api/rutinas/1/dias/10/ejercicios/100'
      && JSON.stringify(l.body) === JSON.stringify(cuerpo))

    const series = a.getByRole('spinbutton', { name: 'Series de Ejercicio S' })
    await userEvent.clear(series); await userEvent.type(series, '5'); await userEvent.tab()
    await waitFor(() => expect(patch({ series: 5 })).toBe(true))

    const reps = a.getByRole('textbox', { name: 'Repeticiones de Ejercicio S' })
    await userEvent.clear(reps); await userEvent.type(reps, '8-12'); await userEvent.tab()
    await waitFor(() => expect(patch({ reps: '8-12' })).toBe(true))

    const descanso = a.getByRole('spinbutton', { name: 'Descanso en segundos de Ejercicio S' })
    await userEvent.clear(descanso); await userEvent.type(descanso, '60'); await userEvent.tab()
    await waitFor(() => expect(patch({ descanso_seg: 60 })).toBe(true))

    const nota = a.getByRole('textbox', { name: 'Nota de Ejercicio S' })
    await userEvent.type(nota, 'Pausa abajo'); await userEvent.tab()
    await waitFor(() => expect(patch({ nota: 'Pausa abajo' })).toBe(true))
  })

  it('reordena ejercicios con subir y bajar', async () => {
    const { llamadas } = await abrir()
    const a = dia('Día A')
    expect(a.getByRole('button', { name: 'Subir Ejercicio S' })).toBeDisabled()
    expect(a.getByRole('button', { name: 'Bajar Ejercicio B' })).toBeDisabled()
    await userEvent.click(a.getByRole('button', { name: 'Bajar Ejercicio S' }))
    await waitFor(() => expect(llamadas.some(l => l.metodo === 'PUT' && l.ruta === '/api/rutinas/1/dias/10/ejercicios/orden'
      && JSON.stringify(l.body) === JSON.stringify({ ids: [101, 100] }))).toBe(true))
  })

  it('quita un ejercicio del día', async () => {
    const { llamadas } = await abrir()
    await userEvent.click(dia('Día A').getByRole('button', { name: 'Quitar Ejercicio B' }))
    await waitFor(() => expect(llamadas.some(l => l.metodo === 'DELETE' && l.ruta === '/api/rutinas/1/dias/10/ejercicios/101')).toBe(true))
  })

  it('renombra un día', async () => {
    const { llamadas } = await abrir()
    const campo = dia('Día B').getByRole('textbox', { name: 'Nombre del día' })
    await userEvent.clear(campo)
    await userEvent.type(campo, 'Día B – Piernas')
    await userEvent.tab()
    await waitFor(() => expect(llamadas.some(l => l.metodo === 'PATCH' && l.ruta === '/api/rutinas/1/dias/11'
      && (l.body as { nombre: string }).nombre === 'Día B – Piernas')).toBe(true))
  })

  it('agrega un día', async () => {
    const { llamadas } = await abrir()
    await userEvent.click(screen.getByRole('button', { name: 'Agregar día' }))
    await userEvent.type(screen.getByRole('textbox', { name: 'Nombre del nuevo día' }), 'Día C')
    await userEvent.click(screen.getByRole('button', { name: 'Crear día' }))
    await waitFor(() => expect(llamadas.some(l => l.metodo === 'POST' && l.ruta === '/api/rutinas/1/dias'
      && (l.body as { nombre: string }).nombre === 'Día C')).toBe(true))
  })

  it('reordena días', async () => {
    const { llamadas } = await abrir()
    expect(dia('Día A').getByRole('button', { name: 'Subir día' })).toBeDisabled()
    await userEvent.click(dia('Día A').getByRole('button', { name: 'Bajar día' }))
    await waitFor(() => expect(llamadas.some(l => l.metodo === 'PUT' && l.ruta === '/api/rutinas/1/dias/orden'
      && JSON.stringify(l.body) === JSON.stringify({ ids: [11, 10] }))).toBe(true))
  })

  it('elimina un día con confirmación', async () => {
    const { llamadas } = await abrir()
    await userEvent.click(dia('Día B').getByRole('button', { name: 'Eliminar día' }))
    const dialogo = screen.getByRole('dialog', { name: '¿Eliminar el día?' })
    await userEvent.click(within(dialogo).getByRole('button', { name: 'Eliminar' }))
    await waitFor(() => expect(llamadas.some(l => l.metodo === 'DELETE' && l.ruta === '/api/rutinas/1/dias/11')).toBe(true))
  })

  it('agrega ejercicios desde el buscador del catálogo', async () => {
    const { llamadas } = await abrir()
    await userEvent.click(dia('Día B').getByRole('button', { name: 'Agregar ejercicio' }))
    const buscador = screen.getByRole('dialog', { name: 'Agregar ejercicios a Día B' })
    expect(await within(buscador).findByText('Press de banca')).toBeInTheDocument()
    await userEvent.type(within(buscador).getByRole('searchbox', { name: 'Buscar ejercicio para agregar' }), 'remo')
    await waitFor(() => expect(within(buscador).queryByText('Press de banca')).not.toBeInTheDocument())
    await userEvent.click(within(buscador).getByRole('button', { name: 'Agregar Remo con barra' }))
    await waitFor(() => expect(llamadas.some(l => l.metodo === 'POST' && l.ruta === '/api/rutinas/1/dias/11/ejercicios'
      && (l.body as { ejercicio_id: string }).ejercicio_id === 'X2')).toBe(true))
    expect(await within(buscador).findByText(/Agregado: Remo con barra/)).toBeInTheDocument()
  })

  it('avisa si la rutina no existe', async () => {
    instalarApi(() => undefined)
    verApp('/rutinas/99')
    expect(await screen.findByText('No encontramos esa rutina.')).toBeInTheDocument()
  })
})
