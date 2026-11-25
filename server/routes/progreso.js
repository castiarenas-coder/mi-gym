import { Router } from 'express';
import {
  ACTIVIDADES, OBJETIVOS, SEXOS, aFechaLocal, calcularPerfil, diaLocal, e1rmEpley, edadDesde,
  fechaValida, inicioDeSemana, rachaSemanal, sumarDias,
} from '../calculos.js';

const falla = (res, status, error) => res.status(status).json({ error });
const numero = v => typeof v === 'number' && Number.isFinite(v);

const CAMPOS_MEDIDA = {
  peso_kg: { min: 20, max: 400, nombre: 'El peso' },
  cintura: { min: 10, max: 300, nombre: 'La cintura' },
  pecho: { min: 10, max: 300, nombre: 'El pecho' },
  brazo: { min: 5, max: 150, nombre: 'El brazo' },
  pierna: { min: 10, max: 200, nombre: 'La pierna' },
  grasa_pct: { min: 1, max: 80, nombre: 'La grasa corporal' },
};
const COLUMNAS_MEDIDA = Object.keys(CAMPOS_MEDIDA);
const SEMANAS_RESUMEN = 12;

export function progresoRouter(db, { ahora = () => new Date() } = {}) {
  const router = Router();
  const hoy = () => aFechaLocal(ahora());

  // ---- Medidas ----
  const medidas = Router();
  const leerMedida = (persona, fecha) => db.prepare('SELECT fecha, peso_kg, cintura, pecho, brazo, pierna, grasa_pct FROM medidas WHERE persona_id = ? AND fecha = ?').get(persona, fecha);

  function guardarMedida(res, persona, fecha, body) {
    if (!fechaValida(fecha)) return falla(res, 400, 'La fecha no es válida (AAAA-MM-DD)');
    const datos = {};
    for (const c of COLUMNAS_MEDIDA) {
      if (!(c in body)) continue;
      const v = body[c];
      const { min, max, nombre } = CAMPOS_MEDIDA[c];
      if (v !== null && !(numero(v) && v >= min && v <= max)) return falla(res, 400, `${nombre} debe estar entre ${min} y ${max}`);
      datos[c] = v;
    }
    if (!Object.keys(datos).length) return falla(res, 400, 'Cargá al menos una medida');
    const existe = !!leerMedida(persona, fecha);
    if (!existe) {
      if (Object.values(datos).every(v => v === null)) return falla(res, 400, 'Cargá al menos una medida');
      db.prepare('INSERT INTO medidas (persona_id, fecha) VALUES (?, ?)').run(persona, fecha);
    }
    const campos = Object.keys(datos);
    db.prepare(`UPDATE medidas SET ${campos.map(c => `${c} = ?`).join(', ')} WHERE persona_id = ? AND fecha = ?`).run(...campos.map(c => datos[c]), persona, fecha);
    return res.status(existe ? 200 : 201).json(leerMedida(persona, fecha));
  }

  medidas.get('/', (req, res) => {
    const where = ['persona_id = ?'];
    const params = [req.persona];
    if (req.query.desde !== undefined) {
      if (!fechaValida(req.query.desde)) return falla(res, 400, 'La fecha "desde" no es válida');
      where.push('fecha >= ?'); params.push(req.query.desde);
    }
    if (req.query.hasta !== undefined) {
      if (!fechaValida(req.query.hasta)) return falla(res, 400, 'La fecha "hasta" no es válida');
      where.push('fecha <= ?'); params.push(req.query.hasta);
    }
    const cond = where.length ? `WHERE ${where.join(' AND ')}` : '';
    res.json(db.prepare(`SELECT fecha, peso_kg, cintura, pecho, brazo, pierna, grasa_pct FROM medidas ${cond} ORDER BY fecha`).all(...params));
  });
  medidas.post('/', (req, res) => {
    const body = req.body ?? {};
    guardarMedida(res, req.persona, body.fecha === undefined ? hoy() : body.fecha, body);
  });
  medidas.put('/:fecha', (req, res) => guardarMedida(res, req.persona, req.params.fecha, req.body ?? {}));
  medidas.delete('/:fecha', (req, res) => {
    const info = db.prepare('DELETE FROM medidas WHERE persona_id = ? AND fecha = ?').run(req.persona, req.params.fecha);
    if (!info.changes) return falla(res, 404, 'No hay una medida en esa fecha');
    res.json({ ok: true });
  });

  // ---- Perfil ----
  const perfil = Router();
  const COLS_PERFIL = 'altura AS altura_cm, edad, fecha_nacimiento, sexo, actividad, objetivo';

  function respuestaPerfil(persona) {
    const p = db.prepare(`SELECT ${COLS_PERFIL} FROM perfil WHERE persona_id = ?`).get(persona)
      ?? { altura_cm: null, edad: null, fecha_nacimiento: null, sexo: null, actividad: null, objetivo: null };
    if (p.fecha_nacimiento) p.edad = edadDesde(p.fecha_nacimiento, ahora());
    const ultimo = db.prepare('SELECT peso_kg, fecha FROM medidas WHERE persona_id = ? AND peso_kg IS NOT NULL ORDER BY fecha DESC LIMIT 1').get(persona);
    const calculos = calcularPerfil({ ...p, peso_kg: ultimo?.peso_kg });
    return { perfil: p, peso_kg: ultimo?.peso_kg ?? null, fecha_peso: ultimo?.fecha ?? null, calculos };
  }

  perfil.get('/', (req, res) => res.json(respuestaPerfil(req.persona)));
  perfil.put('/', (req, res) => {
    const body = req.body ?? {};
    const datos = {};
    if ('altura_cm' in body) {
      if (body.altura_cm !== null && !(numero(body.altura_cm) && body.altura_cm >= 50 && body.altura_cm <= 250)) return falla(res, 400, 'La altura debe estar entre 50 y 250 cm');
      datos.altura = body.altura_cm;
    }
    if ('edad' in body) {
      if (body.edad !== null && !(Number.isInteger(body.edad) && body.edad >= 10 && body.edad <= 100)) return falla(res, 400, 'La edad debe estar entre 10 y 100 años');
      datos.edad = body.edad;
    }
    if ('fecha_nacimiento' in body) {
      if (body.fecha_nacimiento !== null && !fechaValida(body.fecha_nacimiento)) return falla(res, 400, 'La fecha de nacimiento no es válida (AAAA-MM-DD)');
      datos.fecha_nacimiento = body.fecha_nacimiento;
    }
    if ('sexo' in body) {
      if (body.sexo !== null && !SEXOS.includes(body.sexo)) return falla(res, 400, 'El sexo no es válido');
      datos.sexo = body.sexo;
    }
    if ('actividad' in body) {
      if (body.actividad !== null && !(body.actividad in ACTIVIDADES)) return falla(res, 400, 'El nivel de actividad no es válido');
      datos.actividad = body.actividad;
    }
    if ('objetivo' in body) {
      if (body.objetivo !== null && !OBJETIVOS.includes(body.objetivo)) return falla(res, 400, 'El objetivo no es válido');
      datos.objetivo = body.objetivo;
    }
    const campos = Object.keys(datos);
    if (!campos.length) return falla(res, 400, 'No hay nada para actualizar');
    db.prepare('INSERT OR IGNORE INTO perfil (persona_id) VALUES (?)').run(req.persona);
    db.prepare(`UPDATE perfil SET ${campos.map(c => `${c} = ?`).join(', ')} WHERE persona_id = ?`).run(...campos.map(c => datos[c]), req.persona);
    res.json(respuestaPerfil(req.persona));
  });

  // ---- Resumen ----
  router.get('/resumen', (req, res) => {
    const filas = db.prepare(`
      SELECT s.id, s.fecha, COALESCE(SUM(CASE WHEN h.hecha = 1 THEN h.peso_kg * h.reps END), 0) AS volumen
      FROM sesiones s LEFT JOIN series_hechas h ON h.sesion_id = s.id
      WHERE s.estado = 'finalizada' AND s.persona_id = ? GROUP BY s.id ORDER BY s.fecha`).all(req.persona);

    const hoyLocal = hoy();
    const lunes = inicioDeSemana(hoyLocal);
    const semanas = Array.from({ length: SEMANAS_RESUMEN }, (_, i) => ({
      inicio: sumarDias(lunes, -7 * (SEMANAS_RESUMEN - 1 - i)), sesiones: 0, volumen_kg: 0,
    }));
    const porInicio = new Map(semanas.map(w => [w.inicio, w]));
    const conSesion = new Set();
    let volumenTotal = 0;
    for (const f of filas) {
      const w = inicioDeSemana(diaLocal(f.fecha));
      conSesion.add(w);
      volumenTotal += f.volumen;
      const sem = porInicio.get(w);
      if (sem) { sem.sesiones += 1; sem.volumen_kg += f.volumen; }
    }
    for (const w of semanas) w.volumen_kg = Math.round(w.volumen_kg * 100) / 100;
    const esta = porInicio.get(lunes);

    // Récords por ejercicio.
    const series = db.prepare(`
      SELECT h.ejercicio_id, e.nombre, e.img_ini, e.img_fin, e.media_propia, s.id AS sesion_id, s.fecha, h.peso_kg, h.reps
      FROM series_hechas h JOIN sesiones s ON s.id = h.sesion_id JOIN ejercicios e ON e.id = h.ejercicio_id
      WHERE h.hecha = 1 AND s.estado = 'finalizada' AND s.persona_id = ? ORDER BY s.fecha, s.id, h.n`).all(req.persona);
    const mapa = new Map();
    for (const f of series) {
      let r = mapa.get(f.ejercicio_id);
      if (!r) {
        r = { ejercicio_id: f.ejercicio_id, nombre: f.nombre, img_ini: f.img_ini, img_fin: f.img_fin, media_propia: f.media_propia,
          peso_max: null, fecha_peso: null, e1rm_max: null, fecha_e1rm: null, sesiones: new Set() };
        mapa.set(f.ejercicio_id, r);
      }
      r.sesiones.add(f.sesion_id);
      if (numero(f.peso_kg) && f.peso_kg > 0 && (r.peso_max === null || f.peso_kg > r.peso_max)) { r.peso_max = f.peso_kg; r.fecha_peso = f.fecha; }
      const est = e1rmEpley(f.peso_kg, f.reps);
      if (est !== null && (r.e1rm_max === null || est > r.e1rm_max)) { r.e1rm_max = est; r.fecha_e1rm = f.fecha; }
    }
    const records = [...mapa.values()]
      .map(r => ({ ...r, sesiones: r.sesiones.size }))
      .sort((a, b) => (b.e1rm_max ?? -1) - (a.e1rm_max ?? -1) || a.nombre.localeCompare(b.nombre, 'es'));

    const ultima = filas.at(-1);
    const ultimaSesion = ultima
      ? db.prepare('SELECT id, titulo, fecha, duracion FROM sesiones WHERE id = ?').get(ultima.id)
      : null;
    const activa = db.prepare("SELECT id, titulo, fecha FROM sesiones WHERE estado = 'en_curso' AND persona_id = ?").get(req.persona) ?? null;

    res.json({
      semanas,
      esta_semana: { sesiones: esta.sesiones, volumen_kg: esta.volumen_kg },
      racha: rachaSemanal(conSesion, hoyLocal),
      total_sesiones: filas.length,
      volumen_total_kg: Math.round(volumenTotal * 100) / 100,
      records,
      ultima_sesion: ultimaSesion ? { ...ultimaSesion, volumen_kg: Math.round(ultima.volumen * 100) / 100 } : null,
      sesion_activa: activa,
    });
  });

  return { router, medidas, perfil };
}
