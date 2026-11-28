import { DatabaseSync } from 'node:sqlite';
import fs from 'node:fs';
import path from 'node:path';

// Ayudas para la migración 6 (identidades y marcas de cambio para sincronizar).
const AHORA = "strftime('%Y-%m-%dT%H:%M:%fZ', 'now')";
// Marca de un cambio sobre una fila que ya la tiene: nunca menor ni igual a la anterior (+1 ms, aritmética exacta de
// SQLite en milisegundos), así una edición local supera siempre a una versión con fecha adelantada y se sube y gana.
const MONOTONO = `MAX(${AHORA}, COALESCE(strftime('%Y-%m-%dT%H:%M:%fZ', actualizado, '+0.001 seconds'), ''))`;
// UUID v4 con 16 bytes al azar; `fila` se nombra para que SQLite lo evalúe una vez por fila.
const UUID_V4 = (fila) => `(WITH h(x) AS (SELECT lower(hex(randomblob(16))) WHERE ${fila} IS NOT NULL)
        SELECT substr(x, 1, 8) || '-' || substr(x, 9, 4) || '-4' || substr(x, 14, 3) || '-'
          || substr('89ab', 1 + abs(random()) % 4, 1) || substr(x, 18, 3) || '-' || substr(x, 21, 12) FROM h)`;
// Columnas de contenido de cada tabla sincronizada (todas menos `actualizado` y `uid`). El disparador de cambio
// escucha solo estas: un UPDATE que únicamente escribe `actualizado` no lo dispara, así que fijar la marca a mano
// siempre se respeta (aunque el valor sea igual al anterior). Si una migración futura agrega columnas, hay que sumarlas acá.
const COLUMNAS = {
  personas: 'nombre, color, avatar, creada',
  rutinas: 'nombre, dias, descripcion, persona_id',
  sesiones: 'rutina_id, fecha, duracion, nota, dia_id, estado, titulo, fin, persona_id, grupo',
  medidas: 'persona_id, fecha, peso_kg, cintura, pecho, brazo, pierna, grasa_pct',
  perfil: 'persona_id, altura, edad, sexo, actividad, objetivo, fecha_nacimiento',
  favoritos: 'persona_id, ejercicio_id',
};
const TRIGGERS_DOCUMENTO = [['personas', 'persona'], ['rutinas', 'rutina'], ['sesiones', 'sesion']];
const TRIGGERS_NATURALES = [
  ['medidas', 'medida', (r) => `p.uid || '|' || ${r}.fecha`, (r) => `persona_id = ${r}.persona_id AND fecha = ${r}.fecha`],
  ['perfil', 'perfil', () => 'p.uid', (r) => `persona_id = ${r}.persona_id`],
  ['favoritos', 'favorito', (r) => `p.uid || '|' || ${r}.ejercicio_id`, (r) => `persona_id = ${r}.persona_id AND ejercicio_id = ${r}.ejercicio_id`],
];
const HIJOS = [
  ['rutina_dias', 'rutinas', (r) => `${r}.rutina_id`],
  ['rutina_ejercicios', 'rutinas', (r) => `(SELECT rutina_id FROM rutina_dias WHERE id = ${r}.dia_id)`],
  ['sesion_ejercicios', 'sesiones', (r) => `${r}.sesion_id`],
  ['series_hechas', 'sesiones', (r) => `${r}.sesion_id`],
];

