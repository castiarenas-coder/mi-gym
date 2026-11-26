import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { armarStage, writeBuildId } from '../scripts/android-stage.js';
import { pickApks, nombreApk } from '../scripts/android-build.js';

function raizFalsa() {
  const raiz = fs.mkdtempSync(path.join(os.tmpdir(), 'migym-apk-'));
  const w = (rel, txt) => { fs.mkdirSync(path.dirname(path.join(raiz, rel)), { recursive: true }); fs.writeFileSync(path.join(raiz, rel), txt); };
  w('server/index.js', 'x'); w('client/dist/index.html', '<html>'); w('dist-catalogo/catalogo.json', '[]'); w('dist-catalogo/img/a/0.webp', 'img');
  w('package.json', '{"version":"1.2.3"}'); w('package-lock.json', '{}');
  return raiz;
}

test('armarStage junta servidor, app compilada, catálogo y dependencias, y marca el armado', () => {
  const raiz = raizFalsa();
  const stage = path.join(raiz, 'stage');
  let instaladoEn = null;
  const r = armarStage({ raiz, stageDir: stage, instalarDeps: dir => { instaladoEn = dir; fs.mkdirSync(path.join(dir, 'node_modules')); } });
  assert.equal(instaladoEn, stage);
  for (const f of ['server/index.js', 'client/dist/index.html', 'catalogo/catalogo.json', 'catalogo/img/a/0.webp', 'package.json', 'node_modules']) {
    assert.ok(fs.existsSync(path.join(stage, f)), f);
  }
  assert.equal(fs.readFileSync(path.join(stage, 'build-id.txt'), 'utf8'), r.buildId);
  fs.rmSync(raiz, { recursive: true, force: true });
});

test('armarStage rearma desde cero y avisa si falta la app compilada o el catálogo', () => {
  const raiz = raizFalsa();
  const stage = path.join(raiz, 'stage');
  fs.mkdirSync(stage); fs.writeFileSync(path.join(stage, 'viejo.txt'), 'x');
  armarStage({ raiz, stageDir: stage, instalarDeps: () => {} });
  assert.equal(fs.existsSync(path.join(stage, 'viejo.txt')), false);
  fs.rmSync(path.join(raiz, 'client', 'dist'), { recursive: true });
  assert.throws(() => armarStage({ raiz, stageDir: stage, instalarDeps: () => {} }), /npm run build/);
  fs.rmSync(path.join(raiz, 'dist-catalogo'), { recursive: true });
  fs.mkdirSync(path.join(raiz, 'client', 'dist'), { recursive: true }); fs.writeFileSync(path.join(raiz, 'client', 'dist', 'index.html'), 'x');
  assert.throws(() => armarStage({ raiz, stageDir: stage, instalarDeps: () => {} }), /preparar-catalogo/);
  fs.rmSync(raiz, { recursive: true, force: true });
});

test('writeBuildId escribe un id distinto en cada armado', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'migym-id-'));
  const a = writeBuildId(dir); const b = writeBuildId(dir);
  assert.notEqual(a, b);
  assert.equal(fs.readFileSync(path.join(dir, 'build-id.txt'), 'utf8'), b);
  fs.rmSync(dir, { recursive: true, force: true });
});

test('nombreApk lleva la versión y el ABI', () => {
  assert.equal(nombreApk('0.2.0', 'arm64'), 'Rumbo-Fit-0.2.0-arm64.apk');
});

test('pickApks elige los APK firmados de arm64 y arm32 y falla si falta uno', () => {
  const files = ['app-arm64-v8a-release.apk', 'app-armeabi-v7a-release.apk', 'output-metadata.json'];
  assert.deepEqual(pickApks(files, '0.2.0'), [
    { from: 'app-arm64-v8a-release.apk', to: 'Rumbo-Fit-0.2.0-arm64.apk' },
    { from: 'app-armeabi-v7a-release.apk', to: 'Rumbo-Fit-0.2.0-arm32.apk' },
  ]);
  assert.throws(() => pickApks(['app-arm64-v8a-release-unsigned.apk'], '0.2.0'), /keystore\.properties/);
});
