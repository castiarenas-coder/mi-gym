import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { EjercicioSesion, GrupoSesion, SerieSesion, Sesion } from '../api/tipos'
import { PERSONA_ANA, PERSONA_YO, instalarApi, verApp } from '../test/utils'

const serie = (n: number, peso: number | null, reps: number | null, hecha = false): SerieSesion => ({ n, peso_kg: peso, reps, rpe: null, hecha })
const ejSesion = (series: SerieSesion[]): EjercicioSesion => ({
  ejercicio_id: 'Bench', nombre: 'Press de banca', musculo_principal: 'Pecho', equipo: 'Barra', img_ini: 'Bench/0.jpg', img_fin: 'Bench/1.jpg', media_propia: null,
  orden: 0, series_plan: series.length, reps_plan: '8', descanso_seg: 90, series,
})
const RESUMEN_VACIO = { series_hechas: 0, ejercicios: 0, volumen_kg: 0, records: [] }

const miembro = (sesion: number, persona: typeof PERSONA_YO, hechas: number, total: number) => ({
  sesion_id: sesion, persona, estado: 'en_curso' as const, duracion: null, series_hechas: hechas, series_total: total, ejercicios: 1, volumen_kg: 0, records: [],
})
const GRUPO: GrupoSesion = { id: 'g1', miembros: [miembro(7, PERSONA_YO, 0, 2), miembro(8, PERSONA_ANA, 0, 2)] }

const sesionDe = (id: number, personaId: number, peso: number): Sesion => ({
  id, persona_id: personaId, rutina_id: id === 7 ? 1 : null, dia_id: id === 7 ? 10 : null, titulo: 'Fuerza – Día A', fecha: new Date().toISOString(), fin: null, duracion: null, nota: null,
  estado: 'en_curso', ejercicios: [ejSesion([serie(1, peso, 8), serie(2, peso, 8)])], resumen: RESUMEN_VACIO, grupo: GRUPO,
})

const RUTINAS = [{ id: 1, nombre: 'Fuerza', descripcion: '', total_ejercicios: 1, dias: [{ id: 10, nombre: 'Día A', orden: 0, cantidad: 1 }] }]

function api(inicial: Sesion | null = null) {
  let activa = inicial
  const detalles: Record<number, Sesion> = { 8: sesionDe(8, 2, 40) }
  return instalarApi((metodo, url, body) => {
    const p = url.pathname
    if (p === '/api/personas') return [PERSONA_YO, PERSONA_ANA]
    if (p === '/api/sesiones/activa') return activa
    if (p === '/api/rutinas') return RUTINAS
    if (p === '/api/sesiones' && metodo === 'POST') { activa = sesionDe(7, 1, 60); return activa }
    if (p === '/api/sesiones/8' && metodo === 'GET') return detalles[8]
    if (p === '/api/sesiones/8/series/Bench/1' && metodo === 'PATCH') { Object.assign(detalles[8].ejercicios[0].series[0], body); return detalles[8].ejercicios[0].series[0] }
    if (p === '/api/sesiones/7/acompanantes/2' && metodo === 'DELETE') { activa = { ...sesionDe(7, 1, 60), grupo: null }; return activa }
    if (p === '/api/sesiones/7' && metodo === 'PATCH') {
      const fin = (id: number, persona: typeof PERSONA_YO, vol: number, rec: boolean) => ({
        ...miembro(id, persona, 2, 2), estado: 'finalizada' as const, duracion: 1800, volumen_kg: vol,
        records: rec ? [{ ejercicio_id: 'Bench', nombre: 'Press de banca', tipo: 'peso' as const, valor: 62.5, anterior: 60 }] : [],
      })
      const grupo: GrupoSesion = { id: 'g1', miembros: [fin(7, PERSONA_YO, 960, true), fin(8, PERSONA_ANA, 640, false)] }
      activa = null
      return { ...sesionDe(7, 1, 60), estado: 'finalizada', duracion: 1800, resumen: { series_hechas: 2, ejercicios: 1, volumen_kg: 960, records: grupo.miembros[0].records }, grupo }
    }
    if (p === '/api/ejercicios/filtros') return { musculos: [], equipos: [], niveles: [], categorias: [] }
    return undefined
  })
}

beforeEach(() => localStorage.setItem('mi-gym.persona', '1'))

