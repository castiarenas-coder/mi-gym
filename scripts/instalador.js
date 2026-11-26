// Arma el instalador de Windows (un solo Rumbo-Fit-Setup-<versión>.exe, sin pedir nada al usuario):
//   npm run instalador                  compila la interfaz, prepara el catálogo, arma release/staging/ y corre Inno Setup
//   npm run instalador -- --reusar      reutiliza client/dist y dist-catalogo si ya existen (más rápido)
// Requiere Inno Setup 6 (variable ISCC o %LOCALAPPDATA%\Programs\Inno Setup 6) y internet la primera vez (Node portátil).
// Node portátil: se baja de nodejs.org, se verifica su SHA256 contra SHASUMS256.txt y se guarda en .cache/node/.
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';

const raiz = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const NODE_MAYOR = 22;
const URL_NODE = `https://nodejs.org/dist/latest-v${NODE_MAYOR}.x`;
// El servidor corre con otro nombre para reconocerlo en el Administrador de tareas y poder cerrarlo sin tocar otros Node.
export const EXE_SERVIDOR = 'MiGymServidor.exe';

// --- Node portátil -----------------------------------------------------------------------------------------------

export function entradaDeNode(shasums) {
  for (const linea of shasums.split(/\r?\n/)) {
    const m = linea.trim().match(/^([0-9a-f]{64})\s+(node-v(\d+\.\d+\.\d+)-win-x64\.zip)$/i);
    if (m) return { nombre: m[2], version: m[3], sha256: m[1].toLowerCase() };
  }
  throw new Error('SHASUMS256.txt no trae el zip win-x64 de Node.');
}

export const sha256Archivo = f => crypto.createHash('sha256').update(fs.readFileSync(f)).digest('hex');

export function verificarSha256(archivo, esperado) {
  const real = sha256Archivo(archivo);
  if (real !== String(esperado).toLowerCase()) throw new Error(`SHA256 distinto en ${path.basename(archivo)}: esperado ${esperado}, obtenido ${real}`);
}

async function bajar(url, destino) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`${res.status} al bajar ${url}`);
  fs.writeFileSync(destino, Buffer.from(await res.arrayBuffer()));
}

// Devuelve la ruta a un node.exe verificado (del caché; baja la última 22.x si hace falta).
export async function obtenerNode(cache = path.join(raiz, '.cache', 'node')) {
  fs.mkdirSync(cache, { recursive: true });
  let entrada;
  try {
    const res = await fetch(`${URL_NODE}/SHASUMS256.txt`);
    if (!res.ok) throw new Error(String(res.status));
    entrada = entradaDeNode(await res.text());
  } catch (err) {
    const previas = fs.readdirSync(cache).filter(d => fs.existsSync(path.join(cache, d, 'node.exe'))).sort();
    if (!previas.length) throw new Error(`No pude consultar nodejs.org y no hay Node en caché: ${err.message}`);
    console.log(`Sin conexión a nodejs.org: uso el Node en caché (${previas.at(-1)}).`);
    return path.join(cache, previas.at(-1), 'node.exe');
  }
  const carpeta = path.join(cache, `v${entrada.version}`);
  const exe = path.join(carpeta, 'node.exe');
  if (fs.existsSync(exe)) { console.log(`Node v${entrada.version} ya está en caché.`); return exe; }
  fs.mkdirSync(carpeta, { recursive: true });
  const zip = path.join(carpeta, entrada.nombre);
  console.log(`Bajando Node v${entrada.version}...`);
  await bajar(`${URL_NODE}/${entrada.nombre}`, zip);
  verificarSha256(zip, entrada.sha256);
  console.log('SHA256 verificado.');
  // tar.exe de Windows (bsdtar) lee zip; el "tar" de Git Bash no.
  const tar = path.join(process.env.SystemRoot ?? 'C:\\Windows', 'System32', 'tar.exe');
  const base = entrada.nombre.replace(/\.zip$/, '');
  execFileSync(tar, ['-xf', zip, '-C', carpeta, `${base}/node.exe`], { stdio: 'inherit' });
  fs.renameSync(path.join(carpeta, base, 'node.exe'), exe);
  fs.rmSync(path.join(carpeta, base), { recursive: true, force: true });
  fs.rmSync(zip, { force: true });
  return exe;
}

// --- Ícono -------------------------------------------------------------------------------------------------------

// Un .ico puede llevar PNG adentro (Windows Vista en adelante).
export function icoDesdePngs(pngs) {
  const cab = Buffer.alloc(6);
  cab.writeUInt16LE(0, 0); cab.writeUInt16LE(1, 2); cab.writeUInt16LE(pngs.length, 4);
  let offset = 6 + 16 * pngs.length;
  const entradas = pngs.map(({ size, data }) => {
    const e = Buffer.alloc(16);
    e[0] = size >= 256 ? 0 : size; e[1] = size >= 256 ? 0 : size;
    e.writeUInt16LE(1, 4); e.writeUInt16LE(32, 6);
    e.writeUInt32LE(data.length, 8); e.writeUInt32LE(offset, 12);
    offset += data.length;
    return e;
  });
  return Buffer.concat([cab, ...entradas, ...pngs.map(p => p.data)]);
}

