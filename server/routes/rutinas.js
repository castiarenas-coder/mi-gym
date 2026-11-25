import { Router } from 'express';

const falla = (res, status, error) => res.status(status).json({ error });

function texto(valor, max) {
  if (typeof valor !== 'string') return null;
  const t = valor.trim();
  return t.length > 0 && t.length <= max ? t : null;
}

function entero(valor, min, max) {
  return Number.isInteger(valor) && valor >= min && valor <= max ? valor : null;
}

// Valida los campos de un ejercicio de rutina. Devuelve { error } o { datos } con solo lo enviado.
function validarItem(body, { completo }) {
  const datos = {};
  if ('series' in body || completo) {
    const v = entero(body.series ?? 3, 1, 20);
    if (v === null) return { error: 'Las series deben ser un número entre 1 y 20' };
    datos.series = v;
  }
  if ('reps' in body || completo) {
    const v = texto(String(body.reps ?? '10'), 20);
    if (v === null) return { error: 'Las repeticiones no pueden estar vacías (máximo 20 caracteres)' };
    datos.reps = v;
  }
  if ('descanso_seg' in body || completo) {
    const v = entero(body.descanso_seg ?? 90, 0, 1200);
    if (v === null) return { error: 'El descanso debe estar entre 0 y 1200 segundos' };
    datos.descanso_seg = v;
  }
  if ('nota' in body) {
    if (body.nota !== null && (typeof body.nota !== 'string' || body.nota.length > 300)) return { error: 'La nota es demasiado larga (máximo 300 caracteres)' };
    datos.nota = body.nota?.trim() || null;
  }
  return { datos };
}

