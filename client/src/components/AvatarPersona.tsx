import type { Persona } from '../api/personas'

interface Props { persona: Pick<Persona, 'nombre' | 'color' | 'avatar'>; tamano?: 'chico' | 'medio' | 'grande' }

/** Círculo de color con el emoji elegido o, si no hay, la inicial del nombre. */
export function AvatarPersona({ persona, tamano = 'medio' }: Props) {
  const inicial = persona.nombre.trim().charAt(0).toUpperCase()
  return <span className={`avatar avatar--${tamano}`} style={{ background: persona.color }} aria-hidden>{persona.avatar || inicial}</span>
}
