// Documentos de sincronización: cada fila "sincronizable" se lee como un documento autocontenido
// ({ tipo, clave, actualizado, borrado, datos }) y se aplica en otra base reemplazándolo entero.
// Gana siempre el `actualizado` más nuevo; un borrado es un cambio más (lápida en `sync_borrados`).

const TIPOS = ['persona', 'rutina', 'sesion', 'medida', 'perfil', 'favorito'];

const doc = (tipo, clave, actualizado, datos) => ({ tipo, clave, actualizado, borrado: false, datos });
const nulo = (v) => (v === undefined ? null : v);

// ---------- lectura ----------

function leerRutina(db, r) {
  const dias = db.prepare('SELECT id, nombre, orden FROM rutina_dias WHERE rutina_id = ? ORDER BY orden, id').all(r.id);
  const ejercicios = db.prepare(
    'SELECT ejercicio_id, orden, series, reps, descanso_seg, nota FROM rutina_ejercicios WHERE dia_id = ? ORDER BY orden, id');
  return doc('rutina', r.uid, r.actualizado, {
    persona: r.persona_uid, nombre: r.nombre, descripcion: r.descripcion, dias_semana: r.dias,
    dias: dias.map(d => ({ nombre: d.nombre, orden: d.orden, ejercicios: ejercicios.all(d.id).map(e => ({ ...e })) })),
  });
}

function leerSesion(db, s) {
  const ejercicios = db.prepare(
    'SELECT ejercicio_id, orden, series_plan, reps_plan, descanso_seg FROM sesion_ejercicios WHERE sesion_id = ? ORDER BY orden, ejercicio_id');
  const series = db.prepare(
    'SELECT ejercicio_id, n, peso_kg, reps, rpe, hecha FROM series_hechas WHERE sesion_id = ? ORDER BY ejercicio_id, n');
  // El día se nombra por su posición dentro de la rutina (los ids locales no viajan).
  const dia = s.dia_id == null ? null : db.prepare(
    'SELECT COUNT(*) n FROM rutina_dias WHERE rutina_id = (SELECT rutina_id FROM rutina_dias WHERE id = ?) AND (orden, id) < (SELECT orden, id FROM rutina_dias WHERE id = ?)'
  ).get(s.dia_id, s.dia_id).n;
  return doc('sesion', s.uid, s.actualizado, {
    persona: s.persona_uid, rutina: s.rutina_uid ?? null, dia_posicion: dia,
    fecha: s.fecha, duracion: s.duracion, nota: s.nota, estado: s.estado, titulo: s.titulo, fin: s.fin, grupo: s.grupo,
    ejercicios: ejercicios.all(s.id).map(e => ({ ...e })),
    series: series.all(s.id).map(e => ({ ...e })),
  });
}

/** Documentos modificados o borrados después de `desde` (null = todos). Sin sesiones en curso. */
export function cambiosLocales(db, desde) {
  const d = desde ?? '';
  const out = [];

  for (const p of db.prepare('SELECT * FROM personas WHERE actualizado > ?').all(d))
    out.push(doc('persona', p.uid, p.actualizado, { nombre: p.nombre, color: p.color, avatar: p.avatar, creada: p.creada }));

  for (const r of db.prepare(
    'SELECT r.*, p.uid AS persona_uid FROM rutinas r JOIN personas p ON p.id = r.persona_id WHERE r.actualizado > ?').all(d))
    out.push(leerRutina(db, r));

  for (const s of db.prepare(
    `SELECT s.*, p.uid AS persona_uid, r.uid AS rutina_uid FROM sesiones s
       JOIN personas p ON p.id = s.persona_id LEFT JOIN rutinas r ON r.id = s.rutina_id
      WHERE s.estado != 'en_curso' AND s.actualizado > ?`).all(d))
    out.push(leerSesion(db, s));

  for (const m of db.prepare(
    'SELECT m.*, p.uid AS persona_uid FROM medidas m JOIN personas p ON p.id = m.persona_id WHERE m.actualizado > ?').all(d)) {
    const { persona_uid, persona_id, actualizado, ...resto } = m;
    out.push(doc('medida', `${persona_uid}|${m.fecha}`, actualizado, { persona: persona_uid, ...resto }));
  }

  for (const f of db.prepare(
    'SELECT f.*, p.uid AS persona_uid FROM perfil f JOIN personas p ON p.id = f.persona_id WHERE f.actualizado > ?').all(d)) {
    const { persona_uid, persona_id, actualizado, ...resto } = f;
    out.push(doc('perfil', persona_uid, actualizado, { persona: persona_uid, ...resto }));
  }

  for (const f of db.prepare(
    'SELECT f.*, p.uid AS persona_uid FROM favoritos f JOIN personas p ON p.id = f.persona_id WHERE f.actualizado > ?').all(d))
    out.push(doc('favorito', `${f.persona_uid}|${f.ejercicio_id}`, f.actualizado, { persona: f.persona_uid, ejercicio_id: f.ejercicio_id }));

  for (const b of db.prepare('SELECT tipo, clave, fecha FROM sync_borrados WHERE fecha > ?').all(d))
    out.push({ tipo: b.tipo, clave: b.clave, actualizado: b.fecha, borrado: true, datos: null });

  return out;
}

