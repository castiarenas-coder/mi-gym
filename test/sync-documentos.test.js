import { test } from 'node:test';
import assert from 'node:assert/strict';
import { openDb } from '../server/db.js';
import { cambiosLocales, aplicarDocumento } from '../server/sync/documentos.js';

// Los cortes se toman con el reloj de la base (el mismo que escribe `actualizado`), no con el de JS.
const corteDb = (db) => db.prepare("SELECT strftime('%Y-%m-%dT%H:%M:%fZ','now') t").get().t;
const esperar = (ms = 5) => { const t = Date.now() + ms; while (Date.now() < t); };

function base() {
  const db = openDb(':memory:');
  db.exec("INSERT INTO ejercicios (id, nombre) VALUES ('A', 'A'), ('B', 'B')");
  return db;
}
const uidPersona = (db, nombre) => db.prepare('SELECT uid FROM personas WHERE nombre = ?').get(nombre).uid;
const filas = (db, sql, ...p) => db.prepare(sql).all(...p).map(f => ({ ...f }));

function conDatos() {
  const db = base();
  db.exec("INSERT INTO personas (nombre, color, creada) VALUES ('Ana', '#fff', 'x')");
  const pid = db.prepare("SELECT id FROM personas WHERE nombre = 'Ana'").get().id;
  db.exec(`
    INSERT INTO rutinas (id, nombre, dias, descripcion, persona_id) VALUES (10, 'R1', '[1,3]', 'desc', ${pid});
    INSERT INTO rutina_dias (id, rutina_id, nombre, orden) VALUES (100, 10, 'D1', 0), (101, 10, 'D2', 1);
    INSERT INTO rutina_ejercicios (dia_id, ejercicio_id, orden, series, reps, descanso_seg, nota) VALUES (100, 'A', 0, 4, '8', 60, 'n'), (101, 'B', 0, 3, '10', 90, NULL);
    INSERT INTO sesiones (id, rutina_id, fecha, duracion, nota, dia_id, estado, titulo, fin, persona_id, grupo)
      VALUES (20, 10, '2026-01-01T10:00:00.000Z', 3600, 'ok', 101, 'finalizada', 'T', '2026-01-01T11:00:00.000Z', ${pid}, 'g1');
    INSERT INTO sesion_ejercicios (sesion_id, ejercicio_id, orden, series_plan, reps_plan, descanso_seg) VALUES (20, 'B', 0, 2, '10', 90);
    INSERT INTO series_hechas (sesion_id, ejercicio_id, n, peso_kg, reps, rpe, hecha) VALUES (20, 'B', 1, 50, 10, 8, 1), (20, 'B', 2, 55, 8, 9, 0);
    INSERT INTO sesiones (id, fecha, estado, persona_id) VALUES (21, '2026-01-02T10:00:00.000Z', 'en_curso', ${pid});
    INSERT INTO medidas (persona_id, fecha, peso_kg, grasa_pct) VALUES (${pid}, '2026-01-01', 60, 20);
    INSERT INTO perfil (persona_id, altura, edad, sexo, actividad, objetivo, fecha_nacimiento) VALUES (${pid}, 165, 30, 'f', 'media', 'masa', '1996-01-01');
    INSERT INTO favoritos (persona_id, ejercicio_id) VALUES (${pid}, 'A');
  `);
  return db;
}
// Aplica todos los documentos de `origen` en `destino` en un orden fijo (personas primero).
function copiar(origen, destino) {
  const orden = ['persona', 'rutina', 'sesion', 'medida', 'perfil', 'favorito'];
  const docs = cambiosLocales(origen, null).sort((a, b) => orden.indexOf(a.tipo) - orden.indexOf(b.tipo));
  return docs.map(d => aplicarDocumento(destino, d));
}
const ANA = "(SELECT id FROM personas WHERE nombre = 'Ana')";
const snapshot = (db) => ({
  personas: filas(db, "SELECT uid, nombre, color, avatar, creada, actualizado FROM personas WHERE nombre = 'Ana'"),
  rutinas: filas(db, 'SELECT r.uid, r.nombre, r.dias, r.descripcion, r.actualizado, p.uid p FROM rutinas r JOIN personas p ON p.id = r.persona_id'),
  dias: filas(db, 'SELECT d.nombre, d.orden, e.ejercicio_id, e.orden eo, e.series, e.reps, e.descanso_seg, e.nota FROM rutina_dias d LEFT JOIN rutina_ejercicios e ON e.dia_id = d.id ORDER BY d.orden, e.orden'),
  sesiones: filas(db, "SELECT s.uid, s.fecha, s.duracion, s.nota, s.estado, s.titulo, s.fin, s.grupo, s.actualizado, p.uid p, r.uid r, d.nombre dia FROM sesiones s JOIN personas p ON p.id = s.persona_id LEFT JOIN rutinas r ON r.id = s.rutina_id LEFT JOIN rutina_dias d ON d.id = s.dia_id WHERE s.estado = 'finalizada'"),
  sesion_ej: filas(db, 'SELECT ejercicio_id, orden, series_plan, reps_plan, descanso_seg FROM sesion_ejercicios ORDER BY orden'),
  series: filas(db, 'SELECT ejercicio_id, n, peso_kg, reps, rpe, hecha FROM series_hechas ORDER BY ejercicio_id, n'),
  medidas: filas(db, 'SELECT fecha, peso_kg, grasa_pct, actualizado FROM medidas'),
  perfil: filas(db, `SELECT altura, edad, sexo, actividad, objetivo, fecha_nacimiento, actualizado FROM perfil WHERE persona_id = ${ANA}`),
  favoritos: filas(db, `SELECT ejercicio_id, actualizado FROM favoritos WHERE persona_id = ${ANA}`),
});

