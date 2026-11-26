import { screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { conProveedores, instalarApi } from '../test/utils'
import { FranjaSemanal } from './FranjaSemanal'

const HOY = new Date(2026, 10, 25, 12)
function api(fechas: string[]) {
  instalarApi((_m, url) => (url.pathname === '/api/sesiones' ? { items: fechas.map((fecha, id) => ({ id, fecha })), total: fechas.length } : undefined))
}

describe('FranjaSemanal', () => {
  it('cuenta los días entrenados', async () => {
    api([new Date(2026, 10, 23, 10).toISOString(), new Date(2026, 10, 25, 9).toISOString()])
    conProveedores(<FranjaSemanal hoy={HOY} />)
    expect(await screen.findByText('2 días esta semana')).toBeInTheDocument()
  })
  it('singular con un día', async () => {
    api([new Date(2026, 10, 23, 10).toISOString()])
    conProveedores(<FranjaSemanal hoy={HOY} />)
    expect(await screen.findByText('1 día esta semana')).toBeInTheDocument()
  })
  it('hoy sin entrenar tiene borde punteado', async () => {
    api([])
    conProveedores(<FranjaSemanal hoy={HOY} />)
    expect(await screen.findByText('0 días esta semana')).toBeInTheDocument()
    expect(screen.getByLabelText('miércoles')).toHaveClass('franja__dia--hoy')
  })
})
