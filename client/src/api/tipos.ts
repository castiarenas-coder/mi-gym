export interface EjercicioResumen {
  id: string
  nombre: string
  nombre_en: string
  musculo_principal: string | null
  musculos_sec: string[]
  equipo: string | null
  categoria: string | null
  nivel: string | null
  img_ini: string | null
  img_fin: string | null
  media_propia: string | null
  favorito: boolean
  traducido: number
}

export interface EjercicioDetalle extends EjercicioResumen {
  fuerza: string | null
  mecanica: string | null
  instrucciones: string[]
}

export interface PaginaEjercicios {
  total: number
  limit: number
  offset: number
  items: EjercicioResumen[]
}

export interface ValorFiltro { valor: string; cantidad: number }
export interface Filtros {
  musculos: ValorFiltro[]
  equipos: ValorFiltro[]
  niveles: ValorFiltro[]
  categorias: ValorFiltro[]
}

export interface ConsultaEjercicios {
  q?: string
  musculo?: string
  equipo?: string
  nivel?: string
  categoria?: string
  favoritos?: boolean
}

export interface RutinaResumen {
  id: number
  nombre: string
  descripcion: string
  total_ejercicios: number
  dias: { id: number; nombre: string; orden: number; cantidad: number }[]
}

export interface ItemRutina {
  id: number
  ejercicio_id: string
  orden: number
  series: number
  reps: string
  descanso_seg: number
  nota: string | null
  nombre: string
  musculo_principal: string | null
  equipo: string | null
  img_ini: string | null
  media_propia: string | null
}

export interface DiaRutina { id: number; nombre: string; orden: number; ejercicios: ItemRutina[] }
export interface RutinaDetalle { id: number; nombre: string; descripcion: string; dias: DiaRutina[] }
