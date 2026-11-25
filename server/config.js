import path from 'node:path';
import { fileURLToPath } from 'node:url';

const raiz = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

export const config = {
  raiz,
  port: Number(process.env.MI_GYM_PORT) || 8788,
  dbFile: process.env.MI_GYM_DB || path.join(raiz, 'data', 'mi_gym.db'),
  imgDir: process.env.MI_GYM_IMG || path.join(raiz, 'data', 'img'),
  mediaDir: process.env.MI_GYM_MEDIA || path.join(raiz, 'data', 'media'),
  clientDir: path.join(raiz, 'client', 'dist'),
  backupsDir: process.env.MI_GYM_BACKUPS || path.join(raiz, 'backups'),
};
