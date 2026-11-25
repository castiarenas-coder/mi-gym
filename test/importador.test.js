import { test } from 'node:test';
import assert from 'node:assert/strict';
import { conReintentos, enParalelo } from '../scripts/importar-catalogo.js';

test('conReintentos reintenta y devuelve el primer éxito', async () => {
  let n = 0;
  const r = await conReintentos(async () => { if (++n < 3) throw new Error('x'); return 'ok'; }, { espera: 1 });
  assert.equal(r, 'ok');
  assert.equal(n, 3);
});

test('conReintentos propaga el error al agotar los intentos', async () => {
  await assert.rejects(conReintentos(async () => { throw new Error('boom'); }, { intentos: 2, espera: 1 }), /boom/);
});

test('enParalelo respeta el límite de concurrencia y procesa todo', async () => {
  let activos = 0; let maximo = 0; const vistos = [];
  await enParalelo([1, 2, 3, 4, 5, 6, 7], 3, async x => {
    activos++; maximo = Math.max(maximo, activos);
    await new Promise(r => setTimeout(r, 5));
    vistos.push(x); activos--;
  });
  assert.equal(vistos.length, 7);
  assert.ok(maximo <= 3);
});
