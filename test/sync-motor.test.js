import { test } from 'node:test';
import assert from 'node:assert/strict';
import { openDb } from '../server/db.js';
import { cambiosLocales } from '../server/sync/documentos.js';
import { sincronizar } from '../server/sync/motor.js';
import { crearRemotoEnMemoria } from './helpers-remoto.js';

const esperar = (ms = 5) => { const t = Date.now() + ms; while (Date.now() < t); };
const nuevaBase = () => {
  const db = openDb(':memory:');
  db.exec("INSERT INTO ejercicios (id, nombre) VALUES ('A', 'A'), ('B', 'B')");
  return db;
};
const q = (db, sql, ...p) => db.prepare(sql).all(...p).map(f => ({ ...f }));
const n = (db, sql, ...p) => q(db, sql, ...p)[0].n;
const estado = (db, clave) => db.prepare('SELECT valor FROM sync_estado WHERE clave = ?').get(clave)?.valor ?? null;

function agregarAna(db) {
  db.exec("INSERT INTO personas (nombre, color, creada) VALUES ('Ana', '#fff', 'x')");
  const pid = db.prepare("SELECT id FROM personas WHERE nombre = 'Ana'").get().id;
  db.exec(`
    INSERT INTO rutinas (id, nombre, dias, descripcion, persona_id) VALUES (10, 'R1', '[1]', '', ${pid});
    INSERT INTO rutina_dias (id, rutina_id, nombre, orden) VALUES (100, 10, 'D1', 0);
    INSERT INTO rutina_ejercicios (dia_id, ejercicio_id, orden, series, reps, descanso_seg) VALUES (100, 'A', 0, 3, '10', 90);
    INSERT INTO sesiones (id, rutina_id, fecha, estado, dia_id, persona_id) VALUES (20, 10, '2026-01-01T10:00:00.000Z', 'finalizada', 100, ${pid});
    INSERT INTO series_hechas (sesion_id, ejercicio_id, n, peso_kg, reps, hecha) VALUES (20, 'A', 1, 50, 10, 1);
  `);
  return pid;
}

// Los documentos vivos de una base, ordenados, para comparar bases entre sí y con el remoto.
const vivos = (docs) => docs.filter(d => !d.borrado).map(d => JSON.stringify(d)).sort();
const vivosLocales = (db) => vivos(cambiosLocales(db, null));
const nombresRutinas = (db) => q(db, 'SELECT nombre FROM rutinas ORDER BY nombre').map(r => r.nombre);

async function converger(dbs, remoto, vueltas = 4) {
  for (let i = 0; i < vueltas; i++) for (const db of dbs) await sincronizar(db, remoto, {});
}
async function assertConvergidos(dbs, remoto) {
  const r = vivos(remoto.documentos());
  for (const db of dbs) assert.deepEqual(vivosLocales(db), r);
  for (const db of dbs) {
    const res = await sincronizar(db, remoto, {});
    assert.deepEqual(res, { subidos: 0, bajados: 0, enEspera: 0, rechazados: 0 });
  }
}

test('A crea persona, rutina y sesión; B los recibe', async () => {
  const [A, B, remoto] = [nuevaBase(), nuevaBase(), crearRemotoEnMemoria()];
  agregarAna(A);
  const ra = await sincronizar(A, remoto, {});
  assert.ok(ra.subidos >= 4);
  const rb = await sincronizar(B, remoto, {});
  assert.ok(rb.bajados >= 4);
  assert.equal(n(B, "SELECT COUNT(*) n FROM personas WHERE nombre = 'Ana'"), 1);
  assert.equal(n(B, 'SELECT COUNT(*) n FROM series_hechas'), 1);
  assert.equal(n(B, "SELECT COUNT(*) n FROM sesiones WHERE estado = 'finalizada'"), 1);
  await converger([A, B], remoto);
  await assertConvergidos([A, B], remoto);
});

