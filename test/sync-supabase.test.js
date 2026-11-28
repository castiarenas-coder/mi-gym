import { test } from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { openDb } from '../server/db.js';
import { crearClienteSupabase, ErrorSupabase } from '../server/sync/supabase.js';
import { cifrar, descifrar, generarClave, claveDelEquipo, sesionEnDb } from '../server/sync/secreto.js';
import { resolverConfig } from '../server/config.js';

const URL_BASE = 'https://abc.supabase.co';
const resp = (status, cuerpo = {}) => ({
  ok: status >= 200 && status < 300, status,
  json: async () => cuerpo, text: async () => JSON.stringify(cuerpo),
});
const SES = { access_token: 'A1', refresh_token: 'R1', email: 'a@b.c' };
const renovada = () => resp(200, { access_token: 'A2', refresh_token: 'R2', expires_in: 3600, user: { email: 'a@b.c' } });
const DOC = { tipo: 't', clave: 'a', datos: {}, actualizado: 'x', borrado: false };

/** fetch simulado: `rutas` es una funcion (url, init) -> respuesta; guarda cada llamada. */
function crear({ rutas, sesion = SES, ...extra } = {}) {
  const llamadas = [];
  let guardada = sesion;
  const fetchFn = async (url, init = {}) => {
    llamadas.push({ signal: init.signal, url, metodo: init.method ?? 'GET', headers: init.headers ?? {}, cuerpo: init.body ? JSON.parse(init.body) : undefined });
    return rutas(url, init, llamadas.length);
  };
  const cliente = crearClienteSupabase({
    url: URL_BASE + '/', anonKey: 'ANON', fetchFn,
    guardarSesion: async s => { guardada = s; },
    leerSesion: async () => guardada,
    ...extra,
  });
  return { cliente, llamadas, sesion: () => guardada };
}

test('enviarCodigo: POST /auth/v1/otp con apikey publica y sin token de usuario', async () => {
  const { cliente, llamadas } = crear({ rutas: () => resp(200) });
  await cliente.enviarCodigo('a@b.c');
  assert.equal(llamadas[0].url, `${URL_BASE}/auth/v1/otp`);
  assert.equal(llamadas[0].metodo, 'POST');
  assert.deepEqual(llamadas[0].cuerpo, { email: 'a@b.c', create_user: true });
  assert.equal(llamadas[0].headers.apikey, 'ANON');
  assert.equal(llamadas[0].headers.Authorization, undefined);
});

test('verificarCodigo: POST /auth/v1/verify y guarda la sesion', async () => {
  const { cliente, llamadas, sesion } = crear({
    sesion: null,
    rutas: () => resp(200, { access_token: 'AT', refresh_token: 'RT', expires_in: 3600, user: { email: 'a@b.c' } }),
  });
  await cliente.verificarCodigo('a@b.c', '123456');
  assert.equal(llamadas[0].url, `${URL_BASE}/auth/v1/verify`);
  assert.deepEqual(llamadas[0].cuerpo, { type: 'email', email: 'a@b.c', token: '123456' });
  assert.equal(sesion().access_token, 'AT');
  assert.equal(sesion().refresh_token, 'RT');
  assert.equal(sesion().email, 'a@b.c');
  assert.ok(sesion().expira_en > Date.now());
});

test('verificarCodigo con codigo malo: ErrorSupabase codigo_invalido', async () => {
  const { cliente } = crear({ sesion: null, rutas: () => resp(403, { error_code: 'otp_expired' }) });
  await assert.rejects(cliente.verificarCodigo('a@b.c', '000000'), e => e instanceof ErrorSupabase && e.codigo === 'codigo_invalido');
});

