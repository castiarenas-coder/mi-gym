import { test, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { servidorDePrueba } from './helpers.js';
import { crearRemotoEnMemoria } from './helpers-remoto.js';
import { ErrorSupabase } from '../server/sync/supabase.js';

const SUPA = { url: 'https://abc.supabase.co', anonKey: 'ANON' };
const vaciar = () => new Promise(r => setImmediate(r));
const sinTimers = { setInterval: () => ({}), setTimeout: () => ({}), clearInterval() {}, clearTimeout() {} };
const abiertos = [];
afterEach(() => { while (abiertos.length) abiertos.pop()(); });

function clienteFalso(info = null, remoto = crearRemotoEnMemoria()) {
  const c = {
    info, r: remoto, borrada: false, codigos: [], falla: null,
    cuenta: async () => {
      if (c.falla) throw c.falla;
      if (!c.info) throw new ErrorSupabase('sin_sesion', 'No hay sesión iniciada');
      return { ...c.info };
    },
    enviarCodigo: async (email) => { c.codigos.push(email); },
    verificarCodigo: async (email) => { if (c.falla) throw c.falla; c.info = { email, plan: 'gratis', consentimiento_en: null }; return { access_token: 'TOKEN-SECRETO' }; },
    urlGoogle: (redirectTo, verificador) => `https://google.test/auth?r=${encodeURIComponent(redirectTo)}&v=${verificador}`,
    canjearCodigoGoogle: async (codigo, verificador) => { c.canje = { codigo, verificador }; c.info = { email: 'g@x.com', plan: 'pro', consentimiento_en: null }; },
    aceptarConsentimiento: async () => { c.info.consentimiento_en = '2026-11-27T00:00:00Z'; },
    cerrarSesion: async () => { c.info = null; },
    borrarCuenta: async () => { c.borrada = true; c.info = null; },
    remoto: () => c.r,
  };
  return c;
}
const PRO = { id: 'u-1', email: 'Ana@Correo.com', plan: 'pro', consentimiento_en: '2026-11-27T00:00:00Z' };

async function servidor(opts = {}) {
  const backupsDir = fs.mkdtempSync(path.join(os.tmpdir(), 'cuenta-bk-'));
  const s = await servidorDePrueba({ supabase: SUPA, backupsDir, timers: sinTimers, ...opts });
  abiertos.push(() => { s.cerrar(); fs.rmSync(backupsDir, { recursive: true, force: true }); });
  return s;
}
const estadoSync = (s, k) => s.db.prepare('SELECT valor FROM sync_estado WHERE clave = ?').get(k)?.valor ?? null;

test('sin variables de Supabase: GET /api/cuenta dice habilitada:false y el resto no existe', async () => {
  const s = await servidorDePrueba();
  abiertos.push(s.cerrar);
  const r = await s.pedir('/api/cuenta');
  assert.equal(r.status, 200);
  assert.deepEqual(r.json, { habilitada: false, google: false, sesion: null, vinculado: false, ultimaSincronizacion: null, error: null });
  for (const [m, ruta] of [['POST', '/api/cuenta/codigo'], ['POST', '/api/cuenta/sincronizar'], ['GET', '/api/cuenta/vinculo'], ['DELETE', '/api/cuenta']]) {
    assert.equal((await s.pedir(ruta, { method: m, body: m === 'POST' ? {} : undefined })).status, 404, `${m} ${ruta}`);
  }
});

test('GET /api/cuenta: sin sesión, y con sesión (plan, consentimiento, vinculado)', async () => {
  const c = clienteFalso();
  const s = await servidor({ cliente: c });
  let r = await s.pedir('/api/cuenta');
  assert.deepEqual([r.json.habilitada, r.json.sesion, r.json.vinculado], [true, null, false]);
  c.info = { ...PRO, consentimiento_en: null };
  r = await s.pedir('/api/cuenta');
  assert.deepEqual(r.json.sesion, { email: 'Ana@Correo.com', plan: 'pro', consentimiento: false });
  assert.equal(r.json.error, null);
  c.info = { ...PRO };
  assert.equal((await s.pedir('/api/cuenta')).json.sesion.consentimiento, true);
});

test('GET /api/cuenta sin red: muestra lo último conocido y el motivo, sin romper', async () => {
  const c = clienteFalso(PRO);
  const s = await servidor({ cliente: c });
  await s.pedir('/api/cuenta');
  c.falla = new ErrorSupabase('sin_red', 'fetch failed');
  const r = await s.pedir('/api/cuenta');
  assert.equal(r.status, 200);
  assert.equal(r.json.sesion.plan, 'pro');
  assert.match(r.json.error, /conexión/i);
});

test('código: valida el mail y lo manda; verificar valida el código', async () => {
  const c = clienteFalso();
  const s = await servidor({ cliente: c });
  assert.equal((await s.pedir('/api/cuenta/codigo', { method: 'POST', body: { email: 'nada' } })).status, 400);
  assert.equal((await s.pedir('/api/cuenta/codigo', { method: 'POST', body: {} })).status, 400);
  const ok = await s.pedir('/api/cuenta/codigo', { method: 'POST', body: { email: ' ana@correo.com ' } });
  assert.deepEqual([ok.status, ok.json], [200, { ok: true }]);
  assert.deepEqual(c.codigos, ['ana@correo.com']);
  assert.equal((await s.pedir('/api/cuenta/verificar', { method: 'POST', body: { email: 'ana@correo.com', codigo: 'abc' } })).status, 400);
});

test('flujo código → verificar con el cliente real guarda la sesión cifrada y la cuenta la lee', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'cuenta-clave-'));
  const fetchFn = async (url) => {
    const resp = (status, cuerpo) => ({ ok: status < 300, status, json: async () => cuerpo, text: async () => JSON.stringify(cuerpo) });
    if (url.endsWith('/auth/v1/otp')) return resp(200, {});
    if (url.endsWith('/auth/v1/verify')) return resp(200, { access_token: 'ACCESO-123', refresh_token: 'REN-456', expires_in: 3600, user: { id: 'uuid-9', email: 'ana@correo.com' } });
    if (url.includes('/rest/v1/cuentas')) return resp(200, [{ plan: 'pro', consentimiento_en: null }]);
    return resp(404, {});
  };
  const s = await servidor({ fetchFn, rutaClave: path.join(dir, 'clave-equipo') });
  abiertos.push(() => fs.rmSync(dir, { recursive: true, force: true }));
  assert.equal((await s.pedir('/api/cuenta/codigo', { method: 'POST', body: { email: 'ana@correo.com' } })).status, 200);
  const v = await s.pedir('/api/cuenta/verificar', { method: 'POST', body: { email: 'ana@correo.com', codigo: '123456' } });
  assert.equal(v.status, 200);
  assert.ok(!v.text.includes('ACCESO-123') && !v.text.includes('REN-456'), 'la respuesta no lleva tokens');
  const g = await s.pedir('/api/cuenta');
  assert.deepEqual(g.json.sesion, { email: 'ana@correo.com', plan: 'pro', consentimiento: false });
  const guardada = estadoSync(s, 'sesion');
  assert.ok(guardada && !guardada.includes('ACCESO-123'), 'la sesión se guarda cifrada');
});

