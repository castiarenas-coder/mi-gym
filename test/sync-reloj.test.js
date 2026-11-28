// Empates de milisegundo y casos mínimos hallados con el fuzz de reloj controlado.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { openDb, fijarReloj } from '../server/db.js';
import { sincronizar } from '../server/sync/motor.js';
import { cambiosLocales, aplicarDocumento } from '../server/sync/documentos.js';
import { crearRemotoEnMemoria } from './helpers-remoto.js';

const CERO = { subidos: 0, bajados: 0, enEspera: 0, rechazados: 0 };
const nueva = () => {
  const db = openDb(':memory:');
  db.exec("INSERT INTO ejercicios (id, nombre) VALUES ('A', 'A'), ('B', 'B')");
  return db;
};
const n = (db, sql, ...p) => db.prepare(sql).get(...p).n;
const conReloj = async (fn) => {
  let ahora = Date.UTC(2026, 5, 1, 12, 0, 0);
  fijarReloj(() => ahora);
  try { await fn({ avanzar: (ms = 1) => { ahora += ms; } }); } finally { fijarReloj(null); }
};

test('un cambio local con la misma marca (ms) que el último envío también se sube', async () => {
  await conReloj(async () => {
    const A = nueva();
    const remoto = crearRemotoEnMemoria();
    await sincronizar(A, remoto, {}); // sube la persona inicial con la marca T
    A.exec("INSERT INTO sesiones (fecha, estado, persona_id) VALUES ('2026-01-01T10:00:00.000Z', 'finalizada', 1)"); // también T
    A.exec("INSERT INTO medidas (persona_id, fecha, peso_kg) VALUES (1, '2026-01-01', 70)"); // también T
    const r = await sincronizar(A, remoto, {});
    assert.equal(r.subidos, 2);
    assert.equal(remoto.documentos().filter(d => d.tipo === 'sesion' || d.tipo === 'medida').length, 2);
    assert.deepEqual(await sincronizar(A, remoto, {}), CERO); // y no se repite
    const B = nueva();
    await sincronizar(B, remoto, {});
    assert.equal(n(B, 'SELECT COUNT(*) n FROM sesiones'), 1);
    assert.equal(n(B, 'SELECT COUNT(*) n FROM medidas'), 1);
  });
});

// ---------- persona recuperada: un hijo más nuevo que la muerte de una persona que ningún equipo tiene ----------

const personasDe = (db) => db.prepare('SELECT uid, nombre FROM personas ORDER BY nombre').all().map(p => ({ ...p }));
const vivos = (docs) => docs.filter(d => !d.borrado).map(d => JSON.stringify(d)).sort();
const vivosLocales = (db) => vivos(cambiosLocales(db, null));

