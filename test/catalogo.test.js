import { test } from 'node:test';
import assert from 'node:assert/strict';
import { openDb } from '../server/db.js';
import { traducirEjercicio, guardarCatalogo } from '../server/catalogo.js';
import { normalizar } from '../server/normalizar.js';
import { CATALOGO_EN, NOMBRES, INSTRUCCIONES } from './fixtures/ejercicios.js';
import { DICCIONARIO } from './dic.js';

const ctx = { dic: DICCIONARIO, nombres: NOMBRES, instrucciones: INSTRUCCIONES };

test('normalizar quita acentos, mayúsculas y espacios de más', () => {
  assert.equal(normalizar('  Sentadílla   CON Barra '), 'sentadilla con barra');
});

test('traducirEjercicio traduce campos fijos, nombre e instrucciones', () => {
  const f = traducirEjercicio(CATALOGO_EN[0], ctx);
  assert.equal(f.nombre, 'Sentadilla con barra');
  assert.equal(f.nombre_en, 'Barbell Squat');
  assert.equal(f.musculo_principal, 'Cuádriceps');
  assert.equal(f.equipo, 'Barra');
  assert.equal(f.nivel, 'Intermedio');
  assert.equal(f.categoria, 'Fuerza');
  assert.equal(f.fuerza, 'Empuje');
  assert.equal(f.mecanica, 'Compuesto');
  assert.equal(f.traducido, 1);
  assert.deepEqual(JSON.parse(f.instrucciones), INSTRUCCIONES.Barbell_Squat);
  assert.ok(f.busqueda.includes('sentadilla') && f.busqueda.includes('squat'));
});

test('sin traducción de instrucciones queda en inglés con traducido = 0', () => {
  const f = traducirEjercicio(CATALOGO_EN[1], ctx);
  assert.equal(f.traducido, 0);
  assert.deepEqual(JSON.parse(f.instrucciones), ['Lie on the bench.']);
});

test('sin equipo queda como "Sin equipo"', () => {
  assert.equal(traducirEjercicio(CATALOGO_EN[4], ctx).equipo, 'Sin equipo');
});

test('re-importar es idempotente y respeta favorito y media_propia', () => {
  const db = openDb(':memory:');
  const filas = CATALOGO_EN.map(e => traducirEjercicio(e, ctx));
  guardarCatalogo(db, filas);
  db.prepare("UPDATE ejercicios SET favorito = 1, media_propia = 'mi.mp4' WHERE id = 'Pushups'").run();
  guardarCatalogo(db, filas.map(f => ({ ...f, nombre: f.nombre + ' v2' })));
  assert.equal(db.prepare('SELECT COUNT(*) n FROM ejercicios').get().n, 5);
  const p = db.prepare("SELECT * FROM ejercicios WHERE id = 'Pushups'").get();
  assert.equal(p.favorito, 1);
  assert.equal(p.media_propia, 'mi.mp4');
  assert.ok(p.nombre.endsWith('v2'));
});
