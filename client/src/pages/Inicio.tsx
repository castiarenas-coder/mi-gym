import { Link } from 'react-router-dom'
import { ClipboardList, Dumbbell, Heart } from 'lucide-react'
import { useDestacados, useFavoritosInicio } from '../api/ejercicios'
import { TarjetaEjercicio } from '../components/TarjetaEjercicio'

const ACCESOS = [
  { a: '/ejercicios', texto: 'Buscar ejercicios', icono: Dumbbell },
  { a: '/rutinas', texto: 'Mis rutinas', icono: ClipboardList },
  { a: '/ejercicios?favoritos=1', texto: 'Favoritos', icono: Heart },
]

export function Inicio() {
  const favoritos = useFavoritosInicio()
  const destacados = useDestacados()

  return (
    <div className="pagina">
      <section className="portada">
        <p className="portada__sup">Mi Gym</p>
        <h1 className="portada__titulo">Hoy se <span>entrena</span></h1>
        <p className="portada__texto">Ejercicios, rutinas y progreso, todo en español y guardado en tu PC.</p>
      </section>

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
