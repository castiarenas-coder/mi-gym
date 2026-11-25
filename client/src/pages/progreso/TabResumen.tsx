import { Link } from 'react-router-dom'
import { Flame, Trophy } from 'lucide-react'
import { useResumenProgreso } from '../../api/progreso'
import { GraficoBarras } from '../../components/GraficoBarras'
import { duracionLarga, fechaCorta, kg, miles } from '../../lib/formato'

const plural = (n: number, uno: string, varios: string) => `${n} ${n === 1 ? uno : varios}`

export function TabResumen() {
  const resumen = useResumenProgreso()
  if (resumen.isPending) return <p className="aviso">Cargando tu progreso…</p>
  if (resumen.isError) return <p className="aviso aviso--error" role="alert">No pudimos cargar tu progreso.</p>
  const r = resumen.data

  if (r.total_sesiones === 0) {
    return (
      <div className="tarjeta vacio">
        <Trophy size={36} aria-hidden />
        <p>Todavía no registraste entrenamientos. Cuando termines el primero vas a ver acá tus semanas, tu racha y tu volumen.</p>
        <Link to="/entrenar" className="boton boton--principal">Ir a entrenar</Link>
      </div>
    )
  }

  return (
    <>
      <section aria-label="Tu semana">
        <dl className="estadisticas estadisticas--grandes">
          <div className="estadistica"><dt>Entrenamientos esta semana</dt><dd>{r.esta_semana.sesiones}</dd></div>
          <div className="estadistica estadistica--racha">
            <dt>Racha</dt>
            <dd><Flame size={20} aria-hidden /> {plural(r.racha.actual, 'semana', 'semanas')}</dd>
            <span className="estadistica__nota">Mejor racha: {plural(r.racha.mejor, 'semana', 'semanas')}</span>
          </div>
          <div className="estadistica"><dt>Volumen esta semana</dt><dd>{miles(r.esta_semana.volumen_kg)} kg</dd></div>
          <div className="estadistica"><dt>Total de entrenamientos</dt><dd>{r.total_sesiones}</dd></div>
        </dl>
      </section>

      <section className="tarjeta" aria-labelledby="g-sesiones">
        <h2 id="g-sesiones" className="seccion__titulo">Entrenamientos por semana</h2>
        <p className="bloque__ayuda">Últimas 12 semanas (cada semana empieza el lunes).</p>
        <GraficoBarras
          titulo="Entrenamientos por semana"
          enteros
          datos={r.semanas.map(s => ({ etiqueta: fechaCorta(s.inicio), valor: s.sesiones, detalle: `Semana del ${fechaCorta(s.inicio)}: ${plural(s.sesiones, 'entrenamiento', 'entrenamientos')}` }))}
        />
      </section>

      <section className="tarjeta" aria-labelledby="g-volumen">
        <h2 id="g-volumen" className="seccion__titulo">Volumen por semana</h2>
        <p className="bloque__ayuda">Kilos totales levantados (peso × repeticiones).</p>
        <GraficoBarras
          titulo="Volumen por semana (kg)"
          datos={r.semanas.map(s => ({ etiqueta: fechaCorta(s.inicio), valor: s.volumen_kg, detalle: `Semana del ${fechaCorta(s.inicio)}: ${miles(s.volumen_kg)} kg` }))}
        />
      </section>

      {r.ultima_sesion && (
        <p className="aviso">
          Último entrenamiento: <Link className="enlace" to={`/historial/${r.ultima_sesion.id}`}>{r.ultima_sesion.titulo}</Link> el {fechaCorta(r.ultima_sesion.fecha)}
          {' · '}{duracionLarga(r.ultima_sesion.duracion)} · {kg(r.ultima_sesion.volumen_kg)} kg
        </p>
      )}
    </>
  )
}
