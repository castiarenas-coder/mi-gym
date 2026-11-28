import crypto from 'node:crypto';

// Cifrado de lo que no debe quedar en claro en la base local (los tokens de la cuenta).
// AES-256-GCM; el texto cifrado es base64 de iv(12) + etiqueta(16) + datos. La clave es por equipo
// y vive en `sync_estado` (protege de copiar la base a otro equipo con el archivo de la nube;
// no es una defensa contra quien ya tiene acceso al equipo).

const CLAVE_EQUIPO = 'clave_equipo';
const CLAVE_SESION = 'sesion';

/** Clave nueva de 32 bytes, en base64. */
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

const leerEstado = (db, k) => db.prepare('SELECT valor FROM sync_estado WHERE clave = ?').get(k)?.valor ?? null;
const guardarEstado = (db, k, v) => db.prepare(
  'INSERT INTO sync_estado (clave, valor) VALUES (?, ?) ON CONFLICT (clave) DO UPDATE SET valor = excluded.valor').run(k, v);

/** Clave de este equipo: se crea la primera vez y queda guardada en `sync_estado`. */
export function claveDelEquipo(db) {
  let k = leerEstado(db, CLAVE_EQUIPO);
  if (!k) { k = generarClave(); guardarEstado(db, CLAVE_EQUIPO, k); }
  return k;
}

/**
 * `guardarSesion` / `leerSesion` para `crearClienteSupabase`, guardando la sesión cifrada en `sync_estado`.
 * `guardarSesion(null)` la borra. Un valor ilegible o manipulado se trata como "sin sesión".
 */
export function sesionEnDb(db) {
  return {
    async guardarSesion(sesion) {
      if (!sesion) { db.prepare('DELETE FROM sync_estado WHERE clave = ?').run(CLAVE_SESION); return; }
      guardarEstado(db, CLAVE_SESION, cifrar(JSON.stringify(sesion), claveDelEquipo(db)));
    },
    async leerSesion() {
      const crudo = leerEstado(db, CLAVE_SESION);
      if (!crudo) return null;
      try { return JSON.parse(descifrar(crudo, claveDelEquipo(db))); } catch { return null; }
    },
  };
}
