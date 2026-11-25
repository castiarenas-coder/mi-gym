import { Route, Routes } from 'react-router-dom'
import { Layout } from './app/Layout'
import { SECCIONES } from './app/rutas'
import { Proximamente } from './pages/Proximamente'

export function App() {
  return (
    <Routes>
      <Route element={<Layout />}>
        {SECCIONES.map(({ ruta, titulo, icono }) => (
          <Route key={ruta} path={ruta} element={<Proximamente titulo={titulo} icono={icono} />} />
        ))}
        <Route path="*" element={<Proximamente titulo="No encontramos esa página" icono={SECCIONES[0].icono} />} />
      </Route>
    </Routes>
  )
}
