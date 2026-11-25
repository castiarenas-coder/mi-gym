import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { servidorDePrueba } from './helpers.js';

let s;
before(async () => { s = await servidorDePrueba(); });
after(() => s.cerrar());

const crear = async (body = { nombre: 'Mi rutina' }) => (await s.pedir('/api/rutinas', { method: 'POST', body })).json;
const agregar = (r, dia, ejercicio_id, extra = {}) =>
  s.pedir(`/api/rutinas/${r.id}/dias/${dia}/ejercicios`, { method: 'POST', body: { ejercicio_id, ...extra } });

test('crea una rutina con un día por defecto y la lista', async () => {
  const r = await s.pedir('/api/rutinas', { method: 'POST', body: { nombre: '  Fuerza  ', descripcion: 'Base' } });
  assert.equal(r.status, 201);
  assert.equal(r.json.nombre, 'Fuerza');
  assert.equal(r.json.descripcion, 'Base');
  assert.equal(r.json.dias.length, 1);
  assert.equal(r.json.dias[0].nombre, 'Día 1');
  const lista = await s.pedir('/api/rutinas');
  assert.ok(lista.json.some(x => x.id === r.json.id && x.dias.length === 1 && x.total_ejercicios === 0));
});

test('crea con días nombrados', async () => {
  const r = await crear({ nombre: 'PPL', dias: ['Día A – Empuje', 'Día B – Tirón'] });
  assert.deepEqual(r.dias.map(d => d.nombre), ['Día A – Empuje', 'Día B – Tirón']);
});

test('valida nombre obligatorio', async () => {
  assert.equal((await s.pedir('/api/rutinas', { method: 'POST', body: { nombre: '   ' } })).status, 400);
  assert.equal((await s.pedir('/api/rutinas', { method: 'POST', body: {} })).status, 400);
});

test('renombra y cambia la descripción; 404 si no existe', async () => {
  const r = await crear();
  const p = await s.pedir(`/api/rutinas/${r.id}`, { method: 'PATCH', body: { nombre: 'Nuevo', descripcion: 'Desc' } });
  assert.equal(p.json.nombre, 'Nuevo');
  assert.equal(p.json.descripcion, 'Desc');
  assert.equal((await s.pedir(`/api/rutinas/${r.id}`, { method: 'PATCH', body: { nombre: '' } })).status, 400);
  assert.equal((await s.pedir('/api/rutinas/9999')).status, 404);
  assert.equal((await s.pedir('/api/rutinas/9999', { method: 'PATCH', body: { nombre: 'x' } })).status, 404);
});

test('agrega ejercicios con valores por defecto y datos del catálogo', async () => {
  const r = await crear();
  const a = await agregar(r, r.dias[0].id, 'Barbell_Squat');
  assert.equal(a.status, 201);
  assert.equal(a.json.series, 3);
  assert.equal(a.json.reps, '10');
  assert.equal(a.json.descanso_seg, 90);
  const det = (await s.pedir(`/api/rutinas/${r.id}`)).json;
  const it = det.dias[0].ejercicios[0];
  assert.equal(it.ejercicio_id, 'Barbell_Squat');
  assert.equal(it.nombre, 'Sentadilla con barra');
  assert.equal(it.img_ini, 'Barbell_Squat/0.jpg');
  assert.equal(it.orden, 0);
});

test('rechaza ejercicios inexistentes o datos inválidos', async () => {
  const r = await crear();
  const d = r.dias[0].id;
  assert.equal((await agregar(r, d, 'NoExiste')).status, 404);
  assert.equal((await agregar(r, d, 'Pushups', { series: 0 })).status, 400);
  assert.equal((await agregar(r, d, 'Pushups', { reps: '' })).status, 400);
  assert.equal((await agregar(r, d, 'Pushups', { descanso_seg: -5 })).status, 400);
  assert.equal((await agregar(r, 9999, 'Pushups')).status, 404);
});

test('edita series, reps (texto), descanso y nota', async () => {
  const r = await crear();
  const d = r.dias[0].id;
  const it = (await agregar(r, d, 'Pushups')).json;
  const p = await s.pedir(`/api/rutinas/${r.id}/dias/${d}/ejercicios/${it.id}`, { method: 'PATCH', body: { series: 4, reps: '8-12', descanso_seg: 60, nota: 'Lento' } });
  assert.equal(p.status, 200);
  assert.deepEqual([p.json.series, p.json.reps, p.json.descanso_seg, p.json.nota], [4, '8-12', 60, 'Lento']);
  assert.equal((await s.pedir(`/api/rutinas/${r.id}/dias/${d}/ejercicios/${it.id}`, { method: 'PATCH', body: { series: 100 } })).status, 400);
});

