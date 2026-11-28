// API local de la cuenta en la nube: iniciar sesión, consentimiento, vincular este equipo y sincronizar.
//
// Mismas protecciones que el resto de /api (X-Mi-Gym en los cambios, Host de la propia máquina). Ninguna respuesta ni
// registro lleva tokens: los errores se traducen con `traducir` y los desconocidos salen como un mensaje genérico.

import { Router } from 'express';
import { randomBytes } from 'node:crypto';
import { crearClienteSupabase, ErrorSupabase } from '../sync/supabase.js';
import { sesionEnDb } from '../sync/secreto.js';
import { sincronizar, leer, reiniciarBajada, enTransaccion } from '../sync/motor.js';
import { estadoVinculo, vincular, personasDuplicadas, unificarPersonas } from '../sync/vincular.js';
import { crearProgramador } from '../sync/programador.js';
import { ErrorCuenta, traducir } from '../sync/errores.js';

const MAX_VERIFICADOR_MS = 10 * 60 * 1000;
const MODOS = ['subir', 'bajar', 'juntar', 'reemplazar'];
const entero = v => Number.isInteger(v);

const escaparHtml = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
const pagina = (titulo, mensaje) => `<!doctype html><html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Rumbo Fit</title><style>body{font-family:system-ui,sans-serif;background:#0b0b0d;color:#f4f4f5;display:grid;place-items:center;min-height:100vh;margin:0;padding:24px;text-align:center}h1{font-size:1.4rem;margin:0 0 8px}p{color:#a1a1aa;margin:0}</style></head><body><main><h1>${escaparHtml(titulo)}</h1><p>${escaparHtml(mensaje)}</p></main></body></html>`;

const emailValido = e => typeof e === 'string' && e.length <= 254 && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e);

/**
 * Crea la cuenta: cliente de Supabase (o el inyectado en pruebas), programador de la sincronización y el router.
 * Devuelve `{ router, programador }`. `programador.iniciar()` lo llama quien arranca el servidor.
 */
