// Motor de sincronización: sube los cambios locales a un `remoto` abstracto y baja los ajenos.
//
//   interface Remoto {
//     subir(docs): Promise<void>            // upsert por (tipo, clave); el remoto conserva solo el más nuevo
//     bajar(cursor): Promise<{ docs, cursor }> // documentos con servidor_en posterior al cursor, en ese orden
//   }
//
// Estado en `sync_estado`:
//   ultimo_envio  mayor `actualizado` ya subido (los cambios locales son los posteriores a esa marca)
//   cursor        hasta dónde se bajó del remoto (opaco para el motor)
//   pendientes    documentos bajados que esperan a su persona/rutina (JSON; sobreviven a un reinicio)
//   eco           documentos aplicados desde el remoto, para no volver a subirlos (JSON { "tipo|clave": actualizado })
//   ultima_sync   cuándo terminó la última vuelta completa
//
// Garantías: nada se marca como enviado si `subir` falla (cualquier lote); el cursor solo avanza junto con la
// aplicación de ese mismo lote (una transacción), así que un corte no pierde ni repite trabajo de forma dañina.
// Los errores del remoto se propagan tal cual: quien llama decide el mensaje y el reintento.

import { cambiosLocales, aplicarDocumento } from './documentos.js';

const LOTE_SUBIDA = 200;
const MAX_PAGINAS = 1000; // freno de seguridad contra un remoto que nunca termina

// personas -> rutinas y perfiles -> sesiones, medidas y favoritos
const RANGO = { persona: 0, rutina: 1, perfil: 1, sesion: 2, medida: 2, favorito: 2 };
const ordenar = (docs) => [...docs].sort((a, b) => (RANGO[a.tipo] ?? 9) - (RANGO[b.tipo] ?? 9));
const claveDe = (d) => `${d.tipo}|${d.clave}`;

const leer = (db, clave) => db.prepare('SELECT valor FROM sync_estado WHERE clave = ?').get(clave)?.valor ?? null;
const guardar = (db, clave, valor) => db.prepare(
  'INSERT INTO sync_estado (clave, valor) VALUES (?, ?) ON CONFLICT (clave) DO UPDATE SET valor = excluded.valor').run(clave, valor);
const leerJson = (db, clave, defecto) => { try { return JSON.parse(leer(db, clave)) ?? defecto; } catch { return defecto; } };

function enTransaccion(db, fn) {
  db.exec('BEGIN');
  try { const r = fn(); db.exec('COMMIT'); return r; }
  catch (err) { db.exec('ROLLBACK'); throw err; }
}

/** Sube lo local pendiente, en lotes. Devuelve la cantidad de documentos subidos. */
async function subirCambios(db, remoto, lote) {
  const ultimo = leer(db, 'ultimo_envio');
  const eco = leerJson(db, 'eco', {});
  // Lo recién bajado aparece como "cambio local"; se descarta solo si sigue siendo exactamente esa versión.
  const docs = cambiosLocales(db, ultimo).filter(d => eco[claveDe(d)] !== d.actualizado);
  for (let i = 0; i < docs.length; i += lote) await remoto.subir(docs.slice(i, i + lote));
  const nuevo = docs.reduce((m, d) => (d.actualizado > m ? d.actualizado : m), ultimo ?? '');
  // La marca avanza solo hasta lo realmente subido (nunca hasta un reloj ajeno), y recién ahora, con todo subido.
  if (docs.length) guardar(db, 'ultimo_envio', nuevo);
  const vigentes = Object.fromEntries(Object.entries(eco).filter(([, act]) => act > (nuevo || '')));
  if (Object.keys(vigentes).length !== Object.keys(eco).length) guardar(db, 'eco', JSON.stringify(vigentes));
  return docs.length;
}

/** Aplica un conjunto de documentos; los que esperan algo se reintentan mientras otros avancen. */
function aplicarLote(db, docs) {
  let espera = ordenar(docs);
  let aplicados = 0;
  const eco = {};
  for (let progreso = true; progreso && espera.length;) {
    progreso = false;
    const siguiente = [];
    for (const d of espera) {
      const res = aplicarDocumento(db, d);
      if (res === 'en_espera') { siguiente.push(d); continue; }
      if (res === 'aplicado') { aplicados++; eco[claveDe(d)] = d.actualizado; progreso = true; }
    }
    espera = siguiente;
  }
  return { aplicados, espera, eco };
}

// Une las pendientes con lo recién bajado; de cada documento queda la versión más nueva.
function unir(pendientes, nuevos) {
  const m = new Map();
  for (const d of [...pendientes, ...nuevos]) {
    const previo = m.get(claveDe(d));
    if (!previo || d.actualizado >= previo.actualizado) m.set(claveDe(d), d);
  }
  return [...m.values()];
}

/**
 * Una vuelta: primero sube, después baja. Devuelve { subidos, bajados, enEspera }.
 *  - subidos: documentos enviados; bajados: documentos aplicados localmente; enEspera: pendientes que quedan.
 * Documentos en espera (llegaron antes que su persona/rutina): no frenan el cursor; se guardan en
 * `sync_estado.pendientes` y se reintentan en cada vuelta hasta que aparezca lo que les falta.
 */
export async function sincronizar(db, remoto, { ahora, lote = LOTE_SUBIDA } = {}) {
  const subidos = await subirCambios(db, remoto, lote);

  let bajados = 0;
  let cursor = leer(db, 'cursor');
  let pendientes = leerJson(db, 'pendientes', []);
  let primera = true;
  for (let pagina = 0; pagina < MAX_PAGINAS; pagina++) {
    const r = await remoto.bajar(cursor);
    const docs = r?.docs ?? [];
    const nuevoCursor = r?.cursor ?? cursor;
    // Sin novedades solo se reintentan las pendientes (una vez por vuelta), por si lo que faltaba llegó antes.
    if (!docs.length && !(primera && pendientes.length)) break;
    primera = false;
    const res = enTransaccion(db, () => {
      const hecho = aplicarLote(db, unir(pendientes, docs));
      const eco = { ...leerJson(db, 'eco', {}), ...hecho.eco };
      guardar(db, 'eco', JSON.stringify(eco));
      guardar(db, 'pendientes', JSON.stringify(hecho.espera));
      if (nuevoCursor != null) guardar(db, 'cursor', nuevoCursor);
      return hecho;
    });
    bajados += res.aplicados;
    pendientes = res.espera;
    if (!docs.length || nuevoCursor === cursor) break;
    cursor = nuevoCursor;
  }

  guardar(db, 'ultima_sync', ahora ?? new Date().toISOString());
  return { subidos, bajados, enEspera: pendientes.length };
}
