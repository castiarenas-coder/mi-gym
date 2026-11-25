import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { EjercicioSesion, SerieSesion, Sesion } from '../api/tipos'
import { ej, instalarApi, verApp } from '../test/utils'

const serie = (n: number, peso: number | null, reps: number | null, hecha = false): SerieSesion => ({ n, peso_kg: peso, reps, rpe: null, hecha })
const ejSesion = (id: string, nombre: string, series: SerieSesion[], extra: Partial<EjercicioSesion> = {}): EjercicioSesion => ({
  ejercicio_id: id, nombre, musculo_principal: 'Pecho', equipo: 'Barra', img_ini: `${id}/0.jpg`, img_fin: `${id}/1.jpg`, media_propia: null,
  orden: 0, series_plan: series.length, reps_plan: '8-10', descanso_seg: 90, series, ...extra,
})

const sesionBase = (extra: Partial<Sesion> = {}): Sesion => ({
  id: 7, persona_id: 1, rutina_id: 1, dia_id: 10, titulo: 'Fuerza – Día A', fecha: new Date().toISOString(), fin: null, duracion: null, nota: null, estado: 'en_curso',
  ejercicios: [
    ejSesion('Bench', 'Press de banca', [serie(1, 60, 8), serie(2, 60, 8)]),
    ejSesion('Squat', 'Sentadilla', [serie(1, 80, 5)], { orden: 1, descanso_seg: 120 }),
  ],
  resumen: { series_hechas: 0, ejercicios: 0, volumen_kg: 0, records: [] }, grupo: null,
  ...extra,
})

const RUTINAS = [{ id: 1, nombre: 'Fuerza', descripcion: '', total_ejercicios: 3, dias: [{ id: 10, nombre: 'Día A', orden: 0, cantidad: 2 }, { id: 11, nombre: 'Día B', orden: 1, cantidad: 1 }] }]

/** Servidor falso con estado: la sesión vive "en la base" y sobrevive a recargar la página. */
function api(inicial: Sesion | null = null) {
  let sesion: Sesion | null = inicial
  const r = instalarApi((metodo, url, body) => {
    const p = url.pathname
    if (p === '/api/sesiones/activa') return sesion
    if (p === '/api/rutinas' && metodo === 'GET') return RUTINAS
    if (p === '/api/sesiones' && metodo === 'POST') { sesion = sesionBase(); return sesion }
    const m = /^\/api\/sesiones\/7\/series\/([^/]+)\/(\d+)$/.exec(p)
    if (m && metodo === 'PATCH' && sesion) {
      const e = sesion.ejercicios.find(x => x.ejercicio_id === decodeURIComponent(m[1]))!
      const s = e.series.find(x => x.n === Number(m[2]))!
      Object.assign(s, body)
      return s
    }
    if (p === '/api/sesiones/7/series' && metodo === 'POST' && sesion) {
      const b = body as { ejercicio_id: string; peso_kg?: number; reps?: number }
      let e = sesion.ejercicios.find(x => x.ejercicio_id === b.ejercicio_id)
      if (!e) { e = ejSesion(b.ejercicio_id, `Ejercicio ${b.ejercicio_id}`, [], { orden: 5 }); sesion.ejercicios.push(e) }
      const nueva = serie(e.series.length + 1, b.peso_kg ?? null, b.reps ?? null)
      e.series.push(nueva)
      return nueva
    }
    if (p === '/api/sesiones/7' && metodo === 'PATCH' && sesion) {
      const hechas = sesion.ejercicios.flatMap(e => e.series.filter(s => s.hecha))
      sesion = {
        ...sesion, estado: 'finalizada', duracion: 2700, nota: (body as { nota?: string }).nota ?? null,
        resumen: { series_hechas: hechas.length, ejercicios: 1, volumen_kg: 480, records: [{ ejercicio_id: 'Bench', nombre: 'Press de banca', tipo: 'peso', valor: 62.5, anterior: 60 }] },
      }
      const fin = sesion
      sesion = null
      return fin
    }
    if (p === '/api/sesiones/7' && metodo === 'DELETE') { sesion = null; return { ok: true } }
    if (p === '/api/ejercicios/filtros') return { musculos: [], equipos: [], niveles: [], categorias: [] }
    if (p === '/api/ejercicios') return { total: 1, limit: 20, offset: 0, items: [ej('Nuevo', { nombre: 'Curl de bíceps' })] }
    return undefined
  })
  return r
}

