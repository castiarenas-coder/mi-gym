import { Route, Routes } from 'react-router-dom'
import { Layout } from './app/Layout'
import { SECCIONES } from './app/rutas'
import { Ejercicio } from './pages/Ejercicio'
import { Ejercicios } from './pages/Ejercicios'
import { Inicio } from './pages/Inicio'
import { Proximamente } from './pages/Proximamente'

const PROXIMAS = SECCIONES.filter(s => !['/', '/ejercicios'].includes(s.ruta))

export function App() {
  return (
    <Routes>
      <Route element={<Layout />}>
        <Route path="/" element={<Inicio />} />
        <Route path="/ejercicios" element={<Ejercicios />} />
        <Route path="/ejercicios/:id" element={<Ejercicio />} />
        {PROXIMAS.map(({ ruta, titulo, icono }) => (
          <Route key={ruta} path={ruta} element={<Proximamente titulo={titulo} icono={icono} />} />
        ))}
        <Route path="*" element={<Proximamente titulo="No encontramos esa página" icono={SECCIONES[0].icono} />} />
      </Route>
    </Routes>
  )
}