export async function crearIcono(svg, destino, tamanos = [16, 24, 32, 48, 64, 128, 256]) {
  const pngs = [];
  for (const size of tamanos) {
    pngs.push({ size, data: await sharp(svg, { density: 576 }).resize(size, size).png().toBuffer() });
  }
  fs.mkdirSync(path.dirname(destino), { recursive: true });
  fs.writeFileSync(destino, icoDesdePngs(pngs));
}

// --- Inno Setup --------------------------------------------------------------------------------------------------

export function rutaIscc(env = process.env, existe = fs.existsSync) {
  if (env.ISCC) return env.ISCC;
  const candidatas = [
    env.LOCALAPPDATA && path.win32.join(env.LOCALAPPDATA, 'Programs', 'Inno Setup 6', 'ISCC.exe'),
    env['ProgramFiles(x86)'] && path.win32.join(env['ProgramFiles(x86)'], 'Inno Setup 6', 'ISCC.exe'),
    env.ProgramFiles && path.win32.join(env.ProgramFiles, 'Inno Setup 6', 'ISCC.exe'),
  ].filter(Boolean);
  const r = candidatas.find(existe);
  if (!r) throw new Error('No encontré Inno Setup 6 (ISCC.exe). Instalalo o definí la variable ISCC con su ruta.');
  return r;
}

// --- Armado ------------------------------------------------------------------------------------------------------

const npm = (args, cwd) => execFileSync(process.platform === 'win32' ? 'npm.cmd' : 'npm', args, { cwd, stdio: 'inherit', shell: process.platform === 'win32' });
const mb = n => `${(n / 1024 / 1024).toFixed(1)} MB`;

export async function main({ reusar = process.argv.includes('--reusar') } = {}) {
  if (process.platform !== 'win32') throw new Error('El instalador es solo para Windows.');
  const version = JSON.parse(fs.readFileSync(path.join(raiz, 'package.json'), 'utf8')).version;
  const release = path.join(raiz, 'release');
  const staging = path.join(release, 'staging');
  const iscc = rutaIscc();

  if (!(reusar && fs.existsSync(path.join(raiz, 'client', 'dist', 'index.html')))) {
    console.log('Compilando la interfaz...');
    npm(['run', 'build'], raiz);
  }
  if (!(reusar && fs.existsSync(path.join(raiz, 'dist-catalogo', 'catalogo.json')))) {
    const { main: preparar } = await import('./preparar-catalogo.js');
    await preparar();
  }
  const node = await obtenerNode();

  console.log('Armando release/staging/...');
  fs.rmSync(staging, { recursive: true, force: true });
  fs.mkdirSync(staging, { recursive: true });
  fs.cpSync(path.join(raiz, 'server'), path.join(staging, 'server'), { recursive: true });
  fs.cpSync(path.join(raiz, 'client', 'dist'), path.join(staging, 'client', 'dist'), { recursive: true });
  fs.cpSync(path.join(raiz, 'dist-catalogo'), path.join(staging, 'catalogo'), { recursive: true });
  for (const f of ['package.json', 'package-lock.json', 'LICENSE', 'THIRD_PARTY_NOTICES.md']) fs.copyFileSync(path.join(raiz, f), path.join(staging, f));
  // VBScript quiere finales de línea de Windows (y el archivo va sin tildes para no depender de la codificación).
  const vbs = fs.readFileSync(path.join(raiz, 'installer', 'mi-gym.vbs'), 'utf8').replace(/\r?\n/g, '\r\n');
  fs.writeFileSync(path.join(staging, 'mi-gym.vbs'), vbs);
  fs.copyFileSync(node, path.join(staging, EXE_SERVIDOR));
  await crearIcono(path.join(raiz, 'client', 'public', 'icon.svg'), path.join(staging, 'mi-gym.ico'));
  // Solo dependencias de producción y sin scripts (el postinstall instalaría el cliente).
  npm(['ci', '--omit=dev', '--ignore-scripts', '--no-audit', '--no-fund'], staging);

  console.log('Compilando el instalador con Inno Setup...');
  execFileSync(iscc, [`/DAppVersion=${version}`, `/DStaging=${staging}`, `/DSalida=${release}`, path.join(raiz, 'installer', 'mi-gym.iss')], { stdio: 'inherit' });
  const exe = path.join(release, `Rumbo-Fit-Setup-${version}.exe`);
  console.log(`\nListo: ${exe} (${mb(fs.statSync(exe).size)})`);
  return exe;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch(err => { console.error(err.message); process.exit(1); });
}
