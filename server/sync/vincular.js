// Primer vínculo de un equipo con una cuenta: decidir qué hacer con lo que ya hay de cada lado y unificar personas.
//
// Estado propio en `sync_estado`: `cuenta` = identificador de la cuenta a la que está vinculado el equipo. Vincular a
// otra cuenta distinta de la guardada reinicia todo el estado de sincronización (cursor, envío, lápidas) para que
// nada de la cuenta anterior se filtre a la nueva.

import { sincronizar, reiniciarBajada, enTransaccion, leer, guardar } from './motor.js';
import { TABLAS_USUARIO } from '../respaldo.js';

const MODOS = ['subir', 'bajar', 'juntar', 'reemplazar'];
const MAX_PAGINAS = 1000;
// La persona que crea la migración 2 y que nadie tocó: no cuenta como "datos propios" del equipo.
const PERSONA_INICIAL = { nombre: 'Yo', color: '#c6ff3d', avatar: '' };

const cuantos = (db, tabla) => db.prepare(`SELECT COUNT(*) AS n FROM ${tabla}`).get().n;

/** ¿El equipo tiene algo que el usuario haya cargado? Una sola persona inicial sin tocar y nada más = no. */
function tieneDatosPropios(db) {
  if (['rutinas', 'sesiones', 'medidas', 'perfil', 'favoritos'].some(t => cuantos(db, t) > 0)) return true;
  const personas = db.prepare('SELECT nombre, color, avatar FROM personas').all();
  return personas.length > 1 || personas.some(p =>
    p.nombre !== PERSONA_INICIAL.nombre || p.color !== PERSONA_INICIAL.color || p.avatar !== PERSONA_INICIAL.avatar);
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

/** Borra los datos sincronizados del equipo SIN dejar nada que subir: ni lápidas, ni personas muertas, ni marca de envío. */
function vaciarSinBorrados(db) {
  enTransaccion(db, () => {
    for (const t of [...TABLAS_USUARIO].reverse()) if (t !== 'ajustes') db.exec(`DELETE FROM ${t}`);
    db.exec('DELETE FROM sync_borrados; DELETE FROM sync_muertas');
    reiniciarBajada(db);
    db.exec("DELETE FROM sync_estado WHERE clave = 'ultimo_envio'");
  });
}

function reiniciarTodo(db) {
  enTransaccion(db, () => {
    db.exec('DELETE FROM sync_borrados; DELETE FROM sync_muertas');
    reiniciarBajada(db);
    db.exec("DELETE FROM sync_estado WHERE clave IN ('ultimo_envio', 'ultima_sync')");
  });
}

/**
 * Vincula el equipo y hace la primera sincronización.
 *  - subir: cuenta nueva, sube todo lo del equipo.
 *  - bajar: equipo sin datos propios, se queda con lo de la nube.
 *  - juntar: conserva lo del equipo y suma lo de la nube (por documento gana el más nuevo).
 *  - reemplazar: la nube manda; lo del equipo se descarta sin avisarle nada a la nube.
 * `cuenta` (opcional): identificador de la cuenta; si cambia respecto de la guardada se reinicia el estado de sincronización.
 */
export async function vincular(db, remoto, modo, { cuenta } = {}) {
  if (!MODOS.includes(modo)) throw new Error(`Modo de vínculo inválido: ${modo}`);
  if (cuenta !== undefined) {
    const previa = leer(db, 'cuenta');
    if (previa != null && previa !== String(cuenta)) reiniciarTodo(db);
    guardar(db, 'cuenta', String(cuenta));
  }
  if (modo === 'juntar') reiniciarBajada(db);
  if (modo === 'bajar' || modo === 'reemplazar') {
    await remoto.bajar(null); // sondeo: si la nube no responde, el equipo no se toca
    vaciarSinBorrados(db);
  }
  await sincronizar(db, remoto, {});
  // Una nube sin personas deja al equipo sin ninguna: la app necesita al menos una (se sube en la próxima vuelta).
  if (cuantos(db, 'personas') === 0) {
    db.prepare('INSERT INTO personas (nombre, color, avatar, creada) VALUES (?, ?, ?, ?)')
      .run(PERSONA_INICIAL.nombre, PERSONA_INICIAL.color, PERSONA_INICIAL.avatar, new Date().toISOString());
  }
}

const clavePorNombre = (nombre) => nombre.trim().toLowerCase();

/**
 * Personas con el mismo nombre (sin distinguir mayúsculas ni espacios en los bordes). Se conserva siempre la de `uid`
 * menor: así, si cada equipo unifica por su cuenta, los dos eligen la misma y convergen.
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
 * Pasa todo lo de `duplicada` a `conservar` y borra la duplicada.
 * Choques por clave natural: en medidas (misma fecha) y perfil gana la fila con `actualizado` más nuevo;
 * en favoritos se suman. Las rutinas y sesiones conservan su uid y se re-estampan para subir bajo la nueva persona.
 * Las medidas, perfil y favoritos cambian de clave (la persona va en la clave): se copian a la conservada y se borran de
 * la duplicada, así la clave vieja queda con lápida y la nueva se sube.
 */
export function unificarPersonas(db, conservar, duplicada) {
  if (conservar === duplicada) throw new Error('Hay que elegir dos personas distintas.');
  const destino = db.prepare('SELECT id FROM personas WHERE id = ?').get(conservar);
  const origen = db.prepare('SELECT id, uid FROM personas WHERE id = ?').get(duplicada);
  if (!destino || !origen) throw new Error('La persona no existe.');

  enTransaccion(db, () => {
    const rutinas = db.prepare('SELECT id FROM rutinas WHERE persona_id = ?').all(duplicada).map(r => r.id);
    const sesiones = db.prepare('SELECT id FROM sesiones WHERE persona_id = ?').all(duplicada).map(r => r.id);
    db.prepare('UPDATE rutinas SET persona_id = ? WHERE persona_id = ?').run(conservar, duplicada);
    db.prepare('UPDATE sesiones SET persona_id = ? WHERE persona_id = ?').run(conservar, duplicada);

    for (const m of db.prepare('SELECT * FROM medidas WHERE persona_id = ?').all(duplicada)) {
      const previa = db.prepare('SELECT actualizado FROM medidas WHERE persona_id = ? AND fecha = ?').get(conservar, m.fecha);
      if (!previa) {
        db.prepare('INSERT INTO medidas (persona_id, fecha, peso_kg, cintura, pecho, brazo, pierna, grasa_pct) VALUES (?, ?, ?, ?, ?, ?, ?, ?)')
          .run(conservar, m.fecha, m.peso_kg, m.cintura, m.pecho, m.brazo, m.pierna, m.grasa_pct);
      } else if (m.actualizado > previa.actualizado) {
        db.prepare('UPDATE medidas SET peso_kg = ?, cintura = ?, pecho = ?, brazo = ?, pierna = ?, grasa_pct = ? WHERE persona_id = ? AND fecha = ?')
          .run(m.peso_kg, m.cintura, m.pecho, m.brazo, m.pierna, m.grasa_pct, conservar, m.fecha);
      }
    }
    db.prepare('DELETE FROM medidas WHERE persona_id = ?').run(duplicada);

    const perfil = db.prepare('SELECT * FROM perfil WHERE persona_id = ?').get(duplicada);
    if (perfil) {
      const previo = db.prepare('SELECT actualizado FROM perfil WHERE persona_id = ?').get(conservar);
      const datos = [perfil.altura, perfil.edad, perfil.sexo, perfil.actividad, perfil.objetivo, perfil.fecha_nacimiento];
      if (!previo) {
        db.prepare('INSERT INTO perfil (persona_id, altura, edad, sexo, actividad, objetivo, fecha_nacimiento) VALUES (?, ?, ?, ?, ?, ?, ?)')
          .run(conservar, ...datos);
      } else if (perfil.actualizado > previo.actualizado) {
        db.prepare('UPDATE perfil SET altura = ?, edad = ?, sexo = ?, actividad = ?, objetivo = ?, fecha_nacimiento = ? WHERE persona_id = ?')
          .run(...datos, conservar);
      }
      db.prepare('DELETE FROM perfil WHERE persona_id = ?').run(duplicada);
    }

    db.prepare('INSERT OR IGNORE INTO favoritos (persona_id, ejercicio_id) SELECT ?, ejercicio_id FROM favoritos WHERE persona_id = ?')
      .run(conservar, duplicada);
    db.prepare('DELETE FROM favoritos WHERE persona_id = ?').run(duplicada);

    db.prepare('DELETE FROM ajustes WHERE clave = ?').run(`plantillas_sembradas:${duplicada}`);
    db.prepare('DELETE FROM personas WHERE id = ?').run(duplicada);

    // Lo movido se re-estampa DESPUÉS del borrado: así es más nuevo que la lápida de la persona (fecha T) y, en los demás
    // equipos, el borrado de la duplicada no se lleva las rutinas y sesiones que ahora son de la conservada.
    const T = db.prepare('SELECT fecha FROM sync_muertas WHERE persona = ?').get(origen.uid)?.fecha ?? '';
    const despues = db.prepare(
      "SELECT MAX(strftime('%Y-%m-%dT%H:%M:%fZ', 'now'), strftime('%Y-%m-%dT%H:%M:%fZ', ?, '+0.001 seconds')) AS t").get(T || '1970-01-01T00:00:00.000Z').t;
    for (const [tabla, ids] of [['rutinas', rutinas], ['sesiones', sesiones]]) {
      const fijar = db.prepare(`UPDATE ${tabla} SET actualizado = ? WHERE id = ?`);
      for (const id of ids) fijar.run(despues, id);
    }
  });
}
