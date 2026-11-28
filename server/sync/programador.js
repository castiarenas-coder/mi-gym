// Sincronización automática: al arrancar, cada 5 minutos, al terminar un entrenamiento y a pedido.
//
// Una sola vuelta a la vez. Lo que se pida mientras corre una vuelta (o una operación exclusiva, como vincular)
// se junta en UNA vuelta de seguimiento que arranca al terminar. Relojes y temporizadores se inyectan para probarlo.
// `sincronizar()` hace una vuelta completa; si falta sesión, plan, consentimiento o vínculo lanza un ErrorCuenta
// (motivo omitido) y la vuelta no hace nada.

import { MOTIVOS_OMITIDOS, traducir } from './errores.js';
import { ErrorSupabase } from './supabase.js';

const desvinculados = (t) => { t?.unref?.(); return t; };
const TIMERS = {
  setInterval: (f, ms) => desvinculados(setInterval(f, ms)),
  setTimeout: (f, ms) => desvinculados(setTimeout(f, ms)),
  clearInterval, clearTimeout,
};

export function crearProgramador({ sincronizar, intervaloMs = 300_000, reintentoMs = 60_000, reintentoMaxMs = 300_000, ahora = () => new Date(), timers = TIMERS }) {
  let corriendo = null;
  let seguiente = null;
  let intervalo = null;
  let reintento = null;
  let ultima = null;
  let error = null;
  let espera = reintentoMs; // se duplica con cada falla de red hasta el tope y vuelve al inicio con un éxito

  const libre = () => corriendo.catch(() => {});

  function cancelarReintento() {
    if (reintento) { timers.clearTimeout(reintento); reintento = null; }
  }

  async function vuelta() {
    cancelarReintento();
    try {
      const resultado = await sincronizar();
      ultima = ahora().toISOString();
      error = null;
      espera = reintentoMs;
      return { estado: 'ok', resultado };
    } catch (e) {
      if (MOTIVOS_OMITIDOS.includes(e?.codigo)) { error = null; espera = reintentoMs; return { estado: 'omitida', motivo: e.codigo }; }
      const t = traducir(e);
      error = t.mensaje;
      if (e instanceof ErrorSupabase && e.codigo === 'sin_red') {
        reintento = timers.setTimeout(() => { reintento = null; void pedir(); }, espera);
        espera = Math.min(espera * 2, reintentoMaxMs);
      } else if (t.codigo === 'interno') {
        console.error('[sincronizacion]', e?.name ?? 'Error'); // sin el mensaje crudo: podría traer datos internos
      }
      return { estado: 'error', codigo: t.codigo, mensaje: t.mensaje, status: t.status };
    }
  }

  /** Pide una vuelta; devuelve su resultado. Si hay una en curso, se junta en una sola de seguimiento. */
  function pedir() {
    if (corriendo) {
      seguiente ??= libre().then(() => { seguiente = null; return pedir(); });
      return seguiente;
    }
    corriendo = vuelta().finally(() => { corriendo = null; });
    return corriendo;
  }

  /** Corre `fn` sin que haya ninguna vuelta al mismo tiempo (espera la que está en curso). */
  function exclusivo(fn) {
    if (corriendo) return libre().then(() => exclusivo(fn));
    corriendo = Promise.resolve().then(fn).finally(() => { corriendo = null; });
    return corriendo;
  }

  return {
    iniciar() {
      if (intervalo) return;
      void pedir();
      intervalo = timers.setInterval(() => { void pedir(); }, intervaloMs);
    },
    detener() {
      if (intervalo) { timers.clearInterval(intervalo); intervalo = null; }
      cancelarReintento();
    },
    /** Olvida el error y el reintento pendiente (al cerrar sesión o borrar la cuenta). */
    reiniciar() { cancelarReintento(); error = null; espera = reintentoMs; },
    /** Avisa que hay algo nuevo (p. ej. terminó un entrenamiento). No espera. */
    avisar() { void pedir(); },
    /** "Sincronizar ahora": espera el resultado de la vuelta. */
    ahora: pedir,
    exclusivo,
    estado: () => ({ ultimaSincronizacion: ultima, error, enCurso: corriendo !== null }),
  };
}
