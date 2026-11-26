import type { ReactNode } from 'react'
import { Trophy } from 'lucide-react'
import type { Sesion } from '../api/tipos'
import { duracionLarga, kg, miles } from '../lib/formato'
import { Metrica } from './ui/Metrica'

/** Números de una sesión terminada: duración, volumen, series y récords nuevos. */
export function ResumenSesion({ sesion, titulo, region = 'Resumen del entrenamiento', icono }: { sesion: Sesion; titulo?: string; region?: string; icono?: ReactNode }) {
  const { resumen } = sesion
  return (
    <section className="tarjeta resumen-sesion" aria-label={region}>
      {titulo && <h2 className="resumen-sesion__titulo">{icono} {titulo}</h2>}
      <div className="resumen-metricas">
        <Metrica valor={duracionLarga(sesion.duracion)} etiqueta="Duración" />
        <Metrica valor={miles(resumen.volumen_kg)} unidad="kg" etiqueta="Volumen total" />
        <Metrica valor={resumen.series_hechas} etiqueta="Series" />
        <Metrica valor={resumen.ejercicios} etiqueta="Ejercicios" />
      </div>
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
