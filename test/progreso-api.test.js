import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { servidorDePrueba } from './helpers.js';

let s;
let ahora = new Date(2026, 10, 25, 10, 0, 0); // miércoles
before(async () => { s = await servidorDePrueba({ ahora: () => new Date(ahora) }); });
after(() => s.cerrar());

const en = (y, m, d) => { ahora = new Date(y, m - 1, d, 10, 0, 0); };

async function sesion(series, ejercicio = 'Bench_Press') {
  const ses = (await s.pedir('/api/sesiones', { method: 'POST', body: {} })).json;
  for (const [peso, reps] of series) {
    await s.pedir(`/api/sesiones/${ses.id}/series`, { method: 'POST', body: { ejercicio_id: ejercicio, peso_kg: peso, reps, hecha: true } });
  }
  ahora = new Date(ahora.getTime() + 40 * 60000);
  await s.pedir(`/api/sesiones/${ses.id}`, { method: 'PATCH', body: { finalizar: true } });
  return ses.id;
}

// ---- Medidas ----
test('medidas: crea, hace upsert por fecha y valida', async () => {
  const a = await s.pedir('/api/medidas', { method: 'POST', body: { fecha: '2026-11-01', peso_kg: 80.5, cintura: 90 } });
  assert.equal(a.status, 201);
  assert.equal(a.json.peso_kg, 80.5);
  // mismo día: se actualiza lo enviado y se conserva lo demás
  const b = await s.pedir('/api/medidas', { method: 'POST', body: { fecha: '2026-11-01', peso_kg: 80 } });
  assert.equal(b.status, 200);
  assert.deepEqual([b.json.peso_kg, b.json.cintura], [80, 90]);
  // null borra un campo
  const c = await s.pedir('/api/medidas', { method: 'POST', body: { fecha: '2026-11-01', cintura: null } });
  assert.equal(c.json.cintura, null);
  // sin fecha usa hoy
  const hoy = await s.pedir('/api/medidas', { method: 'POST', body: { peso_kg: 79 } });
  assert.equal(hoy.json.fecha, '2026-11-25');

  assert.equal((await s.pedir('/api/medidas', { method: 'POST', body: { fecha: 'ayer', peso_kg: 80 } })).status, 400);
  assert.equal((await s.pedir('/api/medidas', { method: 'POST', body: { fecha: '2026-11-02' } })).status, 400);
  assert.equal((await s.pedir('/api/medidas', { method: 'POST', body: { fecha: '2026-11-02', peso_kg: -3 } })).status, 400);
  assert.equal((await s.pedir('/api/medidas', { method: 'POST', body: { fecha: '2026-11-02', grasa_pct: 120 } })).status, 400);
  assert.equal((await s.pedir('/api/medidas', { method: 'POST', body: { fecha: '2026-02-31', peso_kg: 80 } })).status, 400);
});

test('medidas: lista en orden cronológico, filtra y borra', async () => {
  await s.pedir('/api/medidas', { method: 'POST', body: { fecha: '2026-10-01', peso_kg: 82 } });
  const todas = (await s.pedir('/api/medidas')).json;
  assert.deepEqual(todas.map(m => m.fecha), ['2026-10-01', '2026-11-01', '2026-11-25']);
  const rango = (await s.pedir('/api/medidas?desde=2026-11-01&hasta=2026-11-10')).json;
  assert.deepEqual(rango.map(m => m.fecha), ['2026-11-01']);
  assert.equal((await s.pedir('/api/medidas/2026-10-01', { method: 'DELETE' })).status, 200);
  assert.equal((await s.pedir('/api/medidas/2026-10-01', { method: 'DELETE' })).status, 404);
  const put = await s.pedir('/api/medidas/2026-11-01', { method: 'PUT', body: { pecho: 100 } });
  assert.equal(put.json.pecho, 100);
});

// ---- Perfil ----
test('perfil: vacío al inicio y sin cálculos', async () => {
  const p = (await s.pedir('/api/perfil')).json;
  assert.equal(p.perfil.altura_cm, null);
  assert.equal(p.calculos, null);
});

test('perfil: se guarda y calcula IMC, BMR, TDEE y objetivo con el último peso', async () => {
  const r = await s.pedir('/api/perfil', { method: 'PUT', body: { altura_cm: 180, edad: 30, sexo: 'hombre', actividad: 'moderado', objetivo: 'bajar' } });
  assert.equal(r.status, 200);
  assert.equal(r.json.perfil.altura_cm, 180);
  assert.equal(r.json.peso_kg, 79); // medida más reciente (2026-11-25)
  const c = r.json.calculos;
  assert.equal(c.imc, 24.4);
  assert.equal(c.categoria_imc, 'Peso normal');
  // 10*79 + 6.25*180 - 150 + 5 = 1770
  assert.equal(c.bmr, 1770);
  assert.equal(c.tdee, 2744);
  assert.equal(c.kcal_objetivo, 2195);
  assert.equal(c.macros.proteina_g, 158);
  const otra = (await s.pedir('/api/perfil')).json;
  assert.equal(otra.perfil.objetivo, 'bajar');
});

