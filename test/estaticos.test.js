import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { servidorDePrueba } from './helpers.js';

test('sirve /img y hace fallback de la SPA al index.html', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'migym-st-'));
  const img = path.join(dir, 'img');
  const cli = path.join(dir, 'dist');
  fs.mkdirSync(path.join(img, 'X'), { recursive: true });
  fs.mkdirSync(cli);
  fs.writeFileSync(path.join(img, 'X', '0.jpg'), 'jpg');
  fs.writeFileSync(path.join(cli, 'index.html'), '<html>spa</html>');
  const s = await servidorDePrueba({ imgDir: img, clientDir: cli });
  try {
    assert.equal((await s.pedir('/img/X/0.jpg')).text, 'jpg');
    assert.equal((await s.pedir('/img/X/nada.jpg')).status, 404);
    assert.equal((await s.pedir('/ejercicios/algo')).text, '<html>spa</html>');
    assert.equal((await s.pedir('/api/salud')).status, 200);
  } finally { s.cerrar(); }
});
