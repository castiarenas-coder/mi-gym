import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { ej, instalarApi, verApp } from '../test/utils'

const DETALLE = {
  ...ej('Sentadilla', { nombre: 'Sentadilla con barra', nombre_en: 'Barbell Squat', musculos_sec: ['Glúteos', 'Isquiotibiales'], nivel: 'Intermedio' }),
  fuerza: 'Empuje', mecanica: 'Compuesto', instrucciones: ['Párate con la barra.', 'Bajá en sentadilla.'],
}

const RUTINAS = [
  { id: 1, nombre: 'Full body', descripcion: '', total_ejercicios: 3, dias: [{ id: 10, nombre: 'Día A', orden: 0, cantidad: 2 }, { id: 11, nombre: 'Día B', orden: 1, cantidad: 1 }] },
]

function api(detalle: object = DETALLE) {
  return instalarApi((metodo, url, body) => {
    if (url.pathname === '/api/ejercicios/Sentadilla') {
      if (metodo === 'GET') return detalle
      if (metodo === 'PATCH') return { ...detalle, ...(body as object) }
      if (metodo === 'DELETE') return undefined
    }
    if (url.pathname === '/api/ejercicios/Sentadilla/media' && metodo === 'DELETE') return { ...detalle, media_propia: null }
    if (url.pathname === '/api/ejercicios/Sentadilla/media' && metodo === 'POST') return { ...detalle, media_propia: '/media/Sentadilla.gif?v=1' }
    if (url.pathname === '/api/rutinas' && metodo === 'GET') return RUTINAS
    if (url.pathname === '/api/rutinas/1/dias/11/ejercicios' && metodo === 'POST') return { id: 99, ejercicio_id: 'Sentadilla' }
    return undefined
  })
}

describe('ficha de ejercicio', () => {
  it('muestra nombre, nombre en inglés, datos y músculos', async () => {
    api()
    verApp('/ejercicios/Sentadilla')
    expect(await screen.findByRole('heading', { name: 'Sentadilla con barra' })).toBeInTheDocument()
    expect(screen.getByText('Barbell Squat')).toBeInTheDocument()
    expect(screen.getByText('Intermedio')).toBeInTheDocument()
    expect(screen.getByText('Glúteos')).toBeInTheDocument()
    expect(screen.getByText('Isquiotibiales')).toBeInTheDocument()
    expect(screen.getByText('Compuesto')).toBeInTheDocument()
  })

  it('muestra las instrucciones como pasos numerados', async () => {
    api()
    verApp('/ejercicios/Sentadilla')
    const lista = await screen.findByRole('list', { name: 'Instrucciones' })
    const pasos = within(lista).getAllByRole('listitem')
    expect(pasos).toHaveLength(2)
    expect(pasos[0]).toHaveTextContent('Párate con la barra.')
    expect(screen.queryByText(/pendientes de traducción/)).not.toBeInTheDocument()
  })

  it('avisa si las instrucciones están sin traducir', async () => {
    api({ ...DETALLE, traducido: 0, instrucciones: ['Stand up.'] })
    verApp('/ejercicios/Sentadilla')
    expect(await screen.findByText('Instrucciones en inglés, pendientes de traducción')).toBeInTheDocument()
    expect(screen.getByText('Stand up.')).toBeInTheDocument()
  })

  it('sin instrucciones no muestra el aviso de traducción pendiente', async () => {
    api({ ...DETALLE, traducido: 0, instrucciones: [] })
    verApp('/ejercicios/Sentadilla')
    expect(await screen.findByText('Sin instrucciones')).toBeInTheDocument()
    expect(screen.queryByText(/pendientes de traducción/)).not.toBeInTheDocument()
  })

  it('alterna el favorito', async () => {
    const { llamadas } = api()
    verApp('/ejercicios/Sentadilla')
    await userEvent.click(await screen.findByRole('button', { name: 'Marcar como favorito' }))
    await waitFor(() => expect(llamadas.some(l => l.metodo === 'PATCH' && (l.body as { favorito: boolean }).favorito === true)).toBe(true))
  })

  it('sube un GIF propio', async () => {
    const { fetch } = api()
    verApp('/ejercicios/Sentadilla')
    await screen.findByRole('heading', { name: 'Sentadilla con barra' })
    const archivo = new File(['gif'], 'mi.gif', { type: 'image/gif' })
    await userEvent.upload(screen.getByLabelText('Subir GIF, video o foto'), archivo)
    await waitFor(() => {
      const llamada = fetch.mock.calls.find(([u, init]) => String(u) === '/api/ejercicios/Sentadilla/media' && init?.method === 'POST')
      expect(llamada).toBeTruthy()
      expect((llamada![1]!.headers as Record<string, string>)['Content-Type']).toBe('image/gif')
    })
  })

  it('rechaza archivos de más de 30 MB sin enviarlos', async () => {
    const { fetch } = api()
    verApp('/ejercicios/Sentadilla')
    await screen.findByRole('heading', { name: 'Sentadilla con barra' })
    const grande = new File(['x'], 'grande.mp4', { type: 'video/mp4' })
    Object.defineProperty(grande, 'size', { value: 31 * 1024 * 1024 })
    await userEvent.upload(screen.getByLabelText('Subir GIF, video o foto'), grande)
    expect(await screen.findByText(/máximo de 30 MB/)).toBeInTheDocument()
    expect(fetch.mock.calls.some(([, init]) => init?.method === 'POST')).toBe(false)
  })

  it('guarda un link de YouTube como media propia', async () => {
    const { llamadas } = api()
    verApp('/ejercicios/Sentadilla')
    await screen.findByRole('heading', { name: 'Sentadilla con barra' })
    await userEvent.type(screen.getByLabelText('Link de YouTube o de un video'), 'https://youtu.be/dQw4w9WgXcQ')
    await userEvent.click(screen.getByRole('button', { name: 'Guardar link' }))
    await waitFor(() => expect(llamadas.some(l => l.metodo === 'PATCH'
      && (l.body as { media_propia: string }).media_propia === 'https://youtu.be/dQw4w9WgXcQ')).toBe(true))
  })

  it('quita la media propia', async () => {
    const { llamadas } = api({ ...DETALLE, media_propia: '/media/Sentadilla.gif?v=1' })
    verApp('/ejercicios/Sentadilla')
    await userEvent.click(await screen.findByRole('button', { name: 'Quitar mi animación' }))
    await waitFor(() => expect(llamadas.some(l => l.metodo === 'DELETE' && l.ruta === '/api/ejercicios/Sentadilla/media')).toBe(true))
  })

  it('muestra un error si el ejercicio no existe', async () => {
    instalarApi(() => undefined)
    verApp('/ejercicios/Nada')
    expect(await screen.findByText('No encontramos ese ejercicio.')).toBeInTheDocument()
  })
})
