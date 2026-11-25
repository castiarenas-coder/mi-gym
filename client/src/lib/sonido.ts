// Aviso de fin de descanso: vibración + un pitido corto con WebAudio (sin archivos de sonido).

type ConstructorAudio = typeof AudioContext
let contexto: AudioContext | null = null

/** Hay que llamarla dentro de un toque del usuario: los celulares no dejan sonar audio antes. */
export function prepararAudio() {
  try {
    const Ctor: ConstructorAudio | undefined = window.AudioContext ?? (window as unknown as { webkitAudioContext?: ConstructorAudio }).webkitAudioContext
    if (!Ctor) return
    contexto ??= new Ctor()
    if (contexto.state === 'suspended') void contexto.resume()
  } catch { /* sin audio: no pasa nada */ }
}

export function avisarFinDescanso() {
  try { navigator.vibrate?.([250, 120, 250]) } catch { /* sin vibración */ }
  try {
    if (!contexto) return
    const ahora = contexto.currentTime
    for (const [i, frecuencia] of [880, 1175].entries()) {
      const osc = contexto.createOscillator()
      const ganancia = contexto.createGain()
      osc.type = 'sine'
      osc.frequency.value = frecuencia
      ganancia.gain.setValueAtTime(0.0001, ahora + i * 0.22)
      ganancia.gain.exponentialRampToValueAtTime(0.35, ahora + i * 0.22 + 0.02)
      ganancia.gain.exponentialRampToValueAtTime(0.0001, ahora + i * 0.22 + 0.18)
      osc.connect(ganancia).connect(contexto.destination)
      osc.start(ahora + i * 0.22)
      osc.stop(ahora + i * 0.22 + 0.2)
    }
  } catch { /* sin audio */ }
}
