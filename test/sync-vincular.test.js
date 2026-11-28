import { test } from 'node:test';
import assert from 'node:assert/strict';
import { openDb } from '../server/db.js';
import { cambiosLocales } from '../server/sync/documentos.js';
import { sincronizar } from '../server/sync/motor.js';
import { estadoVinculo, vincular, personasDuplicadas, unificarPersonas } from '../server/sync/vincular.js';
import { crearRemotoEnMemoria } from './helpers-remoto.js';

const nuevaBase = () => {
  const db = openDb(':memory:');
  db.exec("INSERT INTO ejercicios (id, nombre) VALUES ('A', 'A'), ('B', 'B')");
  return db;
};
const q = (db, sql, ...p) => db.prepare(sql).all(...p).map(f => ({ ...f }));
const n = (db, sql, ...p) => q(db, sql, ...p)[0].n;
const estado = (db, clave) => db.prepare('SELECT valor FROM sync_estado WHERE clave = ?').get(clave)?.valor ?? null;
const vivos = (docs) => docs.filter(d => !d.borrado).map(d => JSON.stringify(d)).sort();
const vivosLocales = (db) => vivos(cambiosLocales(db, null));
const borrados = (remoto) => remoto.documentos().filter(d => d.borrado).length;
const CERO = { subidos: 0, bajados: 0, enEspera: 0, rechazados: 0 };

// Una persona con una rutina y `sesiones` sesiones finalizadas.
function agregarPersona(db, nombre, sesiones = 1, extra = '') {
  db.prepare("INSERT INTO personas (nombre, color, creada) VALUES (?, '#fff', 'x')").run(nombre);
  const pid = db.prepare('SELECT MAX(id) AS id FROM personas').get().id;
  db.exec(`INSERT INTO rutinas (nombre, dias, descripcion, persona_id) VALUES ('R ${nombre} ${extra}', '[1]', '', ${pid})`);
  const rid = db.prepare('SELECT MAX(id) AS id FROM rutinas').get().id;
  for (let i = 0; i < sesiones; i++) {
    db.exec(`INSERT INTO sesiones (rutina_id, fecha, estado, persona_id) VALUES (${rid}, '2026-02-0${i + 1}T10:00:00.000Z', 'finalizada', ${pid})`);
  }
  return pid;
}
async function remotoConDatos() {
  const R = nuevaBase();
  const remoto = crearRemotoEnMemoria();
  agregarPersona(R, 'Remota', 2);
  await sincronizar(R, remoto, {});
  return { R, remoto };
}
async function converger(dbs, remoto, vueltas = 4) {
  for (let i = 0; i < vueltas; i++) for (const db of dbs) await sincronizar(db, remoto, {});
}

test('estadoVinculo: cuenta vacía, equipo vacío y ambos con datos', async () => {
  const L = nuevaBase();
  assert.equal(await estadoVinculo(L, crearRemotoEnMemoria()), 'cuenta_vacia');
  const { remoto } = await remotoConDatos();
  // La persona por defecto sin tocar no cuenta como datos propios.
  assert.equal(await estadoVinculo(L, remoto), 'equipo_vacio');
  agregarPersona(L, 'Ana', 1);
  assert.equal(await estadoVinculo(L, remoto), 'ambos_con_datos');
  assert.equal(await estadoVinculo(L, crearRemotoEnMemoria()), 'cuenta_vacia');
});

test('estadoVinculo: una nube con solo borrados cuenta como vacía; una persona editada o una medida son datos propios', async () => {
  const R = nuevaBase();
  const remoto = crearRemotoEnMemoria();
  agregarPersona(R, 'Tmp', 1);
  await sincronizar(R, remoto, {});
  R.exec("DELETE FROM personas WHERE nombre = 'Tmp'; DELETE FROM personas WHERE nombre = 'Yo'");
  await sincronizar(R, remoto, {});
  assert.ok(borrados(remoto) > 0);
  assert.equal(await estadoVinculo(nuevaBase(), remoto), 'cuenta_vacia');
  const { remoto: conDatos } = await remotoConDatos();
  const E = nuevaBase();
  E.exec("UPDATE personas SET nombre = 'Marcos'");
  assert.equal(await estadoVinculo(E, conDatos), 'ambos_con_datos');
  const M = nuevaBase();
  M.exec("INSERT INTO medidas (persona_id, fecha, peso_kg) VALUES (1, '2026-01-01', 70)");
  assert.equal(await estadoVinculo(M, conDatos), 'ambos_con_datos');
});

