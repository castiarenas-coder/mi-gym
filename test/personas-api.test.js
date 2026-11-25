import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { servidorDePrueba } from './helpers.js';

let s;
let t = Date.UTC(2026, 10, 25, 10, 0, 0);
before(async () => { s = await servidorDePrueba({ ahora: () => new Date(t) }); });
after(() => s.cerrar());

const como = id => ({ 'X-Persona': String(id) });
const api = (id, ruta, init = {}) => s.pedir(ruta, { ...init, headers: { ...como(id), ...init.headers } });
const anaId = async () => (await s.pedir('/api/personas')).json.find(p => p.nombre === 'Anita').id;

test('con una sola persona, las rutas con alcance funcionan sin encabezado', async () => {
  const lista = (await s.pedir('/api/personas')).json;
  assert.equal(lista.length, 1);
  assert.equal(lista[0].nombre, 'Yo');
  assert.equal((await s.pedir('/api/rutinas')).status, 200);
});

test('CRUD de personas con validaciones', async () => {
  assert.equal((await s.pedir('/api/personas', { method: 'POST', body: { nombre: '  ' } })).status, 400);
  assert.equal((await s.pedir('/api/personas', { method: 'POST', body: { nombre: 'Ana', color: 'rojo' } })).status, 400);
  const ana = await s.pedir('/api/personas', { method: 'POST', body: { nombre: 'Ana', color: '#ff7a1a', avatar: '🦊' } });
  assert.equal(ana.status, 201);
  assert.deepEqual([ana.json.nombre, ana.json.color, ana.json.avatar], ['Ana', '#ff7a1a', '🦊']);
  assert.equal((await s.pedir('/api/personas', { method: 'POST', body: { nombre: 'ana' } })).status, 409, 'nombre repetido sin importar mayúsculas');
  const r = await s.pedir(`/api/personas/${ana.json.id}`, { method: 'PATCH', body: { nombre: 'Anita', avatar: '' } });
  assert.equal(r.status, 200);
  assert.deepEqual([r.json.nombre, r.json.avatar], ['Anita', '']);
  assert.equal((await s.pedir('/api/personas/999', { method: 'PATCH', body: { nombre: 'X' } })).status, 404);
  assert.equal((await s.pedir('/api/personas/999', { method: 'DELETE' })).status, 404);
});

test('una persona nueva recibe las 2 rutinas de ejemplo', async () => {
  const rutinas = (await api(await anaId(), '/api/rutinas')).json;
  assert.equal(rutinas.length, 2);
});

test('con varias personas hace falta X-Persona y debe existir', async () => {
  assert.equal((await s.pedir('/api/rutinas')).status, 400);
  assert.equal((await api(999, '/api/rutinas')).status, 400);
  assert.equal((await api('abc', '/api/rutinas')).status, 400);
  assert.equal((await s.pedir('/api/personas')).status, 200, 'la lista de personas no necesita persona');
  assert.equal((await s.pedir('/api/salud')).status, 200);
});

