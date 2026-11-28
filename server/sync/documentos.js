// Documentos de sincronización: cada fila "sincronizable" se lee como un documento autocontenido
// ({ tipo, clave, actualizado, borrado, datos }) y se aplica en otra base reemplazándolo entero.
// Gana siempre el `actualizado` más nuevo; un borrado es un cambio más (lápida en `sync_borrados`).
// Unificar personas no es un borrado: la persona de origen queda como alias (`sync_alias`, documento con `unificada_en`)
// y lo suyo que llegue de otros equipos se aplica bajo la conservada.

import { claveSembrado, esPlantillaSinTocar } from '../plantillas.js';

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

  for (const p of db.prepare('SELECT * FROM personas WHERE actualizado > ?').all(d)) {
    const datos = { nombre: p.nombre, color: p.color, avatar: p.avatar, creada: p.creada };
    // Una persona que revivió sobre un borrado lo declara: así todos matan lo anterior a esa fecha, también lo que
    // algún equipo creó sin saber del borrado (sin esto, ese equipo conservaría documentos que los demás descartaron).
    const viva = db.prepare('SELECT fecha FROM sync_muertas WHERE persona = ? AND viva = 1').get(p.uid);
    if (viva) datos.muerta_desde = viva.fecha;
    out.push(doc('persona', p.uid, p.actualizado, datos));
  }

  // Personas unificadas: siguen vivas en la nube como alias de la conservada.
  for (const a of db.prepare(`SELECT * FROM sync_alias a WHERE a.actualizado > ? AND NOT EXISTS (
    SELECT 1 FROM sync_muertas m WHERE m.persona = a.origen AND m.viva = 0 AND m.fecha > a.actualizado)`).all(d))
    out.push(doc('persona', a.origen, a.actualizado, { ...JSON.parse(a.datos), unificada_en: a.destino }));

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

  for (const b of db.prepare('SELECT tipo, clave, fecha, por_alias FROM sync_borrados WHERE fecha > ?').all(d))
    out.push({ tipo: b.tipo, clave: b.clave, actualizado: b.fecha, borrado: true, datos: b.por_alias ? { por_alias: true } : null });

  return out;
}

// ---------- aplicación ----------

const personaId = (db, uid) => db.prepare('SELECT id FROM personas WHERE uid = ?').get(uid)?.id ?? null;
const lapida = (db, tipo, clave) => db.prepare('SELECT fecha FROM sync_borrados WHERE tipo = ? AND clave = ?').get(tipo, clave)?.fecha ?? null;
const quitarLapida = (db, tipo, clave) => db.prepare('DELETE FROM sync_borrados WHERE tipo = ? AND clave = ?').run(tipo, clave);
// Personas muertas: uid -> fecha del borrado (aquí o en otro equipo, aunque la persona nunca haya existido acá).
// `sync_muertas` no se poda nunca (una fila por persona borrada alguna vez: es chica). `viva = 1` = revivió sobre ese borrado.
// Fecha del borrado conocido de la persona, esté viva o no ('' si no hay).
const fechaMuerte = (db, uid) => db.prepare('SELECT fecha FROM sync_muertas WHERE persona = ?').get(uid)?.fecha ?? '';
const muerta = (db, uid) => db.prepare('SELECT fecha FROM sync_muertas WHERE persona = ? AND viva = 0').get(uid)?.fecha ?? null;
const marcarMuerta = (db, uid, fecha) => db.prepare(
  `INSERT INTO sync_muertas (persona, fecha, viva) VALUES (?, ?, 0)
   ON CONFLICT (persona) DO UPDATE SET fecha = CASE WHEN viva = 1 THEN excluded.fecha ELSE MAX(fecha, excluded.fecha) END, viva = 0`).run(uid, fecha);
const reviveSobre = (db, uid, fecha) => db.prepare(
  `INSERT INTO sync_muertas (persona, fecha, viva) VALUES (?, ?, 1)
   ON CONFLICT (persona) DO UPDATE SET fecha = CASE WHEN viva = 1 THEN MAX(fecha, excluded.fecha) ELSE excluded.fecha END, viva = 1`).run(uid, fecha);

