// Fuzz determinista: 3 equipos, un remoto en memoria, operaciones al azar con semilla fija (altas, ediciones y
// borrados de todos los tipos, incluida la persona) y sincronizaciones en momentos arbitrarios y con páginas de
// distinto tamaño. Al final todos tienen que haber convergido y quedar sin trabajo.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { openDb } from '../server/db.js';
import { cambiosLocales } from '../server/sync/documentos.js';
import { sincronizar } from '../server/sync/motor.js';
import { crearRemotoEnMemoria } from './helpers-remoto.js';

const SEMILLAS = 40;
const OPERACIONES = 40;

const nueva = () => {
  const db = openDb(':memory:');
  db.exec("INSERT INTO ejercicios (id, nombre) VALUES ('A', 'A'), ('B', 'B')");
  return db;
};
const q = (db, sql, ...p) => db.prepare(sql).all(...p).map(f => ({ ...f }));
const esperar = (ms) => { const t = Date.now() + ms; while (Date.now() < t); };
const vivos = (docs) => docs.filter(d => !d.borrado).map(d => JSON.stringify(d)).sort();
// Del remoto se descartan los documentos muertos por el borrado de su persona: los de una persona borrada, y los de
// una que revivió (`muerta_desde`) que no sean posteriores al borrado. Si el equipo que borró o revivió no tenía
// alguno de ellos, queda vivo en la nube (inofensivo: nadie lo aplica) hasta que la nube lo limpie.
const vivosDelRemoto = (docs) => {
  const corte = new Map(); // persona -> fecha hasta la que está todo muerto
  for (const d of docs.filter(x => x.tipo === 'persona')) corte.set(d.clave, d.borrado ? '￿' : (d.datos.muerta_desde ?? ''));
  return vivos(docs.filter(d => d.tipo === 'persona' || !(d.actualizado <= (corte.get(d.datos?.persona) ?? ''))));
};

async function correr(semilla) {
  let s = semilla;
  const rnd = () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 2 ** 32; };
  const pick = (a) => a[Math.floor(rnd() * a.length)];
  const D = [nueva(), nueva(), nueva()];
  const remoto = crearRemotoEnMemoria({ pagina: pick([1, 2, 5, 1000]) });
  let c = 0;
  for (let i = 0; i < OPERACIONES; i++) {
    const db = pick(D);
    esperar(2); // un instante distinto por operación (los desempates por milisegundo no son lo que se prueba acá)
    const op = Math.floor(rnd() * 14);
    try {
      const ps = q(db, 'SELECT id FROM personas');
      const p = pick(ps)?.id;
      const rs = q(db, 'SELECT id FROM rutinas');
      const ss = q(db, 'SELECT id FROM sesiones');
      if (op === 0) db.prepare("INSERT INTO personas (nombre, color, creada) VALUES (?, '#fff', 'x')").run(`P${c++}`);
      else if (op === 1 && p) db.prepare("INSERT INTO rutinas (nombre, dias, descripcion, persona_id) VALUES (?, '[]', '', ?)").run(`R${c++}`, p);
      else if (op === 2 && p) db.prepare("INSERT INTO sesiones (rutina_id, fecha, estado, persona_id) VALUES (?, ?, 'finalizada', ?)").run(pick(rs)?.id ?? null, `2026-0${1 + (c++ % 9)}-01T10:00:00.000Z`, p);
      else if (op === 3 && rs.length) db.prepare('UPDATE rutinas SET nombre = ? WHERE id = ?').run(`E${c++}`, pick(rs).id);
      else if (op === 4 && ss.length) db.prepare('DELETE FROM sesiones WHERE id = ?').run(pick(ss).id);
      else if (op === 5 && rs.length) db.prepare('DELETE FROM rutinas WHERE id = ?').run(pick(rs).id);
      else if (op === 6 && p) db.prepare('INSERT OR REPLACE INTO medidas (persona_id, fecha, peso_kg) VALUES (?, ?, ?)').run(p, `2026-01-0${1 + (c++ % 3)}`, 50 + c);
      else if (op === 7 && p) db.prepare('DELETE FROM medidas WHERE persona_id = ? AND fecha = ?').run(p, `2026-01-0${1 + (c++ % 3)}`);
      else if (op === 8 && p) db.prepare('INSERT OR IGNORE INTO favoritos (persona_id, ejercicio_id) VALUES (?, ?)').run(p, pick(['A', 'B']));
      else if (op === 9 && p) db.prepare('DELETE FROM favoritos WHERE persona_id = ?').run(p);
      else if (op === 10 && ps.length > 1) db.prepare('DELETE FROM personas WHERE id = ?').run(p);
      else if (op === 11 && p) db.prepare('UPDATE personas SET color = ? WHERE id = ?').run(`#${c++ % 999}`, p);
      else if (op === 12 && p) db.prepare('INSERT OR REPLACE INTO perfil (persona_id, altura) VALUES (?, ?)').run(p, 150 + c++);
      else if (op === 13 && ss.length) db.prepare('UPDATE sesiones SET nota = ? WHERE id = ?').run(`n${c++}`, pick(ss).id);
    } catch (e) { if (!/UNIQUE|FOREIGN/.test(e.message)) throw e; }
    if (rnd() < 0.4) await sincronizar(pick(D), remoto, {});
  }
  // Hasta que una vuelta completa de los tres no tenga trabajo.
  let rondas = 0;
  for (; rondas < 12; rondas++) {
    let trabajo = 0;
    for (const db of D) { const r = await sincronizar(db, remoto, {}); trabajo += r.subidos + r.bajados; }
    if (!trabajo) break;
  }
  assert.ok(rondas < 12, `semilla ${semilla}: no se aquietó`);
  const esperado = vivosDelRemoto(remoto.documentos());
  D.forEach((db, i) => assert.deepEqual(vivos(cambiosLocales(db, null)), esperado, `semilla ${semilla}: el equipo ${i} no coincide con el remoto`));
  for (const db of D) {
    const r = await sincronizar(db, remoto, {});
    assert.deepEqual([r.subidos, r.bajados, r.enEspera, r.rechazados], [0, 0, 0, 0], `semilla ${semilla}: queda trabajo`);
  }
}

test(`fuzz de ${SEMILLAS} semillas con 3 equipos converge sin dejar pendientes`, { timeout: 120000 }, async () => {
  for (let semilla = 1; semilla <= SEMILLAS; semilla++) await correr(semilla);
});
