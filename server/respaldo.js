// Exportar / importar / restaurar los datos del usuario. Todo el reemplazo ocurre en una sola
// transacción y SIEMPRE después de guardar un respaldo de seguridad de lo que había.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import express from 'express';
import { DatabaseSync } from 'node:sqlite';
import { backupDb } from './backup.js';
import { openDb, versionActual } from './db.js';
import { cambiosLocales, fusionarPersona, quitarPersonaFusionada, resolverAlias } from './sync/documentos.js';
import { reiniciarBajada, leer } from './sync/motor.js';

// Orden de inserción (padres antes que hijos). Para borrar se recorre al revés.
export const TABLAS_USUARIO = ['personas', 'rutinas', 'rutina_dias', 'rutina_ejercicios', 'sesiones', 'sesion_ejercicios', 'series_hechas', 'medidas', 'perfil', 'favoritos', 'ajustes'];

export class ErrorRespaldo extends Error {
  constructor(mensaje, status = 400) { super(mensaje); this.status = status; }
}

export function exportarDatos(db, { ahora = new Date() } = {}) {
  const datos = {
    app: 'mi-gym',
    schema_version: versionActual(db),
    fecha: ahora.toISOString(),
  };
  for (const t of TABLAS_USUARIO) datos[t] = db.prepare(`SELECT * FROM ${t}`).all().map(f => ({ ...f }));
  // Los favoritos van en su propia sección (son de cada persona); acá solo la media propia, que es de la casa.
  datos.ejercicios = db.prepare('SELECT id, media_propia FROM ejercicios WHERE media_propia IS NOT NULL ORDER BY id').all().map(f => ({ ...f }));
  return datos;
}

function validar(datos, db) {
  if (!datos || typeof datos !== 'object' || Array.isArray(datos) || datos.app !== 'mi-gym') throw new ErrorRespaldo('El archivo no es un respaldo de Rumbo Fit.');
  if (!Number.isInteger(datos.schema_version) || datos.schema_version < 1) throw new ErrorRespaldo('El archivo no indica la versión de los datos.');
  const actual = versionActual(db);
  if (datos.schema_version > actual) throw new ErrorRespaldo('El archivo viene de una versión más nueva de Rumbo Fit. Actualizá la app antes de importarlo.', 409);
  if (datos.schema_version < actual) throw new ErrorRespaldo('El archivo viene de una versión más vieja de Rumbo Fit y no se puede importar. Restaurá un respaldo de la lista en su lugar.', 409);
  for (const t of [...TABLAS_USUARIO, 'ejercicios']) {
    if (!Array.isArray(datos[t])) throw new ErrorRespaldo(`Al archivo le falta la sección "${t}".`);
    if (datos[t].some(f => !f || typeof f !== 'object' || Array.isArray(f))) throw new ErrorRespaldo(`La sección "${t}" tiene filas inválidas.`);
  }
  if (!datos.personas.length) throw new ErrorRespaldo('El archivo no tiene ninguna persona.');
  const personas = new Set(datos.personas.map(f => f.id));
  for (const t of ['rutinas', 'sesiones', 'medidas', 'perfil', 'favoritos']) {
    if (datos[t].some(f => f.persona_id === null || f.persona_id === undefined || !personas.has(f.persona_id))) {
      throw new ErrorRespaldo(`El archivo tiene filas de "${t}" sin una persona válida.`);
    }
  }
}