test('juntar: 3 sesiones locales y 2 remotas dejan 5 en los dos lados', async () => {
  const { R, remoto } = await remotoConDatos();
  const L = nuevaBase();
  agregarPersona(L, 'Local', 3);
  await vincular(L, remoto, 'juntar');
  assert.equal(n(L, "SELECT COUNT(*) n FROM sesiones WHERE estado = 'finalizada'"), 5);
  assert.equal(vivos(remoto.documentos()).filter(d => d.includes('"tipo":"sesion"')).length, 5);
  await converger([R, L], remoto);
  assert.equal(n(R, 'SELECT COUNT(*) n FROM sesiones'), 5);
  assert.deepEqual(vivosLocales(L), vivos(remoto.documentos()));
  assert.deepEqual(vivosLocales(R), vivos(remoto.documentos()));
  assert.deepEqual(await sincronizar(L, remoto, {}), CERO);
});

test('juntar: ignora un cursor viejo y baja todo de nuevo', async () => {
  const { remoto } = await remotoConDatos();
  const L = nuevaBase();
  agregarPersona(L, 'Local', 1);
  L.exec("INSERT INTO sync_estado (clave, valor) VALUES ('cursor', '999999999999'), ('eco', '{}'), ('pendientes', '[]'), ('rechazados', '{}')");
  await vincular(L, remoto, 'juntar');
  assert.equal(n(L, "SELECT COUNT(*) n FROM sesiones WHERE estado = 'finalizada'"), 3);
  assert.notEqual(estado(L, 'cursor'), '999999999999');
});

test('subir: una cuenta nueva recibe todo lo del equipo', async () => {
  const L = nuevaBase();
  agregarPersona(L, 'Ana', 2);
  const remoto = crearRemotoEnMemoria();
  await vincular(L, remoto, 'subir');
  assert.deepEqual(vivos(remoto.documentos()), vivosLocales(L));
  assert.deepEqual(await sincronizar(L, remoto, {}), CERO);
});

test('reemplazar: queda solo lo remoto y no se sube ningún borrado', async () => {
  const { remoto } = await remotoConDatos();
  const antes = remoto.documentos().length;
  const L = nuevaBase();
  agregarPersona(L, 'Local', 3);
  await vincular(L, remoto, 'reemplazar');
  assert.equal(borrados(remoto), 0);
  assert.equal(remoto.documentos().length, antes);
  assert.equal(n(L, "SELECT COUNT(*) n FROM personas WHERE nombre IN ('Local', 'Yo')"), 1); // la 'Yo' de la nube
  assert.equal(n(L, "SELECT COUNT(*) n FROM personas WHERE nombre = 'Local'"), 0);
  assert.equal(n(L, 'SELECT COUNT(*) n FROM sesiones'), 2);
  assert.deepEqual(vivosLocales(L), vivos(remoto.documentos()));
  assert.equal(n(L, 'SELECT COUNT(*) n FROM sync_borrados'), 0);
  assert.deepEqual(await sincronizar(L, remoto, {}), CERO);
  assert.equal(borrados(remoto), 0);
});

test('bajar: un equipo sin datos propios se queda con la nube, sin borrados', async () => {
  const { remoto } = await remotoConDatos();
  const L = nuevaBase();
  const uidPropio = L.prepare('SELECT uid FROM personas').get().uid;
  await vincular(L, remoto, 'bajar');
  assert.equal(borrados(remoto), 0);
  assert.equal(n(L, 'SELECT COUNT(*) n FROM personas WHERE uid = ?', uidPropio), 0);
  assert.deepEqual(vivosLocales(L), vivos(remoto.documentos()));
  assert.deepEqual(await sincronizar(L, remoto, {}), CERO);
});

test('bajar y reemplazar: si la nube no responde, el equipo queda intacto', async () => {
  const { remoto } = await remotoConDatos();
  const L = nuevaBase();
  agregarPersona(L, 'Local', 2);
  const antes = vivosLocales(L);
  remoto.fallaBajada = new Error('sin red');
  await assert.rejects(vincular(L, remoto, 'reemplazar'), /sin red/);
  assert.deepEqual(vivosLocales(L), antes);
});

