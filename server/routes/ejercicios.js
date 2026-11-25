import { Router, raw } from 'express';
import fs from 'node:fs';
import path from 'node:path';
import { normalizar } from '../normalizar.js';
import { POPULARES } from '../populares.js';

const LIMITE_MAX = 200;
const COLS_LISTA = 'id, nombre, nombre_en, musculo_principal, musculos_sec, equipo, categoria, nivel, img_ini, img_fin, media_propia, traducido';
// Los favoritos son de cada persona: la lista los calcula con su id como primer parámetro.
const ES_FAVORITO = 'EXISTS (SELECT 1 FROM favoritos f WHERE f.persona_id = ? AND f.ejercicio_id = ejercicios.id)';

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

// Clave de orden [nivel, largo]: menor = más relevante. El largo desempata para que
// "Sentadilla con barra" salga antes que "Sentadilla búlgara con mancuernas".
export function relevancia(fila, q) {
  const n = normalizar(fila.nombre);
  const e = normalizar(fila.nombre_en);
  if (n === q) return [0, n.length];
  if (e === q) return [1, e.length];
  if (n.startsWith(q)) return [2, n.length];
  if (e.startsWith(q)) return [3, e.length];
  if (` ${n}`.includes(` ${q}`)) return [4, n.length];
  if (` ${e}`.includes(` ${q}`)) return [5, e.length];
  return [6, n.length];
}

const escaparLike =t => t.replace(/[\\%_]/g, c => `\\${c}`);

const TIPOS_MEDIA = {
  'image/gif': 'gif', 'video/mp4': 'mp4', 'video/webm': 'webm', 'image/jpeg': 'jpg', 'image/png': 'png',
};
const MEDIA_MAX = 30 * 1024 * 1024;

