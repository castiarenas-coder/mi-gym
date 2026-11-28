// Fuzz con reloj controlado: N equipos, un remoto en memoria, operaciones al azar con semilla fija (altas, ediciones y
// borrados de todos los tipos, unificar personas y borrar personas) y sincronizaciones en momentos arbitrarios. El reloj de
// las marcas (JS y SQLite) es inyectado y avanza 0, 1 o 2 ms por paso, así que los empates de milisegundo son la norma
// y el resultado no depende de la velocidad de la máquina. Al final todos deben coincidir, sin nada esperando, sin ningún
// equipo sin personas y (en el modo "sin borrados") sin haber perdido nada de lo creado.
// FUZZ_SEMILLAS y FUZZ_DESDE permiten correr muchas más semillas (p. ej. FUZZ_SEMILLAS=500 node --test test/sync-fuzz-reloj.test.js).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { openDb, fijarReloj, fijarUuid } from '../server/db.js';
import { cambiosLocales } from '../server/sync/documentos.js';
import { sincronizar } from '../server/sync/motor.js';
import { personasDuplicadas, unificarPersonas } from '../server/sync/vincular.js';
import { crearRemotoEnMemoria } from './helpers-remoto.js';

const SEMILLAS = Number(process.env.FUZZ_SEMILLAS || 20);
const DESDE = Number(process.env.FUZZ_DESDE || 1);
const OPERACIONES = 40;
const BASE = Date.UTC(2026, 5, 1, 12, 0, 0);

const q = (db, sql, ...p) => db.prepare(sql).all(...p).map(f => ({ ...f }));
const vivos = (docs) => docs.filter(d => !d.borrado).map(d => JSON.stringify(d)).sort();
const nueva = () => {
  const db = openDb(':memory:');
  db.exec("INSERT INTO ejercicios (id, nombre) VALUES ('A', 'A'), ('B', 'B')");
  return db;
};
const pendientes = (db) => JSON.parse(db.prepare("SELECT valor FROM sync_estado WHERE clave = 'pendientes'").get()?.valor ?? '[]');

async function correr(semilla, N, sinBorrados) {
  let s = semilla;
  const rnd = () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 2 ** 32; };
  const pick = (a) => a[Math.floor(rnd() * a.length)];
  let ahora = BASE;
  const avanzar = () => { ahora += Math.floor(rnd() * 3); };
  fijarReloj(() => ahora);
  // uid con semilla: el orden de los uid decide qué persona se conserva al unificar, así que tienen que ser reproducibles.
  const h4 = () => Math.floor(rnd() * 65536).toString(16).padStart(4, '0');
  fijarUuid(() => `${h4()}${h4()}-${h4()}-4${h4().slice(1)}-8${h4().slice(1)}-${h4()}${h4()}${h4()}`);
  try {
    const D = Array.from({ length: N }, nueva);
    const remoto = crearRemotoEnMemoria({ pagina: pick([1, 2, 5, 1000]) });
    let c = 0;
    const creadas = new Set();
    const rastro = (etiqueta) => {
      if (!process.env.FUZZ_UID) return;
      D.forEach((db, i) => {
        const fila = db.prepare("SELECT s.actualizado a, substr(p.uid,1,8) p FROM sesiones s JOIN personas p ON p.id = s.persona_id WHERE s.uid LIKE ?").get(process.env.FUZZ_UID + '%');
        const lap = db.prepare("SELECT fecha FROM sync_borrados WHERE tipo = 'sesion' AND clave LIKE ?").get(process.env.FUZZ_UID + '%');
        const est = JSON.stringify([fila ? fila.a.slice(17) + '@' + fila.p : null, lap ? 'T' + lap.fecha.slice(17) : null]);
        if (db.__r !== est) { console.log('RASTRO', etiqueta, 'dev', i, est, 'ahora', String(ahora - BASE)); db.__r = est; }
      });
    };
    const sync = async (db) => { avanzar(); await sincronizar(db, remoto, {}); avanzar(); rastro('sync dev ' + D.indexOf(db)); };
    for (let i = 0; i < OPERACIONES; i++) {
      const db = pick(D);
      avanzar();
      const op = Math.floor(rnd() * (sinBorrados ? 12 : 14));
      try {
        const ps = q(db, 'SELECT id FROM personas');
        const p = pick(ps)?.id;
        const rs = q(db, 'SELECT id FROM rutinas');
        const ss = q(db, 'SELECT id FROM sesiones');
        if (op === 0) db.prepare("INSERT INTO personas (nombre, color, creada) VALUES (?, '#fff', 'x')").run(pick(['Yo', 'Ana', 'yo ']));
        else if (op === 1 && p) { db.prepare("INSERT INTO rutinas (nombre, dias, descripcion, persona_id) VALUES (?, '[]', '', ?)").run(`R${c++}`, p); creadas.add(db.prepare('SELECT uid FROM rutinas ORDER BY id DESC LIMIT 1').get().uid); }
        else if (op === 2 && p) { db.prepare("INSERT INTO sesiones (rutina_id, fecha, estado, persona_id) VALUES (?, ?, 'finalizada', ?)").run(pick(rs)?.id ?? null, `2026-0${1 + (c++ % 9)}-01T10:00:00.000Z`, p); creadas.add(db.prepare('SELECT uid FROM sesiones ORDER BY id DESC LIMIT 1').get().uid); }
        else if (op === 3 && rs.length) db.prepare('UPDATE rutinas SET nombre = ? WHERE id = ?').run(`E${c++}`, pick(rs).id);
        else if (op === 4 && p) db.prepare('INSERT OR REPLACE INTO medidas (persona_id, fecha, peso_kg) VALUES (?, ?, ?)').run(p, `2026-01-0${1 + (c++ % 3)}`, 50 + c);
        else if (op === 5 && p) db.prepare('INSERT OR IGNORE INTO favoritos (persona_id, ejercicio_id) VALUES (?, ?)').run(p, pick(['A', 'B']));
        else if (op === 6 && ss.length) db.prepare('UPDATE sesiones SET nota = ? WHERE id = ?').run(`n${c++}`, pick(ss).id);
        else if (op === 7 && p) db.prepare('UPDATE personas SET color = ? WHERE id = ?').run(`#${c++ % 999}`, p);
        else if (op === 8 && p) db.prepare('INSERT OR REPLACE INTO perfil (persona_id, altura) VALUES (?, ?)').run(p, 150 + c++);
        else if (op >= 9 && op <= 11) { const d = personasDuplicadas(db); if (d.length) { const x = pick(d); unificarPersonas(db, x.conservar, x.duplicada); } }
        else if (op === 12 && ss.length) db.prepare('DELETE FROM sesiones WHERE id = ?').run(pick(ss).id);
        else if (op === 13 && ps.length > 1) db.prepare('DELETE FROM personas WHERE id = ?').run(pick(ps).id);
      } catch (e) { if (!/UNIQUE|FOREIGN/.test(e.message)) throw e; }
      rastro('op ' + op);
      if (rnd() < 0.4) await sync(pick(D));
    }
    for (let ronda = 0; ronda < 20; ronda++) {
      let t = 0;
      for (const db of D) { avanzar(); const r = await sincronizar(db, remoto, {}); t += r.subidos + r.bajados; rastro('ronda dev ' + D.indexOf(db)); }
      if (!t) break;
    }
    const estados = D.map(db => JSON.stringify(vivos(cambiosLocales(db, null))));
    const detalle = `semilla ${semilla}, N=${N}${sinBorrados ? ', sin borrados' : ''}`;
    if (process.env.FUZZ_DEBUG && !estados.every(e => e === estados[0])) volcar(D, remoto);
    assert.ok(estados.every(e => e === estados[0]), `no convergen (${detalle})`);
    for (const db of D) {
      assert.equal(pendientes(db).length, 0, `quedan documentos esperando (${detalle})`);
      assert.ok(db.prepare('SELECT COUNT(*) n FROM personas').get().n > 0, `equipo sin personas (${detalle})`);
    }
    if (sinBorrados) {
      for (const db of D) {
        const hay = new Set([...q(db, 'SELECT uid FROM sesiones'), ...q(db, 'SELECT uid FROM rutinas')].map(x => x.uid));
        for (const u of creadas) assert.ok(hay.has(u), `se perdió ${u} (${detalle})`);
      }
    }
  } finally {
    fijarReloj(null);
    fijarUuid(null);
  }
}