test('PKCE de Google: desafio S256 y canje', async () => {
  const verificador = crypto.randomBytes(32).toString('base64url'); // 43 caracteres, como exige PKCE
  const { cliente, llamadas, sesion } = crear({
    sesion: null,
    rutas: () => resp(200, { access_token: 'G', refresh_token: 'GR', expires_in: 60, user: { email: 'g@x.y' } }),
  });
  const u = new URL(cliente.urlGoogle('http://localhost:8788/api/cuenta/google/vuelta', verificador));
  assert.equal(u.origin + u.pathname, `${URL_BASE}/auth/v1/authorize`);
  assert.equal(u.searchParams.get('provider'), 'google');
  assert.equal(u.searchParams.get('redirect_to'), 'http://localhost:8788/api/cuenta/google/vuelta');
  assert.equal(u.searchParams.get('code_challenge_method'), 's256');
  assert.equal(u.searchParams.get('code_challenge'), crypto.createHash('sha256').update(verificador).digest('base64url'));
  await cliente.canjearCodigoGoogle('CODE', verificador);
  assert.equal(llamadas[0].url, `${URL_BASE}/auth/v1/token?grant_type=pkce`);
  assert.deepEqual(llamadas[0].cuerpo, { auth_code: 'CODE', code_verifier: verificador });
  assert.equal(sesion().email, 'g@x.y');
});

test('remoto.subir: RPC subir_documentos con el token del usuario', async () => {
  const { cliente, llamadas } = crear({ rutas: () => resp(200, null) });
  const docs = [{ ...DOC, datos: { x: 1 } }];
  await cliente.remoto().subir(docs);
  assert.equal(llamadas[0].url, `${URL_BASE}/rest/v1/rpc/subir_documentos`);
  assert.deepEqual(llamadas[0].cuerpo, { docs });
  assert.equal(llamadas[0].headers.Authorization, 'Bearer A1');
  assert.equal(llamadas[0].headers.apikey, 'ANON');
});

test('remoto.subir sin documentos no llama a la red', async () => {
  const { cliente, llamadas } = crear({ rutas: () => resp(200) });
  await cliente.remoto().subir([]);
  assert.equal(llamadas.length, 0);
});

test('remoto.bajar: filtra por servidor_en > cursor, ordenado, paginado', async () => {
  const filas = [
    { ...DOC, clave: 'a', servidor_en: '2026-01-01T00:00:00.000001+00:00' },
    { ...DOC, clave: 'b', borrado: true, servidor_en: '2026-01-01T00:00:00.000002+00:00' },
  ];
  const { cliente, llamadas } = crear({ rutas: () => resp(200, filas) });
  const r = await cliente.remoto().bajar('2025-12-31T00:00:00+00:00');
  const u = new URL(llamadas[0].url);
  assert.equal(u.pathname, '/rest/v1/documentos');
  assert.equal(u.searchParams.get('servidor_en'), 'gt.2025-12-31T00:00:00+00:00');
  assert.ok(llamadas[0].url.includes('%2B00%3A00')); // el + de la zona horaria viaja codificado
  assert.equal(u.searchParams.get('order'), 'servidor_en.asc');
  assert.equal(u.searchParams.get('limit'), '1000');
  assert.equal(u.searchParams.get('select'), 'tipo,clave,datos,actualizado,borrado,servidor_en');
  assert.equal(r.docs.length, 2);
  assert.equal(r.docs[0].servidor_en, undefined); // el doc vuelve sin la marca del servidor
  assert.equal(r.docs[1].borrado, true);
  assert.equal(r.cursor, filas[1].servidor_en);
});

test('remoto.bajar sin cursor baja desde el principio y sin novedades conserva el cursor', async () => {
  const { cliente, llamadas } = crear({ rutas: () => resp(200, []) });
  const r1 = await cliente.remoto().bajar(null);
  assert.equal(new URL(llamadas[0].url).searchParams.has('servidor_en'), false);
  assert.deepEqual(r1, { docs: [], cursor: null });
  const r2 = await cliente.remoto().bajar('C0');
  assert.equal(r2.cursor, 'C0');
});

