import { useEffect, useRef, useState } from 'react'
import { Dumbbell, Pause, Play } from 'lucide-react'
import { tipoDeMedia } from '../lib/media'
import type { EjercicioResumen } from '../api/tipos'

type Datos = Pick<EjercicioResumen, 'nombre' | 'img_ini' | 'img_fin' | 'media_propia'>

interface Props {
  ejercicio: Datos
  /** En tarjetas y listas: no carga videos, solo fotos. */
  miniatura?: boolean
  className?: string
}

const INTERVALO_MS = 800

function prefiereMenosMovimiento() {
  return typeof window.matchMedia === 'function' && window.matchMedia('(prefers-reduced-motion: reduce)').matches
}

function Marcador({ nombre }: { nombre: string }) {
  return (
    <div className="anim__vacio" role="img" aria-label={`Sin imagen de ${nombre}`}>
      <Dumbbell size={40} aria-hidden />
    </div>
  )
}

/** Alterna la foto inicial y la final como un GIF, o muestra la media propia si hay. */
export function AnimacionEjercicio({ ejercicio, miniatura = false, className = '' }: Props) {
  const { nombre, img_ini, img_fin } = ejercicio
  const raiz = useRef<HTMLDivElement>(null)
  const [visible, setVisible] = useState(true)
  const [reducido] = useState(prefiereMenosMovimiento)
  const [reproduciendo, setReproduciendo] = useState(!reducido)
  const [paso, setPaso] = useState(0)
  const [fallida, setFallida] = useState(false)

  const propia = tipoDeMedia(ejercicio.media_propia)
  const media = propia && (!miniatura || propia.tipo === 'imagen') ? propia : null
  const fotos = [img_ini, img_fin].filter((f): f is string => !!f)
  const animada = !media && fotos.length === 2

  useEffect(() => {
    const el = raiz.current
    if (!el || typeof IntersectionObserver === 'undefined') return
    const obs = new IntersectionObserver(entradas => setVisible(entradas.some(e => e.isIntersecting)), { rootMargin: '80px' })
    obs.observe(el)
    return () => obs.disconnect()
  }, [])

  useEffect(() => {
    if (!animada || !reproduciendo || !visible) return
    const t = setInterval(() => setPaso(p => 1 - p), INTERVALO_MS)
    return () => clearInterval(t)
  }, [animada, reproduciendo, visible])

  let contenido
  if (media?.tipo === 'youtube') {
    contenido = (
      <iframe
        className="anim__video"
        title={`Video de ${nombre}`}
        src={`https://www.youtube-nocookie.com/embed/${media.id}?rel=0&modestbranding=1&playsinline=1`}
        loading="lazy"
        allow="accelerometer; encrypted-media; picture-in-picture"
        allowFullScreen
      />
    )
  } else if (media?.tipo === 'video') {
    contenido = <video className="anim__video" src={media.url} muted loop autoPlay playsInline controls aria-label={`Video de ${nombre}`} />
  } else if (media?.tipo === 'imagen') {
    contenido = <img className="anim__img anim__img--activa" src={media.url} alt={nombre} data-activa="true" loading="lazy" />
  } else if (fotos.length === 0 || fallida) {
    contenido = <Marcador nombre={nombre} />
  } else {
    contenido = fotos.map((f, i) => (
      <img
        key={f}
        className={`anim__img${i === paso || fotos.length === 1 ? ' anim__img--activa' : ''}`}
        src={`/img/${f}`}
        alt={i === 0 ? nombre : ''}
        aria-hidden={i === 0 ? undefined : true}
        data-activa={String(i === paso || fotos.length === 1)}
        loading={miniatura ? 'lazy' : 'eager'}
        onError={() => setFallida(true)}
      />
    ))
  }

  return (
    <div ref={raiz} className={`anim ${className}`.trim()}>
      {contenido}
      {animada && reducido && (
        <button
          type="button"
          className="anim__control"
          aria-label={reproduciendo ? 'Pausar animación' : 'Reproducir animación'}
          onClick={() => setReproduciendo(r => !r)}
        >
          {reproduciendo ? <Pause size={18} aria-hidden /> : <Play size={18} aria-hidden />}
        </button>
      )}
    </div>
  )
}
