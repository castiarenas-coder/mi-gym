import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { openDb } from '../server/db.js';
import { backupDb, listarBackups, restoreDb } from '../server/backup.js';

function tmp() { return fs.mkdtempSync(path.join(os.tmpdir(), 'migym-')); }

test('backupDb copia la base y rota dejando los últimos N', () => {
  const dir = tmp();
  const db = openDb(path.join(dir, 'a.db'));
  db.prepare("INSERT INTO medidas (persona_id, fecha, peso_kg) VALUES (1, '2026-01-01', 80)").run();
  for (let i = 1; i <= 4; i++) backupDb(db, path.join(dir, 'b'), { keep: 3, now: new Date(Date.UTC(2026, 0, i, 10, 0)) });
  const lista = listarBackups(path.join(dir, 'b'));
  assert.equal(lista.length, 3);
  assert.equal(lista[0], 'mi_gym-20260102-1000.db');
  const copia = openDb(path.join(dir, 'b', lista[0]));
  assert.equal(copia.prepare('SELECT peso_kg FROM medidas').get().peso_kg, 80);
  copia.close(); db.close();
});

test('restoreDb vuelve a un respaldo y guarda la base previa', () => {
  const dir = tmp();
  const file = path.join(dir, 'a.db');
  let db = openDb(file);
  db.prepare("INSERT INTO medidas (persona_id, fecha, peso_kg) VALUES (1, '2026-01-01', 80)").run();
  const bk = backupDb(db, path.join(dir, 'b'));
  db.prepare("INSERT INTO medidas (persona_id, fecha, peso_kg) VALUES (1, '2026-01-02', 81)").run();
  db.close();
  restoreDb(bk, file, path.join(dir, 'b'));
  db = openDb(file);
  assert.equal(db.prepare('SELECT COUNT(*) n FROM medidas').get().n, 1);
  db.close();
  assert.ok(fs.readdirSync(path.join(dir, 'b')).some(f => f.startsWith('previo-a-restaurar')));
});

test('restoreDb rechaza un archivo que no es un respaldo', () => {
  const dir = tmp();
  fs.writeFileSync(path.join(dir, 'x.db'), 'basura');
  assert.throws(() => restoreDb(path.join(dir, 'x.db'), path.join(dir, 'a.db'), path.join(dir, 'b')));
});

test('backupDb nunca pisa un respaldo del mismo minuto y la rotación conserva los más nuevos', () => {
  const dir = tmp();
  const db = openDb(path.join(dir, 'a.db'));
  const destino = path.join(dir, 'b');
  const ahora = new Date(Date.UTC(2026, 0, 1, 10, 0, 5));
  const a = backupDb(db, destino, { now: ahora });
  db.prepare("INSERT INTO medidas (persona_id, fecha, peso_kg) VALUES (1, '2026-01-01', 80)").run();
  const b = backupDb(db, destino, { now: ahora });
  assert.notEqual(a, b);
  const lista = listarBackups(destino);
  assert.equal(lista.length, 2);
  assert.ok(lista.every(f => /^mi_gym-.*.db$/.test(f)));
  const primero = openDb(a);
  assert.equal(primero.prepare('SELECT COUNT(*) n FROM medidas').get().n, 0);
  primero.close();
  const c = backupDb(db, destino, { now: ahora, keep: 2 });
  assert.equal(listarBackups(destino).length, 2);
  assert.ok(fs.existsSync(c) && fs.existsSync(b) && !fs.existsSync(a));
  db.close();
});
