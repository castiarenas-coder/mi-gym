// Errores de la cuenta y su traducción a un estado HTTP y un mensaje en castellano claro para la pantalla.
// Nunca se incluye el texto crudo de un error desconocido (podría traer datos internos o un token).

import { ErrorSupabase } from './supabase.js';
import { ErrorVinculo } from './vincular.js';

/** Algo falta para sincronizar: sin_sesion, plan_requerido, sin_consentimiento o sin_vinculo. */
export class ErrorCuenta extends Error {
  constructor(codigo, mensaje) { super(mensaje ?? codigo); this.name = 'ErrorCuenta'; this.codigo = codigo; }
}

/** Motivos por los que una vuelta automática simplemente no corre (no es un error). */
export const MOTIVOS_OMITIDOS = ['sin_sesion', 'plan_requerido', 'sin_consentimiento', 'sin_vinculo'];

const TABLA = {
  sin_red: [503, 'No hay conexión con la nube. Se reintenta solo en un rato.'],
  sin_sesion: [401, 'Iniciá sesión para continuar.'],
  sesion_vencida: [401, 'Tu sesión venció. Iniciá sesión de nuevo.'],
  plan_requerido: [402, 'La sincronización es parte del plan Pro.'],
  codigo_invalido: [400, 'El código no es correcto o ya venció.'],
  demasiados_intentos: [429, 'Demasiados intentos. Esperá unos minutos y probá de nuevo.'],
  servidor: [502, 'La nube tuvo un problema. Probá más tarde.'],
  respuesta: [502, 'La nube respondió algo inesperado. Probá más tarde.'],
  sin_consentimiento: [409, 'Antes de sincronizar tenés que aceptar el uso de tus datos.'],
  sin_vinculo: [409, 'Primero elegí qué hacer con los datos de este equipo y los de tu cuenta.'],
  modo_invalido: [400, 'Esa opción no es válida.'],
  otra_cuenta: [409, 'Este equipo ya está vinculado a otra cuenta.'],
  nube_vacia: [409, 'Tu cuenta todavía no tiene datos para bajar.'],
  equipo_con_datos: [409, 'Este equipo ya tiene datos propios: elegí juntar o reemplazar.'],
  entrenamiento_en_curso: [409, 'Hay un entrenamiento en curso: terminalo antes de vincular.'],
};

/** → { status, codigo, mensaje } */
export function traducir(err) {
  const conocido = err instanceof ErrorSupabase || err instanceof ErrorVinculo || err instanceof ErrorCuenta;
  const fila = conocido ? TABLA[err.codigo] : null;
  if (fila) return { status: fila[0], codigo: err.codigo, mensaje: fila[1] };
  return { status: 500, codigo: 'interno', mensaje: 'Algo salió mal. Probá de nuevo.' };
}
