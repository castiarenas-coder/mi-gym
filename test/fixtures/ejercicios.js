// Mini catálogo de prueba (formato free-exercise-db), sin red.
export const CATALOGO_EN = [
  { id: 'Barbell_Squat', name: 'Barbell Squat', force: 'push', level: 'intermediate', mechanic: 'compound', equipment: 'barbell',
    primaryMuscles: ['quadriceps'], secondaryMuscles: ['glutes', 'hamstrings'], category: 'strength',
    instructions: ['Stand with the bar on your back.', 'Squat down.'], images: ['Barbell_Squat/0.jpg', 'Barbell_Squat/1.jpg'] },
  { id: 'Bench_Press', name: 'Barbell Bench Press - Medium Grip', force: 'push', level: 'beginner', mechanic: 'compound', equipment: 'barbell',
    primaryMuscles: ['chest'], secondaryMuscles: ['triceps', 'shoulders'], category: 'strength',
    instructions: ['Lie on the bench.'], images: ['Bench_Press/0.jpg', 'Bench_Press/1.jpg'] },
  { id: 'Pushups', name: 'Pushups', force: 'push', level: 'beginner', mechanic: 'compound', equipment: 'body only',
    primaryMuscles: ['chest'], secondaryMuscles: ['triceps'], category: 'strength',
    instructions: ['Get on the floor.'], images: ['Pushups/0.jpg', 'Pushups/1.jpg'] },
  { id: 'Dumbbell_Curl', name: 'Dumbbell Bicep Curl', force: 'pull', level: 'beginner', mechanic: 'isolation', equipment: 'dumbbell',
    primaryMuscles: ['biceps'], secondaryMuscles: ['forearms'], category: 'strength',
    instructions: ['Hold the dumbbells.'], images: ['Dumbbell_Curl/0.jpg', 'Dumbbell_Curl/1.jpg'] },
  { id: 'Quad_Stretch', name: 'Quad Stretch', force: 'static', level: 'beginner', mechanic: null, equipment: null,
    primaryMuscles: ['quadriceps'], secondaryMuscles: [], category: 'stretching',
    instructions: ['Hold your foot.'], images: ['Quad_Stretch/0.jpg', 'Quad_Stretch/1.jpg'] },
];

export const NOMBRES = {
  'Barbell Squat': 'Sentadilla con barra',
  'Barbell Bench Press - Medium Grip': 'Press de banca con barra, agarre medio',
  Pushups: 'Flexiones de brazos',
  'Dumbbell Bicep Curl': 'Curl de bíceps con mancuernas',
};
export const INSTRUCCIONES = {
  Barbell_Squat: ['Párate con la barra apoyada en la espalda.', 'Bajá en sentadilla.'],
};