export function crearCuenta({ db, supabase, fetchFn = fetch, cliente = null, rutaClave, backupsDir = null, ahora = () => new Date(), timers, intervaloMs }) {
  cliente ??= crearClienteSupabase({ url: supabase.url, anonKey: supabase.anonKey, fetchFn, ...sesionEnDb(db, rutaClave) });
  let ultimaCuenta = null; // lo último que dijo la nube: se muestra si se cae la conexión
  let verificador = null;

  const emailDe = c => (typeof c?.email === 'string' && c.email ? c.email.trim().toLowerCase() : null);

  async function leerCuenta() {
    const c = await cliente.cuenta();
    ultimaCuenta = c;
    return c;
  }

  /** Sesión iniciada, plan Pro y, según se pida, consentimiento y vínculo ya hecho. Devuelve la cuenta. */
  async function exigirListo({ consentimiento = true, vinculo = true } = {}) {
    const c = await leerCuenta();
    const email = emailDe(c);
    if (!email) throw new ErrorCuenta('sin_sesion');
    if (c.plan !== 'pro') throw new ErrorCuenta('plan_requerido');
    if (consentimiento && !c.consentimiento_en) throw new ErrorCuenta('sin_consentimiento');
    if (vinculo && leer(db, 'cuenta') !== email) throw new ErrorCuenta('sin_vinculo');
    return c;
  }

  const programador = crearProgramador({
    ahora, timers, intervaloMs,
    sincronizar: async () => {
      await exigirListo();
      return sincronizar(db, cliente.remoto(), { ahora: ahora().toISOString() });
    },
  });

  const router = Router();
  const fallar = (res, e) => {
    const t = traducir(e);
    if (t.codigo === 'interno') console.error('[cuenta]', e?.name ?? 'Error');
    return res.status(t.status).json({ error: t.mensaje, codigo: t.codigo });
  };
  const ruta = fn => async (req, res) => { try { await fn(req, res); } catch (e) { fallar(res, e); } };
  const invalido = (res, mensaje) => res.status(400).json({ error: mensaje, codigo: 'datos_invalidos' });

  router.get('/', async (_req, res) => {
    const base = { habilitada: true, sesion: null, vinculado: false, ultimaSincronizacion: leer(db, 'ultima_sync'), error: programador.estado().error };
    try {
      const c = await leerCuenta();
      return res.json({ ...base, sesion: { email: c.email, plan: c.plan, consentimiento: Boolean(c.consentimiento_en) }, vinculado: leer(db, 'cuenta') === emailDe(c) });
    } catch (e) {
      if (e instanceof ErrorSupabase && e.codigo === 'sin_sesion') { ultimaCuenta = null; return res.json(base); }
      if (e instanceof ErrorSupabase && e.codigo === 'sesion_vencida') { ultimaCuenta = null; return res.json({ ...base, error: traducir(e).mensaje }); }
      if (e instanceof ErrorSupabase && ultimaCuenta) {
        const c = ultimaCuenta;
        return res.json({ ...base, sesion: { email: c.email, plan: c.plan, consentimiento: Boolean(c.consentimiento_en) }, vinculado: leer(db, 'cuenta') === emailDe(c), error: traducir(e).mensaje });
      }
      return fallar(res, e);
    }
  });

  router.post('/codigo', ruta(async (req, res) => {
    const email = typeof req.body?.email === 'string' ? req.body.email.trim().toLowerCase() : '';
    if (!emailValido(email)) return invalido(res, 'Escribí un mail válido.');
    await cliente.enviarCodigo(email);
    res.json({ ok: true });
  }));

  router.post('/verificar', ruta(async (req, res) => {
    const email = typeof req.body?.email === 'string' ? req.body.email.trim().toLowerCase() : '';
    const codigo = typeof req.body?.codigo === 'string' ? req.body.codigo.trim() : '';
    if (!emailValido(email)) return invalido(res, 'Escribí un mail válido.');
    if (!/^\d{6,10}$/.test(codigo)) return invalido(res, 'El código son solo números (los que te llegaron por mail).');
    await cliente.verificarCodigo(email, codigo);
    res.json({ ok: true });
  }));

  // Google: el navegador va a Google y vuelve a /google/vuelta. El verificador PKCE no sale del servidor.
  router.get('/google', ruta(async (req, res) => {
    verificador = { valor: randomBytes(32).toString('base64url'), creado: ahora().getTime() };
    res.redirect(302, cliente.urlGoogle(`http://${req.headers.host}/api/cuenta/google/vuelta`, verificador.valor));
  }));

  router.get('/google/vuelta', async (req, res) => {
    const pendiente = verificador;
    verificador = null; // sirve una sola vez
    const html = (status, titulo, mensaje) => res.status(status).type('html').send(pagina(titulo, mensaje));
    if (!pendiente || ahora().getTime() - pendiente.creado > MAX_VERIFICADOR_MS) {
      return html(400, 'No se pudo iniciar sesión', 'El intento venció. Volvé a Rumbo Fit y probá de nuevo.');
    }
    if (req.query.error) return html(400, 'No se pudo iniciar sesión', 'Google no completó el ingreso. Volvé a Rumbo Fit y probá de nuevo.');
    const codigo = typeof req.query.code === 'string' ? req.query.code : '';
    if (!codigo) return html(400, 'No se pudo iniciar sesión', 'Falta el código de Google. Volvé a Rumbo Fit y probá de nuevo.');
    try {
      await cliente.canjearCodigoGoogle(codigo, pendiente.valor);
    } catch (e) {
      return html(traducir(e).status, 'No se pudo iniciar sesión', traducir(e).mensaje);
    }
    html(200, 'Listo, ya podés volver a Rumbo Fit', 'Podés cerrar esta pestaña.');
  });

  router.post('/consentimiento', ruta(async (_req, res) => {
    await leerCuenta(); // sin sesión: 401
    await cliente.aceptarConsentimiento();
    programador.avisar();
    res.json({ ok: true });
  }));

  router.get('/vinculo', ruta(async (_req, res) => {
    const c = await exigirListo({ consentimiento: false, vinculo: false });
    const estado = await estadoVinculo(db, cliente.remoto());
    res.json({ estado, vinculado: leer(db, 'cuenta') === emailDe(c), duplicadas: personasDuplicadas(db) });
  }));

  router.post('/vincular', ruta(async (req, res) => {
    const modo = req.body?.modo;
    if (!MODOS.includes(modo)) return invalido(res, 'Elegí una opción válida.');
    const c = await exigirListo({ vinculo: false });
    await programador.exclusivo(() => vincular(db, cliente.remoto(), modo, {
      cuenta: emailDe(c), forzar: req.body?.forzar === true, backupsDir,
    }));
    res.json({ ok: true, ultimaSincronizacion: leer(db, 'ultima_sync') });
  }));

  router.post('/unificar', ruta(async (req, res) => {
    const { conservar, duplicada } = req.body ?? {};
    if (!entero(conservar) || !entero(duplicada)) return invalido(res, 'Elegí las dos personas a unificar.');
    if (!personasDuplicadas(db).some(d => d.conservar === conservar && d.duplicada === duplicada)) {
      return invalido(res, 'Esas personas no se pueden unificar.');
    }
    await programador.exclusivo(async () => unificarPersonas(db, conservar, duplicada));
    programador.avisar();
    res.json({ ok: true });
  }));

  router.post('/sincronizar', async (_req, res) => {
    const r = await programador.ahora();
    if (r.estado === 'ok') {
      return res.json({ ok: true, resultado: r.resultado, ultimaSincronizacion: leer(db, 'ultima_sync'), error: null });
    }
    if (r.estado === 'omitida') return fallar(res, new ErrorCuenta(r.motivo));
    // Un fallo de la vuelta ya viene traducido: sin conexión, sesión vencida, etc.
    res.status(r.status).json({ error: r.mensaje, codigo: r.codigo });
  });

  router.post('/salir', ruta(async (_req, res) => {
    await cliente.cerrarSesion();
    ultimaCuenta = null;
    res.json({ ok: true });
  }));

  // Borra la cuenta y los datos de la nube; los datos de este equipo quedan y la sincronización vuelve a empezar de cero.
  router.delete('/', ruta(async (_req, res) => {
    await leerCuenta();
    await programador.exclusivo(async () => {
      await cliente.borrarCuenta();
      enTransaccion(db, () => {
        db.exec('DELETE FROM sync_borrados; DELETE FROM sync_muertas; DELETE FROM sync_alias');
        reiniciarBajada(db);
        db.exec("DELETE FROM sync_estado WHERE clave IN ('ultimo_envio', 'ultima_sync', 'resubir', 'cuenta')");
      });
    });
    ultimaCuenta = null;
    res.json({ ok: true });
  }));

  return { router, programador };
}