test('edición simultánea de la misma rutina: gana la más nueva, sin duplicados', async () => {
  const [A, B, remoto] = [nuevaBase(), nuevaBase(), crearRemotoEnMemoria()];
  agregarAna(A);
  await converger([A, B], remoto);
  A.exec("UPDATE rutinas SET nombre = 'de A' WHERE nombre = 'R1'");
  esperar();
  B.exec("UPDATE rutinas SET nombre = 'de B' WHERE nombre = 'R1'");
  await converger([A, B], remoto, 2);
  assert.deepEqual(nombresRutinas(A), ['de B']);
  assert.deepEqual(nombresRutinas(B), ['de B']);
  // Al revés: si sincroniza primero la más nueva, la vieja no la pisa.
  A.exec("UPDATE rutinas SET nombre = 'A2' WHERE nombre = 'de B'");
  esperar();
  B.exec("UPDATE rutinas SET nombre = 'B2' WHERE nombre = 'de B'");
  await sincronizar(B, remoto, {});
  await converger([A, B], remoto, 2);
  assert.deepEqual(nombresRutinas(A), ['B2']);
  assert.equal(remoto.documentos().filter(d => d.tipo === 'rutina').length, 1);
  await assertConvergidos([A, B], remoto);
});

test('borrar una sesión en A desaparece de B y no vuelve a A', async () => {
  const [A, B, remoto] = [nuevaBase(), nuevaBase(), crearRemotoEnMemoria()];
  agregarAna(A);
  await converger([A, B], remoto);
  A.exec('DELETE FROM sesiones WHERE id = 20');
  await sincronizar(A, remoto, {});
  await sincronizar(B, remoto, {});
  assert.equal(n(B, 'SELECT COUNT(*) n FROM sesiones'), 0);
  await converger([A, B], remoto);
  assert.equal(n(A, 'SELECT COUNT(*) n FROM sesiones'), 0);
  assert.equal(n(B, 'SELECT COUNT(*) n FROM sesiones'), 0);
  await assertConvergidos([A, B], remoto);
});

test('borrado contra edición: gana lo más nuevo', async () => {
  const [A, B, remoto] = [nuevaBase(), nuevaBase(), crearRemotoEnMemoria()];
  agregarAna(A);
  await converger([A, B], remoto);
  // A borra, B edita después: la edición gana y la rutina vuelve a A.
  A.exec('DELETE FROM sesiones WHERE id = 20');
  A.exec('DELETE FROM rutinas WHERE id = 10');
  esperar();
  B.exec("UPDATE rutinas SET nombre = 'editada' WHERE nombre = 'R1'");
  await converger([A, B], remoto);
  assert.deepEqual(nombresRutinas(A), ['editada']);
  assert.deepEqual(nombresRutinas(B), ['editada']);
  // A edita, B borra después: el borrado gana.
  A.exec("UPDATE rutinas SET nombre = 'otra' WHERE nombre = 'editada'");
  esperar();
  B.exec("DELETE FROM rutinas WHERE nombre = 'editada'");
  await converger([A, B], remoto);
  assert.deepEqual(nombresRutinas(A), []);
  assert.deepEqual(nombresRutinas(B), []);
  await assertConvergidos([A, B], remoto);
});

test('persona borrada en la nube mientras B editó un hijo: la persona sobrevive', async () => {
  const [A, B, remoto] = [nuevaBase(), nuevaBase(), crearRemotoEnMemoria()];
  agregarAna(A);
  await converger([A, B], remoto);
  A.exec("DELETE FROM personas WHERE nombre = 'Ana'");
  esperar();
  B.exec("UPDATE rutinas SET nombre = 'viva' WHERE nombre = 'R1'");
  await converger([A, B], remoto, 5);
  for (const db of [A, B]) {
    assert.equal(n(db, "SELECT COUNT(*) n FROM personas WHERE nombre = 'Ana'"), 1);
    assert.deepEqual(nombresRutinas(db), ['viva']);
  }
  await assertConvergidos([A, B], remoto);
});

