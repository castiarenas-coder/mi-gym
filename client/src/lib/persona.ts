// La persona elegida es lo único que se guarda en el navegador; los datos viven en el servidor.
const CLAVE = 'mi-gym.persona'

export function personaGuardada(): number | null {
  try {
    const n = Number(localStorage.getItem(CLAVE))
    return Number.isInteger(n) && n > 0 ? n : null
  } catch { return null }
}

export function guardarPersona(id: number | null) {
  try {
    if (id === null) localStorage.removeItem(CLAVE)
    else localStorage.setItem(CLAVE, String(id))
  } catch { /* sin almacenamiento: se vuelve a preguntar la próxima vez */ }
}