test('errores de la nube: estado y mensaje en castellano, sin filtrar nada interno', async () => {
  const c = clienteFalso();
  const s = await servidor({ cliente: c });
  const casos = [['codigo_invalido', 400], ['demasiados_intentos', 429], ['sin_red', 503], ['servidor', 502], ['plan_requerido', 402]];
  for (const [codigo, status] of casos) {
    c.falla = new ErrorSupabase(codigo, 'detalle interno Bearer XYZ');
    const r = await s.pedir('/api/cuenta/verificar', { method: 'POST', body: { email: 'a@b.co', codigo: '123456' } });
    assert.equal(r.status, status, codigo);
    assert.equal(r.json.codigo, codigo);
    assert.ok(!r.text.includes('XYZ'), 'no se filtra el detalle');
    assert.match(r.json.error, /[a-záéíóú]{3,}/i);
  }
  c.falla = new Error('bomba Bearer XYZ');
  const r = await s.pedir('/api/cuenta/verificar', { method: 'POST', body: { email: 'a@b.co', codigo: '123456' } });
  assert.equal(r.status, 500);
  assert.ok(!r.text.includes('XYZ'));
});

test('consentimiento: se registra en la nube y requiere sesión', async () => {
  const c = clienteFalso();
  const s = await servidor({ cliente: c });
  assert.equal((await s.pedir('/api/cuenta/consentimiento', { method: 'POST', body: {} })).status, 401);
  c.info = { ...PRO, consentimiento_en: null };
  assert.equal((await s.pedir('/api/cuenta/consentimiento', { method: 'POST', body: {} })).status, 200);
  assert.equal((await s.pedir('/api/cuenta')).json.sesion.consentimiento, true);
});

