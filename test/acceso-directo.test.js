import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { generarLanzador, crearAccesoDirecto } from '../scripts/crear-acceso-directo.js';

const raiz = 'C:\\mis apps\\Mi_Gym';

test('el lanzador arranca el servidor oculto, compila si falta client/dist y abre el navegador', () => {
  const vbs = generarLanzador({ raiz, node: 'C:\\Program Files\\nodejs\\node.exe', puerto: 8788 });
  assert.match(vbs, /url = "http:\/\/127\.0\.0\.1:8788"/);
  assert.match(vbs, /\/api\/salud/);
  assert.ok(vbs.includes('server\\index.js'));
  assert.ok(vbs.includes('client\\dist\\index.html'));
  assert.match(vbs, /npm run build/);
  assert.match(vbs, /, 0, False/, 'el servidor corre sin ventana');
  assert.match(vbs, /sh\.Run url, 1, False/);
  assert.ok(vbs.includes('C:\\Program Files\\nodejs\\node.exe'), 'usa el node absoluto');
  assert.ok(vbs.includes('sh.CurrentDirectory = "C:\\mis apps\\Mi_Gym"'));
});

test('el lanzador no relanza el servidor si ya responde', () => {
  const vbs = generarLanzador({ raiz });
  assert.ok(vbs.indexOf('If Not Arriba() Then') < vbs.indexOf('server\\index.js'));
});

test('crea el .lnk y el lanzador (en una carpeta de prueba, no en el Escritorio)', { skip: process.platform !== 'win32' }, () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'migym-lnk-'));
  const raizTmp = path.join(dir, 'proyecto');
  const destino = path.join(dir, 'escritorio');
  fs.mkdirSync(destino);
  try {
    const { lnk, vbs } = crearAccesoDirecto({ raiz: raizTmp, destino });
    assert.equal(path.basename(lnk), 'Rumbo Fit.lnk');
    assert.ok(fs.existsSync(lnk) && fs.statSync(lnk).size > 0);
    assert.ok(fs.readFileSync(vbs, 'utf8').includes(raizTmp));
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});
