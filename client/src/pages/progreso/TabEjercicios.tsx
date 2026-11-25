import { useState } from 'react'
import { useHistorialEjercicio } from '../../api/entrenar'
import { useResumenProgreso } from '../../api/progreso'
import { GraficoLinea } from '../../components/GraficoLinea'
import { fechaCorta, kg } from '../../lib/formato'

type Metrica = 'peso' | '1rm'

function Historial({ id, nombre }: { id: string; nombre: string }) {
  const historial = useHistorialEjercicio(id)
  const [metrica, setMetrica] = useState<Metrica>('peso')

  if (historial.isPending) return <p className="aviso">Cargando historial…</p>
  if (historial.isError) return <p className="aviso aviso--error" role="alert">No pudimos cargar el historial.</p>
  const h = historial.data

  const puntos = h.sesiones.flatMap(s => {
    const valor = metrica === 'peso' ? s.mejor_peso : s.mejor_e1rm
    return valor === null ? [] : [{ fecha: s.fecha, valor }]
  })

  return (
    <>
      <dl className="estadisticas">
        <div className="estadistica">
          <dt>Peso máximo</dt>
          <dd>{h.mejor_peso ? `${kg(h.mejor_peso.peso_kg)} kg` : '–'}</dd>
          {h.mejor_peso && <span className="estadistica__nota">{h.mejor_peso.reps ?? '–'} reps · {fechaCorta(h.mejor_peso.fecha)}</span>}
        </div>
        <div className="estadistica">
          <dt>1RM estimado</dt>
          <dd>{h.mejor_e1rm ? `${kg(h.mejor_e1rm.valor)} kg` : '–'}</dd>
          {h.mejor_e1rm && <span className="estadistica__nota">{kg(h.mejor_e1rm.peso_kg)} × {h.mejor_e1rm.reps} · {fechaCorta(h.mejor_e1rm.fecha)}</span>}
        </div>
        <div className="estadistica"><dt>Entrenamientos</dt><dd>{h.total_sesiones}</dd></div>
      </dl>

      <section className="tarjeta" aria-label="Evolución">
        <div className="chips" role="group" aria-label="Qué mostrar">
          <button type="button" className={`chip${metrica === 'peso' ? ' chip--activo' : ''}`} aria-pressed={metrica === 'peso'} onClick={() => setMetrica('peso')}>Gráfico de peso</button>
          <button type="button" className={`chip${metrica === '1rm' ? ' chip--activo' : ''}`} aria-pressed={metrica === '1rm'} onClick={() => setMetrica('1rm')}>Gráfico de 1RM</button>
        </div>
        <GraficoLinea
          titulo={metrica === 'peso' ? `Mejor peso de ${nombre}` : `1RM estimado de ${nombre}`}
          puntos={puntos}
          unidad="kg"
          vacio="Necesitás al menos 2 registros con peso para ver el gráfico."
        />
        {metrica === '1rm' && <p className="bloque__ayuda">El 1RM es lo máximo que podrías levantar en una repetición. Se estima con la fórmula de Epley: peso × (1 + repeticiones ÷ 30).</p>}
      </section>

      <section className="tarjeta" aria-labelledby="tit-sesiones-ej">
        <h2 id="tit-sesiones-ej" className="seccion__titulo">Entrenamientos</h2>
        <div className="tabla-scroll">
          <table className="tabla" aria-label={`Entrenamientos de ${nombre}`}>
            <thead><tr><th scope="col">Fecha</th><th scope="col">Series (kg × reps)</th><th scope="col">Volumen</th></tr></thead>
            <tbody>
              {[...h.sesiones].reverse().map(s => (
                <tr key={s.sesion_id}>
                  <td>{fechaCorta(s.fecha)}</td>
                  <td>{s.series.map(x => `${kg(x.peso_kg)}×${x.reps ?? '–'}`).join(', ')}</td>
                  <td>{kg(s.volumen_kg)} kg</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </>
  )
}

export function TabEjercicios() {
  const resumen = useResumenProgreso()
  const [elegido, setElegido] = useState('')

  if (resumen.isPending) return <p className="aviso">Cargando…</p>
  if (resumen.isError) return <p className="aviso aviso--error" role="alert">No pudimos cargar tus ejercicios.</p>
  const records = resumen.data.records
  if (records.length === 0) return <p className="aviso">Cuando registres entrenamientos vas a poder ver acá la evolución de cada ejercicio.</p>

  const actual = records.find(r => r.ejercicio_id === elegido) ?? records[0]
  return (
    <>
      <label className="campo">
        <span className="campo__etiqueta">Ejercicio</span>
        <select className="control" value={actual.ejercicio_id} onChange={e => setElegido(e.target.value)} aria-label="Ejercicio">
          {records.map(r => <option key={r.ejercicio_id} value={r.ejercicio_id}>{r.nombre}</option>)}
        </select>
      </label>
      <Historial key={actual.ejercicio_id} id={actual.ejercicio_id} nombre={actual.nombre} />
    </>
  )
}
