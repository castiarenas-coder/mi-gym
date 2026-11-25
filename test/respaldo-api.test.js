import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { servidorDePrueba } from './helpers.js';

const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'migym-resp-'));
const backupsDir = path.join(dir, 'backups');
let ahora = new Date(Date.UTC(2026, 10, 25, 10, 0, 0));
let s;
// Con más de una persona, las rutas con alcance piden X-Persona: acá "Yo" es la persona 1.
const pedir = (ruta, init = {}) => s.pedir(ruta, { ...init, headers: { 'X-Persona': '1', ...init.headers } });
before(async () => {
  s = await servidorDePrueba({
    backupsDir, dbFile: path.join(dir, 'mi_gym.db'), lan: true, port: 8788, ahora: () => new Date(ahora),
    direcciones: puerto => [`http://192.168.1.50:${puerto}`],
  });
});
after(() => { s.cerrar(); fs.rmSync(dir, { recursive: true, force: true }); });

const tablas = ['personas', 'rutinas', 'rutina_dias', 'rutina_ejercicios', 'sesiones', 'sesion_ejercicios', 'series_hechas', 'medidas', 'perfil', 'favoritos', 'ajustes'];
const foto = () => ({
  ...Object.fromEntries(tablas.map(t => [t, s.db.prepare(`SELECT * FROM ${t}`).all().map(f => ({ ...f }))])),
  ej: s.db.prepare('SELECT id, media_propia FROM ejercicios WHERE media_propia IS NOT NULL ORDER BY id').all().map(f => ({ ...f })),
});

async function sembrar() {
  const r = (await pedir('/api/rutinas', { method: 'POST', body: { nombre: 'Fuerza', dias: ['Día A'] } })).json;
  await pedir(`/api/rutinas/${r.id}/dias/${r.dias[0].id}/ejercicios`, { method: 'POST', body: { ejercicio_id: 'Barbell_Squat', series: 3, reps: '8' } });
  const ses = (await pedir('/api/sesiones', { method: 'POST', body: { dia_id: r.dias[0].id } })).json;
  await pedir(`/api/sesiones/${ses.id}/series/Barbell_Squat/1`, { method: 'PATCH', body: { peso_kg: 100, reps: 8, hecha: true } });
  await pedir(`/api/sesiones/${ses.id}`, { method: 'PATCH', body: { finalizar: true } });
  await pedir('/api/medidas', { method: 'POST', body: { fecha: '2026-11-20', peso_kg: 80.5 } });
  await pedir('/api/perfil', { method: 'PUT', body: { altura_cm: 178, sexo: 'hombre' } });
  // Una segunda persona, con sus propias rutinas, sesión en grupo, medidas, perfil y favoritos.
  const ana = (await pedir('/api/personas', { method: 'POST', body: { nombre: 'Ana', color: '#ff7a1a', avatar: '🦊' } })).json.id;
  const grupo = (await pedir('/api/sesiones', { method: 'POST', body: { dia_id: r.dias[0].id, acompanantes: [ana] } })).json;
  const deAna = grupo.grupo.miembros.find(m => m.persona.id === ana).sesion_id;
  await pedir(`/api/sesiones/${deAna}/series/Barbell_Squat/1`, { method: 'PATCH', body: { peso_kg: 50, reps: 10, hecha: true } });
  await pedir(`/api/sesiones/${grupo.id}`, { method: 'PATCH', body: { finalizar: true } });
  await pedir('/api/medidas', { method: 'POST', body: { fecha: '2026-11-20', peso_kg: 60 }, headers: { 'X-Persona': String(ana) } });
  await pedir('/api/perfil', { method: 'PUT', body: { altura_cm: 165 }, headers: { 'X-Persona': String(ana) } });
  await pedir('/api/ejercicios/Pushups', { method: 'PATCH', body: { favorito: true }, headers: { 'X-Persona': String(ana) } });
  s.db.prepare("INSERT OR REPLACE INTO ajustes (clave, valor) VALUES ('descanso', '120')").run();
  s.db.prepare("INSERT INTO favoritos (persona_id, ejercicio_id) VALUES (1, 'Pushups')").run();
  s.db.prepare("UPDATE ejercicios SET media_propia = 'Bench_Press.gif' WHERE id = 'Bench_Press'").run();
}

test('/api/info informa dónde viven los datos y las direcciones LAN con QR', async () => {
  const r = await pedir('/api/info');
  assert.equal(r.status, 200);
  assert.equal(r.json.version, '9.9.9');
  assert.equal(r.json.db, path.join(dir, 'mi_gym.db'));
  assert.equal(r.json.respaldos_dir, backupsDir);
  assert.equal(r.json.ultimo_respaldo, null);
  assert.equal(r.json.lan, true);
  assert.deepEqual(r.json.urls, ['http://192.168.1.50:8788']);
  assert.match(r.json.qr, /^<svg/);
});

test('exportar devuelve todo como descarga JSON con versión y fecha', async () => {
  await sembrar();
  const r = await pedir('/api/respaldo/exportar');
  assert.equal(r.status, 200);
  const datos = r.json;
  assert.equal(datos.schema_version, 5);
  assert.equal(datos.fecha, '2026-11-25T10:00:00.000Z');
  for (const t of tablas) assert.ok(Array.isArray(datos[t]), t);
  assert.equal(datos.rutinas.length, 1 + 2, 'la rutina propia más las 2 de ejemplo de la persona nueva');
  assert.deepEqual(datos.personas.map(p => p.nombre), ['Yo', 'Ana']);
  assert.deepEqual(datos.favoritos.map(f => [f.persona_id, f.ejercicio_id]).sort(), [[1, 'Pushups'], [2, 'Pushups']]);
  assert.equal(datos.sesiones.filter(x => x.grupo).length, 2, 'las dos sesiones del grupo conservan su grupo');
  assert.ok(datos.series_hechas.length >= 1);
  assert.deepEqual(datos.ejercicios.map(e => e.id), ['Bench_Press']);
  const res = await fetch(s.base + '/api/respaldo/exportar');
  assert.match(res.headers.get('content-disposition'), /attachment; filename="mi-gym-2026-11-25\.json"/);
});

