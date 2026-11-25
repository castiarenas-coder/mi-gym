// Funciones puras: fórmulas de fuerza, IMC, calorías y fechas. Sin acceso a la base.

const redondear = (n, d = 0) => { const f = 10 ** d; return Math.round(n * f) / f; };
const num = v => (typeof v === 'number' && Number.isFinite(v) ? v : null);
const positivo = v => (num(v) !== null && v > 0 ? v : null);

// ---- Fuerza ----
/** 1RM estimado con la fórmula de Epley. Con 1 repetición es el mismo peso. */
export function e1rmEpley(peso, reps) {
  const p = positivo(peso);
  const r = positivo(reps);
  if (p === null || r === null) return null;
  return r === 1 ? redondear(p, 1) : redondear(p * (1 + r / 30), 1);
}

export function volumenSerie(peso, reps) {
  const p = num(peso);
  const r = num(reps);
  return p !== null && r !== null && p > 0 && r > 0 ? p * r : 0;
}

// ---- Cuerpo ----
export function imc(peso_kg, altura_cm) {
  const p = positivo(peso_kg);
  const a = positivo(altura_cm);
  if (p === null || a === null) return null;
  return redondear(p / (a / 100) ** 2, 1);
}

export function categoriaImc(valor) {
  if (num(valor) === null) return null;
  if (valor < 18.5) return 'Bajo peso';
  if (valor < 25) return 'Peso normal';
  if (valor < 30) return 'Sobrepeso';
  return 'Obesidad';
}

/** Metabolismo basal, Mifflin-St Jeor (kcal/día). */
export function bmr({ peso_kg, altura_cm, edad, sexo }) {
  const p = positivo(peso_kg);
  const a = positivo(altura_cm);
  const e = positivo(edad);
  if (p === null || a === null || e === null) return null;
  if (sexo !== 'hombre' && sexo !== 'mujer') return null;
  return redondear(10 * p + 6.25 * a - 5 * e + (sexo === 'hombre' ? 5 : -161));
}

export const ACTIVIDADES = {
  sedentario: 1.2,
  ligero: 1.375,
  moderado: 1.55,
  intenso: 1.725,
  muy_intenso: 1.9,
};
export const OBJETIVOS = ['bajar', 'mantener', 'subir'];
export const SEXOS = ['hombre', 'mujer'];

export const factorActividad = actividad => ACTIVIDADES[actividad] ?? null;

export function tdee(basal, actividad) {
  const f = factorActividad(actividad);
  if (num(basal) === null || f === null) return null;
  return redondear(basal * f);
}

/** Bajar −20 %, mantener, subir +10 %. */
export function caloriasObjetivo(mantenimiento, objetivo) {
  if (num(mantenimiento) === null) return null;
  const f = { bajar: 0.8, mantener: 1, subir: 1.1 }[objetivo];
  return f === undefined ? null : redondear(mantenimiento * f);
}

/** Proteína por kilo (más al bajar), grasa 25 % de las kcal y el resto en carbohidratos. */
export function macros({ kcal, peso_kg, objetivo }) {
  if (positivo(kcal) === null || positivo(peso_kg) === null) return null;
  const proteina_g = redondear(peso_kg * (objetivo === 'bajar' ? 2 : 1.8));
  const grasa_g = redondear((kcal * 0.25) / 9);
  const carbohidratos_g = Math.max(0, redondear((kcal - proteina_g * 4 - grasa_g * 9) / 4));
  return { proteina_g, grasa_g, carbohidratos_g };
}

export function edadDesde(fechaNacimiento, hoy = new Date()) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(fechaNacimiento ?? ''));
  if (!m) return null;
  const [y, mes, d] = [Number(m[1]), Number(m[2]), Number(m[3])];
  let edad = hoy.getFullYear() - y;
  if (hoy.getMonth() + 1 < mes || (hoy.getMonth() + 1 === mes && hoy.getDate() < d)) edad -= 1;
  return edad >= 0 ? edad : null;
}

/** Todos los cálculos del perfil juntos; null si falta algún dato esencial. */
export function calcularPerfil({ peso_kg, altura_cm, edad, sexo, actividad, objetivo }) {
  const valorImc = imc(peso_kg, altura_cm);
  const basal = bmr({ peso_kg, altura_cm, edad, sexo });
  const mant = tdee(basal, actividad);
  const kcal = caloriasObjetivo(mant, objetivo);
  if (valorImc === null && basal === null) return null;
  return {
    imc: valorImc,
    categoria_imc: categoriaImc(valorImc),
    bmr: basal,
    tdee: mant,
    kcal_objetivo: kcal,
    macros: macros({ kcal, peso_kg, objetivo }),
  };
}

// ---- Fechas (siempre en hora local de la PC) ----
const dos = n => String(n).padStart(2, '0');
export const aFechaLocal = d => `${d.getFullYear()}-${dos(d.getMonth() + 1)}-${dos(d.getDate())}`;
const deFechaLocal = f => { const [y, m, d] = f.split('-').map(Number); return new Date(y, m - 1, d); };

/** "YYYY-MM-DD" local de un instante ISO. */
export const diaLocal = iso => aFechaLocal(new Date(iso));

/** Lunes de la semana de una fecha "YYYY-MM-DD". */
export function inicioDeSemana(fecha) {
  const d = deFechaLocal(fecha);
  d.setDate(d.getDate() - ((d.getDay() + 6) % 7));
  return aFechaLocal(d);
}

export function sumarDias(fecha, dias) {
  const d = deFechaLocal(fecha);
  d.setDate(d.getDate() + dias);
  return aFechaLocal(d);
}

/** Fecha real válida (rechaza 2026-02-31). */
export function fechaValida(texto) {
  if (typeof texto !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(texto)) return false;
  return aFechaLocal(deFechaLocal(texto)) === texto;
}

/**
 * Racha en semanas seguidas con al menos un entrenamiento.
 * `semanas` es un Set de lunes ("YYYY-MM-DD"). La semana en curso sin entrenar todavía no corta la racha.
 */
export function rachaSemanal(semanas, hoy) {
  const actualSemana = inicioDeSemana(hoy);
  let actual = 0;
  let cursor = semanas.has(actualSemana) ? actualSemana : sumarDias(actualSemana, -7);
  while (semanas.has(cursor)) { actual += 1; cursor = sumarDias(cursor, -7); }

  let mejor = 0;
  let corrida = 0;
  let previa = null;
  for (const w of [...semanas].sort()) {
    corrida = previa && sumarDias(previa, 7) === w ? corrida + 1 : 1;
    mejor = Math.max(mejor, corrida);
    previa = w;
  }
  return { actual, mejor };
}