// Migraciones en orden. Nunca se edita una ya publicada: se agrega una nueva al final.
export const MIGRACIONES = [
  {
    version: 1,
    sql: `
      CREATE TABLE ejercicios (
        id TEXT PRIMARY KEY,
        nombre TEXT NOT NULL,
        nombre_en TEXT NOT NULL DEFAULT '',
        busqueda TEXT NOT NULL DEFAULT '',
        musculo_principal TEXT,
        musculos_sec TEXT NOT NULL DEFAULT '[]',
        equipo TEXT,
        categoria TEXT,
        nivel TEXT,
        fuerza TEXT,
        mecanica TEXT,
        instrucciones TEXT NOT NULL DEFAULT '[]',
        traducido INTEGER NOT NULL DEFAULT 0,
        img_ini TEXT,
        img_fin TEXT,
        media_propia TEXT,
        favorito INTEGER NOT NULL DEFAULT 0
      );
      CREATE INDEX idx_ejercicios_musculo ON ejercicios(musculo_principal);
      CREATE INDEX idx_ejercicios_equipo ON ejercicios(equipo);

      CREATE TABLE rutinas (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        nombre TEXT NOT NULL,
        dias TEXT NOT NULL DEFAULT '[]'
      );
      CREATE TABLE rutina_ejercicios (
        rutina_id INTEGER NOT NULL REFERENCES rutinas(id) ON DELETE CASCADE,
        ejercicio_id TEXT NOT NULL REFERENCES ejercicios(id),
        orden INTEGER NOT NULL,
        series INTEGER NOT NULL DEFAULT 3,
        reps TEXT NOT NULL DEFAULT '10',
        descanso_seg INTEGER NOT NULL DEFAULT 90,
        nota TEXT,
        PRIMARY KEY (rutina_id, orden)
      );

      CREATE TABLE sesiones (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        rutina_id INTEGER REFERENCES rutinas(id) ON DELETE SET NULL,
        fecha TEXT NOT NULL,
        duracion INTEGER,
        nota TEXT
      );
      CREATE TABLE series_hechas (
        sesion_id INTEGER NOT NULL REFERENCES sesiones(id) ON DELETE CASCADE,
        ejercicio_id TEXT NOT NULL REFERENCES ejercicios(id),
        n INTEGER NOT NULL,
        peso_kg REAL,
        reps INTEGER,
        rpe REAL,
        PRIMARY KEY (sesion_id, ejercicio_id, n)
      );

      CREATE TABLE medidas (
        fecha TEXT PRIMARY KEY,
        peso_kg REAL,
        cintura REAL,
        pecho REAL,
        brazo REAL,
        pierna REAL,
        grasa_pct REAL
      );

      CREATE TABLE perfil (
        id INTEGER PRIMARY KEY CHECK (id = 1),
        altura REAL,
        edad INTEGER,
        sexo TEXT,
        actividad TEXT,
        objetivo TEXT
      );
    `,
  },
  {
    // F3: las rutinas se dividen en días con nombre; los ejercicios cuelgan del día.
    version: 2,
    sql: `
      ALTER TABLE rutinas ADD COLUMN descripcion TEXT NOT NULL DEFAULT '';

      CREATE TABLE rutina_dias (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        rutina_id INTEGER NOT NULL REFERENCES rutinas(id) ON DELETE CASCADE,
        nombre TEXT NOT NULL,
        orden INTEGER NOT NULL DEFAULT 0
      );
      CREATE INDEX idx_rutina_dias_rutina ON rutina_dias(rutina_id, orden);

      ALTER TABLE rutina_ejercicios RENAME TO rutina_ejercicios_v1;
      CREATE TABLE rutina_ejercicios (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        dia_id INTEGER NOT NULL REFERENCES rutina_dias(id) ON DELETE CASCADE,
        ejercicio_id TEXT NOT NULL REFERENCES ejercicios(id),
        orden INTEGER NOT NULL DEFAULT 0,
        series INTEGER NOT NULL DEFAULT 3,
        reps TEXT NOT NULL DEFAULT '10',
        descanso_seg INTEGER NOT NULL DEFAULT 90,
        nota TEXT
      );
      CREATE INDEX idx_rutina_ejercicios_dia ON rutina_ejercicios(dia_id, orden);

      -- Lo que ya hubiera guardado pasa a un "Día 1" por rutina.
      INSERT INTO rutina_dias (rutina_id, nombre, orden)
        SELECT DISTINCT rutina_id, 'Día 1', 0 FROM rutina_ejercicios_v1;
      INSERT INTO rutina_ejercicios (dia_id, ejercicio_id, orden, series, reps, descanso_seg, nota)
        SELECT d.id, o.ejercicio_id, o.orden, o.series, o.reps, o.descanso_seg, o.nota
        FROM rutina_ejercicios_v1 o JOIN rutina_dias d ON d.rutina_id = o.rutina_id;
      DROP TABLE rutina_ejercicios_v1;

      CREATE TABLE ajustes (
        clave TEXT PRIMARY KEY,
        valor TEXT NOT NULL
      );
    `,
  },
  {
    // F4: sesiones en curso/finalizadas, con los ejercicios que se hicieron en cada una.
    version: 3,
    sql: `
      ALTER TABLE sesiones ADD COLUMN dia_id INTEGER REFERENCES rutina_dias(id) ON DELETE SET NULL;
      ALTER TABLE sesiones ADD COLUMN estado TEXT NOT NULL DEFAULT 'finalizada';
      ALTER TABLE sesiones ADD COLUMN titulo TEXT;
      ALTER TABLE sesiones ADD COLUMN fin TEXT;
      ALTER TABLE series_hechas ADD COLUMN hecha INTEGER NOT NULL DEFAULT 1;

      CREATE TABLE sesion_ejercicios (
        sesion_id INTEGER NOT NULL REFERENCES sesiones(id) ON DELETE CASCADE,
        ejercicio_id TEXT NOT NULL REFERENCES ejercicios(id),
        orden INTEGER NOT NULL DEFAULT 0,
        series_plan INTEGER NOT NULL DEFAULT 0,
        reps_plan TEXT,
        descanso_seg INTEGER NOT NULL DEFAULT 90,
        PRIMARY KEY (sesion_id, ejercicio_id)
      );
      -- Lo que ya hubiera registrado pasa a la tabla nueva.
      INSERT INTO sesion_ejercicios (sesion_id, ejercicio_id, orden, series_plan)
        SELECT sesion_id, ejercicio_id, ROW_NUMBER() OVER (PARTITION BY sesion_id ORDER BY MIN(rowid)) - 1, COUNT(*)
        FROM series_hechas GROUP BY sesion_id, ejercicio_id;

      CREATE INDEX idx_sesiones_fecha ON sesiones(fecha);
      CREATE INDEX idx_series_ejercicio ON series_hechas(ejercicio_id);
      -- Solo una sesión en curso a la vez.
      CREATE UNIQUE INDEX idx_sesion_en_curso ON sesiones(estado) WHERE estado = 'en_curso';
    `,
  },
  {
    // F5: el perfil admite fecha de nacimiento (la edad se calcula sola).
    version: 4,
    sql: `ALTER TABLE perfil ADD COLUMN fecha_nacimiento TEXT;`,
  },
  {
    // F7: varias personas ("perfiles"). Todo lo que había pasa a la persona 1, "Yo".
    version: 5,
    sql: `
      CREATE TABLE personas (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        nombre TEXT NOT NULL,
        color TEXT NOT NULL DEFAULT '#c6ff3d',
        avatar TEXT NOT NULL DEFAULT '',
        creada TEXT NOT NULL
      );
      INSERT INTO personas (id, nombre, color, avatar, creada) VALUES (1, 'Yo', '#c6ff3d', '', strftime('%Y-%m-%dT%H:%M:%fZ', 'now'));

      ALTER TABLE rutinas ADD COLUMN persona_id INTEGER REFERENCES personas(id) ON DELETE CASCADE;
      UPDATE rutinas SET persona_id = 1;
      CREATE INDEX idx_rutinas_persona ON rutinas(persona_id);

      ALTER TABLE sesiones ADD COLUMN persona_id INTEGER REFERENCES personas(id) ON DELETE CASCADE;
      ALTER TABLE sesiones ADD COLUMN grupo TEXT;
      UPDATE sesiones SET persona_id = 1;
      DROP INDEX idx_sesion_en_curso;
      -- Una sesión en curso por persona (varias personas pueden entrenar a la vez, en grupo).
      CREATE UNIQUE INDEX idx_sesion_en_curso ON sesiones(persona_id) WHERE estado = 'en_curso';
      CREATE INDEX idx_sesiones_persona ON sesiones(persona_id, fecha);
      CREATE INDEX idx_sesiones_grupo ON sesiones(grupo) WHERE grupo IS NOT NULL;

      ALTER TABLE medidas RENAME TO medidas_v4;
      CREATE TABLE medidas (
        persona_id INTEGER NOT NULL REFERENCES personas(id) ON DELETE CASCADE,
        fecha TEXT NOT NULL,
        peso_kg REAL,
        cintura REAL,
        pecho REAL,
        brazo REAL,
        pierna REAL,
        grasa_pct REAL,
        PRIMARY KEY (persona_id, fecha)
      );
      INSERT INTO medidas (persona_id, fecha, peso_kg, cintura, pecho, brazo, pierna, grasa_pct)
        SELECT 1, fecha, peso_kg, cintura, pecho, brazo, pierna, grasa_pct FROM medidas_v4;
      DROP TABLE medidas_v4;

      ALTER TABLE perfil RENAME TO perfil_v4;
      CREATE TABLE perfil (
        persona_id INTEGER PRIMARY KEY REFERENCES personas(id) ON DELETE CASCADE,
        altura REAL,
        edad INTEGER,
        sexo TEXT,
        actividad TEXT,
        objetivo TEXT,
        fecha_nacimiento TEXT
      );
      INSERT INTO perfil (persona_id, altura, edad, sexo, actividad, objetivo, fecha_nacimiento)
        SELECT 1, altura, edad, sexo, actividad, objetivo, fecha_nacimiento FROM perfil_v4;
      DROP TABLE perfil_v4;

      -- Los favoritos pasan a ser de cada persona (la columna vieja de ejercicios queda sin uso).
      CREATE TABLE favoritos (
        persona_id INTEGER NOT NULL REFERENCES personas(id) ON DELETE CASCADE,
        ejercicio_id TEXT NOT NULL REFERENCES ejercicios(id) ON DELETE CASCADE,
        PRIMARY KEY (persona_id, ejercicio_id)
      );
      INSERT INTO favoritos (persona_id, ejercicio_id) SELECT 1, id FROM ejercicios WHERE favorito != 0;

      UPDATE ajustes SET clave = 'plantillas_sembradas:1' WHERE clave = 'plantillas_sembradas';
    `,
  },
  {
    // Cuentas y sincronización: identidad estable (uid) y marca de cambio (actualizado) por documento,
    // más el registro de borrados (lápidas) y el estado de la sincronización.
    version: 6,
    sql: `
      ALTER TABLE personas ADD COLUMN uid TEXT;
      ALTER TABLE personas ADD COLUMN actualizado TEXT;
      ALTER TABLE rutinas ADD COLUMN uid TEXT;
      ALTER TABLE rutinas ADD COLUMN actualizado TEXT;
      ALTER TABLE sesiones ADD COLUMN uid TEXT;
      ALTER TABLE sesiones ADD COLUMN actualizado TEXT;
      ALTER TABLE medidas ADD COLUMN actualizado TEXT;
      ALTER TABLE perfil ADD COLUMN actualizado TEXT;
      ALTER TABLE favoritos ADD COLUMN actualizado TEXT;

      -- UUID v4 a partir de 16 bytes al azar. La subconsulta depende de la fila para evaluarse una vez por fila.
      UPDATE personas SET uid = ${UUID_V4('personas.id')}, actualizado = ${AHORA};
      UPDATE rutinas SET uid = ${UUID_V4('rutinas.id')}, actualizado = ${AHORA};
      UPDATE sesiones SET uid = ${UUID_V4('sesiones.id')}, actualizado = ${AHORA};
      UPDATE medidas SET actualizado = ${AHORA};
      UPDATE perfil SET actualizado = ${AHORA};
      UPDATE favoritos SET actualizado = ${AHORA};

      CREATE UNIQUE INDEX idx_personas_uid ON personas(uid);
      CREATE UNIQUE INDEX idx_rutinas_uid ON rutinas(uid);
      CREATE UNIQUE INDEX idx_sesiones_uid ON sesiones(uid);

      CREATE TABLE sync_borrados (
        tipo TEXT NOT NULL,
        clave TEXT NOT NULL,
        fecha TEXT NOT NULL,
        PRIMARY KEY (tipo, clave)
      );
      CREATE TABLE sync_estado (
        clave TEXT PRIMARY KEY,
        valor TEXT
      );
      -- Personas muertas (borradas aquí o en otro equipo) y desde cuándo; sobrevive a la lápida y sirve para
      -- decidir si un documento hijo que llega sin su persona se descarta o espera a que la persona reviva.
      -- viva = 1: la persona revivió sobre un borrado de esa fecha (lo anterior a ella está muerto); viaja en su documento.
      CREATE TABLE sync_muertas (
        persona TEXT PRIMARY KEY,
        fecha TEXT NOT NULL,
        viva INTEGER NOT NULL DEFAULT 0
      );

      ${TRIGGERS_DOCUMENTO.map(([t, tipo]) => `
      CREATE TRIGGER ${t}_uid AFTER INSERT ON ${t} WHEN NEW.uid IS NULL BEGIN
        UPDATE ${t} SET uid = ${UUID_V4(`${t}.id`)} WHERE id = NEW.id;
      END;
      CREATE TRIGGER ${t}_alta AFTER INSERT ON ${t} WHEN NEW.actualizado IS NULL BEGIN
        UPDATE ${t} SET actualizado = ${AHORA} WHERE id = NEW.id;
      END;
      CREATE TRIGGER ${t}_cambio AFTER UPDATE OF ${COLUMNAS[t]} ON ${t} WHEN NEW.actualizado IS OLD.actualizado BEGIN
        UPDATE ${t} SET actualizado = ${MONOTONO} WHERE id = NEW.id;
      END;
      CREATE TRIGGER ${t}_recrea AFTER INSERT ON ${t} WHEN NEW.uid IS NOT NULL BEGIN
        DELETE FROM sync_borrados WHERE tipo = '${tipo}' AND clave = NEW.uid;
      END;
      ${t === 'personas' ? `
      -- Borrar una persona deja lápida de ella y de todo lo suyo con la misma fecha (una sola sentencia: mismo instante),
      -- antes de que el borrado en cascada se lleve los hijos.
      CREATE TRIGGER personas_baja BEFORE DELETE ON personas BEGIN
        INSERT OR REPLACE INTO sync_borrados (tipo, clave, fecha)
          SELECT k.tipo, k.clave, ${AHORA} FROM (
            SELECT 'persona' AS tipo, OLD.uid AS clave
            UNION ALL SELECT 'rutina', uid FROM rutinas WHERE persona_id = OLD.id
            UNION ALL SELECT 'sesion', uid FROM sesiones WHERE persona_id = OLD.id
            UNION ALL SELECT 'medida', OLD.uid || '|' || fecha FROM medidas WHERE persona_id = OLD.id
            UNION ALL SELECT 'perfil', OLD.uid FROM perfil WHERE persona_id = OLD.id
            UNION ALL SELECT 'favorito', OLD.uid || '|' || ejercicio_id FROM favoritos WHERE persona_id = OLD.id
          ) k;
        INSERT OR REPLACE INTO sync_muertas (persona, fecha)
          SELECT clave, fecha FROM sync_borrados WHERE tipo = 'persona' AND clave = OLD.uid;
      END;` : `
      -- OR IGNORE: en un borrado en cascada la lápida ya la dejó la persona, con su fecha.
      CREATE TRIGGER ${t}_baja AFTER DELETE ON ${t} BEGIN
        INSERT OR IGNORE INTO sync_borrados (tipo, clave, fecha) VALUES ('${tipo}', OLD.uid, ${AHORA});
      END;`}`).join('\n')}

      ${TRIGGERS_NATURALES.map(([t, tipo, claveSql, where]) => `
      CREATE TRIGGER ${t}_alta AFTER INSERT ON ${t} WHEN NEW.actualizado IS NULL BEGIN
        UPDATE ${t} SET actualizado = ${AHORA} WHERE ${where('NEW')};
      END;
      CREATE TRIGGER ${t}_cambio AFTER UPDATE OF ${COLUMNAS[t]} ON ${t} WHEN NEW.actualizado IS OLD.actualizado BEGIN
        UPDATE ${t} SET actualizado = ${MONOTONO} WHERE ${where('NEW')};
      END;
      CREATE TRIGGER ${t}_recrea AFTER INSERT ON ${t} BEGIN
        DELETE FROM sync_borrados WHERE tipo = '${tipo}' AND clave = (SELECT ${claveSql('NEW')} FROM personas p WHERE p.id = NEW.persona_id);
      END;
      -- Si la persona ya no existe (borrado en cascada) no hay clave que registrar: su propia lápida cubre todo.
      CREATE TRIGGER ${t}_baja AFTER DELETE ON ${t} BEGIN
        INSERT OR IGNORE INTO sync_borrados (tipo, clave, fecha)
          SELECT '${tipo}', ${claveSql('OLD')}, ${AHORA} FROM personas p WHERE p.id = OLD.persona_id;
      END;`).join('\n')}

      ${HIJOS.map(([t, padre, idPadre]) => ['INSERT', 'UPDATE', 'DELETE'].map(ev => `
      CREATE TRIGGER ${t}_${ev.toLowerCase()}_marca AFTER ${ev} ON ${t} BEGIN
        UPDATE ${padre} SET actualizado = ${MONOTONO} WHERE id = ${idPadre(ev === 'DELETE' ? 'OLD' : 'NEW')};
      END;`).join('\n')).join('\n')}
    `,
  },
];