test('cambiosLocales lista cada tipo de documento y excluye sesiones en curso', () => {
  const db = conDatos();
  const docs = cambiosLocales(db, null);
  const tipos = docs.map(d => d.tipo).sort();
  assert.deepEqual(tipos, ['favorito', 'medida', 'perfil', 'persona', 'persona', 'rutina', 'sesion']);
  assert.ok(docs.every(d => d.borrado === false && d.datos && d.clave && d.actualizado));
  const ana = uidPersona(db, 'Ana');
  assert.ok(docs.some(d => d.tipo === 'medida' && d.clave === `${ana}|2026-01-01`));
  assert.ok(docs.some(d => d.tipo === 'favorito' && d.clave === `${ana}|A`));
  assert.ok(docs.some(d => d.tipo === 'perfil' && d.clave === ana));
});

test('cambiosLocales filtra por fecha y lista borrados', () => {
  const db = conDatos();
  const corte = corteDb(db);
  esperar(10);
  assert.deepEqual(cambiosLocales(db, corte), []);
  const uidSesion = db.prepare('SELECT uid FROM sesiones WHERE id = 20').get().uid;
  db.exec('DELETE FROM sesiones WHERE id = 20');
  db.exec('UPDATE medidas SET peso_kg = 61');
  const nuevos = cambiosLocales(db, corte);
  const bor = nuevos.find(d => d.tipo === 'sesion');
  assert.equal(bor.clave, uidSesion);
  assert.equal(bor.borrado, true);
  assert.equal(bor.datos, null);
  assert.ok(bor.actualizado > corte);
  assert.ok(nuevos.some(d => d.tipo === 'medida' && !d.borrado));
});

test('ida y vuelta de todos los tipos: la base destino queda igual', () => {
  const a = conDatos();
  const b = base();
  const res = copiar(a, b);
  assert.ok(res.every(r => r === 'aplicado' || r === 'ignorado'), res.join());
  assert.deepEqual(snapshot(b), snapshot(a));
  assert.equal(filas(b, "SELECT 1 FROM sesiones WHERE estado = 'en_curso'").length, 0);
});

test('un documento no más nuevo que el local se ignora', () => {
  const a = conDatos();
  const b = base();
  copiar(a, b);
  for (const d of cambiosLocales(a, null)) assert.equal(aplicarDocumento(b, d), 'ignorado');
  const viejo = cambiosLocales(a, null).find(d => d.tipo === 'rutina');
  esperar(); b.exec("UPDATE rutinas SET nombre = 'Local'");
  const localAct = b.prepare('SELECT actualizado FROM rutinas').get().actualizado;
  assert.equal(aplicarDocumento(b, { ...viejo, datos: { ...viejo.datos, nombre: 'Remoto' } }), 'ignorado');
  assert.equal(b.prepare('SELECT nombre FROM rutinas').get().nombre, 'Local');
  assert.equal(b.prepare('SELECT actualizado FROM rutinas').get().actualizado, localAct);
});

