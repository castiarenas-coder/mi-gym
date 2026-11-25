import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { PERSONA_ANA, PERSONA_YO, instalarApi, verApp } from '../test/utils'

const RESUMEN = { semanas: [], esta_semana: { sesiones: 0, volumen_kg: 0 }, racha: { actual: 0, mejor: 0 }, total_sesiones: 0, volumen_total_kg: 0, records: [], ultima_sesion: null, sesion_activa: null }

function api(personas = [PERSONA_YO, PERSONA_ANA]) {
  const lista = [...personas]
  return instalarApi((metodo, url, body) => {
    const p = url.pathname
    if (p === '/api/personas' && metodo === 'GET') return lista
    if (p === '/api/personas' && metodo === 'POST') {
      const nueva = { id: 9, color: '#4dc3ff', avatar: '', creada: '2026-02-01T00:00:00.000Z', ...(body as object) } as typeof PERSONA_YO
      lista.push(nueva)
      return nueva
    }
    if (p === '/api/progreso/resumen') return RESUMEN
    if (p === '/api/ejercicios') return { total: 0, limit: 1, offset: 0, items: [] }
    return undefined
  })
}

describe('Personas: quién entrena', () => {
  it('con una sola persona entra directo, sin pantalla de elección', async () => {
    const { llamadas } = api([PERSONA_YO])
    verApp('/')
    expect(await screen.findByRole('link', { name: 'Ajustes' })).toBeInTheDocument()
    expect(screen.queryByRole('heading', { name: '¿Quién entrena?' })).not.toBeInTheDocument()
    await waitFor(() => expect(llamadas.some(l => l.ruta === '/api/progreso/resumen')).toBe(true))
    expect(llamadas.find(l => l.ruta === '/api/progreso/resumen')?.persona).toBe('1')
  })

  it('con varias y ninguna elegida pregunta quién entrena, y manda la elegida en cada pedido', async () => {
    const { llamadas } = api()
    verApp('/')
    expect(await screen.findByRole('heading', { name: '¿Quién entrena?' })).toBeInTheDocument()
    expect(llamadas.some(l => l.ruta === '/api/progreso/resumen')).toBe(false)
    await userEvent.click(screen.getByRole('button', { name: 'Ana' }))
    expect(await screen.findByRole('button', { name: 'Cambiar de persona (Ana)' })).toBeInTheDocument()
    expect(localStorage.getItem('mi-gym.persona')).toBe('2')
    await waitFor(() => expect(llamadas.some(l => l.ruta === '/api/progreso/resumen')).toBe(true))
    expect(llamadas.filter(l => l.ruta === '/api/progreso/resumen').every(l => l.persona === '2')).toBe(true)
  })

  it('recuerda la elección y la deja cambiar desde el encabezado, recargando los datos', async () => {
    localStorage.setItem('mi-gym.persona', '2')
    const { llamadas } = api()
    verApp('/')
    await userEvent.click(await screen.findByRole('button', { name: 'Cambiar de persona (Ana)' }))
    expect(await screen.findByRole('heading', { name: '¿Quién entrena?' })).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'Yo' }))
    expect(await screen.findByRole('button', { name: 'Cambiar de persona (Yo)' })).toBeInTheDocument()
    await waitFor(() => expect(llamadas.some(l => l.ruta === '/api/progreso/resumen' && l.persona === '1')).toBe(true))
    expect(localStorage.getItem('mi-gym.persona')).toBe('1')
  })

  it('si la persona guardada ya no existe, vuelve a preguntar', async () => {
    localStorage.setItem('mi-gym.persona', '77')
    api()
    verApp('/')
    expect(await screen.findByRole('heading', { name: '¿Quién entrena?' })).toBeInTheDocument()
  })

  it('permite agregar una persona desde la pantalla de elección y entra con ella', async () => {
    const { llamadas } = api()
    verApp('/')
    await userEvent.click(await screen.findByRole('button', { name: 'Agregar persona' }))
    const form = screen.getByRole('form', { name: 'Nueva persona' })
    await userEvent.type(within(form).getByLabelText('Nombre'), 'Leo')
    await userEvent.click(within(form).getByRole('radio', { name: 'Avatar 🔥' }))
    await userEvent.click(within(form).getByRole('button', { name: 'Crear persona' }))
    expect(await screen.findByRole('button', { name: 'Cambiar de persona (Leo)' })).toBeInTheDocument()
    const post = llamadas.find(l => l.metodo === 'POST' && l.ruta === '/api/personas')
    expect(post?.body).toMatchObject({ nombre: 'Leo', avatar: '🔥' })
    expect(localStorage.getItem('mi-gym.persona')).toBe('9')
  })
})

describe('Personas: datos reemplazados', () => {
  it('si la persona activa ya no existe tras restaurar, no pide datos con ella', async () => {
    localStorage.setItem('mi-gym.persona', '2')
    let restaurado = false
    const { llamadas } = instalarApi((metodo, url) => {
      const p = url.pathname
      if (p === '/api/personas' && metodo === 'GET') return restaurado ? [PERSONA_YO] : [PERSONA_YO, PERSONA_ANA]
      if (p === '/api/respaldo/lista') return [{ archivo: 'mi_gym-20261125-1200.db', fecha: '2026-11-25T12:00:00.000Z', tamano: 2048 }]
      if (p === '/api/respaldo/restaurar' && metodo === 'POST') { restaurado = true; return { ok: true } }
      if (p === '/api/info') return { version: '0.1.0', schema_version: 5, db: null, respaldos_dir: null, ultimo_respaldo: null, lan: false, urls: [], qr: null }
      if (p === '/api/progreso/resumen') return RESUMEN
      if (p === '/api/ejercicios') return { total: 0, limit: 1, offset: 0, items: [] }
      return undefined
    })
    verApp('/ajustes')
    await userEvent.click(await screen.findByRole('button', { name: 'Restaurar mi_gym-20261125-1200.db' }))
    await userEvent.click(within(await screen.findByRole('dialog')).getByRole('button', { name: 'Restaurar' }))
    expect(await screen.findByText('Respaldo restaurado.')).toBeInTheDocument()
    await waitFor(() => expect(localStorage.getItem('mi-gym.persona')).toBe('1'))
    const despues = llamadas.slice(llamadas.findIndex(l => l.ruta === '/api/respaldo/restaurar') + 1)
    expect(despues.filter(l => l.ruta !== '/api/personas' && l.persona === '2')).toEqual([])
  })
})