for (const N of [3, 4]) {
  for (const sinBorrados of [false, true]) {
    test(`fuzz con reloj controlado: ${N} equipos${sinBorrados ? ', sin borrados' : ', con borrados'}`, async () => {
      for (let semilla = DESDE; semilla < DESDE + SEMILLAS; semilla++) await correr(semilla, N, sinBorrados);
    });
  }
}

// Diagnóstico (FUZZ_DEBUG=1): qué documentos difieren entre equipos y el estado de personas, alias y lápidas de cada uno.
function volcar(D, remoto) {
  const conjuntos = D.map(db => new Set(vivos(cambiosLocales(db, null))));
  const todos = new Set(conjuntos.flatMap(x => [...x]));
  for (const x of todos) {
    const tiene = conjuntos.map(z => (z.has(x) ? 1 : 0));
    if (tiene.some(h => !h)) { const o = JSON.parse(x); console.log('DIFF', tiene.join(''), o.tipo, o.clave.slice(0, 8), o.actualizado.slice(14), JSON.stringify(o.datos).slice(0, 160)); }
  }
  D.forEach((db, i) => console.log('DEV', i, 'personas', q(db, 'SELECT substr(uid,1,8) u FROM personas').map(x => x.u).join(','),
    'muertas', JSON.stringify(q(db, 'SELECT substr(persona,1,8) p, substr(fecha,14) f, viva FROM sync_muertas')),
    'alias', JSON.stringify(q(db, 'SELECT substr(origen,1,8) o, substr(destino,1,8) d, substr(actualizado,14) a FROM sync_alias')),
    'borr', JSON.stringify(q(db, 'SELECT tipo, substr(clave,1,8) c, substr(fecha,14) f, por_alias p FROM sync_borrados'))));
  D.forEach((db, i) => console.log('EST', i, JSON.stringify(q(db, "SELECT clave, substr(valor, 1, 300) v FROM sync_estado WHERE clave IN ('ultimo_envio','envio_claves','eco','cursor')"))));
  console.log('CLOUD', JSON.stringify(remoto.documentos().filter(x => !process.env.FUZZ_CLAVE || x.clave.startsWith(process.env.FUZZ_CLAVE)).map(x => [x.tipo, x.clave.slice(0, 8), x.borrado, x.actualizado.slice(14), x.datos?.persona?.slice(0, 8), x.datos?.unificada_en?.slice(0, 8)])));
}
