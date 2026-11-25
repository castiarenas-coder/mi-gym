import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { servidorDePrueba } from './helpers.js';

let s;
let ahora = new Date(2026, 10, 25, 10, 0, 0);
before(async () => { s = await servidorDePrueba({ ahora: () => new Date(ahora) }); });
after(() => s.cerrar());

const avanzar = min => { ahora = new Date(ahora.getTime() + min * 60000); };

async function rutinaConDia() {
  const r = (await s.pedir('/api/rutinas', { method: 'POST', body: { nombre: 'Fuerza', dias: ['Día A'] } })).json;
  const dia = r.dias[0].id;
  await s.pedir(`/api/rutinas/${r.id}/dias/${dia}/ejercicios`, { method: 'POST', body: { ejercicio_id: 'Barbell_Squat', series: 3, reps: '8-10', descanso_seg: 120 } });
  await s.pedir(`/api/rutinas/${r.id}/dias/${dia}/ejercicios`, { method: 'POST', body: { ejercicio_id: 'Bench_Press', series: 2, reps: '12' } });
  return { rutina: r.id, dia };
}

const serie = (id, ejercicio, n, cambios) =>
  s.pedir(`/api/sesiones/${id}/series/${ejercicio}/${n}`, { method: 'PATCH', body: cambios });

async function limpiar() {
  s.db.exec('DELETE FROM sesiones');
}

test('sin sesión en curso, /activa devuelve null', async () => {
  await limpiar();
  const r = await s.pedir('/api/sesiones/activa');
  assert.equal(r.status, 200);
  assert.equal(r.json, null);
});

test('iniciar con un día crea series planificadas sin hacer', async () => {
  await limpiar();
  const { rutina, dia } = await rutinaConDia();
  const r = await s.pedir('/api/sesiones', { method: 'POST', body: { dia_id: dia } });
  assert.equal(r.status, 201);
  assert.equal(r.json.estado, 'en_curso');
  assert.equal(r.json.rutina_id, rutina);
  assert.equal(r.json.dia_id, dia);
  assert.equal(r.json.titulo, 'Fuerza – Día A');
  assert.equal(r.json.ejercicios.length, 2);
  const [sq, bp] = r.json.ejercicios;
  assert.equal(sq.ejercicio_id, 'Barbell_Squat');
  assert.equal(sq.nombre, 'Sentadilla con barra');
  assert.equal(sq.series_plan, 3);
  assert.equal(sq.reps_plan, '8-10');
  assert.equal(sq.descanso_seg, 120);
  assert.deepEqual(sq.series.map(x => [x.n, x.hecha]), [[1, false], [2, false], [3, false]]);
  assert.equal(bp.series.length, 2);
  assert.equal(bp.descanso_seg, 90);
  const act = await s.pedir('/api/sesiones/activa');
  assert.equal(act.json.id, r.json.id);
  await limpiar();
});

test('solo puede haber una sesión en curso', async () => {
  await limpiar();
  const a = await s.pedir('/api/sesiones', { method: 'POST', body: {} });
  assert.equal(a.status, 201);
  assert.equal(a.json.titulo, 'Sesión libre');
  assert.deepEqual(a.json.ejercicios, []);
  const b = await s.pedir('/api/sesiones', { method: 'POST', body: {} });
  assert.equal(b.status, 409);
  assert.equal(b.json.activa_id, a.json.id);
  await limpiar();
});

test('valida dia_id y rutina_id inexistentes', async () => {
  await limpiar();
  assert.equal((await s.pedir('/api/sesiones', { method: 'POST', body: { dia_id: 9999 } })).status, 404);
  assert.equal((await s.pedir('/api/sesiones', { method: 'POST', body: { rutina_id: 9999 } })).status, 404);
});

