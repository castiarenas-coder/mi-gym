import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { GraficoBarras } from './GraficoBarras'
import { GraficoLinea } from './GraficoLinea'

const puntos = [
  { fecha: '2026-11-01', valor: 80 },
  { fecha: '2026-11-10', valor: 79 },
  { fecha: '2026-11-25', valor: 78.5 },
]

describe('GraficoLinea', () => {
  it('con menos de dos registros muestra el estado vacío', () => {
    render(<GraficoLinea titulo="Peso corporal" puntos={[puntos[0]]} unidad="kg" />)
    expect(screen.getByText(/Necesitás al menos 2 registros/)).toBeInTheDocument()
    expect(screen.queryByRole('img')).not.toBeInTheDocument()
  })

  it('dibuja un gráfico accesible con un punto por registro y ejes en español', () => {
    render(<GraficoLinea titulo="Peso corporal" puntos={puntos} unidad="kg" />)
    expect(screen.getByRole('img', { name: /Peso corporal/ })).toBeInTheDocument()
    expect(screen.getAllByRole('button', { name: /kg$/ })).toHaveLength(3)
    expect(screen.getByRole('button', { name: '25 nov: 78,5 kg' })).toBeInTheDocument()
    expect(screen.getByText('1 nov')).toBeInTheDocument()
  })

  it('muestra el valor al enfocar o tocar un punto', async () => {
    render(<GraficoLinea titulo="Peso corporal" puntos={puntos} unidad="kg" />)
    expect(screen.queryByRole('tooltip')).not.toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: '10 nov: 79 kg' }))
    expect(screen.getByRole('tooltip')).toHaveTextContent('10 nov')
    expect(screen.getByRole('tooltip')).toHaveTextContent('79 kg')
  })
})

describe('GraficoBarras', () => {
  const datos = [
    { etiqueta: '9 nov', valor: 2, detalle: 'Semana del 9 nov: 2 entrenamientos' },
    { etiqueta: '16 nov', valor: 0, detalle: 'Semana del 16 nov: 0 entrenamientos' },
    { etiqueta: '23 nov', valor: 3, detalle: 'Semana del 23 nov: 3 entrenamientos' },
  ]

  it('dibuja una barra por dato con su descripción', () => {
    render(<GraficoBarras titulo="Entrenamientos por semana" datos={datos} />)
    expect(screen.getByRole('img', { name: /Entrenamientos por semana/ })).toBeInTheDocument()
    expect(screen.getAllByRole('button')).toHaveLength(3)
    expect(screen.getByRole('button', { name: 'Semana del 23 nov: 3 entrenamientos' })).toBeInTheDocument()
  })

  it('muestra el detalle al tocar una barra', async () => {
    render(<GraficoBarras titulo="Entrenamientos por semana" datos={datos} />)
    await userEvent.click(screen.getByRole('button', { name: 'Semana del 9 nov: 2 entrenamientos' }))
    expect(screen.getByRole('tooltip')).toHaveTextContent('Semana del 9 nov: 2 entrenamientos')
  })

  it('sin datos o todo en cero explica que falta información', () => {
    render(<GraficoBarras titulo="Volumen" datos={datos.map(d => ({ ...d, valor: 0 }))} vacio="Todavía no hay entrenamientos." />)
    expect(screen.getByText('Todavía no hay entrenamientos.')).toBeInTheDocument()
  })
})