// ---------- aplicación ----------

const personaId = (db, uid) => db.prepare('SELECT id FROM personas WHERE uid = ?').get(uid)?.id ?? null;
const lapida = (db, tipo, clave) => db.prepare('SELECT fecha FROM sync_borrados WHERE tipo = ? AND clave = ?').get(tipo, clave)?.fecha ?? null;
const quitarLapida = (db, tipo, clave) => db.prepare('DELETE FROM sync_borrados WHERE tipo = ? AND clave = ?').run(tipo, clave);
const ejerciciosConocidos = (db, lista) => {
  const existe = db.prepare('SELECT 1 FROM ejercicios WHERE id = ?');
  return lista.filter(e => existe.get(e.ejercicio_id));
};

// Cada tipo declara cómo ubicar la fila local, cómo escribir el documento y cómo borrarlo.
// Los hijos (días, ejercicios, series) mueven el `actualizado` del padre por disparadores, así que
// cada escritura termina con un UPDATE que fija el `actualizado` recibido, después de tocar los hijos.
const MANEJADORES = {
  persona: {
    local: (db, clave) => db.prepare('SELECT id, actualizado FROM personas WHERE uid = ?').get(clave),
    escribir(db, d, local) {
      const x = d.datos;
      if (local) db.prepare('UPDATE personas SET nombre = ?, color = ?, avatar = ?, creada = ? WHERE id = ?')
        .run(x.nombre, x.color, x.avatar ?? '', x.creada, local.id);
      else db.prepare('INSERT INTO personas (uid, nombre, color, avatar, creada, actualizado) VALUES (?, ?, ?, ?, ?, ?)')
        .run(d.clave, x.nombre, x.color, x.avatar ?? '', x.creada, d.actualizado);
      db.prepare('UPDATE personas SET actualizado = ? WHERE uid = ?').run(d.actualizado, d.clave);
      return 'aplicado';
    },
    borrar(db, d, local) {
      // El borrado en cascada deja lápidas de sus rutinas y sesiones; ya están borradas en origen, no se re-suben.
      const claves = [['persona', d.clave],
        ...db.prepare('SELECT uid FROM rutinas WHERE persona_id = ?').all(local.id).map(r => ['rutina', r.uid]),
        ...db.prepare('SELECT uid FROM sesiones WHERE persona_id = ?').all(local.id).map(r => ['sesion', r.uid])];
      db.prepare('DELETE FROM personas WHERE id = ?').run(local.id);
      for (const [t, c] of claves) quitarLapida(db, t, c);
    },
  },

  rutina: {
    local: (db, clave) => db.prepare('SELECT id, actualizado FROM rutinas WHERE uid = ?').get(clave),
    escribir(db, d, local) {
      const x = d.datos;
      const pid = personaId(db, x.persona);
      if (pid == null) return 'en_espera';
      let id = local?.id;
      if (id) db.prepare('UPDATE rutinas SET nombre = ?, dias = ?, descripcion = ?, persona_id = ? WHERE id = ?')
        .run(x.nombre, x.dias_semana ?? '[]', x.descripcion ?? '', pid, id);
      else id = Number(db.prepare('INSERT INTO rutinas (uid, nombre, dias, descripcion, persona_id, actualizado) VALUES (?, ?, ?, ?, ?, ?)')
        .run(d.clave, x.nombre, x.dias_semana ?? '[]', x.descripcion ?? '', pid, d.actualizado).lastInsertRowid);
      // Los días existentes se reutilizan por posición (las sesiones apuntan a ellos); sobran o faltan al final.
      const actuales = db.prepare('SELECT id FROM rutina_dias WHERE rutina_id = ? ORDER BY orden, id').all(id);
      const dias = x.dias ?? [];
      dias.forEach((dia, i) => {
        let diaId = actuales[i]?.id;
        if (diaId) db.prepare('UPDATE rutina_dias SET nombre = ?, orden = ? WHERE id = ?').run(dia.nombre, dia.orden ?? i, diaId);
        else diaId = Number(db.prepare('INSERT INTO rutina_dias (rutina_id, nombre, orden) VALUES (?, ?, ?)').run(id, dia.nombre, dia.orden ?? i).lastInsertRowid);
        db.prepare('DELETE FROM rutina_ejercicios WHERE dia_id = ?').run(diaId);
        const ins = db.prepare('INSERT INTO rutina_ejercicios (dia_id, ejercicio_id, orden, series, reps, descanso_seg, nota) VALUES (?, ?, ?, ?, ?, ?, ?)');
        for (const e of ejerciciosConocidos(db, dia.ejercicios ?? []))
          ins.run(diaId, e.ejercicio_id, e.orden ?? 0, e.series ?? 3, e.reps ?? '10', e.descanso_seg ?? 90, nulo(e.nota));
      });
      for (const sobra of actuales.slice(dias.length)) db.prepare('DELETE FROM rutina_dias WHERE id = ?').run(sobra.id);
      db.prepare('UPDATE rutinas SET actualizado = ? WHERE id = ?').run(d.actualizado, id);
      return 'aplicado';
    },
    borrar(db, d, local) {
      db.prepare('DELETE FROM rutinas WHERE id = ?').run(local.id);
      quitarLapida(db, 'rutina', d.clave);
    },
  },

  sesion: {
    local: (db, clave) => db.prepare('SELECT id, actualizado FROM sesiones WHERE uid = ?').get(clave),
    escribir(db, d, local) {
      const x = d.datos;
      if (x.estado === 'en_curso') return 'ignorado';
      const pid = personaId(db, x.persona);
      if (pid == null) return 'en_espera';
      // Si la rutina o el día no existen acá, la sesión queda sin ese vínculo.
      const rutina = x.rutina ? db.prepare('SELECT id FROM rutinas WHERE uid = ?').get(x.rutina)?.id ?? null : null;
      const dia = rutina != null && x.dia_posicion != null
        ? db.prepare('SELECT id FROM rutina_dias WHERE rutina_id = ? ORDER BY orden, id LIMIT 1 OFFSET ?').get(rutina, x.dia_posicion)?.id ?? null
        : null;
      const valores = [rutina, x.fecha, nulo(x.duracion), nulo(x.nota), dia, x.estado ?? 'finalizada', nulo(x.titulo), nulo(x.fin), pid, nulo(x.grupo)];
      let id = local?.id;
      if (id) db.prepare('UPDATE sesiones SET rutina_id = ?, fecha = ?, duracion = ?, nota = ?, dia_id = ?, estado = ?, titulo = ?, fin = ?, persona_id = ?, grupo = ? WHERE id = ?')
        .run(...valores, id);
      else id = Number(db.prepare('INSERT INTO sesiones (rutina_id, fecha, duracion, nota, dia_id, estado, titulo, fin, persona_id, grupo, uid, actualizado) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)')
        .run(...valores, d.clave, d.actualizado).lastInsertRowid);
      db.prepare('DELETE FROM series_hechas WHERE sesion_id = ?').run(id);
      db.prepare('DELETE FROM sesion_ejercicios WHERE sesion_id = ?').run(id);
      const insE = db.prepare('INSERT INTO sesion_ejercicios (sesion_id, ejercicio_id, orden, series_plan, reps_plan, descanso_seg) VALUES (?, ?, ?, ?, ?, ?)');
      for (const e of ejerciciosConocidos(db, x.ejercicios ?? []))
        insE.run(id, e.ejercicio_id, e.orden ?? 0, e.series_plan ?? 0, nulo(e.reps_plan), e.descanso_seg ?? 90);
      const insS = db.prepare('INSERT INTO series_hechas (sesion_id, ejercicio_id, n, peso_kg, reps, rpe, hecha) VALUES (?, ?, ?, ?, ?, ?, ?)');
      for (const s of ejerciciosConocidos(db, x.series ?? []))
        insS.run(id, s.ejercicio_id, s.n, nulo(s.peso_kg), nulo(s.reps), nulo(s.rpe), s.hecha ?? 1);
      db.prepare('UPDATE sesiones SET actualizado = ? WHERE id = ?').run(d.actualizado, id);
      return 'aplicado';
    },
    borrar(db, d, local) {
      db.prepare('DELETE FROM sesiones WHERE id = ?').run(local.id);
      quitarLapida(db, 'sesion', d.clave);
    },
  },

  medida: {
    local(db, clave) {
      const [uid, fecha] = clave.split('|');
      return db.prepare('SELECT m.persona_id, m.actualizado FROM medidas m JOIN personas p ON p.id = m.persona_id WHERE p.uid = ? AND m.fecha = ?').get(uid, fecha);
    },
    escribir(db, d, local) {
      const x = d.datos;
      const pid = personaId(db, x.persona);
      if (pid == null) return 'en_espera';
      db.prepare(`INSERT INTO medidas (persona_id, fecha, peso_kg, cintura, pecho, brazo, pierna, grasa_pct, actualizado) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT (persona_id, fecha) DO UPDATE SET peso_kg = excluded.peso_kg, cintura = excluded.cintura, pecho = excluded.pecho,
          brazo = excluded.brazo, pierna = excluded.pierna, grasa_pct = excluded.grasa_pct`)
        .run(pid, x.fecha, nulo(x.peso_kg), nulo(x.cintura), nulo(x.pecho), nulo(x.brazo), nulo(x.pierna), nulo(x.grasa_pct), d.actualizado);
      db.prepare('UPDATE medidas SET actualizado = ? WHERE persona_id = ? AND fecha = ?').run(d.actualizado, pid, x.fecha);
      return 'aplicado';
    },
    borrar(db, d) {
      const [uid, fecha] = d.clave.split('|');
      db.prepare('DELETE FROM medidas WHERE fecha = ? AND persona_id = (SELECT id FROM personas WHERE uid = ?)').run(fecha, uid);
      quitarLapida(db, 'medida', d.clave);
    },
  },

  perfil: {
    local: (db, clave) => db.prepare('SELECT f.persona_id, f.actualizado FROM perfil f JOIN personas p ON p.id = f.persona_id WHERE p.uid = ?').get(clave),
    escribir(db, d) {
      const x = d.datos;
      const pid = personaId(db, x.persona);
      if (pid == null) return 'en_espera';
      db.prepare(`INSERT INTO perfil (persona_id, altura, edad, sexo, actividad, objetivo, fecha_nacimiento, actualizado) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT (persona_id) DO UPDATE SET altura = excluded.altura, edad = excluded.edad, sexo = excluded.sexo,
          actividad = excluded.actividad, objetivo = excluded.objetivo, fecha_nacimiento = excluded.fecha_nacimiento`)
        .run(pid, nulo(x.altura), nulo(x.edad), nulo(x.sexo), nulo(x.actividad), nulo(x.objetivo), nulo(x.fecha_nacimiento), d.actualizado);
      db.prepare('UPDATE perfil SET actualizado = ? WHERE persona_id = ?').run(d.actualizado, pid);
      return 'aplicado';
    },
    borrar(db, d) {
      db.prepare('DELETE FROM perfil WHERE persona_id = (SELECT id FROM personas WHERE uid = ?)').run(d.clave);
      quitarLapida(db, 'perfil', d.clave);
    },
  },

  favorito: {
    local(db, clave) {
      const [uid, ejercicio] = clave.split('|');
      return db.prepare('SELECT f.persona_id, f.actualizado FROM favoritos f JOIN personas p ON p.id = f.persona_id WHERE p.uid = ? AND f.ejercicio_id = ?').get(uid, ejercicio);
    },
    escribir(db, d) {
      const x = d.datos;
      const pid = personaId(db, x.persona);
      if (pid == null) return 'en_espera';
      if (!db.prepare('SELECT 1 FROM ejercicios WHERE id = ?').get(x.ejercicio_id)) return 'ignorado';
      db.prepare(`INSERT INTO favoritos (persona_id, ejercicio_id, actualizado) VALUES (?, ?, ?)
        ON CONFLICT (persona_id, ejercicio_id) DO NOTHING`).run(pid, x.ejercicio_id, d.actualizado);
      db.prepare('UPDATE favoritos SET actualizado = ? WHERE persona_id = ? AND ejercicio_id = ?').run(d.actualizado, pid, x.ejercicio_id);
      return 'aplicado';
    },
    borrar(db, d) {
      const [uid, ejercicio] = d.clave.split('|');
      db.prepare('DELETE FROM favoritos WHERE ejercicio_id = ? AND persona_id = (SELECT id FROM personas WHERE uid = ?)').run(ejercicio, uid);
      quitarLapida(db, 'favorito', d.clave);
    },
  },
};

/**
 * Aplica un documento remoto si es más nuevo que lo local (fila o lápida).
 * Devuelve 'aplicado', 'ignorado' o 'en_espera' (falta la persona de la que depende).
 */
export function aplicarDocumento(db, d) {
  const m = MANEJADORES[d?.tipo];
  if (!m || !TIPOS.includes(d.tipo)) return 'ignorado';
  db.exec('BEGIN');
  try {
    const local = m.local(db, d.clave);
    let res;
    if (d.borrado) {
      if (!local || local.actualizado > d.actualizado) res = 'ignorado';
      else { m.borrar(db, d, local); res = 'aplicado'; }
    } else {
      const borradoLocal = lapida(db, d.tipo, d.clave);
      if ((local && local.actualizado >= d.actualizado) || (borradoLocal && borradoLocal >= d.actualizado)) res = 'ignorado';
      else res = m.escribir(db, d, local);
    }
    db.exec('COMMIT');
    return res;
  } catch (err) {
    db.exec('ROLLBACK');
    throw err;
  }
}