test('perfil: edad desde fecha de nacimiento y validaciones', async () => {
  const r = await s.pedir('/api/perfil', { method: 'PUT', body: { fecha_nacimiento: '1990-01-01', edad: null } });
  assert.equal(r.json.perfil.edad, 36);
  assert.equal(r.json.perfil.fecha_nacimiento, '1990-01-01');
  assert.equal((await s.pedir('/api/perfil', { method: 'PUT', body: { altura_cm: 20 } })).status, 400);
  assert.equal((await s.pedir('/api/perfil', { method: 'PUT', body: { sexo: 'x' } })).status, 400);
  assert.equal((await s.pedir('/api/perfil', { method: 'PUT', body: { actividad: 'x' } })).status, 400);
  assert.equal((await s.pedir('/api/perfil', { method: 'PUT', body: { objetivo: 'x' } })).status, 400);
  assert.equal((await s.pedir('/api/perfil', { method: 'PUT', body: { edad: 3 } })).status, 400);
  assert.equal((await s.pedir('/api/perfil', { method: 'PUT', body: {} })).status, 400);
});

// ---- Resumen ----
test('resumen vacío: 12 semanas en cero y sin records', async () => {
  s.db.exec('DELETE FROM sesiones');
  const r = (await s.pedir('/api/progreso/resumen')).json;
  assert.equal(r.semanas.length, 12);
  assert.ok(r.semanas.every(w => w.sesiones === 0 && w.volumen_kg === 0));
  assert.equal(r.semanas.at(-1).inicio, '2026-11-23');
  assert.equal(r.semanas[0].inicio, '2026-09-07');
  assert.deepEqual(r.racha, { actual: 0, mejor: 0 });
  assert.deepEqual(r.records, []);
  assert.equal(r.esta_semana.sesiones, 0);
  assert.equal(r.ultima_sesion, null);
});

test('resumen con sesiones: semanas, volumen, racha y records por ejercicio', async () => {
  s.db.exec('DELETE FROM sesiones');
  en(2026, 11, 10); await sesion([[60, 10], [60, 8]]);          // semana 11/09: 1080
  en(2026, 11, 17); await sesion([[65, 8]]);                    // semana 11/16: 520
  en(2026, 11, 23); await sesion([[70, 5]], 'Barbell_Squat');   // semana 11/23: 350
  en(2026, 11, 25); await sesion([[67.5, 6]]);                  // misma semana: 405
  en(2026, 11, 25);
  const r = (await s.pedir('/api/progreso/resumen')).json;
  const sem = Object.fromEntries(r.semanas.map(w => [w.inicio, w]));
  assert.deepEqual([sem['2026-11-09'].sesiones, sem['2026-11-09'].volumen_kg], [1, 1080]);
  assert.deepEqual([sem['2026-11-16'].sesiones, sem['2026-11-16'].volumen_kg], [1, 520]);
  assert.deepEqual([sem['2026-11-23'].sesiones, sem['2026-11-23'].volumen_kg], [2, 755]);
  assert.deepEqual(r.esta_semana, { sesiones: 2, volumen_kg: 755 });
  assert.deepEqual(r.racha, { actual: 3, mejor: 3 });
  assert.equal(r.total_sesiones, 4);
  assert.equal(r.volumen_total_kg, 1080 + 520 + 755);
  assert.equal(r.ultima_sesion.fecha.slice(0, 10) >= '2026-11-25', true);
  const bench = r.records.find(x => x.ejercicio_id === 'Bench_Press');
  assert.equal(bench.nombre, 'Press de banca con barra, agarre medio');
  assert.equal(bench.peso_max, 67.5);
  assert.equal(bench.sesiones, 3);
  assert.equal(bench.e1rm_max, 82.3); // 65 x 8 = 82.33
  assert.equal(r.records.find(x => x.ejercicio_id === 'Barbell_Squat').peso_max, 70);
  // ordenados por 1RM descendente
  assert.deepEqual(r.records.map(x => x.ejercicio_id), ['Bench_Press', 'Barbell_Squat']);
});

test('resumen: las sesiones en curso no cuentan', async () => {
  await s.pedir('/api/sesiones', { method: 'POST', body: {} });
  const r = (await s.pedir('/api/progreso/resumen')).json;
  assert.equal(r.total_sesiones, 4);
  assert.ok(r.sesion_activa);
});
