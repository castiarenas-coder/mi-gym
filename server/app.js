import express from 'express';
import compression from 'compression';
import fs from 'node:fs';
import path from 'node:path';
import { ejerciciosRouter } from './routes/ejercicios.js';
import { rutinasRouter } from './routes/rutinas.js';

export function leerVersion(raiz) {
  try { return JSON.parse(fs.readFileSync(path.join(raiz, 'package.json'), 'utf8')).version; } catch { return '0.0.0'; }
}

export function createApp({ db, imgDir, mediaDir, clientDir, version = '0.0.0' }) {
  const app = express();
  app.disable('x-powered-by');
  app.use(compression());
  app.use(express.json({ limit: '1mb' }));

  app.get('/api/salud', (_req, res) => res.json({ ok: true, version }));
  app.use('/api/ejercicios', ejerciciosRouter(db, { mediaDir }));
  app.use('/api/rutinas', rutinasRouter(db));
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
