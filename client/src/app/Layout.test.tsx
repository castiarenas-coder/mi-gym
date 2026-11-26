import { screen, within } from '@testing-library/react'
import { NOMBRE_APP } from '../lib/marca'
import { PERSONA_YO, instalarApi, verApp } from '../test/utils'
import { SECCIONES } from './rutas'

function api() {
  return instalarApi((metodo, url) => {
    const p = url.pathname
    if (p === '/api/personas' && metodo === 'GET') return [PERSONA_YO]
    if (p === '/api/progreso/resumen') return { semanas: [], esta_semana: { sesiones: 0, volumen_kg: 0 }, racha: { actual: 0, mejor: 0 }, total_sesiones: 0, volumen_total_kg: 0, records: [], ultima_sesion: null, sesion_activa: null }
    return undefined
  })
}

describe('Layout: navegación', () => {
  it('tiene una sola navegación Secciones con los enlaces de cada sección', async () => {
    api()
    verApp('/')
    const nav = await screen.findByRole('navigation', { name: 'Secciones' })
    expect(screen.getAllByRole('navigation', { name: 'Secciones' })).toHaveLength(1)
    const enlaces = within(nav).getAllByRole('link')
    expect(enlaces.map(a => a.textContent)).toEqual(SECCIONES.map(s => s.etiqueta))
  })

  it('ofrece cambiar de persona y ajustes', async () => {
    api()
    verApp('/')
    expect(await screen.findByRole('button', { name: `Cambiar de persona (${PERSONA_YO.nombre})` })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Ajustes' })).toBeInTheDocument()
  })

  it('el nombre de la app aparece una sola vez', async () => {
    api()
    verApp('/')
    await screen.findByRole('navigation', { name: 'Secciones' })
    expect(within(screen.getByRole('banner')).getAllByText(NOMBRE_APP)).toHaveLength(1)
    expect(document.querySelectorAll('.marca__nombre')).toHaveLength(1)
  })
})
