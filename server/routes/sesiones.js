import { Router } from 'express';
import { e1rmEpley, fechaValida, sumarDias, volumenSerie } from '../calculos.js';

const falla = (res, status, error) => res.status(status).json({ error });
const entero = v => Number.isInteger(v);
const numero = v => typeof v === 'number' && Number.isFinite(v);

function texto(valor, max) {
  if (typeof valor !== 'string') return null;
  const t = valor.trim();
  return t.length > 0 && t.length <= max ? t : null;
}

/** Valida peso, reps, rpe y hecha. Devuelve { error } o { datos } con solo lo enviado. */
function validarSerie(body) {
  const datos = {};
  if ('peso_kg' in body) {
    if (body.peso_kg !== null && !(numero(body.peso_kg) && body.peso_kg >= 0 && body.peso_kg <= 1000)) return { error: 'El peso debe estar entre 0 y 1000 kg' };
    datos.peso_kg = body.peso_kg;
  }
  if ('reps' in body) {
    if (body.reps !== null && !(entero(body.reps) && body.reps >= 0 && body.reps <= 1000)) return { error: 'Las repeticiones deben ser un número entero entre 0 y 1000' };
    datos.reps = body.reps;
  }
  if ('rpe' in body) {
    if (body.rpe !== null && !(numero(body.rpe) && body.rpe >= 0 && body.rpe <= 10)) return { error: 'El esfuerzo (RPE) debe estar entre 0 y 10' };
    datos.rpe = body.rpe;
  }
  if ('hecha' in body) {
    if (typeof body.hecha !== 'boolean') return { error: 'El estado de la serie no es válido' };
    datos.hecha = body.hecha ? 1 : 0;
  }
  return { datos };
}

const formatearSerie = f => ({ n: f.n, peso_kg: f.peso_kg, reps: f.reps, rpe: f.rpe, hecha: !!f.hecha });

/** Series hechas de un ejercicio en sesiones finalizadas, de la más vieja a la más nueva. */
export function seriesHechasDe(db, ejercicioId) {
  return db.prepare(`
    SELECT s.id AS sesion_id, s.fecha, h.n, h.peso_kg, h.reps, h.rpe
    FROM series_hechas h JOIN sesiones s ON s.id = h.sesion_id
    WHERE h.ejercicio_id = ? AND h.hecha = 1 AND s.estado = 'finalizada'
    ORDER BY s.fecha, s.id, h.n`).all(ejercicioId);
}

/** Mejor peso y mejor 1RM estimado de una lista de series (gana el primero que lo logró). */
export function mejoresDe(filas) {
  let peso = null;
  let e1rm = null;
  for (const f of filas) {
    if (numero(f.peso_kg) && f.peso_kg > 0 && (peso === null || f.peso_kg > peso.peso_kg)) {
      peso = { peso_kg: f.peso_kg, reps: f.reps, fecha: f.fecha, sesion_id: f.sesion_id };
    }
    const est = e1rmEpley(f.peso_kg, f.reps);
    if (est !== null && (e1rm === null || est > e1rm.valor)) {
      e1rm = { valor: est, peso_kg: f.peso_kg, reps: f.reps, fecha: f.fecha, sesion_id: f.sesion_id };
    }
  }
  return { peso, e1rm };
}

