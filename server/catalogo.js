import { normalizar } from './normalizar.js';

const SIN_EQUIPO = 'Sin equipo';

function mapear(mapa, valor, porDefecto = null) {
  if (valor == null || valor === '') return porDefecto;
  return mapa?.[valor] ?? valor;
}

// Convierte un ejercicio de free-exercise-db a la fila de la tabla `ejercicios`.
// `dic` = diccionario fijo (músculos, equipos...), `nombres` = nombre EN → ES,
// `instrucciones` = id → pasos en español. Lo que falte queda en inglés con traducido = 0.
export function traducirEjercicio(raw, { dic = {}, nombres = {}, instrucciones = {} } = {}) {
  const nombre = nombres[raw.name] ?? raw.name;
  const pasosEs = instrucciones[raw.id];
  const tienePasos = Array.isArray(pasosEs) && pasosEs.length > 0;
  const principal = mapear(dic.musculos, raw.primaryMuscles?.[0]);
  const secundarios = (raw.secondaryMuscles ?? []).map(m => mapear(dic.musculos, m));
  const equipo = mapear(dic.equipos, raw.equipment, SIN_EQUIPO);
  const categoria = mapear(dic.categorias, raw.category);
  const traducido = nombres[raw.name] && tienePasos ? 1 : 0;
  return {
    id: raw.id,
    nombre,
    nombre_en: raw.name,
    busqueda: normalizar([nombre, raw.name, principal, equipo, categoria].join(' ')),
    musculo_principal: principal,
    musculos_sec: JSON.stringify(secundarios),
    equipo,
    categoria,
    nivel: mapear(dic.niveles, raw.level),
    fuerza: mapear(dic.fuerza, raw.force),
    mecanica: mapear(dic.mecanica, raw.mechanic),
    instrucciones: JSON.stringify(tienePasos ? pasosEs : raw.instructions ?? []),
    traducido,
    img_ini: raw.images?.[0] ? `${raw.id}/0.jpg` : null,
    img_fin: raw.images?.[1] ? `${raw.id}/1.jpg` : null,
  };
}

// Inserta o actualiza el catálogo SIN pisar lo del usuario (favorito, media_propia).
export function guardarCatalogo(db, filas) {
  const upsert = db.prepare(`
    INSERT INTO ejercicios (id, nombre, nombre_en, busqueda, musculo_principal, musculos_sec, equipo, categoria, nivel,
                            fuerza, mecanica, instrucciones, traducido, img_ini, img_fin)
    VALUES (:id, :nombre, :nombre_en, :busqueda, :musculo_principal, :musculos_sec, :equipo, :categoria, :nivel,
            :fuerza, :mecanica, :instrucciones, :traducido, :img_ini, :img_fin)
    ON CONFLICT(id) DO UPDATE SET
      nombre = excluded.nombre, nombre_en = excluded.nombre_en, busqueda = excluded.busqueda,
      musculo_principal = excluded.musculo_principal, musculos_sec = excluded.musculos_sec,
      equipo = excluded.equipo, categoria = excluded.categoria, nivel = excluded.nivel,
      fuerza = excluded.fuerza, mecanica = excluded.mecanica, instrucciones = excluded.instrucciones,
      traducido = excluded.traducido, img_ini = excluded.img_ini, img_fin = excluded.img_fin
  `);
  db.exec('BEGIN');
  try {
    for (const f of filas) upsert.run(f);
    db.exec('COMMIT');
  } catch (err) {
    db.exec('ROLLBACK');
    throw err;
  }
  return filas.length;
}