test('reemplazar con la nube sin personas deja al menos una persona', async () => {
  const L = nuevaBase();
  agregarPersona(L, 'Local', 1);
  await vincular(L, crearRemotoEnMemoria(), 'reemplazar');
  assert.equal(n(L, 'SELECT COUNT(*) n FROM personas'), 1);
  assert.equal(n(L, 'SELECT COUNT(*) n FROM rutinas'), 0);
});

test('modo inválido', async () => {
  await assert.rejects(vincular(nuevaBase(), crearRemotoEnMemoria(), 'otro'), /modo/i);
});

test('vincular con otra cuenta reinicia el estado de sincronización', async () => {
  const L = nuevaBase();
  agregarPersona(L, 'Ana', 2);
  const r1 = crearRemotoEnMemoria();
  await vincular(L, r1, 'subir', { cuenta: 'u1' });
  assert.equal(estado(L, 'cuenta'), 'u1');
  assert.ok(estado(L, 'ultimo_envio'));
  L.exec('DELETE FROM sesiones');
  assert.ok(n(L, 'SELECT COUNT(*) n FROM sync_borrados') > 0);
  const r2 = crearRemotoEnMemoria();
  await vincular(L, r2, 'subir', { cuenta: 'u2' });
  assert.equal(estado(L, 'cuenta'), 'u2');
  assert.deepEqual(vivos(r2.documentos()), vivosLocales(L));
  assert.equal(borrados(r2), 0); // los borrados de la cuenta anterior no viajan a la nueva
  // La misma cuenta no reinicia nada.
  const cursor = estado(L, 'cursor');
  await vincular(L, r2, 'subir', { cuenta: 'u2' });
  assert.equal(estado(L, 'cursor'), cursor);
});

test('personasDuplicadas: mismo nombre sin importar mayúsculas ni espacios', () => {
  const db = nuevaBase();
  agregarPersona(db, ' yo ', 1);
  agregarPersona(db, 'Ana', 1);
  const d = personasDuplicadas(db);
  assert.equal(d.length, 1);
  assert.equal(d[0].nombre.trim().toLowerCase(), 'yo');
  assert.notEqual(d[0].conservar, d[0].duplicada);
  assert.deepEqual(personasDuplicadas(nuevaBase()), []);
});

test('unificarPersonas: junta todo bajo una persona y resuelve choques por el más nuevo', () => {
  const db = nuevaBase();
  const a = db.prepare("SELECT id FROM personas WHERE nombre = 'Yo'").get().id;
  const b = agregarPersona(db, 'yo', 2);
  agregarPersona(db, 'Otra', 1);
  db.exec(`
    INSERT INTO sesiones (rutina_id, fecha, estado, persona_id) VALUES (NULL, '2026-03-01T10:00:00.000Z', 'finalizada', ${a});
    INSERT INTO medidas (persona_id, fecha, peso_kg) VALUES (${a}, '2026-01-01', 70), (${a}, '2026-01-02', 71), (${b}, '2026-01-01', 99), (${b}, '2026-01-03', 72);
    UPDATE medidas SET actualizado = '2026-01-01T00:00:00.000Z' WHERE persona_id = ${a} AND fecha = '2026-01-01';
    UPDATE medidas SET actualizado = '2026-06-01T00:00:00.000Z' WHERE persona_id = ${b} AND fecha = '2026-01-01';
    INSERT INTO perfil (persona_id, altura) VALUES (${a}, 170), (${b}, 180);
    UPDATE perfil SET actualizado = '2026-01-01T00:00:00.000Z' WHERE persona_id = ${a};
    UPDATE perfil SET actualizado = '2026-06-01T00:00:00.000Z' WHERE persona_id = ${b};
    INSERT INTO favoritos (persona_id, ejercicio_id) VALUES (${a}, 'A'), (${b}, 'A'), (${b}, 'B');
  `);
  const [par] = personasDuplicadas(db);
  unificarPersonas(db, par.conservar, par.duplicada);
  assert.equal(n(db, "SELECT COUNT(*) n FROM personas WHERE lower(trim(nombre)) = 'yo'"), 1);
  assert.equal(n(db, 'SELECT COUNT(*) n FROM sesiones WHERE persona_id = ?', par.conservar), 3);
  assert.equal(n(db, 'SELECT COUNT(*) n FROM rutinas WHERE persona_id = ?', par.conservar), 1);
  assert.deepEqual(q(db, 'SELECT fecha, peso_kg FROM medidas WHERE persona_id = ? ORDER BY fecha', par.conservar),
    [{ fecha: '2026-01-01', peso_kg: 99 }, { fecha: '2026-01-02', peso_kg: 71 }, { fecha: '2026-01-03', peso_kg: 72 }]);
  assert.equal(q(db, 'SELECT altura FROM perfil WHERE persona_id = ?', par.conservar)[0].altura, 180);
  assert.deepEqual(q(db, 'SELECT ejercicio_id FROM favoritos WHERE persona_id = ? ORDER BY 1', par.conservar).map(f => f.ejercicio_id), ['A', 'B']);
  assert.equal(n(db, 'SELECT COUNT(*) n FROM medidas'), 3);
});