test('una sesión más nueva que la muerte de su persona aparece bajo "Persona recuperada" en un equipo que nunca la tuvo, y en todos', async () => {
  await conReloj(async ({ avanzar }) => {
    const [A, B, C] = [nueva(), nueva(), nueva()];
    const remoto = crearRemotoEnMemoria();
    A.exec("INSERT INTO personas (nombre, color, creada) VALUES ('Ana', '#fff', 'x')");
    const ana = A.prepare("SELECT id, uid FROM personas WHERE nombre = 'Ana'").get();
    await sincronizar(A, remoto, {});
    avanzar(5);
    A.prepare('DELETE FROM personas WHERE id = ?').run(ana.id);
    await sincronizar(A, remoto, {});
    avanzar(5);
    // Un documento de una sesión de Ana, posterior al borrado (la editó un equipo que no se enteró), llega a un equipo nuevo.
    const sesion = { tipo: 'sesion', clave: '11111111-1111-4111-8111-111111111111', actualizado: new Date(Date.UTC(2026, 5, 1, 12, 0, 0) + 100).toISOString(), borrado: false,
      datos: { persona: ana.uid, rutina: null, dia_posicion: null, fecha: '2026-03-01T10:00:00.000Z', duracion: null, nota: 'n', estado: 'finalizada', titulo: null, fin: null, grupo: null, ejercicios: [], series: [] } };
    const vieja = { ...sesion, clave: '22222222-2222-4222-8222-222222222222', actualizado: new Date(Date.UTC(2026, 5, 1, 12, 0, 0) - 1000).toISOString() };
    await remoto.subir([sesion, vieja]);
    await sincronizar(B, remoto, {});
    assert.equal(n(B, "SELECT COUNT(*) n FROM sesiones WHERE uid = '11111111-1111-4111-8111-111111111111'"), 1);
    assert.equal(n(B, "SELECT COUNT(*) n FROM sesiones WHERE uid = '22222222-2222-4222-8222-222222222222'"), 0); // más vieja que la muerte
    const rec = B.prepare("SELECT uid, nombre FROM personas WHERE uid = ?").get(ana.uid);
    assert.equal(rec.nombre, 'Persona recuperada');
    assert.equal(n(B, "SELECT COUNT(*) n FROM ajustes WHERE clave LIKE 'plantillas_sembradas:%' AND clave = 'plantillas_sembradas:' || (SELECT id FROM personas WHERE uid = ?)", ana.uid), 1);
    assert.equal(B.prepare('SELECT estado FROM sesiones').get().estado, 'finalizada');
    // Sin nada esperando, y el resto converge: la persona vuelve a subirse viva.
    for (let i = 0; i < 4; i++) for (const db of [B, A, C]) { avanzar(); await sincronizar(db, remoto, {}); }
    for (const db of [A, B, C]) {
      assert.equal(JSON.parse(db.prepare("SELECT valor FROM sync_estado WHERE clave = 'pendientes'").get()?.valor ?? '[]').length, 0);
      assert.equal(n(db, "SELECT COUNT(*) n FROM personas WHERE nombre = 'Persona recuperada' AND uid = ?", ana.uid), 1);
      assert.equal(n(db, "SELECT COUNT(*) n FROM sesiones WHERE uid = '11111111-1111-4111-8111-111111111111'"), 1);
      assert.deepEqual(await sincronizar(db, remoto, {}), CERO);
    }
    assert.deepEqual(vivosLocales(A), vivosLocales(B));
    assert.deepEqual(vivosLocales(B), vivosLocales(C));
  });
});

