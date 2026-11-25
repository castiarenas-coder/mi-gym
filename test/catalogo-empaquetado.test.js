import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { openDb } from '../server/db.js';
import { traducirEjercicio, cargarCatalogoEmpaquetado, versionDeCatalogo } from '../server/catalogo.js';
import { CATALOGO_EN, NOMBRES, INSTRUCCIONES } from './fixtures/ejercicios.js';
import { DICCIONARIO } from './dic.js';

const ctx = { dic: DICCIONARIO, nombres: NOMBRES, instrucciones: INSTRUCCIONES };

function carpetaConCatalogo(filas, version = versionDeCatalogo(filas)) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'migym-cat-'));
  fs.writeFileSync(path.join(dir, 'catalogo.json'), JSON.stringify({ version, ejercicios: filas }));
  return dir;
}

test('traducirEjercicio acepta otra extensión de imagen (WebP del instalador)', () => {
  const f = traducirEjercicio(CATALOGO_EN[0], { ...ctx, ext: 'webp' });
  assert.equal(f.img_ini, `${CATALOGO_EN[0].id}/0.webp`);
  assert.equal(f.img_fin, `${CATALOGO_EN[0].id}/1.webp`);
  assert.equal(traducirEjercicio(CATALOGO_EN[0], ctx).img_ini, `${CATALOGO_EN[0].id}/0.jpg`, 'por defecto sigue siendo jpg');
});

test('instalación nueva: carga el catálogo empaquetado sin red', () => {
  const filas = CATALOGO_EN.map(e => traducirEjercicio(e, { ...ctx, ext: 'webp' }));
  const dir = carpetaConCatalogo(filas);
  const db = openDb(':memory:');
  const r = cargarCatalogoEmpaquetado(db, dir);
  assert.deepEqual({ cargado: r.cargado, total: r.total }, { cargado: true, total: filas.length });
  assert.equal(db.prepare('SELECT COUNT(*) AS n FROM ejercicios').get().n, filas.length);
  assert.match(db.prepare('SELECT img_ini FROM ejercicios WHERE id = ?').get(filas[0].id).img_ini, /\.webp$/);
  db.close();
});

test('misma versión y base con ejercicios: no vuelve a cargar', () => {
  const filas = CATALOGO_EN.map(e => traducirEjercicio(e, ctx));
  const dir = carpetaConCatalogo(filas);
  const db = openDb(':memory:');
  assert.equal(cargarCatalogoEmpaquetado(db, dir).cargado, true);
  assert.equal(cargarCatalogoEmpaquetado(db, dir).cargado, false);
  db.close();
});

test('versión nueva: actualiza el catálogo pero respeta favoritos y media propia', () => {
  const filas = CATALOGO_EN.map(e => traducirEjercicio(e, ctx));
  const db = openDb(':memory:');
  cargarCatalogoEmpaquetado(db, carpetaConCatalogo(filas));
  const id = filas[0].id;
  db.prepare('UPDATE ejercicios SET media_propia = ?, favorito = 1 WHERE id = ?').run('mi.gif', id);
  db.prepare('INSERT INTO favoritos (persona_id, ejercicio_id) VALUES (1, ?)').run(id);
  const nuevas = filas.map((f, i) => (i === 0 ? { ...f, nombre: 'Nombre corregido' } : f));
  const r = cargarCatalogoEmpaquetado(db, carpetaConCatalogo(nuevas));
  assert.equal(r.cargado, true);
  const fila = db.prepare('SELECT nombre, media_propia, favorito FROM ejercicios WHERE id = ?').get(id);
  assert.deepEqual({ ...fila }, { nombre: 'Nombre corregido', media_propia: 'mi.gif', favorito: 1 });
  assert.equal(db.prepare('SELECT COUNT(*) AS n FROM favoritos').get().n, 1);
  db.close();
});

test('base vacía recarga aunque la versión coincida; sin carpeta o archivo roto no falla', () => {
  const filas = CATALOGO_EN.map(e => traducirEjercicio(e, ctx));
  const dir = carpetaConCatalogo(filas);
  const db = openDb(':memory:');
  cargarCatalogoEmpaquetado(db, dir);
  db.exec('DELETE FROM ejercicios');
  assert.equal(cargarCatalogoEmpaquetado(db, dir).cargado, true);
  assert.equal(cargarCatalogoEmpaquetado(db, null).cargado, false);
  assert.equal(cargarCatalogoEmpaquetado(db, path.join(dir, 'no-existe')).cargado, false);
  fs.writeFileSync(path.join(dir, 'catalogo.json'), '{roto');
  assert.equal(cargarCatalogoEmpaquetado(db, dir).cargado, false);
  db.close();
});

test('versionDeCatalogo es estable y cambia con el contenido', () => {
  const a = CATALOGO_EN.map(e => traducirEjercicio(e, ctx));
  assert.equal(versionDeCatalogo(a), versionDeCatalogo(structuredClone(a)));
  assert.notEqual(versionDeCatalogo(a), versionDeCatalogo(a.map(f => ({ ...f, nombre: f.nombre + '!' }))));
});
