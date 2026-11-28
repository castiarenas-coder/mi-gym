import { test } from 'node:test';
import assert from 'node:assert/strict';
import { crearProgramador } from '../server/sync/programador.js';
import { ErrorCuenta } from '../server/sync/errores.js';
import { ErrorSupabase } from '../server/sync/supabase.js';

const vaciar = () => new Promise(r => setImmediate(r));

/** Reloj y temporizadores falsos: nada espera de verdad. */
function relojFalso() {
  let t = 0; let id = 0; let tareas = [];
  const crear = (rep) => (f, ms) => { const x = { id: ++id, f, ms, prox: t + ms, rep }; tareas.push(x); return x; };
  const quitar = (x) => { tareas = tareas.filter(a => a !== x); };
  return {
    timers: { setInterval: crear(true), setTimeout: crear(false), clearInterval: quitar, clearTimeout: quitar },
    pendientes: () => tareas.length,
    async avanzar(ms) {
      const fin = t + ms;
      for (;;) {
        const x = tareas.filter(a => a.prox <= fin).sort((a, b) => a.prox - b.prox)[0];
        if (!x) break;
        t = x.prox;
        if (x.rep) x.prox += x.ms; else quitar(x);
        x.f();
        await vaciar(); await vaciar();
      }
      t = fin;
    },
  };
}

/** `sincronizar` que se destraba a mano para probar vueltas simultáneas. */
function sincronizadorManual() {
  const s = { llamadas: 0, activas: 0, maxActivas: 0, pendientes: [] };
  s.fn = () => new Promise((resolve, reject) => {
    s.llamadas++; s.activas++; s.maxActivas = Math.max(s.maxActivas, s.activas);
    s.pendientes.push({ ok: (v = { subidos: 0 }) => { s.activas--; resolve(v); }, mal: (e) => { s.activas--; reject(e); } });
  });
  s.terminar = async (v) => { s.pendientes.shift().ok(v); await vaciar(); await vaciar(); };
  return s;
}

const ahora = () => new Date('2026-11-27T12:00:00.000Z');

test('corre al iniciar y cada 5 minutos con el reloj falso', async () => {
  const r = relojFalso(); let n = 0;
  const p = crearProgramador({ sincronizar: async () => { n++; return {}; }, ahora, timers: r.timers });
  p.iniciar(); await vaciar();
  assert.equal(n, 1);
  await r.avanzar(299_999); assert.equal(n, 1);
  await r.avanzar(1); assert.equal(n, 2);
  await r.avanzar(300_000); assert.equal(n, 3);
  p.detener();
  await r.avanzar(600_000); assert.equal(n, 3);
  assert.equal(r.pendientes(), 0);
});

test('avisar() dispara una vuelta', async () => {
  const r = relojFalso(); let n = 0;
  const p = crearProgramador({ sincronizar: async () => { n++; return {}; }, ahora, timers: r.timers });
  p.avisar(); await vaciar(); await vaciar();
  assert.equal(n, 1);
});

test('nunca corren dos vueltas a la vez: lo pedido durante una vuelta se junta en una sola siguiente', async () => {
  const r = relojFalso(); const m = sincronizadorManual();
  const p = crearProgramador({ sincronizar: m.fn, ahora, timers: r.timers });
  p.avisar(); await vaciar();
  p.avisar(); p.avisar(); p.avisar(); void p.ahora();
  await vaciar();
  assert.equal(m.llamadas, 1);
  await m.terminar(); // termina la primera, arranca UNA de seguimiento
  assert.equal(m.llamadas, 2);
  await m.terminar();
  await vaciar();
  assert.equal(m.llamadas, 2);
  assert.equal(m.maxActivas, 1);
});

test('ahora() devuelve el resultado de una vuelta que empieza después del pedido', async () => {
  const r = relojFalso(); const m = sincronizadorManual();
  const p = crearProgramador({ sincronizar: m.fn, ahora, timers: r.timers });
  p.avisar(); await vaciar();
  const espera = p.ahora();
  await m.terminar({ subidos: 1 });
  await vaciar();
  await m.terminar({ subidos: 7 });
  const res = await espera;
  assert.equal(res.estado, 'ok');
  assert.equal(res.resultado.subidos, 7);
});

test('sin sesion, sin consentimiento, sin plan o sin vinculo: no hace nada ni marca error', async () => {
  for (const motivo of ['sin_sesion', 'sin_consentimiento', 'plan_requerido', 'sin_vinculo']) {
    const r = relojFalso();
    const p = crearProgramador({ sincronizar: async () => { throw new ErrorCuenta(motivo); }, ahora, timers: r.timers });
    const res = await p.ahora();
    assert.deepEqual([res.estado, res.motivo], ['omitida', motivo]);
    assert.equal(p.estado().error, null);
    assert.equal(p.estado().ultimaSincronizacion, null);
    assert.equal(r.pendientes(), 0, 'sin reintento');
  }
});

test('sin red: error en castellano, reintento silencioso mas tarde y se limpia al volver', async () => {
  const r = relojFalso(); let n = 0;
  const p = crearProgramador({
    sincronizar: async () => { n++; if (n === 1) throw new ErrorSupabase('sin_red', 'fetch failed'); return {}; },
    ahora, timers: r.timers, reintentoMs: 60_000,
  });
  const res = await p.ahora();
  assert.equal(res.estado, 'error');
  assert.match(p.estado().error, /conexión/i);
  assert.equal(p.estado().ultimaSincronizacion, null);
  await r.avanzar(60_000);
  assert.equal(n, 2);
  assert.equal(p.estado().error, null);
  assert.equal(p.estado().ultimaSincronizacion, '2026-11-27T12:00:00.000Z');
  assert.equal(r.pendientes(), 0);
});

test('otro error: queda el mensaje claro para la pantalla, sin filtrar datos internos, y no reintenta solo', async () => {
  const r = relojFalso();
  const p = crearProgramador({ sincronizar: async () => { throw new Error('boom Bearer SECRETO'); }, ahora, timers: r.timers });
  const res = await p.ahora();
  assert.equal(res.estado, 'error');
  assert.ok(!/SECRETO/.test(p.estado().error));
  assert.ok(p.estado().error.length > 0);
  assert.equal(r.pendientes(), 0);
});

test('exclusivo() espera a la vuelta en curso y frena las nuevas mientras corre', async () => {
  const r = relojFalso(); const m = sincronizadorManual(); const orden = [];
  const p = crearProgramador({ sincronizar: m.fn, ahora, timers: r.timers });
  p.avisar(); await vaciar();
  const ex = p.exclusivo(async () => { orden.push('ex-ini'); await vaciar(); orden.push('ex-fin'); return 42; });
  p.avisar();
  await vaciar();
  assert.deepEqual(orden, []);
  await m.terminar();
  assert.equal(await ex, 42);
  assert.deepEqual(orden, ['ex-ini', 'ex-fin']);
  assert.equal(m.llamadas, 2, 'la vuelta pedida mientras tanto corre después');
  await m.terminar();
});