test('unificarPersonas: rechaza personas inexistentes o la misma', () => {
  const db = nuevaBase();
  assert.throws(() => unificarPersonas(db, 1, 1));
  assert.throws(() => unificarPersonas(db, 1, 999));
});

test('unificar en A y sincronizar: B converge sin duplicar y sin nada pendiente', async () => {
  const [A, B, remoto] = [nuevaBase(), nuevaBase(), crearRemotoEnMemoria()];
  agregarPersona(A, 'Ana', 2, 'a');
  agregarPersona(B, 'Ana', 1, 'b');
  A.exec("INSERT INTO medidas (persona_id, fecha, peso_kg) SELECT id, '2026-01-01', 60 FROM personas WHERE nombre = 'Ana'");
  B.exec("INSERT INTO medidas (persona_id, fecha, peso_kg) SELECT id, '2026-01-02', 61 FROM personas WHERE nombre = 'Ana'");
  B.exec("INSERT INTO favoritos (persona_id, ejercicio_id) SELECT id, 'B' FROM personas WHERE nombre = 'Ana'");
  await converger([A, B], remoto);
  assert.equal(n(A, "SELECT COUNT(*) n FROM personas WHERE nombre = 'Ana'"), 2);
  // Duplicadas: las dos 'Ana' y las dos 'Yo' por defecto (una por equipo).
  assert.equal(personasDuplicadas(A).length, 2);
  for (const par of personasDuplicadas(A)) unificarPersonas(A, par.conservar, par.duplicada);
  assert.equal(n(A, "SELECT COUNT(*) n FROM personas WHERE nombre = 'Ana'"), 1);
  await converger([A, B], remoto);
  for (const db of [A, B]) {
    assert.equal(n(db, "SELECT COUNT(*) n FROM personas WHERE nombre = 'Ana'"), 1);
    assert.equal(n(db, "SELECT COUNT(*) n FROM personas WHERE nombre = 'Yo'"), 1);
    assert.equal(n(db, 'SELECT COUNT(*) n FROM sesiones'), 3);
    assert.equal(n(db, 'SELECT COUNT(*) n FROM rutinas'), 2);
    assert.equal(n(db, 'SELECT COUNT(*) n FROM medidas'), 2);
    assert.equal(n(db, 'SELECT COUNT(*) n FROM favoritos'), 1);
    assert.equal(n(db, "SELECT COUNT(DISTINCT p.nombre) n FROM (SELECT persona_id FROM rutinas UNION ALL SELECT persona_id FROM sesiones UNION ALL SELECT persona_id FROM medidas UNION ALL SELECT persona_id FROM favoritos) x JOIN personas p ON p.id = x.persona_id"), 1);
    assert.deepEqual(vivosLocales(db), vivos(remoto.documentos()));
  }
  for (const db of [A, B]) assert.deepEqual(await sincronizar(db, remoto, {}), CERO);
});

test('unificar a ciegas en los dos equipos converge a la misma persona', async () => {
  const [A, B, remoto] = [nuevaBase(), nuevaBase(), crearRemotoEnMemoria()];
  agregarPersona(A, 'Ana', 2, 'a');
  agregarPersona(B, 'Ana', 1, 'b');
  await converger([A, B], remoto);
  for (const db of [A, B]) for (const par of personasDuplicadas(db)) unificarPersonas(db, par.conservar, par.duplicada);
  await converger([A, B], remoto, 6);
  for (const db of [A, B]) {
    assert.equal(n(db, "SELECT COUNT(*) n FROM personas WHERE nombre = 'Ana'"), 1);
    assert.equal(n(db, 'SELECT COUNT(*) n FROM sesiones'), 3);
    assert.deepEqual(vivosLocales(db), vivos(remoto.documentos()));
  }
});
