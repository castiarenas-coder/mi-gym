import { personaGuardada } from '../lib/persona'

// Cliente mínimo de la API del servidor (mismo origen; en desarrollo Vite hace de proxy).
// Todos los pedidos llevan la persona activa en X-Persona: el servidor separa los datos por persona.
function cabeceraPersona(): Record<string, string> {
  const id = personaGuardada()
  return id === null ? {} : { 'X-Persona': String(id) }
}

async function leer<T>(res: Response): Promise<T> {
  if (!res.ok) {
    const cuerpo = (await res.json().catch(() => null)) as { error?: string } | null
    throw new Error(cuerpo?.error ?? `Error ${res.status}`)
  }
  return res.json() as Promise<T>
}

export async function api<T>(ruta: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`/api${ruta}`, {
    ...init,
    headers: { 'Content-Type': 'application/json', ...cabeceraPersona(), ...init?.headers },
  })
  return leer<T>(res)
}

export function enviar<T>(metodo: 'POST' | 'PATCH' | 'PUT' | 'DELETE', ruta: string, cuerpo?: unknown): Promise<T> {
  return api<T>(ruta, { method: metodo, body: cuerpo === undefined ? undefined : JSON.stringify(cuerpo) })
}

/** Sube un archivo como cuerpo crudo; el servidor lee el tipo del Content-Type. */
export async function subirArchivo<T>(ruta: string, archivo: File): Promise<T> {
  const res = await fetch(`/api${ruta}`, { method: 'POST', headers: { 'Content-Type': archivo.type, ...cabeceraPersona() }, body: archivo })
  return leer<T>(res)
}
