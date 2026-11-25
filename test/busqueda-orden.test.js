import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { servidorDePrueba } from './helpers.js';
import { normalizar } from '../server/normalizar.js';

let s;
before(async () => {
  s = await servidorDePrueba();
  // Reemplazamos el catálogo de prueba por nombres que compiten por "sentadilla".
  s.db.exec('DELETE FROM ejercicios');
  const ins = s.db.prepare('INSERT INTO ejercicios (id, nombre, nombre_en, busqueda) VALUES (?, ?, ?, ?)');
  for (const [id, nombre, en] of [
    ['A', 'Envión en sentadilla', 'Squat Clean'],
    ['Barbell_Squat', 'Sentadilla con barra', 'Barbell Squat'],
    ['G', 'Sentadilla hack', 'Hack Squat'],
    ['C', 'Media sentadilla', 'Half Squat'],
    ['D', 'Sentadilla', 'Bodyweight Squat'],
    ['E', 'Zancada', 'Squat Lunge Combo'],
    ['F', 'Sentadilla búlgara con mancuernas', 'Dumbbell Bulgarian Split Squat'],
  ]) ins.run(id, nombre, en, normalizar(`${nombre} ${en}`));
});
after(() => s.cerrar());

const ids = async q => (await s.pedir(`/api/ejercicios?q=${encodeURIComponent(q)}`)).json.items.map(i => i.id);

test('el nombre exacto primero, después los que empiezan igual (clásicos y más cortos antes), después el resto', async () => {
  assert.deepEqual(await ids('sentadilla'), ['D', 'Barbell_Squat', 'G', 'F', 'C', 'A']);
});

test('sin importar acentos ni mayúsculas', async () => {
  assert.deepEqual((await ids('SENTADÍLLA')).slice(0, 2), ['D', 'Barbell_Squat']);
});

test('el nombre en inglés exacto o como inicio también sube', async () => {
  assert.deepEqual((await ids('barbell squat'))[0], 'Barbell_Squat');
  assert.deepEqual((await ids('squat'))[0], 'A');
});

test('la paginación respeta el orden por relevancia', async () => {
  const r = await s.pedir('/api/ejercicios?q=sentadilla&limit=2&offset=1');
  assert.equal(r.json.total, 6);
  assert.deepEqual(r.json.items.map(i => i.id), ['Barbell_Squat', 'G']);
});