test('marca series, edita peso y reps, agrega y quita series', async () => {
  await limpiar();
  const { dia } = await rutinaConDia();
  const ses = (await s.pedir('/api/sesiones', { method: 'POST', body: { dia_id: dia } })).json;
  const p = await serie(ses.id, 'Barbell_Squat', 1, { peso_kg: 80, reps: 8, hecha: true });
  assert.equal(p.status, 200);
  assert.deepEqual([p.json.peso_kg, p.json.reps, p.json.hecha], [80, 8, true]);

  const nueva = await s.pedir(`/api/sesiones/${ses.id}/series`, { method: 'POST', body: { ejercicio_id: 'Barbell_Squat', peso_kg: 70, reps: 6 } });
  assert.equal(nueva.status, 201);
  assert.equal(nueva.json.n, 4);
  assert.equal(nueva.json.hecha, false);

  const borrar = await s.pedir(`/api/sesiones/${ses.id}/series/Barbell_Squat/2`, { method: 'DELETE' });
  assert.equal(borrar.status, 200);
  const det = (await s.pedir(`/api/sesiones/${ses.id}`)).json;
  const sq = det.ejercicios.find(e => e.ejercicio_id === 'Barbell_Squat');
  assert.deepEqual(sq.series.map(x => x.n), [1, 2, 3]); // renumeradas
  assert.equal(sq.series[2].peso_kg, 70);
  await limpiar();
});

test('valida los datos de una serie', async () => {
  await limpiar();
  const ses = (await s.pedir('/api/sesiones', { method: 'POST', body: {} })).json;
  const mal = (b) => s.pedir(`/api/sesiones/${ses.id}/series`, { method: 'POST', body: b });
  assert.equal((await mal({ ejercicio_id: 'No_Existe' })).status, 404);
  assert.equal((await mal({ ejercicio_id: 'Pushups', peso_kg: -5 })).status, 400);
  assert.equal((await mal({ ejercicio_id: 'Pushups', reps: 1.5 })).status, 400);
  assert.equal((await mal({ ejercicio_id: 'Pushups', rpe: 11 })).status, 400);
  assert.equal((await mal({ ejercicio_id: 'Pushups', reps: 10, peso_kg: 0 })).status, 201);
  assert.equal((await serie(ses.id, 'Pushups', 9, { reps: 5 })).status, 404);
  assert.equal((await s.pedir('/api/sesiones/9999/series', { method: 'POST', body: { ejercicio_id: 'Pushups' } })).status, 404);
  await limpiar();
});

test('un ejercicio extra se suma a la sesión al agregar su primera serie', async () => {
  await limpiar();
  const ses = (await s.pedir('/api/sesiones', { method: 'POST', body: {} })).json;
  await s.pedir(`/api/sesiones/${ses.id}/series`, { method: 'POST', body: { ejercicio_id: 'Dumbbell_Curl', peso_kg: 12, reps: 10 } });
  await s.pedir(`/api/sesiones/${ses.id}/series`, { method: 'POST', body: { ejercicio_id: 'Pushups', reps: 15 } });
  const det = (await s.pedir(`/api/sesiones/${ses.id}`)).json;
  assert.deepEqual(det.ejercicios.map(e => e.ejercicio_id), ['Dumbbell_Curl', 'Pushups']);
  const q = await s.pedir(`/api/sesiones/${ses.id}/ejercicios/Pushups`, { method: 'DELETE' });
  assert.equal(q.status, 200);
  assert.equal((await s.pedir(`/api/sesiones/${ses.id}`)).json.ejercicios.length, 1);
  await limpiar();
});

test('finalizar calcula la duración, descarta series sin hacer y resume', async () => {
  await limpiar();
  const { dia } = await rutinaConDia();
  ahora = new Date(2026, 10, 25, 10, 0, 0);
  const ses = (await s.pedir('/api/sesiones', { method: 'POST', body: { dia_id: dia } })).json;
  await serie(ses.id, 'Barbell_Squat', 1, { peso_kg: 100, reps: 5, hecha: true });
  await serie(ses.id, 'Barbell_Squat', 2, { peso_kg: 100, reps: 5, hecha: true });
  await serie(ses.id, 'Bench_Press', 1, { peso_kg: 60, reps: 10, hecha: true });
  avanzar(45);
  const fin = await s.pedir(`/api/sesiones/${ses.id}`, { method: 'PATCH', body: { finalizar: true, nota: 'Buen día' } });
  assert.equal(fin.status, 200);
  assert.equal(fin.json.estado, 'finalizada');
  assert.equal(fin.json.duracion, 45 * 60);
  assert.equal(fin.json.nota, 'Buen día');
  assert.equal(fin.json.resumen.series_hechas, 3);
  assert.equal(fin.json.resumen.volumen_kg, 100 * 5 * 2 + 60 * 10);
  assert.equal(fin.json.ejercicios[0].series.length, 2); // se descartó la tercera sin hacer
  assert.equal((await s.pedir('/api/sesiones/activa')).json, null);
  // ya finalizada: no se puede finalizar de nuevo con otra duración
  avanzar(10);
  const otra = await s.pedir(`/api/sesiones/${ses.id}`, { method: 'PATCH', body: { finalizar: true } });
  assert.equal(otra.json.duracion, 45 * 60);
});

