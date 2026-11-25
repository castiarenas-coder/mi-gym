// Baja el catálogo free-exercise-db (dominio público), sus fotos, lo traduce y lo guarda en SQLite.
// Es idempotente: se puede correr de nuevo sin perder favoritos ni media propia.
//   npm run importar            -> usa data/catalogo-en.json si ya existe
//   npm run importar -- --bajar -> vuelve a descargar el JSON
//   npm run importar -- --sin-imagenes
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { config } from '../server/config.js';
import { openDb } from '../server/db.js';
import { traducirEjercicio, guardarCatalogo } from '../server/catalogo.js';

const BASE = 'https://raw.githubusercontent.com/yuhonas/free-exercise-db/main';
const URL_JSON = `${BASE}/dist/exercises.json`;
const aqui = path.dirname(fileURLToPath(import.meta.url));

export async function conReintentos(fn, { intentos = 4, espera = 500 } = {}) {
  let ultimo;
  for (let i = 0; i < intentos; i++) {
    try { return await fn(); } catch (err) {
      ultimo = err;
      await new Promise(r => setTimeout(r, espera * (i + 1)));
    }
  }
  throw ultimo;
}

// Corre `tarea` sobre cada elemento con a lo sumo `n` en paralelo.
export async function enParalelo(items, n, tarea) {
  let i = 0;
  const workers = Array.from({ length: Math.min(n, items.length) }, async () => {
    while (i < items.length) { const idx = i++; await tarea(items[idx], idx); }
  });
  await Promise.all(workers);
}

async function bajarArchivo(url, destino) {
  const buf = await conReintentos(async () => {
    const res = await fetch(url);
    if (!res.ok) throw new Error(`${res.status} ${url}`);
    return Buffer.from(await res.arrayBuffer());
  });
  fs.mkdirSync(path.dirname(destino), { recursive: true });
  fs.writeFileSync(destino + '.tmp', buf);
  fs.renameSync(destino + '.tmp', destino);
}

function leerJson(ruta, porDefecto) {
  try { return JSON.parse(fs.readFileSync(ruta, 'utf8')); } catch { return porDefecto; }
}

export async function importar({ bajar = false, imagenes = true } = {}) {
  const cache = path.join(config.raiz, 'data', 'catalogo-en.json');
  if (bajar || !fs.existsSync(cache)) {
    console.log('Descargando catálogo...');
    await bajarArchivo(URL_JSON, cache);
  }
  const catalogo = JSON.parse(fs.readFileSync(cache, 'utf8'));
  const trad = ruta => leerJson(path.join(aqui, 'traducciones', ruta), {});
  const ctx = { dic: trad('diccionario.json'), nombres: trad('nombres.json'), instrucciones: trad('instrucciones.json') };

  const db = openDb(config.dbFile);
  const filas = catalogo.map(e => traducirEjercicio(e, ctx));
  guardarCatalogo(db, filas);
  const traducidos = filas.filter(f => f.traducido).length;
  const conNombre = catalogo.filter(e => ctx.nombres[e.name]).length;
  const conPasos = catalogo.filter(e => ctx.instrucciones[e.id]?.length).length;
  console.log(`Ejercicios guardados: ${filas.length} (nombres en español: ${conNombre}, instrucciones en español: ${conPasos}, completos: ${traducidos})`);

  if (imagenes) {
    const faltan = [];
    for (const e of catalogo) {
      (e.images ?? []).forEach((img, i) => {
        const destino = path.join(config.imgDir, e.id, `${i}.jpg`);
        if (!fs.existsSync(destino)) faltan.push({ url: `${BASE}/exercises/${img.split('/').map(encodeURIComponent).join('/')}`, destino });
      });
    }
    console.log(`Imágenes por descargar: ${faltan.length}`);
    let hechas = 0; let fallidas = 0;
    await enParalelo(faltan, 8, async ({ url, destino }) => {
      try { await bajarArchivo(url, destino); } catch (err) { fallidas++; console.error('  falló:', err.message); }
      if (++hechas % 200 === 0) console.log(`  ${hechas}/${faltan.length}`);
    });
    console.log(`Imágenes listas (${fallidas} fallidas${fallidas ? ': volvé a correr el comando' : ''}).`);
  }
  db.close();
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  importar({ bajar: process.argv.includes('--bajar'), imagenes: !process.argv.includes('--sin-imagenes') })
    .catch(err => { console.error(err); process.exit(1); });
}
