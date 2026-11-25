import { test } from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { servidorDePrueba } from './helpers.js';
import { resolverConfig } from '../server/config.js';

test('MI_GYM_TOKEN llega a la configuración (sin él no hay control de acceso)', () => {
  assert.equal(resolverConfig({}, path.resolve('/app')).token, null);
  assert.equal(resolverConfig({ MI_GYM_TOKEN: 'abc' }, path.resolve('/app')).token, 'abc');
});

test('sin token configurado el servidor responde a cualquiera', async () => {
  const s = await servidorDePrueba();
  try { assert.equal((await s.pedir('/api/salud')).status, 200); } finally { s.cerrar(); }
});

test('con token: sin clave no pasa, con la clave en la URL la cambia por una cookie y redirige sin ella', async () => {
  const s = await servidorDePrueba({ token: 'clave-secreta' });
  try {
    assert.equal((await s.pedir('/api/respaldo/exportar')).status, 403);
    assert.equal((await s.pedir('/api/salud')).status, 403);
    const r = await fetch(`${s.base}/api/salud?mi_gym_token=mala`, { redirect: 'manual' });
    assert.equal(r.status, 403);
    const ok = await fetch(`${s.base}/ajustes?x=1&mi_gym_token=clave-secreta`, { redirect: 'manual' });
    assert.equal(ok.status, 302);
    assert.equal(ok.headers.get('location'), '/ajustes?x=1');
    const cookie = ok.headers.get('set-cookie');
    assert.match(cookie, /^mi_gym_token=clave-secreta;/);
    assert.match(cookie, /HttpOnly/);
    assert.match(cookie, /SameSite=Strict/);
    const con = await fetch(`${s.base}/api/salud`, { headers: { cookie: 'otra=1; mi_gym_token=clave-secreta' } });
    assert.equal(con.status, 200);
    const mala = await fetch(`${s.base}/api/salud`, { headers: { cookie: 'mi_gym_token=otra' } });
    assert.equal(mala.status, 403);
  } finally { s.cerrar(); }
});