const ejercicio = (nombre: string) => within(screen.getByRole('region', { name: nombre }))

describe('Entrenar: elegir qué entrenar', () => {
  it('lista las rutinas con sus días y la opción de sesión libre', async () => {
    api()
    verApp('/entrenar')
    expect(await screen.findByRole('heading', { name: 'Entrenar' })).toBeInTheDocument()
    expect(await screen.findByRole('button', { name: 'Empezar Día A de Fuerza' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Empezar Día B de Fuerza' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Empezar sesión libre' })).toBeInTheDocument()
  })

  it('al elegir un día inicia la sesión y muestra sus ejercicios', async () => {
    const { llamadas } = api()
    verApp('/entrenar')
    await userEvent.click(await screen.findByRole('button', { name: 'Empezar Día A de Fuerza' }))
    expect(await screen.findByRole('heading', { name: 'Fuerza – Día A' })).toBeInTheDocument()
    expect(llamadas.find(l => l.metodo === 'POST' && l.ruta === '/api/sesiones')?.body).toEqual({ dia_id: 10, rutina_id: 1 })
    expect(screen.getByRole('region', { name: 'Press de banca' })).toBeInTheDocument()
    expect(screen.getByRole('region', { name: 'Sentadilla' })).toBeInTheDocument()
  })

  it('sin rutinas invita a crear una', async () => {
    instalarApi((_m, url) => (url.pathname === '/api/sesiones/activa' ? null : url.pathname === '/api/rutinas' ? [] : undefined))
    verApp('/entrenar')
    expect(await screen.findByText(/Todavía no tenés rutinas/)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Empezar sesión libre' })).toBeInTheDocument()
  })
})

describe('Entrenar: sesión en curso', () => {
  it('retoma la sesión activa al abrir la página, con los valores precargados', async () => {
    api(sesionBase())
    verApp('/entrenar')
    expect(await screen.findByRole('heading', { name: 'Fuerza – Día A' })).toBeInTheDocument()
    const press = ejercicio('Press de banca')
    expect(press.getByLabelText('Peso (kg) serie 1')).toHaveValue('60')
    expect(press.getByLabelText('Repeticiones serie 1')).toHaveValue('8')
    expect(press.getAllByRole('button', { name: /^Marcar serie \d como hecha$/ })).toHaveLength(2)
    expect(screen.getByRole('timer', { name: 'Tiempo de entrenamiento' })).toBeInTheDocument()
  })

  it('al marcar una serie la guarda enseguida y arranca el descanso', async () => {
    const { llamadas } = api(sesionBase())
    verApp('/entrenar')
    await screen.findByRole('heading', { name: 'Fuerza – Día A' })
    await userEvent.click(ejercicio('Press de banca').getByRole('button', { name: 'Marcar serie 1 como hecha' }))
    await waitFor(() => expect(llamadas.some(l => l.metodo === 'PATCH' && l.ruta === '/api/sesiones/7/series/Bench/1')).toBe(true))
    const patch = llamadas.find(l => l.metodo === 'PATCH' && l.ruta === '/api/sesiones/7/series/Bench/1')!
    expect(patch.body).toEqual({ peso_kg: 60, reps: 8, hecha: true })
    const descanso = await screen.findByRole('region', { name: 'Descanso' })
    expect(within(descanso).getByText('1:30')).toBeInTheDocument()
    expect(await ejercicio('Press de banca').findByRole('button', { name: 'Serie 1 hecha, tocá para desmarcar' })).toBeInTheDocument()
  })

  it('usa el descanso propio de cada ejercicio y permite ajustarlo o saltarlo', async () => {
    api(sesionBase())
    verApp('/entrenar')
    await screen.findByRole('heading', { name: 'Fuerza – Día A' })
    await userEvent.click(ejercicio('Sentadilla').getByRole('button', { name: 'Marcar serie 1 como hecha' }))
    const descanso = await screen.findByRole('region', { name: 'Descanso' })
    expect(within(descanso).getByText('2:00')).toBeInTheDocument()
    await userEvent.click(within(descanso).getByRole('button', { name: 'Sumar 15 segundos' }))
    expect(within(descanso).getByText('2:15')).toBeInTheDocument()
    await userEvent.click(within(descanso).getByRole('button', { name: 'Restar 15 segundos' }))
    expect(within(descanso).getByText('2:00')).toBeInTheDocument()
    await userEvent.click(within(descanso).getByRole('button', { name: 'Saltar descanso' }))
    expect(screen.queryByRole('region', { name: 'Descanso' })).not.toBeInTheDocument()
  })

  it('guarda el peso editado junto con la serie', async () => {
    const { llamadas } = api(sesionBase())
    verApp('/entrenar')
    await screen.findByRole('heading', { name: 'Fuerza – Día A' })
    const press = ejercicio('Press de banca')
    const peso = press.getByLabelText('Peso (kg) serie 2')
    await userEvent.clear(peso)
    await userEvent.type(peso, '62,5')
    await userEvent.click(press.getByRole('button', { name: 'Marcar serie 2 como hecha' }))
    const marcada = () => llamadas.find(l => l.metodo === 'PATCH' && l.ruta.endsWith('/Bench/2') && (l.body as { hecha?: boolean }).hecha)
    await waitFor(() => expect(marcada()).toBeTruthy())
    expect(marcada()!.body).toEqual({ peso_kg: 62.5, reps: 8, hecha: true })
  })

  it('permite agregar una serie y un ejercicio extra del catálogo', async () => {
    const { llamadas } = api(sesionBase())
    verApp('/entrenar')
    await screen.findByRole('heading', { name: 'Fuerza – Día A' })
    await userEvent.click(ejercicio('Sentadilla').getByRole('button', { name: 'Agregar serie' }))
    await waitFor(() => expect(llamadas.some(l => l.metodo === 'POST' && l.ruta === '/api/sesiones/7/series')).toBe(true))
    expect(llamadas.find(l => l.metodo === 'POST' && l.ruta === '/api/sesiones/7/series')!.body).toEqual({ ejercicio_id: 'Squat', peso_kg: 80, reps: 5 })

    await userEvent.click(screen.getByRole('button', { name: 'Agregar ejercicio' }))
    await userEvent.click(await screen.findByRole('button', { name: 'Agregar Curl de bíceps' }))
    await waitFor(() => expect(llamadas.some(l => l.metodo === 'POST' && (l.body as { ejercicio_id?: string })?.ejercicio_id === 'Nuevo')).toBe(true))
  })

  it('terminar muestra el resumen con duración, volumen y récords nuevos', async () => {
    api(sesionBase())
    verApp('/entrenar')
    await screen.findByRole('heading', { name: 'Fuerza – Día A' })
    await userEvent.click(ejercicio('Press de banca').getByRole('button', { name: 'Marcar serie 1 como hecha' }))
    await userEvent.click(screen.getByRole('button', { name: 'Terminar entrenamiento' }))
    const dialogo = await screen.findByRole('dialog', { name: '¿Terminar el entrenamiento?' })
    expect(within(dialogo).getByText(/series sin marcar/)).toBeInTheDocument()
    await userEvent.click(within(dialogo).getByRole('button', { name: 'Terminar' }))
    const resumen = await screen.findByRole('region', { name: 'Resumen del entrenamiento' })
    expect(within(resumen).getByText('45 min')).toBeInTheDocument()
    expect(within(resumen).getByText(/480/)).toBeInTheDocument()
    expect(within(resumen).getByText(/Récord nuevo/)).toHaveTextContent('Press de banca')
    await userEvent.click(screen.getByRole('button', { name: 'Listo' }))
    expect(await screen.findByRole('button', { name: 'Empezar sesión libre' })).toBeInTheDocument()
  })

  it('se puede descartar el entrenamiento con confirmación', async () => {
    const { llamadas } = api(sesionBase())
    verApp('/entrenar')
    await screen.findByRole('heading', { name: 'Fuerza – Día A' })
    await userEvent.click(screen.getByRole('button', { name: 'Descartar entrenamiento' }))
    const dialogo = await screen.findByRole('dialog')
    await userEvent.click(within(dialogo).getByRole('button', { name: 'Descartar' }))
    await waitFor(() => expect(llamadas.some(l => l.metodo === 'DELETE' && l.ruta === '/api/sesiones/7')).toBe(true))
    expect(await screen.findByRole('button', { name: 'Empezar sesión libre' })).toBeInTheDocument()
  })
})
