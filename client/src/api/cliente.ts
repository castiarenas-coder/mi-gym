import { personaGuardada } from '../lib/persona'

// Cliente mínimo de la API del servidor (mismo origen; en desarrollo Vite hace de proxy).
// Todos los pedidos llevan la persona activa en X-Persona: el servidor separa los datos por persona.
function cabeceraPersona(): Record<string, string> {
  const id = personaGuardada()
  return id === null ? {} : { 'X-Persona': String(id) }
}

// Los cambios sin esta cabecera los rechaza el servidor: una página ajena no puede mandarla sin permiso (CORS).
const CABECERA_APP = { 'X-Mi-Gym': '1' }

/** Error de la API: además del texto en castellano guarda el código estable del servidor (p. ej. 'otra_cuenta'). */
export class ErrorApi extends Error {
  estado: number
  codigo?: string
  constructor(mensaje: string, estado: number, codigo?: string) {
    super(mensaje)
    this.estado = estado
    this.codigo = codigo
  }
}

async function leer<T>(res: Response): Promise<T> {
  if (!res.ok) {
    const cuerpo = (await res.json().catch(() => null)) as { error?: string; codigo?: string } | null
    throw new ErrorApi(cuerpo?.error ?? `Error ${res.status}`, res.status, cuerpo?.codigo)
  }
  return res.json() as Promise<T>
}

export async function api<T>(ruta: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`/api${ruta}`, {
    ...init,
    headers: { 'Content-Type': 'application/json', ...CABECERA_APP, ...cabeceraPersona(), ...init?.headers },
  })
  return leer<T>(res)
}

export function enviar<T>(metodo: 'POST' | 'PATCH' | 'PUT' | 'DELETE', ruta: string, cuerpo?: unknown): Promise<T> {
  return api<T>(ruta, { method: metodo, body: cuerpo === undefined ? undefined : JSON.stringify(cuerpo) })
}

/** Sube un archivo como cuerpo crudo; el servidor lee el tipo del Content-Type. */
export async function subirArchivo<T>(ruta: string, archivo: File): Promise<T> {
  const res = await fetch(`/api${ruta}`, { method: 'POST', headers: { 'Content-Type': archivo.type, ...CABECERA_APP, ...cabeceraPersona() }, body: archivo })
  return leer<T>(res)
}
