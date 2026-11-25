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
before(async () => {
  s = await servidorDePrueba({
    backupsDir, dbFile: path.join(dir, 'mi_gym.db'), lan: true, port: 8788, ahora: () => new Date(ahora),
    direcciones: puerto => [`http://192.168.1.50:${puerto}`],
  });
});
after(() => { s.cerrar(); fs.rmSync(dir, { recursive: true, force: true }); });

const tablas = ['rutinas', 'rutina_dias', 'rutina_ejercicios', 'sesiones', 'sesion_ejercicios', 'series_hechas', 'medidas', 'perfil', 'ajustes'];
const foto = () => ({
  ...Object.fromEntries(tablas.map(t => [t, s.db.prepare(`SELECT * FROM ${t}`).all().map(f => ({ ...f }))])),
  ej: s.db.prepare('SELECT id, favorito, media_propia FROM ejercicios WHERE favorito != 0 OR media_propia IS NOT NULL ORDER BY id').all().map(f => ({ ...f })),
});

async function sembrar() {
  const r = (await s.pedir('/api/rutinas', { method: 'POST', body: { nombre: 'Fuerza', dias: ['Día A'] } })).json;
  await s.pedir(`/api/rutinas/${r.id}/dias/${r.dias[0].id}/ejercicios`, { method: 'POST', body: { ejercicio_id: 'Barbell_Squat', series: 3, reps: '8' } });
  const ses = (await s.pedir('/api/sesiones', { method: 'POST', body: { dia_id: r.dias[0].id } })).json;
  await s.pedir(`/api/sesiones/${ses.id}/series/Barbell_Squat/1`, { method: 'PATCH', body: { peso_kg: 100, reps: 8, hecha: true } });
  await s.pedir(`/api/sesiones/${ses.id}/finalizar`, { method: 'POST', body: {} });
  await s.pedir('/api/medidas', { method: 'POST', body: { fecha: '2026-11-20', peso_kg: 80.5 } });
  await s.pedir('/api/perfil', { method: 'PUT', body: { altura: 178, sexo: 'hombre' } });
  s.db.prepare("INSERT OR REPLACE INTO ajustes (clave, valor) VALUES ('descanso', '120')").run();
  s.db.prepare("UPDATE ejercicios SET favorito = 1 WHERE id = 'Pushups'").run();
  s.db.prepare("UPDATE ejercicios SET media_propia = 'Bench_Press.gif' WHERE id = 'Bench_Press'").run();
}

test('/api/info informa dónde viven los datos y las direcciones LAN con QR', async () => {
  const r = await s.pedir('/api/info');
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
  const r = await s.pedir('/api/respaldo/exportar');
  assert.equal(r.status, 200);
  const datos = r.json;
  assert.equal(datos.schema_version, 4);
  assert.equal(datos.fecha, '2026-11-25T10:00:00.000Z');
  for (const t of tablas) assert.ok(Array.isArray(datos[t]), t);
  assert.equal(datos.rutinas.length, 1);
  assert.ok(datos.series_hechas.length >= 1);
  assert.deepEqual(datos.ejercicios.map(e => e.id), ['Bench_Press', 'Pushups']);
  const res = await fetch(s.base + '/api/respaldo/exportar');
  assert.match(res.headers.get('content-disposition'), /attachment; filename="mi-gym-2026-11-25\.json"/);
});

test('ida y vuelta: exportar, borrar todo e importar deja los datos idénticos', async () => {
  const antes = foto();
  const archivo = (await s.pedir('/api/respaldo/exportar')).json;
  for (const t of [...tablas].reverse()) s.db.exec(`DELETE FROM ${t}`);
  s.db.exec('UPDATE ejercicios SET favorito = 0, media_propia = NULL');
  assert.equal(foto().rutinas.length, 0);
  const r = await s.pedir('/api/respaldo/importar', { method: 'POST', body: archivo });
  assert.equal(r.status, 200);
  assert.match(r.json.respaldo_previo, /^mi_gym-.*\.db$/);
  assert.deepEqual(foto(), antes);
  assert.ok(fs.existsSync(path.join(backupsDir, r.json.respaldo_previo)), 'hizo el respaldo de seguridad primero');
});

