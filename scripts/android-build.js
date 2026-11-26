// Compila los APK de release con Gradle y los deja en release/Mi-Gym-<versión>-arm64.apk y -arm32.apk.
// Lo llama `npm run apk` después de compilar la app y armar el proyecto Node (android-stage.js).
// JAVA_HOME y ANDROID_HOME se toman del entorno; si faltan se prueban las rutas de instalación habituales.
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const win = process.platform === 'win32';

function firstExisting(...candidates) {
  return candidates.filter(Boolean).find(p => fs.existsSync(p));
}

// JDK 17 de Temurin en su carpeta habitual de Windows (cualquier 17.x).
function findJdk17() {
  const base = 'C:/Program Files/Eclipse Adoptium';
  try { return fs.readdirSync(base).filter(d => d.startsWith('jdk-17')).map(d => path.join(base, d))[0]; } catch { return undefined; }
}

// Un APK por ABI: arm64 (celulares) y arm32 (celulares viejos). Los x86_64 (emulador) no se publican.
const TARGETS = [
  { abi: 'arm64-v8a', sufijo: 'arm64' },
  { abi: 'armeabi-v7a', sufijo: 'arm32' },
];

export const nombreApk = (version, sufijo) => `Rumbo-Fit-${version}-${sufijo}.apk`;

// De los archivos que dejó Gradle elige los APK firmados a publicar; si falta uno, avisa cuál.
export function pickApks(files, version) {
  return TARGETS.map(({ abi, sufijo }) => {
    const from = `app-${abi}-release.apk`;
    if (!files.includes(from)) throw new Error(`Falta el APK firmado de ${abi} (${from}); ¿está android/keystore.properties?`);
    return { from, to: nombreApk(version, sufijo) };
  });
}

function main() {
  const env = { ...process.env };
  env.JAVA_HOME ||= findJdk17();
  env.ANDROID_HOME ||= firstExisting(env.ANDROID_SDK_ROOT, process.env.LOCALAPPDATA && path.join(process.env.LOCALAPPDATA, 'Android', 'Sdk'));
  if (!env.JAVA_HOME || !fs.existsSync(env.JAVA_HOME)) throw new Error('No encuentro el JDK 17: instalalo (Temurin 17) o definí JAVA_HOME.');
  if (!env.ANDROID_HOME || !fs.existsSync(env.ANDROID_HOME)) throw new Error('No encuentro el Android SDK: definí ANDROID_HOME (suele ser %LOCALAPPDATA%/Android/Sdk).');

  const gradlew = path.join(root, 'android', win ? 'gradlew.bat' : 'gradlew');
  execFileSync(gradlew, ['assembleRelease'], { cwd: path.join(root, 'android'), stdio: 'inherit', env, shell: win });

  const version = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8')).version;
  const dir = path.join(root, 'android', 'app', 'build', 'outputs', 'apk', 'release');
  const picked = pickApks(fs.readdirSync(dir), version);
  const out = path.join(root, 'release');
  fs.mkdirSync(out, { recursive: true });
  for (const { from, to } of picked) {
    fs.copyFileSync(path.join(dir, from), path.join(out, to));
    console.log(`Listo: ${path.join(out, to)} (${(fs.statSync(path.join(out, to)).size / 1048576).toFixed(1)} MB)`);
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try { main(); } catch (err) { console.error(err.message); process.exit(1); }
}
