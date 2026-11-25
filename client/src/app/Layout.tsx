import { NavLink, Outlet } from 'react-router-dom'
import { SECCIONES } from './rutas'

export function Layout() {
  return (
    <div className="app">
      <header className="header">
        <span className="header__marca">MI <span>GYM</span></span>
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
