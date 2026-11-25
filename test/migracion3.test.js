import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { migrar, MIGRACIONES, versionActual } from '../server/db.js';

test('la migración 3 conserva sesiones y series existentes', () => {
  const db = new DatabaseSync(':memory:');
  db.exec('PRAGMA foreign_keys = ON');
  migrar(db, MIGRACIONES.filter(m => m.version <= 2));
  db.exec(`
    INSERT INTO ejercicios (id, nombre) VALUES ('A', 'Ejercicio A');
    INSERT INTO sesiones (id, fecha, duracion) VALUES (1, '2026-01-01T10:00:00.000Z', 3600);
    INSERT INTO series_hechas (sesion_id, ejercicio_id, n, peso_kg, reps) VALUES (1, 'A', 1, 50, 10), (1, 'A', 2, 50, 8);
    INSERT INTO perfil (id, altura, edad, sexo) VALUES (1, 175, 30, 'hombre');
  `);
  migrar(db);
  assert.ok(versionActual(db) >= 3);
  const ses = db.prepare('SELECT estado, titulo FROM sesiones WHERE id = 1').get();
  assert.equal(ses.estado, 'finalizada');
  const series = db.prepare('SELECT n, hecha FROM series_hechas WHERE sesion_id = 1 ORDER BY n').all();
  assert.deepEqual(series.map(x => [x.n, x.hecha]), [[1, 1], [2, 1]]);
  const ej = db.prepare('SELECT ejercicio_id, orden FROM sesion_ejercicios WHERE sesion_id = 1').all();
  assert.deepEqual(ej.map(x => [x.ejercicio_id, x.orden]), [['A', 0]]);
  assert.equal(db.prepare('SELECT altura, fecha_nacimiento FROM perfil').get().altura, 175);
});
