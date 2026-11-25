// Genera los íconos del APK desde client/public/icon.svg (se corre a mano si cambia el ícono; los PNG quedan en el repo):
//   node scripts/android-iconos.js
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';

const raiz = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const res = path.join(raiz, 'android', 'app', 'src', 'main', 'res');
const svg = fs.readFileSync(path.join(raiz, 'client', 'public', 'icon.svg'), 'utf8');

// Primer plano del ícono adaptivo: solo las pesas (sin el fondo redondeado), centradas en la zona segura (108 dp, 66 dp visibles).
const pesas = svg.replace(/<rect width="64" height="64"[^>]*\/>/, '').replace('viewBox="0 0 64 64"', 'viewBox="-13 -13 90 90"');
const DENSIDADES = { mdpi: 48, hdpi: 72, xhdpi: 96, xxhdpi: 144, xxxhdpi: 192 };

for (const [d, px] of Object.entries(DENSIDADES)) {
  const dir = path.join(res, `mipmap-${d}`);
  fs.mkdirSync(dir, { recursive: true });
  await sharp(Buffer.from(svg), { density: 576 }).resize(px, px).png().toFile(path.join(dir, 'ic_launcher.png'));
}
fs.mkdirSync(path.join(res, 'drawable-nodpi'), { recursive: true });
await sharp(Buffer.from(pesas), { density: 576 }).resize(432, 432).png().toFile(path.join(res, 'drawable-nodpi', 'ic_launcher_foreground.png'));
console.log('Íconos listos');
