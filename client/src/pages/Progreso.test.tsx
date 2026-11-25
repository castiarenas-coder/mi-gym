import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { ResumenProgreso } from '../api/tipos'
import { instalarApi, verApp } from '../test/utils'

const semanas = Array.from({ length: 12 }, (_, i) => ({
  inicio: `2026-${i < 4 ? '09' : i < 8 ? '10' : '11'}-${String(((i % 4) * 7 + 1) % 28 + 1).padStart(2, '0')}`, sesiones: 0, volumen_kg: 0,
}))
semanas[10] = { inicio: '2026-11-16', sesiones: 1, volumen_kg: 520 }
semanas[11] = { inicio: '2026-11-23', sesiones: 2, volumen_kg: 755 }

const RESUMEN: ResumenProgreso = {
  semanas,
  esta_semana: { sesiones: 2, volumen_kg: 755 },
  racha: { actual: 3, mejor: 5 },
  total_sesiones: 4,
  volumen_total_kg: 2355,
  records: [
    { ejercicio_id: 'Bench', nombre: 'Press de banca', img_ini: null, img_fin: null, media_propia: null, peso_max: 100, fecha_peso: '2026-11-20T12:00:00.000Z', e1rm_max: 116.7, fecha_e1rm: '2026-11-20T12:00:00.000Z', sesiones: 3 },
    { ejercicio_id: 'Squat', nombre: 'Sentadilla', img_ini: null, img_fin: null, media_propia: null, peso_max: 120, fecha_peso: '2026-11-21T12:00:00.000Z', e1rm_max: 130, fecha_e1rm: '2026-11-21T12:00:00.000Z', sesiones: 2 },
  ],
  ultima_sesion: { id: 7, titulo: 'Fuerza – Día A', fecha: '2026-11-25T12:00:00.000Z', duracion: 2700, volumen_kg: 405 },
  sesion_activa: null,
}

const HISTORIAL = {
  ejercicio_id: 'Bench', total_sesiones: 2,
  sesiones: [
    { sesion_id: 1, fecha: '2026-11-10T13:00:00.000Z', series: [{ n: 1, peso_kg: 90, reps: 5, rpe: null, e1rm: 105 }, { n: 2, peso_kg: 90, reps: 5, rpe: null, e1rm: 105 }], volumen_kg: 900, mejor_peso: 90, mejor_e1rm: 105, mejor_reps: 5 },
    { sesion_id: 2, fecha: '2026-11-20T13:00:00.000Z', series: [{ n: 1, peso_kg: 100, reps: 5, rpe: null, e1rm: 116.7 }], volumen_kg: 500, mejor_peso: 100, mejor_e1rm: 116.7, mejor_reps: 5 },
  ],
  mejor_peso: { peso_kg: 100, reps: 5, fecha: '2026-11-20T13:00:00.000Z', sesion_id: 2 },
  mejor_e1rm: { valor: 116.7, peso_kg: 100, reps: 5, fecha: '2026-11-20T13:00:00.000Z', sesion_id: 2 },
}

const PERFIL_VACIO = { perfil: { altura_cm: null, edad: null, fecha_nacimiento: null, sexo: null, actividad: null, objetivo: null }, peso_kg: null, fecha_peso: null, calculos: null }
const PERFIL_LLENO = {
  perfil: { altura_cm: 180, edad: 30, fecha_nacimiento: null, sexo: 'hombre', actividad: 'moderado', objetivo: 'bajar' },
  peso_kg: 79, fecha_peso: '2026-11-25',
  calculos: { imc: 24.4, categoria_imc: 'Peso normal', bmr: 1770, tdee: 2744, kcal_objetivo: 2195, macros: { proteina_g: 158, grasa_g: 61, carbohidratos_g: 254 } },
}

interface Opciones { resumen?: ResumenProgreso; medidas?: object[]; perfil?: typeof PERFIL_VACIO | typeof PERFIL_LLENO }

function api({ resumen = RESUMEN, medidas = [], perfil = PERFIL_VACIO }: Opciones = {}) {
  const lista = [...medidas]
  return instalarApi((metodo, url, body) => {
    const p = url.pathname
    if (p === '/api/progreso/resumen') return resumen
    if (p === '/api/ejercicios/Bench/historial') return HISTORIAL
    if (p === '/api/ejercicios/Squat/historial') return { ...HISTORIAL, ejercicio_id: 'Squat', sesiones: [], total_sesiones: 0, mejor_peso: null, mejor_e1rm: null }
    if (p === '/api/medidas' && metodo === 'GET') return lista
    if (p === '/api/medidas' && metodo === 'POST') { const m = { cintura: null, pecho: null, brazo: null, pierna: null, grasa_pct: null, peso_kg: null, ...(body as object) }; lista.push(m); return m }
    if (p.startsWith('/api/medidas/') && metodo === 'DELETE') return { ok: true }
    if (p === '/api/perfil' && metodo === 'GET') return perfil
    if (p === '/api/perfil' && metodo === 'PUT') return PERFIL_LLENO
    return undefined
  })
}