test('rutinas, medidas, perfil y favoritos son de cada persona', async () => {
  const ana = await anaId();
  const r = (await api(1, '/api/rutinas', { method: 'POST', body: { nombre: 'Mía', dias: ['A'] } })).json;
  assert.equal((await api(1, `/api/rutinas/${r.id}`)).status, 200);
  for (const [m, ruta] of [['GET', ''], ['PATCH', ''], ['DELETE', ''], ['POST', '/duplicar'], ['POST', '/dias']]) {
    const x = await api(ana, `/api/rutinas/${r.id}${ruta}`, { method: m, body: m === 'GET' || m === 'DELETE' ? undefined : { nombre: 'x' } });
    assert.equal(x.status, 404, `${m} ${ruta}`);
  }
  assert.equal((await api(ana, '/api/rutinas')).json.some(x => x.id === r.id), false);
  await api(1, '/api/medidas', { method: 'POST', body: { fecha: '2026-11-20', peso_kg: 80 } });
  await api(ana, '/api/medidas', { method: 'POST', body: { fecha: '2026-11-20', peso_kg: 60 } });
  assert.deepEqual((await api(1, '/api/medidas')).json.map(m => m.peso_kg), [80]);
  assert.deepEqual((await api(ana, '/api/medidas')).json.map(m => m.peso_kg), [60]);
  assert.equal((await api(ana, '/api/medidas/2026-11-20', { method: 'DELETE' })).status, 200);
  assert.equal((await api(1, '/api/medidas')).json.length, 1);
  await api(1, '/api/perfil', { method: 'PUT', body: { altura_cm: 180 } });
  assert.equal((await api(1, '/api/perfil')).json.perfil.altura_cm, 180);
  assert.equal((await api(ana, '/api/perfil')).json.perfil.altura_cm, null);
  await api(1, '/api/ejercicios/Pushups', { method: 'PATCH', body: { favorito: true } });
  assert.equal((await api(1, '/api/ejercicios/Pushups')).json.favorito, true);
  assert.equal((await api(ana, '/api/ejercicios/Pushups')).json.favorito, false);
  assert.equal((await api(1, '/api/ejercicios?favoritos=1')).json.total, 1);
  assert.equal((await api(ana, '/api/ejercicios?favoritos=1')).json.total, 0);
  assert.equal((await api(1, '/api/ejercicios')).json.items.find(e => e.id === 'Pushups').favorito, true);
  assert.equal((await api(ana, '/api/ejercicios')).json.items.find(e => e.id === 'Pushups').favorito, false);
});

async function rutinaConDia(persona, ejercicios = ['Barbell_Squat', 'Pushups']) {
  const r = (await api(persona, '/api/rutinas', { method: 'POST', body: { nombre: `Rutina de ${persona}`, dias: ['Día A'] } })).json;
  for (const e of ejercicios) await api(persona, `/api/rutinas/${r.id}/dias/${r.dias[0].id}/ejercicios`, { method: 'POST', body: { ejercicio_id: e, series: 2, reps: '8' } });
  return r.dias[0].id;
}

test('sesión individual: una por persona y sus datos no se mezclan', async () => {
  const ana = await anaId();
  const a = await api(1, '/api/sesiones', { method: 'POST', body: { titulo: 'Libre' } });
  assert.equal(a.status, 201);
  assert.equal((await api(1, '/api/sesiones', { method: 'POST', body: {} })).status, 409);
  const b = await api(ana, '/api/sesiones', { method: 'POST', body: {} });
  assert.equal(b.status, 201, 'otra persona sí puede tener su propia sesión en curso');
  assert.equal((await api(1, '/api/sesiones/activa')).json.id, a.json.id);
  assert.equal((await api(ana, '/api/sesiones/activa')).json.id, b.json.id);
  assert.equal((await api(1, '/api/sesiones/activa')).json.grupo, null);
  assert.equal((await api(ana, `/api/sesiones/${a.json.id}`)).status, 404);
  assert.equal((await api(ana, `/api/sesiones/${a.json.id}`, { method: 'PATCH', body: { nota: 'x' } })).status, 404);
  assert.equal((await api(ana, `/api/sesiones/${a.json.id}/series`, { method: 'POST', body: { ejercicio_id: 'Pushups' } })).status, 404);
  assert.equal((await api(ana, `/api/sesiones/${a.json.id}`, { method: 'DELETE' })).status, 404);
  assert.equal((await api(1, '/api/sesiones')).json.total, 1);
  await api(1, `/api/sesiones/${a.json.id}`, { method: 'DELETE' });
  await api(ana, `/api/sesiones/${b.json.id}`, { method: 'DELETE' });
});