test('sincronizar: 401 sin sesión, 402 plan gratis, 409 sin consentimiento, 409 sin vincular, 200 con todo', async () => {
  const c = clienteFalso();
  const s = await servidor({ cliente: c });
  const sync = () => s.pedir('/api/cuenta/sincronizar', { method: 'POST', body: {} });
  assert.equal((await sync()).status, 401);
  c.info = { id: 'u-2', email: 'a@b.co', plan: 'gratis', consentimiento_en: null };
  assert.equal((await sync()).status, 402);
  c.info = { id: 'u-2', email: 'a@b.co', plan: 'pro', consentimiento_en: null };
  const sinConsent = await sync();
  assert.deepEqual([sinConsent.status, sinConsent.json.codigo], [409, 'sin_consentimiento']);
  c.info.consentimiento_en = 'x';
  const sinVinculo = await sync();
  assert.deepEqual([sinVinculo.status, sinVinculo.json.codigo], [409, 'sin_vinculo']);
  assert.equal(c.remoto().docsSubidos, 0, 'nada se sube antes de vincular');
  await s.pedir('/api/cuenta/vincular', { method: 'POST', body: { modo: 'subir' } });
  const ok = await sync();
  assert.equal(ok.status, 200);
  assert.equal(ok.json.ok, true);
  assert.ok(ok.json.ultimaSincronizacion);
  assert.equal(typeof ok.json.resultado.subidos, 'number');
});

test('vínculo: estado, vincular (subir) guarda la cuenta; errores de modo y de nube vacía', async () => {
  const c = clienteFalso(PRO);
  const s = await servidor({ cliente: c });
  const v = await s.pedir('/api/cuenta/vinculo');
  assert.deepEqual(v.json, { estado: 'cuenta_vacia', vinculado: false, duplicadas: [] });
  assert.equal((await s.pedir('/api/cuenta/vincular', { method: 'POST', body: { modo: 'volar' } })).status, 400);
  const nube = await s.pedir('/api/cuenta/vincular', { method: 'POST', body: { modo: 'reemplazar' } });
  assert.deepEqual([nube.status, nube.json.codigo], [409, 'nube_vacia']);
  const ok = await s.pedir('/api/cuenta/vincular', { method: 'POST', body: { modo: 'subir' } });
  assert.equal(ok.status, 200);
  assert.equal(estadoSync(s, 'cuenta'), 'u-1', 'la cuenta se identifica por el id de usuario, no por el mail');
  assert.ok(c.remoto().documentos().length > 0);
  const g = await s.pedir('/api/cuenta');
  assert.equal(g.json.vinculado, true);
  assert.ok(g.json.ultimaSincronizacion);
});