test('el resumen marca récords nuevos frente a sesiones anteriores', async () => {
  await limpiar();
  const hacer = async (peso, reps) => {
    const ses = (await s.pedir('/api/sesiones', { method: 'POST', body: {} })).json;
    await s.pedir(`/api/sesiones/${ses.id}/series`, { method: 'POST', body: { ejercicio_id: 'Bench_Press', peso_kg: peso, reps, hecha: true } });
    avanzar(30);
    return (await s.pedir(`/api/sesiones/${ses.id}`, { method: 'PATCH', body: { finalizar: true } })).json;
  };
  const primera = await hacer(60, 10);
  assert.deepEqual(primera.resumen.records, []); // la primera vez no es récord: no hay con qué comparar
  avanzar(60);
  const segunda = await hacer(70, 8);
  const tipos = segunda.resumen.records.map(r => [r.ejercicio_id, r.tipo, r.valor, r.anterior]).sort();
  assert.deepEqual(tipos, [['Bench_Press', '1rm', 88.7, 80], ['Bench_Press', 'peso', 70, 60]]);
  avanzar(60);
  const tercera = await hacer(65, 8); // no supera ni el peso ni el 1RM
  assert.deepEqual(tercera.resumen.records, []);
  await limpiar();
});

test('"última vez" devuelve las series hechas de la sesión finalizada más reciente', async () => {
  await limpiar();
  const vacia = await s.pedir('/api/ejercicios/Bench_Press/ultima');
  assert.deepEqual(vacia.json, { sesion_id: null, fecha: null, series: [] });
  const ses = (await s.pedir('/api/sesiones', { method: 'POST', body: {} })).json;
  await s.pedir(`/api/sesiones/${ses.id}/series`, { method: 'POST', body: { ejercicio_id: 'Bench_Press', peso_kg: 60, reps: 10, hecha: true } });
  await s.pedir(`/api/sesiones/${ses.id}/series`, { method: 'POST', body: { ejercicio_id: 'Bench_Press', peso_kg: 62.5, reps: 8, hecha: true } });
  // la sesión en curso todavía no cuenta
  assert.equal((await s.pedir('/api/ejercicios/Bench_Press/ultima')).json.series.length, 0);
  avanzar(30);
  await s.pedir(`/api/sesiones/${ses.id}`, { method: 'PATCH', body: { finalizar: true } });
  const u = (await s.pedir('/api/ejercicios/Bench_Press/ultima')).json;
  assert.equal(u.sesion_id, ses.id);
  assert.deepEqual(u.series.map(x => [x.n, x.peso_kg, x.reps]), [[1, 60, 10], [2, 62.5, 8]]);
  assert.equal((await s.pedir('/api/ejercicios/No_Existe/ultima')).status, 404);
});

test('al iniciar con un día, las series se precargan con lo de la última vez', async () => {
  await limpiar();
  const { dia } = await rutinaConDia();
  const a = (await s.pedir('/api/sesiones', { method: 'POST', body: { dia_id: dia } })).json;
  // sin historial: reps salen del plan ("8-10" -> 8), peso vacío
  assert.deepEqual([a.ejercicios[0].series[0].peso_kg, a.ejercicios[0].series[0].reps], [null, 8]);
  await serie(a.id, 'Barbell_Squat', 1, { peso_kg: 90, reps: 8, hecha: true });
  await serie(a.id, 'Barbell_Squat', 2, { peso_kg: 95, reps: 6, hecha: true });
  avanzar(30);
  await s.pedir(`/api/sesiones/${a.id}`, { method: 'PATCH', body: { finalizar: true } });
  const b = (await s.pedir('/api/sesiones', { method: 'POST', body: { dia_id: dia } })).json;
  const sq = b.ejercicios[0].series;
  assert.deepEqual(sq.map(x => [x.peso_kg, x.reps, x.hecha]), [[90, 8, false], [95, 6, false], [95, 6, false]]);
  await limpiar();
});