test('un documento más nuevo reemplaza al local', () => {
  const a = conDatos();
  const b = base();
  copiar(a, b);
  esperar(); a.exec("UPDATE rutinas SET nombre = 'Nueva'");
  const doc = cambiosLocales(a, null).find(d => d.tipo === 'rutina');
  assert.equal(aplicarDocumento(b, doc), 'aplicado');
  assert.equal(b.prepare('SELECT nombre FROM rutinas').get().nombre, 'Nueva');
  assert.equal(b.prepare('SELECT actualizado FROM rutinas').get().actualizado, doc.actualizado);
});

test('una rutina remota con 3 días reemplaza a la local de 2', () => {
  const a = conDatos();
  const b = base();
  copiar(a, b);
  esperar();
  a.exec("INSERT INTO rutina_dias (rutina_id, nombre, orden) VALUES (10, 'D3', 2)");
  a.exec("INSERT INTO rutina_ejercicios (dia_id, ejercicio_id, orden) VALUES ((SELECT id FROM rutina_dias WHERE nombre = 'D3'), 'A', 0)");
  const doc = cambiosLocales(a, null).find(d => d.tipo === 'rutina');
  assert.equal(aplicarDocumento(b, doc), 'aplicado');
  assert.deepEqual(filas(b, 'SELECT nombre FROM rutina_dias ORDER BY orden').map(d => d.nombre), ['D1', 'D2', 'D3']);
  assert.equal(filas(b, 'SELECT * FROM rutina_ejercicios').length, 3);
  assert.equal(b.prepare('SELECT actualizado FROM rutinas').get().actualizado, doc.actualizado);
  esperar();
  a.exec('DELETE FROM rutina_dias WHERE orden > 0');
  const doc2 = cambiosLocales(a, null).find(d => d.tipo === 'rutina');
  assert.equal(aplicarDocumento(b, doc2), 'aplicado');
  assert.deepEqual(filas(b, 'SELECT nombre FROM rutina_dias').map(d => d.nombre), ['D1']);
  assert.equal(filas(b, 'SELECT * FROM rutina_ejercicios').length, 1);
});

test('un borrado remoto elimina el documento local sin dejar lápida que se re-suba', () => {
  const a = conDatos();
  const b = base();
  copiar(a, b);
  const corte = corteDb(a);
  esperar(10);
  a.exec('DELETE FROM sesiones WHERE id = 20');
  const doc = cambiosLocales(a, corte).find(d => d.tipo === 'sesion');
  assert.equal(doc.borrado, true);
  assert.equal(aplicarDocumento(b, doc), 'aplicado');
  assert.equal(filas(b, "SELECT 1 FROM sesiones WHERE estado = 'finalizada'").length, 0);
  assert.equal(filas(b, 'SELECT 1 FROM series_hechas').length, 0);
  assert.deepEqual(cambiosLocales(b, corte), []);
  assert.equal(aplicarDocumento(b, doc), 'ignorado');
});

test('un borrado más viejo que una edición local se ignora', () => {
  const a = conDatos();
  const b = base();
  copiar(a, b);
  const corte = corteDb(a);
  esperar(10);
  a.exec('DELETE FROM rutinas WHERE id = 10');
  const borrado = cambiosLocales(a, corte).find(d => d.tipo === 'rutina');
  esperar(10);
  b.exec("UPDATE rutinas SET nombre = 'Editada'");
  assert.equal(aplicarDocumento(b, borrado), 'ignorado');
  assert.equal(b.prepare('SELECT nombre FROM rutinas').get().nombre, 'Editada');
});

