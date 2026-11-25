import { test } from 'node:test';
import assert from 'node:assert/strict';
import net from 'node:net';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { escucharEnLibre, esLoopback } from '../server/puerto.js';
import { servidorDePrueba } from './helpers.js';

function ocupar() {
  return new Promise(r => { const s = net.createServer(); s.listen(0, '127.0.0.1', () => r(s)); });
}
const cerrar = s => new Promise(r => s.close(r));
const appVacia = (req, res) => res.end('ok');

test('escucha en el puerto pedido si está libre', async () => {
  const ocupado = await ocupar(); const libre = ocupado.address().port; await cerrar(ocupado);
  const { server, port } = await escucharEnLibre(appVacia, '127.0.0.1', libre);
  assert.equal(port, libre);
  await cerrar(server);
});

test('si el puerto está ocupado por otra app, prueba el siguiente', async () => {
  const otro = await ocupar(); const p = otro.address().port;
  try {
    const { server, port } = await escucharEnLibre(appVacia, '127.0.0.1', p);
    assert.notEqual(port, p);
    assert.ok(port > p && port <= p + 50);
    await cerrar(server);
  } finally { await cerrar(otro); }
});

test('se rinde tras agotar los intentos', async () => {
  const otro = await ocupar(); const p = otro.address().port;
  try { await assert.rejects(escucharEnLibre(appVacia, '127.0.0.1', p, { intentos: 1 }), /EADDRINUSE|ocupad/i); } finally { await cerrar(otro); }
});

test('POST /api/apagar: solo con callback, solo desde la propia PC', async () => {
  let apagado = 0;
  const s = await servidorDePrueba({ apagar: () => { apagado++; } });
  try {
    const r = await s.pedir('/api/apagar', { method: 'POST' });
    assert.equal(r.status, 200);
    await new Promise(r2 => setTimeout(r2, 50));
    assert.equal(apagado, 1);
    assert.equal((await s.pedir('/api/info')).json.apagable, true);
  } finally { s.cerrar(); }
  const sin = await servidorDePrueba();
  try {
    assert.equal((await sin.pedir('/api/apagar', { method: 'POST' })).status, 404);
    assert.equal((await sin.pedir('/api/info')).json.apagable, false);
  } finally { sin.cerrar(); }
});

test('esLoopback reconoce solo direcciones de la propia PC', () => {
  for (const a of ['127.0.0.1', '::1', '::ffff:127.0.0.1']) assert.equal(esLoopback(a), true, a);
  for (const a of ['192.168.1.40', '10.0.0.2', undefined, '::ffff:192.168.1.40']) assert.equal(esLoopback(a), false, String(a));
});

test('/api/info informa la plataforma (android oculta en la app lo que solo sirve en PC)', async () => {
  const pc = await servidorDePrueba();
  try { assert.equal((await pc.pedir('/api/info')).json.plataforma, 'escritorio'); } finally { pc.cerrar(); }
  const android = await servidorDePrueba({ plataforma: 'android' });
  try { assert.equal((await android.pedir('/api/info')).json.plataforma, 'android'); } finally { android.cerrar(); }
});
