import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { vi } from 'vitest'
import { conProveedores, instalarApi } from '../../test/utils'
import { SeccionCuenta } from './SeccionCuenta'
import { haceCuanto } from '../../api/cuenta'
import { ConfirmarDialogo } from '../../components/ConfirmarDialogo'

interface Estado {
  habilitada: boolean
  google: boolean
  sesion: null | { email: string; plan: 'gratis' | 'pro' | null; consentimiento: boolean | null }
  vinculado: boolean
  ultimaSincronizacion: string | null
  error: string | null
}
const BASE: Estado = { habilitada: true, google: true, sesion: null, vinculado: false, ultimaSincronizacion: null, error: null }
const PRO = { email: 'ana@correo.com', plan: 'pro' as const, consentimiento: true }

function montar(estado: Partial<Estado>, extra: (m: string, u: URL, b: unknown) => unknown = () => undefined) {
  const api = instalarApi((metodo, url, body) => {
    if (url.pathname === '/api/cuenta' && metodo === 'GET') return { ...BASE, ...estado }
    return extra(metodo, url, body)
  })
  conProveedores(<SeccionCuenta />)
  return api
}

describe('SeccionCuenta', () => {
  afterEach(() => vi.unstubAllGlobals())

  it('con habilitada:false no aparece', async () => {
    const { fetch } = montar({ habilitada: false })
    await waitFor(() => expect(fetch).toHaveBeenCalled())
    await new Promise(r => setTimeout(r, 20))
    expect(screen.queryByRole('region', { name: 'Cuenta' })).not.toBeInTheDocument()
  })

  it('sin sesión muestra mail y Google', async () => {
    montar({})
    expect(await screen.findByText('Iniciar sesión')).toBeInTheDocument()
    expect(screen.getByLabelText('Tu mail')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Continuar con Google' })).toBeInTheDocument()
  })

  it('oculta Google cuando el servidor no lo ofrece', async () => {
    montar({ google: false })
    await screen.findByText('Iniciar sesión')
    expect(screen.queryByRole('button', { name: 'Continuar con Google' })).not.toBeInTheDocument()
  })

  it('Google abre la ruta del servidor en otra ventana', async () => {
    const abrir = vi.fn()
    vi.stubGlobal('open', abrir)
    montar({})
    await userEvent.click(await screen.findByRole('button', { name: 'Continuar con Google' }))
    expect(abrir).toHaveBeenCalledWith('/api/cuenta/google', '_blank')
  })

  it('manda el código y pide los dígitos; después verifica', async () => {
    const { llamadas } = montar({}, (m, u) => {
      if (u.pathname === '/api/cuenta/codigo' && m === 'POST') return { ok: true }
      if (u.pathname === '/api/cuenta/verificar' && m === 'POST') return { ok: true }
    })
    await userEvent.type(await screen.findByLabelText('Tu mail'), 'ana@correo.com')
    await userEvent.click(screen.getByRole('button', { name: 'Enviar código' }))
    expect(llamadas.find(l => l.ruta === '/api/cuenta/codigo')?.body).toEqual({ email: 'ana@correo.com' })
    await userEvent.type(await screen.findByLabelText('Código'), '123456')
    await userEvent.click(screen.getByRole('button', { name: 'Verificar' }))
    await waitFor(() => expect(llamadas.find(l => l.ruta === '/api/cuenta/verificar')?.body).toEqual({ email: 'ana@correo.com', codigo: '123456' }))
  })

  it('muestra el error del servidor tal cual', async () => {
    montar({}, (_m, u) => {
      if (u.pathname === '/api/cuenta/codigo') return new Response(JSON.stringify({ error: 'Demasiados intentos. Esperá un rato.', codigo: 'demasiados_intentos' }), { status: 429 })
    })
    await userEvent.type(await screen.findByLabelText('Tu mail'), 'ana@correo.com')
    await userEvent.click(screen.getByRole('button', { name: 'Enviar código' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('Demasiados intentos. Esperá un rato.')
  })

  it('plan gratis: avisa que la sincronización es Pro', async () => {
    montar({ sesion: { email: 'ana@correo.com', plan: 'gratis', consentimiento: false } })
    expect(await screen.findByText('Sincronización disponible con el plan Pro')).toBeInTheDocument()
  })

  it('sin conexión (plan null) no lo trata como gratis ni pide consentimiento', async () => {
    montar({ sesion: { email: 'ana@correo.com', plan: null, consentimiento: null }, error: 'Sin conexión. Reintentá más tarde.' })
    expect(await screen.findByText('Sin conexión. Reintentá más tarde.')).toBeInTheDocument()
    expect(screen.queryByText('Sincronización disponible con el plan Pro')).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Aceptar' })).not.toBeInTheDocument()
  })

  it('plan pro sin consentimiento: texto de datos de salud y Aceptar', async () => {
    const { llamadas } = montar({ sesion: { ...PRO, consentimiento: false } }, (m, u) => {
      if (u.pathname === '/api/cuenta/consentimiento' && m === 'POST') return { ok: true }
    })
    expect(await screen.findByText(/datos de salud/)).toBeInTheDocument()
    expect(screen.getByText(/Ley 25\.326/)).toBeInTheDocument()
    expect(screen.getByText(/borrar tu cuenta/)).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'Aceptar' }))
    await waitFor(() => expect(llamadas.some(l => l.metodo === 'POST' && l.ruta === '/api/cuenta/consentimiento')).toBe(true))
  })

  it('todo listo: última sincronización relativa y Sincronizar ahora', async () => {
    const hace = new Date(Date.now() - 5 * 60_000).toISOString()
    const { llamadas } = montar({ sesion: PRO, vinculado: true, ultimaSincronizacion: hace }, (m, u) => {
      if (u.pathname === '/api/cuenta/sincronizar' && m === 'POST') return { ok: true, resultado: { subidos: 2, bajados: 1, enEspera: 0, rechazados: 0 }, ultimaSincronizacion: new Date().toISOString(), error: null }
    })
    expect(await screen.findByText('Última sincronización: hace 5 minutos')).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'Sincronizar ahora' }))
    await waitFor(() => expect(llamadas.some(l => l.ruta === '/api/cuenta/sincronizar')).toBe(true))
    expect(await screen.findByText(/Listo/)).toBeInTheDocument()
  })

  it('ambos con datos: pregunta juntar o reemplazar; reemplazar avisa del respaldo', async () => {
    const { llamadas } = montar({ sesion: PRO }, (m, u) => {
      if (u.pathname === '/api/cuenta/vinculo') return { estado: 'ambos_con_datos', vinculado: false, duplicadas: [] }
      if (u.pathname === '/api/cuenta/vincular' && m === 'POST') return { ok: true, ultimaSincronizacion: null }
    })
    expect(await screen.findByText('¿Juntar los datos de este equipo con los de tu cuenta?')).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'Reemplazar' }))
    const dialogo = await screen.findByRole('dialog')
    expect(within(dialogo).getByText(/respaldo/)).toBeInTheDocument()
    expect(llamadas.some(l => l.ruta === '/api/cuenta/vincular')).toBe(false)
    await userEvent.click(within(dialogo).getByRole('button', { name: 'Reemplazar' }))
    await waitFor(() => expect(llamadas.find(l => l.ruta === '/api/cuenta/vincular')?.body).toEqual({ modo: 'reemplazar' }))
  })

  it('juntar ofrece unificar las duplicadas que salen DESPUÉS de juntar', async () => {
    let juntado = false
    const { llamadas } = montar({ sesion: PRO }, (_m, u) => {
      if (u.pathname === '/api/cuenta/vinculo') return { estado: 'ambos_con_datos', vinculado: juntado, duplicadas: juntado ? [{ conservar: 'a', duplicada: 'b', nombre: 'Press banca' }] : [] }
      if (u.pathname === '/api/cuenta/vincular') { juntado = true; return { ok: true, ultimaSincronizacion: null } }
      if (u.pathname === '/api/cuenta/unificar') return { ok: true }
    })
    await userEvent.click(await screen.findByRole('button', { name: 'Juntar' }))
    expect(await screen.findByText(/Press banca/)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Dejar así Press banca' })).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'Unificar Press banca' }))
    await waitFor(() => expect(llamadas.find(l => l.ruta === '/api/cuenta/unificar')?.body).toEqual({ conservar: 'a', duplicada: 'b' }))
  })

  it('sesión vencida: sin sesión pero con error, lo muestra como alerta', async () => {
    montar({ sesion: null, error: 'Tu sesión venció. Volvé a iniciar sesión.' })
    expect(await screen.findByRole('alert')).toHaveTextContent('Tu sesión venció. Volvé a iniciar sesión.')
  })

  it('un 401 al sincronizar deja el aviso visible aunque la sesión desaparezca', async () => {
    let vencida = false
    instalarApi((m, u) => {
      if (u.pathname === '/api/cuenta' && m === 'GET') return vencida ? { ...BASE, sesion: null, error: 'Tu sesión venció. Volvé a iniciar sesión.' } : { ...BASE, sesion: PRO, vinculado: true }
      if (u.pathname === '/api/cuenta/sincronizar') { vencida = true; return new Response(JSON.stringify({ error: 'Tu sesión venció. Volvé a iniciar sesión.', codigo: 'sesion_vencida' }), { status: 401 }) }
    })
    conProveedores(<SeccionCuenta />)
    await userEvent.click(await screen.findByRole('button', { name: 'Sincronizar ahora' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('Tu sesión venció')
    expect(await screen.findByText('Iniciar sesión')).toBeInTheDocument()
    expect(screen.getByRole('alert')).toHaveTextContent('Tu sesión venció')
  })

  it('el consentimiento nombra responsable, finalidad y derechos', async () => {
    montar({ sesion: { ...PRO, consentimiento: false } })
    expect(await screen.findByText(/Responsable de los datos: Rumbo Fit/)).toBeInTheDocument()
    expect(screen.getByText(/Finalidad: sincronizar tus datos entre tus equipos/)).toBeInTheDocument()
    expect(screen.getByText(/acceder, corregir y borrar tus datos/)).toBeInTheDocument()
  })

  it('borrar cuenta sin red avisa que no se pudo confirmar', async () => {
    montar({ sesion: PRO, vinculado: true }, (m, u) => {
      if (u.pathname === '/api/cuenta' && m === 'DELETE') return new Response(JSON.stringify({ error: 'sin red', codigo: 'sin_red' }), { status: 503 })
    })
    await userEvent.click(await screen.findByRole('button', { name: 'Borrar cuenta' }))
    await userEvent.click(within(await screen.findByRole('dialog')).getByRole('button', { name: 'Borrar cuenta' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('No pudimos confirmar el borrado. Revisá tu conexión y fijate en un rato si tu cuenta sigue.')
  })

  it('cuenta vacía: sube después de confirmar', async () => {
    const { llamadas } = montar({ sesion: PRO }, (_m, u) => {
      if (u.pathname === '/api/cuenta/vinculo') return { estado: 'cuenta_vacia', vinculado: false, duplicadas: [] }
      if (u.pathname === '/api/cuenta/vincular') return { ok: true, ultimaSincronizacion: null }
    })
    await userEvent.click(await screen.findByRole('button', { name: 'Subir mis datos' }))
    await userEvent.click(within(await screen.findByRole('dialog')).getByRole('button', { name: 'Subir' }))
    await waitFor(() => expect(llamadas.find(l => l.ruta === '/api/cuenta/vincular')?.body).toEqual({ modo: 'subir' }))
  })

  it('equipo vacío: baja los datos de la cuenta', async () => {
    const { llamadas } = montar({ sesion: PRO }, (_m, u) => {
      if (u.pathname === '/api/cuenta/vinculo') return { estado: 'equipo_vacio', vinculado: false, duplicadas: [] }
      if (u.pathname === '/api/cuenta/vincular') return { ok: true, ultimaSincronizacion: null }
    })
    await userEvent.click(await screen.findByRole('button', { name: 'Traer mis datos' }))
    await waitFor(() => expect(llamadas.find(l => l.ruta === '/api/cuenta/vincular')?.body).toEqual({ modo: 'bajar' }))
  })

  it('otra_cuenta: ofrece reintentar con forzar tras una advertencia', async () => {
    const { llamadas } = montar({ sesion: PRO }, (_m, u, b) => {
      if (u.pathname === '/api/cuenta/vinculo') return { estado: 'cuenta_vacia', vinculado: false, duplicadas: [] }
      if (u.pathname === '/api/cuenta/vincular') {
        if ((b as { forzar?: boolean }).forzar) return { ok: true, ultimaSincronizacion: null }
        return new Response(JSON.stringify({ error: 'Este equipo estaba conectado a otra cuenta.', codigo: 'otra_cuenta' }), { status: 409 })
      }
    })
    await userEvent.click(await screen.findByRole('button', { name: 'Subir mis datos' }))
    await userEvent.click(within(await screen.findByRole('dialog')).getByRole('button', { name: 'Subir' }))
    expect(await screen.findByText('Este equipo estaba conectado a otra cuenta.')).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'Subir igual' }))
    await waitFor(() => expect(llamadas.filter(l => l.ruta === '/api/cuenta/vincular').pop()?.body).toEqual({ modo: 'subir', forzar: true }))
  })

  it('Borrar cuenta pide confirmación con el texto aclaratorio', async () => {
    const { llamadas } = montar({ sesion: PRO, vinculado: true }, (m, u) => {
      if (u.pathname === '/api/cuenta' && m === 'DELETE') return { ok: true }
    })
    await userEvent.click(await screen.findByRole('button', { name: 'Borrar cuenta' }))
    const dialogo = await screen.findByRole('dialog')
    expect(within(dialogo).getByText('Se borran tu cuenta y tus datos de la nube. No se puede deshacer. Los datos de este equipo quedan.')).toBeInTheDocument()
    expect(llamadas.some(l => l.metodo === 'DELETE')).toBe(false)
    await userEvent.click(within(dialogo).getByRole('button', { name: 'Borrar cuenta' }))
    await waitFor(() => expect(llamadas.some(l => l.metodo === 'DELETE' && l.ruta === '/api/cuenta')).toBe(true))
  })

  it('Cerrar sesión llama a salir', async () => {
    const { llamadas } = montar({ sesion: PRO, vinculado: true }, (_m, u) => {
      if (u.pathname === '/api/cuenta/salir') return { ok: true }
    })
    await userEvent.click(await screen.findByRole('button', { name: 'Cerrar sesión' }))
    await waitFor(() => expect(llamadas.some(l => l.ruta === '/api/cuenta/salir')).toBe(true))
  })
})

describe('ConfirmarDialogo ocupado', () => {
  it('no se puede cancelar mientras está ocupado', async () => {
    const cancelar = vi.fn()
    conProveedores(<ConfirmarDialogo titulo="t" mensaje="m" ocupado onConfirmar={() => undefined} onCancelar={cancelar} />)
    expect(screen.getByRole('button', { name: 'Cancelar' })).toBeDisabled()
    await userEvent.keyboard('{Escape}')
    expect(cancelar).not.toHaveBeenCalled()
  })
})

describe('haceCuanto', () => {
  const ahora = new Date('2026-11-27T12:00:00Z')
  const hace = (ms: number) => new Date(ahora.getTime() - ms).toISOString()
  it.each([
    [10_000, 'hace un momento'],
    [60_000, 'hace 1 minuto'],
    [5 * 60_000, 'hace 5 minutos'],
    [3600_000, 'hace 1 hora'],
    [3 * 3600_000, 'hace 3 horas'],
    [86400_000, 'hace 1 día'],
    [4 * 86400_000, 'hace 4 días'],
  ])('%i ms', (ms, esperado) => expect(haceCuanto(hace(ms), ahora)).toBe(esperado))
})