test('vínculo: pide plan pro y, para vincular, consentimiento', async () => {
  const c = clienteFalso({ id: 'u-2', email: 'a@b.co', plan: 'gratis', consentimiento_en: null });
  const s = await servidor({ cliente: c });
  assert.equal((await s.pedir('/api/cuenta/vinculo')).status, 402);
  c.info = { id: 'u-2', email: 'a@b.co', plan: 'pro', consentimiento_en: null };
  assert.equal((await s.pedir('/api/cuenta/vinculo')).status, 200);
  const r = await s.pedir('/api/cuenta/vincular', { method: 'POST', body: { modo: 'subir' } });
  assert.deepEqual([r.status, r.json.codigo], [409, 'sin_consentimiento']);
  assert.equal(c.remoto().docsSubidos, 0);
});

test('vincular a otra cuenta ya vinculada: 409 otra_cuenta; con forzar sigue', async () => {
  const c = clienteFalso(PRO);
  const s = await servidor({ cliente: c });
  s.db.prepare("INSERT INTO sync_estado (clave, valor) VALUES ('cuenta', 'otra@x.com')").run();
  const r = await s.pedir('/api/cuenta/vincular', { method: 'POST', body: { modo: 'subir' } });
  assert.deepEqual([r.status, r.json.codigo], [409, 'otra_cuenta']);
  const f = await s.pedir('/api/cuenta/vincular', { method: 'POST', body: { modo: 'subir', forzar: true } });
  assert.equal(f.status, 200);
});

test('unificar personas: lista los duplicados y valida el par', async () => {
  const c = clienteFalso(PRO);
  const s = await servidor({ cliente: c });
  // Dos personas con el mismo nombre solo nacen al juntar datos de dos equipos.
  s.db.prepare("INSERT INTO personas (nombre, creada) VALUES ('yo', ?)").run(new Date().toISOString());
  const v = await s.pedir('/api/cuenta/vinculo');
  assert.equal(v.json.duplicadas.length, 1);
  const { conservar, duplicada } = v.json.duplicadas[0];
  assert.equal((await s.pedir('/api/cuenta/unificar', { method: 'POST', body: { conservar: duplicada, duplicada: conservar } })).status, 400);
  assert.equal((await s.pedir('/api/cuenta/unificar', { method: 'POST', body: { conservar: 'x' } })).status, 400);
  const ok = await s.pedir('/api/cuenta/unificar', { method: 'POST', body: { conservar, duplicada } });
  assert.equal(ok.status, 200);
  assert.equal((await s.pedir('/api/cuenta/vinculo')).json.duplicadas.length, 0);
});

test('salir cierra la sesión; borrar cuenta borra la nube pero deja los datos del equipo', async () => {
  const c = clienteFalso(PRO);
  const s = await servidor({ cliente: c });
  await s.pedir('/api/cuenta/vincular', { method: 'POST', body: { modo: 'subir' } });
  const personas = s.db.prepare('SELECT COUNT(*) n FROM personas').get().n;
  const rutinas = s.db.prepare('SELECT COUNT(*) n FROM rutinas').get().n;
  assert.equal((await s.pedir('/api/cuenta/salir', { method: 'POST', body: {} })).status, 200);
  assert.equal((await s.pedir('/api/cuenta')).json.sesion, null);
  c.info = { ...PRO };
  const d = await s.pedir('/api/cuenta', { method: 'DELETE' });
  assert.equal(d.status, 200);
  assert.equal(c.borrada, true);
  assert.equal(s.db.prepare('SELECT COUNT(*) n FROM personas').get().n, personas);
  assert.equal(s.db.prepare('SELECT COUNT(*) n FROM rutinas').get().n, rutinas);
  assert.equal(estadoSync(s, 'cuenta'), null, 'el estado de sincronización se reinicia');
  assert.equal(estadoSync(s, 'ultimo_envio'), null);
});