test('un 401 renueva el token con el de renovacion y reintenta una sola vez', async () => {
  const { cliente, llamadas, sesion } = crear({
    rutas: (url, init) => {
      if (url.includes('grant_type=refresh_token')) return renovada();
      return init.headers.Authorization === 'Bearer A1' ? resp(401, { message: 'JWT expired' }) : resp(200, null);
    },
  });
  await cliente.remoto().subir([DOC]);
  assert.equal(llamadas.length, 3);
  assert.equal(llamadas[1].url, `${URL_BASE}/auth/v1/token?grant_type=refresh_token`);
  assert.deepEqual(llamadas[1].cuerpo, { refresh_token: 'R1' });
  assert.equal(llamadas[2].headers.Authorization, 'Bearer A2');
  assert.equal(sesion().refresh_token, 'R2');
});

test('si tras renovar sigue el 401: respuesta, sin bucle y la sesion se conserva', async () => {
  const { cliente, llamadas, sesion } = crear({
    rutas: url => (url.includes('grant_type=refresh_token') ? renovada() : resp(401)),
  });
  await assert.rejects(cliente.remoto().bajar(null), e => e.codigo === 'respuesta' && e.estado === 401);
  assert.equal(llamadas.length, 3);
  assert.equal(sesion().refresh_token, 'R2');
});

test('tras un 401, si el token guardado ya cambio se reintenta con ese sin renovar de nuevo', async () => {
  let guardada = SES;
  const llamadas = [];
  const cliente = crearClienteSupabase({
    url: URL_BASE, anonKey: 'ANON',
    guardarSesion: async s => { guardada = s; }, leerSesion: async () => guardada,
    fetchFn: async (url, init) => {
      llamadas.push({ url, auth: init.headers.Authorization });
      if (init.headers.Authorization === 'Bearer A1') {
        guardada = { ...SES, access_token: 'A9', refresh_token: 'R9' }; // otra llamada ya renovo
        return resp(401);
      }
      return resp(200, []);
    },
  });
  await cliente.remoto().bajar(null);
  assert.equal(llamadas.length, 2);
  assert.equal(llamadas[1].auth, 'Bearer A9');
});

test('renovacion con 429 o un 4xx ajeno: la sesion se conserva; 400/401/403/422 la borran', async () => {
  for (const estado of [429, 404, 418]) {
    const { cliente, sesion } = crear({
      rutas: url => (url.includes('grant_type=refresh_token') ? resp(estado, {}) : resp(401)),
    });
    await assert.rejects(cliente.remoto().bajar(null), e => e.codigo !== 'sesion_vencida');
    assert.equal(sesion().refresh_token, 'R1', `estado ${estado}`);
  }
  for (const estado of [400, 401, 403, 422]) {
    const { cliente, sesion } = crear({
      rutas: url => (url.includes('grant_type=refresh_token') ? resp(estado, {}) : resp(401)),
    });
    await assert.rejects(cliente.remoto().bajar(null), e => e.codigo === 'sesion_vencida');
    assert.equal(sesion(), null, `estado ${estado}`);
  }
});

test('renovacion rechazada: sesion_vencida y la sesion se borra', async () => {
  const { cliente, sesion } = crear({
    rutas: url => (url.includes('grant_type=refresh_token') ? resp(400, { error: 'invalid_grant' }) : resp(401)),
  });
  await assert.rejects(cliente.remoto().bajar(null), e => e.codigo === 'sesion_vencida');
  assert.equal(sesion(), null);
});

test('renovacion sin red: sin_red y la sesion se conserva', async () => {
  const { cliente, sesion } = crear({
    rutas: url => { if (url.includes('refresh_token')) throw new TypeError('fetch failed'); return resp(401); },
  });
  await assert.rejects(cliente.remoto().bajar(null), e => e.codigo === 'sin_red');
  assert.equal(sesion().refresh_token, 'R1');
});