test('historial de un ejercicio: series por fecha, mejor serie y 1RM estimado', async () => {
  await limpiar();
  const hacer = async (series) => {
    const ses = (await s.pedir('/api/sesiones', { method: 'POST', body: {} })).json;
    for (const [peso, reps] of series) {
      await s.pedir(`/api/sesiones/${ses.id}/series`, { method: 'POST', body: { ejercicio_id: 'Barbell_Squat', peso_kg: peso, reps, hecha: true } });
    }
    avanzar(30);
    await s.pedir(`/api/sesiones/${ses.id}`, { method: 'PATCH', body: { finalizar: true } });
    avanzar(60 * 24);
  };
  await hacer([[100, 5], [100, 5]]);
  await hacer([[110, 3]]);
  const h = (await s.pedir('/api/ejercicios/Barbell_Squat/historial')).json;
  assert.equal(h.sesiones.length, 2);
  assert.ok(h.sesiones[0].fecha < h.sesiones[1].fecha); // cronológico
  assert.equal(h.sesiones[0].volumen_kg, 1000);
  assert.equal(h.sesiones[0].mejor_peso, 100);
  assert.equal(h.sesiones[0].mejor_e1rm, 116.7);
  assert.equal(h.sesiones[1].mejor_e1rm, 121);
  assert.equal(h.mejor_peso.peso_kg, 110);
  assert.equal(h.mejor_e1rm.valor, 121);
  assert.equal((await s.pedir('/api/ejercicios/No_Existe/historial')).status, 404);
  await limpiar();
});

test('listar y filtrar sesiones; ver detalle; borrar', async () => {
  await limpiar();
  ahora = new Date(2026, 10, 25, 10, 0, 0);
  const crear = async () => {
    const ses = (await s.pedir('/api/sesiones', { method: 'POST', body: {} })).json;
    await s.pedir(`/api/sesiones/${ses.id}/series`, { method: 'POST', body: { ejercicio_id: 'Pushups', reps: 20, hecha: true } });
    avanzar(20);
    await s.pedir(`/api/sesiones/${ses.id}`, { method: 'PATCH', body: { finalizar: true } });
    avanzar(60 * 24);
    return ses.id;
  };
  const a = await crear();
  const b = await crear();
  const c = await crear();
  const lista = (await s.pedir('/api/sesiones')).json;
  assert.deepEqual(lista.items.map(x => x.id), [c, b, a]); // más reciente primero
  assert.equal(lista.items[0].series_hechas, 1);
  assert.equal(lista.items[0].ejercicios, 1);
  assert.equal((await s.pedir('/api/sesiones?limit=2')).json.items.length, 2);
  const filtrada = (await s.pedir('/api/sesiones?desde=2026-11-26&hasta=2026-11-26')).json;
  assert.deepEqual(filtrada.items.map(x => x.id), [b]);
  assert.equal((await s.pedir(`/api/sesiones/${a}`)).status, 200);
  assert.equal((await s.pedir(`/api/sesiones/${a}`, { method: 'DELETE' })).status, 200);
  assert.equal((await s.pedir(`/api/sesiones/${a}`)).status, 404);
  assert.equal((await s.pedir(`/api/sesiones/${a}`, { method: 'DELETE' })).status, 404);
  assert.equal(s.db.prepare('SELECT COUNT(*) AS n FROM series_hechas WHERE sesion_id = ?').get(a).n, 0);
  await limpiar();
});

test('PATCH de nota sin finalizar y validaciones', async () => {
  await limpiar();
  const ses = (await s.pedir('/api/sesiones', { method: 'POST', body: {} })).json;
  const p = await s.pedir(`/api/sesiones/${ses.id}`, { method: 'PATCH', body: { nota: 'Hola' } });
  assert.equal(p.json.nota, 'Hola');
  assert.equal(p.json.estado, 'en_curso');
  assert.equal((await s.pedir(`/api/sesiones/${ses.id}`, { method: 'PATCH', body: { nota: 'x'.repeat(2000) } })).status, 400);
  assert.equal((await s.pedir(`/api/sesiones/${ses.id}`, { method: 'PATCH', body: {} })).status, 400);
  assert.equal((await s.pedir('/api/sesiones/9999', { method: 'PATCH', body: { nota: 'a' } })).status, 404);
  await limpiar();
});
