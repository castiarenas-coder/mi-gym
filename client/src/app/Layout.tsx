import { NavLink, Outlet } from 'react-router-dom'
import { Settings } from 'lucide-react'
import { AvatarPersona } from '../components/AvatarPersona'
import { usePersonaActiva } from './PersonaContext'
import { SECCIONES } from './rutas'

export function Layout() {
  const { persona, cambiar } = usePersonaActiva()
  return (
    <div className="app">
      <header className="header">
        <span className="header__marca">MI <span>GYM</span></span>
        <button type="button" className="header__persona" aria-label={`Cambiar de persona (${persona.nombre})`} onClick={cambiar}>
          <AvatarPersona persona={persona} />
        </button>
        <NavLink to="/ajustes" className="header__ajustes" aria-label="Ajustes"><Settings size={22} aria-hidden /></NavLink>
      </header>
      <main className="contenido">
        <Outlet />
      </main>
      <nav className="nav" aria-label="Secciones">
        {SECCIONES.map(({ ruta, etiqueta, icono: Icono }) => (
          <NavLink key={ruta} to={ruta} end={ruta === '/'} className="nav__item">
            <Icono size={24} aria-hidden />
            <span>{etiqueta}</span>
          </NavLink>
        ))}
      </nav>
    </div>
  )
}