test('borrar una persona remota se lleva sus rutinas y sesiones y no deja lápidas por subir', () => {
  const a = conDatos();
  const b = base();
  copiar(a, b);
  const corte = corteDb(a);
  esperar(10);
  a.exec("DELETE FROM personas WHERE nombre = 'Ana'");
  const doc = cambiosLocales(a, corte).find(d => d.tipo === 'persona');
  assert.equal(aplicarDocumento(b, doc), 'aplicado');
  assert.equal(filas(b, "SELECT 1 FROM personas WHERE nombre = 'Ana'").length, 0);
  assert.equal(filas(b, 'SELECT 1 FROM rutinas').length, 0);
  assert.equal(filas(b, 'SELECT 1 FROM medidas').length, 0);
  assert.deepEqual(cambiosLocales(b, corte), []);
});

test('un borrado local más nuevo impide que reviva un documento remoto viejo', () => {
  const a = conDatos();
  const b = base();
  copiar(a, b);
  const doc = cambiosLocales(a, null).find(d => d.tipo === 'sesion');
  esperar(10);
  b.prepare('DELETE FROM sesiones WHERE uid = ?').run(doc.clave);
  assert.equal(aplicarDocumento(b, doc), 'ignorado');
  assert.equal(filas(b, 'SELECT 1 FROM sesiones WHERE uid = ?', doc.clave).length, 0);
});

test('un documento que depende de una persona ausente queda en espera', () => {
  const a = conDatos();
  const b = base();
  for (const tipo of ['rutina', 'sesion', 'medida', 'perfil', 'favorito'])
    assert.equal(aplicarDocumento(b, cambiosLocales(a, null).find(d => d.tipo === tipo)), 'en_espera', tipo);
  assert.equal(filas(b, 'SELECT 1 FROM sesiones').length, 0);
});

test('un ejercicio desconocido se omite sin romper la aplicación', () => {
  const a = conDatos();
  a.exec("INSERT INTO ejercicios (id, nombre) VALUES ('Z', 'Z')");
  a.exec("INSERT INTO sesion_ejercicios (sesion_id, ejercicio_id, orden) VALUES (20, 'Z', 1)");
  a.exec("INSERT INTO series_hechas (sesion_id, ejercicio_id, n, peso_kg, reps) VALUES (20, 'Z', 1, 10, 10)");
  a.exec("INSERT INTO rutina_ejercicios (dia_id, ejercicio_id, orden) VALUES (100, 'Z', 1)");
  a.exec(`INSERT INTO favoritos (persona_id, ejercicio_id) SELECT id, 'Z' FROM personas WHERE nombre = 'Ana'`);
  const b = base();
  const res = copiar(a, b);
  assert.ok(res.every(r => r !== 'en_espera'));
  assert.equal(filas(b, "SELECT 1 FROM sesion_ejercicios WHERE ejercicio_id = 'Z'").length, 0);
  assert.equal(filas(b, "SELECT 1 FROM series_hechas WHERE ejercicio_id = 'Z'").length, 0);
  assert.equal(filas(b, "SELECT 1 FROM rutina_ejercicios WHERE ejercicio_id = 'Z'").length, 0);
  assert.equal(filas(b, "SELECT 1 FROM favoritos WHERE ejercicio_id = 'Z'").length, 0);
  assert.equal(filas(b, 'SELECT 1 FROM series_hechas').length, 2);
});

test('aplicar documentos no genera cambios nuevos para subir', () => {
  const a = conDatos();
  const b = base();
  const antes = new Date().toISOString();
  esperar(10);
  copiar(a, b);
  const recibidos = cambiosLocales(a, null);
  for (const d of cambiosLocales(b, antes).filter(x => x.tipo !== 'persona' || x.datos.nombre === 'Ana')) {
    const origen = recibidos.find(x => x.tipo === d.tipo && x.clave === d.clave);
    assert.equal(d.actualizado, origen.actualizado, `${d.tipo} ${d.clave}`);
  }
  // reaplicar lo mismo más tarde no cambia nada
  esperar(10);
  const despues = new Date().toISOString();
  esperar(10);
  copiar(a, b);
  assert.deepEqual(cambiosLocales(b, despues), []);
});

