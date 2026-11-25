import os from 'node:os';
import { config } from './config.js';
import { openDb } from './db.js';
import { createApp, leerVersion } from './app.js';
import { backupDb } from './backup.js';
import { sembrarPlantillas } from './plantillas.js';

const lan = process.argv.includes('--lan');
const host = lan ? '0.0.0.0' : '127.0.0.1';

const db = openDb(config.dbFile);
try { sembrarPlantillas(db); } catch (err) { console.error('[plantillas]', err.message); }
const app = createApp({ db, imgDir: config.imgDir, mediaDir: config.mediaDir, clientDir: config.clientDir, version: leerVersion(config.raiz) });

// Respaldo diario automático: al arrancar y cada 24 h.
function respaldar() {
  try { backupDb(db, config.backupsDir); } catch (err) { console.error('[respaldo]', err.message); }
}
respaldar();
setInterval(respaldar, 24 * 60 * 60 * 1000).unref();

const server = app.listen(config.port, host, () => {
  console.log(`Mi Gym en http://localhost:${config.port}`);
  if (lan) {
    for (const lista of Object.values(os.networkInterfaces())) {
      for (const i of lista ?? []) if (i.family === 'IPv4' && !i.internal) console.log(`  Desde el celular: http://${i.address}:${config.port}`);
    }
  }
});
for (const s of ['SIGINT', 'SIGTERM']) process.on(s, () => { server.close(); db.close(); process.exit(0); });
