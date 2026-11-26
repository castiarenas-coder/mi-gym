import { NavLink, Outlet } from 'react-router-dom'
import { Settings } from 'lucide-react'
import { AvatarPersona } from '../components/AvatarPersona'
import { Marca } from '../components/ui/Marca'
import { usePersonaActiva } from './PersonaContext'
import { SECCIONES } from './rutas'

// Celular: barra superior fina (marca, persona, ajustes) + barra inferior con las secciones.
// PC (>= 900 px): `.lateral` es una barra lateral; el CSS reubica los mismos elementos.
export function Layout() {
  const { persona, cambiar } = usePersonaActiva()
  return (
    <div className="app">
      <div className="lateral">
        <header className="header">
          <Marca />
          <button type="button" className="header__persona" aria-label={`Cambiar de persona (${persona.nombre})`} onClick={cambiar}>
            <AvatarPersona persona={persona} />
          </button>
          <NavLink to="/ajustes" className="header__ajustes" aria-label="Ajustes"><Settings size={22} aria-hidden /></NavLink>
        </header>
        <nav className="nav" aria-label="Secciones">
          {SECCIONES.map(({ ruta, etiqueta, icono: Icono }) => (
            <NavLink key={ruta} to={ruta} end={ruta === '/'} className="nav__item">
              <Icono size={24} aria-hidden />
              <span>{etiqueta}</span>
            </NavLink>
          ))}
        </nav>
      </div>
      <main className="contenido">
        <Outlet />
      </main>
    </div>
  )
}
