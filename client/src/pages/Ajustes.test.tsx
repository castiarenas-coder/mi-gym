import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { instalarApi, verApp } from '../test/utils'

const INFO = {
  version: '0.1.0', schema_version: 4, db: 'C:\\Mi_Gym\\data\\mi_gym.db', respaldos_dir: 'C:\\Mi_Gym\\backups',
  ultimo_respaldo: '2026-11-25T12:00:00.000Z', lan: false, urls: [] as string[], qr: null as string | null,
}
const LISTA = [{ archivo: 'mi_gym-20261125-1200.db', fecha: '2026-11-25T12:00:00.000Z', tamano: 2048 }]

const SIN_NUEVA = { actual: '0.1.0', ultima: '0.1.0', hay_nueva: false, url: null as string | null }

function api(info: Record<string, unknown> = INFO, actualizacion: typeof SIN_NUEVA = SIN_NUEVA) {
  return instalarApi((metodo, url) => {
    if (url.pathname === '/api/info') return info
    if (url.pathname === '/api/actualizacion') return actualizacion
    if (url.pathname === '/api/apagar' && metodo === 'POST') return { ok: true }
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
    expect(await screen.findByRole('link', { name: 'Ajustes' })).toHaveAttribute('href', '/ajustes')
  })

  it('muestra dónde viven los datos y los respaldos', async () => {
    api()
    verApp('/ajustes')
    expect(await screen.findByText('C:\\Mi_Gym\\data\\mi_gym.db')).toBeInTheDocument()
    const lista = await screen.findByRole('list', { name: 'Respaldos' })
    expect(within(lista).getByText(/mi_gym-20261125-1200\.db/)).toBeInTheDocument()
  })

  it('muestra cómo donar: alias de Mercado Pago copiable y link de PayPal', async () => {
    const user = userEvent.setup()
    api()
    verApp('/ajustes')
    const bloque = await screen.findByRole('region', { name: 'Donaciones' })
    expect(within(bloque).getByText('gabycasti822.mp')).toBeInTheDocument()
    await user.click(within(bloque).getByRole('button', { name: /Copiar alias/ }))
    expect(await navigator.clipboard.readText()).toBe('gabycasti822.mp')
    expect(await within(bloque).findByText('Alias copiado')).toBeInTheDocument()
    const paypal = within(bloque).getByRole('link', { name: /PayPal/ })
    expect(paypal).toHaveAttribute('href', 'https://www.paypal.com/donate/?hosted_button_id=6G237RH4W2GRQ')
    expect(paypal).toHaveAttribute('target', '_blank')
    expect(paypal).toHaveAttribute('rel', expect.stringContaining('noopener'))
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

  it('en Android no muestra "Abrir en el celular" ni "Cerrar Mi Gym" y habla de "este celular"', async () => {
    api({ ...INFO, plataforma: 'android', apagable: true })
    verApp('/ajustes')
    await screen.findByText(/versión 0\.1\.0/)
    expect(screen.queryByRole('region', { name: 'Abrir en el celular' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /Cerrar Mi Gym/ })).not.toBeInTheDocument()
    expect(screen.getByText(/Todo se guarda en este celular/)).toBeInTheDocument()
    expect(screen.queryByText(/otra PC/)).not.toBeInTheDocument()
  })

  it('en PC sigue mostrando "Abrir en el celular" y "esta PC"', async () => {
    api({ ...INFO, plataforma: 'escritorio' })
    verApp('/ajustes')
    expect(await screen.findByRole('region', { name: 'Abrir en el celular' })).toBeInTheDocument()
    expect(screen.getByText(/Todo se guarda en esta PC/)).toBeInTheDocument()
  })

  it('muestra la versión y los créditos', async () => {
    api()
    verApp('/ajustes')
    expect(await screen.findByText(/versión 0\.1\.0/)).toBeInTheDocument()
    expect(screen.getByText(/free-exercise-db/)).toBeInTheDocument()
    expect(screen.getByText(/doubtcrack\/Fitness/)).toBeInTheDocument()
  })

  it('avisa cuando hay una versión nueva, con link para descargarla', async () => {
    api(INFO, { actual: '0.1.0', ultima: '0.2.0', hay_nueva: true, url: 'https://github.com/castiarenas-coder/mi-gym/releases/tag/v0.2.0' })
    verApp('/ajustes')
    expect(await screen.findByText(/Hay una versión nueva: v0\.2\.0/)).toBeInTheDocument()
    const link = screen.getByRole('link', { name: /Descargar/ })
    expect(link).toHaveAttribute('href', 'https://github.com/castiarenas-coder/mi-gym/releases/tag/v0.2.0')
    expect(link).toHaveAttribute('target', '_blank')
  })

  it('no muestra el aviso si ya tenés la última versión', async () => {
    const { llamadas } = api()
    verApp('/ajustes')
    await screen.findByText(/versión 0\.1\.0/)
    await waitFor(() => expect(llamadas.some(l => l.ruta === '/api/actualizacion')).toBe(true))
    expect(screen.queryByText(/Hay una versión nueva/)).not.toBeInTheDocument()
  })

  it('"Cerrar Mi Gym" solo aparece en la versión instalada y pide confirmación', async () => {
    api()
    const { unmount } = verApp('/ajustes')
    await screen.findByText(/versión 0\.1\.0/)
    expect(screen.queryByRole('button', { name: /Cerrar Mi Gym/ })).not.toBeInTheDocument()
    unmount()

    const { llamadas } = api({ ...INFO, apagable: true })
    verApp('/ajustes')
    await userEvent.click(await screen.findByRole('button', { name: /Cerrar Mi Gym/ }))
    const dialogo = await screen.findByRole('dialog')
    expect(llamadas.some(l => l.ruta === '/api/apagar')).toBe(false)
    await userEvent.click(within(dialogo).getByRole('button', { name: 'Cerrar' }))
    await waitFor(() => expect(llamadas.some(l => l.metodo === 'POST' && l.ruta === '/api/apagar')).toBe(true))
    expect(await screen.findByText(/Mi Gym se cerró/)).toBeInTheDocument()
  })

  it('Apariencia ofrece tema y acentos, y elegir Claro lo aplica y lo guarda', async () => {
    localStorage.clear()
    api()
    verApp('/ajustes')
    const bloque = await screen.findByRole('region', { name: 'Apariencia' })
    for (const n of ['Sistema', 'Oscuro', 'Claro']) expect(within(bloque).getByRole('radio', { name: n })).toBeInTheDocument()
    expect(within(bloque).getByRole('radio', { name: 'Oscuro' })).toBeChecked()
    expect(within(bloque).getAllByRole('radio', { name: /^Acento / })).toHaveLength(6)
    await userEvent.click(within(bloque).getByRole('radio', { name: 'Claro' }))
    expect(document.documentElement.dataset.tema).toBe('claro')
    expect(JSON.parse(localStorage.getItem('mi-gym:apariencia')!).tema).toBe('claro')
    await userEvent.click(within(bloque).getByRole('radio', { name: 'Acento Cian' }))
    expect(document.documentElement.style.getPropertyValue('--acento')).toBe('#22d3ee')
    expect(JSON.parse(localStorage.getItem('mi-gym:apariencia')!).acento).toBe('cian')
  })
})