// Reemplaza los datos del usuario por `datos`. Hace un respaldo de seguridad antes (si hay carpeta).
export function importarDatos(db, datos, { backupsDir } = {}) {
  validar(datos, db);
  let seguridad = null;
  if (backupsDir) seguridad = path.basename(backupDb(db, backupsDir));
  db.exec('BEGIN');
  try {
    // Restaurar es una operación puramente local: nunca debe borrar nada de la nube. Los borrados que el
    // vaciado dispara (lápidas y personas muertas) se descartan al final; quedan solo los que ya existían.
    const lapidasPrevias = db.prepare('SELECT tipo, clave, fecha, por_alias FROM sync_borrados').all().map(f => ({ ...f }));
    const muertasPrevias = db.prepare('SELECT persona, fecha, viva FROM sync_muertas').all().map(f => ({ ...f }));
    for (const t of [...TABLAS_USUARIO].reverse()) db.exec(`DELETE FROM ${t}`);
    db.exec("UPDATE ejercicios SET favorito = 0, media_propia = NULL");
    for (const t of TABLAS_USUARIO) {
      const columnas = new Set(db.prepare(`PRAGMA table_info(${t})`).all().map(c => c.name));
      for (const fila of datos[t]) {
        const cols = Object.keys(fila).filter(c => columnas.has(c));
        if (!cols.length) continue;
        db.prepare(`INSERT INTO ${t} (${cols.join(', ')}) VALUES (${cols.map(() => '?').join(', ')})`)
          .run(...cols.map(c => (typeof fila[c] === 'boolean' ? Number(fila[c]) : fila[c] ?? null)));
      }
    }
    // Insertar hijos mueve la marca del documento padre: se devuelve la que traía el archivo.
    for (const t of ['rutinas', 'sesiones']) {
      const fijar = db.prepare(`UPDATE ${t} SET actualizado = ? WHERE id = ?`);
      for (const f of datos[t]) if (f.actualizado) fijar.run(f.actualizado, f.id);
    }
    const marcar = db.prepare('UPDATE ejercicios SET media_propia = ? WHERE id = ?');
    for (const e of datos.ejercicios) marcar.run(e.media_propia ?? null, String(e.id));
    db.exec('DELETE FROM sync_borrados; DELETE FROM sync_muertas');
    const vivos = new Set(cambiosLocales(db, null).filter(d => !d.borrado).map(d => `${d.tipo}|${d.clave}`));
    const lapida = db.prepare('INSERT INTO sync_borrados (tipo, clave, fecha, por_alias) VALUES (?, ?, ?, ?)');
    for (const l of lapidasPrevias) if (!vivos.has(`${l.tipo}|${l.clave}`)) lapida.run(l.tipo, l.clave, l.fecha, l.por_alias);
    const muerta = db.prepare('INSERT INTO sync_muertas (persona, fecha, viva) VALUES (?, ?, ?)');
    for (const m of muertasPrevias) muerta.run(m.persona, m.fecha, m.viva);
    // Alias de personas (unificar): si el respaldo trae a la persona de origen, o bien el alias ya está en la nube (se borra el
    // local y la próxima bajada lo vuelve a aplicar y la fusiona) o bien nunca se subió (se unifica acá mismo, con marcas nuevas).
    for (const a of db.prepare('SELECT origen, destino, actualizado FROM sync_alias').all().map(f => ({ ...f }))) {
      const origen = db.prepare('SELECT id FROM personas WHERE uid = ?').get(a.origen);
      if (!origen) continue;
      const destino = db.prepare('SELECT id FROM personas WHERE uid = ?').get(resolverAlias(db, a.destino));
      if (a.actualizado <= (leer(db, 'ultimo_envio') ?? '') || !destino) {
        db.prepare('DELETE FROM sync_alias WHERE origen = ?').run(a.origen);
      } else {
        fusionarPersona(db, origen.id, destino.id);
        quitarPersonaFusionada(db, origen.id, a.origen);
      }
    }
    // La bajada se reinicia: la próxima vuelta vuelve a bajar todo de la nube y "gana el más nuevo" lo junta con lo
    // restaurado. `ultimo_envio` se conserva (lo ya enviado no se vuelve a mandar; lo restaurado más nuevo, sí).
    reiniciarBajada(db);
    if (db.prepare('PRAGMA foreign_key_check').all().length) throw new ErrorRespaldo('El archivo tiene referencias a personas, ejercicios o rutinas que no existen.');
    db.exec('COMMIT');
  } catch (err) {
    try { db.exec('ROLLBACK'); } catch { /* ya cerrada */ }
    if (err instanceof ErrorRespaldo) throw err;
    throw new ErrorRespaldo(`No se pudo importar: ${err.message}`);
  }
  return { ok: true, respaldo_previo: seguridad };
}

export function listarArchivos(backupsDir) {
  if (!fs.existsSync(backupsDir)) return [];
  return fs.readdirSync(backupsDir)
    .filter(f => /^[\w.-]+\.db$/.test(f))
    .map(f => { const st = fs.statSync(path.join(backupsDir, f)); return { archivo: f, fecha: st.mtime.toISOString(), tamano: st.size }; })
    .sort((a, b) => b.fecha.localeCompare(a.fecha) || b.archivo.localeCompare(a.archivo));
}

// Restaura un respaldo dentro de la base abierta (sin tocar el archivo en uso).
export function restaurarArchivo(db, backupsDir, archivo) {
  const elegido = listarArchivos(backupsDir).find(b => b.archivo === archivo);
  if (typeof archivo !== 'string' || !elegido) throw new ErrorRespaldo('Ese respaldo no existe.', 404);
  const origen = path.join(backupsDir, elegido.archivo);
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'migym-rest-'));
  const copia = path.join(tmpDir, 'copia.db');
  let datos;
  try {
    fs.copyFileSync(origen, copia);
    const prueba = new DatabaseSync(copia);
    try { prueba.prepare('SELECT COUNT(*) FROM ejercicios').get(); } catch { throw new ErrorRespaldo('Ese archivo no es un respaldo válido.'); } finally { prueba.close(); }
    const version = (() => { const t = new DatabaseSync(copia); try { return versionActual(t); } finally { t.close(); } })();
    if (version > versionActual(db)) throw new ErrorRespaldo('Ese respaldo viene de una versión más nueva de Rumbo Fit.', 409);
    const t = openDb(copia); // la sube a la versión actual si era más vieja
    try { datos = exportarDatos(t); } finally { t.close(); }
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
  return importarDatos(db, datos, { backupsDir });
}

export function respaldoRouter(db, { backupsDir, ahora = () => new Date() }) {
  const router = express.Router();
  router.get('/exportar', (_req, res) => {
    const datos = exportarDatos(db, { ahora: ahora() });
    const nombre = `mi-gym-${datos.fecha.slice(0, 10)}.json`;
    res.setHeader('Content-Disposition', `attachment; filename="${nombre}"`);
    res.json(datos);
  });
  router.post('/importar', (req, res) => res.json(importarDatos(db, req.body, { backupsDir })));
  router.get('/lista', (_req, res) => res.json(listarArchivos(backupsDir)));
  router.post('/ahora', (_req, res) => {
    const archivo = path.basename(backupDb(db, backupsDir, { now: ahora() }));
    res.status(201).json({ archivo, lista: listarArchivos(backupsDir) });
  });
  router.post('/restaurar', (req, res) => res.json(restaurarArchivo(db, backupsDir, req.body?.archivo)));
  router.use((err, _req, res, next) => {
    if (err instanceof ErrorRespaldo) return res.status(err.status).json({ error: err.message });
    next(err);
  });
  return router;
}
