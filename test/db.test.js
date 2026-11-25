import { test } from 'node:test';
import assert from 'node:assert/strict';
import { openDb, migrar, versionActual, MIGRACIONES } from '../server/db.js';

test('openDb crea todas las tablas del plan y registra la versión', () => {
  const db = openDb(':memory:');
  const tablas = db.prepare("SELECT name FROM sqlite_master WHERE type='table'").all().map(t => t.name);
  for (const t of ['ejercicios', 'rutinas', 'rutina_dias', 'rutina_ejercicios', 'ajustes', 'sesiones', 'series_hechas', 'medidas', 'perfil', 'schema_version']) {
    assert.ok(tablas.includes(t), `falta la tabla ${t}`);
  }
  assert.equal(versionActual(db), MIGRACIONES.at(-1).version);
});

test('migrar es idempotente y aplica solo las migraciones nuevas', () => {
  const db = openDb(':memory:');
  const v = versionActual(db);
  migrar(db);
  assert.equal(versionActual(db), v);
  migrar(db, [...MIGRACIONES, { version: v + 1, sql: 'CREATE TABLE extra (x INTEGER)' }]);
  assert.equal(versionActual(db), v + 1);
  assert.ok(db.prepare("SELECT 1 FROM sqlite_master WHERE name='extra'").get());
});

test('una migración que falla no deja nada a medias', () => {
  const db = openDb(':memory:');
  const v = versionActual(db);
  assert.throws(() => migrar(db, [...MIGRACIONES, { version: v + 1, sql: 'CREATE TABLE ok1 (x); CREATE TABLE ok1 (x);' }]));
  assert.equal(versionActual(db), v);
  assert.equal(db.prepare("SELECT 1 FROM sqlite_master WHERE name='ok1'").get(), undefined);
});

test('las claves foráneas están activas', () => {
  const db = openDb(':memory:');
  assert.equal(db.prepare('PRAGMA foreign_keys').get().foreign_keys, 1);
  assert.throws(() => db.prepare("INSERT INTO rutina_ejercicios (dia_id, ejercicio_id, orden) VALUES (99, 'x', 1)").run());
});
