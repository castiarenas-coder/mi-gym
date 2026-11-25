import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  imc, categoriaImc, bmr, factorActividad, tdee, caloriasObjetivo, macros, edadDesde,
  e1rmEpley, volumenSerie, inicioDeSemana, diaLocal, rachaSemanal,
} from '../server/calculos.js';

test('IMC y su categoría', () => {
  assert.equal(imc(70, 175), 22.9);
  assert.equal(imc(0, 175), null);
  assert.equal(imc(70, null), null);
  assert.equal(categoriaImc(17), 'Bajo peso');
  assert.equal(categoriaImc(22.9), 'Peso normal');
  assert.equal(categoriaImc(27), 'Sobrepeso');
  assert.equal(categoriaImc(31), 'Obesidad');
  assert.equal(categoriaImc(null), null);
});

test('BMR de Mifflin-St Jeor para hombre y mujer', () => {
  // 10*80 + 6.25*180 - 5*30 + 5 = 1780
  assert.equal(bmr({ peso_kg: 80, altura_cm: 180, edad: 30, sexo: 'hombre' }), 1780);
  // 10*60 + 6.25*165 - 5*25 - 161 = 1345.25
  assert.equal(bmr({ peso_kg: 60, altura_cm: 165, edad: 25, sexo: 'mujer' }), 1345);
  assert.equal(bmr({ peso_kg: 60, altura_cm: 165, edad: 25, sexo: 'otro' }), null);
  assert.equal(bmr({ peso_kg: 60, altura_cm: null, edad: 25, sexo: 'mujer' }), null);
});

test('TDEE según actividad y calorías según objetivo', () => {
  assert.equal(factorActividad('sedentario'), 1.2);
  assert.equal(factorActividad('moderado'), 1.55);
  assert.equal(factorActividad('nada'), null);
  assert.equal(tdee(1780, 'moderado'), 2759);
  assert.equal(tdee(1780, 'nada'), null);
  assert.equal(caloriasObjetivo(2500, 'bajar'), 2000);
  assert.equal(caloriasObjetivo(2500, 'mantener'), 2500);
  assert.equal(caloriasObjetivo(2500, 'subir'), 2750);
  assert.equal(caloriasObjetivo(2500, 'otro'), null);
});

test('macros sugeridos suman las calorías objetivo (aprox.)', () => {
  const m = macros({ kcal: 2500, peso_kg: 80, objetivo: 'mantener' });
  assert.equal(m.proteina_g, 144); // 1.8 g/kg
  assert.equal(m.grasa_g, 69);     // 25 % de las kcal / 9
  const kcal = m.proteina_g * 4 + m.grasa_g * 9 + m.carbohidratos_g * 4;
  assert.ok(Math.abs(kcal - 2500) <= 8);
  assert.equal(macros({ kcal: 2000, peso_kg: 80, objetivo: 'bajar' }).proteina_g, 160); // 2 g/kg
  assert.equal(macros({ kcal: null, peso_kg: 80, objetivo: 'bajar' }), null);
});

test('edad desde fecha de nacimiento', () => {
  assert.equal(edadDesde('1990-06-15', new Date(2026, 5, 14)), 35);
  assert.equal(edadDesde('1990-06-15', new Date(2026, 5, 15)), 36);
  assert.equal(edadDesde('basura', new Date()), null);
});

test('1RM estimado (Epley) y volumen de una serie', () => {
  assert.equal(e1rmEpley(100, 1), 100);
  assert.equal(e1rmEpley(100, 10), 133.3);
  assert.equal(e1rmEpley(100, 0), null);
  assert.equal(e1rmEpley(null, 5), null);
  assert.equal(volumenSerie(50, 10), 500);
  assert.equal(volumenSerie(null, 10), 0);
});

test('semanas que empiezan el lunes, en hora local', () => {
  assert.equal(inicioDeSemana('2026-11-25'), '2026-11-23'); // miércoles
  assert.equal(inicioDeSemana('2026-11-23'), '2026-11-23'); // lunes
  assert.equal(inicioDeSemana('2026-11-29'), '2026-11-23'); // domingo
  assert.equal(diaLocal(new Date(2026, 10, 25, 23, 30).toISOString()), '2026-11-25');
});

test('racha semanal: semanas seguidas con entrenamiento', () => {
  const hoy = '2026-11-25'; // semana del 23/11
  const con = (...s) => new Set(s);
  assert.deepEqual(rachaSemanal(con(), hoy), { actual: 0, mejor: 0 });
  assert.deepEqual(rachaSemanal(con('2026-11-23', '2026-11-16', '2026-11-09'), hoy), { actual: 3, mejor: 3 });
  // la semana en curso todavía sin entrenar no corta la racha
  assert.deepEqual(rachaSemanal(con('2026-11-16', '2026-11-09'), hoy), { actual: 2, mejor: 2 });
  // pero una semana completa sin entrenar sí
  assert.deepEqual(rachaSemanal(con('2026-11-09', '2026-11-02', '2026-10-26', '2026-10-19', '2026-11-23'), hoy), { actual: 1, mejor: 4 });
});
