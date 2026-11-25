import { test } from 'node:test';
import assert from 'node:assert/strict';
import { compararVersiones, crearComprobador } from '../server/actualizacion.js';
import { servidorDePrueba } from './helpers.js';

const respuesta = (tag, extra = {}) => async () => ({ ok: true, status: 200, json: async () => ({ tag_name: tag, html_url: `https://github.com/castiarenas-coder/mi-gym/releases/tag/${tag}`, ...extra }) });

test('compararVersiones ordena numéricamente y tolera la "v"', () => {
  assert.equal(compararVersiones('0.2.0', '0.1.9'), 1);
  assert.equal(compararVersiones('v0.1.0', '0.1.0'), 0);
  assert.equal(compararVersiones('0.1.0', '0.10.0'), -1);
  assert.equal(compararVersiones('1.0', '1.0.1'), -1);
});

test('hay versión nueva cuando la última release es mayor', async () => {
  const pedidos = [];
  const f = async (url, init) => { pedidos.push(url); return respuesta('v0.2.0')(); };
  const c = crearComprobador({ version: '0.1.0', fetchFn: f });
  const r = await c();
  assert.deepEqual(r, { actual: '0.1.0', ultima: '0.2.0', hay_nueva: true, url: 'https://github.com/castiarenas-coder/mi-gym/releases/tag/v0.2.0' });
  assert.equal(pedidos[0], 'https://api.github.com/repos/castiarenas-coder/mi-gym/releases/latest');
});

test('misma versión o más vieja: no hay nueva', async () => {
  assert.equal((await crearComprobador({ version: '0.2.0', fetchFn: respuesta('v0.2.0') })()).hay_nueva, false);
  assert.equal((await crearComprobador({ version: '0.3.0', fetchFn: respuesta('v0.2.0') })()).hay_nueva, false);
});

test('cachea el resultado 12 horas', async () => {
  let n = 0; let t = 1_000_000;
  const f = async () => { n++; return respuesta('v0.2.0')(); };
  const c = crearComprobador({ version: '0.1.0', fetchFn: f, ahora: () => t });
  await c(); await c();
  assert.equal(n, 1);
  t += 11 * 3600_000; await c();
  assert.equal(n, 1);
  t += 2 * 3600_000; await c();
  assert.equal(n, 2);
});

test('sin internet falla en silencio y reintenta pronto', async () => {
  let n = 0; let t = 0;
  const f = async () => { n++; if (n === 1) throw new Error('offline'); return respuesta('v0.2.0')(); };
  const c = crearComprobador({ version: '0.1.0', fetchFn: f, ahora: () => t });
  assert.deepEqual(await c(), { actual: '0.1.0', ultima: null, hay_nueva: false, url: null });
  t += 31 * 60_000;
  assert.equal((await c()).hay_nueva, true);
});

test('respuestas raras (404, sin tag) no rompen', async () => {
  assert.equal((await crearComprobador({ version: '0.1.0', fetchFn: async () => ({ ok: false, status: 404 }) })()).hay_nueva, false);
  assert.equal((await crearComprobador({ version: '0.1.0', fetchFn: async () => ({ ok: true, json: async () => ({}) }) })()).ultima, null);
});

test('GET /api/actualizacion usa el comprobador', async () => {
  const s = await servidorDePrueba({ actualizacion: async () => ({ actual: '9.9.9', ultima: '10.0.0', hay_nueva: true, url: 'https://x' }) });
  try {
    const r = await s.pedir('/api/actualizacion');
    assert.equal(r.status, 200);
    assert.equal(r.json.hay_nueva, true);
  } finally { s.cerrar(); }
});
