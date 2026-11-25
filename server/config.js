import path from 'node:path';
import { fileURLToPath } from 'node:url';

const raizPorDefecto = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

// Resuelve rutas y puertos a partir de variables de entorno. Sin ninguna, todo vive en el repo (desarrollo).
//   MI_GYM_DATA      carpeta con la base, los medios propios, los respaldos y el log (instalación)
//   MI_GYM_IMG       fotos del catálogo (solo lectura)
//   MI_GYM_CATALOGO  carpeta con catalogo.json empaquetado (se carga en la base al arrancar)
//   MI_GYM_PLATAFORMA  'android' en la app del celular (oculta lo que solo sirve en PC)
//   MI_GYM_DB / MI_GYM_MEDIA / MI_GYM_BACKUPS / MI_GYM_PORT: ajustes puntuales, ganan sobre MI_GYM_DATA
export function resolverConfig(env = process.env, raiz = raizPorDefecto) {
  const abs = v => (v ? path.resolve(v) : null);
  const dataDir = abs(env.MI_GYM_DATA);
  const enDatos = (sub, porDefecto) => (dataDir ? path.join(dataDir, sub) : porDefecto);
  return {
    raiz,
    dataDir,
    port: Number(env.MI_GYM_PORT) || 8788,
    instalado: env.MI_GYM_INSTALADO === '1',
    plataforma: env.MI_GYM_PLATAFORMA === 'android' ? 'android' : 'escritorio',
    dbFile: abs(env.MI_GYM_DB) ?? enDatos('mi_gym.db', path.join(raiz, 'data', 'mi_gym.db')),
    imgDir: abs(env.MI_GYM_IMG) ?? path.join(raiz, 'data', 'img'),
    mediaDir: abs(env.MI_GYM_MEDIA) ?? enDatos('media', path.join(raiz, 'data', 'media')),
    backupsDir: abs(env.MI_GYM_BACKUPS) ?? enDatos('backups', path.join(raiz, 'backups')),
    logFile: enDatos('server.log', path.join(raiz, 'data', 'server.log')),
    catalogoDir: abs(env.MI_GYM_CATALOGO),
    clientDir: path.join(raiz, 'client', 'dist'),
  };
}

export const config = resolverConfig();
