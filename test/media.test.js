import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { servidorDePrueba } from './helpers.js';

let s, dir;
before(async () => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'migym-media-'));
  s = await servidorDePrueba({ mediaDir: path.join(dir, 'media') });
});
after(() => { s.cerrar(); fs.rmSync(dir, { recursive: true, force: true }); });

const subir = (id, tipo, cuerpo) => fetch(`${s.base}/api/ejercicios/${id}/media`, { method: 'POST', headers: { 'content-type': tipo, 'x-mi-gym': '1' }, body: cuerpo });

test('sube un GIF, lo guarda en disco, lo sirve en /media y fija media_propia', async () => {
  const bytes = Buffer.from('GIF89a-prueba');
  const res = await subir('Pushups', 'image/gif', bytes);
  assert.equal(res.status, 200);
  const ej = await res.json();
  assert.match(ej.media_propia, /^\/media\/Pushups\.gif\?v=\d+$/);
  assert.ok(fs.existsSync(path.join(dir, 'media', 'Pushups.gif')));
  const servido = await fetch(s.base + ej.media_propia.split('?')[0]);
  assert.equal(servido.status, 200);
  assert.deepEqual(Buffer.from(await servido.arrayBuffer()), bytes);
  assert.equal((await s.pedir('/api/ejercicios/Pushups')).json.media_propia, ej.media_propia);
});

test('subir otro formato reemplaza el archivo anterior', async () => {
  await subir('Pushups', 'video/mp4', Buffer.from('mp4'));
  assert.ok(fs.existsSync(path.join(dir, 'media', 'Pushups.mp4')));
  assert.ok(!fs.existsSync(path.join(dir, 'media', 'Pushups.gif')));
});

test('acepta webm, jpg y png', async () => {
  for (const [tipo, ext] of [['video/webm', 'webm'], ['image/jpeg', 'jpg'], ['image/png', 'png']]) {
    const r = await subir('Dumbbell_Curl', tipo, Buffer.from('x'));
    assert.equal(r.status, 200, tipo);
    assert.ok((await r.json()).media_propia.includes(`.${ext}?v=`), tipo);
  }
});

test('rechaza tipos no permitidos, cuerpo vacío y ejercicios inexistentes', async () => {
  assert.equal((await subir('Pushups', 'application/pdf', Buffer.from('x'))).status, 415);
  assert.equal((await subir('Pushups', 'image/gif', Buffer.alloc(0))).status, 400);
  assert.equal((await subir('NoExiste', 'image/gif', Buffer.from('x'))).status, 404);
});

test('rechaza archivos de más de 30 MB', async () => {
  const r = await subir('Pushups', 'video/mp4', Buffer.alloc(31 * 1024 * 1024));
  assert.equal(r.status, 413);
  assert.match((await r.json()).error, /30 MB/);
});

test('DELETE quita el archivo y limpia media_propia', async () => {
  await subir('Bench_Press', 'image/gif', Buffer.from('g'));
  const r = await fetch(`${s.base}/api/ejercicios/Bench_Press/media`, { method: 'DELETE', headers: { 'x-mi-gym': '1' } });
  assert.equal(r.status, 200);
  assert.equal((await r.json()).media_propia, null);
  assert.ok(!fs.existsSync(path.join(dir, 'media', 'Bench_Press.gif')));
});

test('DELETE también limpia un link externo sin tocar el disco', async () => {
  await s.pedir('/api/ejercicios/Quad_Stretch', { method: 'PATCH', body: { media_propia: 'https://youtu.be/abc' } });
  const r = await fetch(`${s.base}/api/ejercicios/Quad_Stretch/media`, { method: 'DELETE', headers: { 'x-mi-gym': '1' } });
  assert.equal((await r.json()).media_propia, null);
});
