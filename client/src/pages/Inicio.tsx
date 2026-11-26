import { Link } from 'react-router-dom'
import { ClipboardList, Play } from 'lucide-react'
import { useResumenProgreso } from '../api/progreso'
import { useRutinas } from '../api/rutinas'
import { useDestacados, useFavoritosInicio } from '../api/ejercicios'
import { usePersonaActiva } from '../app/PersonaContext'
import { FranjaSemanal } from '../components/FranjaSemanal'
import { TarjetaEjercicio } from '../components/TarjetaEjercicio'
import { EstadoVacio } from '../components/ui/EstadoVacio'
import { Metrica } from '../components/ui/Metrica'
import { duracionLarga, fechaCorta, miles } from '../lib/formato'

export function Inicio() {
  const { persona } = usePersonaActiva()
  const favoritos = useFavoritosInicio()
  const destacados = useDestacados()
  const consulta = useResumenProgreso()
  const resumen = consulta.data
  const rutinas = useRutinas()

  const nombre = persona.nombre.trim()
  const fecha = new Date().toLocaleDateString('es-AR', { weekday: 'long', day: 'numeric', month: 'long' })
  const hoy = fecha.charAt(0).toUpperCase() + fecha.slice(1)
  const activa = resumen?.sesion_activa ?? null
  const ultima = resumen?.ultima_sesion ?? null

  return (
    <div className="pagina inicio">
      <div className="inicio__saludo">
        <h1 className="inicio__titulo">{nombre ? `Hola, ${nombre}` : 'Hola'}</h1>
        <p className="inicio__fecha">{hoy}</p>
      </div>

      <FranjaSemanal />

      <section className="tarjeta inicio__hoy" aria-label="Tu entrenamiento">
        {consulta.isPending ? null : activa ? (
          <>
            <p className="inicio__sup">Entrenamiento en curso</p>
            <p className="inicio__sesion">{activa.titulo}</p>
            <Link to="/entrenar" className="boton boton--principal boton--grande boton--ancho"><Play size={20} aria-hidden /> Continuar</Link>
          </>
        ) : (
          <>
            <h2 className="inicio__sup">Entrenar hoy</h2>
            <Link to="/entrenar" className="boton boton--principal boton--grande boton--ancho"><Play size={20} aria-hidden /> Empezar</Link>
            {rutinas.isSuccess && rutinas.data.length > 0 && (
              <ul className="inicio__rutinas" aria-label="Tus rutinas">
                {rutinas.data.map(r => (
                  <li key={r.id}>
                    <Link to="/entrenar" className="boton boton--secundario inicio__rutina">
                      <ClipboardList size={18} aria-hidden /> <span>{r.nombre}</span>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
            {rutinas.isSuccess && rutinas.data.length === 0 && (
              <EstadoVacio
                icono={ClipboardList}
                titulo="Todavía no tenés rutinas"
                texto="Armá una con tus ejercicios y empezá a entrenar con un toque."
                accion={{ texto: 'Creá tu primera rutina', a: '/rutinas' }}
              />
            )}
          </>
        )}
      </section>

      {ultima && (
        <section className="tarjeta inicio__ultimo" aria-label="Último entrenamiento">
          <h2 className="inicio__sup">Último entrenamiento</h2>
          <p className="inicio__sesion">
            <Link className="enlace" to={`/historial/${ultima.id}`}>{ultima.titulo}</Link>
            <span className="inicio__fecha"> · {fechaCorta(ultima.fecha)}</span>
          </p>
          <div className="inicio__metricas">
            <Metrica valor={duracionLarga(ultima.duracion)} etiqueta="Duración" />
            <Metrica valor={miles(ultima.volumen_kg)} unidad="kg" etiqueta="Volumen" />
          </div>
          <Link className="enlace" to="/historial">Ver historial</Link>
        </section>
      )}

      <section aria-labelledby="tit-favoritos" className="seccion">
        <h2 id="tit-favoritos" className="seccion__titulo">Tus favoritos</h2>
        {favoritos.isSuccess && favoritos.data.items.length === 0 && (
          <p className="aviso">Todavía no marcaste favoritos. Tocá el corazón de un ejercicio para tenerlo a mano.</p>
        )}
        {favoritos.isSuccess && favoritos.data.items.length > 0 && (
          <>
            <div className="tira">{favoritos.data.items.map(e => <TarjetaEjercicio key={e.id} ejercicio={e} />)}</div>
            <Link className="enlace" to="/ejercicios?favoritos=1">Ver todos</Link>
          </>
        )}
      </section>

      <section aria-labelledby="tit-destacados" className="seccion">
        <h2 id="tit-destacados" className="seccion__titulo">Para probar hoy</h2>
        {destacados.isSuccess && (
          <div className="grilla-ej">{destacados.data.map(e => <TarjetaEjercicio key={e.id} ejercicio={e} />)}</div>
        )}
      </section>
    </div>
  )
}