test('ida y vuelta: exportar, borrar todo e importar deja los datos idénticos', async () => {
  const antes = foto();
  const archivo = (await pedir('/api/respaldo/exportar')).json;
  for (const t of [...tablas].reverse()) s.db.exec(`DELETE FROM ${t}`);
  s.db.exec('UPDATE ejercicios SET media_propia = NULL');
  assert.equal(foto().rutinas.length, 0);
  const r = await pedir('/api/respaldo/importar', { method: 'POST', body: archivo });
  assert.equal(r.status, 200);
  assert.match(r.json.respaldo_previo, /^mi_gym-.*\.db$/);
  assert.deepEqual(foto(), antes);
  assert.ok(fs.existsSync(path.join(backupsDir, r.json.respaldo_previo)), 'hizo el respaldo de seguridad primero');
});

test('importar reemplaza lo que había, no lo mezcla', async () => {
  const archivo = (await pedir('/api/respaldo/exportar')).json;
  await pedir('/api/medidas', { method: 'POST', body: { fecha: '2026-11-24', peso_kg: 99 } });
  s.db.prepare("INSERT INTO favoritos (persona_id, ejercicio_id) VALUES (1, 'Dumbbell_Curl')").run();
  await pedir('/api/respaldo/importar', { method: 'POST', body: archivo });
  assert.equal(s.db.prepare('SELECT COUNT(*) n FROM medidas').get().n, 2, 'una medida por persona');
  assert.equal(s.db.prepare("SELECT COUNT(*) n FROM favoritos WHERE ejercicio_id = 'Dumbbell_Curl'").get().n, 0);
});

test('importar rechaza archivos inválidos sin tocar nada', async () => {
  const antes = foto();
  const bueno = (await pedir('/api/respaldo/exportar')).json;
  const casos = [
    [{ hola: 1 }, 400],
    [[1, 2], 400],
    [{ ...bueno, app: 'otra' }, 400],
    [{ ...bueno, schema_version: undefined }, 400],
    [{ ...bueno, medidas: 'x' }, 400],
    [{ ...bueno, schema_version: bueno.schema_version + 1 }, 409],
    [{ ...bueno, schema_version: bueno.schema_version - 1 }, 409],
    [{ ...bueno, series_hechas: [{ sesion_id: 1, ejercicio_id: 'No_Existe', n: 1 }] }, 400],
  ];
  for (const [cuerpo, status] of casos) {
    const r = await pedir('/api/respaldo/importar', { method: 'POST', body: cuerpo });
    assert.equal(r.status, status, JSON.stringify(cuerpo).slice(0, 60));
    assert.ok(r.json.error);
  }
  const mala = await pedir('/api/respaldo/importar', { method: 'POST', body: '{no es json' });
  assert.equal(mala.status, 400);
  assert.deepEqual(foto(), antes);
});

test('hacer un respaldo ahora lo agrega a la lista', async () => {
  const r = await pedir('/api/respaldo/ahora', { method: 'POST' });
  assert.equal(r.status, 201);
  assert.match(r.json.archivo, /^mi_gym-20261125-1000\.db$/);
  const lista = (await pedir('/api/respaldo/lista')).json;
  const item = lista.find(b => b.archivo === r.json.archivo);
  assert.ok(item && item.tamano > 0 && item.fecha);
  assert.equal((await pedir('/api/info')).json.ultimo_respaldo, lista[0].fecha);
});

test('restaurar vuelve a un respaldo y guarda antes el estado actual', async () => {
  const antes = foto();
  const { archivo } = (await pedir('/api/respaldo/ahora', { method: 'POST' })).json;
  await pedir('/api/medidas', { method: 'POST', body: { fecha: '2026-11-23', peso_kg: 70 } });
  s.db.prepare('DELETE FROM rutinas').run();
  ahora = new Date(ahora.getTime() + 5 * 60000);
  const r = await pedir('/api/respaldo/restaurar', { method: 'POST', body: { archivo } });
  assert.equal(r.status, 200);
  assert.ok(r.json.respaldo_previo && r.json.respaldo_previo !== archivo);
  assert.deepEqual(foto(), antes);
});

test('restaurar rechaza nombres que no están en la lista (sin salirse de la carpeta)', async () => {
  fs.writeFileSync(path.join(dir, 'secreto.db'), 'x');
  for (const archivo of ['../secreto.db', '..\\secreto.db', path.join(dir, 'secreto.db'), 'mi_gym-inexistente.db', '', null, 42, undefined]) {
    const r = await pedir('/api/respaldo/restaurar', { method: 'POST', body: { archivo } });
    assert.equal(r.status, 404, String(archivo));
  }
  const sinCuerpo = await pedir('/api/respaldo/restaurar', { method: 'POST' });
  assert.equal(sinCuerpo.status, 404);
});

test('restaurar rechaza un archivo de la carpeta que no es una base válida', async () => {
  fs.writeFileSync(path.join(backupsDir, 'roto.db'), 'basura');
  const r = await pedir('/api/respaldo/restaurar', { method: 'POST', body: { archivo: 'roto.db' } });
  assert.equal(r.status, 400);
});
