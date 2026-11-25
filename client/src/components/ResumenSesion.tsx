import { Trophy } from 'lucide-react'
import type { Sesion } from '../api/tipos'
import { duracionLarga, kg, miles } from '../lib/formato'

/** Números de una sesión terminada: duración, volumen, series y récords nuevos. */
export function ResumenSesion({ sesion, titulo }: { sesion: Sesion; titulo?: string }) {
  const { resumen } = sesion
  return (
    <section className="tarjeta resumen-sesion" aria-label="Resumen del entrenamiento">
      {titulo && <h2 className="resumen-sesion__titulo">{titulo}</h2>}
      <dl className="estadisticas">
        <div className="estadistica"><dt>Duración</dt><dd>{duracionLarga(sesion.duracion)}</dd></div>
        <div className="estadistica"><dt>Volumen total</dt><dd>{miles(resumen.volumen_kg)} kg</dd></div>
        <div className="estadistica"><dt>Series</dt><dd>{resumen.series_hechas}</dd></div>
        <div className="estadistica"><dt>Ejercicios</dt><dd>{resumen.ejercicios}</dd></div>
      </dl>
      {resumen.records.length > 0 && (
        <ul className="records-nuevos" aria-label="Récords nuevos">
          {resumen.records.map(r => (
            <li key={`${r.ejercicio_id}-${r.tipo}`} className="record-nuevo">
              <Trophy size={20} aria-hidden />
              <span>
                Récord nuevo: <strong>{r.nombre}</strong> · {r.tipo === 'peso' ? 'peso máximo' : '1RM estimado'} {kg(r.valor)} kg
                {r.anterior !== null && <> (antes {kg(r.anterior)} kg)</>}
              </span>
            </li>
          ))}
        </ul>
      )}
      {sesion.nota && <p className="resumen-sesion__nota">“{sesion.nota}”</p>}
    </section>
  )
}