test('reordena ejercicios de un día y deja el orden consecutivo', async () => {
  const r = await crear();
  const d = r.dias[0].id;
  const a = (await agregar(r, d, 'Pushups')).json;
  const b = (await agregar(r, d, 'Dumbbell_Curl')).json;
  const c = (await agregar(r, d, 'Quad_Stretch')).json;
  const ok = await s.pedir(`/api/rutinas/${r.id}/dias/${d}/ejercicios/orden`, { method: 'PUT', body: { ids: [c.id, a.id, b.id] } });
  assert.equal(ok.status, 200);
  const det = (await s.pedir(`/api/rutinas/${r.id}`)).json.dias[0].ejercicios;
  assert.deepEqual(det.map(e => e.id), [c.id, a.id, b.id]);
  assert.deepEqual(det.map(e => e.orden), [0, 1, 2]);
  const mal = await s.pedir(`/api/rutinas/${r.id}/dias/${d}/ejercicios/orden`, { method: 'PUT', body: { ids: [a.id] } });
  assert.equal(mal.status, 400);
});

test('quita un ejercicio y reacomoda el orden', async () => {
  const r = await crear();
  const d = r.dias[0].id;
  const a = (await agregar(r, d, 'Pushups')).json;
  const b = (await agregar(r, d, 'Dumbbell_Curl')).json;
  assert.equal((await s.pedir(`/api/rutinas/${r.id}/dias/${d}/ejercicios/${a.id}`, { method: 'DELETE' })).status, 200);
  const det = (await s.pedir(`/api/rutinas/${r.id}`)).json.dias[0].ejercicios;
  assert.deepEqual(det.map(e => [e.id, e.orden]), [[b.id, 0]]);
  assert.equal((await s.pedir(`/api/rutinas/${r.id}/dias/${d}/ejercicios/${a.id}`, { method: 'DELETE' })).status, 404);
});

test('un ejercicio de otra rutina no se puede tocar por este camino', async () => {
  const r1 = await crear();
  const r2 = await crear();
  const it = (await agregar(r1, r1.dias[0].id, 'Pushups')).json;
  assert.equal((await s.pedir(`/api/rutinas/${r2.id}/dias/${r2.dias[0].id}/ejercicios/${it.id}`, { method: 'DELETE' })).status, 404);
  assert.equal((await s.pedir(`/api/rutinas/${r2.id}/dias/${r1.dias[0].id}/ejercicios`, { method: 'POST', body: { ejercicio_id: 'Pushups' } })).status, 404);
});

test('agrega, renombra, reordena y borra días', async () => {
  const r = await crear();
  const nuevo = await s.pedir(`/api/rutinas/${r.id}/dias`, { method: 'POST', body: { nombre: 'Día B' } });
  assert.equal(nuevo.status, 201);
  const ren = await s.pedir(`/api/rutinas/${r.id}/dias/${nuevo.json.id}`, { method: 'PATCH', body: { nombre: 'Día B – Piernas' } });
  assert.equal(ren.json.nombre, 'Día B – Piernas');
  const ord = await s.pedir(`/api/rutinas/${r.id}/dias/orden`, { method: 'PUT', body: { ids: [nuevo.json.id, r.dias[0].id] } });
  assert.equal(ord.status, 200);
  assert.deepEqual((await s.pedir(`/api/rutinas/${r.id}`)).json.dias.map(d => d.id), [nuevo.json.id, r.dias[0].id]);
  await agregar(r, nuevo.json.id, 'Pushups');
  assert.equal((await s.pedir(`/api/rutinas/${r.id}/dias/${nuevo.json.id}`, { method: 'DELETE' })).status, 200);
  const det = (await s.pedir(`/api/rutinas/${r.id}`)).json;
  assert.equal(det.dias.length, 1);
  assert.equal(s.db.prepare('SELECT COUNT(*) n FROM rutina_ejercicios WHERE dia_id = ?').get(nuevo.json.id).n, 0);
});

test('duplica una rutina con sus días y ejercicios', async () => {
  const r = await crear({ nombre: 'Original', dias: ['A', 'B'] });
  await agregar(r, r.dias[0].id, 'Pushups', { series: 5, reps: '5' });
  await agregar(r, r.dias[1].id, 'Dumbbell_Curl');
  const dup = await s.pedir(`/api/rutinas/${r.id}/duplicar`, { method: 'POST' });
  assert.equal(dup.status, 201);
  assert.equal(dup.json.nombre, 'Original (copia)');
  assert.notEqual(dup.json.id, r.id);
  assert.deepEqual(dup.json.dias.map(d => d.nombre), ['A', 'B']);
  assert.equal(dup.json.dias[0].ejercicios[0].series, 5);
  assert.equal(dup.json.dias[1].ejercicios[0].ejercicio_id, 'Dumbbell_Curl');
  assert.notEqual(dup.json.dias[0].id, r.dias[0].id);
  assert.equal((await s.pedir('/api/rutinas/9999/duplicar', { method: 'POST' })).status, 404);
});

test('borra una rutina en cascada', async () => {
  const r = await crear();
  await agregar(r, r.dias[0].id, 'Pushups');
  assert.equal((await s.pedir(`/api/rutinas/${r.id}`, { method: 'DELETE' })).status, 200);
  assert.equal((await s.pedir(`/api/rutinas/${r.id}`)).status, 404);
  assert.equal(s.db.prepare('SELECT COUNT(*) n FROM rutina_dias WHERE rutina_id = ?').get(r.id).n, 0);
  assert.equal((await s.pedir(`/api/rutinas/${r.id}`, { method: 'DELETE' })).status, 404);
});
