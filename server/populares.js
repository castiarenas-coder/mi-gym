// Ejercicios clásicos de gimnasio: en la búsqueda salen antes que sus variantes
// cuando empatan en relevancia (ej. "sentadilla" → Sentadilla con barra antes que Sentadilla hack).
export const POPULARES = new Set([
  // Los que usan las plantillas
  'Barbell_Bench_Press_-_Medium_Grip', 'Barbell_Curl', 'Barbell_Hip_Thrust', 'Barbell_Incline_Bench_Press_-_Medium_Grip',
  'Barbell_Squat', 'Bent_Over_Barbell_Row', 'Crunches', 'Dips_-_Triceps_Version', 'Dumbbell_Bench_Press',
  'Dumbbell_Shoulder_Press', 'Face_Pull', 'Goblet_Squat', 'Hammer_Curls', 'Leg_Extensions', 'Leg_Press',
  'Lying_Leg_Curls', 'Plank', 'Pullups', 'Pushups', 'Seated_Cable_Rows', 'Side_Lateral_Raise',
  'Standing_Calf_Raises', 'Standing_Military_Press', 'Triceps_Pushdown', 'Wide-Grip_Lat_Pulldown',
  // Otros básicos
  'Barbell_Deadlift', 'Romanian_Deadlift', 'Sumo_Deadlift', 'Chin-Up', 'Dumbbell_Bicep_Curl', 'Dumbbell_Lunges',
  'Barbell_Lunge', 'Front_Barbell_Squat', 'Dumbbell_Flyes', 'Incline_Dumbbell_Press', 'Lying_Triceps_Press',
  'Seated_Dumbbell_Press', 'Barbell_Shrug', 'Hanging_Leg_Raise', 'Bodyweight_Squat', 'One-Arm_Dumbbell_Row',
  'Cable_Crossover',
]);
