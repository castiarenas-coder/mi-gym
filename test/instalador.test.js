import { test } from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import sharp from 'sharp';
import { icoDesdePngs, entradaDeNode, sha256Archivo, verificarSha256, crearIcono, rutaIscc } from '../scripts/instalador.js';

const SHASUMS = `aaa111  node-v22.99.1-darwin-arm64.tar.gz
${'ab'.repeat(32)}  node-v22.99.1-win-x64.zip
${'cd'.repeat(32)}  node-v22.99.1-win-x64.7z
${'ef'.repeat(32)}  node-v22.99.1-win-arm64.zip
`;

test('entradaDeNode elige el zip de Windows x64 y su hash', () => {
  const e = entradaDeNode(SHASUMS);
  assert.deepEqual(e, { nombre: 'node-v22.99.1-win-x64.zip', version: '22.99.1', sha256: 'ab'.repeat(32) });
  assert.throws(() => entradaDeNode('nada'), /win-x64/);
});

test('verificarSha256 acepta el hash correcto y rechaza uno distinto', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'migym-sha-'));
  const f = path.join(dir, 'x.bin');
  fs.writeFileSync(f, 'hola');
  const hash = crypto.createHash('sha256').update('hola').digest('hex');
  assert.equal(sha256Archivo(f), hash);
  assert.doesNotThrow(() => verificarSha256(f, hash.toUpperCase()));
  assert.throws(() => verificarSha256(f, '0'.repeat(64)), /SHA256/);
});

test('icoDesdePngs arma un .ico válido con cada tamaño', () => {
  const pngs = [{ size: 16, data: Buffer.from('a') }, { size: 256, data: Buffer.from('bcd') }];
  const ico = icoDesdePngs(pngs);
  assert.equal(ico.readUInt16LE(0), 0);
  assert.equal(ico.readUInt16LE(2), 1);
  assert.equal(ico.readUInt16LE(4), 2);
  assert.equal(ico[6], 16);          // ancho de la 1.ª entrada
  assert.equal(ico[6 + 16], 0);      // 256 se escribe como 0
  assert.equal(ico.readUInt32LE(6 + 8), 1);                 // bytes de la 1.ª imagen
  assert.equal(ico.readUInt32LE(6 + 12), 6 + 2 * 16);       // offset de la 1.ª imagen
  assert.equal(ico.subarray(6 + 2 * 16).toString(), 'abcd');
});

test('crearIcono genera un .ico a partir de icon.svg con los PNG adentro', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'migym-ico-'));
  const destino = path.join(dir, 'mi-gym.ico');
  await crearIcono(path.resolve('client/public/icon.svg'), destino);
  const ico = fs.readFileSync(destino);
  assert.equal(ico.readUInt16LE(2), 1);
  const n = ico.readUInt16LE(4);
  assert.ok(n >= 4);
  const off = ico.readUInt32LE(6 + 12); const len = ico.readUInt32LE(6 + 8);
  const meta = await sharp(ico.subarray(off, off + len)).metadata();
  assert.equal(meta.format, 'png');
  assert.equal(meta.width, ico[6] || 256);
});

test('rutaIscc respeta la variable ISCC y si no busca Inno Setup 6', () => {
  assert.equal(rutaIscc({ ISCC: 'X:\iscc.exe' }, () => true), 'X:\iscc.exe');
  const r = rutaIscc({ LOCALAPPDATA: 'C:\L' }, p => p.startsWith('C:\L'));
  assert.ok(r.endsWith('ISCC.exe') && r.includes('Inno Setup 6'));
  assert.throws(() => rutaIscc({}, () => false), /Inno Setup/);
});
