import { test } from 'node:test';
import assert from 'node:assert/strict';
import { openDb } from '../server/db.js';
import { guardarCatalogo, traducirEjercicio } from '../server/catalogo.js';
import { sembrarPlantillas, PLANTILLAS } from '../server/plantillas.js';
import { CATALOGO_EN, NOMBRES, INSTRUCCIONES } from './fixtures/ejercicios.js';
import { DICCIONARIO } from './dic.js';

function dbConCatalogo() {
  const db = openDb(':memory:');
  guardarCatalogo(db, CATALOGO_EN.map(e => traducirEjercicio(e, { dic: DICCIONARIO, nombres: NOMBRES, instrucciones: INSTRUCCIONES })));
  return db;
}

test('las plantillas definidas son las dos pedidas', () => {
  assert.deepEqual(PLANTILLAS.map(p => p.nombre), ['Full body 3 días', 'Empuje / Tirón / Piernas']);
});

test('siembra las plantillas la primera vez y se salta ids que no existen', () => {
  const db = dbConCatalogo(); // solo 5 ejercicios: casi todos los ids de las plantillas no existen
  assert.equal(sembrarPlantillas(db), 2);
  const nombres = db.prepare('SELECT nombre FROM rutinas ORDER BY id').all().map(r => r.nombre);
  assert.deepEqual(nombres, ['Full body 3 días', 'Empuje / Tirón / Piernas']);
  assert.equal(db.prepare('SELECT COUNT(*) n FROM rutina_dias').get().n, 6);
  const ids = db.prepare('SELECT DISTINCT ejercicio_id FROM rutina_ejercicios').all().map(r => r.ejercicio_id);
  for (const id of ids) assert.ok(db.prepare('SELECT 1 FROM ejercicios WHERE id = ?').get(id));
});

test('no vuelve a sembrar, ni siquiera si se borraron todas las rutinas', () => {
  const db = dbConCatalogo();
  sembrarPlantillas(db);
  assert.equal(sembrarPlantillas(db), 0);
  db.exec('DELETE FROM rutinas');
  assert.equal(sembrarPlantillas(db), 0);
  assert.equal(db.prepare('SELECT COUNT(*) n FROM rutinas').get().n, 0);
});

test('no siembra si ya hay rutinas del usuario', () => {
  const db = dbConCatalogo();
  db.prepare("INSERT INTO rutinas (nombre, persona_id) VALUES ('Mía', 1)").run();
  assert.equal(sembrarPlantillas(db), 0);
  assert.equal(db.prepare('SELECT COUNT(*) n FROM rutinas').get().n, 1);
});