test('medida y perfil se actualizan en su lugar', () => {
  const a = conDatos();
  const b = base();
  copiar(a, b);
  esperar();
  a.exec('UPDATE medidas SET peso_kg = 99');
  a.exec('UPDATE perfil SET altura = 190');
  for (const d of cambiosLocales(a, null).filter(d => d.tipo === 'medida' || d.tipo === 'perfil'))
    assert.equal(aplicarDocumento(b, d), 'aplicado');
  assert.equal(b.prepare('SELECT peso_kg FROM medidas').get().peso_kg, 99);
  assert.equal(b.prepare(`SELECT altura FROM perfil WHERE persona_id = ${ANA}`).get().altura, 190);
  assert.deepEqual(snapshot(b).medidas, snapshot(a).medidas);
  assert.deepEqual(snapshot(b).perfil, snapshot(a).perfil);
});

test('los hijos de una sesión aplicada no vuelven a marcar la sesión', () => {
  const a = conDatos();
  const b = base();
  copiar(a, b);
  const sa = a.prepare('SELECT actualizado FROM sesiones WHERE id = 20').get().actualizado;
  const sb = b.prepare("SELECT actualizado FROM sesiones WHERE estado = 'finalizada'").get().actualizado;
  assert.equal(sb, sa);
});

test('una sesión cuya rutina todavía no llegó queda en espera; si la borré yo, se aplica sin rutina', () => {
  const a = conDatos();
  const b = base();
  const orden = ['persona', 'rutina', 'sesion'];
  const docs = cambiosLocales(a, null).sort((x, y) => orden.indexOf(x.tipo) - orden.indexOf(y.tipo));
  const sesion = docs.find(d => d.tipo === 'sesion');
  const rutina = docs.find(d => d.tipo === 'rutina');
  aplicarDocumento(b, docs.find(d => d.tipo === 'persona' && d.datos.nombre === 'Ana'));
  assert.equal(aplicarDocumento(b, sesion), 'en_espera');
  assert.equal(aplicarDocumento(b, rutina), 'aplicado');
  b.prepare('DELETE FROM rutinas WHERE uid = ?').run(rutina.clave); // lápida local
  esperar(10);
  const nueva = { ...sesion, actualizado: new Date().toISOString() };
  assert.equal(aplicarDocumento(b, nueva), 'degradado');
  assert.equal(b.prepare('SELECT rutina_id FROM sesiones WHERE uid = ?').get(sesion.clave).rutina_id, null);
  // Quedó distinta del documento: se estampa más nueva para que se suba y todos converjan.
  assert.ok(b.prepare('SELECT actualizado FROM sesiones WHERE uid = ?').get(sesion.clave).actualizado > nueva.actualizado);
});

test('un día fuera de rango deja la sesión sin día pero la aplica', () => {
  const a = conDatos();
  const b = base();
  copiar(a, b);
  esperar(10);
  const s = cambiosLocales(a, null).find(d => d.tipo === 'sesion');
  const doc = { ...s, actualizado: new Date().toISOString(), datos: { ...s.datos, dia_posicion: 9 } };
  assert.equal(aplicarDocumento(b, doc), 'degradado');
  assert.equal(b.prepare('SELECT dia_id FROM sesiones WHERE uid = ?').get(s.clave).dia_id, null);
  assert.ok(b.prepare('SELECT actualizado FROM sesiones WHERE uid = ?').get(s.clave).actualizado > doc.actualizado);
});

test('un borrado remoto de persona no pisa ediciones locales más nuevas', () => {
  const a = conDatos();
  const b = base();
  copiar(a, b);
  const corte = corteDb(a);
  esperar(10);
  a.exec("DELETE FROM personas WHERE nombre = 'Ana'");
  const borrado = cambiosLocales(a, corte).find(d => d.tipo === 'persona');
  esperar(10);
  b.exec("UPDATE rutinas SET nombre = 'Sobrevive'");
  assert.equal(aplicarDocumento(b, borrado), 'ignorado');
  assert.equal(b.prepare('SELECT nombre FROM rutinas').get().nombre, 'Sobrevive');
  const p = cambiosLocales(b, corte).find(d => d.tipo === 'persona' && d.datos.nombre === 'Ana');
  assert.ok(p && !p.borrado && p.actualizado > borrado.actualizado);
});