test('una sesión que llega antes que su persona (en otro lote) queda aplicada al terminar la vuelta', async () => {
  const [A, B] = [nuevaBase(), nuevaBase()];
  const remoto = crearRemotoEnMemoria({ pagina: 1 });
  agregarAna(A);
  const docs = cambiosLocales(A, null);
  const orden = ['sesion', 'rutina', 'medida', 'persona'];
  docs.sort((x, y) => orden.indexOf(x.tipo) - orden.indexOf(y.tipo));
  for (const d of docs) await remoto.subir([d]); // un servidor_en por documento: la persona queda última
  const res = await sincronizar(B, remoto, {});
  assert.equal(res.enEspera, 0);
  assert.equal(n(B, "SELECT COUNT(*) n FROM sesiones WHERE estado = 'finalizada'"), 1);
  assert.equal(n(B, 'SELECT COUNT(*) n FROM rutinas'), 1);
});

test('un documento en espera se guarda en la base y se resuelve en una vuelta posterior', async () => {
  const [A, B, remoto] = [nuevaBase(), nuevaBase(), crearRemotoEnMemoria()];
  agregarAna(A);
  const todos = cambiosLocales(A, null);
  const persona = todos.find(d => d.tipo === 'persona' && d.datos.nombre === 'Ana');
  for (const d of todos.filter(d => d !== persona)) await remoto.subir([d]);
  const r1 = await sincronizar(B, remoto, {});
  assert.ok(r1.enEspera >= 1);
  assert.equal(n(B, 'SELECT COUNT(*) n FROM sesiones'), 0);
  assert.ok(JSON.parse(estado(B, 'pendientes')).length >= 1, 'las pendientes sobreviven a un reinicio');
  // Otra vuelta sin novedades no pierde ni duplica las pendientes.
  assert.equal((await sincronizar(B, remoto, {})).enEspera, r1.enEspera);
  await remoto.subir([persona]);
  const r2 = await sincronizar(B, remoto, {});
  assert.equal(r2.enEspera, 0);
  assert.equal(n(B, 'SELECT COUNT(*) n FROM sesiones'), 1);
  assert.equal(estado(B, 'pendientes'), '[]');
});

test('si subir falla no se marca nada como enviado y la vuelta siguiente sube lo mismo', async () => {
  const [A, remoto] = [nuevaBase(), crearRemotoEnMemoria()];
  agregarAna(A);
  remoto.fallaSubida = new Error('sin red');
  await assert.rejects(sincronizar(A, remoto, {}), /sin red/);
  assert.equal(estado(A, 'ultimo_envio'), null);
  assert.equal(remoto.documentos().length, 0);
  remoto.fallaSubida = null;
  const res = await sincronizar(A, remoto, {});
  assert.ok(res.subidos >= 4);
  assert.ok(estado(A, 'ultimo_envio'));
  assert.equal(remoto.documentos().length, res.subidos);
});

test('subida cortada a mitad de camino: se reintenta todo y el remoto no duplica', async () => {
  const [A, remoto] = [nuevaBase(), crearRemotoEnMemoria()];
  agregarAna(A);
  let llamadas = 0;
  const original = remoto.subir;
  remoto.subir = async (docs) => { if (++llamadas === 2) throw new Error('corte'); return original(docs); };
  await assert.rejects(sincronizar(A, remoto, { lote: 2 }), /corte/);
  assert.equal(estado(A, 'ultimo_envio'), null);
  remoto.subir = original;
  await sincronizar(A, remoto, { lote: 2 });
  const claves = remoto.documentos().map(d => `${d.tipo}|${d.clave}`);
  assert.equal(new Set(claves).size, claves.length);
  assert.deepEqual(vivos(remoto.documentos()), vivosLocales(A));
});

test('si bajar falla no avanza el cursor', async () => {
  const [A, B, remoto] = [nuevaBase(), nuevaBase(), crearRemotoEnMemoria()];
  agregarAna(A);
  await sincronizar(A, remoto, {});
  remoto.fallaBajada = new Error('sin red');
  await assert.rejects(sincronizar(B, remoto, {}), /sin red/);
  assert.equal(estado(B, 'cursor'), null);
  remoto.fallaBajada = null;
  const res = await sincronizar(B, remoto, {});
  assert.ok(res.bajados >= 4);
});

