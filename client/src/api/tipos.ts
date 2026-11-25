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

// ---- Entrenar ----
export interface SerieSesion { n: number; peso_kg: number | null; reps: number | null; rpe: number | null; hecha: boolean }

export interface EjercicioSesion {
  ejercicio_id: string
  nombre: string
  musculo_principal: string | null
  equipo: string | null
  img_ini: string | null
  img_fin: string | null
  media_propia: string | null
  orden: number
  series_plan: number
  reps_plan: string | null
  descanso_seg: number
  series: SerieSesion[]
}

export interface RecordSesion { ejercicio_id: string; nombre: string; tipo: 'peso' | '1rm'; valor: number; anterior: number | null }

export interface Sesion {
  id: number
  rutina_id: number | null
  dia_id: number | null
  titulo: string
  fecha: string
  fin: string | null
  duracion: number | null
  nota: string | null
  estado: 'en_curso' | 'finalizada'
  ejercicios: EjercicioSesion[]
  resumen: { series_hechas: number; ejercicios: number; volumen_kg: number; records: RecordSesion[] }
}

export interface SesionLista {
  id: number
  fecha: string
  titulo: string
  estado: 'en_curso' | 'finalizada'
  duracion: number | null
  nota: string | null
  series_hechas: number
  volumen_kg: number
  ejercicios: number
  nombres: string[]
}

export interface PaginaSesiones { total: number; limit: number; offset: number; items: SesionLista[] }

export interface UltimaVez { sesion_id: number | null; fecha: string | null; series: { n: number; peso_kg: number | null; reps: number | null; rpe: number | null }[] }

export interface HistorialEjercicio {
  ejercicio_id: string
  total_sesiones: number
  sesiones: {
    sesion_id: number
    fecha: string
    series: { n: number; peso_kg: number | null; reps: number | null; rpe: number | null; e1rm: number | null }[]
    volumen_kg: number
    mejor_peso: number | null
    mejor_e1rm: number | null
    mejor_reps: number
  }[]
  mejor_peso: { peso_kg: number; reps: number | null; fecha: string } | null
  mejor_e1rm: { valor: number; peso_kg: number; reps: number | null; fecha: string } | null
}

// ---- Progreso ----
export interface Medida {
  fecha: string
  peso_kg: number | null
  cintura: number | null
  pecho: number | null
  brazo: number | null
  pierna: number | null
  grasa_pct: number | null
}

export interface Perfil {
  altura_cm: number | null
  edad: number | null
  fecha_nacimiento: string | null
  sexo: 'hombre' | 'mujer' | null
  actividad: 'sedentario' | 'ligero' | 'moderado' | 'intenso' | 'muy_intenso' | null
  objetivo: 'bajar' | 'mantener' | 'subir' | null
}

export interface CalculosPerfil {
  imc: number | null
  categoria_imc: string | null
  bmr: number | null
  tdee: number | null
  kcal_objetivo: number | null
  macros: { proteina_g: number; grasa_g: number; carbohidratos_g: number } | null
}

export interface RespuestaPerfil { perfil: Perfil; peso_kg: number | null; fecha_peso: string | null; calculos: CalculosPerfil | null }

export interface RecordEjercicio {
  ejercicio_id: string
  nombre: string
  img_ini: string | null
  img_fin: string | null
  media_propia: string | null
  peso_max: number | null
  fecha_peso: string | null
  e1rm_max: number | null
  fecha_e1rm: string | null
  sesiones: number
}

export interface ResumenProgreso {
  semanas: { inicio: string; sesiones: number; volumen_kg: number }[]
  esta_semana: { sesiones: number; volumen_kg: number }
  racha: { actual: number; mejor: number }
  total_sesiones: number
  volumen_total_kg: number
  records: RecordEjercicio[]
  ultima_sesion: { id: number; titulo: string; fecha: string; duracion: number | null; volumen_kg: number } | null
  sesion_activa: { id: number; titulo: string; fecha: string } | null
}
