import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { instalarApi, verApp } from '../test/utils'

const INFO = {
  version: '0.1.0', schema_version: 4, db: 'D:\\apps\\Mi_Gym\\data\\mi_gym.db', respaldos_dir: 'D:\\apps\\Mi_Gym\\backups',
  ultimo_respaldo: '2026-11-25T12:00:00.000Z', lan: false, urls: [] as string[], qr: null as string | null,
}
const LISTA = [{ archivo: 'mi_gym-20261125-1200.db', fecha: '2026-11-25T12:00:00.000Z', tamano: 2048 }]

function api(info: typeof INFO = INFO) {
  return instalarApi((metodo, url) => {
    if (url.pathname === '/api/info') return info
    if (url.pathname === '/api/respaldo/lista') return LISTA
    if (url.pathname === '/api/respaldo/ahora' && metodo === 'POST') return { archivo: 'mi_gym-20261125-1300.db' }
    if (url.pathname === '/api/respaldo/restaurar' && metodo === 'POST') return { ok: true }
    if (url.pathname === '/api/respaldo/importar' && metodo === 'POST') return { ok: true }
    return undefined
  })
}

describe('página Ajustes', () => {
  it('es accesible desde el engranaje de la cabecera', async () => {
    api()
    verApp('/')
    expect(screen.getByRole('link', { name: 'Ajustes' })).toHaveAttribute('href', '/ajustes')
  })

  it('muestra dónde viven los datos y los respaldos', async () => {
    api()
    verApp('/ajustes')
    expect(await screen.findByText('D:\\apps\\Mi_Gym\\data\\mi_gym.db')).toBeInTheDocument()
    const lista = await screen.findByRole('list', { name: 'Respaldos' })
    expect(within(lista).getByText(/mi_gym-20261125-1200\.db/)).toBeInTheDocument()
  })

  it('hace un backup ahora', async () => {
    const { llamadas } = api()
    verApp('/ajustes')
    await userEvent.click(await screen.findByRole('button', { name: /Hacer backup ahora/ }))
    await waitFor(() => expect(llamadas.some(l => l.metodo === 'POST' && l.ruta === '/api/respaldo/ahora')).toBe(true))
    expect(await screen.findByText('Respaldo guardado.')).toBeInTheDocument()
  })

  it('restaurar pide confirmación y avisa del respaldo de seguridad', async () => {
    const { llamadas } = api()
    verApp('/ajustes')
    await userEvent.click(await screen.findByRole('button', { name: 'Restaurar mi_gym-20261125-1200.db' }))
    const dialogo = await screen.findByRole('dialog')
    expect(within(dialogo).getByText(/guardamos un respaldo de lo que tenés ahora/)).toBeInTheDocument()
    expect(llamadas.some(l => l.ruta === '/api/respaldo/restaurar')).toBe(false)
    await userEvent.click(within(dialogo).getByRole('button', { name: 'Restaurar' }))
    await waitFor(() => expect(llamadas.find(l => l.ruta === '/api/respaldo/restaurar')?.body).toEqual({ archivo: 'mi_gym-20261125-1200.db' }))
    expect(await screen.findByText('Respaldo restaurado.')).toBeInTheDocument()
  })

  it('importar un archivo pide confirmación y lo envía', async () => {
    const { llamadas } = api()
    verApp('/ajustes')
    const datos = { app: 'mi-gym', schema_version: 4 }
    await userEvent.upload(await screen.findByLabelText('Archivo para importar'), new File([JSON.stringify(datos)], 'mi-gym.json', { type: 'application/json' }))
    const dialogo = await screen.findByRole('dialog')
    await userEvent.click(within(dialogo).getByRole('button', { name: 'Importar' }))
    await waitFor(() => expect(llamadas.find(l => l.ruta === '/api/respaldo/importar')?.body).toEqual(datos))
    expect(await screen.findByText('Datos importados.')).toBeInTheDocument()
  })

  it('rechaza un archivo que no es de Mi Gym', async () => {
    api()
    verApp('/ajustes')
    await userEvent.upload(await screen.findByLabelText('Archivo para importar'), new File(['{"hola":1}'], 'otro.json', { type: 'application/json' }))
    expect(await screen.findByText('Ese archivo no es un respaldo de Mi Gym.')).toBeInTheDocument()
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })

  it('sin --lan explica cómo arrancar para el celular', async () => {
    api()
    verApp('/ajustes')
    expect(await screen.findByText(/npm run lan/)).toBeInTheDocument()
    expect(screen.queryByRole('img', { name: /Código QR/ })).not.toBeInTheDocument()
  })

  it('con --lan muestra la dirección y el QR', async () => {
    api({ ...INFO, lan: true, urls: ['http://192.168.1.50:8788'], qr: '<svg xmlns="http://www.w3.org/2000/svg"></svg>' })
    verApp('/ajustes')
    expect(await screen.findByText('http://192.168.1.50:8788')).toBeInTheDocument()
    expect(screen.getByRole('img', { name: /Código QR/ })).toBeInTheDocument()
  })

  it('muestra la versión y los créditos', async () => {
    api()
    verApp('/ajustes')
    expect(await screen.findByText(/versión 0\.1\.0/)).toBeInTheDocument()
    expect(screen.getByText(/free-exercise-db/)).toBeInTheDocument()
    expect(screen.getByText(/doubtcrack\/Fitness/)).toBeInTheDocument()
  })
})
