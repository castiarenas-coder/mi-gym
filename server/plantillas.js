// Rutinas de ejemplo que se crean una sola vez al primer arranque.
// Los ids son los del catálogo (free-exercise-db); si alguno no existe se omite.
const it = (id, series, reps, descanso_seg = 90) => ({ id, series, reps, descanso_seg });

export const PLANTILLAS = [
  {
    nombre: 'Full body 3 días',
    descripcion: 'Cuerpo completo tres veces por semana, con un día de descanso entre cada uno.',
    dias: [
      { nombre: 'Día A', ejercicios: [
        it('Barbell_Squat', 4, '6-8', 120), it('Barbell_Bench_Press_-_Medium_Grip', 4, '6-8', 120),
        it('Bent_Over_Barbell_Row', 3, '8-10'), it('Standing_Military_Press', 3, '8-10'), it('Plank', 3, '30-45 s', 60),
      ] },
      { nombre: 'Día B', ejercicios: [
        it('Leg_Press', 3, '10-12'), it('Dumbbell_Bench_Press', 3, '8-12'), it('Wide-Grip_Lat_Pulldown', 3, '8-12'),
        it('Dumbbell_Shoulder_Press', 3, '10-12'), it('Barbell_Curl', 3, '10-12', 60), it('Triceps_Pushdown', 3, '10-12', 60),
      ] },
      { nombre: 'Día C', ejercicios: [
        it('Goblet_Squat', 3, '10-12'), it('Pushups', 3, '10-15', 60), it('Seated_Cable_Rows', 3, '10-12'),
        it('Side_Lateral_Raise', 3, '12-15', 60), it('Lying_Leg_Curls', 3, '10-12'), it('Crunches', 3, '15-20', 45),
      ] },
    ],
  },
  {
    nombre: 'Empuje / Tirón / Piernas',
    descripcion: 'Seis días: empuje, tirón y piernas, repetido dos veces por semana.',
    dias: [
      { nombre: 'Día A – Empuje', ejercicios: [
        it('Barbell_Bench_Press_-_Medium_Grip', 4, '6-8', 120), it('Barbell_Incline_Bench_Press_-_Medium_Grip', 3, '8-10'),
        it('Dumbbell_Shoulder_Press', 3, '8-12'), it('Side_Lateral_Raise', 3, '12-15', 60),
        it('Triceps_Pushdown', 3, '10-12', 60), it('Dips_-_Triceps_Version', 3, '8-12', 75),
      ] },
      { nombre: 'Día B – Tirón', ejercicios: [
        it('Pullups', 4, '6-10', 120), it('Bent_Over_Barbell_Row', 4, '8-10'), it('Seated_Cable_Rows', 3, '10-12'),
        it('Face_Pull', 3, '12-15', 60), it('Barbell_Curl', 3, '8-12', 60), it('Hammer_Curls', 3, '10-12', 60),
      ] },
      { nombre: 'Día C – Piernas', ejercicios: [
        it('Barbell_Squat', 4, '6-8', 150), it('Leg_Press', 3, '10-12'), it('Lying_Leg_Curls', 3, '10-12'),
        it('Leg_Extensions', 3, '12-15', 60), it('Barbell_Hip_Thrust', 3, '8-12'), it('Standing_Calf_Raises', 4, '12-15', 60),
      ] },
    ],
  },
];

const CLAVE = 'plantillas_sembradas';

// Crea las plantillas si nunca se sembraron y no hay rutinas propias. Devuelve cuántas creó.
export function sembrarPlantillas(db, plantillas = PLANTILLAS) {
  if (db.prepare('SELECT 1 FROM ajustes WHERE clave = ?').get(CLAVE)) return 0;
  const hayRutinas = db.prepare('SELECT 1 FROM rutinas LIMIT 1').get();
  const marcar = () => db.prepare('INSERT INTO ajustes (clave, valor) VALUES (?, ?)').run(CLAVE, new Date().toISOString());
  if (hayRutinas) { marcar(); return 0; }

  const existe = db.prepare('SELECT 1 FROM ejercicios WHERE id = ?');
  const nuevaRutina = db.prepare('INSERT INTO rutinas (nombre, descripcion) VALUES (?, ?)');
  const nuevoDia = db.prepare('INSERT INTO rutina_dias (rutina_id, nombre, orden) VALUES (?, ?, ?)');
  const nuevoItem = db.prepare('INSERT INTO rutina_ejercicios (dia_id, ejercicio_id, orden, series, reps, descanso_seg) VALUES (?, ?, ?, ?, ?, ?)');
  db.exec('BEGIN');
  try {
    for (const p of plantillas) {
      const rutinaId = Number(nuevaRutina.run(p.nombre, p.descripcion).lastInsertRowid);
      p.dias.forEach((d, i) => {
        const diaId = Number(nuevoDia.run(rutinaId, d.nombre, i).lastInsertRowid);
        d.ejercicios.filter(e => existe.get(e.id)).forEach((e, orden) => nuevoItem.run(diaId, e.id, orden, e.series, e.reps, e.descanso_seg));
      });
    }
    marcar();
    db.exec('COMMIT');
  } catch (err) {
    db.exec('ROLLBACK');
    throw err;
  }
  return plantillas.length;
}
