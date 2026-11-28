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
//   rechazados    documentos que no se pudieron aplicar (JSON { "tipo|clave": { actualizado, error } }, los últimos 100);
//                 se saltean mientras la versión sea la misma y se reintentan si llega una más nueva
//   ultima_sync   cuándo terminó la última vuelta completa
//
// Garantías: nada se marca como enviado si `subir` falla (cualquier lote); el cursor solo avanza junto con la
// aplicación de ese mismo lote (una transacción), así que un corte no pierde ni repite trabajo de forma dañina.
// Notas: `sync_muertas` (en la base) nunca se poda (una fila por persona borrada, es chica). Descartar pendientes por
// MAX_PENDIENTES no se puede recuperar (queda en el registro). El desfase de relojes entre equipos es un límite aceptado
// del diseño (gana el `actualizado` más nuevo).
// Los errores del remoto se propagan tal cual: quien llama decide el mensaje y el reintento.

import { cambiosLocales, aplicarDocumento } from './documentos.js';

const LOTE_SUBIDA = 200;
const MAX_PAGINAS = 1000; // freno de seguridad contra un remoto que nunca termina
const MAX_PENDIENTES = 500; // tope de respaldo de la lista de espera (se descartan las más viejas)
const MAX_RECHAZADOS = 100;

// Errores que no dependen del documento (base ocupada o bloqueada, disco, memoria): se reintentan en otra vuelta,
// nunca van a cuarentena. Solo los errores determinísticos de datos (restricciones, formato) se rechazan.
const SQLITE_TRANSITORIOS = new Set([5, 6, 7, 10, 13]); // BUSY, LOCKED, NOMEM, IOERR, FULL
const esTransitorio = (err) => SQLITE_TRANSITORIOS.has((err?.errcode ?? 0) & 0xff)
  || /database is locked|database table is locked|busy|disk i\/o|disk is full|out of memory/i.test(String(err?.message));

// personas -> rutinas y perfiles -> sesiones, medidas y favoritos
const RANGO = { persona: 0, rutina: 1, perfil: 1, sesion: 2, medida: 2, favorito: 2 };
const ordenar = (docs) => [...docs].sort((a, b) => (RANGO[a.tipo] ?? 9) - (RANGO[b.tipo] ?? 9));
const claveDe = (d) => `${d.tipo}|${d.clave}`;

export const leer = (db, clave) => db.prepare('SELECT valor FROM sync_estado WHERE clave = ?').get(clave)?.valor ?? null;
export const guardar = (db, clave, valor) => db.prepare(
  'INSERT INTO sync_estado (clave, valor) VALUES (?, ?) ON CONFLICT (clave) DO UPDATE SET valor = excluded.valor').run(clave, valor);
const leerJson = (db, clave, defecto) => { try { return JSON.parse(leer(db, clave)) ?? defecto; } catch { return defecto; } };

/** Olvida lo bajado (cursor y lo que depende de él): la próxima vuelta vuelve a bajar todo de la nube. */
export function reiniciarBajada(db) {
  db.exec("DELETE FROM sync_estado WHERE clave IN ('cursor', 'eco', 'pendientes', 'rechazados')");
}

