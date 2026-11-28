import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { migrar, MIGRACIONES, versionActual } from '../server/db.js';

test('la migración 5 asigna todo lo existente a la persona "Yo"', () => {
  const db = new DatabaseSync(':memory:');
  db.exec('PRAGMA foreign_keys = ON');
  migrar(db, MIGRACIONES.filter(m => m.version <= 4));
  db.exec(`
    INSERT INTO ejercicios (id, nombre, favorito) VALUES ('A', 'Ejercicio A', 1), ('B', 'Ejercicio B', 0);
    INSERT INTO rutinas (id, nombre) VALUES (1, 'Mi rutina');
    INSERT INTO sesiones (id, rutina_id, fecha, estado) VALUES (1, 1, '2026-01-01T10:00:00.000Z', 'finalizada'), (2, 1, '2026-01-02T10:00:00.000Z', 'en_curso');
    INSERT INTO series_hechas (sesion_id, ejercicio_id, n, peso_kg, reps) VALUES (1, 'A', 1, 50, 10);
    INSERT INTO medidas (fecha, peso_kg) VALUES ('2026-01-01', 80);
    INSERT INTO perfil (id, altura, sexo, objetivo) VALUES (1, 175, 'hombre', 'ganar_musculo');
    INSERT INTO ajustes (clave, valor) VALUES ('plantillas_sembradas', 'x'), ('descanso', '90');
  `);
  migrar(db, MIGRACIONES.filter(m => m.version <= 5));
  assert.equal(versionActual(db), 5);
  const personas = db.prepare('SELECT id, nombre FROM personas').all();
  assert.deepEqual(personas.map(p => [p.id, p.nombre]), [[1, 'Yo']]);
  assert.equal(db.prepare('SELECT persona_id FROM rutinas WHERE id = 1').get().persona_id, 1);
  assert.deepEqual(db.prepare('SELECT persona_id FROM sesiones ORDER BY id').all().map(s => s.persona_id), [1, 1]);
  assert.equal(db.prepare('SELECT estado FROM sesiones WHERE id = 2').get().estado, 'en_curso');
  assert.deepEqual({ ...db.prepare('SELECT persona_id, fecha, peso_kg FROM medidas').get() }, { persona_id: 1, fecha: '2026-01-01', peso_kg: 80 });
  const perfil = db.prepare('SELECT persona_id, altura, sexo, objetivo FROM perfil').get();
  assert.deepEqual({ ...perfil }, { persona_id: 1, altura: 175, sexo: 'hombre', objetivo: 'ganar_musculo' });
  assert.deepEqual(db.prepare('SELECT persona_id, ejercicio_id FROM favoritos').all().map(f => [f.persona_id, f.ejercicio_id]), [[1, 'A']]);
  const claves = db.prepare('SELECT clave FROM ajustes ORDER BY clave').all().map(a => a.clave);
  assert.deepEqual(claves, ['descanso', 'plantillas_sembradas:1']);
});

test('desde la migración 5 hay una sesión en curso por persona, no una global', () => {
  const db = new DatabaseSync(':memory:');
  db.exec('PRAGMA foreign_keys = ON');
  migrar(db);
  db.exec("INSERT INTO personas (nombre, color, creada) VALUES ('Ana', '#fff', 'x')");
  db.exec("INSERT INTO sesiones (persona_id, fecha, estado) VALUES (1, 'a', 'en_curso'), (2, 'b', 'en_curso')");
  assert.throws(() => db.exec("INSERT INTO sesiones (persona_id, fecha, estado) VALUES (1, 'c', 'en_curso')"));
});

test('borrar una persona borra sus datos en cascada', () => {
  const db = new DatabaseSync(':memory:');
  db.exec('PRAGMA foreign_keys = ON');
  migrar(db);
  db.exec(`
    INSERT INTO personas (id, nombre, color, creada) VALUES (2, 'Ana', '#fff', 'x');
    INSERT INTO ejercicios (id, nombre) VALUES ('A', 'A');
    INSERT INTO rutinas (id, nombre, persona_id) VALUES (10, 'R', 2);
    INSERT INTO sesiones (id, persona_id, fecha, estado) VALUES (20, 2, 'a', 'finalizada');
    INSERT INTO series_hechas (sesion_id, ejercicio_id, n) VALUES (20, 'A', 1);
    INSERT INTO medidas (persona_id, fecha) VALUES (2, '2026-01-01');
    INSERT INTO perfil (persona_id, altura) VALUES (2, 170);
    INSERT INTO favoritos (persona_id, ejercicio_id) VALUES (2, 'A');
  `);
  db.exec('DELETE FROM personas WHERE id = 2');
  for (const t of ['rutinas', 'sesiones', 'series_hechas', 'medidas', 'perfil', 'favoritos']) {
    assert.equal(db.prepare(`SELECT COUNT(*) n FROM ${t}`).get().n, 0, t);
  }
});
