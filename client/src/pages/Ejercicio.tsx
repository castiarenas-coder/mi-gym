import { useState, type ChangeEvent, type FormEvent } from 'react'
import { Link, useLocation, useNavigate, useParams } from 'react-router-dom'
import { ArrowLeft, ClipboardPlus, Link2, Trash2, Upload } from 'lucide-react'
import { useEjercicio, useLinkMedia, useQuitarMedia, useSubirMedia } from '../api/ejercicios'
import type { EjercicioDetalle } from '../api/tipos'
import { AnimacionEjercicio } from '../components/AnimacionEjercicio'
import { BotonFavorito } from '../components/BotonFavorito'
import { SelectorRutina } from '../components/SelectorRutina'
import { tipoDeMedia } from '../lib/media'

const MAX_MB = 30
const FORMATOS = 'image/gif,video/mp4,video/webm,image/jpeg,image/png'

function Dato({ etiqueta, valor }: { etiqueta: string; valor: string | null }) {
  if (!valor) return null
  return (
    <div className="dato">
      <dt>{etiqueta}</dt>
      <dd>{valor}</dd>
    </div>
  )
}

function MediaPropia({ ejercicio }: { ejercicio: EjercicioDetalle }) {
  const subir = useSubirMedia()
  const guardarLink = useLinkMedia()
  const quitar = useQuitarMedia()
  const [link, setLink] = useState('')
  const [error, setError] = useState<string | null>(null)
  const ocupado = subir.isPending || guardarLink.isPending || quitar.isPending

  const alElegir = (ev: ChangeEvent<HTMLInputElement>) => {
    const archivo = ev.target.files?.[0]
    ev.target.value = ''
    if (!archivo) return
    if (archivo.size > MAX_MB * 1024 * 1024) { setError(`El archivo supera el máximo de ${MAX_MB} MB.`); return }
    setError(null)
    subir.mutate({ id: ejercicio.id, archivo }, { onError: e => setError(e.message) })
  }

  const alGuardarLink = (ev: FormEvent) => {
    ev.preventDefault()
    const valor = link.trim()
    if (!valor) return
    if (!/^https?:\/\//i.test(valor)) { setError('Pegá un link que empiece con http:// o https://'); return }
    if (!tipoDeMedia(valor)) { setError('No reconocimos ese link. Usá YouTube o un archivo .gif, .mp4, .webm, .jpg o .png.'); return }
    setError(null)
    guardarLink.mutate({ id: ejercicio.id, link: valor }, { onSuccess: () => setLink(''), onError: e => setError(e.message) })
  }

  return (
    <section className="tarjeta bloque" aria-labelledby="mi-anim">
      <h2 id="mi-anim" className="bloque__titulo">Mi animación</h2>
      <p className="bloque__ayuda">
        Reemplazá las fotos por tu propio GIF, video o un link de YouTube. Se guarda en tu PC.
      </p>
      <div className="acciones">
        <label className="boton boton--secundario">
          <Upload size={18} aria-hidden />
          <span>Subir GIF, video o foto</span>
          <input type="file" className="oculto" accept={FORMATOS} onChange={alElegir} disabled={ocupado} />
        </label>
        {ejercicio.media_propia && (
          <button type="button" className="boton boton--peligro" disabled={ocupado} onClick={() => quitar.mutate(ejercicio.id, { onError: e => setError(e.message) })}>
            <Trash2 size={18} aria-hidden /> Quitar mi animación
          </button>
        )}
      </div>
      <form className="fila-link" onSubmit={alGuardarLink}>
        <label className="campo campo--crece">
          <span className="campo__etiqueta">Link de YouTube o de un video</span>
          <input className="control" type="url" inputMode="url" placeholder="https://youtu.be/…" value={link} onChange={e => setLink(e.target.value)} />
        </label>
        <button type="submit" className="boton boton--secundario" disabled={ocupado || !link.trim()}>
          <Link2 size={18} aria-hidden /> Guardar link
        </button>
      </form>
      {subir.isPending && <p className="aviso" role="status">Subiendo…</p>}
      {error && <p className="aviso aviso--error" role="alert">{error}</p>}
    </section>
  )
}

export function Ejercicio() {
  const { id } = useParams()
  const navigate = useNavigate()
  const location = useLocation()
  const { data: e, isPending, isError } = useEjercicio(id)
  const [eligiendoRutina, setEligiendoRutina] = useState(false)
  const hayDondeVolver = location.key !== 'default'

  if (isPending) return <p className="aviso">Cargando…</p>
  if (isError || !e) {
    return (
      <div className="pagina">
        <p className="aviso aviso--error" role="alert">No encontramos ese ejercicio.</p>
        <Link to="/ejercicios" className="boton boton--secundario">Ver todos los ejercicios</Link>
      </div>
    )
  }

  return (
    <div className="pagina ficha">
      {hayDondeVolver
        ? <button type="button" className="volver" onClick={() => navigate(-1)}><ArrowLeft size={18} aria-hidden /> Volver</button>
        : <Link to="/ejercicios" className="volver"><ArrowLeft size={18} aria-hidden /> Ejercicios</Link>}

      <div className="ficha__cabecera">
        <div className="ficha__anim">
          <AnimacionEjercicio ejercicio={e} className="anim--grande" />
        </div>
        <div className="ficha__info">
          <div className="ficha__titulo">
            <div>
              <h1>{e.nombre}</h1>
              {e.nombre_en && e.nombre_en !== e.nombre && <p className="ficha__ingles">{e.nombre_en}</p>}
            </div>
            <BotonFavorito id={e.id} favorito={e.favorito} className="favorito--grande" />
          </div>

          <dl className="datos">
            <Dato etiqueta="Músculo principal" valor={e.musculo_principal} />
            <Dato etiqueta="Equipo" valor={e.equipo} />
            <Dato etiqueta="Nivel" valor={e.nivel} />
            <Dato etiqueta="Categoría" valor={e.categoria} />
            <Dato etiqueta="Tipo de fuerza" valor={e.fuerza} />
            <Dato etiqueta="Mecánica" valor={e.mecanica} />
          </dl>

          {e.musculos_sec.length > 0 && (
            <div>
              <h2 className="bloque__titulo">Músculos secundarios</h2>
              <div className="insignias">{e.musculos_sec.map(m => <span key={m} className="insignia">{m}</span>)}</div>
            </div>
          )}

          <button type="button" className="boton boton--principal boton--ancho" onClick={() => setEligiendoRutina(true)}>
            <ClipboardPlus size={20} aria-hidden /> Agregar a rutina
          </button>
        </div>
      </div>

      <section className="tarjeta bloque" aria-labelledby="como-hacerlo">
        <h2 id="como-hacerlo" className="bloque__titulo">Cómo hacerlo</h2>
        {e.traducido === 0 && <p className="aviso aviso--suave">Instrucciones en inglés, pendientes de traducción</p>}
        {e.instrucciones.length === 0
          ? <p className="bloque__ayuda">Este ejercicio todavía no tiene instrucciones.</p>
          : (
            <ol className="pasos" aria-label="Instrucciones">
              {e.instrucciones.map((p, i) => <li key={i}>{p}</li>)}
            </ol>
          )}
      </section>

      <MediaPropia ejercicio={e} />

      {eligiendoRutina && <SelectorRutina ejercicioId={e.id} onCerrar={() => setEligiendoRutina(false)} />}
    </div>
  )
}