test('aplicarDocumento funciona dentro de una transacción externa', () => {
  const a = conDatos();
  const b = base();
  b.exec('BEGIN');
  const orden = ['persona', 'rutina', 'sesion', 'medida', 'perfil', 'favorito'];
  for (const d of cambiosLocales(a, null).sort((x, y) => orden.indexOf(x.tipo) - orden.indexOf(y.tipo)))
    aplicarDocumento(b, d);
  assert.equal(b.isTransaction, true);
  // un fallo dentro revierte solo ese documento
  const malo = cambiosLocales(a, null).find(d => d.tipo === 'medida');
  assert.throws(() => aplicarDocumento(b, { ...malo, actualizado: '9999', datos: { ...malo.datos, fecha: null } }));
  assert.equal(b.isTransaction, true);
  b.exec('COMMIT');
  assert.equal(filas(b, 'SELECT 1 FROM rutinas').length, 1);
  assert.equal(aplicarDocumento(b, cambiosLocales(a, null).find(d => d.tipo === 'rutina')), 'ignorado');
  assert.equal(b.isTransaction, false);
});

test('con la persona borrada localmente: lo anterior al borrado se ignora y lo posterior espera (la persona puede revivir)', () => {
  const a = conDatos();
  const b = base();
  copiar(a, b);
  b.exec("DELETE FROM personas WHERE nombre = 'Ana'");
  for (const tipo of ['rutina', 'sesion', 'medida', 'perfil', 'favorito']) {
    const d = cambiosLocales(a, null).find(x => x.tipo === tipo);
    assert.equal(aplicarDocumento(b, { ...d, actualizado: '0000' }), 'ignorado', tipo);
    assert.equal(aplicarDocumento(b, { ...d, actualizado: '9999' }), 'en_espera', tipo);
  }
});

test('los días de una rutina se escriben con orden normalizado', () => {
  const a = conDatos();
  const b = base();
  const orden = ['persona', 'rutina'];
  const docs = cambiosLocales(a, null).sort((x, y) => orden.indexOf(x.tipo) - orden.indexOf(y.tipo));
  for (const d of docs) {
    if (d.tipo === 'rutina') d.datos.dias.forEach(x => { x.orden = 0; });
    if (d.tipo === 'persona' || d.tipo === 'rutina') aplicarDocumento(b, d);
  }
  assert.deepEqual(filas(b, 'SELECT nombre, orden FROM rutina_dias ORDER BY orden').map(x => [x.nombre, x.orden]), [['D1', 0], ['D2', 1]]);
});

// ---------- borrado de personas ----------

test('borrar una persona local deja lápida de ella y de todo lo suyo con la misma fecha, y la anota como muerta', () => {
  const db = conDatos();
  const corte = corteDb(db);
  esperar(10);
  const ana = uidPersona(db, 'Ana');
  db.exec("DELETE FROM personas WHERE nombre = 'Ana'");
  const borrados = cambiosLocales(db, corte).filter(d => d.borrado);
  assert.deepEqual(borrados.map(d => d.tipo).sort(), ['favorito', 'medida', 'perfil', 'persona', 'rutina', 'sesion', 'sesion']);
  assert.equal(new Set(borrados.map(d => d.actualizado)).size, 1);
  assert.equal(filas(db, 'SELECT fecha FROM sync_muertas WHERE persona = ?', ana)[0].fecha, borrados[0].actualizado);
});