test('una sesión en curso no se sube; al finalizarla, sí', async () => {
  const [A, remoto] = [nuevaBase(), crearRemotoEnMemoria()];
  const pid = A.prepare('SELECT id FROM personas LIMIT 1').get().id;
  A.exec(`INSERT INTO sesiones (id, fecha, estado, persona_id) VALUES (30, '2026-02-01T10:00:00.000Z', 'en_curso', ${pid})`);
  await sincronizar(A, remoto, {});
  assert.equal(remoto.documentos().filter(d => d.tipo === 'sesion').length, 0);
  esperar();
  A.exec("UPDATE sesiones SET estado = 'finalizada' WHERE id = 30");
  await sincronizar(A, remoto, {});
  assert.equal(remoto.documentos().filter(d => d.tipo === 'sesion').length, 1);
});

test('lo bajado no se vuelve a subir (eco), pero un cambio local genuino sí', async () => {
  const [A, B, remoto] = [nuevaBase(), nuevaBase(), crearRemotoEnMemoria()];
  agregarAna(A);
  await sincronizar(A, remoto, {});
  // B hace un cambio propio antes de bajar lo de A.
  esperar();
  const pid = B.prepare('SELECT id FROM personas LIMIT 1').get().id;
  const uid = B.prepare('SELECT uid FROM personas WHERE id = ?').get(pid).uid;
  B.exec(`INSERT INTO medidas (persona_id, fecha, peso_kg) VALUES (${pid}, '2026-03-01', 70)`);
  const propios = cambiosLocales(B, null).length; // persona inicial + medida
  const antes = remoto.docsSubidos;
  const rb = await sincronizar(B, remoto, {});
  assert.ok(rb.bajados >= 4);
  assert.equal(rb.subidos, propios, 'solo lo propio, no lo recién bajado');
  assert.equal(remoto.docsSubidos - antes, propios);
  assert.equal((await sincronizar(B, remoto, {})).subidos, 0, 'lo bajado no se re-sube');
  // Un documento bajado con fecha futura (reloj adelantado) tampoco bloquea cambios locales posteriores.
  const futuro = new Date(Date.now() + 3600e3).toISOString();
  await remoto.subir([{ tipo: 'medida', clave: `${uid}|2026-03-05`, actualizado: futuro, borrado: false,
    datos: { persona: uid, fecha: '2026-03-05', peso_kg: 1 } }]);
  const r3 = await sincronizar(B, remoto, {});
  assert.equal(r3.bajados, 1);
  assert.equal(r3.subidos, 0);
  esperar();
  B.exec(`INSERT INTO medidas (persona_id, fecha, peso_kg) VALUES (${pid}, '2026-03-02', 71)`);
  assert.equal((await sincronizar(B, remoto, {})).subidos, 1);
  assert.equal((await sincronizar(B, remoto, {})).subidos, 0);
});

test('ping-pong: altas, ediciones y borrados en ambos lados convergen y luego no hay trabajo', async () => {
  const [A, B] = [nuevaBase(), nuevaBase()];
  const remoto = crearRemotoEnMemoria({ pagina: 3 });
  agregarAna(A);
  await converger([A, B], remoto);
  const pidB = B.prepare("SELECT id FROM personas WHERE nombre = 'Ana'").get().id;
  const pidA = A.prepare("SELECT id FROM personas WHERE nombre = 'Ana'").get().id;
  B.exec(`INSERT INTO rutinas (id, nombre, dias, descripcion, persona_id) VALUES (50, 'RB', '[]', '', ${pidB});
          INSERT INTO sesiones (id, fecha, estado, persona_id, rutina_id) VALUES (51, '2026-04-01T10:00:00.000Z', 'finalizada', ${pidB}, 50)`);
  A.exec(`INSERT INTO medidas (persona_id, fecha, peso_kg) VALUES (${pidA}, '2026-04-01', 60);
          INSERT INTO favoritos (persona_id, ejercicio_id) VALUES (${pidA}, 'B');
          UPDATE rutinas SET descripcion = 'cambiada' WHERE id = 10`);
  await converger([A, B], remoto, 2);
  esperar();
  A.exec("DELETE FROM medidas WHERE fecha = '2026-04-01'");
  B.exec("DELETE FROM sesiones WHERE rutina_id = (SELECT id FROM rutinas WHERE nombre = 'R1')");
  B.exec("UPDATE personas SET color = '#000' WHERE nombre = 'Ana'");
  await converger([A, B], remoto, 3);
  assert.equal(q(A, "SELECT color FROM personas WHERE nombre = 'Ana'")[0].color, '#000');
  assert.equal(n(A, 'SELECT COUNT(*) n FROM medidas'), 0);
  assert.equal(n(A, 'SELECT COUNT(*) n FROM sesiones'), 1);
  assert.equal(n(B, 'SELECT COUNT(*) n FROM sesiones'), 1);
  await assertConvergidos([A, B], remoto);
});

