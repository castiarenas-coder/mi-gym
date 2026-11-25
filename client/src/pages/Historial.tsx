import { useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { ChevronRight, Trash2 } from 'lucide-react'
import { useBorrarSesion, useSesion, useSesiones } from '../api/entrenar'
import { ConfirmarDialogo } from '../components/ConfirmarDialogo'
import { ResumenSesion } from '../components/ResumenSesion'
import { duracionLarga, fechaConDia, fechaLarga, hora, kg, miles } from '../lib/formato'

const PAGINA = 20

export function Historial() {
  const [limite, setLimite] = useState(PAGINA)
  const lista = useSesiones(limite)

  return (
    <div className="pagina">
      <h1>Historial</h1>
      {lista.isPending && <p className="aviso">Cargando entrenamientos…</p>}
      {lista.isError && <p className="aviso aviso--error" role="alert">No pudimos cargar tu historial.</p>}
      {lista.isSuccess && lista.data.items.length === 0 && (
        <div className="tarjeta vacio">
          <p>Todavía no registraste entrenamientos.</p>
          <Link to="/entrenar" className="boton boton--principal">Ir a entrenar</Link>
        </div>
      )}
      <ul className="historial">
        {lista.data?.items.map(s => (
          <li key={s.id}>
            <Link to={`/historial/${s.id}`} className="historial__item">
              <span className="historial__fecha">{fechaConDia(s.fecha)}</span>
              <span className="historial__texto">
                <strong>{s.titulo}</strong>
                <span>{duracionLarga(s.duracion)} · {s.series_hechas} series · {miles(s.volumen_kg)} kg</span>
                {s.nombres.length > 0 && <span className="historial__nombres">{s.nombres.join(', ')}</span>}
              </span>
              <ChevronRight size={20} aria-hidden />
            </Link>
          </li>
        ))}
      </ul>
      {lista.isSuccess && lista.data.total > lista.data.items.length && (
        <button type="button" className="boton boton--secundario" disabled={lista.isFetching} onClick={() => setLimite(l => l + PAGINA)}>Ver más</button>
      )}
    </div>
  )
}

export function HistorialDetalle() {
  const { id } = useParams()
  const navigate = useNavigate()
  const sesion = useSesion(id)
  const borrar = useBorrarSesion()
  const [confirmando, setConfirmando] = useState(false)

  if (sesion.isPending) return <div className="pagina"><p className="aviso">Cargando…</p></div>
  if (sesion.isError) {
    return (
      <div className="pagina">
        <Link to="/historial" className="volver">Volver al historial</Link>
        <p className="aviso aviso--error" role="alert">No encontramos ese entrenamiento.</p>
      </div>
    )
  }
  const s = sesion.data

  return (
    <div className="pagina">
      <Link to="/historial" className="volver">Volver al historial</Link>
      <div>
        <h1>{s.titulo}</h1>
        <p className="bloque__ayuda">{fechaLarga(s.fecha)} · {hora(s.fecha)}</p>
      </div>
      <ResumenSesion sesion={s} />

      {s.ejercicios.map(e => (
        <section key={e.ejercicio_id} className="tarjeta ej-historial" aria-labelledby={`h-${e.ejercicio_id}`}>
          <h2 id={`h-${e.ejercicio_id}`}><Link to={`/ejercicios/${encodeURIComponent(e.ejercicio_id)}`}>{e.nombre}</Link></h2>
          <ol className="series-historial">
            {e.series.filter(x => x.hecha).map(x => (
              <li key={x.n}><span className="series-historial__n">{x.n}</span><span>{kg(x.peso_kg)} kg × {x.reps ?? '–'}</span></li>
            ))}
          </ol>
        </section>
      ))}

      <button type="button" className="boton boton--peligro" onClick={() => setConfirmando(true)}>
        <Trash2 size={18} aria-hidden /> Eliminar entrenamiento
      </button>
      {confirmando && (
        <ConfirmarDialogo
          titulo="¿Eliminar este entrenamiento?"
          mensaje="Se borran la sesión y todas sus series. Tus récords se recalculan. No se puede deshacer."
          ocupado={borrar.isPending}
          onCancelar={() => setConfirmando(false)}
          onConfirmar={() => borrar.mutate(s.id, { onSuccess: () => navigate('/historial') })}
        />
      )}
    </div>
  )
}
