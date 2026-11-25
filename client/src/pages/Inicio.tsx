import { Link } from 'react-router-dom'
import { ClipboardList, Dumbbell, Heart, History, Play, Settings } from 'lucide-react'
import { useResumenProgreso } from '../api/progreso'
import { useDestacados, useFavoritosInicio } from '../api/ejercicios'
import { TarjetaEjercicio } from '../components/TarjetaEjercicio'
import { duracionLarga, fechaCorta } from '../lib/formato'

const ACCESOS = [
  { a: '/ejercicios', texto: 'Buscar ejercicios', icono: Dumbbell },
  { a: '/rutinas', texto: 'Mis rutinas', icono: ClipboardList },
  { a: '/ejercicios?favoritos=1', texto: 'Favoritos', icono: Heart },
  { a: '/historial', texto: 'Historial', icono: History },
  { a: '/ajustes', texto: 'Ajustes y respaldo', icono: Settings },
]

export function Inicio() {
  const favoritos = useFavoritosInicio()
  const destacados = useDestacados()
  const resumen = useResumenProgreso().data

  return (
    <div className="pagina">
      <section className="portada">
        <p className="portada__sup">Mi Gym</p>
        <h1 className="portada__titulo">Hoy se <span>entrena</span></h1>
        <p className="portada__texto">Ejercicios, rutinas y progreso, todo en español y guardado en tu PC.</p>
      </section>

      {resumen && (
        <section className="tarjeta hoy" aria-label="Tu entrenamiento">
          {resumen.sesion_activa ? (
            <>
              <p className="hoy__sup">Entrenamiento en curso</p>
              <p className="hoy__titulo">{resumen.sesion_activa.titulo}</p>
              <Link to="/entrenar" className="boton boton--principal boton--ancho"><Play size={20} aria-hidden /> Continuar entrenamiento</Link>
            </>
          ) : (
            <>
              <Link to="/entrenar" className="boton boton--principal boton--ancho"><Play size={20} aria-hidden /> Empezar a entrenar</Link>
              <p className="hoy__datos">
                <span>{resumen.esta_semana.sesiones} esta semana</span>
                {resumen.racha.actual > 0 && <span>Racha: {resumen.racha.actual} {resumen.racha.actual === 1 ? 'semana' : 'semanas'}</span>}
              </p>
              {resumen.ultima_sesion && (
                <p className="hoy__ultimo">
                  Último: <Link className="enlace" to={`/historial/${resumen.ultima_sesion.id}`}>{resumen.ultima_sesion.titulo}</Link> · {fechaCorta(resumen.ultima_sesion.fecha)} · {duracionLarga(resumen.ultima_sesion.duracion)}
                </p>
              )}
            </>
          )}
        </section>
      )}

      <nav className="accesos" aria-label="Accesos rápidos">
        {ACCESOS.map(({ a, texto, icono: Icono }) => (
          <Link key={a} to={a} className="acceso">
            <Icono size={26} aria-hidden />
            <span>{texto}</span>
          </Link>
        ))}
      </nav>

      <section aria-labelledby="tit-favoritos" className="seccion">
        <h2 id="tit-favoritos" className="seccion__titulo">Tus favoritos</h2>
        {favoritos.isSuccess && favoritos.data.items.length === 0 && (
          <p className="aviso">Todavía no marcaste favoritos. Tocá el corazón de un ejercicio para tenerlo a mano.</p>
        )}
        {favoritos.isSuccess && favoritos.data.items.length > 0 && (
          <div className="tira">{favoritos.data.items.map(e => <TarjetaEjercicio key={e.id} ejercicio={e} />)}</div>
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