export function ejerciciosRouter(db, { mediaDir } = {}) {
  const router = Router();

  router.get('/', (req, res) => {
    const where = [];
    const params = [];
    const terminos = normalizar(req.query.q).split(' ').filter(Boolean);
    for (const t of terminos) { where.push("busqueda LIKE ? ESCAPE '\\'"); params.push(`%${escaparLike(t)}%`); }
    for (const [campo, col] of [['musculo', 'musculo_principal'], ['equipo', 'equipo'], ['nivel', 'nivel'], ['categoria', 'categoria']]) {
      if (req.query[campo]) { where.push(`${col} = ?`); params.push(String(req.query[campo])); }
    }
    if (req.query.favoritos === '1') { where.push(ES_FAVORITO); params.push(req.persona); }
    const cond = where.length ? `WHERE ${where.join(' AND ')}` : '';
    const limit = entero(req.query.limit, 50, 1, LIMITE_MAX);
    const offset = entero(req.query.offset, 0, 0, Number.MAX_SAFE_INTEGER);
    if (terminos.length) {
      // Con texto buscado, ordenamos por relevancia en JS (el catálogo entero son ~900 filas).
      const todas = db.prepare(`SELECT ${COLS_LISTA}, ${ES_FAVORITO} AS favorito FROM ejercicios ${cond}`).all(req.persona, ...params);
      const q = terminos.join(' ');
      const conClave = todas.map(f => ({ f, clave: relevancia(f, q) }));
      conClave.sort((a, b) => a.clave[0] - b.clave[0]
        || (POPULARES.has(b.f.id) - POPULARES.has(a.f.id)) || a.clave[1] - b.clave[1]
        || normalizar(a.f.nombre).localeCompare(normalizar(b.f.nombre), 'es') || a.f.id.localeCompare(b.f.id));
      const items = conClave.slice(offset, offset + limit).map(x => formatear(x.f));
      return res.json({ total: todas.length, limit, offset, items });
    }
    const total = db.prepare(`SELECT COUNT(*) AS n FROM ejercicios ${cond}`).get(...params).n;
    const filas = db.prepare(`SELECT ${COLS_LISTA}, ${ES_FAVORITO} AS favorito FROM ejercicios ${cond} ORDER BY nombre COLLATE NOCASE, id LIMIT ? OFFSET ?`)
      .all(req.persona, ...params, limit, offset);
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

  const esFavorito = (persona, id) => !!db.prepare('SELECT 1 FROM favoritos WHERE persona_id = ? AND ejercicio_id = ?').get(persona, id);
  const detallePara = (persona, id) => {
    const fila = db.prepare('SELECT * FROM ejercicios WHERE id = ?').get(id);
    return fila ? formatear({ ...fila, favorito: esFavorito(persona, id) }, { detalle: true }) : null;
  };

  router.get('/:id', (req, res) => {
    const out = detallePara(req.persona, req.params.id);
    if (!out) return res.status(404).json({ error: 'Ejercicio no encontrado' });
    res.json(out);
  });

  router.patch('/:id', (req, res) => {
    const existe = db.prepare('SELECT id FROM ejercicios WHERE id = ?').get(req.params.id);
    if (!existe) return res.status(404).json({ error: 'Ejercicio no encontrado' });
    const body = req.body ?? {};
    const sets = [];
    const params = [];
    const cambios = [];
    if ('favorito' in body) {
      if (![true, false, 0, 1].includes(body.favorito)) return res.status(400).json({ error: 'favorito debe ser verdadero o falso' });
      cambios.push(() => {
        if (body.favorito) db.prepare('INSERT OR IGNORE INTO favoritos (persona_id, ejercicio_id) VALUES (?, ?)').run(req.persona, req.params.id);
        else db.prepare('DELETE FROM favoritos WHERE persona_id = ? AND ejercicio_id = ?').run(req.persona, req.params.id);
      });
    }
    if ('media_propia' in body) {
      const m = body.media_propia;
      if (m !== null && (typeof m !== 'string' || m.length > 500)) return res.status(400).json({ error: 'media_propia inválida' });
      sets.push('media_propia = ?'); params.push(m === '' ? null : m);
    }
    if (!sets.length && !cambios.length) return res.status(400).json({ error: 'No hay nada para actualizar' });
    if (sets.length) db.prepare(`UPDATE ejercicios SET ${sets.join(', ')} WHERE id = ?`).run(...params, req.params.id);
    for (const c of cambios) c();
    res.json(detallePara(req.persona, req.params.id));
  });

  // Media propia (GIF, video o foto subida por la persona).
  const nombreSeguro = id => id.replace(/[^A-Za-z0-9_-]/g, '_');
  const borrarArchivos = id => {
    if (!mediaDir || !fs.existsSync(mediaDir)) return;
    const prefijo = `${nombreSeguro(id)}.`;
    for (const f of fs.readdirSync(mediaDir)) if (f.startsWith(prefijo)) fs.rmSync(path.join(mediaDir, f), { force: true });
  };

  router.post('/:id/media', raw({ type: () => true, limit: MEDIA_MAX }), (req, res) => {
    if (!mediaDir) return res.status(501).json({ error: 'La subida de archivos no está habilitada' });
    const existe = db.prepare('SELECT id FROM ejercicios WHERE id = ?').get(req.params.id);
    if (!existe) return res.status(404).json({ error: 'Ejercicio no encontrado' });
    const tipo = String(req.headers['content-type'] ?? '').split(';')[0].trim().toLowerCase();
    const ext = TIPOS_MEDIA[tipo];
    if (!ext) return res.status(415).json({ error: 'Formato no permitido. Usá GIF, MP4, WebM, JPG o PNG' });
    if (!Buffer.isBuffer(req.body) || req.body.length === 0) return res.status(400).json({ error: 'El archivo está vacío' });
    const base = nombreSeguro(req.params.id);
    fs.mkdirSync(mediaDir, { recursive: true });
    borrarArchivos(req.params.id);
    fs.writeFileSync(path.join(mediaDir, `${base}.${ext}`), req.body);
    db.prepare('UPDATE ejercicios SET media_propia = ? WHERE id = ?').run(`/media/${base}.${ext}?v=${Date.now()}`, req.params.id);
    res.json(detallePara(req.persona, req.params.id));
  });

  router.delete('/:id/media', (req, res) => {
    const existe = db.prepare('SELECT id FROM ejercicios WHERE id = ?').get(req.params.id);
    if (!existe) return res.status(404).json({ error: 'Ejercicio no encontrado' });
    borrarArchivos(req.params.id);
    db.prepare('UPDATE ejercicios SET media_propia = NULL WHERE id = ?').run(req.params.id);
    res.json(detallePara(req.persona, req.params.id));
  });

  return router;
}