test('un token ya vencido (expira_en) se renueva antes de llamar', async () => {
  const { cliente, llamadas } = crear({
    sesion: { ...SES, expira_en: Date.now() - 1000 },
    rutas: url => (url.includes('grant_type=refresh_token') ? renovada() : resp(200, [])),
  });
  await cliente.remoto().bajar(null);
  assert.equal(llamadas.length, 2);
  assert.equal(llamadas[1].headers.Authorization, 'Bearer A2');
});

test('renovaciones simultaneas comparten una sola llamada', async () => {
  const { cliente, llamadas } = crear({
    sesion: { ...SES, expira_en: 1 },
    rutas: url => (url.includes('grant_type=refresh_token') ? renovada() : resp(200, [])),
  });
  await Promise.all([cliente.remoto().bajar(null), cliente.remoto().bajar(null)]);
  assert.equal(llamadas.filter(l => l.url.includes('refresh_token')).length, 1);
});

test('caida de red en subir propaga ErrorSupabase sin_red (el motor no marca enviado)', async () => {
  const { cliente } = crear({ rutas: () => { throw new TypeError('fetch failed'); } });
  await assert.rejects(cliente.remoto().subir([DOC]), e => e instanceof ErrorSupabase && e.codigo === 'sin_red');
});

test('sin sesion: sin_sesion y no toca la red', async () => {
  const { cliente, llamadas } = crear({ sesion: null, rutas: () => resp(200) });
  await assert.rejects(cliente.remoto().bajar(null), e => e.codigo === 'sin_sesion');
  assert.equal(llamadas.length, 0);
});

test('RLS denegada (403 / 42501): plan_requerido; 5xx: servidor', async () => {
  const a = crear({ rutas: () => resp(403, { code: '42501', message: 'new row violates row-level security policy' }) });
  await assert.rejects(a.cliente.remoto().subir([DOC]), e => e.codigo === 'plan_requerido');
  const b = crear({ rutas: () => resp(503, { message: 'down' }) });
  await assert.rejects(b.cliente.remoto().bajar(null), e => e.codigo === 'servidor');
});

test('cuenta(): email, plan y consentimiento', async () => {
  const { cliente, llamadas } = crear({
    rutas: () => resp(200, [{ plan: 'pro', consentimiento_en: '2026-01-01T00:00:00Z', generacion: 3 }]),
  });
  assert.deepEqual(await cliente.cuenta(), { id: null, email: 'a@b.c', plan: 'pro', consentimiento_en: '2026-01-01T00:00:00Z', generacion: 3 });
  assert.equal(new URL(llamadas[0].url).searchParams.get('select'), 'plan,consentimiento_en,generacion');
});

test('cuenta() sin fila usa plan gratis y sin consentimiento', async () => {
  const { cliente } = crear({ rutas: () => resp(200, []) });
  assert.deepEqual(await cliente.cuenta(), { id: null, email: 'a@b.c', plan: 'gratis', consentimiento_en: null, generacion: 1 });
});

test('aceptarConsentimiento y borrarCuenta (cierra la sesion local)', async () => {
  const { cliente, llamadas, sesion } = crear({ rutas: () => resp(200, {}) });
  await cliente.aceptarConsentimiento();
  assert.equal(llamadas[0].url, `${URL_BASE}/rest/v1/rpc/aceptar_consentimiento`);
  await cliente.borrarCuenta();
  assert.equal(llamadas[1].url, `${URL_BASE}/functions/v1/borrar-cuenta`);
  assert.equal(llamadas[1].metodo, 'POST');
  assert.equal(sesion(), null);
});

test('cerrarSesion borra la sesion aunque el logout falle por red', async () => {
  const { cliente, llamadas, sesion } = crear({ rutas: () => { throw new TypeError('fetch failed'); } });
  await cliente.cerrarSesion();
  assert.equal(llamadas[0].url, `${URL_BASE}/auth/v1/logout?scope=local`);
  assert.equal(sesion(), null);
});