test('las protecciones de la API siguen: sin X-Mi-Gym no se puede mutar', async () => {
  const s = await servidor({ cliente: clienteFalso(PRO) });
  for (const [m, ruta] of [['POST', '/api/cuenta/sincronizar'], ['POST', '/api/cuenta/salir'], ['DELETE', '/api/cuenta'], ['POST', '/api/cuenta/vincular']]) {
    const r = await s.pedir(ruta, { method: m, body: m === 'POST' ? {} : undefined, sinMiGym: true });
    assert.equal(r.status, 403, `${m} ${ruta}`);
  }
});

test('Google: redirige con un verificador y la vuelta canjea el código con ese mismo verificador', async () => {
  const c = clienteFalso();
  const s = await servidor({ cliente: c });
  const sinPendiente = await fetch(`${s.base}/api/cuenta/google/vuelta?code=abc`, { redirect: 'manual' });
  assert.equal(sinPendiente.status, 400);
  assert.equal(c.canje, undefined);
  const ir = await fetch(`${s.base}/api/cuenta/google`, { redirect: 'manual' });
  assert.equal(ir.status, 302);
  const destino = new URL(ir.headers.get('location'));
  assert.equal(destino.host, 'google.test');
  assert.equal(destino.searchParams.get('r'), `${s.base}/api/cuenta/google/vuelta`);
  const verificador = destino.searchParams.get('v');
  assert.ok(verificador.length >= 43);
  const vuelta = await fetch(`${s.base}/api/cuenta/google/vuelta?code=CODIGO1`);
  assert.equal(vuelta.status, 200);
  assert.match(await vuelta.text(), /Listo, ya podés volver a Rumbo Fit/);
  assert.deepEqual(c.canje, { codigo: 'CODIGO1', verificador });
  assert.equal((await fetch(`${s.base}/api/cuenta/google/vuelta?code=OTRO`)).status, 400, 'el verificador sirve una sola vez');
});

test('Google: si la vuelta trae un error, se muestra sin canjear y sin inyectar HTML', async () => {
  const c = clienteFalso();
  const s = await servidor({ cliente: c });
  await fetch(`${s.base}/api/cuenta/google`, { redirect: 'manual' });
  const r = await fetch(`${s.base}/api/cuenta/google/vuelta?error=access_denied&error_description=${encodeURIComponent('<script>x</script>')}`);
  assert.equal(r.status, 400);
  const html = await r.text();
  assert.ok(!html.includes('<script>x'));
  assert.equal(c.canje, undefined);
});

test('al finalizar un entrenamiento se avisa al programador y sincroniza', async () => {
  const c = clienteFalso(PRO);
  let bajadas = 0;
  const remoto = c.remoto();
  const bajarOriginal = remoto.bajar;
  remoto.bajar = async (cur) => { bajadas++; return bajarOriginal(cur); };
  const s = await servidor({ cliente: c });
  await s.pedir('/api/cuenta/vincular', { method: 'POST', body: { modo: 'subir' } });
  const r = (await s.pedir('/api/rutinas', { method: 'POST', body: { nombre: 'Fuerza', dias: ['Día A'] } })).json;
  const dia = r.dias[0].id;
  await s.pedir(`/api/rutinas/${r.id}/dias/${dia}/ejercicios`, { method: 'POST', body: { ejercicio_id: 'Barbell_Squat', series: 1, reps: '8' } });
  const ses = (await s.pedir('/api/sesiones', { method: 'POST', body: { dia_id: dia } })).json;
  const antes = bajadas;
  const fin = await s.pedir(`/api/sesiones/${ses.id}`, { method: 'PATCH', body: { finalizar: true } });
  assert.equal(fin.status, 200);
  for (let i = 0; i < 20 && bajadas === antes; i++) await vaciar();
  assert.ok(bajadas > antes, 'corrió una vuelta de sincronización');
});

