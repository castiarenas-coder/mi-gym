import { test } from 'node:test';
import assert from 'node:assert/strict';
import { openDb } from '../server/db.js';
import { exportarDatos, importarDatos } from '../server/respaldo.js';
import { cambiosLocales } from '../server/sync/documentos.js';
import { sincronizar } from '../server/sync/motor.js';
import { crearRemotoEnMemoria } from './helpers-remoto.js';

const esperar = (ms = 5) => { const t = Date.now() + ms; while (Date.now() < t); };
const nuevaBase = () => {
  const db = openDb(':memory:');
  db.exec("INSERT INTO ejercicios (id, nombre) VALUES ('A', 'A'), ('B', 'B')");
  return db;
};
const q = (db, sql, ...p) => db.prepare(sql).all(...p).map(f => ({ ...f }));
const rutinas = (db) => q(db, 'SELECT nombre FROM rutinas ORDER BY nombre').map(r => r.nombre);
const clon = (x) => JSON.parse(JSON.stringify(x));

async function escenario() {
  const [A, B, remoto] = [nuevaBase(), nuevaBase(), crearRemotoEnMemoria()];
  A.exec("INSERT INTO personas (nombre, color, creada) VALUES ('Ana', '#fff', 'x')");
  const pidA = A.prepare("SELECT id FROM personas WHERE nombre = 'Ana'").get().id;
  A.exec(`INSERT INTO rutinas (nombre, dias, descripcion, persona_id) VALUES ('R1', '[]', '', ${pidA})`);
  esperar();
  await sincronizar(A, remoto, {});
  await sincronizar(B, remoto, {});
  const respaldo = exportarDatos(A);
  esperar();
  const pidB = B.prepare("SELECT id FROM personas WHERE nombre = 'Ana'").get().id;
  B.exec(`INSERT INTO rutinas (nombre, dias, descripcion, persona_id) VALUES ('RX_de_B', '[]', '', ${pidB})`);
  esperar();
  await sincronizar(B, remoto, {}); // la nube tiene RX_de_B; A todavía no lo bajó
  return { A, B, remoto, respaldo };
}

test('restaurar en un equipo vinculado no borra nada de la nube: se junta con lo más nuevo', async () => {
  const { A, B, remoto, respaldo } = await escenario();
  esperar();
  importarDatos(A, clon(respaldo));
  esperar();
  for (let i = 0; i < 3; i++) for (const db of [A, B]) { esperar(3); await sincronizar(db, remoto, {}); }
  assert.deepEqual(rutinas(A), ['R1', 'RX_de_B']);
  assert.deepEqual(rutinas(B), ['R1', 'RX_de_B']);
});

test('restaurar no sube ningún borrado y no deja personas muertas por la restauración', async () => {
  const { A, remoto, respaldo } = await escenario();
  await sincronizar(A, remoto, {});
  const antesBorrados = q(A, 'SELECT * FROM sync_borrados');
  const antesMuertas = q(A, 'SELECT * FROM sync_muertas');
  esperar();
  importarDatos(A, clon(respaldo));
  assert.deepEqual(q(A, 'SELECT * FROM sync_borrados'), antesBorrados);
  assert.deepEqual(q(A, 'SELECT * FROM sync_muertas'), antesMuertas);
  assert.equal(cambiosLocales(A, null).filter(d => d.borrado).length, 0);
  // Justo después de restaurar, el estado de bajada se reinició: la próxima vuelta vuelve a bajar todo; lo ya enviado se conserva.
  for (const clave of ['cursor', 'eco', 'pendientes', 'rechazados']) {
    assert.equal(q(A, 'SELECT valor FROM sync_estado WHERE clave = ?', clave).length, 0, clave);
  }
  assert.ok(q(A, "SELECT valor FROM sync_estado WHERE clave = 'ultimo_envio'")[0].valor);
  const borradosAntes = remoto.documentos().filter(d => d.borrado).length;
  await sincronizar(A, remoto, {});
  assert.equal(remoto.documentos().filter(d => d.borrado).length, borradosAntes, 'la nube no recibió borrados');
});

test('restaurar conserva los borrados y las muertas que ya existían (de lo que el respaldo no trae)', async () => {
  const A = nuevaBase();
  A.exec("INSERT INTO personas (nombre, color, creada) VALUES ('Ana', '#fff', 'x'), ('Beto', '#000', 'x')");
  esperar();
  A.exec("DELETE FROM personas WHERE nombre = 'Beto'"); // borrado propio, anterior a la restauración
  const respaldo = exportarDatos(A); // sin Beto
  esperar();
  A.exec("INSERT INTO personas (nombre, color, creada) VALUES ('Carla', '#00f', 'x')");
  A.exec("DELETE FROM personas WHERE nombre = 'Carla'");
  const antesBorrados = q(A, 'SELECT * FROM sync_borrados');
  const antesMuertas = q(A, 'SELECT * FROM sync_muertas');
  assert.ok(antesBorrados.length >= 2 && antesMuertas.length >= 2);
  esperar();
  importarDatos(A, clon(respaldo));
  assert.deepEqual(q(A, 'SELECT * FROM sync_borrados'), antesBorrados);
  assert.deepEqual(q(A, 'SELECT * FROM sync_muertas'), antesMuertas);
});