test('cifrar/descifrar: ida y vuelta, aleatorio y a prueba de manipulacion', () => {
  const clave = generarClave();
  const x = JSON.stringify({ access_token: 'secreto', refresh_token: 'otro' });
  const c = cifrar(x, clave);
  assert.ok(!c.includes('secreto'));
  assert.notEqual(c, cifrar(x, clave));
  assert.equal(descifrar(c, clave), x);
  assert.throws(() => descifrar(c, generarClave()));
  const roto = Buffer.from(c, 'base64'); roto[roto.length - 1] ^= 1;
  assert.throws(() => descifrar(roto.toString('base64'), clave));
});

const carpeta = () => fs.mkdtempSync(path.join(os.tmpdir(), 'mi-gym-clave-'));

test('claveDelEquipo: archivo en disco, se crea una vez y se reutiliza', () => {
  const ruta = path.join(carpeta(), 'clave-equipo');
  const k1 = claveDelEquipo(ruta);
  assert.ok(fs.existsSync(ruta));
  assert.equal(k1, claveDelEquipo(ruta));
  assert.equal(Buffer.from(k1, 'base64').length, 32);
  if (process.platform !== 'win32') assert.equal(fs.statSync(ruta).mode & 0o777, 0o600);
});

test('sesionEnDb guarda el token cifrado; la clave vive en el archivo, no en la base', async () => {
  const db = openDb(':memory:');
  const ruta = path.join(carpeta(), 'clave-equipo');
  const { guardarSesion, leerSesion } = sesionEnDb(db, ruta);
  assert.equal(await leerSesion(), null);
  assert.equal(fs.existsSync(ruta), false); // leer no crea la clave
  await guardarSesion({ access_token: 'TOKEN-SECRETO', refresh_token: 'R', email: 'a@b.c' });
  const crudo = db.prepare("SELECT valor FROM sync_estado WHERE clave = 'sesion'").get().valor;
  assert.ok(!crudo.includes('TOKEN-SECRETO'));
  assert.equal(db.prepare("SELECT COUNT(*) n FROM sync_estado WHERE clave = 'clave_equipo'").get().n, 0);
  assert.deepEqual(await leerSesion(), { access_token: 'TOKEN-SECRETO', refresh_token: 'R', email: 'a@b.c' });
  await guardarSesion(null);
  assert.equal(await leerSesion(), null);
});

test('sesionEnDb: sin el archivo de clave (o con otra) la sesion se lee como null', async () => {
  const db = openDb(':memory:');
  const ruta = path.join(carpeta(), 'clave-equipo');
  await sesionEnDb(db, ruta).guardarSesion({ access_token: 'T', refresh_token: 'R', email: 'a@b.c' });
  fs.rmSync(ruta);
  assert.equal(await sesionEnDb(db, ruta).leerSesion(), null);
  assert.equal(fs.existsSync(ruta), false);
  const otra = path.join(carpeta(), 'clave-equipo');
  claveDelEquipo(otra);
  assert.equal(await sesionEnDb(db, otra).leerSesion(), null);
});

test('sesionEnDb: un valor corrupto se trata como sin sesion', async () => {
  const db = openDb(':memory:');
  const ruta = path.join(carpeta(), 'clave-equipo');
  claveDelEquipo(ruta);
  db.prepare("INSERT INTO sync_estado (clave, valor) VALUES ('sesion', 'basura')").run();
  assert.equal(await sesionEnDb(db, ruta).leerSesion(), null);
});