export function versionActual(db) {
  return db.prepare('SELECT COALESCE(MAX(version), 0) AS v FROM schema_version').get().v;
}

export function migrar(db, migraciones = MIGRACIONES) {
  db.exec('CREATE TABLE IF NOT EXISTS schema_version (version INTEGER PRIMARY KEY, aplicada TEXT NOT NULL)');
  const actual = versionActual(db);
  for (const m of [...migraciones].sort((a, b) => a.version - b.version)) {
    if (m.version <= actual) continue;
    db.exec('BEGIN');
    try {
      db.exec(m.sql);
      db.prepare('INSERT INTO schema_version (version, aplicada) VALUES (?, ?)').run(m.version, new Date().toISOString());
      db.exec('COMMIT');
    } catch (err) {
      db.exec('ROLLBACK');
      throw err;
    }
  }
  return versionActual(db);
}

export function openDb(file = process.env.MI_GYM_DB || path.resolve('data', 'mi_gym.db')) {
  if (file !== ':memory:') fs.mkdirSync(path.dirname(file), { recursive: true });
  const db = new DatabaseSync(file);
  db.exec('PRAGMA busy_timeout = 5000'); // dos arranques casi simultaneos esperan en vez de fallar
  db.exec('PRAGMA foreign_keys = ON');
  if (file !== ':memory:') db.exec('PRAGMA journal_mode = WAL');
  migrar(db);
  return db;
}