describe('Progreso: pestañas', () => {
  it('muestra las cuatro pestañas y el acceso al historial', async () => {
    api()
    verApp('/progreso')
    expect(await screen.findByRole('heading', { name: 'Progreso' })).toBeInTheDocument()
    const tabs = screen.getByRole('tablist', { name: 'Secciones de progreso' })
    for (const n of ['Resumen', 'Ejercicios', 'Medidas', 'Calculadora']) expect(within(tabs).getByRole('tab', { name: n })).toBeInTheDocument()
    expect(within(tabs).getByRole('tab', { name: 'Resumen' })).toHaveAttribute('aria-selected', 'true')
    expect(screen.getByRole('link', { name: /Ver historial/ })).toHaveAttribute('href', '/historial')
  })

  it('abre la pestaña indicada en la dirección', async () => {
    api()
    verApp('/progreso?tab=medidas')
    expect(await screen.findByRole('tab', { name: 'Medidas', selected: true })).toBeInTheDocument()
  })
})

describe('Progreso: Resumen', () => {
  it('muestra tarjetas y gráficos semanales', async () => {
    api()
    verApp('/progreso')
    const tarjetas = await screen.findByRole('region', { name: 'Tu semana' })
    expect(within(tarjetas).getByText('Entrenamientos esta semana').nextElementSibling).toHaveTextContent('2')
    expect(within(tarjetas).getByText('Racha').nextElementSibling).toHaveTextContent('3 semanas')
    expect(within(tarjetas).getByText('Volumen esta semana').nextElementSibling).toHaveTextContent('755 kg')
    expect(screen.getByRole('img', { name: /Entrenamientos por semana/ })).toBeInTheDocument()
    expect(screen.getByRole('img', { name: /Volumen por semana/ })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Semana del 23 nov: 2 entrenamientos' })).toBeInTheDocument()
  })

  it('sin entrenamientos explica cómo empezar', async () => {
    api({ resumen: { ...RESUMEN, total_sesiones: 0, records: [], semanas: semanas.map(s => ({ ...s, sesiones: 0, volumen_kg: 0 })), esta_semana: { sesiones: 0, volumen_kg: 0 }, racha: { actual: 0, mejor: 0 }, ultima_sesion: null } })
    verApp('/progreso')
    expect(await screen.findByText(/Todavía no registraste entrenamientos/)).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Ir a entrenar' })).toHaveAttribute('href', '/entrenar')
  })
})

describe('Progreso: Ejercicios', () => {
  it('muestra el gráfico y los récords del ejercicio elegido', async () => {
    api()
    verApp('/progreso?tab=ejercicios')
    const selector = await screen.findByRole('combobox', { name: 'Ejercicio' })
    expect(selector).toHaveValue('Bench')
    expect(await screen.findByRole('img', { name: /Mejor peso/ })).toBeInTheDocument()
    expect(screen.getByText('Peso máximo').nextElementSibling).toHaveTextContent('100 kg')
    expect(screen.getByText('1RM estimado').nextElementSibling).toHaveTextContent('116,7 kg')
    await userEvent.click(screen.getByRole('button', { name: 'Gráfico de 1RM' }))
    expect(await screen.findByRole('img', { name: /1RM estimado/ })).toBeInTheDocument()
  })

  it('cambia de ejercicio', async () => {
    const { llamadas } = api()
    verApp('/progreso?tab=ejercicios')
    await userEvent.selectOptions(await screen.findByRole('combobox', { name: 'Ejercicio' }), 'Squat')
    await waitFor(() => expect(llamadas.some(l => l.ruta === '/api/ejercicios/Squat/historial')).toBe(true))
  })

  it('sin ejercicios registrados lo explica', async () => {
    api({ resumen: { ...RESUMEN, records: [] } })
    verApp('/progreso?tab=ejercicios')
    expect(await screen.findByText(/Cuando registres entrenamientos/)).toBeInTheDocument()
  })
})

describe('Progreso: Medidas', () => {
  it('guarda las medidas del día', async () => {
    const { llamadas } = api()
    verApp('/progreso?tab=medidas')
    await userEvent.type(await screen.findByLabelText('Peso (kg)'), '80,5')
    await userEvent.type(screen.getByLabelText('Cintura (cm)'), '90')
    await userEvent.click(screen.getByRole('button', { name: 'Guardar medidas' }))
    await waitFor(() => expect(llamadas.some(l => l.metodo === 'POST' && l.ruta === '/api/medidas')).toBe(true))
    const cuerpo = llamadas.find(l => l.metodo === 'POST' && l.ruta === '/api/medidas')!.body as Record<string, unknown>
    expect(cuerpo.peso_kg).toBe(80.5)
    expect(cuerpo.cintura).toBe(90)
    expect(cuerpo.fecha).toMatch(/^\d{4}-\d{2}-\d{2}$/)
    expect(await screen.findByText('Medidas guardadas')).toBeInTheDocument()
  })

  it('no deja guardar el formulario vacío', async () => {
    api()
    verApp('/progreso?tab=medidas')
    expect(await screen.findByRole('button', { name: 'Guardar medidas' })).toBeDisabled()
  })

  it('lista las medidas en una tabla y el gráfico del peso', async () => {
    api({ medidas: [
      { fecha: '2026-11-01', peso_kg: 82, cintura: 92, pecho: null, brazo: null, pierna: null, grasa_pct: null },
      { fecha: '2026-11-25', peso_kg: 80, cintura: 90, pecho: null, brazo: null, pierna: null, grasa_pct: null },
    ] })
    verApp('/progreso?tab=medidas')
    expect(await screen.findByRole('img', { name: /Peso corporal/ })).toBeInTheDocument()
    const tabla = screen.getByRole('table', { name: 'Medidas guardadas' })
    expect(within(tabla).getAllByRole('row')).toHaveLength(3)
    await userEvent.click(screen.getByRole('button', { name: 'Cintura' }))
    expect(await screen.findByRole('img', { name: /Cintura/ })).toBeInTheDocument()
  })

  it('borra una medida con confirmación', async () => {
    const { llamadas } = api({ medidas: [{ fecha: '2026-11-25', peso_kg: 80, cintura: null, pecho: null, brazo: null, pierna: null, grasa_pct: null }] })
    verApp('/progreso?tab=medidas')
    await userEvent.click(await screen.findByRole('button', { name: 'Eliminar medida del 25 nov' }))
    await userEvent.click(within(await screen.findByRole('dialog')).getByRole('button', { name: 'Eliminar' }))
    await waitFor(() => expect(llamadas.some(l => l.metodo === 'DELETE' && l.ruta === '/api/medidas/2026-11-25')).toBe(true))
  })
})

describe('Progreso: Calculadora', () => {
  it('muestra IMC, calorías y macros del perfil guardado', async () => {
    api({ perfil: PERFIL_LLENO })
    verApp('/progreso?tab=calculadora')
    const res = await screen.findByRole('region', { name: 'Resultados' })
    expect(within(res).getByText('24,4')).toBeInTheDocument()
    expect(within(res).getByText('Peso normal')).toBeInTheDocument()
    expect(within(res).getByText(/2\.744/)).toBeInTheDocument()
    expect(within(res).getByText(/2\.195/)).toBeInTheDocument()
    expect(within(res).getByText(/158 g/)).toBeInTheDocument()
    expect(screen.getByLabelText('Altura (cm)')).toHaveValue('180')
  })

  it('sin peso cargado pide registrarlo en Medidas', async () => {
    api({ perfil: { ...PERFIL_LLENO, peso_kg: null, fecha_peso: null, calculos: null } as unknown as typeof PERFIL_LLENO })
    verApp('/progreso?tab=calculadora')
    expect(await screen.findByText(/cargá tu peso/i)).toBeInTheDocument()
  })

  it('guarda el perfil al calcular', async () => {
    const { llamadas } = api()
    verApp('/progreso?tab=calculadora')
    await userEvent.type(await screen.findByLabelText('Altura (cm)'), '180')
    await userEvent.type(screen.getByLabelText('Edad (años)'), '30')
    await userEvent.selectOptions(screen.getByLabelText('Sexo'), 'hombre')
    await userEvent.selectOptions(screen.getByLabelText('Actividad física'), 'moderado')
    await userEvent.selectOptions(screen.getByLabelText('Objetivo'), 'bajar')
    await userEvent.click(screen.getByRole('button', { name: 'Calcular y guardar' }))
    await waitFor(() => expect(llamadas.some(l => l.metodo === 'PUT' && l.ruta === '/api/perfil')).toBe(true))
    expect(llamadas.find(l => l.metodo === 'PUT')!.body).toEqual({ altura_cm: 180, edad: 30, sexo: 'hombre', actividad: 'moderado', objetivo: 'bajar' })
    expect(await screen.findByRole('region', { name: 'Resultados' })).toBeInTheDocument()
  })
})