test('identidad: la misma cuenta con otro id (se recreó en la nube) no está vinculada; con otro mail pero el mismo id sí', async () => {
  const c = clienteFalso(PRO);
  const s = await servidor({ cliente: c });
  await s.pedir('/api/cuenta/vincular', { method: 'POST', body: { modo: 'subir' } });
  assert.equal((await s.pedir('/api/cuenta')).json.vinculado, true);
  c.info = { ...PRO, id: 'u-NUEVO' };
  assert.equal((await s.pedir('/api/cuenta')).json.vinculado, false);
  const sync = await s.pedir('/api/cuenta/sincronizar', { method: 'POST', body: {} });
  assert.deepEqual([sync.status, sync.json.codigo], [409, 'sin_vinculo']);
  assert.equal((await s.pedir('/api/cuenta/vinculo')).json.vinculado, false);
  c.info = { ...PRO, email: 'otro@mail.com' };
  assert.equal((await s.pedir('/api/cuenta')).json.vinculado, true);
});

test('migración: un vínculo guardado con el mail de esta cuenta pasa a guardarse con el id', async () => {
  const c = clienteFalso(PRO);
  const s = await servidor({ cliente: c });
  s.db.prepare("INSERT INTO sync_estado (clave, valor) VALUES ('cuenta', 'ana@correo.com')").run();
  assert.equal((await s.pedir('/api/cuenta')).json.vinculado, true);
  assert.equal(estadoSync(s, 'cuenta'), 'u-1');
});

test('migración: un mail guardado que no es el de esta cuenta no se toca ni vincula', async () => {
  const c = clienteFalso(PRO);
  const s = await servidor({ cliente: c });
  s.db.prepare("INSERT INTO sync_estado (clave, valor) VALUES ('cuenta', 'otra@x.com')").run();
  assert.equal((await s.pedir('/api/cuenta')).json.vinculado, false);
  assert.equal(estadoSync(s, 'cuenta'), 'otra@x.com');
});

test('borrar cuenta con la respuesta perdida (sin red): igual reinicia lo local, avisa del error y al volver todo se re-sube', async () => {
  const c = clienteFalso(PRO);
  const s = await servidor({ cliente: c });
  await s.pedir('/api/cuenta/vincular', { method: 'POST', body: { modo: 'subir' } });
  const personas = s.db.prepare('SELECT COUNT(*) n FROM personas').get().n;
  c.borrarCuenta = async () => { c.r = crearRemotoEnMemoria(); throw new ErrorSupabase('sin_red', 'timeout'); }; // la nube borró, la respuesta se perdió
  const d = await s.pedir('/api/cuenta', { method: 'DELETE' });
  assert.deepEqual([d.status, d.json.codigo], [503, 'sin_red']);
  assert.equal(estadoSync(s, 'cuenta'), null);
  assert.equal(estadoSync(s, 'ultimo_envio'), null);
  assert.equal(s.db.prepare('SELECT COUNT(*) n FROM personas').get().n, personas);
  c.info = { ...PRO, id: 'u-NUEVO' };
  assert.equal((await s.pedir('/api/cuenta/vincular', { method: 'POST', body: { modo: 'subir' } })).status, 200);
  assert.ok(c.r.documentos().length > 0, 'todo se volvió a subir');
});

test('red de seguridad: vincular con la nube vacía y restos de envíos anteriores de la misma cuenta re-sube todo', async () => {
  const c = clienteFalso(PRO);
  const s = await servidor({ cliente: c });
  await s.pedir('/api/cuenta/vincular', { method: 'POST', body: { modo: 'subir' } });
  assert.ok(c.r.documentos().length > 0);
  c.r = crearRemotoEnMemoria(); // la nube quedó vacía (purga, borrado desde otro lado)
  assert.equal((await s.pedir('/api/cuenta/vinculo')).json.estado, 'cuenta_vacia');
  assert.equal((await s.pedir('/api/cuenta/vincular', { method: 'POST', body: { modo: 'subir' } })).status, 200);
  assert.ok(c.r.documentos().length > 0);
});

