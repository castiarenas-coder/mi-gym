// Arma el proyecto Node que va adentro del APK (android/app/src/main/assets/nodejs-project/):
//   node scripts/android-stage.js   (requiere client/dist compilado; `npm run apk` lo prepara)
// Lleva el servidor, la app compilada, las dependencias de producción y el catálogo empaquetado (catalogo/).
// Es el mismo esquema que scripts/instalador.js usa para Windows. Los datos del usuario NO viajan: viven en el celular.
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const raizPorDefecto = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
export const stageDir = path.join(raizPorDefecto, 'android', 'app', 'src', 'main', 'assets', 'nodejs-project');

// Identifica ESTE armado: la app recopia cuando cambia, aunque el versionCode sea el mismo
// (reinstalar un APK nuevo con el mismo versionCode no debe dejar el proyecto viejo).
export function writeBuildId(dir, id = crypto.randomBytes(8).toString('hex')) {
  fs.writeFileSync(path.join(dir, 'build-id.txt'), id);
  return id;
}

// Solo dependencias de producción y sin scripts (el postinstall instalaría el cliente).
export function instalarDepsDeProduccion(dir) {
  const win = process.platform === 'win32';
  execFileSync(win ? 'npm.cmd' : 'npm', ['ci', '--omit=dev', '--ignore-scripts', '--no-audit', '--no-fund'], { cwd: dir, stdio: 'inherit', shell: win });
}

export function armarStage({ raiz = raizPorDefecto, stageDir: destino = stageDir, instalarDeps = instalarDepsDeProduccion } = {}) {
  if (!fs.existsSync(path.join(raiz, 'client', 'dist', 'index.html'))) throw new Error('Falta client/dist: corré `npm run build` antes.');
  if (!fs.existsSync(path.join(raiz, 'dist-catalogo', 'catalogo.json'))) throw new Error('Falta dist-catalogo: corré `npm run preparar-catalogo` antes.');
  fs.rmSync(destino, { recursive: true, force: true });
  fs.mkdirSync(destino, { recursive: true });
  fs.cpSync(path.join(raiz, 'server'), path.join(destino, 'server'), { recursive: true });
  fs.cpSync(path.join(raiz, 'client', 'dist'), path.join(destino, 'client', 'dist'), { recursive: true });
  fs.cpSync(path.join(raiz, 'dist-catalogo'), path.join(destino, 'catalogo'), { recursive: true });
  for (const f of ['package.json', 'package-lock.json']) fs.copyFileSync(path.join(raiz, f), path.join(destino, f));
  instalarDeps(destino);
  return { stageDir: destino, buildId: writeBuildId(destino) };
}

async function main() {
  if (!fs.existsSync(path.join(raizPorDefecto, 'dist-catalogo', 'catalogo.json'))) {
    const { main: preparar } = await import('./preparar-catalogo.js');
    await preparar();
  }
  console.log('Armando el proyecto Node del APK…');
  const { stageDir: dir } = armarStage();
  console.log(`Listo: ${dir}`);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch(err => { console.error(err.message); process.exit(1); });
}
