import { Router } from 'express';
import { normalizar } from '../normalizar.js';

const LIMITE_MAX = 200;
const COLS_LISTA = 'id, nombre, nombre_en, musculo_principal, musculos_sec, equipo, categoria, nivel, img_ini, img_fin, media_propia, favorito, traducido';

function formatear(fila, { detalle = false } = {}) {
  if (!fila) return null;
  const out = { ...fila, musculos_sec: JSON.parse(fila.musculos_sec ?? '[]'), favorito: !!fila.favorito };
  if (detalle) out.instrucciones = JSON.parse(fila.instrucciones ?? '[]');
  return out;
}

function entero(valor, porDefecto, min, max) {
  const n = Number.parseInt(valor, 10);
  if (!Number.isFinite(n)) return porDefecto;
  return Math.min(max, Math.max(min, n));
}

const escaparLike = t => t.replace(/[\\%_]/g, c => `\\${c}`);

export function ejerciciosRouter(db) {
  const router = Router();

  router.get('/', (req, res) => {
    const where = [];
    const params = [];
    const terminos = normalizar(req.query.q).split(' ').filter(Boolean);
    for (const t of terminos) { where.push("busqueda LIKE ? ESCAPE '\\'"); params.push(`%${escaparLike(t)}%`); }
    for (const [campo, col] of [['musculo', 'musculo_principal'], ['equipo', 'equipo'], ['nivel', 'nivel'], ['categoria', 'categoria']]) {
      if (req.query[campo]) { where.push(`${col} = ?`); params.push(String(req.query[campo])); }
    }
    if (req.query.favoritos === '1') where.push('favorito = 1');
    const cond = where.length ? `WHERE ${where.join(' AND ')}` : '';
    const limit = entero(req.query.limit, 50, 1, LIMITE_MAX);
    const offset = entero(req.query.offset, 0, 0, Number.MAX_SAFE_INTEGER);
    const total = db.prepare(`SELECT COUNT(*) AS n FROM ejercicios ${cond}`).get(...params).n;
    const filas = db.prepare(`SELECT ${COLS_LISTA} FROM ejercicios ${cond} ORDER BY nombre COLLATE NOCASE, id LIMIT ? OFFSET ?`)
      .all(...params, limit, offset);
    res.json({ total, limit, offset, items: filas.map(f => formatear(f)) });
  });

  router.get('/filtros', (_req, res) => {
    const contar = col => db.prepare(`SELECT ${col} AS valor, COUNT(*) AS cantidad FROM ejercicios WHERE ${col} IS NOT NULL GROUP BY ${col} ORDER BY cantidad DESC, valor`).all();
    res.json({
      musculos: contar('musculo_principal'),
      equipos: contar('equipo'),
      niveles: contar('nivel'),
      categorias: contar('categoria'),
    });
  });

  router.get('/:id', (req, res) => {
    const fila = db.prepare('SELECT * FROM ejercicios WHERE id = ?').get(req.params.id);
    if (!fila) return res.status(404).json({ error: 'Ejercicio no encontrado' });
    res.json(formatear(fila, { detalle: true }));
  });

  router.patch('/:id', (req, res) => {
    const existe = db.prepare('SELECT id FROM ejercicios WHERE id = ?').get(req.params.id);
    if (!existe) return res.status(404).json({ error: 'Ejercicio no encontrado' });
    const body = req.body ?? {};
    const sets = [];
    const params = [];
    if ('favorito' in body) {
      if (![true, false, 0, 1].includes(body.favorito)) return res.status(400).json({ error: 'favorito debe ser verdadero o falso' });
      sets.push('favorito = ?'); params.push(body.favorito ? 1 : 0);
    }
    if ('media_propia' in body) {
      const m = body.media_propia;
      if (m !== null && (typeof m !== 'string' || m.length > 500)) return res.status(400).json({ error: 'media_propia inválida' });
      sets.push('media_propia = ?'); params.push(m === '' ? null : m);
    }
    if (!sets.length) return res.status(400).json({ error: 'No hay nada para actualizar' });
    db.prepare(`UPDATE ejercicios SET ${sets.join(', ')} WHERE id = ?`).run(...params, req.params.id);
    const fila = db.prepare('SELECT * FROM ejercicios WHERE id = ?').get(req.params.id);
    res.json(formatear(fila, { detalle: true }));
  });

  return router;
}