test('importar reemplaza lo que había, no lo mezcla', async () => {
  const archivo = (await s.pedir('/api/respaldo/exportar')).json;
  await s.pedir('/api/medidas', { method: 'POST', body: { fecha: '2026-11-24', peso_kg: 99 } });
  s.db.prepare("UPDATE ejercicios SET favorito = 1 WHERE id = 'Dumbbell_Curl'").run();
  await s.pedir('/api/respaldo/importar', { method: 'POST', body: archivo });
  assert.equal(s.db.prepare('SELECT COUNT(*) n FROM medidas').get().n, 1);
  assert.equal(s.db.prepare("SELECT favorito FROM ejercicios WHERE id = 'Dumbbell_Curl'").get().favorito, 0);
});

test('importar rechaza archivos inválidos sin tocar nada', async () => {
  const antes = foto();
  const bueno = (await s.pedir('/api/respaldo/exportar')).json;
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
    const r = await s.pedir('/api/respaldo/importar', { method: 'POST', body: cuerpo });
    assert.equal(r.status, status, JSON.stringify(cuerpo).slice(0, 60));
    assert.ok(r.json.error);
  }
  const mala = await s.pedir('/api/respaldo/importar', { method: 'POST', body: '{no es json' });
  assert.equal(mala.status, 400);
  assert.deepEqual(foto(), antes);
});

test('hacer un respaldo ahora lo agrega a la lista', async () => {
  const r = await s.pedir('/api/respaldo/ahora', { method: 'POST' });
  assert.equal(r.status, 201);
  assert.match(r.json.archivo, /^mi_gym-20261125-1000\.db$/);
  const lista = (await s.pedir('/api/respaldo/lista')).json;
  const item = lista.find(b => b.archivo === r.json.archivo);
  assert.ok(item && item.tamano > 0 && item.fecha);
  assert.equal((await s.pedir('/api/info')).json.ultimo_respaldo, lista[0].fecha);
});

test('restaurar vuelve a un respaldo y guarda antes el estado actual', async () => {
  const antes = foto();
  const { archivo } = (await s.pedir('/api/respaldo/ahora', { method: 'POST' })).json;
  await s.pedir('/api/medidas', { method: 'POST', body: { fecha: '2026-11-23', peso_kg: 70 } });
  s.db.prepare('DELETE FROM rutinas').run();
  ahora = new Date(ahora.getTime() + 5 * 60000);
  const r = await s.pedir('/api/respaldo/restaurar', { method: 'POST', body: { archivo } });
  assert.equal(r.status, 200);
  assert.ok(r.json.respaldo_previo && r.json.respaldo_previo !== archivo);
  assert.deepEqual(foto(), antes);
});

test('restaurar rechaza nombres que no están en la lista (sin salirse de la carpeta)', async () => {
  fs.writeFileSync(path.join(dir, 'secreto.db'), 'x');
  for (const archivo of ['../secreto.db', '..\\secreto.db', path.join(dir, 'secreto.db'), 'mi_gym-inexistente.db', '', null, 42, undefined]) {
    const r = await s.pedir('/api/respaldo/restaurar', { method: 'POST', body: { archivo } });
    assert.equal(r.status, 404, String(archivo));
  }
  const sinCuerpo = await s.pedir('/api/respaldo/restaurar', { method: 'POST' });
  assert.equal(sinCuerpo.status, 404);
});

test('restaurar rechaza un archivo de la carpeta que no es una base válida', async () => {
  fs.writeFileSync(path.join(backupsDir, 'roto.db'), 'basura');
  const r = await s.pedir('/api/respaldo/restaurar', { method: 'POST', body: { archivo: 'roto.db' } });
  assert.equal(r.status, 400);
});
