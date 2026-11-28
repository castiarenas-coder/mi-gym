// Primer vínculo de un equipo con una cuenta: decidir qué hacer con lo que ya hay de cada lado y unificar personas.
//
// Estado propio en `sync_estado`: `cuenta` = identificador de la cuenta a la que está vinculado el equipo (se guarda
// recién cuando el vínculo terminó). Vincular a otra cuenta distinta de la guardada reinicia todo el estado de
// sincronización (cursor, envío, lápidas, alias) para que nada de la cuenta anterior se filtre a la nueva.
//
// Errores con `codigo` (ErrorVinculo): modo_invalido, otra_cuenta, nube_vacia, equipo_con_datos, entrenamiento_en_curso.

import { sincronizar, reiniciarBajada, enTransaccion, leer, guardar, aplicarDescarga, asegurarPersona } from './motor.js';
import { ahoraDespues, fusionarPersona, registrarAlias, quitarPersonaFusionada } from './documentos.js';
import { esPlantillaSinTocar } from '../plantillas.js';
import { backupDb } from '../backup.js';
import { TABLAS_USUARIO } from '../respaldo.js';

export class ErrorVinculo extends Error {
  constructor(codigo, mensaje) { super(mensaje); this.codigo = codigo; }
}

const MODOS = ['subir', 'bajar', 'juntar', 'reemplazar'];
const MAX_PAGINAS = 1000;
// La persona que crea la migración 2 y que nadie tocó: no cuenta como "datos propios" del equipo.
const PERSONA_INICIAL = { nombre: 'Yo', color: '#c6ff3d', avatar: '' };

const cuantos = (db, tabla) => db.prepare(`SELECT COUNT(*) AS n FROM ${tabla}`).get().n;

/**
 * ¿El equipo tiene algo que el usuario haya cargado? Una instalación nueva (la persona inicial sin tocar y las
 * plantillas de ejemplo sin tocar ni usar) no cuenta.
 */
function tieneDatosPropios(db) {
  if (['sesiones', 'medidas', 'perfil', 'favoritos'].some(t => cuantos(db, t) > 0)) return true;
  if (db.prepare('SELECT id, nombre, descripcion FROM rutinas').all().some(r => !esPlantillaSinTocar(db, r))) return true;
  const personas = db.prepare('SELECT nombre, color, avatar FROM personas').all();
  return personas.length > 1 || personas.some(p =>
    p.nombre !== PERSONA_INICIAL.nombre || p.color !== PERSONA_INICIAL.color || p.avatar !== PERSONA_INICIAL.avatar);
}

/** Baja todas las páginas del remoto a memoria (los datos de una familia son chicos). */
async function descargarTodo(remoto) {
  const docs = [];
  let cursor = null;
  for (let pagina = 0; pagina < MAX_PAGINAS; pagina++) {
    const r = await remoto.bajar(cursor);
    const pag = r?.docs ?? [];
    docs.push(...pag);
    const siguiente = r?.cursor ?? cursor;
    if (!pag.length || siguiente === cursor) { cursor = siguiente; break; }
    cursor = siguiente;
  }
  return { docs, cursor };
}

/** ¿La nube tiene al menos un documento vivo? (Solo borrados = vacía.) */
async function nubeConDatos(remoto) {
  let cursor = null;
  for (let pagina = 0; pagina < MAX_PAGINAS; pagina++) {
    const r = await remoto.bajar(cursor);
    const docs = r?.docs ?? [];
    if (docs.some(d => !d.borrado)) return true;
    const siguiente = r?.cursor ?? cursor;
    if (!docs.length || siguiente === cursor) return false;
    cursor = siguiente;
  }
  return false;
}

export async function estadoVinculo(db, remoto) {
  if (!(await nubeConDatos(remoto))) return 'cuenta_vacia';
  return tieneDatosPropios(db) ? 'ambos_con_datos' : 'equipo_vacio';
}

/** Borra los datos sincronizados del equipo SIN dejar nada que subir: ni lápidas, ni personas muertas, ni alias, ni marca de envío. */
function vaciarSinBorrados(db) {
  for (const t of [...TABLAS_USUARIO].reverse()) if (t !== 'ajustes') db.exec(`DELETE FROM ${t}`);
  db.exec('DELETE FROM sync_borrados; DELETE FROM sync_muertas; DELETE FROM sync_alias');
  reiniciarBajada(db);
  db.exec("DELETE FROM sync_estado WHERE clave IN ('ultimo_envio', 'ultima_sync', 'resubir')");
}

function reiniciarTodo(db) {
  enTransaccion(db, () => {
    db.exec('DELETE FROM sync_borrados; DELETE FROM sync_muertas; DELETE FROM sync_alias');
    reiniciarBajada(db);
    db.exec("DELETE FROM sync_estado WHERE clave IN ('ultimo_envio', 'ultima_sync', 'resubir')");
  });
}