test('entrenar en grupo: una sesión por persona, mismo plan, y cada una con sus últimos pesos', async () => {
  const ana = await anaId();
  const diaId = await rutinaConDia(1);
  // El historial de "Yo": 100 kg en sentadilla. Ana no tiene historial.
  const previa = (await api(1, '/api/sesiones', { method: 'POST', body: { dia_id: diaId } })).json;
  await api(1, `/api/sesiones/${previa.id}/series/Barbell_Squat/1`, { method: 'PATCH', body: { peso_kg: 100, reps: 8, hecha: true } });
  await api(1, `/api/sesiones/${previa.id}`, { method: 'PATCH', body: { finalizar: true } });

  // Validaciones.
  assert.equal((await api(1, '/api/sesiones', { method: 'POST', body: { dia_id: diaId, acompanantes: [1] } })).status, 400, 'no podés acompañarte a vos mismo');
  assert.equal((await api(1, '/api/sesiones', { method: 'POST', body: { dia_id: diaId, acompanantes: [999] } })).status, 404);
  assert.equal((await api(1, '/api/sesiones', { method: 'POST', body: { dia_id: diaId, acompanantes: 'x' } })).status, 400);
  // Ana ya está entrenando: 409 y no se crea nada de nada.
  const enCurso = (await api(ana, '/api/sesiones', { method: 'POST', body: {} })).json;
  const conflicto = await api(1, '/api/sesiones', { method: 'POST', body: { dia_id: diaId, acompanantes: [ana] } });
  assert.equal(conflicto.status, 409);
  assert.match(conflicto.json.error, /Anita/);
  assert.equal((await api(1, '/api/sesiones/activa')).json, null);
  await api(ana, `/api/sesiones/${enCurso.id}`, { method: 'DELETE' });

  const r = await api(1, '/api/sesiones', { method: 'POST', body: { dia_id: diaId, acompanantes: [ana] } });
  assert.equal(r.status, 201);
  assert.ok(r.json.grupo.id);
  assert.equal(r.json.grupo.miembros.length, 2);
  const mio = r.json.grupo.miembros.find(m => m.persona.id === 1);
  const suya = r.json.grupo.miembros.find(m => m.persona.id === ana);
  assert.equal(mio.sesion_id, r.json.id);
  assert.deepEqual(r.json.ejercicios.map(e => e.ejercicio_id), ['Barbell_Squat', 'Pushups']);
  // Prefill: "Yo" arranca con 100 kg; Ana sin peso.
  assert.equal(r.json.ejercicios[0].series[0].peso_kg, 100);
  const deAna = (await api(1, `/api/sesiones/${suya.sesion_id}`)).json; // el líder puede ver al grupo
  assert.deepEqual(deAna.ejercicios.map(e => e.ejercicio_id), ['Barbell_Squat', 'Pushups']);
  assert.equal(deAna.ejercicios[0].series[0].peso_kg, null);
  // Ana ve lo mismo desde su lado y /activa devuelve el grupo.
  const act = (await api(ana, '/api/sesiones/activa')).json;
  assert.equal(act.id, suya.sesion_id);
  assert.equal(act.grupo.miembros.length, 2);
  assert.equal(act.grupo.id, r.json.grupo.id);

  // Cada uno guarda sus series en su propia sesión.
  await api(1, `/api/sesiones/${mio.sesion_id}/series/Barbell_Squat/1`, { method: 'PATCH', body: { peso_kg: 105, reps: 8, hecha: true } });
  await api(1, `/api/sesiones/${suya.sesion_id}/series/Barbell_Squat/1`, { method: 'PATCH', body: { peso_kg: 40, reps: 10, hecha: true } });
  await api(1, `/api/sesiones/${suya.sesion_id}/series/Barbell_Squat/2`, { method: 'PATCH', body: { peso_kg: 40, reps: 10, hecha: true } });
  const parcial = (await api(1, '/api/sesiones/activa')).json.grupo.miembros;
  assert.equal(parcial.find(m => m.persona.id === 1).series_hechas, 1);
  assert.equal(parcial.find(m => m.persona.id === ana).series_hechas, 2);

  // Terminar desde cualquiera finaliza a todos, cada uno con su duración, volumen y récords.
  t += 3600 * 1000;
  const fin = await api(1, `/api/sesiones/${mio.sesion_id}`, { method: 'PATCH', body: { finalizar: true } });
  assert.equal(fin.status, 200);
  assert.equal(fin.json.estado, 'finalizada');
  const fm = fin.json.grupo.miembros;
  assert.deepEqual(fm.map(m => m.estado), ['finalizada', 'finalizada']);
  assert.equal(fm.find(m => m.persona.id === 1).volumen_kg, 840);
  assert.equal(fm.find(m => m.persona.id === ana).volumen_kg, 800);
  assert.equal(fm.find(m => m.persona.id === ana).duracion, 3600);
  assert.ok(fm.find(m => m.persona.id === 1).records.some(x => x.tipo === 'peso' && x.valor === 105));
  assert.equal((await api(1, '/api/sesiones/activa')).json, null);
  assert.equal((await api(ana, '/api/sesiones/activa')).json, null);

  // Resúmenes separados.
  const rm = (await api(1, '/api/progreso/resumen')).json;
  const ra = (await api(ana, '/api/progreso/resumen')).json;
  assert.equal(rm.total_sesiones, 2);
  assert.equal(ra.total_sesiones, 1);
  assert.equal(rm.volumen_total_kg, 800 + 840);
  assert.equal(ra.volumen_total_kg, 800);
  assert.equal(ra.records[0].ejercicio_id, 'Barbell_Squat');
  // Última vez y récords son de cada uno.
  assert.equal((await api(ana, '/api/ejercicios/Barbell_Squat/ultima')).json.series[0].peso_kg, 40);
  assert.equal((await api(1, '/api/ejercicios/Barbell_Squat/ultima')).json.series[0].peso_kg, 105);
  assert.equal((await api(ana, '/api/ejercicios/Barbell_Squat/historial')).json.total_sesiones, 1);
  assert.equal((await api(1, '/api/ejercicios/Barbell_Squat/historial')).json.total_sesiones, 2);
  // El historial lista solo lo propio, pero indica con quién.
  const hist = (await api(ana, '/api/sesiones')).json;
  assert.equal(hist.total, 1);
  assert.deepEqual(hist.items[0].con, ['Yo']);
  // La sesión terminada de Ana sigue accesible para el líder (resumen del grupo).
  assert.equal((await api(1, `/api/sesiones/${suya.sesion_id}`)).status, 200);
});

