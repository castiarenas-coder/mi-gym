// Prepara el catálogo para empaquetarlo en el instalador (y, más adelante, en el APK):
//   npm run preparar-catalogo   ->  dist-catalogo/catalogo.json + dist-catalogo/img/<id>/{0,1}.webp
// catalogo.json lleva los ejercicios ya traducidos (se cargan en la base sin internet) y las fotos se
// convierten a WebP de hasta 480 px de ancho: pesan una fracción de los JPG originales.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';
import { traducirEjercicio, versionDeCatalogo } from '../server/catalogo.js';
import { enParalelo } from './importar-catalogo.js';

const raiz = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
export const ANCHO_MAX = 480;
export const CALIDAD = 70;

function leerJson(ruta, porDefecto) {
  try { return JSON.parse(fs.readFileSync(ruta, 'utf8')); } catch { return porDefecto; }
}

export async function convertirImagen(origen, destino) {
  fs.mkdirSync(path.dirname(destino), { recursive: true });
  const { size } = await sharp(origen).resize({ width: ANCHO_MAX, withoutEnlargement: true }).webp({ quality: CALIDAD }).toFile(destino);
  return size;
}

export async function prepararCatalogo({ catalogo, ctx, imgOrigen, destino, convertir = convertirImagen }) {
  fs.rmSync(destino, { recursive: true, force: true });
  fs.mkdirSync(destino, { recursive: true });
  const tareas = [];
  const filas = catalogo.map(e => {
    const fila = traducirEjercicio(e, { ...ctx, ext: 'webp' });
    for (const [campo, i] of [['img_ini', 0], ['img_fin', 1]]) {
      if (!fila[campo]) continue;
      const origen = path.join(imgOrigen, e.id, `${i}.jpg`);
      if (!fs.existsSync(origen)) { fila[campo] = null; continue; }
      tareas.push({ origen, destino: path.join(destino, 'img', e.id, `${i}.webp`) });
    }
    return fila;
  });
  let bytes = 0;
  await enParalelo(tareas, 8, async t => { const n = await convertir(t.origen, t.destino); bytes += n; });
  const paquete = { version: versionDeCatalogo(filas), ejercicios: filas };
  fs.writeFileSync(path.join(destino, 'catalogo.json'), JSON.stringify(paquete));
  const json = fs.statSync(path.join(destino, 'catalogo.json')).size;
  return { ejercicios: filas.length, imagenes: tareas.length, bytes, json, version: paquete.version };
}

const mb = n => `${(n / 1024 / 1024).toFixed(1)} MB`;

export async function main() {
  const jsonEn = path.join(raiz, 'data', 'catalogo-en.json');
  if (!fs.existsSync(jsonEn)) throw new Error('Falta data/catalogo-en.json: corré `npm run importar` una vez.');
  const trad = ruta => leerJson(path.join(raiz, 'scripts', 'traducciones', ruta), {});
  const ctx = { dic: trad('diccionario.json'), nombres: trad('nombres.json'), instrucciones: trad('instrucciones.json') };
  const catalogo = JSON.parse(fs.readFileSync(jsonEn, 'utf8'));
  const destino = path.join(raiz, 'dist-catalogo');
  console.log('Preparando el catálogo (fotos a WebP)...');
  const r = await prepararCatalogo({ catalogo, ctx, imgOrigen: path.join(raiz, 'data', 'img'), destino });
  console.log(`Catálogo listo en dist-catalogo/: ${r.ejercicios} ejercicios, ${r.imagenes} fotos (${mb(r.bytes)}), catalogo.json ${mb(r.json)}. Total: ${mb(r.bytes + r.json)}`);
  return r;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch(err => { console.error(err.message); process.exit(1); });
}
