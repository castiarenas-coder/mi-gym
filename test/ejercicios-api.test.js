import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { servidorDePrueba } from './helpers.js';

let s;
before(async () => { s = await servidorDePrueba(); });
after(() => s.cerrar());

test('GET /api/salud', async () => {
  const r = await s.pedir('/api/salud');
  assert.equal(r.status, 200);
  assert.deepEqual(r.json, { ok: true, version: '9.9.9' });
});

test('lista todos con total, y sin instrucciones', async () => {
  const r = await s.pedir('/api/ejercicios');
  assert.equal(r.json.total, 5);
  assert.equal(r.json.items.length, 5);
  assert.equal(r.json.items[0].instrucciones, undefined);
});

test('busca en español sin importar acentos ni mayúsculas', async () => {
  for (const q of ['sentadilla', 'SENTADÍLLA', 'sentadilla barra']) {
    const r = await s.pedir(`/api/ejercicios?q=${encodeURIComponent(q)}`);
    assert.deepEqual(r.json.items.map(i => i.id), ['Barbell_Squat'], q);
  }
  const bic = await s.pedir('/api/ejercicios?q=biceps');
  assert.deepEqual(bic.json.items.map(i => i.id), ['Dumbbell_Curl']);
});

test('también busca por el nombre en inglés', async () => {
  const r = await s.pedir('/api/ejercicios?q=bench');
  assert.deepEqual(r.json.items.map(i => i.id), ['Bench_Press']);
});

test('los comodines de LIKE se tratan como texto', async () => {
  assert.equal((await s.pedir('/api/ejercicios?q=%25')).json.total, 0);
  assert.equal((await s.pedir('/api/ejercicios?q=_')).json.total, 0);
});

test('filtros por músculo, equipo, nivel y categoría (combinables)', async () => {
  const q = p => s.pedir(`/api/ejercicios?${new URLSearchParams(p)}`);
  assert.equal((await q({ musculo: 'Pecho' })).json.total, 2);
  assert.equal((await q({ musculo: 'Pecho', equipo: 'Peso corporal' })).json.total, 1);
  assert.equal((await q({ nivel: 'Intermedio' })).json.total, 1);
  assert.equal((await q({ categoria: 'Estiramiento' })).json.total, 1);
  assert.equal((await q({ equipo: 'Sin equipo' })).json.items[0].id, 'Quad_Stretch');
});

test('paginación con limit y offset', async () => {
  const r = await s.pedir('/api/ejercicios?limit=2&offset=1');
  assert.equal(r.json.items.length, 2);
  assert.equal(r.json.total, 5);
  assert.equal(r.json.offset, 1);
  const todos = (await s.pedir('/api/ejercicios')).json.items.map(i => i.id);
  assert.deepEqual(r.json.items.map(i => i.id), todos.slice(1, 3));
});

test('GET /api/ejercicios/filtros devuelve valores distintos con cantidades', async () => {
  const r = await s.pedir('/api/ejercicios/filtros');
  assert.equal(r.status, 200);
  assert.deepEqual(r.json.musculos.find(m => m.valor === 'Pecho'), { valor: 'Pecho', cantidad: 2 });
  assert.deepEqual(r.json.equipos.find(m => m.valor === 'Barra'), { valor: 'Barra', cantidad: 2 });
  assert.ok(r.json.niveles.find(m => m.valor === 'Principiante'));
  assert.ok(r.json.categorias.find(m => m.valor === 'Fuerza'));
});

test('GET /api/ejercicios/:id devuelve el detalle con instrucciones', async () => {
  const r = await s.pedir('/api/ejercicios/Barbell_Squat');
  assert.equal(r.status, 200);
  assert.equal(r.json.nombre, 'Sentadilla con barra');
  assert.deepEqual(r.json.musculos_sec, ['Glúteos', 'Isquiotibiales']);
  assert.equal(r.json.instrucciones.length, 2);
  assert.equal(r.json.img_ini, 'Barbell_Squat/0.jpg');
  assert.equal(r.json.favorito, false);
});

test('GET /api/ejercicios/:id inexistente da 404', async () => {
  assert.equal((await s.pedir('/api/ejercicios/nada')).status, 404);
});

test('PATCH marca favorito y se puede filtrar', async () => {
  const r = await s.pedir('/api/ejercicios/Pushups', { method: 'PATCH', body: { favorito: true } });
  assert.equal(r.status, 200);
  assert.equal(r.json.favorito, true);
  const fav = await s.pedir('/api/ejercicios?favoritos=1');
  assert.deepEqual(fav.json.items.map(i => i.id), ['Pushups']);
  await s.pedir('/api/ejercicios/Pushups', { method: 'PATCH', body: { favorito: false } });
  assert.equal((await s.pedir('/api/ejercicios?favoritos=1')).json.total, 0);
});

test('PATCH guarda y borra media_propia', async () => {
  const url = 'https://www.youtube.com/watch?v=abc';
  const r = await s.pedir('/api/ejercicios/Pushups', { method: 'PATCH', body: { media_propia: url } });
  assert.equal(r.json.media_propia, url);
  const b = await s.pedir('/api/ejercicios/Pushups', { method: 'PATCH', body: { media_propia: null } });
  assert.equal(b.json.media_propia, null);
});

test('PATCH valida entradas y existencia', async () => {
  const patch = body => s.pedir('/api/ejercicios/Pushups', { method: 'PATCH', body });
  assert.equal((await patch({ favorito: 'si' })).status, 400);
  assert.equal((await patch({ media_propia: 5 })).status, 400);
  assert.equal((await patch({})).status, 400);
  assert.equal((await s.pedir('/api/ejercicios/nada', { method: 'PATCH', body: { favorito: true } })).status, 404);
});

test('rutas /api desconocidas dan 404 en JSON', async () => {
  const r = await s.pedir('/api/nada');
  assert.equal(r.status, 404);
  assert.ok(r.json.error);
});
