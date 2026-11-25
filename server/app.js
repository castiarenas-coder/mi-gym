import express from 'express';
import compression from 'compression';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import QRCode from 'qrcode';
import { ejerciciosRouter } from './routes/ejercicios.js';
import { rutinasRouter } from './routes/rutinas.js';
import { sesionesRouter } from './routes/sesiones.js';
import { progresoRouter } from './routes/progreso.js';
import { respaldoRouter, listarArchivos } from './respaldo.js';
import { versionActual } from './db.js';
import { conPersona, personasRouter } from './personas.js';
import { crearComprobador } from './actualizacion.js';
import { esLoopback } from './puerto.js';
import { controlDeAcceso } from './acceso.js';

export function leerVersion(raiz) {
  try { return JSON.parse(fs.readFileSync(path.join(raiz, 'package.json'), 'utf8')).version; } catch { return '0.0.0'; }
}

export function direccionesLan(port) {
  return Object.values(os.networkInterfaces()).flat()
    .filter(i => i && i.family === 'IPv4' && !i.internal)
    .map(i => `http://${i.address}:${port}`);
}

export function createApp({ db, imgDir, mediaDir, clientDir, version = '0.0.0', ahora = () => new Date(), dbFile = null, backupsDir = null, lan = false, port = 0, plataforma = 'escritorio', token = null, direcciones = direccionesLan, actualizacion = null, apagar = null }) {
  const comprobarActualizacion = actualizacion ?? crearComprobador({ version });
  const app = express();
  app.disable('x-powered-by');
  if (token) app.use(controlDeAcceso(token));
  app.use(compression());
  // La importación de un respaldo puede pesar más que el resto de los cuerpos JSON.
  app.use('/api/respaldo/importar', express.json({ limit: '30mb' }));
  app.use(express.json({ limit: '1mb' }));

  app.get('/api/salud', (_req, res) => res.json({ ok: true, app: 'mi-gym', version }));
  // Datos para la pantalla de Ajustes: dónde viven los datos, último respaldo y cómo abrir desde el celular.
  app.get('/api/info', async (_req, res) => {
    const respaldos = backupsDir ? listarArchivos(backupsDir) : [];
    const urls = lan ? direcciones(port) : [];
    const qr = urls[0] ? await QRCode.toString(urls[0], { type: 'svg', margin: 1, color: { dark: '#000', light: '#fff' } }) : null;
    res.json({
      version, schema_version: versionActual(db), db: dbFile, respaldos_dir: backupsDir,
      ultimo_respaldo: respaldos[0]?.fecha ?? null, lan, urls, qr, apagable: Boolean(apagar), plataforma,
    });
  });
  app.get('/api/actualizacion', async (_req, res) => res.json(await comprobarActualizacion()));
  // Cierra el servidor (botón "Cerrar Mi Gym"). Solo si quien arranca la app lo habilita y solo desde esta PC.
  if (apagar) {
    app.post('/api/apagar', (req, res) => {
      if (!esLoopback(req.socket.remoteAddress)) return res.status(403).json({ error: 'Solo desde esta PC' });
      res.json({ ok: true });
      res.on('finish', () => setTimeout(apagar, 50));
    });
  }
  const sesiones = sesionesRouter(db, { ahora });
  const progreso = progresoRouter(db, { ahora });
  app.use('/api/personas', personasRouter(db));
  // Todo lo demás es de la persona activa (encabezado X-Persona).
  app.use(['/api/ejercicios', '/api/rutinas', '/api/sesiones', '/api/medidas', '/api/perfil', '/api/progreso'], conPersona(db));
  app.use('/api/ejercicios', sesiones.porEjercicio);
  app.use('/api/ejercicios', ejerciciosRouter(db, { mediaDir }));
  app.use('/api/rutinas', rutinasRouter(db));
  app.use('/api/sesiones', sesiones.router);
  app.use('/api/medidas', progreso.medidas);
  app.use('/api/perfil', progreso.perfil);
  app.use('/api/progreso', progreso.router);
  if (backupsDir) app.use('/api/respaldo', respaldoRouter(db, { backupsDir, ahora }));
  app.use('/api', (_req, res) => res.status(404).json({ error: 'No existe' }));

  if (mediaDir) app.use('/media', express.static(mediaDir, { fallthrough: false }));
  if (imgDir) app.use('/img', express.static(imgDir, { maxAge: '7d', fallthrough: false }));

  if (clientDir && fs.existsSync(clientDir)) {
    app.use(express.static(clientDir));
    // Fallback de la SPA: cualquier ruta que no sea /api ni /img devuelve el index.
    app.use((req, res, next) => {
      if (req.method !== 'GET' && req.method !== 'HEAD') return next();
      res.sendFile(path.join(clientDir, 'index.html'));
    });
  }

  app.use((err, _req, res, _next) => {
    if (err?.type === 'entity.too.large') return res.status(413).json({ error: 'El archivo supera el máximo de 30 MB' });
    if (err?.type === 'entity.parse.failed') return res.status(400).json({ error: 'JSON inválido' });
    if (err?.status === 404) return res.status(404).json({ error: 'No existe' });
    console.error('[error]', err);
    res.status(500).json({ error: 'Error interno' });
  });
  return app;
}
