import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { migrar, MIGRACIONES, versionActual } from '../server/db.js';

const UUID_V4 = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
const ISO = /^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d\.\d{3}Z$/;
const esperar = (ms = 5) => { const t = Date.now() + ms; while (Date.now() < t); };

function baseV5() {
  const db = new DatabaseSync(':memory:');
  db.exec('PRAGMA foreign_keys = ON');
  migrar(db, MIGRACIONES.filter(m => m.version <= 5));
  db.exec(`
    INSERT INTO personas (id, nombre, color, creada) VALUES (2, 'Ana', '#fff', 'x');
    INSERT INTO ejercicios (id, nombre) VALUES ('A', 'A'), ('B', 'B');
    INSERT INTO rutinas (id, nombre, persona_id) VALUES (1, 'R1', 1);
    INSERT INTO rutina_dias (id, rutina_id, nombre, orden) VALUES (1, 1, 'D1', 0), (2, 1, 'D2', 1);
    INSERT INTO rutina_ejercicios (id, dia_id, ejercicio_id) VALUES (1, 1, 'A');
    INSERT INTO sesiones (id, rutina_id, fecha, estado, persona_id) VALUES (1, 1, '2026-01-01T10:00:00.000Z', 'finalizada', 1);
    INSERT INTO sesion_ejercicios (sesion_id, ejercicio_id) VALUES (1, 'A');
    INSERT INTO series_hechas (sesion_id, ejercicio_id, n, peso_kg, reps) VALUES (1, 'A', 1, 50, 10);
    INSERT INTO medidas (persona_id, fecha, peso_kg) VALUES (1, '2026-01-01', 80), (2, '2026-01-02', 60);
    INSERT INTO perfil (persona_id, altura) VALUES (1, 175);
    INSERT INTO favoritos (persona_id, ejercicio_id) VALUES (1, 'A'), (1, 'B');
  `);
  return db;
}
const migrado = () => { const db = baseV5(); migrar(db); return db; };
const borrados = (db) => db.prepare('SELECT tipo, clave FROM sync_borrados ORDER BY tipo, clave').all().map(r => ({ ...r }));

test('la migración 6 conserva las filas y asigna uid y actualizado', () => {
  const db = baseV5();
  const antes = {};
  for (const t of ['personas', 'rutinas', 'rutina_dias', 'rutina_ejercicios', 'sesiones', 'series_hechas', 'medidas', 'perfil', 'favoritos'])
    antes[t] = db.prepare(`SELECT COUNT(*) n FROM ${t}`).get().n;
  assert.equal(migrar(db), 6);
  assert.equal(versionActual(db), 6);
  for (const t of Object.keys(antes)) assert.equal(db.prepare(`SELECT COUNT(*) n FROM ${t}`).get().n, antes[t], t);
  const uids = [];
  for (const t of ['personas', 'rutinas', 'sesiones']) {
    for (const f of db.prepare(`SELECT uid, actualizado FROM ${t}`).all()) {
      assert.match(f.uid, UUID_V4, t);
      assert.ok(f.actualizado, t);
      uids.push(f.uid);
    }
  }
  assert.equal(new Set(uids).size, uids.length);
  for (const t of ['medidas', 'perfil', 'favoritos'])
    for (const f of db.prepare(`SELECT actualizado FROM ${t}`).all()) assert.ok(f.actualizado, t);
});

test('las filas nuevas sin uid reciben uno y marca de cambio', () => {
  const db = migrado();
  db.exec("INSERT INTO personas (nombre, creada) VALUES ('Luis', 'x')");
  db.exec("INSERT INTO rutinas (nombre, persona_id) VALUES ('R2', 1)");
  db.exec("INSERT INTO sesiones (persona_id, fecha, estado) VALUES (1, 'a', 'en_curso')");
  db.exec("INSERT INTO medidas (persona_id, fecha) VALUES (1, '2026-02-01')");
  for (const t of ['personas', 'rutinas', 'sesiones']) {
    const f = db.prepare(`SELECT uid, actualizado FROM ${t} ORDER BY id DESC LIMIT 1`).get();
    assert.match(f.uid, UUID_V4, t);
    assert.match(f.actualizado, ISO, t);
  }
  assert.ok(db.prepare("SELECT actualizado FROM medidas WHERE fecha = '2026-02-01'").get().actualizado);
  assert.equal(db.prepare('SELECT COUNT(DISTINCT uid) n FROM personas').get().n, 3);
});

test('un uid explícito se respeta', () => {
  const db = migrado();
  db.exec("INSERT INTO rutinas (nombre, persona_id, uid) VALUES ('R2', 1, 'mi-uid')");
  assert.equal(db.prepare("SELECT uid FROM rutinas WHERE nombre = 'R2'").get().uid, 'mi-uid');
});

