import { useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { Check, Plus, Trash2, UserMinus } from 'lucide-react'
import {
  useActualizarSerie, useAgregarSerie, useBorrarSesion, useFinalizarSesion,
  useQuitarAcompanante, useQuitarEjercicioSesion, useQuitarSerie, useSesion,
} from '../api/entrenar'
import { AvatarPersona } from './AvatarPersona'
import { api } from '../api/cliente'
import type { EjercicioSesion, SerieSesion, Sesion, UltimaVez } from '../api/tipos'
import { useDescanso } from '../lib/descanso'
import { reloj } from '../lib/formato'
import { avisarFinDescanso, prepararAudio } from '../lib/sonido'
import { AnimacionEjercicio } from './AnimacionEjercicio'
import { BuscadorCatalogo } from './BuscadorCatalogo'
import { ConfirmarDialogo } from './ConfirmarDialogo'
import { TemporizadorDescanso } from './TemporizadorDescanso'

/** Segundos desde `desde`, actualizado cada segundo. */
function useReloj(desde: string) {
  const [ahora, setAhora] = useState(() => Date.now())
  useEffect(() => {
    const t = setInterval(() => setAhora(Date.now()), 1000)
    return () => clearInterval(t)
  }, [])
  return Math.max(0, Math.floor((ahora - new Date(desde).getTime()) / 1000))
}

const aNumero = (t: string): number | null => {
  const limpio = t.trim().replace(',', '.')
  if (limpio === '') return null
  const n = Number(limpio)
  return Number.isFinite(n) && n >= 0 ? n : null
}
const aEntero = (t: string): number | null => {
  const n = aNumero(t)
  return n === null ? null : Math.round(n)
}
const texto = (n: number | null) => (n === null ? '' : String(n).replace('.', ','))

interface FilaProps {
  serie: SerieSesion
  onGuardar: (cambios: { peso_kg?: number | null; reps?: number | null; hecha?: boolean }) => void
  onQuitar: () => void
}

function FilaSerie({ serie, onGuardar, onQuitar }: FilaProps) {
  const [peso, setPeso] = useState(texto(serie.peso_kg))
  const [reps, setReps] = useState(texto(serie.reps))
  // Si el servidor cambia los valores (renumeración, otra pestaña), los campos los siguen.
  const [previos, setPrevios] = useState({ peso: serie.peso_kg, reps: serie.reps })
  if (previos.peso !== serie.peso_kg || previos.reps !== serie.reps) {
    setPrevios({ peso: serie.peso_kg, reps: serie.reps })
    setPeso(texto(serie.peso_kg))
    setReps(texto(serie.reps))
  }

  const valores = () => ({ peso_kg: aNumero(peso), reps: aEntero(reps) })
  const alSalir = () => {
    const v = valores()
    if (v.peso_kg !== serie.peso_kg || v.reps !== serie.reps) onGuardar(v)
  }
  const alMarcar = () => {
    prepararAudio()
    if (serie.hecha) onGuardar({ hecha: false })
    else onGuardar({ ...valores(), hecha: true })
  }

  return (
    <li className={`serie${serie.hecha ? ' serie--hecha' : ''}`}>
      <span className="serie__n" aria-hidden>{serie.n}</span>
      <input
        className="control serie__campo"
        inputMode="decimal"
        aria-label={`Peso (kg) serie ${serie.n}`}
        placeholder="kg"
        value={peso}
        onChange={e => setPeso(e.target.value)}
        onBlur={alSalir}
        onFocus={e => e.target.select()}
      />
      <input
        className="control serie__campo"
        inputMode="numeric"
        aria-label={`Repeticiones serie ${serie.n}`}
        placeholder="reps"
        value={reps}
        onChange={e => setReps(e.target.value)}
        onBlur={alSalir}
        onFocus={e => e.target.select()}
      />
      <button
        type="button"
        className="serie__check"
        aria-pressed={serie.hecha}
        aria-label={serie.hecha ? `Serie ${serie.n} hecha, tocá para desmarcar` : `Marcar serie ${serie.n} como hecha`}
        onClick={alMarcar}
      >
        <Check size={28} aria-hidden />
      </button>
      <button type="button" className="icono-boton serie__quitar" aria-label={`Quitar serie ${serie.n}`} onClick={onQuitar}>
        <Trash2 size={18} aria-hidden />
      </button>
    </li>
  )
}

interface TarjetaProps {
  sesion: number
  ejercicio: EjercicioSesion
  onHecha: (descanso: number) => void
}

function TarjetaEjercicioSesion({ sesion, ejercicio, onHecha }: TarjetaProps) {
  const actualizar = useActualizarSerie()
  const agregar = useAgregarSerie()
  const quitar = useQuitarSerie()
  const quitarEjercicio = useQuitarEjercicioSesion()
  const [confirmando, setConfirmando] = useState(false)
  const id = `ej-${ejercicio.ejercicio_id}`
  const ultima = ejercicio.series.at(-1)
  const plan = ejercicio.series_plan > 0
    ? `${ejercicio.series_plan} × ${ejercicio.reps_plan ?? '–'}`
    : 'Ejercicio extra'

  return (
    <section className="ej-sesion" aria-labelledby={id}>
      <header className="ej-sesion__cab">
        <AnimacionEjercicio ejercicio={ejercicio} miniatura className="miniatura miniatura--grande" />
        <div className="ej-sesion__titulo">
          <h2 id={id}><Link to={`/ejercicios/${encodeURIComponent(ejercicio.ejercicio_id)}`}>{ejercicio.nombre}</Link></h2>
          <p className="ej-sesion__meta">{plan} · descanso {reloj(ejercicio.descanso_seg)}</p>
        </div>
        <button type="button" className="icono-boton icono-boton--peligro" aria-label={`Quitar ${ejercicio.nombre} de la sesión`} onClick={() => setConfirmando(true)}>
          <Trash2 size={20} aria-hidden />
        </button>
      </header>

      <div className="serie serie--titulos" aria-hidden>
        <span>Serie</span><span>Kg</span><span>Reps</span><span>Hecha</span><span />
      </div>
      <ul className="series">
        {ejercicio.series.map(s => (
          <FilaSerie
            key={s.n}
            serie={s}
            onGuardar={cambios => {
              actualizar.mutate({ sesion, ejercicio: ejercicio.ejercicio_id, n: s.n, ...cambios })
              if (cambios.hecha) onHecha(ejercicio.descanso_seg)
            }}
            onQuitar={() => quitar.mutate({ sesion, ejercicio: ejercicio.ejercicio_id, n: s.n })}
          />
        ))}
      </ul>

      <button
        type="button"
        className="boton boton--secundario boton--ancho"
        disabled={agregar.isPending}
        onClick={() => agregar.mutate({ sesion, ejercicio: ejercicio.ejercicio_id, peso_kg: ultima?.peso_kg ?? null, reps: ultima?.reps ?? null })}
      >
        <Plus size={20} aria-hidden /> Agregar serie
      </button>

      {confirmando && (
        <ConfirmarDialogo
          titulo="¿Quitar el ejercicio?"
          mensaje={`Se quitan ${ejercicio.nombre} y sus series de este entrenamiento.`}
          confirmar="Quitar"
          ocupado={quitarEjercicio.isPending}
          onCancelar={() => setConfirmando(false)}
          onConfirmar={() => quitarEjercicio.mutate({ sesion, ejercicio: ejercicio.ejercicio_id }, { onSettled: () => setConfirmando(false) })}
        />
      )}
    </section>
  )
}

interface Props { sesion: Sesion; onTerminada: (s: Sesion) => void }

/** La pantalla de entrenar: la sesión propia y, si se entrena en grupo, una pestaña por cada persona. */
export function SesionEnCurso({ sesion: propia, onTerminada }: Props) {
  const grupo = propia.grupo
  const [verId, setVerId] = useState(propia.id)
  const idVisible = grupo?.miembros.some(m => m.sesion_id === verId) ? verId : propia.id
  const ajena = useSesion(idVisible === propia.id ? undefined : String(idVisible))
  const sesion = idVisible === propia.id ? propia : ajena.data
  const miembroVisible = grupo?.miembros.find(m => m.sesion_id === idVisible)

  const segundos = useReloj(propia.fecha)
  const agregar = useAgregarSerie()
  const finalizar = useFinalizarSesion()
  const borrar = useBorrarSesion()
  const quitarAcompanante = useQuitarAcompanante()
  const [sacando, setSacando] = useState(false)
  const [buscando, setBuscando] = useState(false)
  const [terminando, setTerminando] = useState(false)
  const [descartando, setDescartando] = useState(false)
  const [nota, setNota] = useState('')
  const [error, setError] = useState<string | null>(null)
  const totalDescanso = useRef(0)
  const descanso = useDescanso(avisarFinDescanso)

  const series = sesion?.ejercicios.flatMap(e => e.series) ?? []
  const hechas = series.filter(s => s.hecha).length
  const pendientes = series.length - hechas

  // Cierra el aviso de "descanso terminado" solo, para no tapar la pantalla.
  const { terminado, saltar } = descanso
  useEffect(() => {
    if (!terminado) return
    const t = setTimeout(saltar, 8000)
    return () => clearTimeout(t)
  }, [terminado, saltar])

  const empezarDescanso = (seg: number) => { totalDescanso.current = seg; descanso.iniciar(seg) }

  const agregarEjercicio = async (id: string) => {
    let previa: UltimaVez['series'][number] | undefined
    try { previa = (await api<UltimaVez>(`/ejercicios/${encodeURIComponent(id)}/ultima`)).series[0] } catch { /* sin historial */ }
    await agregar.mutateAsync({ sesion: idVisible, ejercicio: id, peso_kg: previa?.peso_kg ?? null, reps: previa?.reps ?? null })
  }

  const terminar = () => {
    setError(null)
    finalizar.mutate({ id: propia.id, nota: nota.trim() || undefined }, {
      onSuccess: s => { setTerminando(false); onTerminada(s) },
      onError: e => setError(e.message),
    })
  }

  return (
    <div className="pagina entrenando">
      <header className="tarjeta sesion-cab">
        <div>
          <p className="sesion-cab__sup">Entrenando</p>
          <h1>{propia.titulo}</h1>
        </div>
        <div className="sesion-cab__datos">
          <div className="sesion-cab__reloj" role="timer" aria-label="Tiempo de entrenamiento">{reloj(segundos)}</div>
          <p className="sesion-cab__series">{hechas} de {series.length} series</p>
        </div>
        <button type="button" className="boton boton--principal boton--ancho" onClick={() => setTerminando(true)}>
          <Check size={20} aria-hidden /> Terminar entrenamiento
        </button>
      </header>

      {grupo && (
        <div className="pestanas-grupo" role="tablist" aria-label="Personas del entrenamiento">
          {grupo.miembros.map(m => (
            <button
              key={m.sesion_id}
              type="button"
              role="tab"
              aria-selected={m.sesion_id === idVisible}
              className="pestana-grupo"
              style={{ '--color-persona': m.persona.color } as React.CSSProperties}
              onClick={() => setVerId(m.sesion_id)}
            >
              <AvatarPersona persona={m.persona} />
              <span className="pestana-grupo__texto"><strong>{m.persona.nombre}</strong><span>{m.series_hechas} de {m.series_total} series</span></span>
            </button>
          ))}
        </div>
      )}
      {grupo && miembroVisible && miembroVisible.sesion_id !== propia.id && (
        <button type="button" className="boton boton--texto" onClick={() => setSacando(true)}>
          <UserMinus size={18} aria-hidden /> Sacar a {miembroVisible.persona.nombre} del entrenamiento
        </button>
      )}

      {!sesion && ajena.isError && <p className="aviso aviso--error" role="alert">No pudimos cargar esta sesión.</p>}
      {!sesion && !ajena.isError && <p className="aviso">Cargando…</p>}
      {sesion && sesion.ejercicios.length === 0 && <p className="aviso">Esta sesión está vacía. Agregá un ejercicio para empezar.</p>}
      {sesion?.ejercicios.map(e => <TarjetaEjercicioSesion key={`${sesion.id}-${e.ejercicio_id}`} sesion={sesion.id} ejercicio={e} onHecha={empezarDescanso} />)}

      <button type="button" className="boton boton--secundario boton--ancho" onClick={() => setBuscando(true)}>
        <Plus size={20} aria-hidden /> Agregar ejercicio
      </button>
      <button type="button" className="boton boton--texto boton--peligro-texto" onClick={() => setDescartando(true)}>Descartar entrenamiento</button>

      {descanso.activo && (
        <TemporizadorDescanso
          restante={descanso.restante}
          total={totalDescanso.current}
          terminado={descanso.terminado}
          onAjustar={d => { totalDescanso.current = Math.max(0, totalDescanso.current + d); descanso.ajustar(d) }}
          onSaltar={descanso.saltar}
        />
      )}

      {buscando && (
        <BuscadorCatalogo
          titulo="Agregar ejercicio al entrenamiento"
          ocupado={agregar.isPending}
          onAgregar={agregarEjercicio}
          onCerrar={() => setBuscando(false)}
        />
      )}

      {terminando && (
        <div className="modal modal--centro" onClick={ev => { if (ev.target === ev.currentTarget) setTerminando(false) }}>
          <div className="modal__caja" role="dialog" aria-modal="true" aria-labelledby="terminar-titulo">
            <h2 id="terminar-titulo" className="modal__titulo">¿Terminar el entrenamiento?</h2>
            {grupo && (
              <p className="bloque__ayuda">
                Se termina el entrenamiento de todos ({grupo.miembros.map(m => m.persona.nombre).join(', ')}). Las series sin marcar de cada uno no se van a guardar.
              </p>
            )}
            <p className="bloque__ayuda">
              {hechas === 0
                ? 'No marcaste ninguna serie: el entrenamiento quedaría vacío.'
                : `Llevás ${hechas} ${hechas === 1 ? 'serie hecha' : 'series hechas'} en ${reloj(segundos)}.`}
              {pendientes > 0 && ` Tenés ${pendientes} ${pendientes === 1 ? 'serie sin marcar' : 'series sin marcar'}: no se van a guardar.`}
            </p>
            <label className="campo">
              <span className="campo__etiqueta">Nota (opcional)</span>
              <textarea className="control control--area" value={nota} maxLength={1000} onChange={e => setNota(e.target.value)} placeholder="Cómo te sentiste, qué ajustar…" />
            </label>
            {error && <p className="aviso aviso--error" role="alert">{error}</p>}
            <div className="acciones acciones--fin">
              <button type="button" className="boton boton--secundario" onClick={() => setTerminando(false)}>Seguir entrenando</button>
              <button type="button" className="boton boton--principal" disabled={finalizar.isPending} onClick={terminar}>Terminar</button>
            </div>
          </div>
        </div>
      )}

      {descartando && (
        <ConfirmarDialogo
          titulo="¿Descartar el entrenamiento?"
          mensaje={grupo
            ? 'Se borra tu sesión con todo lo que cargaste; el resto del grupo sigue entrenando. No se puede deshacer.'
            : 'Se borra esta sesión con todo lo que cargaste. No se puede deshacer.'}
          confirmar="Descartar"
          ocupado={borrar.isPending}
          onCancelar={() => setDescartando(false)}
          onConfirmar={() => borrar.mutate(propia.id, { onSettled: () => setDescartando(false) })}
        />
      )}

      {sacando && miembroVisible && (
        <ConfirmarDialogo
          titulo={`¿Sacar a ${miembroVisible.persona.nombre}?`}
          mensaje={`Se descarta lo que cargó ${miembroVisible.persona.nombre} en este entrenamiento. Vos y el resto siguen. No se puede deshacer.`}
          confirmar="Sacar"
          ocupado={quitarAcompanante.isPending}
          onCancelar={() => setSacando(false)}
          onConfirmar={() => quitarAcompanante.mutate({ sesion: propia.id, persona: miembroVisible.persona.id }, {
            onSettled: () => setSacando(false),
            onSuccess: () => setVerId(propia.id),
          })}
        />
      )}
    </div>
  )
}
