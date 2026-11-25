import { test } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { servidorDePrueba } from './helpers.js';

// fetch no deja cambiar Host: se usa http.request para falsificarlo como haría un ataque de DNS rebinding.
function crudo(base, { metodo = 'GET', ruta, headers = {}, cuerpo }) {
  const u = new URL(base);
  return new Promise((resolve, reject) => {
    const req = http.request({ host: u.hostname, port: u.port, method: metodo, path: ruta, headers }, res => {
      let t = ''; res.on('data', d => { t += d; }); res.on('end', () => resolve({ status: res.statusCode, text: t }));
    });
    req.on('error', reject);
    req.end(cuerpo);
  });
}

test('Host ajeno (DNS rebinding) se rechaza con 403, también en GET', async () => {
  const s = await servidorDePrueba();
  try {
    assert.equal((await crudo(s.base, { ruta: '/api/salud', headers: { host: 'evil.com' } })).status, 403);
    assert.equal((await crudo(s.base, { ruta: '/api/salud', headers: { host: `evil.com:${new URL(s.base).port}` } })).status, 403);
    assert.equal((await crudo(s.base, { ruta: '/', headers: { host: 'evil.com' } })).status, 403);
    assert.equal((await crudo(s.base, { ruta: '/api/salud', headers: { host: `127.0.0.1:${Number(new URL(s.base).port) + 1}` } })).status, 403);
  } finally { s.cerrar(); }
});

test('Host de la propia PC (127.0.0.1, localhost, [::1]) con el puerto real pasa', async () => {
  const s = await servidorDePrueba();
  try {
    const puerto = new URL(s.base).port;
    for (const h of [`127.0.0.1:${puerto}`, `localhost:${puerto}`, `[::1]:${puerto}`]) {
      assert.equal((await crudo(s.base, { ruta: '/api/salud', headers: { host: h } })).status, 200, h);
    }
  } finally { s.cerrar(); }
});

test('GET sin X-Mi-Gym sigue funcionando', async () => {
  const s = await servidorDePrueba();
  try { assert.equal((await s.pedir('/api/salud')).status, 200); } finally { s.cerrar(); }
});

test('POST/PUT/PATCH/DELETE a /api sin X-Mi-Gym -> 403', async () => {
  const s = await servidorDePrueba();
  try {
    for (const metodo of ['POST', 'PUT', 'PATCH', 'DELETE']) {
      const r = await s.pedir('/api/personas', { method: metodo, body: {}, sinMiGym: true });
      assert.equal(r.status, 403, metodo);
    }
    const r = await s.pedir('/api/respaldo/ahora', { method: 'POST', sinMiGym: true });
    assert.equal(r.status, 403);
    // Y no se creó nada.
    assert.equal((await s.pedir('/api/personas')).json.length, 1);
  } finally { s.cerrar(); }
});

test('POST con X-Mi-Gym pasa; con Origin propio pasa; con Origin ajeno -> 403', async () => {
  const s = await servidorDePrueba();
  try {
    const H = { 'x-mi-gym': '1' };
    const ok = await s.pedir('/api/personas', { method: 'POST', headers: H, body: { nombre: 'Ana' } });
    assert.equal(ok.status, 201);
    const conOrigen = await s.pedir('/api/personas', { method: 'POST', headers: { ...H, origin: s.base }, body: { nombre: 'Beto' } });
    assert.equal(conOrigen.status, 201);
    const localhost = await s.pedir('/api/personas', { method: 'POST', headers: { ...H, origin: `http://localhost:${new URL(s.base).port}` }, body: { nombre: 'Cai' } });
    assert.equal(localhost.status, 201);
    const mala = await s.pedir('/api/personas', { method: 'POST', headers: { ...H, origin: 'http://evil.com' }, body: { nombre: 'Mal' } });
    assert.equal(mala.status, 403);
    const nula = await s.pedir('/api/personas', { method: 'POST', headers: { ...H, origin: 'null' }, body: { nombre: 'Mal' } });
    assert.equal(nula.status, 403);
  } finally { s.cerrar(); }
});

test('POST /api/apagar sin la cabecera no apaga; con ella sí', async () => {
  let apagado = 0;
  const s = await servidorDePrueba({ apagar: () => { apagado++; } });
  try {
    assert.equal((await s.pedir('/api/apagar', { method: 'POST', sinMiGym: true })).status, 403);
    assert.equal((await s.pedir('/api/apagar', { method: 'POST', sinMiGym: true, headers: { 'content-type': 'text/plain' } })).status, 403);
    await new Promise(r => setTimeout(r, 120));
    assert.equal(apagado, 0);
    assert.equal((await s.pedir('/api/apagar', { method: 'POST', headers: { 'x-mi-gym': '1' } })).status, 200);
    await new Promise(r => setTimeout(r, 150));
    assert.equal(apagado, 1);
  } finally { s.cerrar(); }
});

test('modo LAN: la IP de la red local es un Host válido; sin LAN no', async () => {
  const direcciones = p => [`http://192.168.1.50:${p}`];
  const lan = await servidorDePrueba({ lan: true, direcciones });
  try {
    const puerto = new URL(lan.base).port;
    assert.equal((await crudo(lan.base, { ruta: '/api/salud', headers: { host: `192.168.1.50:${puerto}` } })).status, 200);
    assert.equal((await crudo(lan.base, { ruta: '/api/salud', headers: { host: `192.168.1.51:${puerto}` } })).status, 403);
    const origen = await lan.pedir('/api/personas', { method: 'POST', headers: { 'x-mi-gym': '1', origin: `http://192.168.1.50:${puerto}` }, body: { nombre: 'Tel' } });
    assert.equal(origen.status, 201);
  } finally { lan.cerrar(); }
  const sinLan = await servidorDePrueba({ direcciones });
  try {
    const puerto = new URL(sinLan.base).port;
    assert.equal((await crudo(sinLan.base, { ruta: '/api/salud', headers: { host: `192.168.1.50:${puerto}` } })).status, 403);
  } finally { sinLan.cerrar(); }
});