/** Devuelve { router, porEjercicio }: el segundo se monta bajo /api/ejercicios. */
export function sesionesRouter(db, { ahora = () => new Date() } = {}) {
  const router = Router();

  const transaccion = fn => {
    db.exec('BEGIN');
    try { const r = fn(); db.exec('COMMIT'); return r; } catch (err) { db.exec('ROLLBACK'); throw err; }
  };

  const existeEjercicio = id => typeof id === 'string' && !!db.prepare('SELECT 1 FROM ejercicios WHERE id = ?').get(id);

  function ultimasSeries(ejercicioId) {
    const ultima = db.prepare(`
      SELECT s.id, s.fecha FROM series_hechas h JOIN sesiones s ON s.id = h.sesion_id
      WHERE h.ejercicio_id = ? AND h.hecha = 1 AND s.estado = 'finalizada'
      ORDER BY s.fecha DESC, s.id DESC LIMIT 1`).get(ejercicioId);
    if (!ultima) return { sesion_id: null, fecha: null, series: [] };
    const series = db.prepare('SELECT n, peso_kg, reps, rpe FROM series_hechas WHERE sesion_id = ? AND ejercicio_id = ? AND hecha = 1 ORDER BY n')
      .all(ultima.id, ejercicioId);
    return { sesion_id: ultima.id, fecha: ultima.fecha, series };
  }

  /** Récords de una sesión finalizada frente a todo lo anterior. */
  function recordsDe(sesion, ejercicios) {
    const records = [];
    for (const e of ejercicios) {
      const hechas = e.series.filter(x => x.hecha).map(x => ({ ...x, fecha: sesion.fecha, sesion_id: sesion.id }));
      if (!hechas.length) continue;
      const previas = seriesHechasDe(db, e.ejercicio_id).filter(f => f.fecha < sesion.fecha || (f.fecha === sesion.fecha && f.sesion_id < sesion.id));
      if (!previas.length) continue;
      const ahoraMejor = mejoresDe(hechas);
      const antes = mejoresDe(previas);
      if (ahoraMejor.peso && (!antes.peso || ahoraMejor.peso.peso_kg > antes.peso.peso_kg)) {
        records.push({ ejercicio_id: e.ejercicio_id, nombre: e.nombre, tipo: 'peso', valor: ahoraMejor.peso.peso_kg, anterior: antes.peso?.peso_kg ?? null });
      }
      if (ahoraMejor.e1rm && (!antes.e1rm || ahoraMejor.e1rm.valor > antes.e1rm.valor)) {
        records.push({ ejercicio_id: e.ejercicio_id, nombre: e.nombre, tipo: '1rm', valor: ahoraMejor.e1rm.valor, anterior: antes.e1rm?.valor ?? null });
      }
    }
    return records;
  }

  function cargarSesion(id) {
    const s = db.prepare('SELECT id, rutina_id, dia_id, titulo, fecha, fin, duracion, nota, estado FROM sesiones WHERE id = ?').get(id);
    if (!s) return null;
    const ejs = db.prepare(`
      SELECT se.ejercicio_id, se.orden, se.series_plan, se.reps_plan, se.descanso_seg,
             e.nombre, e.musculo_principal, e.equipo, e.img_ini, e.img_fin, e.media_propia
      FROM sesion_ejercicios se JOIN ejercicios e ON e.id = se.ejercicio_id
      WHERE se.sesion_id = ? ORDER BY se.orden`).all(id);
    const series = db.prepare('SELECT ejercicio_id, n, peso_kg, reps, rpe, hecha FROM series_hechas WHERE sesion_id = ? ORDER BY ejercicio_id, n').all(id);
    const ejercicios = ejs.map(e => ({ ...e, series: series.filter(x => x.ejercicio_id === e.ejercicio_id).map(formatearSerie) }));
    const hechas = series.filter(x => x.hecha);
    const resumen = {
      series_hechas: hechas.length,
      ejercicios: new Set(hechas.map(x => x.ejercicio_id)).size,
      volumen_kg: Math.round(hechas.reduce((t, x) => t + volumenSerie(x.peso_kg, x.reps), 0) * 100) / 100,
      records: s.estado === 'finalizada' ? recordsDe(s, ejercicios) : [],
    };
    return { ...s, ejercicios, resumen };
  }

  // ---- Sesiones ----
  router.get('/activa', (_req, res) => {
    const a = db.prepare("SELECT id FROM sesiones WHERE estado = 'en_curso'").get();
    res.json(a ? cargarSesion(a.id) : null);
  });

  router.get('/', (req, res) => {
    const where = [];
    const params = [];
    if (req.query.desde !== undefined) {
      if (!fechaValida(req.query.desde)) return falla(res, 400, 'La fecha "desde" no es válida (AAAA-MM-DD)');
      const [y, m, d] = req.query.desde.split('-').map(Number);
      where.push('s.fecha >= ?'); params.push(new Date(y, m - 1, d).toISOString());
    }
    if (req.query.hasta !== undefined) {
      if (!fechaValida(req.query.hasta)) return falla(res, 400, 'La fecha "hasta" no es válida (AAAA-MM-DD)');
      const [y, m, d] = sumarDias(req.query.hasta, 1).split('-').map(Number);
      where.push('s.fecha < ?'); params.push(new Date(y, m - 1, d).toISOString());
    }
    if (req.query.estado === 'finalizada' || req.query.estado === 'en_curso') { where.push('s.estado = ?'); params.push(req.query.estado); }
    const cond = where.length ? `WHERE ${where.join(' AND ')}` : '';
    const limit = Math.min(200, Math.max(1, Number.parseInt(req.query.limit, 10) || 50));
    const offset = Math.max(0, Number.parseInt(req.query.offset, 10) || 0);
    const total = db.prepare(`SELECT COUNT(*) AS n FROM sesiones s ${cond}`).get(...params).n;
    const filas = db.prepare(`
      SELECT s.id, s.fecha, s.titulo, s.estado, s.duracion, s.nota,
        (SELECT COUNT(*) FROM series_hechas h WHERE h.sesion_id = s.id AND h.hecha = 1) AS series_hechas,
        (SELECT COALESCE(SUM(h.peso_kg * h.reps), 0) FROM series_hechas h WHERE h.sesion_id = s.id AND h.hecha = 1) AS volumen_kg,
        (SELECT COUNT(*) FROM sesion_ejercicios se WHERE se.sesion_id = s.id) AS ejercicios
      FROM sesiones s ${cond} ORDER BY s.fecha DESC, s.id DESC LIMIT ? OFFSET ?`).all(...params, limit, offset);
    const nombres = db.prepare(`
      SELECT e.nombre FROM sesion_ejercicios se JOIN ejercicios e ON e.id = se.ejercicio_id
      WHERE se.sesion_id = ? ORDER BY se.orden LIMIT 4`);
    res.json({ total, limit, offset, items: filas.map(f => ({ ...f, nombres: nombres.all(f.id).map(n => n.nombre) })) });
  });

  router.post('/', (req, res) => {
    const body = req.body ?? {};
    const activa = db.prepare("SELECT id FROM sesiones WHERE estado = 'en_curso'").get();
    if (activa) return res.status(409).json({ error: 'Ya hay un entrenamiento en curso', activa_id: activa.id });

    let rutina = null;
    let dia = null;
    if (body.dia_id !== undefined && body.dia_id !== null) {
      dia = db.prepare('SELECT id, nombre, rutina_id FROM rutina_dias WHERE id = ?').get(body.dia_id);
      if (!dia) return falla(res, 404, 'Día no encontrado');
      rutina = db.prepare('SELECT id, nombre FROM rutinas WHERE id = ?').get(dia.rutina_id);
      if (body.rutina_id != null && body.rutina_id !== dia.rutina_id) return falla(res, 400, 'El día no pertenece a esa rutina');
    } else if (body.rutina_id !== undefined && body.rutina_id !== null) {
      rutina = db.prepare('SELECT id, nombre FROM rutinas WHERE id = ?').get(body.rutina_id);
      if (!rutina) return falla(res, 404, 'Rutina no encontrada');
    }
    const titulo = dia ? `${rutina.nombre} – ${dia.nombre}` : rutina ? rutina.nombre : (texto(body.titulo, 80) ?? 'Sesión libre');

    const id = transaccion(() => {
      const nuevo = Number(db.prepare("INSERT INTO sesiones (rutina_id, dia_id, titulo, fecha, estado) VALUES (?, ?, ?, ?, 'en_curso')")
        .run(rutina?.id ?? null, dia?.id ?? null, titulo, ahora().toISOString()).lastInsertRowid);
      if (dia) {
        const plan = db.prepare('SELECT ejercicio_id, series, reps, descanso_seg FROM rutina_ejercicios WHERE dia_id = ? ORDER BY orden, id').all(dia.id);
        const insEj = db.prepare('INSERT OR IGNORE INTO sesion_ejercicios (sesion_id, ejercicio_id, orden, series_plan, reps_plan, descanso_seg) VALUES (?, ?, ?, ?, ?, ?)');
        const insSerie = db.prepare('INSERT INTO series_hechas (sesion_id, ejercicio_id, n, peso_kg, reps, hecha) VALUES (?, ?, ?, ?, ?, 0)');
        let orden = 0;
        for (const p of plan) {
          if (insEj.run(nuevo, p.ejercicio_id, orden, p.series, p.reps, p.descanso_seg).changes === 0) continue;
          orden += 1;
          const ultimas = ultimasSeries(p.ejercicio_id).series;
          const repsPlan = Number.parseInt(p.reps, 10);
          for (let i = 0; i < p.series; i++) {
            const previa = ultimas[i] ?? ultimas.at(-1);
            insSerie.run(nuevo, p.ejercicio_id, i + 1, previa?.peso_kg ?? null, previa?.reps ?? (Number.isFinite(repsPlan) ? repsPlan : null));
          }
        }
      }
      return nuevo;
    });
    res.status(201).json(cargarSesion(id));
  });

  router.get('/:id', (req, res) => {
    const s = cargarSesion(req.params.id);
    if (!s) return falla(res, 404, 'Sesión no encontrada');
    res.json(s);
  });

  router.patch('/:id', (req, res) => {
    const s = db.prepare('SELECT id, fecha, estado FROM sesiones WHERE id = ?').get(req.params.id);
    if (!s) return falla(res, 404, 'Sesión no encontrada');
    const body = req.body ?? {};
    if (!('nota' in body) && body.finalizar !== true) return falla(res, 400, 'No hay nada para actualizar');
    if ('nota' in body && body.nota !== null && (typeof body.nota !== 'string' || body.nota.length > 1000)) {
      return falla(res, 400, 'La nota es demasiado larga (máximo 1000 caracteres)');
    }
    transaccion(() => {
      if ('nota' in body) db.prepare('UPDATE sesiones SET nota = ? WHERE id = ?').run(body.nota?.trim() || null, s.id);
      if (body.finalizar === true && s.estado === 'en_curso') {
        const fin = ahora();
        const duracion = Math.max(0, Math.round((fin.getTime() - new Date(s.fecha).getTime()) / 1000));
        db.prepare('DELETE FROM series_hechas WHERE sesion_id = ? AND hecha = 0').run(s.id);
        db.prepare('DELETE FROM sesion_ejercicios WHERE sesion_id = ? AND ejercicio_id NOT IN (SELECT ejercicio_id FROM series_hechas WHERE sesion_id = ?)').run(s.id, s.id);
        db.prepare("UPDATE sesiones SET estado = 'finalizada', fin = ?, duracion = ? WHERE id = ?").run(fin.toISOString(), duracion, s.id);
      }
    });
    res.json(cargarSesion(s.id));
  });

  router.delete('/:id', (req, res) => {
    const info = db.prepare('DELETE FROM sesiones WHERE id = ?').run(req.params.id);
    if (!info.changes) return falla(res, 404, 'Sesión no encontrada');
    res.json({ ok: true });
  });

  // ---- Series ----
  const sesionExiste = id => db.prepare('SELECT id FROM sesiones WHERE id = ?').get(id);
  const leerSerie = (sesion, ejercicio, n) =>
    db.prepare('SELECT n, peso_kg, reps, rpe, hecha FROM series_hechas WHERE sesion_id = ? AND ejercicio_id = ? AND n = ?').get(sesion, ejercicio, n);

  router.post('/:id/series', (req, res) => {
    const s = sesionExiste(req.params.id);
    if (!s) return falla(res, 404, 'Sesión no encontrada');
    const body = req.body ?? {};
    if (!existeEjercicio(body.ejercicio_id)) return falla(res, 404, 'Ejercicio no encontrado');
    const { error, datos } = validarSerie(body);
    if (error) return falla(res, 400, error);
    const ej = body.ejercicio_id;
    let n = body.n;
    if (n === undefined || n === null) {
      n = db.prepare('SELECT COALESCE(MAX(n), 0) + 1 AS n FROM series_hechas WHERE sesion_id = ? AND ejercicio_id = ?').get(s.id, ej).n;
    } else if (!entero(n) || n < 1 || n > 200) {
      return falla(res, 400, 'El número de serie no es válido');
    } else if (leerSerie(s.id, ej, n)) {
      return falla(res, 409, 'Esa serie ya existe');
    }
    transaccion(() => {
      if (!db.prepare('SELECT 1 FROM sesion_ejercicios WHERE sesion_id = ? AND ejercicio_id = ?').get(s.id, ej)) {
        const orden = db.prepare('SELECT COALESCE(MAX(orden) + 1, 0) AS o FROM sesion_ejercicios WHERE sesion_id = ?').get(s.id).o;
        db.prepare('INSERT INTO sesion_ejercicios (sesion_id, ejercicio_id, orden, series_plan, reps_plan, descanso_seg) VALUES (?, ?, ?, 0, NULL, 90)').run(s.id, ej, orden);
      }
      db.prepare('INSERT INTO series_hechas (sesion_id, ejercicio_id, n, peso_kg, reps, rpe, hecha) VALUES (?, ?, ?, ?, ?, ?, ?)')
        .run(s.id, ej, n, datos.peso_kg ?? null, datos.reps ?? null, datos.rpe ?? null, datos.hecha ?? 0);
    });
    res.status(201).json(formatearSerie(leerSerie(s.id, ej, n)));
  });

  router.patch('/:id/series/:ejercicioId/:n', (req, res) => {
    const n = Number(req.params.n);
    const actual = entero(n) ? leerSerie(req.params.id, req.params.ejercicioId, n) : null;
    if (!actual) return falla(res, 404, 'Serie no encontrada');
    const { error, datos } = validarSerie(req.body ?? {});
    if (error) return falla(res, 400, error);
    const campos = Object.keys(datos);
    if (!campos.length) return falla(res, 400, 'No hay nada para actualizar');
    db.prepare(`UPDATE series_hechas SET ${campos.map(c => `${c} = ?`).join(', ')} WHERE sesion_id = ? AND ejercicio_id = ? AND n = ?`)
      .run(...campos.map(c => datos[c]), req.params.id, req.params.ejercicioId, n);
    res.json(formatearSerie(leerSerie(req.params.id, req.params.ejercicioId, n)));
  });

  router.delete('/:id/series/:ejercicioId/:n', (req, res) => {
    const n = Number(req.params.n);
    if (!entero(n) || !leerSerie(req.params.id, req.params.ejercicioId, n)) return falla(res, 404, 'Serie no encontrada');
    transaccion(() => {
      db.prepare('DELETE FROM series_hechas WHERE sesion_id = ? AND ejercicio_id = ? AND n = ?').run(req.params.id, req.params.ejercicioId, n);
      // Renumera para que no queden huecos (en orden ascendente no hay choques de clave).
      db.prepare('UPDATE series_hechas SET n = n - 1 WHERE sesion_id = ? AND ejercicio_id = ? AND n > ?').run(req.params.id, req.params.ejercicioId, n);
    });
    res.json({ ok: true });
  });

  router.delete('/:id/ejercicios/:ejercicioId', (req, res) => {
    const info = db.prepare('DELETE FROM sesion_ejercicios WHERE sesion_id = ? AND ejercicio_id = ?').run(req.params.id, req.params.ejercicioId);
    if (!info.changes) return falla(res, 404, 'Ese ejercicio no está en la sesión');
    db.prepare('DELETE FROM series_hechas WHERE sesion_id = ? AND ejercicio_id = ?').run(req.params.id, req.params.ejercicioId);
    res.json({ ok: true });
  });

  // ---- Por ejercicio: lo de la última vez e historial ----
  const porEjercicio = Router();

  porEjercicio.get('/:id/ultima', (req, res) => {
    if (!existeEjercicio(req.params.id)) return falla(res, 404, 'Ejercicio no encontrado');
    res.json(ultimasSeries(req.params.id));
  });

  porEjercicio.get('/:id/historial', (req, res) => {
    if (!existeEjercicio(req.params.id)) return falla(res, 404, 'Ejercicio no encontrado');
    const filas = seriesHechasDe(db, req.params.id);
    const porSesion = new Map();
    for (const f of filas) {
      if (!porSesion.has(f.sesion_id)) porSesion.set(f.sesion_id, { sesion_id: f.sesion_id, fecha: f.fecha, series: [] });
      porSesion.get(f.sesion_id).series.push({ n: f.n, peso_kg: f.peso_kg, reps: f.reps, rpe: f.rpe, e1rm: e1rmEpley(f.peso_kg, f.reps) });
    }
    const sesiones = [...porSesion.values()].map(s => {
      const m = mejoresDe(s.series.map(x => ({ ...x, fecha: s.fecha, sesion_id: s.sesion_id })));
      return {
        ...s,
        volumen_kg: Math.round(s.series.reduce((t, x) => t + volumenSerie(x.peso_kg, x.reps), 0) * 100) / 100,
        mejor_peso: m.peso?.peso_kg ?? null,
        mejor_e1rm: m.e1rm?.valor ?? null,
        mejor_reps: Math.max(0, ...s.series.map(x => x.reps ?? 0)),
      };
    });
    const m = mejoresDe(filas);
    res.json({ ejercicio_id: req.params.id, total_sesiones: sesiones.length, sesiones, mejor_peso: m.peso, mejor_e1rm: m.e1rm });
  });

  return { router, porEjercicio };
}
