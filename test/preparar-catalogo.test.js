import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import sharp from 'sharp';
import { prepararCatalogo } from '../scripts/preparar-catalogo.js';
import { CATALOGO_EN, NOMBRES, INSTRUCCIONES } from './fixtures/ejercicios.js';
import { DICCIONARIO } from './dic.js';

const ctx = { dic: DICCIONARIO, nombres: NOMBRES, instrucciones: INSTRUCCIONES };

async function jpg(ruta, ancho) {
  fs.mkdirSync(path.dirname(ruta), { recursive: true });
  await sharp({ create: { width: ancho, height: Math.round(ancho / 2), channels: 3, background: '#c6ff3d' } }).jpeg().toFile(ruta);
}

test('genera catalogo.json con fotos WebP de máximo 480 px y omite las fotos que faltan', async () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'migym-prep-'));
  const img = path.join(tmp, 'img'); const salida = path.join(tmp, 'dist-catalogo');
  const [a, b] = CATALOGO_EN;
  await jpg(path.join(img, a.id, '0.jpg'), 900);
  await jpg(path.join(img, a.id, '1.jpg'), 300);
  // b: no tiene fotos en disco.
  const r = await prepararCatalogo({ catalogo: [a, b], ctx, imgOrigen: img, destino: salida });
  const paquete = JSON.parse(fs.readFileSync(path.join(salida, 'catalogo.json'), 'utf8'));
  assert.equal(paquete.ejercicios.length, 2);
  assert.match(paquete.version, /^[0-9a-f]{12}$/);
  const fa = paquete.ejercicios.find(f => f.id === a.id); const fb = paquete.ejercicios.find(f => f.id === b.id);
  assert.equal(fa.img_ini, `${a.id}/0.webp`);
  assert.equal(fb.img_ini, null);
  assert.equal(fb.img_fin, null);
  const grande = await sharp(path.join(salida, 'img', a.id, '0.webp')).metadata();
  const chica = await sharp(path.join(salida, 'img', a.id, '1.webp')).metadata();
  assert.equal(grande.format, 'webp');
  assert.equal(grande.width, 480);
  assert.equal(chica.width, 300, 'no agranda las fotos chicas');
  assert.equal(r.imagenes, 2);
  const reales = [`${a.id}/0.webp`, `${a.id}/1.webp`].reduce((t, f) => t + fs.statSync(path.join(salida, 'img', f)).size, 0);
  assert.equal(r.bytes, reales, 'el total informado coincide con lo escrito');
});
