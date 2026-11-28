import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

// Cifrado de lo que no debe quedar en claro en la base local (los tokens de la cuenta).
// AES-256-GCM; el texto cifrado es base64 de iv(12) + etiqueta(16) + datos. La clave es por equipo y vive
// en un archivo aparte (`<dataDir>/clave-equipo`, modo 0600), nunca en la base: una base o un respaldo
// copiados a otro lado no sirven sin ese archivo (la sesión se lee como vacía y se vuelve a iniciar).
// No es una defensa contra quien ya tiene acceso a la carpeta de datos de este equipo.

export const generarClave = () => crypto.randomBytes(32).toString('base64');

const bufferDeClave = (clave) => {
  const b = Buffer.from(String(clave), 'base64');
  if (b.length !== 32) throw new Error('La clave de cifrado debe ser de 32 bytes');
  return b;
};

export function cifrar(texto, clave) {
  const iv = crypto.randomBytes(12);
  const c = crypto.createCipheriv('aes-256-gcm', bufferDeClave(clave), iv);
  const datos = Buffer.concat([c.update(String(texto), 'utf8'), c.final()]);
  return Buffer.concat([iv, c.getAuthTag(), datos]).toString('base64');
}

export function descifrar(texto, clave) {
  const b = Buffer.from(String(texto), 'base64');
  if (b.length < 28) throw new Error('Texto cifrado inválido');
  const d = crypto.createDecipheriv('aes-256-gcm', bufferDeClave(clave), b.subarray(0, 12));
  d.setAuthTag(b.subarray(12, 28));
  return Buffer.concat([d.update(b.subarray(28)), d.final()]).toString('utf8');
}


const CLAVE_SESION = 'sesion';

const leerArchivo = (ruta) => { try { return fs.readFileSync(ruta, 'utf8').trim() || null; } catch { return null; } };

/** Clave de este equipo: se crea la primera vez en `rutaArchivo` (modo 0600) y se reutiliza. */
export function claveDelEquipo(rutaArchivo) {
  const existente = leerArchivo(rutaArchivo);
  if (existente) return existente;
  fs.mkdirSync(path.dirname(rutaArchivo), { recursive: true });
  const k = generarClave();
  try {
    fs.writeFileSync(rutaArchivo, k, { mode: 0o600, flag: 'wx' });
    return k;
  } catch (e) {
    if (e.code === 'EEXIST') return leerArchivo(rutaArchivo) ?? k;
    throw e;
  }
}

const leerEstado = (db, k) => db.prepare('SELECT valor FROM sync_estado WHERE clave = ?').get(k)?.valor ?? null;

/**
 * `guardarSesion` / `leerSesion` para `crearClienteSupabase`: la sesión queda cifrada en `sync_estado.sesion` con la
 * clave del archivo `rutaClave`. `guardarSesion(null)` la borra. Sin archivo de clave, con otra clave o con un valor
 * ilegible o manipulado, `leerSesion` devuelve null (leer nunca crea la clave).
 */
export function sesionEnDb(db, rutaClave) {
  return {
    async guardarSesion(sesion) {
      if (!sesion) { db.prepare('DELETE FROM sync_estado WHERE clave = ?').run(CLAVE_SESION); return; }
      db.prepare('INSERT INTO sync_estado (clave, valor) VALUES (?, ?) ON CONFLICT (clave) DO UPDATE SET valor = excluded.valor')
        .run(CLAVE_SESION, cifrar(JSON.stringify(sesion), claveDelEquipo(rutaClave)));
    },
    async leerSesion() {
      const crudo = leerEstado(db, CLAVE_SESION);
      const clave = leerArchivo(rutaClave);
      if (!crudo || !clave) return null;
      try { return JSON.parse(descifrar(crudo, clave)); } catch { return null; }
    },
  };
}