export function rutinasRouter(db) {
  const router = Router();

  const transaccion = fn => {
    db.exec('BEGIN');
    try { const r = fn(); db.exec('COMMIT'); return r; } catch (err) { db.exec('ROLLBACK'); throw err; }
  };

  function cargarRutina(id) {
    const r = db.prepare('SELECT id, nombre, descripcion FROM rutinas WHERE id = ?').get(id);
    if (!r) return null;
    const dias = db.prepare('SELECT id, nombre, orden FROM rutina_dias WHERE rutina_id = ? ORDER BY orden, id').all(id);
    const items = db.prepare(`
      SELECT re.id, re.dia_id, re.ejercicio_id, re.orden, re.series, re.reps, re.descanso_seg, re.nota,
             e.nombre, e.musculo_principal, e.equipo, e.img_ini, e.media_propia
      FROM rutina_ejercicios re JOIN ejercicios e ON e.id = re.ejercicio_id
      WHERE re.dia_id IN (SELECT id FROM rutina_dias WHERE rutina_id = ?)
      ORDER BY re.orden, re.id`).all(id);
    return {
      ...r,
      dias: dias.map(d => ({ ...d, ejercicios: items.filter(i => i.dia_id === d.id).map(({ dia_id: _d, ...i }) => ({ ...i })) })),
    };
  }

  const diaDeRutina = (rutinaId, diaId) =>
    db.prepare('SELECT id, nombre, orden FROM rutina_dias WHERE id = ? AND rutina_id = ?').get(diaId, rutinaId);

  function crearDias(rutinaId, nombres, desde = 0) {
    const ins = db.prepare('INSERT INTO rutina_dias (rutina_id, nombre, orden) VALUES (?, ?, ?)');
    nombres.forEach((n, i) => ins.run(rutinaId, n, desde + i));
  }

  // Aplica un orden completo: `ids` debe ser exactamente el conjunto actual.
  function reordenar(res, tabla, actuales, ids) {
    const validos = Array.isArray(ids) && ids.length === actuales.length
      && new Set(ids).size === ids.length && ids.every(i => actuales.includes(i));
    if (!validos) { falla(res, 400, 'La lista de orden no coincide con los elementos actuales'); return false; }
    transaccion(() => {
      const upd = db.prepare(`UPDATE ${tabla} SET orden = ? WHERE id = ?`);
      ids.forEach((id, i) => upd.run(i, id));
    });
    return true;
  }

  router.get('/', (_req, res) => {
    const rutinas = db.prepare('SELECT id, nombre, descripcion FROM rutinas ORDER BY id').all();
    const dias = db.prepare(`
      SELECT d.id, d.rutina_id, d.nombre, d.orden, COUNT(re.id) AS cantidad
      FROM rutina_dias d LEFT JOIN rutina_ejercicios re ON re.dia_id = d.id
      GROUP BY d.id ORDER BY d.orden, d.id`).all();
    res.json(rutinas.map(r => {
      const mios = dias.filter(d => d.rutina_id === r.id).map(({ rutina_id: _r, ...d }) => d);
      return { ...r, dias: mios, total_ejercicios: mios.reduce((n, d) => n + d.cantidad, 0) };
    }));
  });

  router.post('/', (req, res) => {
    const body = req.body ?? {};
    const nombre = texto(body.nombre, 80);
    if (!nombre) return falla(res, 400, 'La rutina necesita un nombre (máximo 80 caracteres)');
    const descripcion = typeof body.descripcion === 'string' ? body.descripcion.trim().slice(0, 500) : '';
    let nombresDias = ['Día 1'];
    if (Array.isArray(body.dias) && body.dias.length) {
      nombresDias = body.dias.map(d => texto(d, 60));
      if (nombresDias.includes(null)) return falla(res, 400, 'Cada día necesita un nombre (máximo 60 caracteres)');
    }
    const id = transaccion(() => {
      const nuevo = Number(db.prepare('INSERT INTO rutinas (nombre, descripcion) VALUES (?, ?)').run(nombre, descripcion).lastInsertRowid);
      crearDias(nuevo, nombresDias);
      return nuevo;
    });
    res.status(201).json(cargarRutina(id));
  });

  router.get('/:id', (req, res) => {
    const r = cargarRutina(req.params.id);
    if (!r) return falla(res, 404, 'Rutina no encontrada');
    res.json(r);
  });

  router.patch('/:id', (req, res) => {
    if (!db.prepare('SELECT 1 FROM rutinas WHERE id = ?').get(req.params.id)) return falla(res, 404, 'Rutina no encontrada');
    const body = req.body ?? {};
    const sets = [];
    const params = [];
    if ('nombre' in body) {
      const n = texto(body.nombre, 80);
      if (!n) return falla(res, 400, 'La rutina necesita un nombre (máximo 80 caracteres)');
      sets.push('nombre = ?'); params.push(n);
    }
    if ('descripcion' in body) {
      if (typeof body.descripcion !== 'string' || body.descripcion.length > 500) return falla(res, 400, 'La descripción es demasiado larga (máximo 500 caracteres)');
      sets.push('descripcion = ?'); params.push(body.descripcion.trim());
    }
    if (!sets.length) return falla(res, 400, 'No hay nada para actualizar');
    db.prepare(`UPDATE rutinas SET ${sets.join(', ')} WHERE id = ?`).run(...params, req.params.id);
    res.json(cargarRutina(req.params.id));
  });

  router.delete('/:id', (req, res) => {
    const info = db.prepare('DELETE FROM rutinas WHERE id = ?').run(req.params.id);
    if (!info.changes) return falla(res, 404, 'Rutina no encontrada');
    res.json({ ok: true });
  });

  router.post('/:id/duplicar', (req, res) => {
    const origen = cargarRutina(req.params.id);
    if (!origen) return falla(res, 404, 'Rutina no encontrada');
    const id = transaccion(() => {
      const nuevo = Number(db.prepare('INSERT INTO rutinas (nombre, descripcion) VALUES (?, ?)')
        .run(`${origen.nombre} (copia)`.slice(0, 80), origen.descripcion).lastInsertRowid);
      const insDia = db.prepare('INSERT INTO rutina_dias (rutina_id, nombre, orden) VALUES (?, ?, ?)');
      const insItem = db.prepare('INSERT INTO rutina_ejercicios (dia_id, ejercicio_id, orden, series, reps, descanso_seg, nota) VALUES (?, ?, ?, ?, ?, ?, ?)');
      origen.dias.forEach((d, i) => {
        const diaId = Number(insDia.run(nuevo, d.nombre, i).lastInsertRowid);
        d.ejercicios.forEach((e, o) => insItem.run(diaId, e.ejercicio_id, o, e.series, e.reps, e.descanso_seg, e.nota));
      });
      return nuevo;
    });
    res.status(201).json(cargarRutina(id));
  });

  // ---- Días ----
  router.post('/:id/dias', (req, res) => {
    if (!db.prepare('SELECT 1 FROM rutinas WHERE id = ?').get(req.params.id)) return falla(res, 404, 'Rutina no encontrada');
    const nombre = texto(req.body?.nombre, 60);
    if (!nombre) return falla(res, 400, 'El día necesita un nombre (máximo 60 caracteres)');
    const orden = db.prepare('SELECT COALESCE(MAX(orden) + 1, 0) AS o FROM rutina_dias WHERE rutina_id = ?').get(req.params.id).o;
    const id = Number(db.prepare('INSERT INTO rutina_dias (rutina_id, nombre, orden) VALUES (?, ?, ?)').run(req.params.id, nombre, orden).lastInsertRowid);
    res.status(201).json({ id, nombre, orden, ejercicios: [] });
  });

  router.put('/:id/dias/orden', (req, res) => {
    if (!db.prepare('SELECT 1 FROM rutinas WHERE id = ?').get(req.params.id)) return falla(res, 404, 'Rutina no encontrada');
    const actuales = db.prepare('SELECT id FROM rutina_dias WHERE rutina_id = ?').all(req.params.id).map(d => d.id);
    if (!reordenar(res, 'rutina_dias', actuales, req.body?.ids)) return;
    res.json(cargarRutina(req.params.id));
  });

  router.patch('/:id/dias/:diaId', (req, res) => {
    const dia = diaDeRutina(req.params.id, req.params.diaId);
    if (!dia) return falla(res, 404, 'Día no encontrado');
    const nombre = texto(req.body?.nombre, 60);
    if (!nombre) return falla(res, 400, 'El día necesita un nombre (máximo 60 caracteres)');
    db.prepare('UPDATE rutina_dias SET nombre = ? WHERE id = ?').run(nombre, dia.id);
    res.json({ ...dia, nombre });
  });

  router.delete('/:id/dias/:diaId', (req, res) => {
    const dia = diaDeRutina(req.params.id, req.params.diaId);
    if (!dia) return falla(res, 404, 'Día no encontrado');
    db.prepare('DELETE FROM rutina_dias WHERE id = ?').run(dia.id);
    res.json({ ok: true });
  });

  // ---- Ejercicios de un día ----
  router.post('/:id/dias/:diaId/ejercicios', (req, res) => {
    const dia = diaDeRutina(req.params.id, req.params.diaId);
    if (!dia) return falla(res, 404, 'Día no encontrado');
    const body = req.body ?? {};
    if (typeof body.ejercicio_id !== 'string' || !db.prepare('SELECT 1 FROM ejercicios WHERE id = ?').get(body.ejercicio_id)) {
      return falla(res, 404, 'Ejercicio no encontrado');
    }
    const { error, datos } = validarItem(body, { completo: true });
    if (error) return falla(res, 400, error);
    const orden = db.prepare('SELECT COALESCE(MAX(orden) + 1, 0) AS o FROM rutina_ejercicios WHERE dia_id = ?').get(dia.id).o;
    const id = Number(db.prepare('INSERT INTO rutina_ejercicios (dia_id, ejercicio_id, orden, series, reps, descanso_seg, nota) VALUES (?, ?, ?, ?, ?, ?, ?)')
      .run(dia.id, body.ejercicio_id, orden, datos.series, datos.reps, datos.descanso_seg, datos.nota ?? null).lastInsertRowid);
    res.status(201).json(db.prepare('SELECT id, ejercicio_id, orden, series, reps, descanso_seg, nota FROM rutina_ejercicios WHERE id = ?').get(id));
  });

  router.put('/:id/dias/:diaId/ejercicios/orden', (req, res) => {
    const dia = diaDeRutina(req.params.id, req.params.diaId);
    if (!dia) return falla(res, 404, 'Día no encontrado');
    const actuales = db.prepare('SELECT id FROM rutina_ejercicios WHERE dia_id = ?').all(dia.id).map(i => i.id);
    if (!reordenar(res, 'rutina_ejercicios', actuales, req.body?.ids)) return;
    res.json(cargarRutina(req.params.id));
  });

  const itemDeDia = (req) => {
    const dia = diaDeRutina(req.params.id, req.params.diaId);
    if (!dia) return null;
    return db.prepare('SELECT id, dia_id FROM rutina_ejercicios WHERE id = ? AND dia_id = ?').get(req.params.itemId, dia.id) ?? null;
  };

  router.patch('/:id/dias/:diaId/ejercicios/:itemId', (req, res) => {
    const item = itemDeDia(req);
    if (!item) return falla(res, 404, 'Ejercicio de la rutina no encontrado');
    const { error, datos } = validarItem(req.body ?? {}, { completo: false });
    if (error) return falla(res, 400, error);
    const campos = Object.keys(datos);
    if (!campos.length) return falla(res, 400, 'No hay nada para actualizar');
    db.prepare(`UPDATE rutina_ejercicios SET ${campos.map(c => `${c} = ?`).join(', ')} WHERE id = ?`).run(...campos.map(c => datos[c]), item.id);
    res.json(db.prepare('SELECT id, ejercicio_id, orden, series, reps, descanso_seg, nota FROM rutina_ejercicios WHERE id = ?').get(item.id));
  });

  router.delete('/:id/dias/:diaId/ejercicios/:itemId', (req, res) => {
    const item = itemDeDia(req);
    if (!item) return falla(res, 404, 'Ejercicio de la rutina no encontrado');
    transaccion(() => {
      db.prepare('DELETE FROM rutina_ejercicios WHERE id = ?').run(item.id);
      const resto = db.prepare('SELECT id FROM rutina_ejercicios WHERE dia_id = ? ORDER BY orden, id').all(item.dia_id);
      const upd = db.prepare('UPDATE rutina_ejercicios SET orden = ? WHERE id = ?');
      resto.forEach((r, i) => upd.run(i, r.id));
    });
    res.json({ ok: true });
  });

  return router;
}
