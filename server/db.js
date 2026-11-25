import { DatabaseSync } from 'node:sqlite';
import fs from 'node:fs';
import path from 'node:path';

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
  db.exec('PRAGMA foreign_keys = ON');
  if (file !== ':memory:') db.exec('PRAGMA journal_mode = WAL');
  migrar(db);
  return db;
}
