import { Link } from 'react-router-dom'
import type { EjercicioResumen } from '../api/tipos'
import { AnimacionEjercicio } from './AnimacionEjercicio'
import { BotonFavorito } from './BotonFavorito'

export function TarjetaEjercicio({ ejercicio: e }: { ejercicio: EjercicioResumen }) {
  return (
    <article className="tarjeta-ej">
      <Link to={`/ejercicios/${encodeURIComponent(e.id)}`} className="tarjeta-ej__enlace">
        <AnimacionEjercicio ejercicio={e} miniatura className="tarjeta-ej__anim" />
        <div className="tarjeta-ej__texto">
          <h3 className="tarjeta-ej__nombre">{e.nombre}</h3>
          <div className="insignias">
            {e.musculo_principal && <span className="insignia insignia--acento">{e.musculo_principal}</span>}
            {e.equipo && <span className="insignia">{e.equipo}</span>}
          </div>
        </div>
      </Link>
      <BotonFavorito id={e.id} favorito={e.favorito} className="tarjeta-ej__fav" />
    </article>
  )
}
