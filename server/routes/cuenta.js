// API local de la cuenta en la nube: iniciar sesión, consentimiento, vincular este equipo y sincronizar.
//
// Mismas protecciones que el resto de /api (X-Mi-Gym en los cambios, Host de la propia máquina). Ninguna respuesta ni
// registro lleva tokens: los errores se traducen con `traducir` y los desconocidos salen como un mensaje genérico.
//
// La cuenta se identifica por el id de usuario de Supabase (`sync_estado.cuenta`), no por el mail: el mail puede
// cambiar y una cuenta recreada con el mismo mail es otra cuenta.
//
// Google (PKCE): en Supabase, Authentication > URL Configuration > Redirect URLs tiene que permitir
//   http://127.0.0.1:*/api/cuenta/google/vuelta   y   http://localhost:*/api/cuenta/google/vuelta
// No se ofrece en Android ni con clave de acceso (MI_GYM_TOKEN): el navegador externo no trae la cookie.

import { Router } from 'express';
import { randomBytes } from 'node:crypto';
import { crearClienteSupabase, ErrorSupabase } from '../sync/supabase.js';
import { sesionEnDb } from '../sync/secreto.js';
import { sincronizar, leer, guardar, reiniciarBajada, enTransaccion } from '../sync/motor.js';
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
export function crearCuenta({ db, supabase, fetchFn = fetch, cliente = null, rutaClave, backupsDir = null, ahora = () => new Date(), timers, intervaloMs, google = true }) {
  cliente ??= crearClienteSupabase({ url: supabase.url, anonKey: supabase.anonKey, fetchFn, ...sesionEnDb(db, rutaClave) });
  let ultimaCuenta = null; // lo último que dijo la nube: se muestra si se cae la conexión
  let verificador = null;

  const sesionLocal = rutaClave ? sesionEnDb(db, rutaClave).leerSesion : async () => null;
  const emailDe = c => (typeof c?.email === 'string' && c.email ? c.email.trim().toLowerCase() : null);

  /** Id de la cuenta. Un vínculo viejo guardado con el mail de esta misma cuenta se pasa al id (una sola vez). */
  function idDe(c) {
    const id = typeof c?.id === 'string' && c.id ? c.id : null;
    const guardada = leer(db, 'cuenta');
    if (id && guardada?.includes('@') && guardada === emailDe(c)) guardar(db, 'cuenta', id);
    return id;
  }
  const vinculadaA = c => { const id = idDe(c); return id !== null && leer(db, 'cuenta') === id; };

  async function leerCuenta() {
    const c = await cliente.cuenta();
    ultimaCuenta = c;
    return c;
  }

  /** Sesión iniciada, plan Pro y, según se pida, consentimiento y vínculo ya hecho. Devuelve la cuenta. */
  async function exigirListo({ consentimiento = true, vinculo = true } = {}) {
    const c = await leerCuenta();
    if (!idDe(c)) throw new ErrorCuenta('sin_sesion');
    if (c.plan !== 'pro') throw new ErrorCuenta('plan_requerido');
    if (consentimiento && !c.consentimiento_en) throw new ErrorCuenta('sin_consentimiento');
    if (vinculo && !vinculadaA(c)) throw new ErrorCuenta('sin_vinculo');
    return c;
  }

  /** Olvida lo enviado y lo bajado (los datos locales y las lápidas quedan): la próxima vuelta vuelve a subir todo. */
  const olvidarEnvios = () => { reiniciarBajada(db); db.exec("DELETE FROM sync_estado WHERE clave IN ('ultimo_envio', 'resubir')"); };

  /**
   * La nube sube su `generacion` al purgar los documentos de la cuenta. Si cambió respecto de la guardada, este equipo
   * deja de creer que ya subió todo. Sin generación guardada solo se anota. Debe llamarse con el equipo vinculado a esta cuenta.
   */
  function reconciliarGeneracion(c) {
    const actual = String(c.generacion ?? 1);
    const guardada = leer(db, 'generacion');
    if (guardada === actual) return;
    enTransaccion(db, () => { if (guardada !== null) olvidarEnvios(); guardar(db, 'generacion', actual); });
  }

  const programador = crearProgramador({
    ahora, timers, intervaloMs,
    sincronizar: async () => {
      reconciliarGeneracion(await exigirListo());
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
    const base = { habilitada: true, google, sesion: null, vinculado: false, ultimaSincronizacion: leer(db, 'ultima_sync'), error: programador.estado().error };
    try {
      const c = await leerCuenta();
      return res.json({ ...base, sesion: { email: c.email, plan: c.plan, consentimiento: Boolean(c.consentimiento_en) }, vinculado: vinculadaA(c) });
    } catch (e) {
      if (e instanceof ErrorSupabase && e.codigo === 'sin_sesion') { ultimaCuenta = null; return res.json(base); }
      if (e instanceof ErrorSupabase && e.codigo === 'sesion_vencida') { ultimaCuenta = null; return res.json({ ...base, error: traducir(e).mensaje }); }
      if (e instanceof ErrorSupabase) {
        // Sin conexión (o la nube caída): se muestra lo último conocido o, tras reiniciar la app, lo de la sesión guardada.
        const c = ultimaCuenta ?? await sesionLocal();
        if (c?.email) {
          const conocido = ultimaCuenta !== null;
          return res.json({
            ...base, error: traducir(e).mensaje,
            sesion: { email: c.email, plan: conocido ? c.plan : null, consentimiento: conocido ? Boolean(c.consentimiento_en) : null },
            vinculado: vinculadaA(c),
          });
        }
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
    if (!google) return res.status(404).json({ error: 'El ingreso con Google no está disponible acá. Usá el código por mail.', codigo: 'no_disponible' });
    verificador = { valor: randomBytes(32).toString('base64url'), creado: ahora().getTime() };
    res.redirect(302, cliente.urlGoogle(`http://${req.headers.host}/api/cuenta/google/vuelta`, verificador.valor));
  }));

  router.get('/google/vuelta', async (req, res) => {
    const pendiente = verificador;
    const html = (status, titulo, mensaje) => res.status(status).type('html').send(pagina(titulo, mensaje));
    if (!pendiente || ahora().getTime() - pendiente.creado > MAX_VERIFICADOR_MS) {
      return html(400, 'No se pudo iniciar sesión', 'El intento venció. Volvé a Rumbo Fit y probá de nuevo.');
    }
    // El verificador se conserva hasta un canje exitoso (o 10 minutos): un pedido ajeno o sin código no lo gasta.
    const codigo = typeof req.query.code === 'string' ? req.query.code : '';
    if (!codigo) return html(400, 'No se pudo iniciar sesión', 'Google no completó el ingreso. Volvé a Rumbo Fit y probá de nuevo.');
    try {
      await cliente.canjearCodigoGoogle(codigo, pendiente.valor);
      verificador = null;
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
    res.json({ estado, vinculado: vinculadaA(c), duplicadas: personasDuplicadas(db) });
  }));

  router.post('/vincular', ruta(async (req, res) => {
    const modo = req.body?.modo;
    if (!MODOS.includes(modo)) return invalido(res, 'Elegí una opción válida.');
    const c = await exigirListo({ vinculo: false });
    const id = idDe(c);
    await programador.exclusivo(async () => {
      // Red de seguridad: la nube está vacía pero este equipo cree que ya subió todo (purga, borrado desde otro lado,
      // respuesta perdida al borrar la cuenta): se olvida lo enviado y lo bajado para volver a subir todo.
      if ((await estadoVinculo(db, cliente.remoto())) === 'cuenta_vacia' && leer(db, 'cuenta') === id
        && (leer(db, 'cursor') !== null || leer(db, 'ultimo_envio') !== null)) {
        enTransaccion(db, olvidarEnvios);
      }
      if (leer(db, 'cuenta') === id) reconciliarGeneracion(c);
      await vincular(db, cliente.remoto(), modo, { cuenta: id, forzar: req.body?.forzar === true, backupsDir });
      guardar(db, 'generacion', String(c.generacion ?? 1));
    });
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
    programador.reiniciar();
    res.json({ ok: true });
  }));

  // Borra la cuenta y los datos de la nube; los datos de este equipo quedan y la sincronización vuelve a empezar de cero.
  // Si la respuesta de la nube se pierde (sin red / tiempo agotado) la cuenta puede haberse borrado igual: el reinicio
  // local solo toca tablas de sincronización, así que se hace de todos modos y se informa el error.
  router.delete('/', ruta(async (_req, res) => {
    await leerCuenta();
    await programador.exclusivo(async () => {
      const reiniciarLocal = () => enTransaccion(db, () => {
        db.exec('DELETE FROM sync_borrados; DELETE FROM sync_muertas; DELETE FROM sync_alias');
        reiniciarBajada(db);
        db.exec("DELETE FROM sync_estado WHERE clave IN ('ultimo_envio', 'ultima_sync', 'resubir', 'cuenta')");
      });
      try {
        await cliente.borrarCuenta();
      } catch (e) {
        if (e instanceof ErrorSupabase && e.codigo === 'sin_red') reiniciarLocal();
        throw e;
      }
      reiniciarLocal();
    });
    ultimaCuenta = null;
    programador.reiniciar();
    res.json({ ok: true });
  }));

  return { router, programador };
}