export function enTransaccion(db, fn) {
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
function aplicarLote(db, docs, rechazados) {
  let espera = ordenar(docs);
  let aplicados = 0;
  const eco = {};
  for (let progreso = true; progreso && espera.length;) {
    progreso = false;
    const siguiente = [];
    for (const d of espera) {
      const k = claveDe(d);
      if (rechazados[k]?.actualizado === d.actualizado) continue; // ya falló con esta misma versión
      let res;
      try { res = aplicarDocumento(db, d); } catch (err) {
        if (esTransitorio(err)) throw err; // aborta la vuelta: la página se deshace y el cursor no avanza
        // El savepoint ya deshizo este documento; se aparta y el resto sigue (el cursor pasa de largo).
        delete rechazados[k];
        rechazados[k] = { actualizado: d.actualizado, error: String(err?.message ?? err) };
        console.warn(`[sync] documento rechazado ${k}: ${rechazados[k].error}`);
        continue;
      }
      delete rechazados[k];
      if (res === 'en_espera') { siguiente.push(d); continue; }
      // 'degradado': quedó distinto del documento (perdió rutina o día); no es eco, así que se sube.
      if (res === 'aplicado' || res === 'degradado') { aplicados++; progreso = true; }
      if (res === 'aplicado') eco[k] = d.actualizado;
    }
    espera = siguiente;
  }
  for (const k of Object.keys(rechazados).slice(0, Math.max(0, Object.keys(rechazados).length - MAX_RECHAZADOS))) delete rechazados[k];
  if (espera.length > MAX_PENDIENTES) {
    console.warn(`[sync] ${espera.length - MAX_PENDIENTES} documentos en espera descartados (tope ${MAX_PENDIENTES})`);
    espera = espera.slice(-MAX_PENDIENTES);
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

// Aplica una página de documentos junto con el estado que la acompaña (rechazados, eco, pendientes y cursor).
// El llamador abre la transacción: todo se confirma o se deshace junto.
function aplicarPagina(db, pendientes, docs, cursor, rechazados) {
  const hecho = aplicarLote(db, unir(pendientes, docs), rechazados);
  guardar(db, 'rechazados', JSON.stringify(rechazados));
  const eco = { ...leerJson(db, 'eco', {}), ...hecho.eco };
  guardar(db, 'eco', JSON.stringify(eco));
  guardar(db, 'pendientes', JSON.stringify(hecho.espera));
  if (cursor != null) guardar(db, 'cursor', cursor);
  return hecho;
}

/**
 * Aplica una descarga completa de la nube (todas las páginas ya bajadas) como si fuera una vuelta de bajada.
 * No abre transacción: el llamador la une a lo que tenga que ser atómico (por ejemplo, vaciar el equipo).
 */
export function aplicarDescarga(db, docs, cursor) {
  return aplicarPagina(db, leerJson(db, 'pendientes', []), docs, cursor, leerJson(db, 'rechazados', {}));
}

/**
 * Una vuelta: primero sube, después baja. Devuelve { subidos, bajados, enEspera, rechazados, parcial? }.
 *  - subidos: documentos enviados; bajados: documentos aplicados localmente; enEspera: pendientes que quedan;
 *    rechazados: documentos en cuarentena (no se pudieron aplicar); parcial: true si se cortó por el tope de páginas.
 * Documentos en espera (llegaron antes que su persona/rutina): no frenan el cursor; se guardan en
 * `sync_estado.pendientes` y se reintentan en cada vuelta hasta que aparezca lo que les falta.
 */
export async function sincronizar(db, remoto, { ahora, lote = LOTE_SUBIDA } = {}) {
  let subidos = await subirCambios(db, remoto, lote);

  let bajados = 0;
  let cursor = leer(db, 'cursor');
  let pendientes = leerJson(db, 'pendientes', []);
  let primera = true;
  let completa = false;
  let procesados = 0;
  let rechazados = leerJson(db, 'rechazados', {});
  for (let pagina = 0; pagina < MAX_PAGINAS; pagina++) {
    const r = await remoto.bajar(cursor);
    const docs = r?.docs ?? [];
    const nuevoCursor = r?.cursor ?? cursor;
    // Sin novedades solo se reintentan las pendientes (una vez por vuelta), por si lo que faltaba llegó antes.
    if (!docs.length && !(primera && pendientes.length)) {
      if (nuevoCursor != null && nuevoCursor !== cursor) guardar(db, 'cursor', nuevoCursor);
      completa = true;
      break;
    }
    primera = false;
    procesados += docs.length;
    const res = enTransaccion(db, () => aplicarPagina(db, pendientes, docs, nuevoCursor, rechazados));
    bajados += res.aplicados;
    pendientes = res.espera;
    if (!docs.length || nuevoCursor === cursor) { completa = true; break; }
    cursor = nuevoCursor;
  }

  // Procesar lo bajado puede dejar cambios propios (una persona que revive, una sesión degradada): se suben ya.
  if (procesados > 0) subidos += await subirCambios(db, remoto, lote);

  guardar(db, 'ultima_sync', ahora ?? new Date().toISOString());
  const out = { subidos, bajados, enEspera: pendientes.length, rechazados: Object.keys(rechazados).length };
  if (!completa) out.parcial = true;
  return out;
}
