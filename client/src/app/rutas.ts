import { Home, Dumbbell, ClipboardList, Play, TrendingUp, type LucideIcon } from 'lucide-react'

export interface Seccion { ruta: string; etiqueta: string; titulo: string; icono: LucideIcon }

export const SECCIONES: Seccion[] = [
  { ruta: '/', etiqueta: 'Inicio', titulo: 'Inicio', icono: Home },
  { ruta: '/ejercicios', etiqueta: 'Ejercicios', titulo: 'Ejercicios', icono: Dumbbell },
  { ruta: '/rutinas', etiqueta: 'Rutinas', titulo: 'Rutinas', icono: ClipboardList },
  { ruta: '/entrenar', etiqueta: 'Entrenar', titulo: 'Entrenar', icono: Play },
  { ruta: '/progreso', etiqueta: 'Progreso', titulo: 'Progreso', icono: TrendingUp },
]