/**
 * Vincula el equipo y hace la primera sincronización.
 *  - subir: cuenta nueva, sube todo lo del equipo.
 *  - bajar: equipo sin datos propios, se queda con lo de la nube.
 *  - juntar: conserva lo del equipo y suma lo de la nube (por documento gana el más nuevo).
 *  - reemplazar: la nube manda; lo del equipo se descarta sin avisarle nada a la nube.
 * `bajar` y `reemplazar` vacían el equipo: exigen `backupsDir` (se guarda un respaldo antes), la nube con datos y que no haya
 * un entrenamiento en curso; todo (vaciar + aplicar la descarga) ocurre en una transacción, así que una caída deja el equipo intacto.
 * Opciones: `cuenta` (identificador de la cuenta), `forzar` (permite `subir`/`juntar` con una cuenta distinta de la guardada),
 * `backupsDir`.
 */
export async function vincular(db, remoto, modo, { cuenta, forzar = false, backupsDir } = {}) {
  if (!MODOS.includes(modo)) throw new ErrorVinculo('modo_invalido', `Modo de vínculo inválido: ${modo}`);
  const destructivo = modo === 'bajar' || modo === 'reemplazar';
  const previa = leer(db, 'cuenta');
  const otra = cuenta !== undefined && previa != null && previa !== String(cuenta);
  if (otra && !destructivo && !forzar) {
    throw new ErrorVinculo('otra_cuenta', 'Este equipo ya está vinculado a otra cuenta: solo se puede reemplazar o bajar sus datos.');
  }

  if (destructivo) {
    if (!backupsDir) throw new Error('vincular: falta backupsDir (el respaldo previo es obligatorio)');
    if (db.prepare("SELECT 1 FROM sesiones WHERE estado = 'en_curso' LIMIT 1").get()) {
      throw new ErrorVinculo('entrenamiento_en_curso', 'Hay un entrenamiento en curso: terminalo antes de vincular.');
    }
    if (modo === 'bajar' && tieneDatosPropios(db)) {
      throw new ErrorVinculo('equipo_con_datos', 'Este equipo tiene datos propios: elegí juntar o reemplazar.');
    }
    const { docs, cursor } = await descargarTodo(remoto); // si falla acá, el equipo no se toca
    if (!docs.some(d => !d.borrado)) throw new ErrorVinculo('nube_vacia', 'La cuenta no tiene datos para bajar.');
    backupDb(db, backupsDir);
    enTransaccion(db, () => {
      vaciarSinBorrados(db);
      aplicarDescarga(db, docs, cursor);
      asegurarPersona(db); // la app necesita al menos una persona (no debería hacer falta: la nube tiene datos)
    });
  } else {
    if (otra) reiniciarTodo(db);
    if (modo === 'juntar') reiniciarBajada(db);
  }

  await sincronizar(db, remoto, {});
  if (cuenta !== undefined) guardar(db, 'cuenta', String(cuenta));
}

const clavePorNombre = (nombre) => nombre.trim().toLowerCase();

/**
 * Personas con el mismo nombre (sin distinguir mayúsculas ni espacios en los bordes). Se conserva siempre la de `uid`
 * menor: así, si cada equipo unifica por su cuenta, los dos eligen la misma y convergen (y los alias no hacen ciclos).
 */
export function personasDuplicadas(db) {
  const grupos = new Map();
  for (const p of db.prepare('SELECT id, uid, nombre FROM personas ORDER BY uid').all()) {
    const k = clavePorNombre(p.nombre);
    if (!grupos.has(k)) grupos.set(k, []);
    grupos.get(k).push(p);
  }
  const out = [];
  for (const [, [conservada, ...otras]] of grupos) {
    for (const o of otras) out.push({ conservar: conservada.id, duplicada: o.id, nombre: conservada.nombre });
  }
  return out;
}

/**
 * Pasa todo lo de `duplicada` a `conservar` (que debe tener el uid menor) y la quita de este equipo.
 * Unificar es un alias, no un borrado: la persona duplicada queda viva en la nube con `unificada_en` y cualquier
 * documento suyo que llegue después (de un equipo que no se enteró) se aplica bajo la conservada. No deja lápida
 * de persona. Detalle de choques y re-estampado en `fusionarPersona`.
 */
export function unificarPersonas(db, conservar, duplicada) {
  if (conservar === duplicada) throw new Error('Hay que elegir dos personas distintas.');
  const destino = db.prepare('SELECT id, uid FROM personas WHERE id = ?').get(conservar);
  const origen = db.prepare('SELECT * FROM personas WHERE id = ?').get(duplicada);
  if (!destino || !origen) throw new Error('La persona no existe.');
  if (!(destino.uid < origen.uid)) throw new Error('Se conserva la persona de uid menor (así los alias no hacen ciclos).');

  enTransaccion(db, () => {
    fusionarPersona(db, origen.id, destino.id);
    registrarAlias(db, origen.uid, destino.uid, ahoraDespues(db, origen.actualizado),
      { nombre: origen.nombre, color: origen.color, avatar: origen.avatar, creada: origen.creada });
    quitarPersonaFusionada(db, origen.id, origen.uid);
  });
}
