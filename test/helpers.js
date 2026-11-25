import { openDb } from '../server/db.js';
import { createApp } from '../server/app.js';
import { guardarCatalogo, traducirEjercicio } from '../server/catalogo.js';
import { CATALOGO_EN, NOMBRES, INSTRUCCIONES } from './fixtures/ejercicios.js';
import { DICCIONARIO } from './dic.js';

export async function servidorDePrueba(opts = {}) {
  const db = openDb(':memory:');
  guardarCatalogo(db, CATALOGO_EN.map(e => traducirEjercicio(e, { dic: DICCIONARIO, nombres: NOMBRES, instrucciones: INSTRUCCIONES })));
  const app = createApp({ db, version: '9.9.9', ...opts });
  const server = await new Promise(r => { const s = app.listen(0, '127.0.0.1', () => r(s)); });
  const base = `http://127.0.0.1:${server.address().port}`;
  const pedir = async (ruta, init = {}) => {
    const res = await fetch(base + ruta, {
      ...init, sinMiGym: undefined,
      headers: { 'content-type': 'application/json', ...(init.sinMiGym ? {} : { 'x-mi-gym': '1' }), ...init.headers },
      body: init.body && typeof init.body !== 'string' ? JSON.stringify(init.body) : init.body,
    });
    const text = await res.text();
    let json = null; try { json = JSON.parse(text); } catch { /* no es JSON */ }
    return { status: res.status, json, text };
  };
  return { db, server, base, pedir, cerrar: () => { server.close(); db.close(); } };
}