test('un borrado remoto de una persona que nunca estuvo acá la anota como muerta: sus hijos viejos se ignoran y los nuevos esperan', () => {
  const a = conDatos();
  const b = base();
  const docs = cambiosLocales(a, null);
  const persona = docs.find(d => d.tipo === 'persona' && d.datos.nombre === 'Ana');
  const rutina = docs.find(d => d.tipo === 'rutina');
  const T = '2026-06-01T00:00:00.000Z';
  assert.equal(aplicarDocumento(b, { tipo: 'persona', clave: persona.clave, actualizado: T, borrado: true, datos: null }), 'ignorado');
  assert.equal(aplicarDocumento(b, { ...rutina, actualizado: '2026-05-01T00:00:00.000Z' }), 'ignorado');
  assert.equal(aplicarDocumento(b, { ...rutina, actualizado: T }), 'ignorado');
  assert.equal(aplicarDocumento(b, { ...rutina, actualizado: '2026-07-01T00:00:00.000Z' }), 'en_espera');
  // La persona viva más nueva la revive y limpia el registro; una más vieja o igual al borrado no.
  assert.equal(aplicarDocumento(b, { ...persona, actualizado: T }), 'ignorado');
  assert.equal(aplicarDocumento(b, { ...persona, actualizado: '2026-06-02T00:00:00.000Z' }), 'degradado');
  // Revivió sobre un borrado que el documento no declaraba: queda re-estampada (para subirla con `muerta_desde`).
  assert.deepEqual(filas(b, 'SELECT fecha, viva FROM sync_muertas'), [{ fecha: T, viva: 1 }]);
  assert.equal(cambiosLocales(b, null).find(d => d.tipo === 'persona' && d.clave === persona.clave).datos.muerta_desde, T);
  assert.equal(aplicarDocumento(b, { ...rutina, actualizado: '2026-07-01T00:00:00.000Z' }), 'aplicado');
});

test('un borrado remoto con hijos locales más nuevos revive la persona y mata lo anterior con lápida de la fecha del borrado', () => {
  const a = conDatos();
  const b = base();
  copiar(a, b);
  const ana = uidPersona(b, 'Ana');
  esperar(10);
  const T = corteDb(b);
  esperar(10);
  b.exec("UPDATE rutinas SET nombre = 'nueva' WHERE nombre = 'R1'"); // posterior al borrado
  b.exec("UPDATE medidas SET peso_kg = 99"); // otra, también posterior
  // Una sesión y un favorito anteriores al borrado: mueren.
  b.exec("UPDATE sesiones SET actualizado = '2000-01-01T00:00:00.000Z'; UPDATE favoritos SET actualizado = '2000-01-01T00:00:00.000Z'; UPDATE perfil SET actualizado = '2000-01-01T00:00:00.000Z'");
  assert.equal(aplicarDocumento(b, { tipo: 'persona', clave: ana, actualizado: T, borrado: true, datos: null }), 'ignorado');
  const vivo = filas(b, 'SELECT actualizado FROM personas WHERE uid = ?', ana)[0];
  assert.ok(vivo.actualizado > T, 'la persona se re-estampa con el reloj de la base');
  assert.equal(filas(b, 'SELECT 1 FROM rutinas').length, 1);
  assert.equal(filas(b, 'SELECT 1 FROM medidas').length, 1);
  assert.equal(filas(b, "SELECT 1 FROM sesiones WHERE estado = 'finalizada'").length, 0);
  assert.equal(filas(b, 'SELECT 1 FROM favoritos').length, 0);
  assert.equal(filas(b, 'SELECT 1 FROM perfil').length, 0);
  const lapidas = filas(b, 'SELECT tipo, fecha FROM sync_borrados').filter(l => l.tipo !== 'persona');
  assert.ok(lapidas.length >= 3 && lapidas.every(l => l.fecha === T), JSON.stringify(lapidas));
  assert.deepEqual(filas(b, 'SELECT fecha, viva FROM sync_muertas'), [{ fecha: T, viva: 1 }]);
  // Y lo declara en su documento, para que los demás maten lo anterior aunque no hayan visto el borrado.
  assert.equal(cambiosLocales(b, null).find(d => d.tipo === 'persona' && d.clave === ana).datos.muerta_desde, T);
});

test('borrar una persona remota deja la persona muerta con la fecha del borrado y ninguna lápida por subir', () => {
  const a = conDatos();
  const b = base();
  copiar(a, b);
  const ana = uidPersona(a, 'Ana');
  esperar(10);
  const corte = corteDb(b);
  esperar(10);
  const T = corteDb(b);
  assert.equal(aplicarDocumento(b, { tipo: 'persona', clave: ana, actualizado: T, borrado: true, datos: null }), 'aplicado');
  assert.deepEqual(cambiosLocales(b, corte).filter(d => d.borrado), []);
  assert.equal(filas(b, 'SELECT fecha FROM sync_muertas WHERE persona = ?', ana)[0].fecha, T);
});
