import type { Sesion } from '../api/tipos'
import { AvatarPersona } from './AvatarPersona'
import { ResumenSesion } from './ResumenSesion'

/** Resumen de un entrenamiento en grupo: una tarjeta por persona, con sus propios números y récords. */
export function ResumenGrupo({ sesion }: { sesion: Sesion }) {
  const miembros = sesion.grupo?.miembros ?? []
  return (
    <div className="resumen-grupo">
      {miembros.map(m => (
        <div key={m.sesion_id} className="resumen-persona" style={{ '--color-persona': m.persona.color } as React.CSSProperties}>
          <ResumenSesion
            titulo={m.persona.nombre}
            region={`Resumen de ${m.persona.nombre}`}
            icono={<AvatarPersona persona={m.persona} tamano="chico" />}
            sesion={{
              ...sesion,
              duracion: m.duracion,
              nota: m.sesion_id === sesion.id ? sesion.nota : null,
              resumen: { series_hechas: m.series_hechas, ejercicios: m.ejercicios, volumen_kg: m.volumen_kg, records: m.records },
            }}
          />
        </div>
      ))}
    </div>
  )
}
