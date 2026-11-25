import { screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { PERSONA_ANA, PERSONA_YO, instalarApi, verApp } from '../test/utils'

function api(personas = [PERSONA_YO, PERSONA_ANA]) {
  const lista = [...personas]
  return instalarApi((metodo, url, body) => {
    const p = url.pathname
    if (p === '/api/personas' && metodo === 'GET') return lista
    if (p === '/api/personas' && metodo === 'POST') return { id: 5, color: '#4dc3ff', avatar: '', creada: 'x', ...(body as object) }
    const m = /^\/api\/personas\/(\d+)$/.exec(p)
    if (m && metodo === 'PATCH') return { ...lista.find(x => x.id === Number(m[1])), ...(body as object) }
    if (m && metodo === 'DELETE') { lista.splice(lista.findIndex(x => x.id === Number(m[1])), 1); return { ok: true } }
    if (p === '/api/info') return { version: '1.0.0', schema_version: 5, db: null, respaldos_dir: null, ultimo_respaldo: null, lan: false, urls: [], qr: null }
    if (p === '/api/respaldo/lista') return []
    return undefined
  })
}

async function irAAjustes() {
  localStorage.setItem('mi-gym.persona', '1')
  verApp('/ajustes')
  return within(await screen.findByRole('region', { name: 'Personas' }))
}

describe('Ajustes: personas', () => {
  it('lista a las personas y permite agregar una', async () => {
    const { llamadas } = api()
    const seccion = await irAAjustes()
    expect(seccion.getByText('Yo')).toBeInTheDocument()
    expect(seccion.getByText('Ana')).toBeInTheDocument()
    await userEvent.click(seccion.getByRole('button', { name: 'Agregar persona' }))
    const form = screen.getByRole('form', { name: 'Nueva persona' })
    await userEvent.type(within(form).getByLabelText('Nombre'), 'Leo')
    await userEvent.click(within(form).getByRole('button', { name: 'Crear persona' }))
    await screen.findByRole('region', { name: 'Personas' })
    expect(llamadas.find(l => l.metodo === 'POST' && l.ruta === '/api/personas')?.body).toMatchObject({ nombre: 'Leo' })
  })

  it('renombra y cambia el color y el avatar', async () => {
    const { llamadas } = api()
    const seccion = await irAAjustes()
    await userEvent.click(seccion.getByRole('button', { name: 'Editar Ana' }))
    const form = screen.getByRole('form', { name: 'Editar persona' })
    const nombre = within(form).getByLabelText('Nombre')
    await userEvent.clear(nombre)
    await userEvent.type(nombre, 'Anita')
    await userEvent.click(within(form).getByRole('radio', { name: 'Color #4dc3ff' }))
    await userEvent.click(within(form).getByRole('radio', { name: 'Avatar 🔥' }))
    await userEvent.click(within(form).getByRole('button', { name: 'Guardar' }))
    await screen.findByRole('region', { name: 'Personas' })
    const patch = llamadas.find(l => l.metodo === 'PATCH' && l.ruta === '/api/personas/2')
    expect(patch?.body).toEqual({ nombre: 'Anita', color: '#4dc3ff', avatar: '🔥' })
  })

  it('borrar pide confirmar, avisa que se pierden sus datos y sugiere exportar', async () => {
    const { llamadas } = api()
    const seccion = await irAAjustes()
    await userEvent.click(seccion.getByRole('button', { name: 'Borrar Ana' }))
    const dialogo = within(screen.getByRole('dialog'))
    expect(dialogo.getByText(/rutinas, entrenamientos, medidas y favoritos de Ana/)).toBeInTheDocument()
    expect(dialogo.getByText(/exportar/i)).toBeInTheDocument()
    expect(llamadas.some(l => l.metodo === 'DELETE')).toBe(false)
    await userEvent.click(dialogo.getByRole('button', { name: 'Borrar' }))
    await screen.findByRole('region', { name: 'Personas' })
    expect(llamadas.some(l => l.metodo === 'DELETE' && l.ruta === '/api/personas/2')).toBe(true)
  })

  it('no deja borrar a la última persona', async () => {
    api([PERSONA_YO])
    const seccion = await irAAjustes()
    expect(seccion.getByRole('button', { name: 'Borrar Yo' })).toBeDisabled()
  })
})