test('quitar a un acompañante a mitad de la sesión', async () => {
  const ana = await anaId();
  const leo = (await s.pedir('/api/personas', { method: 'POST', body: { nombre: 'Leo' } })).json.id;
  const diaId = await rutinaConDia(1, ['Pushups']);
  const r = (await api(1, '/api/sesiones', { method: 'POST', body: { dia_id: diaId, acompanantes: [ana, leo] } })).json;
  assert.equal(r.grupo.miembros.length, 3);
  assert.equal((await api(1, `/api/sesiones/${r.id}/acompanantes/999`, { method: 'DELETE' })).status, 404);
  const x = await api(1, `/api/sesiones/${r.id}/acompanantes/${ana}`, { method: 'DELETE' });
  assert.equal(x.status, 200);
  assert.equal(x.json.grupo.miembros.length, 2);
  assert.equal((await api(ana, '/api/sesiones/activa')).json, null, 'Ana queda libre');
  const y = await api(1, `/api/sesiones/${r.id}/acompanantes/${leo}`, { method: 'DELETE' });
  assert.equal(y.json.grupo, null, 'con uno solo ya no es un grupo');
  assert.equal((await api(1, '/api/sesiones/activa')).json.grupo, null);
  await api(1, `/api/sesiones/${r.id}`, { method: 'DELETE' });
});

test('borrar personas: no la última, y sus datos se van con ella', async () => {
  const ana = await anaId();
  assert.equal((await s.pedir(`/api/personas/${ana}`, { method: 'DELETE' })).status, 200);
  assert.equal(s.db.prepare('SELECT COUNT(*) n FROM sesiones WHERE persona_id = ?').get(ana).n, 0);
  assert.equal(s.db.prepare('SELECT COUNT(*) n FROM rutinas WHERE persona_id = ?').get(ana).n, 0);
  assert.equal(s.db.prepare('SELECT COUNT(*) n FROM ajustes WHERE clave = ?').get(`plantillas_sembradas:${ana}`).n, 0);
  for (const p of (await s.pedir('/api/personas')).json.filter(p => p.id !== 1)) {
    assert.equal((await s.pedir(`/api/personas/${p.id}`, { method: 'DELETE' })).status, 200);
  }
  const ultima = await s.pedir('/api/personas/1', { method: 'DELETE' });
  assert.equal(ultima.status, 409);
  assert.match(ultima.json.error, /última/);
  // Vuelve a funcionar sin encabezado.
  assert.equal((await s.pedir('/api/rutinas')).status, 200);
});