describe('Entrenar en grupo', () => {
  it('pregunta si entrena alguien más y manda a los acompañantes elegidos', async () => {
    const { llamadas } = api()
    verApp('/entrenar')
    await userEvent.click(await screen.findByRole('button', { name: 'Empezar Día A de Fuerza' }))
    const dialogo = within(await screen.findByRole('dialog', { name: '¿Entrena alguien más?' }))
    expect(dialogo.queryByRole('switch', { name: 'Yo' })).not.toBeInTheDocument()
    const ana = dialogo.getByRole('switch', { name: 'Ana' })
    expect(ana).toHaveAttribute('aria-checked', 'false')
    await userEvent.click(ana)
    expect(ana).toHaveAttribute('aria-checked', 'true')
    await userEvent.click(dialogo.getByRole('button', { name: 'Empezar' }))
    await waitFor(() => expect(llamadas.some(l => l.metodo === 'POST' && l.ruta === '/api/sesiones')).toBe(true))
    expect(llamadas.find(l => l.metodo === 'POST' && l.ruta === '/api/sesiones')?.body).toEqual({ dia_id: 10, rutina_id: 1, acompanantes: [2] })
    expect(await screen.findByRole('tablist', { name: 'Personas del entrenamiento' })).toBeInTheDocument()
  })

  it('sin tocar a nadie empieza solo, como siempre', async () => {
    const { llamadas } = api()
    verApp('/entrenar')
    await userEvent.click(await screen.findByRole('button', { name: 'Empezar sesión libre' }))
    await userEvent.click(await screen.findByRole('button', { name: 'Empezar' }))
    await waitFor(() => expect(llamadas.some(l => l.metodo === 'POST' && l.ruta === '/api/sesiones')).toBe(true))
    expect(llamadas.find(l => l.metodo === 'POST' && l.ruta === '/api/sesiones')?.body).toEqual({})
  })

  it('muestra una pestaña por persona y guarda las series de cada una en su sesión', async () => {
    const { llamadas } = api(sesionDe(7, 1, 60))
    verApp('/entrenar')
    const pestanas = within(await screen.findByRole('tablist', { name: 'Personas del entrenamiento' }))
    expect(pestanas.getByRole('tab', { name: /Yo/ })).toHaveAttribute('aria-selected', 'true')
    const filaYo = screen.getByLabelText('Peso (kg) serie 1') as HTMLInputElement
    expect(filaYo.value).toBe('60')

    await userEvent.click(pestanas.getByRole('tab', { name: /Ana/ }))
    await waitFor(() => expect((screen.getByLabelText('Peso (kg) serie 1') as HTMLInputElement).value).toBe('40'))
    await userEvent.click(screen.getByRole('button', { name: 'Marcar serie 1 como hecha' }))
    await waitFor(() => expect(llamadas.some(l => l.metodo === 'PATCH' && l.ruta === '/api/sesiones/8/series/Bench/1')).toBe(true))
    expect(llamadas.find(l => l.ruta === '/api/sesiones/8/series/Bench/1')?.body).toMatchObject({ hecha: true, peso_kg: 40, reps: 8 })
    // El descanso es uno solo para todos.
    expect(await screen.findByRole('region', { name: 'Descanso' })).toBeInTheDocument()
  })

  it('terminar cierra a todos y muestra el resumen de cada persona', async () => {
    api(sesionDe(7, 1, 60))
    verApp('/entrenar')
    await userEvent.click(await screen.findByRole('button', { name: 'Terminar entrenamiento' }))
    const dialogo = within(screen.getByRole('dialog'))
    expect(dialogo.getByText(/de todos/i)).toBeInTheDocument()
    await userEvent.click(dialogo.getByRole('button', { name: 'Terminar' }))
    expect(await screen.findByRole('heading', { name: '¡Entrenamiento en grupo terminado!' })).toBeInTheDocument()
    const yo = within(screen.getByRole('region', { name: 'Resumen de Yo' }))
    expect(yo.getByText(/Récord nuevo/)).toBeInTheDocument()
    expect(yo.getByText('960 kg')).toBeInTheDocument()
    const ana = within(screen.getByRole('region', { name: 'Resumen de Ana' }))
    expect(ana.getByText('640 kg')).toBeInTheDocument()
  })

  it('permite sacar a un acompañante a mitad del entrenamiento', async () => {
    const { llamadas } = api(sesionDe(7, 1, 60))
    verApp('/entrenar')
    await userEvent.click(await screen.findByRole('tab', { name: /Ana/ }))
    await userEvent.click(await screen.findByRole('button', { name: 'Sacar a Ana del entrenamiento' }))
    await userEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Sacar' }))
    await waitFor(() => expect(llamadas.some(l => l.metodo === 'DELETE' && l.ruta === '/api/sesiones/7/acompanantes/2')).toBe(true))
    await waitFor(() => expect(screen.queryByRole('tablist')).not.toBeInTheDocument())
  })

  it('si un acompañante ya está entrenando, muestra el aviso del servidor', async () => {
    instalarApi((metodo, url) => {
      if (url.pathname === '/api/personas') return [PERSONA_YO, PERSONA_ANA]
      if (url.pathname === '/api/sesiones/activa') return null
      if (url.pathname === '/api/rutinas') return RUTINAS
      if (metodo === 'POST' && url.pathname === '/api/sesiones') return new Response(JSON.stringify({ error: 'Ana ya tiene un entrenamiento en curso' }), { status: 409 })
      return undefined
    })
    verApp('/entrenar')
    await userEvent.click(await screen.findByRole('button', { name: 'Empezar sesión libre' }))
    await userEvent.click(await screen.findByRole('switch', { name: 'Ana' }))
    await userEvent.click(screen.getByRole('button', { name: 'Empezar' }))
    expect(await screen.findByText('Ana ya tiene un entrenamiento en curso')).toBeInTheDocument()
  })
})