test('bajar con cursor bigint lo mantiene como texto y pagina sin saltar filas en el limite', async () => {
  const todas = Array.from({ length: 7 }, (_, i) => ({ ...DOC, clave: `k${i}`, servidor_en: 9007199254740993n + BigInt(i) }));
  const rutas = (url) => {
    const q = new URL(url).searchParams;
    const desde = q.has('servidor_en') ? BigInt(q.get('servidor_en').slice(3)) : -1n;
    const lote = todas.filter(f => f.servidor_en > desde).slice(0, Number(q.get('limit')));
    return resp(200, lote.map(f => ({ ...f, servidor_en: f.servidor_en.toString() })));
  };
  const { cliente } = crear({ rutas, pagina: 3 });
  const vistas = [];
  let cursor = null;
  for (let i = 0; i < 10; i++) {
    const r = await cliente.remoto().bajar(cursor);
    assert.ok(typeof r.cursor === 'string' || r.cursor === null);
    if (!r.docs.length) break;
    vistas.push(...r.docs.map(d => d.clave));
    cursor = r.cursor;
  }
  assert.deepEqual(vistas, todas.map(f => f.clave));
  assert.equal(cursor, '9007199254740999');
});

test('servidor_en numerico (JSON number) se devuelve como texto', async () => {
  const { cliente } = crear({ rutas: () => resp(200, [{ ...DOC, servidor_en: 42 }]) });
  assert.equal((await cliente.remoto().bajar(null)).cursor, '42');
});

test('timeout: cada fetch lleva signal y un abort o timeout es sin_red', async () => {
  const { cliente, llamadas } = crear({
    timeoutMs: 20,
    rutas: (url, init) => new Promise((_, rechazar) => {
      init.signal.addEventListener('abort', () => rechazar(init.signal.reason));
    }),
  });
  await assert.rejects(cliente.remoto().bajar(null), e => e.codigo === 'sin_red');
  assert.ok(llamadas[0].signal instanceof AbortSignal);
});

test('por defecto cada fetch lleva un signal de timeout aun no vencido', async () => {
  const { cliente, llamadas } = crear({ rutas: () => resp(200, []) });
  await cliente.remoto().bajar(null);
  assert.ok(llamadas[0].signal instanceof AbortSignal);
  assert.equal(llamadas[0].signal.aborted, false);
});

test('config: Supabase solo con url y clave anonima; sin ellas la cuenta queda deshabilitada', () => {
  assert.equal(resolverConfig({}).supabase, null);
  assert.equal(resolverConfig({ MI_GYM_SUPABASE_URL: 'https://x.supabase.co' }).supabase, null);
  assert.deepEqual(resolverConfig({ MI_GYM_SUPABASE_URL: 'https://x.supabase.co', MI_GYM_SUPABASE_ANON_KEY: 'k' }).supabase,
    { url: 'https://x.supabase.co', anonKey: 'k' });
});

test('cuenta(): devuelve el id del usuario (queda en la sesion y sobrevive a renovar el token)', async () => {
  const { cliente, sesion } = crear({
    sesion: null,
    rutas: (url) => url.includes('/auth/v1/verify')
      ? resp(200, { access_token: 'AT', refresh_token: 'RT', expires_in: 3600, user: { id: 'uuid-1', email: 'a@b.c' } })
      : resp(200, [{ plan: 'pro', consentimiento_en: null }]),
  });
  await cliente.verificarCodigo('a@b.c', '123456');
  assert.equal(sesion().id, 'uuid-1');
  assert.equal((await cliente.cuenta()).id, 'uuid-1');
});

test('renovar el token conserva el id aunque la respuesta no lo traiga', async () => {
  const { cliente, sesion } = crear({
    sesion: { ...SES, id: 'uuid-1', expira_en: 1 },
    rutas: (url) => url.includes('grant_type=refresh_token')
      ? resp(200, { access_token: 'A2', refresh_token: 'R2', expires_in: 3600 })
      : resp(200, [{ plan: 'pro', consentimiento_en: null }]),
  });
  assert.equal((await cliente.cuenta()).id, 'uuid-1');
  assert.equal(sesion().access_token, 'A2');
});
