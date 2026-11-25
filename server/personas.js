// Personas: cada una tiene sus rutinas, entrenamientos, medidas, perfil y favoritos.
// La persona activa llega en el encabezado X-Persona; si hay una sola, no hace falta.
import { Router } from 'express';
import { claveSembrado, sembrarPlantillas } from './plantillas.js';

const falla = (res, status, error) => res.status(status).json({ error });

export const PALETA = ['#c6ff3d', '#ff7a1a', '#4dc3ff', '#ff5fa2', '#b48cff', '#3ddc84', '#ffd23d', '#ff4d4d'];
const COLOR = /^#[0-9a-fA-F]{6}$/;

function texto(valor, max) {
  if (typeof valor !== 'string') return null;
  const t = valor.trim();
  return t.length > 0 && t.length <= max ? t : null;
}

/** Middleware: deja la persona activa en req.persona (id). Responde 400 si falta o no existe. */
export function conPersona(db) {
  return (req, res, next) => {
    const crudo = req.get('x-persona');
    if (crudo === undefined || crudo === '') {
      const todas = db.prepare('SELECT id FROM personas LIMIT 2').all();
      if (todas.length !== 1) return falla(res, 400, 'Elegí quién entrena (falta el encabezado X-Persona)');
      req.persona = todas[0].id;
      return next();
    }
    const id = /^\d+$/.test(crudo) ? Number(crudo) : NaN;
    if (!Number.isSafeInteger(id) || !db.prepare('SELECT 1 FROM personas WHERE id = ?').get(id)) return falla(res, 400, 'La persona elegida no existe');
    req.persona = id;
    next();
  };
}

export function personasRouter(db) {
  const router = Router();
  const leer = id => db.prepare('SELECT id, nombre, color, avatar, creada FROM personas WHERE id = ?').get(id);
  const repetido = (nombre, exceptoId = 0) =>
    db.prepare('SELECT 1 FROM personas WHERE nombre = ? COLLATE NOCASE AND id != ?').get(nombre, exceptoId);

  function validar(body, { completo }) {
    const datos = {};
    if ('nombre' in body || completo) {
      const n = texto(body.nombre, 30);
      if (!n) return { error: 'La persona necesita un nombre (máximo 30 caracteres)' };
      datos.nombre = n;
    }
    if ('color' in body) {
      if (typeof body.color !== 'string' || !COLOR.test(body.color)) return { error: 'El color no es válido (formato #rrggbb)' };
      datos.color = body.color.toLowerCase();
    }
    if ('avatar' in body) {
      if (typeof body.avatar !== 'string' || body.avatar.trim().length > 16) return { error: 'El avatar es demasiado largo' };
      datos.avatar = body.avatar.trim();
    }
    return { datos };
  }

  router.get('/', (_req, res) => {
    res.json(db.prepare('SELECT id, nombre, color, avatar, creada FROM personas ORDER BY id').all());
  });

  router.post('/', (req, res) => {
    const { error, datos } = validar(req.body ?? {}, { completo: true });
    if (error) return falla(res, 400, error);
    if (repetido(datos.nombre)) return falla(res, 409, 'Ya hay una persona con ese nombre');
    const cuantas = db.prepare('SELECT COUNT(*) AS n FROM personas').get().n;
    const id = Number(db.prepare('INSERT INTO personas (nombre, color, avatar, creada) VALUES (?, ?, ?, ?)')
      .run(datos.nombre, datos.color ?? PALETA[cuantas % PALETA.length], datos.avatar ?? '', new Date().toISOString()).lastInsertRowid);
    sembrarPlantillas(db, undefined, id); // las 2 rutinas de ejemplo, como a quien instala la app
    res.status(201).json(leer(id));
  });

  router.patch('/:id', (req, res) => {
    const actual = /^\d+$/.test(req.params.id) ? leer(Number(req.params.id)) : null;
    if (!actual) return falla(res, 404, 'Persona no encontrada');
    const { error, datos } = validar(req.body ?? {}, { completo: false });
    if (error) return falla(res, 400, error);
    const campos = Object.keys(datos);
    if (!campos.length) return falla(res, 400, 'No hay nada para actualizar');
    if (datos.nombre && repetido(datos.nombre, actual.id)) return falla(res, 409, 'Ya hay una persona con ese nombre');
    db.prepare(`UPDATE personas SET ${campos.map(c => `${c} = ?`).join(', ')} WHERE id = ?`).run(...campos.map(c => datos[c]), actual.id);
    res.json(leer(actual.id));
  });

  router.delete('/:id', (req, res) => {
    const actual = /^\d+$/.test(req.params.id) ? leer(Number(req.params.id)) : null;
    if (!actual) return falla(res, 404, 'Persona no encontrada');
    if (db.prepare('SELECT COUNT(*) AS n FROM personas').get().n <= 1) return falla(res, 409, 'No se puede borrar la última persona');
    db.exec('BEGIN');
    try {
      // Las claves foráneas en cascada se llevan rutinas, sesiones, medidas, perfil y favoritos.
      db.prepare('DELETE FROM personas WHERE id = ?').run(actual.id);
      db.prepare('DELETE FROM ajustes WHERE clave = ?').run(claveSembrado(actual.id));
      db.exec('COMMIT');
    } catch (err) { db.exec('ROLLBACK'); throw err; }
    res.json({ ok: true });
  });

  return router;
}
