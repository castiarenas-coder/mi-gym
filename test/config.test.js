import { test } from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { resolverConfig } from '../server/config.js';

const raiz = path.resolve('/app');

test('sin variables, todo queda relativo al repo (modo desarrollo)', () => {
  const c = resolverConfig({}, raiz);
  assert.equal(c.dbFile, path.join(raiz, 'data', 'mi_gym.db'));
  assert.equal(c.imgDir, path.join(raiz, 'data', 'img'));
  assert.equal(c.mediaDir, path.join(raiz, 'data', 'media'));
  assert.equal(c.backupsDir, path.join(raiz, 'backups'));
  assert.equal(c.logFile, path.join(raiz, 'data', 'server.log'));
  assert.equal(c.catalogoDir, null);
  assert.equal(c.port, 8788);
  assert.equal(c.instalado, false);
});

test('MI_GYM_DATA mueve base, medios, respaldos y log a una carpeta', () => {
  const datos = path.resolve('/datos/Mi Gym');
  const c = resolverConfig({ MI_GYM_DATA: datos }, raiz);
  assert.equal(c.dbFile, path.join(datos, 'mi_gym.db'));
  assert.equal(c.mediaDir, path.join(datos, 'media'));
  assert.equal(c.backupsDir, path.join(datos, 'backups'));
  assert.equal(c.logFile, path.join(datos, 'server.log'));
  assert.equal(c.dataDir, datos);
  assert.equal(c.imgDir, path.join(raiz, 'data', 'img'), 'las fotos del catálogo no dependen de los datos del usuario');
});

test('MI_GYM_IMG y MI_GYM_CATALOGO apuntan al catálogo empaquetado; las variables específicas ganan', () => {
  const c = resolverConfig({ MI_GYM_DATA: '/d', MI_GYM_IMG: '/c/img', MI_GYM_CATALOGO: '/c', MI_GYM_DB: '/x/otra.db', MI_GYM_PORT: '9000', MI_GYM_INSTALADO: '1' }, raiz);
  assert.equal(c.imgDir, path.resolve('/c/img'));
  assert.equal(c.catalogoDir, path.resolve('/c'));
  assert.equal(c.dbFile, path.resolve('/x/otra.db'));
  assert.equal(c.port, 9000);
  assert.equal(c.instalado, true);
});