test('Google: google:true por defecto; en Android o sin Supabase es false y /google responde 404 no_disponible', async () => {
  const s = await servidor({ cliente: clienteFalso() });
  assert.equal((await s.pedir('/api/cuenta')).json.google, true);
  const a = await servidor({ cliente: clienteFalso(), plataforma: 'android' });
  assert.equal((await a.pedir('/api/cuenta')).json.google, false);
  const g = await a.pedir('/api/cuenta/google');
  assert.deepEqual([g.status, g.json.codigo], [404, 'no_disponible']);
  const d = await servidorDePrueba();
  abiertos.push(d.cerrar);
  assert.equal((await d.pedir('/api/cuenta')).json.google, false);
});

test('Google: una vuelta sin código no gasta el verificador; sigue valiendo hasta un canje exitoso', async () => {
  const c = clienteFalso();
  const s = await servidor({ cliente: c });
  const ir = await fetch(`${s.base}/api/cuenta/google`, { redirect: 'manual' });
  const verificador = new URL(ir.headers.get('location')).searchParams.get('v');
  assert.equal((await fetch(`${s.base}/api/cuenta/google/vuelta`)).status, 400);
  assert.equal((await fetch(`${s.base}/api/cuenta/google/vuelta?error=access_denied`)).status, 400);
  assert.equal((await fetch(`${s.base}/api/cuenta/google/vuelta?code=BUENO`)).status, 200);
  assert.deepEqual(c.canje, { codigo: 'BUENO', verificador });
});

test('Google: un canje fallido conserva el verificador para reintentar; vence a los 10 minutos', async () => {
  let t = new Date(2026, 10, 27, 10, 0, 0);
  const c = clienteFalso();
  const original = c.canjearCodigoGoogle;
  let falla = true;
  c.canjearCodigoGoogle = async (...a) => { if (falla) throw new ErrorSupabase('servidor', 'x'); return original(...a); };
  const s = await servidor({ cliente: c, ahora: () => new Date(t) });
  await fetch(`${s.base}/api/cuenta/google`, { redirect: 'manual' });
  assert.equal((await fetch(`${s.base}/api/cuenta/google/vuelta?code=A`)).status, 502);
  falla = false;
  assert.equal((await fetch(`${s.base}/api/cuenta/google/vuelta?code=B`)).status, 200);
  await fetch(`${s.base}/api/cuenta/google`, { redirect: 'manual' });
  t = new Date(t.getTime() + 11 * 60_000);
  assert.equal((await fetch(`${s.base}/api/cuenta/google/vuelta?code=C`)).status, 400);
});

test('salir limpia el error viejo de la sincronización', async () => {
  const c = clienteFalso(PRO);
  const s = await servidor({ cliente: c });
  await s.pedir('/api/cuenta/vincular', { method: 'POST', body: { modo: 'subir' } });
  c.r.fallaBajada = new ErrorSupabase('sin_red', 'x');
  assert.equal((await s.pedir('/api/cuenta/sincronizar', { method: 'POST', body: {} })).status, 503);
  assert.match((await s.pedir('/api/cuenta')).json.error, /conexión/i);
  await s.pedir('/api/cuenta/salir', { method: 'POST', body: {} });
  assert.equal((await s.pedir('/api/cuenta')).json.error, null);
});