test('el remoto en memoria conserva solo la versión más nueva (no resucita ni retrocede)', async () => {
  const remoto = crearRemotoEnMemoria();
  const d = (actualizado, borrado = false) => ({ tipo: 'rutina', clave: 'x', actualizado, borrado, datos: borrado ? null : { v: actualizado } });
  await remoto.subir([d('2026-01-02T00:00:00.000Z')]);
  await remoto.subir([d('2026-01-01T00:00:00.000Z')]); // más vieja: no pisa
  assert.equal(remoto.documentos()[0].actualizado, '2026-01-02T00:00:00.000Z');
  assert.equal(remoto.documentos()[0].borrado, false);
  // Con la misma fecha gana el borrado, y un vivo nunca pisa un borrado igual.
  await remoto.subir([d('2026-01-02T00:00:00.000Z', true)]);
  assert.equal(remoto.documentos()[0].borrado, true);
  await remoto.subir([d('2026-01-02T00:00:00.000Z')]);
  assert.equal(remoto.documentos()[0].borrado, true);
  await remoto.subir([d('2026-01-03T00:00:00.000Z', true)]);
  const { docs, cursor } = await remoto.bajar(null);
  assert.equal(docs.length, 1);
  assert.equal(docs[0].borrado, true);
  assert.equal((await remoto.bajar(cursor)).docs.length, 0);
});

// ---------- cuarentena, degradados, cursor y topes ----------

const docRutina = (persona, clave, nombre, actualizado) => ({
  tipo: 'rutina', clave, actualizado, borrado: false,
  datos: { persona, nombre, descripcion: '', dias_semana: '[]', dias: [] },
});

test('un documento que no se puede aplicar queda en cuarentena, no frena el resto y se reintenta si llega uno más nuevo', async (t) => {
  const advertencias = [];
  t.mock.method(console, 'warn', (m) => advertencias.push(m));
  const [A, B, remoto] = [nuevaBase(), nuevaBase(), crearRemotoEnMemoria()];
  agregarAna(A);
  const uid = A.prepare("SELECT uid FROM personas WHERE nombre = 'Ana'").get().uid;
  await sincronizar(A, remoto, {});
  const malo = docRutina(uid, 'rutina-mala', null, '2030-01-01T00:00:00.000Z'); // nombre NOT NULL: falla al escribir
  await remoto.subir([malo]);
  const r1 = await sincronizar(B, remoto, {});
  assert.equal(r1.rechazados, 1);
  assert.ok(r1.bajados >= 4, 'el resto sí se aplicó');
  assert.equal(advertencias.length, 1);
  assert.equal(n(B, "SELECT COUNT(*) n FROM rutinas WHERE uid = 'rutina-mala'"), 0);
  assert.ok(estado(B, 'cursor'), 'el cursor pasó de largo');
  // Misma versión: no se reintenta ni vuelve a avisar.
  await remoto.subir([{ ...docRutina(uid, 'otra', 'ok', '2030-01-01T00:00:00.000Z') }]);
  const r2 = await sincronizar(B, remoto, {});
  assert.equal(r2.rechazados, 1);
  assert.equal(advertencias.length, 1);
  // Una versión más nueva sí se reintenta y sale de la cuarentena.
  await remoto.subir([docRutina(uid, 'rutina-mala', 'arreglada', '2030-01-02T00:00:00.000Z')]);
  const r3 = await sincronizar(B, remoto, {});
  assert.equal(r3.rechazados, 0);
  assert.equal(n(B, "SELECT COUNT(*) n FROM rutinas WHERE uid = 'rutina-mala'"), 1);
});