// Lo de la persona que no es posterior al borrado `T` está muerto ("gana el más nuevo"): se borra con lápida de fecha `T`.
function matarAnteriores(db, personaLocalId, uid, T) {
  const muere = (tipo, clave, sql, ...p) => {
    db.prepare(sql).run(...p);
    db.prepare('INSERT OR REPLACE INTO sync_borrados (tipo, clave, fecha) VALUES (?, ?, ?)').run(tipo, clave, T);
  };
  for (const r of db.prepare('SELECT id, uid FROM rutinas WHERE persona_id = ? AND actualizado <= ?').all(personaLocalId, T))
    muere('rutina', r.uid, 'DELETE FROM rutinas WHERE id = ?', r.id);
  for (const r of db.prepare('SELECT id, uid FROM sesiones WHERE persona_id = ? AND actualizado <= ?').all(personaLocalId, T))
    muere('sesion', r.uid, 'DELETE FROM sesiones WHERE id = ?', r.id);
  for (const r of db.prepare('SELECT fecha FROM medidas WHERE persona_id = ? AND actualizado <= ?').all(personaLocalId, T))
    muere('medida', `${uid}|${r.fecha}`, 'DELETE FROM medidas WHERE persona_id = ? AND fecha = ?', personaLocalId, r.fecha);
  for (const r of db.prepare('SELECT 1 FROM perfil WHERE persona_id = ? AND actualizado <= ?').all(personaLocalId, T))
    muere('perfil', uid, 'DELETE FROM perfil WHERE persona_id = ?', personaLocalId);
  for (const r of db.prepare('SELECT ejercicio_id FROM favoritos WHERE persona_id = ? AND actualizado <= ?').all(personaLocalId, T))
    muere('favorito', `${uid}|${r.ejercicio_id}`, 'DELETE FROM favoritos WHERE persona_id = ? AND ejercicio_id = ?', personaLocalId, r.ejercicio_id);
}
// Instante con el reloj de la base (el mismo de los disparadores), siempre posterior a `minimo` y al último envío,
// para que lo re-estampado cuente como cambio local pendiente de subir.
export const ahoraDespues = (db, minimo) => {
  const envio = db.prepare("SELECT valor FROM sync_estado WHERE clave = 'ultimo_envio'").get()?.valor ?? '';
  return db.prepare(
    "SELECT MAX(strftime('%Y-%m-%dT%H:%M:%fZ', 'now'), strftime('%Y-%m-%dT%H:%M:%fZ', ?, '+0.001 seconds')) AS t")
    .get(envio > minimo ? envio : minimo).t;
};
// Sin persona local: si murió en o después de la fecha del documento se descarta; si el documento es posterior al
// borrado, alguien lo editó después y la persona va a revivir, así que (igual que si todavía no llegó) se espera.
const sinPersona = (db, uid, actualizado) => {
  const m = muerta(db, uid);
  return m && m >= actualizado ? 'ignorado' : 'en_espera';
};
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
      else {
        const id = Number(db.prepare('INSERT INTO personas (uid, nombre, color, avatar, creada, actualizado) VALUES (?, ?, ?, ?, ?, ?)')
          .run(d.clave, x.nombre, x.color, x.avatar ?? '', x.creada, d.actualizado).lastInsertRowid);
        // Una persona que llega de otro equipo ya tiene (o decidió no tener) sus rutinas: al arrancar no se le siembran plantillas.
        db.prepare('INSERT OR IGNORE INTO ajustes (clave, valor) VALUES (?, ?)').run(claveSembrado(id), new Date().toISOString());
      }
      db.prepare('UPDATE personas SET actualizado = ? WHERE uid = ?').run(d.actualizado, d.clave);
      return 'aplicado';
    },
    borrar(db, d, local) {
      // Si algo de la persona se editó después del borrado remoto, la edición gana: la persona vuelve a subirse viva.
      // Lo anterior al borrado está muerto por "gana el más nuevo" y se borra con lápida de la fecha del borrado.
      const nueva = db.prepare(`SELECT 1 FROM (
          SELECT actualizado FROM rutinas WHERE persona_id = ?1 UNION ALL SELECT actualizado FROM sesiones WHERE persona_id = ?1
          UNION ALL SELECT actualizado FROM medidas WHERE persona_id = ?1 UNION ALL SELECT actualizado FROM perfil WHERE persona_id = ?1
          UNION ALL SELECT actualizado FROM favoritos WHERE persona_id = ?1) WHERE actualizado > ?2 LIMIT 1`).get(local.id, d.actualizado);
      if (nueva) {
        db.prepare('UPDATE personas SET actualizado = ? WHERE id = ?').run(ahoraDespues(db, d.actualizado), local.id);
        matarAnteriores(db, local.id, d.clave, d.actualizado);
        reviveSobre(db, d.clave, d.actualizado);
        return 'ignorado';
      }
      // El borrado en cascada deja lápidas de ella y de todo lo suyo; ya están borrados en origen, no se re-suben.
      const claves = [['persona', d.clave],
        ...db.prepare('SELECT uid FROM rutinas WHERE persona_id = ?').all(local.id).map(r => ['rutina', r.uid]),
        ...db.prepare('SELECT uid FROM sesiones WHERE persona_id = ?').all(local.id).map(r => ['sesion', r.uid]),
        ...db.prepare('SELECT fecha FROM medidas WHERE persona_id = ?').all(local.id).map(r => ['medida', `${d.clave}|${r.fecha}`]),
        ...db.prepare('SELECT 1 FROM perfil WHERE persona_id = ?').all(local.id).map(() => ['perfil', d.clave]),
        ...db.prepare('SELECT ejercicio_id FROM favoritos WHERE persona_id = ?').all(local.id).map(r => ['favorito', `${d.clave}|${r.ejercicio_id}`])];
      db.prepare('DELETE FROM personas WHERE id = ?').run(local.id);
      for (const [t, c] of claves) quitarLapida(db, t, c);
      db.prepare('INSERT OR REPLACE INTO sync_muertas (persona, fecha) VALUES (?, ?)').run(d.clave, d.actualizado);
    },
  },

  rutina: {
    local: (db, clave) => db.prepare('SELECT id, actualizado FROM rutinas WHERE uid = ?').get(clave),
    escribir(db, d, local) {
      const x = d.datos;
      const pid = personaId(db, x.persona);
      if (pid == null) return sinPersona(db, x.persona, d.actualizado);
      let id = local?.id;
      if (id) db.prepare('UPDATE rutinas SET nombre = ?, dias = ?, descripcion = ?, persona_id = ? WHERE id = ?')
        .run(x.nombre, x.dias_semana ?? '[]', x.descripcion ?? '', pid, id);
      else id = Number(db.prepare('INSERT INTO rutinas (uid, nombre, dias, descripcion, persona_id, actualizado) VALUES (?, ?, ?, ?, ?, ?)')
        .run(d.clave, x.nombre, x.dias_semana ?? '[]', x.descripcion ?? '', pid, d.actualizado).lastInsertRowid);
      // Los días existentes se reutilizan por posición (las sesiones apuntan a ellos); sobran o faltan al final.
      // Limitación conocida: los días no tienen identidad, así que quitar un día del medio puede reasociar
      // por posición las sesiones que apuntaban a los días siguientes.
      const actuales = db.prepare('SELECT id FROM rutina_dias WHERE rutina_id = ? ORDER BY orden, id').all(id);
      const dias = x.dias ?? [];
      dias.forEach((dia, i) => {
        let diaId = actuales[i]?.id;
        if (diaId) db.prepare('UPDATE rutina_dias SET nombre = ?, orden = ? WHERE id = ?').run(dia.nombre, i, diaId);
        else diaId = Number(db.prepare('INSERT INTO rutina_dias (rutina_id, nombre, orden) VALUES (?, ?, ?)').run(id, dia.nombre, i).lastInsertRowid);
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
      if (pid == null) return sinPersona(db, x.persona, d.actualizado);
      // Rutina que aún no llegó: se espera. Si la borré yo (lápida) la sesión queda sin rutina; un día fuera de rango, sin día.
      const rutina = x.rutina ? db.prepare('SELECT id FROM rutinas WHERE uid = ?').get(x.rutina)?.id ?? null : null;
      if (x.rutina && rutina == null && !lapida(db, 'rutina', x.rutina)) return 'en_espera';
      const rutinaPerdida = !!x.rutina && rutina == null;
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
      // Si perdió su rutina o su día (lápida local, rutina más corta) la versión local ya no es la del documento:
      // se estampa con "ahora" para que se suba y todos los equipos converjan en la versión degradada.
      const degradada = rutinaPerdida || (x.dia_posicion != null && dia == null);
      db.prepare('UPDATE sesiones SET actualizado = ? WHERE id = ?').run(degradada ? ahoraDespues(db, d.actualizado) : d.actualizado, id);
      return degradada ? 'degradado' : 'aplicado';
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
      if (pid == null) return sinPersona(db, x.persona, d.actualizado);
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
      if (pid == null) return sinPersona(db, x.persona, d.actualizado);
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
      if (pid == null) return sinPersona(db, x.persona, d.actualizado);
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
 * Devuelve 'aplicado', 'degradado' (aplicado, pero con un cambio local que hay que subir), 'ignorado' o
 * 'en_espera' (falta la persona de la que depende).
 */
export function aplicarDocumento(db, d) {
  const m = MANEJADORES[d?.tipo];
  if (!m || !TIPOS.includes(d.tipo)) return 'ignorado';
  // SAVEPOINT: sirve solo o dentro de una transacción externa (un lote).
  db.exec('SAVEPOINT aplicar_doc');
  try {
    const res = despachar(db, d);
    db.exec('RELEASE aplicar_doc');
    return res;
  } catch (err) {
    db.exec('ROLLBACK TO aplicar_doc');
    db.exec('RELEASE aplicar_doc');
    throw err;
  }
}

// Los alias de persona (unificadas) se resuelven antes que el camino común.
function despachar(db, d) {
  if (d.borrado) {
    if (d.tipo === 'persona') {
      // Una lápida de la persona más nueva que su alias lo deshace (gana el más nuevo); una más vieja no cuenta.
      const alias = db.prepare('SELECT actualizado FROM sync_alias WHERE origen = ?').get(d.clave);
      if (alias) {
        if (d.actualizado <= alias.actualizado) return 'ignorado';
        db.prepare('DELETE FROM sync_alias WHERE origen = ?').run(d.clave);
      }
    } else if (!d.datos?.por_alias && (d.tipo === 'medida' || d.tipo === 'perfil' || d.tipo === 'favorito')) {
      // (Las lápidas por_alias son las que deja unificar al mover un documento de clave: no son un borrado del usuario.)
      const [uid, resto] = d.clave.split(/\|(.*)/s);
      const destino = resolverAlias(db, uid);
      if (destino !== uid) return borrarHijoDeAlias(db, d, destino, resto);
    }
  }
  if (!d.borrado && d.tipo === 'persona') {
    if (d.datos?.unificada_en) return aplicarAlias(db, d);
    const alias = db.prepare('SELECT actualizado FROM sync_alias WHERE origen = ?').get(d.clave);
    // Un documento común de una persona que acá ya es alias: si es más nuevo, el alias se vuelve a afirmar con una marca
    // posterior (se sube y pisa al documento viejo en la nube); si no, es un documento atrasado.
    if (alias) {
      if (d.actualizado <= alias.actualizado) return 'ignorado';
      db.prepare('UPDATE sync_alias SET actualizado = ? WHERE origen = ?').run(ahoraDespues(db, d.actualizado), d.clave);
      return 'degradado';
    }
  }
  if (!d.borrado && d.tipo !== 'persona' && d.datos?.persona) {
    const destino = resolverAlias(db, d.datos.persona);
    if (destino !== d.datos.persona) return aplicarHijoDeAlias(db, d, destino);
  }
  return aplicarComun(db, d);
}

function aplicarComun(db, d) {
  const m = MANEJADORES[d.tipo];
  const local = m.local(db, d.clave);
  let res;
  if (d.borrado) {
    if (!local) {
      // Una persona que nunca estuvo acá también queda registrada como muerta (para descartar o esperar a sus hijos).
      if (d.tipo === 'persona') marcarMuerta(db, d.clave, d.actualizado);
      res = 'ignorado';
    } else if (local.actualizado > d.actualizado) res = 'ignorado';
    else res = m.borrar(db, d, local) ?? 'aplicado';
  } else {
    const borradoLocal = lapida(db, d.tipo, d.clave);
    const murio = d.tipo === 'persona' ? muerta(db, d.clave) : null;
    // Un hijo que no es posterior al borrado de su persona (haya revivido o no) está muerto.
    const hijoMuerto = d.tipo !== 'persona' && d.datos?.persona
      && fechaMuerte(db, d.datos.persona) >= d.actualizado;
    // Con la misma fecha gana el borrado.
    if (hijoMuerto || (local && local.actualizado >= d.actualizado) || (borradoLocal && borradoLocal >= d.actualizado) || (murio && murio >= d.actualizado)) res = 'ignorado';
    else {
      res = m.escribir(db, d, local);
      if (d.tipo === 'persona' && res === 'aplicado') {
        // La persona vive sobre un borrado: el del documento (que este equipo quizá no vio) o el que conocía acá.
        const desde = d.datos?.muerta_desde ?? null;
        const conocida = fechaMuerte(db, d.clave); // viva o no: un documento sin `muerta_desde` no puede olvidarla
        const efectivo = [desde, conocida].filter(Boolean).sort().at(-1);
        if (efectivo) {
          matarAnteriores(db, personaId(db, d.clave), d.clave, efectivo);
          reviveSobre(db, d.clave, efectivo);
          // Si el borrado conocido acá no viajaba en el documento, hay que difundirlo: se re-estampa para subirla.
          if (conocida > (desde ?? '')) {
            db.prepare('UPDATE personas SET actualizado = ? WHERE uid = ?').run(ahoraDespues(db, d.actualizado), d.clave);
            res = 'degradado';
          }
        }
      }
    }
  }
  return res;
}

// ---------- alias de persona (unificar) ----------

/**
 * Claves ("tipo|clave") de documentos que hay que subir aunque su marca no sea posterior al último envío: las filas que un
 * receptor movió de clave conservando su marca. Si la nube ya tiene algo igual o más nuevo, la subida no cambia nada.
 */
export function marcarResubir(db, claves) {
  const previas = (() => { try { return JSON.parse(db.prepare("SELECT valor FROM sync_estado WHERE clave = 'resubir'").get()?.valor) ?? []; } catch { return []; } })();
  const todas = [...new Set([...previas, ...claves])];
  db.prepare("INSERT INTO sync_estado (clave, valor) VALUES ('resubir', ?) ON CONFLICT (clave) DO UPDATE SET valor = excluded.valor").run(JSON.stringify(todas));
}

/** Persona a la que apunta `uid` tras seguir los alias (el propio uid si no es alias). Los ciclos no existen: ver aplicarAlias. */
export function resolverAlias(db, uid) {
  const vistos = new Set();
  for (let u = uid; ;) {
    const a = db.prepare('SELECT destino FROM sync_alias WHERE origen = ?').get(u);
    if (!a || vistos.has(u)) return u;
    vistos.add(u);
    u = a.destino;
  }
}

export function registrarAlias(db, origen, destino, actualizado, datos) {
  db.prepare(`INSERT INTO sync_alias (origen, destino, actualizado, datos) VALUES (?, ?, ?, ?)
    ON CONFLICT (origen) DO UPDATE SET destino = excluded.destino, actualizado = excluded.actualizado, datos = excluded.datos`)
    .run(origen, destino, actualizado, JSON.stringify(datos));
}

/**
 * Borra la fila de una persona (y lo que le quede) sin dejar lápidas ni persona muerta: unificar no es borrar, y si la
 * conservada está muerta, "gana el más nuevo" ya decidió y no hay nada que avisar. Tras fusionarla no le queda nada.
 */
export function quitarPersonaFusionada(db, id, uid) {
  const claves = [['persona', uid],
    ...db.prepare('SELECT uid FROM rutinas WHERE persona_id = ?').all(id).map(r => ['rutina', r.uid]),
    ...db.prepare('SELECT uid FROM sesiones WHERE persona_id = ?').all(id).map(r => ['sesion', r.uid]),
    ...db.prepare('SELECT fecha FROM medidas WHERE persona_id = ?').all(id).map(r => ['medida', `${uid}|${r.fecha}`]),
    ...db.prepare('SELECT 1 FROM perfil WHERE persona_id = ?').all(id).map(() => ['perfil', uid]),
    ...db.prepare('SELECT ejercicio_id FROM favoritos WHERE persona_id = ?').all(id).map(r => ['favorito', `${uid}|${r.ejercicio_id}`])];
  db.prepare('DELETE FROM ajustes WHERE clave = ?').run(claveSembrado(id));
  db.prepare('DELETE FROM personas WHERE id = ?').run(id);
  for (const [tipo, clave] of claves) quitarLapida(db, tipo, clave);
  db.prepare('DELETE FROM sync_muertas WHERE persona = ?').run(uid);
}

const PISO = '1970-01-01T00:00:00.000Z';
const masUno = (db, s) => db.prepare("SELECT strftime('%Y-%m-%dT%H:%M:%fZ', ?, '+0.001 seconds') AS t").get(s).t;
const mayorDe = (...xs) => xs.filter(Boolean).sort().at(-1);

/**
 * Pasa todo lo de la persona `origenId` a `destinoId` (sin tocar a la persona de origen). Devuelve cuántas filas tocó.
 * Choques por clave natural: medidas (misma fecha) y perfil, gana la fila con `actualizado` más nuevo; favoritos se suman.
 * Las plantillas de ejemplo sin tocar de la de origen se descartan si el destino ya tiene una con ese nombre.
 * Todo lo movido se re-estampa con una marca posterior a lo que ya está en la nube (para que suba bajo la persona
 * nueva) y las claves naturales viejas quedan con lápida de marca posterior a su documento; la fila nueva lleva una marca
 * todavía posterior (1 ms) a esa lápida: la lápida vieja, traducida a la clave nueva, no la borra.
 * Quien unifica re-estampa también la fila que ya estaba en el destino cuando hubo choque (gane la de origen o no): su decisión
 * pisa a lo que otros equipos tengan de las dos y todos convergen en ella.
 * Con `receptor` (el equipo se entera del alias por la nube) las claves naturales se mueven tal cual: conservan su marca
 * original y no dejan lápida. Lo ya subido lo convierte quien lo vea (aplicarHijoDeAlias) y lo no subido sube solo con su
 * marca; así una lápida ajena más vieja que la fila (un borrado de otro equipo) sigue pudiendo borrarla.
 */
export function fusionarPersona(db, origenId, destinoId, { receptor = false } = {}) {
  const origenUid = db.prepare('SELECT uid FROM personas WHERE id = ?').get(origenId).uid;
  const t = ahoraDespues(db, PISO);
  let tocado = 0;
  // Marca de una fila natural movida: la del que unifica es posterior a todo; la del receptor es la que traía.
  const estampar = (tabla, donde, params, original, piso) => db.prepare(`UPDATE ${tabla} SET actualizado = ${receptor ? '?' : 'MAX(actualizado, ?)'} WHERE ${donde}`)
    .run(receptor ? original : masUno(db, piso), ...params);
  const cerrarClave = (tipo, clave, piso) => (receptor ? quitarLapida(db, tipo, clave) : lapidaPosterior(tipo, clave, piso));
  const lapidaPosterior = (tipo, clave, piso, porAlias = 1) => db.prepare('UPDATE sync_borrados SET fecha = MAX(fecha, ?), por_alias = ? WHERE tipo = ? AND clave = ?').run(piso, porAlias, tipo, clave);

  // Lo de la persona de origen que no es posterior al borrado conocido de la conservada está muerto ("gana el más nuevo"), igual
  // que lo que ella ya tenía: así el resultado no depende de si llegó antes o después de enterarse del borrado.
  const destinoUid = db.prepare('SELECT uid FROM personas WHERE id = ?').get(destinoId).uid;
  const aSubir = []; // receptor: filas movidas con su marca original que igual hay que (re)subir bajo la clave nueva
  const muerte = fechaMuerte(db, destinoUid);
  if (muerte) matarAnteriores(db, origenId, origenUid, muerte);

  const nombresDestino = new Set(db.prepare('SELECT nombre FROM rutinas WHERE persona_id = ?').all(destinoId).map(r => r.nombre));
  for (const r of db.prepare('SELECT id, uid, nombre, descripcion, actualizado FROM rutinas WHERE persona_id = ?').all(origenId)) {
    if (!nombresDestino.has(r.nombre) || !esPlantillaSinTocar(db, r)) continue;
    db.prepare('DELETE FROM rutinas WHERE id = ?').run(r.id);
    lapidaPosterior('rutina', r.uid, mayorDe(t, masUno(db, r.actualizado)), 0);
    tocado++;
  }

  const rutinas = db.prepare('SELECT id FROM rutinas WHERE persona_id = ?').all(origenId).map(r => r.id);
  const sesiones = db.prepare('SELECT id FROM sesiones WHERE persona_id = ?').all(origenId).map(r => r.id);
  db.prepare('UPDATE rutinas SET persona_id = ? WHERE persona_id = ?').run(destinoId, origenId);
  db.prepare('UPDATE sesiones SET persona_id = ? WHERE persona_id = ?').run(destinoId, origenId);
  for (const [tabla, ids] of [['rutinas', rutinas], ['sesiones', sesiones]]) {
    const fijar = db.prepare(`UPDATE ${tabla} SET actualizado = MAX(actualizado, ?) WHERE id = ?`);
    for (const id of ids) fijar.run(t, id);
    tocado += ids.length;
  }

  for (const m of db.prepare('SELECT * FROM medidas WHERE persona_id = ?').all(origenId)) {
    const previa = db.prepare('SELECT actualizado FROM medidas WHERE persona_id = ? AND fecha = ?').get(destinoId, m.fecha);
    const piso = mayorDe(t, masUno(db, m.actualizado), previa && masUno(db, previa.actualizado));
    const gana = !previa || m.actualizado > previa.actualizado;
    if (!previa) {
      db.prepare('INSERT INTO medidas (persona_id, fecha, peso_kg, cintura, pecho, brazo, pierna, grasa_pct) VALUES (?, ?, ?, ?, ?, ?, ?, ?)')
        .run(destinoId, m.fecha, m.peso_kg, m.cintura, m.pecho, m.brazo, m.pierna, m.grasa_pct);
    } else if (gana) {
      db.prepare('UPDATE medidas SET peso_kg = ?, cintura = ?, pecho = ?, brazo = ?, pierna = ?, grasa_pct = ? WHERE persona_id = ? AND fecha = ?')
        .run(m.peso_kg, m.cintura, m.pecho, m.brazo, m.pierna, m.grasa_pct, destinoId, m.fecha);
    }
    if (receptor && gana) aSubir.push(`medida|${destinoUid}|${m.fecha}`);
    if (gana || (previa && !receptor)) estampar('medidas', 'persona_id = ? AND fecha = ?', [destinoId, m.fecha], m.actualizado, piso);
    db.prepare('DELETE FROM medidas WHERE persona_id = ? AND fecha = ?').run(origenId, m.fecha);
    cerrarClave('medida', `${origenUid}|${m.fecha}`, piso);
    tocado++;
  }

  const perfil = db.prepare('SELECT * FROM perfil WHERE persona_id = ?').get(origenId);
  if (perfil) {
    const previo = db.prepare('SELECT actualizado FROM perfil WHERE persona_id = ?').get(destinoId);
    const piso = mayorDe(t, masUno(db, perfil.actualizado), previo && masUno(db, previo.actualizado));
    const gana = !previo || perfil.actualizado > previo.actualizado;
    const datos = [perfil.altura, perfil.edad, perfil.sexo, perfil.actividad, perfil.objetivo, perfil.fecha_nacimiento];
    if (!previo) {
      db.prepare('INSERT INTO perfil (persona_id, altura, edad, sexo, actividad, objetivo, fecha_nacimiento) VALUES (?, ?, ?, ?, ?, ?, ?)')
        .run(destinoId, ...datos);
    } else if (gana) {
      db.prepare('UPDATE perfil SET altura = ?, edad = ?, sexo = ?, actividad = ?, objetivo = ?, fecha_nacimiento = ? WHERE persona_id = ?')
        .run(...datos, destinoId);
    }
    if (receptor && gana) aSubir.push(`perfil|${destinoUid}`);
    if (gana || (previo && !receptor)) estampar('perfil', 'persona_id = ?', [destinoId], perfil.actualizado, piso);
    db.prepare('DELETE FROM perfil WHERE persona_id = ?').run(origenId);
    cerrarClave('perfil', origenUid, piso);
    tocado++;
  }

  for (const f of db.prepare('SELECT ejercicio_id, actualizado FROM favoritos WHERE persona_id = ?').all(origenId)) {
    const previo = db.prepare('SELECT actualizado FROM favoritos WHERE persona_id = ? AND ejercicio_id = ?').get(destinoId, f.ejercicio_id);
    const piso = mayorDe(t, masUno(db, f.actualizado), previo && masUno(db, previo.actualizado));
    if (!previo) db.prepare('INSERT INTO favoritos (persona_id, ejercicio_id) VALUES (?, ?)').run(destinoId, f.ejercicio_id);
    if (receptor && !previo) aSubir.push(`favorito|${destinoUid}|${f.ejercicio_id}`);
    if (!previo || !receptor) estampar('favoritos', 'persona_id = ? AND ejercicio_id = ?', [destinoId, f.ejercicio_id], f.actualizado, piso);
    db.prepare('DELETE FROM favoritos WHERE persona_id = ? AND ejercicio_id = ?').run(origenId, f.ejercicio_id);
    cerrarClave('favorito', `${origenUid}|${f.ejercicio_id}`, piso);
    tocado++;
  }
  if (aSubir.length) marcarResubir(db, aSubir);
  return tocado;
}

// Documento de persona con `unificada_en`: esa persona pasó a ser otra. Se recuerda el alias y, si este equipo todavía
// tiene a la persona de origen, se le pasa todo a la conservada y se quita la fila sin lápida.
function aplicarAlias(db, d) {
  const origen = d.clave;
  const destino = d.datos.unificada_en;
  // Se conserva siempre el uid menor: así los alias solo apuntan "hacia abajo" y no puede haber ciclos.
  if (typeof destino !== 'string' || !(destino < origen)) return 'ignorado';
  const previo = db.prepare('SELECT actualizado FROM sync_alias WHERE origen = ?').get(origen);
  if (previo && previo.actualizado >= d.actualizado) return 'ignorado';
  if (mayorDe(lapida(db, 'persona', origen), fechaMuerte(db, origen)) >= d.actualizado) return 'ignorado';
  const final = resolverAlias(db, destino);
  const idOrigen = personaId(db, origen);
  const idDestino = personaId(db, final);
  // La conservada murió (gana el más nuevo): no hay a dónde pasar lo de la persona de origen, se quita sin rastro.
  const destinoMuerto = idDestino == null && muerta(db, final) != null;
  if (idOrigen != null && idDestino == null && !destinoMuerto) return 'en_espera';
  const { nombre, color, avatar, creada } = d.datos;
  registrarAlias(db, origen, destino, d.actualizado, { nombre, color, avatar, creada });
  quitarLapida(db, 'persona', origen);
  if (idOrigen == null) return 'aplicado';
  if (destinoMuerto) {
    quitarPersonaFusionada(db, idOrigen, origen);
    return 'aplicado';
  }
  const tocado = fusionarPersona(db, idOrigen, idDestino, { receptor: true });
  quitarPersonaFusionada(db, idOrigen, origen);
  return tocado ? 'degradado' : 'aplicado';
}

// Un documento vivo que nombra a una persona unificada se aplica bajo la conservada. Queda re-estampado (se sube con
// la persona nueva) y, si cambia de clave natural, la clave vieja se borra.
function aplicarHijoDeAlias(db, d, destino) {
  if (fechaMuerte(db, d.datos.persona) >= d.actualizado || fechaMuerte(db, destino) >= d.actualizado) return documentoMuerto(db, d);
  // La conservada murió y no está acá: "gana el más nuevo" ya decidió, no hay a quién esperar (no se queda en la lista de espera).
  if (personaId(db, destino) == null && muerta(db, destino) != null) return documentoMuerto(db, d);
  const x = { ...d.datos, persona: destino };
  const clave = d.tipo === 'medida' ? `${destino}|${x.fecha}`
    : d.tipo === 'perfil' ? destino
      : d.tipo === 'favorito' ? `${destino}|${x.ejercicio_id}` : d.clave;
  const res = aplicarComun(db, { ...d, clave, datos: x });
  if (res !== 'aplicado' && res !== 'degradado') return res;
  const t = ahoraDespues(db, d.actualizado);
  const tFila = clave !== d.clave ? masUno(db, t) : t; // con clave nueva, posterior a la lápida de la vieja
  const pid = personaId(db, destino);
  if (d.tipo === 'rutina') db.prepare('UPDATE rutinas SET actualizado = MAX(actualizado, ?) WHERE uid = ?').run(t, d.clave);
  else if (d.tipo === 'sesion') db.prepare('UPDATE sesiones SET actualizado = MAX(actualizado, ?) WHERE uid = ?').run(t, d.clave);
  else if (d.tipo === 'medida') db.prepare('UPDATE medidas SET actualizado = MAX(actualizado, ?) WHERE persona_id = ? AND fecha = ?').run(tFila, pid, x.fecha);
  else if (d.tipo === 'perfil') db.prepare('UPDATE perfil SET actualizado = MAX(actualizado, ?) WHERE persona_id = ?').run(tFila, pid);
  else db.prepare('UPDATE favoritos SET actualizado = MAX(actualizado, ?) WHERE persona_id = ? AND ejercicio_id = ?').run(tFila, pid, x.ejercicio_id);
  if (clave !== d.clave) db.prepare('INSERT OR REPLACE INTO sync_borrados (tipo, clave, fecha, por_alias) VALUES (?, ?, ?, 1)').run(d.tipo, d.clave, t);
  return 'degradado';
}

// Borrado (de una medida, perfil o favorito) con la clave de una persona unificada: se traduce a la clave de la conservada.
// Si es más nuevo que lo local, borra y deja lápida (más nueva) de la clave nueva para que se propague.
function borrarHijoDeAlias(db, d, destino, resto) {
  const clave = d.tipo === 'perfil' ? destino : `${destino}|${resto}`;
  const res = aplicarComun(db, { ...d, clave });
  if (res !== 'aplicado') return res;
  db.prepare('INSERT OR REPLACE INTO sync_borrados (tipo, clave, fecha) VALUES (?, ?, ?)').run(d.tipo, clave, ahoraDespues(db, d.actualizado));
  return 'degradado';
}

// La versión más nueva de una rutina o sesión pertenece a una persona muerta: el documento está muerto. Si acá queda una
// versión más vieja (de antes de que se supiera) se borra y se deja lápida con la misma marca del documento, para que los
// que dependen de él (las sesiones de una rutina) no queden esperando. La nube ya tiene ese documento: no hay nada que subir.
function documentoMuerto(db, d) {
  if (d.tipo !== 'rutina' && d.tipo !== 'sesion') return 'ignorado';
  const local = MANEJADORES[d.tipo].local(db, d.clave);
  if (local && local.actualizado > d.actualizado) return 'ignorado';
  if (local) MANEJADORES[d.tipo].borrar(db, d, local);
  db.prepare('INSERT INTO sync_borrados (tipo, clave, fecha) VALUES (?, ?, ?) ON CONFLICT (tipo, clave) DO UPDATE SET fecha = MAX(fecha, excluded.fecha)')
    .run(d.tipo, d.clave, d.actualizado);
  return 'aplicado';
}