test('dos equipos que recuperan a la misma persona desde hijos distintos convergen en un solo documento de persona', async () => {
  await conReloj(async ({ avanzar }) => {
    const [A, B, C] = [nueva(), nueva(), nueva()];
    const uid = '33333333-3333-4333-8333-333333333333';
    const T = Date.UTC(2026, 5, 1, 12, 0, 0);
    const muerte = { tipo: 'persona', clave: uid, actualizado: new Date(T + 10).toISOString(), borrado: true, datos: null };
    const hijo = (clave, ms) => ({ tipo: 'sesion', clave, actualizado: new Date(T + ms).toISOString(), borrado: false,
      datos: { persona: uid, rutina: null, dia_posicion: null, fecha: '2026-03-01T10:00:00.000Z', duracion: null, nota: clave.slice(0, 1), estado: 'finalizada', titulo: null, fin: null, grupo: null, ejercicios: [], series: [] } });
    // A y B reciben la muerte y, por separado, un hijo distinto (después); C llega al final.
    const r1 = crearRemotoEnMemoria();
    await r1.subir([muerte]);
    for (const [db, doc] of [[A, hijo('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 50)], [B, hijo('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', 70)]]) {
      await sincronizar(db, r1, {});
      await r1.subir([doc]);
      avanzar(3);
      await sincronizar(db, r1, {});
    }
    for (let i = 0; i < 4; i++) for (const db of [A, B, C]) { avanzar(); await sincronizar(db, r1, {}); }
    for (const db of [A, B, C]) {
      assert.equal(n(db, "SELECT COUNT(*) n FROM personas WHERE uid = ?", uid), 1);
      assert.equal(n(db, 'SELECT COUNT(*) n FROM sesiones'), 2);
    }
    assert.deepEqual(vivosLocales(A), vivosLocales(B));
    assert.deepEqual(vivosLocales(B), vivosLocales(C));
    assert.equal(r1.documentos().filter(d => d.tipo === 'persona' && d.clave === uid && !d.borrado).length, 1);
  });
});

// ---------- empates entre equipos y marcas por delante del reloj ----------

test('dos equipos editan lo mismo en el mismo milisegundo: ganan la versión de la nube y los dos terminan iguales', async () => {
  await conReloj(async ({ avanzar }) => {
    const [A, B, remoto] = [nueva(), nueva(), crearRemotoEnMemoria()];
    A.exec("INSERT INTO rutinas (nombre, dias, descripcion, persona_id) VALUES ('R', '[1]', '', 1)");
    await sincronizar(A, remoto, {});
    await sincronizar(B, remoto, {});
    avanzar(5);
    A.exec("UPDATE rutinas SET nombre = 'de A'");
    B.exec("UPDATE rutinas SET nombre = 'de B'"); // misma marca
    await sincronizar(A, remoto, {});
    for (let i = 0; i < 3; i++) for (const db of [B, A]) await sincronizar(db, remoto, {});
    const nombres = [A, B].map(db => db.prepare('SELECT nombre FROM rutinas').get().nombre);
    assert.equal(nombres[0], nombres[1]);
    assert.equal(nombres[0], 'de A'); // la primera que llegó a la nube
    for (const db of [A, B]) assert.deepEqual(await sincronizar(db, remoto, {}), CERO);
    assert.deepEqual(vivosLocales(A), vivosLocales(B));
  });
});

test('un cambio hecho cuando el reloj va por detrás del último envío se estampa después de él y se sube', async () => {
  await conReloj(async () => {
    const [A, remoto] = [nueva(), crearRemotoEnMemoria()];
    A.exec("INSERT INTO rutinas (nombre, dias, descripcion, persona_id) VALUES ('R', '[1]', '', 1)");
    A.exec("UPDATE rutinas SET actualizado = '2999-01-01T00:00:00.000Z'"); // una marca muy por delante del reloj
    await sincronizar(A, remoto, {});
    A.exec("INSERT INTO sesiones (fecha, estado, persona_id) VALUES ('2026-01-01T10:00:00.000Z', 'finalizada', 1)");
    assert.ok(A.prepare('SELECT actualizado a FROM sesiones').get().a > '2999-01-01T00:00:00.000Z');
    assert.equal((await sincronizar(A, remoto, {})).subidos, 1);
    assert.equal(remoto.documentos().filter(d => d.tipo === 'sesion').length, 1);
  });
});

test('alias con la misma marca: otro destino o datos distintos se adopta (manda la nube); el borrado de la misma marca le gana', () => {
  const db = nueva();
  const origen = 'ffffffff-ffff-4fff-8fff-ffffffffffff';
  const S = '2026-06-01T12:00:00.100Z';
  const alias = (destino, datos = {}) => ({ tipo: 'persona', clave: origen, actualizado: S, borrado: false,
    datos: { nombre: 'X', color: '#fff', avatar: '', creada: 'c', unificada_en: destino, ...datos } });
  const D1 = '11111111-1111-4111-8111-111111111111';
  const D2 = '22222222-2222-4222-8222-222222222222';
  assert.equal(aplicarDocumento(db, alias(D1)), 'aplicado');
  assert.equal(aplicarDocumento(db, alias(D1)), 'ignorado'); // idéntico
  assert.equal(aplicarDocumento(db, alias(D2)), 'aplicado'); // otro destino, misma marca
  assert.equal(db.prepare('SELECT destino FROM sync_alias').get().destino, D2);
  assert.equal(aplicarDocumento(db, alias(D2, { color: '#000' })), 'aplicado'); // otros datos, misma marca
  assert.equal(JSON.parse(db.prepare('SELECT datos FROM sync_alias').get().datos).color, '#000');
  aplicarDocumento(db, { tipo: 'persona', clave: origen, actualizado: S, borrado: true, datos: null });
  assert.equal(n(db, 'SELECT COUNT(*) n FROM sync_alias'), 0); // el borrado de la misma marca gana
});