test('sin red tras reiniciar la app: GET /api/cuenta usa el mail de la sesión guardada y responde 200 con el error', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'cuenta-clave-'));
  let caida = false;
  const fetchFn = async (url) => {
    if (caida) throw new Error('fetch failed');
    const resp = (status, cuerpo) => ({ ok: status < 300, status, json: async () => cuerpo, text: async () => JSON.stringify(cuerpo) });
    if (url.endsWith('/auth/v1/verify')) return resp(200, { access_token: 'AT', refresh_token: 'RT', expires_in: 3600, user: { id: 'uuid-9', email: 'ana@correo.com' } });
    return resp(200, [{ plan: 'pro', consentimiento_en: null }]);
  };
  const s = await servidor({ fetchFn, rutaClave: path.join(dir, 'clave-equipo') });
  abiertos.push(() => fs.rmSync(dir, { recursive: true, force: true }));
  await s.pedir('/api/cuenta/verificar', { method: 'POST', body: { email: 'ana@correo.com', codigo: '123456' } });
  s.db.prepare("INSERT INTO sync_estado (clave, valor) VALUES ('cuenta', 'uuid-9')").run();
  caida = true;
  const r = await s.pedir('/api/cuenta');
  assert.equal(r.status, 200);
  assert.deepEqual(r.json.sesion, { email: 'ana@correo.com', plan: null, consentimiento: null });
  assert.equal(r.json.vinculado, true);
  assert.match(r.json.error, /conexión/i);
});

test('generación: vincular la guarda; si no cambia, la sincronización no reinicia nada', async () => {
  const c = clienteFalso({ ...PRO, generacion: 1 });
  const s = await servidor({ cliente: c });
  await s.pedir('/api/cuenta/vincular', { method: 'POST', body: { modo: 'subir' } });
  assert.equal(estadoSync(s, 'generacion'), '1');
  const envio = estadoSync(s, 'ultimo_envio');
  assert.notEqual(envio, null);
  assert.equal((await s.pedir('/api/cuenta/sincronizar', { method: 'POST', body: {} })).status, 200);
  assert.equal(estadoSync(s, 'ultimo_envio'), envio);
});

test('generación: tras una purga en la nube (generación nueva) el equipo vinculado re-sube todo sin tocar sus datos', async () => {
  const c = clienteFalso({ ...PRO, generacion: 1 });
  const s = await servidor({ cliente: c });
  await s.pedir('/api/cuenta/vincular', { method: 'POST', body: { modo: 'subir' } });
  const personas = s.db.prepare('SELECT COUNT(*) n FROM personas').get().n;
  c.r = crearRemotoEnMemoria(); // purga: la nube quedó vacía
  c.info = { ...PRO, generacion: 2 };
  const r = await s.pedir('/api/cuenta/sincronizar', { method: 'POST', body: {} });
  assert.equal(r.status, 200);
  assert.ok(c.r.documentos().length > 0, 'todo se volvió a subir');
  assert.equal(estadoSync(s, 'generacion'), '2');
  assert.equal(s.db.prepare('SELECT COUNT(*) n FROM personas').get().n, personas);
});

test('generación: un equipo vinculado sin generación guardada la adopta sin reiniciar', async () => {
  const c = clienteFalso({ ...PRO, generacion: 4 });
  const s = await servidor({ cliente: c });
  await s.pedir('/api/cuenta/vincular', { method: 'POST', body: { modo: 'subir' } });
  s.db.exec("DELETE FROM sync_estado WHERE clave = 'generacion'");
  const envio = estadoSync(s, 'ultimo_envio');
  await s.pedir('/api/cuenta/sincronizar', { method: 'POST', body: {} });
  assert.equal(estadoSync(s, 'generacion'), '4');
  assert.equal(estadoSync(s, 'ultimo_envio'), envio);
});

test('generación: vincular con generación distinta a la guardada también re-sube todo', async () => {
  const c = clienteFalso({ ...PRO, generacion: 1 });
  const s = await servidor({ cliente: c });
  await s.pedir('/api/cuenta/vincular', { method: 'POST', body: { modo: 'subir' } });
  c.r = crearRemotoEnMemoria();
  c.info = { ...PRO, generacion: 2 };
  assert.equal((await s.pedir('/api/cuenta/vincular', { method: 'POST', body: { modo: 'juntar' } })).status, 200);
  assert.ok(c.r.documentos().length > 0);
  assert.equal(estadoSync(s, 'generacion'), '2');
});
