import { useState } from 'react'
import { Link } from 'react-router-dom'
import { History, Play, Shuffle } from 'lucide-react'
import { usePersonaActiva } from '../app/PersonaContext'
import { AvatarPersona } from '../components/AvatarPersona'
import { ResumenGrupo } from '../components/ResumenGrupo'
import { useIniciarSesion, useSesionActiva } from '../api/entrenar'
import { useRutinas } from '../api/rutinas'
import type { Sesion } from '../api/tipos'
import { ResumenSesion } from '../components/ResumenSesion'
import { SesionEnCurso } from '../components/SesionEnCurso'

const plural = (n: number, uno: string, varios: string) => `${n} ${n === 1 ? uno : varios}`

type Inicio = { rutina_id?: number; dia_id?: number }

/** Paso opcional antes de empezar: ¿entrena alguien más? Cada persona suma el entrenamiento a su propio progreso. */
function ConQuien({ otras, error, ocupado, onEmpezar, onCancelar }: {
  otras: { id: number; nombre: string; color: string; avatar: string }[]
  error: string | null
  ocupado: boolean
  onEmpezar: (acompanantes: number[]) => void
  onCancelar: () => void
}) {
  const [elegidas, setElegidas] = useState<number[]>([])
  const alternar = (id: number) => setElegidas(e => (e.includes(id) ? e.filter(x => x !== id) : [...e, id]))
  return (
    <div className="modal modal--centro" onClick={ev => { if (ev.target === ev.currentTarget) onCancelar() }}>
      <div className="modal__caja" role="dialog" aria-modal="true" aria-label="¿Entrena alguien más?">
        <h2 className="modal__titulo">¿Entrena alguien más?</h2>
        <p className="bloque__ayuda">Si entrenan juntos, la sesión también cuenta para el progreso de cada uno, con sus propios pesos.</p>
        <ul className="con-quien">
          {otras.map(p => (
            <li key={p.id}>
              <button type="button" role="switch" aria-checked={elegidas.includes(p.id)} aria-label={p.nombre} className="interruptor" onClick={() => alternar(p.id)}>
                <AvatarPersona persona={p} />
                <span className="interruptor__nombre">{p.nombre}</span>
                <span className="interruptor__pista" aria-hidden />
              </button>
            </li>
          ))}
        </ul>
        {error && <p className="aviso aviso--error" role="alert">{error}</p>}
        <div className="acciones acciones--fin">
          <button type="button" className="boton boton--secundario" onClick={onCancelar}>Cancelar</button>
          <button type="button" className="boton boton--principal" disabled={ocupado} onClick={() => onEmpezar(elegidas)}>Empezar</button>
        </div>
      </div>
    </div>
  )
}

function Elegir() {
  const rutinas = useRutinas()
  const iniciar = useIniciarSesion()
  const { persona, personas } = usePersonaActiva()
  const otras = personas.filter(p => p.id !== persona.id)
  const [error, setError] = useState<string | null>(null)
  const [pendiente, setPendiente] = useState<Inicio | null>(null)

  const lanzar = (cuerpo: Inicio, acompanantes: number[] = []) => {
    setError(null)
    iniciar.mutate(acompanantes.length ? { ...cuerpo, acompanantes } : cuerpo, {
      onSuccess: () => setPendiente(null),
      onError: e => setError(e.message),
    })
  }
  // Con más personas en la casa se pregunta con quién; si no, se empieza directo.
  const empezar = (cuerpo: Inicio) => {
    if (otras.length === 0) lanzar(cuerpo)
    else { setError(null); setPendiente(cuerpo) }
  }

  return (
    <div className="pagina">
      <div className="cabecera-pagina">
        <h1>Entrenar</h1>
        <Link to="/historial" className="boton boton--secundario"><History size={20} aria-hidden /> Historial</Link>
      </div>
      <p className="bloque__ayuda">Elegí el día que te toca o armá una sesión libre. Tu entrenamiento queda guardado aunque cierres la página.</p>
      {error && !pendiente && <p className="aviso aviso--error" role="alert">{error}</p>}

      <button type="button" className="boton boton--principal boton--grande" disabled={iniciar.isPending} onClick={() => empezar({})}>
        <Shuffle size={22} aria-hidden /> Empezar sesión libre
      </button>

      {rutinas.isPending && <p className="aviso">Cargando rutinas…</p>}
      {rutinas.isError && <p className="aviso aviso--error" role="alert">No pudimos cargar tus rutinas.</p>}
      {rutinas.isSuccess && rutinas.data.length === 0 && (
        <p className="aviso">Todavía no tenés rutinas. <Link to="/rutinas" className="enlace">Creá la primera</Link> o entrená con una sesión libre.</p>
      )}

      {rutinas.data?.filter(r => r.dias.length > 0).map(r => (
        <section key={r.id} className="tarjeta elegir-rutina" aria-labelledby={`rut-${r.id}`}>
          <h2 id={`rut-${r.id}`} className="elegir-rutina__nombre">{r.nombre}</h2>
          <div className="elegir-rutina__dias">
            {r.dias.map(d => (
              <button
                key={d.id}
                type="button"
                className="dia-elegir"
                aria-label={`Empezar ${d.nombre} de ${r.nombre}`}
                disabled={iniciar.isPending || d.cantidad === 0}
                onClick={() => empezar({ dia_id: d.id, rutina_id: r.id })}
              >
                <Play size={20} aria-hidden />
                <span className="dia-elegir__texto"><strong>{d.nombre}</strong><span>{d.cantidad === 0 ? 'Sin ejercicios' : plural(d.cantidad, 'ejercicio', 'ejercicios')}</span></span>
              </button>
            ))}
          </div>
        </section>
      ))}

      {pendiente && (
        <ConQuien otras={otras} error={error} ocupado={iniciar.isPending} onEmpezar={a => lanzar(pendiente, a)} onCancelar={() => setPendiente(null)} />
      )}
    </div>
  )
}

export function Entrenar() {
  const activa = useSesionActiva()
  const [terminada, setTerminada] = useState<Sesion | null>(null)

  if (terminada) {
    return (
      <div className="pagina">
        <h1>Entrenar</h1>
        {terminada.grupo ? (
          <>
            <h2 className="resumen-sesion__titulo">¡Entrenamiento en grupo terminado!</h2>
            <ResumenGrupo sesion={terminada} />
          </>
        ) : (
          <ResumenSesion sesion={terminada} titulo="¡Entrenamiento terminado!" />
        )}
        <div className="acciones">
          <Link to={`/historial/${terminada.id}`} className="boton boton--secundario">Ver detalle</Link>
          <button type="button" className="boton boton--principal" onClick={() => setTerminada(null)}>Listo</button>
        </div>
      </div>
    )
  }
  if (activa.isPending) return <div className="pagina"><h1>Entrenar</h1><p className="aviso">Buscando tu entrenamiento…</p></div>
  if (activa.isError) return <div className="pagina"><h1>Entrenar</h1><p className="aviso aviso--error" role="alert">No pudimos cargar tu entrenamiento: {activa.error.message}</p></div>
  if (activa.data) return <SesionEnCurso key={activa.data.id} sesion={activa.data} onTerminada={setTerminada} />
  return <Elegir />
}
