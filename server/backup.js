// Respaldo de la base: copia consistente con VACUUM INTO + rotación de los últimos N.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { DatabaseSync } from 'node:sqlite';
import { config } from './config.js';

export function listarBackups(backupsDir) {
  if (!fs.existsSync(backupsDir)) return [];
  return fs.readdirSync(backupsDir).filter(f => /^mi_gym-.*\.db$/.test(f)).sort();
}

export function backupDb(db, backupsDir, { keep = 30, now = new Date() } = {}) {
  fs.mkdirSync(backupsDir, { recursive: true });
  const stamp = now.toISOString().slice(0, 16).replace(/[-:]/g, '').replace('T', '-');
  const target = path.join(backupsDir, `mi_gym-${stamp}.db`);
  fs.rmSync(target, { force: true });
  db.exec(`VACUUM INTO '${target.replace(/'/g, "''")}'`);
  const todos = listarBackups(backupsDir);
  for (const viejo of todos.slice(0, Math.max(0, todos.length - keep))) fs.rmSync(path.join(backupsDir, viejo), { force: true });
  return target;
}

// Restaura un respaldo sobre la base actual. Antes guarda la actual como "previo-a-restaurar".
export function restoreDb(backupFile, dbFile, backupsDir) {
  if (!fs.existsSync(backupFile)) throw new Error(`No existe el respaldo: ${backupFile}`);
  const prueba = new DatabaseSync(backupFile);
  try { prueba.prepare('SELECT COUNT(*) FROM ejercicios').get(); } finally { prueba.close(); }
  if (fs.existsSync(dbFile)) {
    fs.mkdirSync(backupsDir, { recursive: true });
    fs.copyFileSync(dbFile, path.join(backupsDir, `previo-a-restaurar-${Date.now()}.db`));
  }
  for (const ext of ['-wal', '-shm']) fs.rmSync(dbFile + ext, { force: true });
  fs.copyFileSync(backupFile, dbFile);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const { openDb } = await import('./db.js');
  if (process.argv[2] === 'restore') {
    const lista = listarBackups(config.backupsDir);
    const elegido = process.argv[3] ? path.resolve(process.argv[3]) : lista.length ? path.join(config.backupsDir, lista.at(-1)) : null;
    if (!elegido) { console.error('No hay respaldos para restaurar.'); process.exit(1); }
    restoreDb(elegido, config.dbFile, config.backupsDir);
    console.log(`Restaurado: ${elegido}`);
  } else {
    const db = openDb(config.dbFile);
    console.log(`Respaldo creado: ${backupDb(db, config.backupsDir)}`);
    db.close();
  }
}
