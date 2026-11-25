import { Route, Routes } from 'react-router-dom'
import { Layout } from './app/Layout'
import { ProveedorPersona } from './app/PersonaContext'
import { SECCIONES } from './app/rutas'
import { Ajustes } from './pages/Ajustes'
import { Ejercicio } from './pages/Ejercicio'
import { Ejercicios } from './pages/Ejercicios'
import { Entrenar } from './pages/Entrenar'
import { Historial, HistorialDetalle } from './pages/Historial'
import { Inicio } from './pages/Inicio'
import { Progreso } from './pages/Progreso'
import { Proximamente } from './pages/Proximamente'
import { Rutina } from './pages/Rutina'
import { Rutinas } from './pages/Rutinas'

const PROXIMAS = SECCIONES.filter(s => !['/', '/ejercicios', '/rutinas', '/entrenar', '/progreso'].includes(s.ruta))

export function App() {
  return (
    <ProveedorPersona>
    <Routes>
      <Route element={<Layout />}>
        <Route path="/" element={<Inicio />} />
        <Route path="/ejercicios" element={<Ejercicios />} />
        <Route path="/ejercicios/:id" element={<Ejercicio />} />
        <Route path="/rutinas" element={<Rutinas />} />
        <Route path="/rutinas/:id" element={<Rutina />} />
        <Route path="/entrenar" element={<Entrenar />} />
        <Route path="/progreso" element={<Progreso />} />
        <Route path="/ajustes" element={<Ajustes />} />
        <Route path="/historial" element={<Historial />} />
        <Route path="/historial/:id" element={<HistorialDetalle />} />
        {PROXIMAS.map(({ ruta, titulo, icono }) => (
          <Route key={ruta} path={ruta} element={<Proximamente titulo={titulo} icono={icono} />} />
        ))}
        <Route path="*" element={<Proximamente titulo="No encontramos esa página" icono={SECCIONES[0].icono} />} />
      </Route>
    </Routes>
    </ProveedorPersona>
  )
}
