import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { ej, FILTROS, instalarApi, verApp } from '../test/utils'

const TODOS = Array.from({ length: 30 }, (_, i) => ej(`E${String(i).padStart(2, '0')}`))

function api() {
  return instalarApi((metodo, url, body) => {
    if (metodo === 'GET' && url.pathname === '/api/ejercicios/filtros') return FILTROS
    if (metodo === 'GET' && url.pathname === '/api/ejercicios') {
      const limit = Number(url.searchParams.get('limit') ?? 50)
      const offset = Number(url.searchParams.get('offset') ?? 0)
      const q = url.searchParams.get('q')
      const base = q ? TODOS.filter(e => e.nombre.includes(q)) : TODOS
      return { total: base.length, limit, offset, items: base.slice(offset, offset + limit) }
    }
    if (metodo === 'PATCH' && url.pathname.startsWith('/api/ejercicios/')) return { ...TODOS[0], ...(body as object) }
    if (url.pathname === '/api/rutinas') return []
    return undefined
  })
}

describe('página Ejercicios', () => {
  it('lista las tarjetas con nombre, músculo y equipo, y la cantidad de resultados', async () => {
    api()
    verApp('/ejercicios')
    expect(await screen.findByText('Ejercicio E00')).toBeInTheDocument()
    expect(screen.getByText('30 ejercicios')).toBeInTheDocument()
    const tarjeta = screen.getByText('Ejercicio E00').closest('article')!
    expect(within(tarjeta).getByText('Pecho')).toBeInTheDocument()
    expect(within(tarjeta).getByText('Barra')).toBeInTheDocument()
    expect(within(tarjeta).getByRole('link')).toHaveAttribute('href', '/ejercicios/E00')
  })

  it('pagina con "Ver más"', async () => {
    const { llamadas } = api()
    verApp('/ejercicios')
    await screen.findByText('Ejercicio E00')
    expect(screen.queryByText('Ejercicio E24')).not.toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'Ver más' }))
    expect(await screen.findByText('Ejercicio E29')).toBeInTheDocument()
    expect(llamadas.some(l => l.ruta.includes('offset=24'))).toBe(true)
    expect(screen.queryByRole('button', { name: 'Ver más' })).not.toBeInTheDocument()
  })

  it('busca con retardo y manda el texto al servidor', async () => {
    const { llamadas } = api()
    verApp('/ejercicios')
    await screen.findByText('Ejercicio E00')
    await userEvent.type(screen.getByRole('searchbox', { name: 'Buscar ejercicio' }), 'E07')
    await waitFor(() => expect(llamadas.some(l => l.ruta.includes('q=E07'))).toBe(true))
    expect(llamadas.some(l => l.ruta.includes('q=E0&') || l.ruta.endsWith('q=E0'))).toBe(false)
    expect(await screen.findByText('1 ejercicio')).toBeInTheDocument()
  })

  it('filtra por músculo (chip), equipo, nivel y categoría', async () => {
    const { llamadas } = api()
    verApp('/ejercicios')
    await screen.findByText('Ejercicio E00')
    await userEvent.click(await screen.findByRole('button', { name: 'Cuádriceps' }))
    await waitFor(() => expect(llamadas.some(l => l.ruta.includes('musculo=Cu%C3%A1driceps'))).toBe(true))
    await userEvent.selectOptions(screen.getByLabelText('Equipo'), 'Mancuernas')
    await waitFor(() => expect(llamadas.some(l => l.ruta.includes('equipo=Mancuernas'))).toBe(true))
    await userEvent.selectOptions(screen.getByLabelText('Nivel'), 'Intermedio')
    await userEvent.selectOptions(screen.getByLabelText('Categoría'), 'Fuerza')
    await waitFor(() => expect(llamadas.some(l => l.ruta.includes('nivel=Intermedio') && l.ruta.includes('categoria=Fuerza'))).toBe(true))
    await userEvent.click(screen.getByRole('button', { name: 'Limpiar filtros' }))
    expect(screen.getByLabelText('Equipo')).toHaveValue('')
  })

  it('el chip de favoritos pide solo favoritos', async () => {
    const { llamadas } = api()
    verApp('/ejercicios')
    await screen.findByText('Ejercicio E00')
    await userEvent.click(screen.getByRole('button', { name: 'Solo favoritos' }))
    await waitFor(() => expect(llamadas.some(l => l.ruta.includes('favoritos=1'))).toBe(true))
  })

  it('marca un favorito desde la tarjeta', async () => {
    const { llamadas } = api()
    verApp('/ejercicios')
    await screen.findByText('Ejercicio E00')
    const tarjeta = screen.getByText('Ejercicio E00').closest('article')!
    await userEvent.click(within(tarjeta).getByRole('button', { name: 'Marcar como favorito' }))
    await waitFor(() => expect(llamadas.some(l => l.metodo === 'PATCH' && l.ruta === '/api/ejercicios/E00'
      && (l.body as { favorito: boolean }).favorito === true)).toBe(true))
  })

  it('avisa cuando no hay resultados', async () => {
    instalarApi((_m, url) => {
      if (url.pathname === '/api/ejercicios/filtros') return FILTROS
      if (url.pathname === '/api/ejercicios') return { total: 0, limit: 24, offset: 0, items: [] }
      return undefined
    })
    verApp('/ejercicios?q=zzz')
    expect(await screen.findByText('No encontramos ejercicios con esos filtros.')).toBeInTheDocument()
  })

  it('lee los filtros de la dirección', async () => {
    const { llamadas } = api()
    verApp('/ejercicios?musculo=Pecho&favoritos=1')
    await screen.findByText('Ejercicio E00')
    expect(llamadas.find(l => l.ruta.startsWith('/api/ejercicios?'))!.ruta).toContain('musculo=Pecho')
  })
})