test('la cuarentena guarda solo los últimos 100', async (t) => {
  t.mock.method(console, 'warn', () => {});
  const [A, B, remoto] = [nuevaBase(), nuevaBase(), crearRemotoEnMemoria()];
  agregarAna(A);
  const uid = A.prepare("SELECT uid FROM personas WHERE nombre = 'Ana'").get().uid;
  await sincronizar(A, remoto, {});
  for (let i = 0; i < 120; i++) await remoto.subir([docRutina(uid, `mala-${i}`, null, '2030-01-01T00:00:00.000Z')]);
  const r = await sincronizar(B, remoto, {});
  assert.equal(r.rechazados, 100);
});

test('un documento aplicado en versión degradada se sube y todos convergen (no es eco)', async () => {
  const [A, B, remoto] = [nuevaBase(), nuevaBase(), crearRemotoEnMemoria()];
  agregarAna(A);
  await converger([A, B], remoto);
  // B borra la rutina sin sincronizar; A edita después la sesión (que sigue apuntando a esa rutina).
  B.exec('DELETE FROM rutinas WHERE nombre = \'R1\'');
  esperar();
  A.exec("UPDATE sesiones SET nota = 'editada' WHERE id = 20");
  await sincronizar(A, remoto, {});
  const rb = await sincronizar(B, remoto, {});
  assert.ok(rb.subidos >= 1, 'la sesión degradada (sin rutina) se sube en la misma vuelta');
  assert.equal(q(B, 'SELECT rutina_id FROM sesiones')[0].rutina_id, null);
  await converger([A, B], remoto);
  assert.equal(q(A, 'SELECT rutina_id, nota FROM sesiones')[0].rutina_id, null);
  assert.equal(q(A, 'SELECT nota FROM sesiones')[0].nota, 'editada');
  assert.equal(n(A, 'SELECT COUNT(*) n FROM rutinas'), 0);
  await assertConvergidos([A, B], remoto);
});

test('un cambio de cursor en una página vacía se guarda', async () => {
  const A = nuevaBase();
  const remoto = { subir: async () => {}, bajar: async () => ({ docs: [], cursor: '000000000007' }) };
  const r = await sincronizar(A, remoto, {});
  assert.equal(estado(A, 'cursor'), '000000000007');
  assert.equal(r.parcial, undefined);
});

test('si el remoto no termina nunca, la vuelta se corta y avisa parcial', async () => {
  const A = nuevaBase();
  let k = 0;
  const remoto = {
    subir: async () => {},
    bajar: async () => ({ docs: [{ tipo: 'desconocido', clave: `x${k}`, actualizado: '2030', borrado: false, datos: {} }], cursor: String(++k).padStart(12, '0') }),
  };
  const r = await sincronizar(A, remoto, {});
  assert.equal(r.parcial, true);
  assert.equal(estado(A, 'cursor'), String(k).padStart(12, '0'));
});

test('la lista de espera tiene tope (se descartan las más viejas)', async (t) => {
  t.mock.method(console, 'warn', () => {});
  const A = nuevaBase();
  const docs = Array.from({ length: 600 }, (_, i) => docRutina('persona-que-no-llega', `r${i}`, 'x', `2030-01-01T00:00:${String(i % 60).padStart(2, '0')}.${String(i).padStart(3, '0')}Z`));
  const remoto = { subir: async () => {}, bajar: async (c) => (c ? { docs: [], cursor: c } : { docs, cursor: '1' }) };
  const r = await sincronizar(A, remoto, {});
  assert.equal(r.enEspera, 500);
  assert.equal(JSON.parse(estado(A, 'pendientes')).length, 500);
});
