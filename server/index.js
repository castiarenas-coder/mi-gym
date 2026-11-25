import fs from 'node:fs';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import { config } from './config.js';
import { openDb } from './db.js';
import { createApp, leerVersion } from './app.js';
import { backupDb } from './backup.js';
import { sembrarPlantillas } from './plantillas.js';
import { cargarCatalogoEmpaquetado } from './catalogo.js';
import { escucharEnLibre } from './puerto.js';

const lan = process.argv.includes('--lan');
const host = lan ? '0.0.0.0' : '127.0.0.1';

const db = openDb(config.dbFile);
// Catálogo que viaja con la instalación: se carga solo, sin internet, antes de crear las rutinas de ejemplo.
try {
  const r = cargarCatalogoEmpaquetado(db, config.catalogoDir);
  if (r.cargado) console.log(`Catálogo cargado: ${r.total} ejercicios`);
} catch (err) { console.error('[catalogo]', err.message); }
try { sembrarPlantillas(db); } catch (err) { console.error('[plantillas]', err.message); }

let cerrar = () => {};
const app = createApp({
  db, imgDir: config.imgDir, mediaDir: config.mediaDir, clientDir: config.clientDir, version: leerVersion(config.raiz),
  dbFile: path.resolve(config.dbFile), backupsDir: config.backupsDir, lan, port: config.port, plataforma: config.plataforma, token: config.token,
  // Solo la versión instalada en PC ofrece "Cerrar Mi Gym" (no hay consola desde la que cortarlo); en Android no tiene sentido.
  apagar: config.instalado && config.plataforma !== 'android' ? () => cerrar() : null,
});

// Respaldo diario automático: al arrancar y cada 24 h.
function respaldar() {
  try { backupDb(db, config.backupsDir); } catch (err) { console.error('[respaldo]', err.message); }
}
respaldar();
setInterval(respaldar, 24 * 60 * 60 * 1000).unref();
// En el celular la copia automática de Google lleva el archivo de la base: se vuelca el registro pendiente (WAL) seguido
// para que esa copia no quede desactualizada.
if (config.plataforma === 'android') setInterval(() => { try { db.exec('PRAGMA wal_checkpoint(PASSIVE)'); } catch { /* ocupada: la próxima */ } }, 2 * 60 * 1000).unref();

let server; let port = config.port;
if (config.instalado) {
  // Instalada: si otra app ocupa el puerto, usa el siguiente y lo deja anotado para el lanzador.
  ({ server, port } = await escucharEnLibre(app, host, config.port));
  if (config.dataDir) fs.writeFileSync(path.join(config.dataDir, 'puerto.txt'), String(port));
} else {
  server = http.createServer(app);
  await new Promise((resolve, reject) => { server.once('error', reject); server.listen(config.port, host, resolve); });
}
console.log(`Mi Gym en http://localhost:${port}`);
if (lan) {
  for (const lista of Object.values(os.networkInterfaces())) {
    for (const i of lista ?? []) if (i.family === 'IPv4' && !i.internal) console.log(`  Desde el celular: http://${i.address}:${port}`);
  }
}
cerrar = () => {
  if (config.dataDir) fs.rmSync(path.join(config.dataDir, 'puerto.txt'), { force: true });
  server.close(); db.close(); process.exit(0);
};
for (const s of ['SIGINT', 'SIGTERM']) process.on(s, cerrar);
