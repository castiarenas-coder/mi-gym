import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { normalizar } from './normalizar.js';

const SIN_EQUIPO = 'Sin equipo';

function mapear(mapa, valor, porDefecto = null) {
  if (valor == null || valor === '') return porDefecto;
  return mapa?.[valor] ?? valor;
}

// Convierte un ejercicio de free-exercise-db a la fila de la tabla `ejercicios`.
// `dic` = diccionario fijo (músculos, equipos...), `nombres` = nombre EN → ES,
// `instrucciones` = id → pasos en español. Lo que falte queda en inglés con traducido = 0.
// `ext` = extensión de las fotos (jpg en desarrollo, webp en el catálogo empaquetado).
export function traducirEjercicio(raw, { dic = {}, nombres = {}, instrucciones = {}, ext = 'jpg' } = {}) {
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
    img_ini: raw.images?.[0] ? `${raw.id}/0.${ext}` : null,
    img_fin: raw.images?.[1] ? `${raw.id}/1.${ext}` : null,
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

// Huella del contenido del catálogo: cambia cuando cambia cualquier ejercicio o foto.
export function versionDeCatalogo(filas) {
  return crypto.createHash('sha1').update(JSON.stringify(filas)).digest('hex').slice(0, 12);
}

// Carga el catálogo que viaja con la app (catalogo.json) en la base, sin red.
// Solo actúa en una instalación nueva (sin ejercicios) o cuando la versión del catálogo cambió.
export function cargarCatalogoEmpaquetado(db, dir) {
  const nada = { cargado: false, total: 0 };
  if (!dir) return nada;
  let paquete;
  try { paquete = JSON.parse(fs.readFileSync(path.join(dir, 'catalogo.json'), 'utf8')); } catch { return nada; }
  const filas = paquete?.ejercicios;
  if (!Array.isArray(filas) || filas.length === 0) return nada;
  const version = String(paquete.version ?? versionDeCatalogo(filas));
  const vacia = db.prepare('SELECT COUNT(*) AS n FROM ejercicios').get().n === 0;
  const guardada = db.prepare("SELECT valor FROM ajustes WHERE clave = 'catalogo_version'").get()?.valor;
  if (!vacia && guardada === version) return { cargado: false, total: filas.length, version };
  guardarCatalogo(db, filas);
  db.prepare("INSERT INTO ajustes (clave, valor) VALUES ('catalogo_version', ?) ON CONFLICT(clave) DO UPDATE SET valor = excluded.valor").run(version);
  return { cargado: true, total: filas.length, version };
}
