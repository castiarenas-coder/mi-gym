import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { migrar, MIGRACIONES } from '../server/db.js';

test('la migración 2 conserva los ejercicios de rutina que ya existían', () => {
  const db = new DatabaseSync(':memory:');
  db.exec('PRAGMA foreign_keys = ON');
  migrar(db, MIGRACIONES.filter(m => m.version === 1));
  db.exec("INSERT INTO ejercicios (id, nombre) VALUES ('a', 'A'), ('b', 'B')");
  db.exec("INSERT INTO rutinas (nombre) VALUES ('R')");
  db.exec("INSERT INTO rutina_ejercicios (rutina_id, ejercicio_id, orden, series, reps) VALUES (1, 'a', 0, 4, '6'), (1, 'b', 1, 3, '10')");
  migrar(db);
  const dias = db.prepare('SELECT * FROM rutina_dias').all();
  assert.equal(dias.length, 1);
  assert.equal(dias[0].nombre, 'Día 1');
  const items = db.prepare('SELECT ejercicio_id, series, reps, dia_id FROM rutina_ejercicios ORDER BY orden').all();
  assert.deepEqual(items.map(i => [i.ejercicio_id, i.series, i.reps, i.dia_id]), [['a', 4, '6', dias[0].id], ['b', 3, '10', dias[0].id]]);
});