test('los hijos de una sesión actualizan la marca de la sesión', () => {
  const db = migrado();
  const marca = () => db.prepare('SELECT actualizado a FROM sesiones WHERE id = 1').get().a;
  let m = marca();
  esperar();
  db.exec("INSERT INTO series_hechas (sesion_id, ejercicio_id, n) VALUES (1, 'A', 2)");
  assert.notEqual(marca(), m); m = marca(); esperar();
  db.exec('UPDATE series_hechas SET reps = 12 WHERE n = 2');
  assert.notEqual(marca(), m); m = marca(); esperar();
  db.exec('DELETE FROM series_hechas WHERE n = 2');
  assert.notEqual(marca(), m); m = marca(); esperar();
  db.exec("INSERT INTO sesion_ejercicios (sesion_id, ejercicio_id) VALUES (1, 'B')");
  assert.notEqual(marca(), m);
});

test('los hijos de una rutina actualizan la marca de la rutina', () => {
  const db = migrado();
  const marca = () => db.prepare('SELECT actualizado a FROM rutinas WHERE id = 1').get().a;
  let m = marca();
  esperar();
  db.exec("INSERT INTO rutina_dias (rutina_id, nombre, orden) VALUES (1, 'D3', 2)");
  assert.notEqual(marca(), m); m = marca(); esperar();
  db.exec("INSERT INTO rutina_ejercicios (dia_id, ejercicio_id) VALUES (2, 'B')");
  assert.notEqual(marca(), m); m = marca(); esperar();
  db.exec('DELETE FROM rutina_ejercicios WHERE dia_id = 2');
  assert.notEqual(marca(), m); m = marca(); esperar();
  db.exec("DELETE FROM rutina_dias WHERE nombre = 'D3'");
  assert.notEqual(marca(), m);
});

test('fijar la marca del documento a mano se respeta', () => {
  const db = migrado();
  db.exec("UPDATE rutinas SET actualizado = '2020-01-01T00:00:00.000Z' WHERE id = 1");
  assert.equal(db.prepare('SELECT actualizado a FROM rutinas WHERE id = 1').get().a, '2020-01-01T00:00:00.000Z');
  db.exec("UPDATE rutinas SET nombre = 'otro' WHERE id = 1");
  assert.notEqual(db.prepare('SELECT actualizado a FROM rutinas WHERE id = 1').get().a, '2020-01-01T00:00:00.000Z');
});

test('borrar una rutina, una medida, un perfil y un favorito deja borrados', () => {
  const db = migrado();
  const ru = db.prepare('SELECT uid FROM rutinas WHERE id = 1').get().uid;
  const p1 = db.prepare('SELECT uid FROM personas WHERE id = 1').get().uid;
  db.exec('DELETE FROM rutinas WHERE id = 1');
  db.exec('DELETE FROM medidas WHERE persona_id = 1');
  db.exec("DELETE FROM favoritos WHERE ejercicio_id = 'B'");
  db.exec('DELETE FROM perfil WHERE persona_id = 1');
  assert.deepEqual(borrados(db), [
    { tipo: 'favorito', clave: `${p1}|B` },
    { tipo: 'medida', clave: `${p1}|2026-01-01` },
    { tipo: 'perfil', clave: p1 },
    { tipo: 'rutina', clave: ru },
  ]);
  assert.match(db.prepare('SELECT fecha FROM sync_borrados LIMIT 1').get().fecha, ISO);
});

test('borrar una persona deja borrados de ella y de sus rutinas y sesiones', () => {
  const db = migrado();
  const p1 = db.prepare('SELECT uid FROM personas WHERE id = 1').get().uid;
  const ru = db.prepare('SELECT uid FROM rutinas WHERE id = 1').get().uid;
  const se = db.prepare('SELECT uid FROM sesiones WHERE id = 1').get().uid;
  db.exec('DELETE FROM personas WHERE id = 1');
  const b = borrados(db);
  for (const esperado of [{ tipo: 'persona', clave: p1 }, { tipo: 'rutina', clave: ru }, { tipo: 'sesion', clave: se }])
    assert.ok(b.some(x => x.tipo === esperado.tipo && x.clave === esperado.clave), JSON.stringify(esperado));
  assert.ok(b.every(x => x.clave && !x.clave.includes('null')), JSON.stringify(b));
});

test('volver a crear lo borrado limpia el borrado', () => {
  const db = migrado();
  db.exec('DELETE FROM medidas WHERE persona_id = 2');
  assert.equal(borrados(db).length, 1);
  db.exec("INSERT INTO medidas (persona_id, fecha) VALUES (2, '2026-01-02')");
  assert.equal(borrados(db).length, 0);
});

test('sync_estado guarda clave y valor', () => {
  const db = migrado();
  db.exec("INSERT INTO sync_estado (clave, valor) VALUES ('k', 'v')");
  assert.equal(db.prepare("SELECT valor FROM sync_estado WHERE clave = 'k'").get().valor, 'v');
});
