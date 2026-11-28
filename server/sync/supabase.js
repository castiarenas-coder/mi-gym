import crypto from 'node:crypto';

// Cliente de Supabase sin dependencias: Auth (GoTrue), PostgREST y Edge Functions por `fetch`.
// Solo usa la clave pública (anon) más el token del usuario; la clave de servicio nunca está en la app.
//
// Errores: siempre `ErrorSupabase` con `.codigo`:
//   sin_red            fetch falló (offline, DNS, corte): la sincronización reintenta más tarde
//   sin_sesion         no hay sesión guardada
//   sesion_vencida     el token de renovación ya no sirve (hay que volver a iniciar sesión); la sesión se borra
//   plan_requerido     la nube rechazó por RLS/permisos (403): hace falta el plan Pro
//   codigo_invalido    código de mail incorrecto o vencido (verificar / canje de Google)
//   demasiados_intentos  429
//   servidor           5xx
//   respuesta          cualquier otro estado inesperado
// `.estado` trae el HTTP cuando hubo respuesta. Cada fetch tiene timeout (30 s por defecto): un corte o
// timeout también es `sin_red`.
//
// Contrato con la nube (Task 8):
//  - `documentos.servidor_en` debe ser un bigint ÚNICO y estrictamente creciente, tomado de una secuencia
//    (`nextval`) en cada insert/update aceptado. No usar now(): las filas de una misma transacción
//    compartirían valor y la paginación `servidor_en > cursor` se saltaría filas en el borde de página.
//  - El cursor es opaco para el motor: acá viaja siempre como texto (sin pasar por Number).
//  - `subir_documentos(docs jsonb)`: gana el `actualizado` más nuevo; con igual marca gana el borrado y
//    un vivo nunca pisa un borrado igual.
//
// Borde conocido de la rotación del token de renovación: si la respuesta de una renovación se pierde
// (corte justo ahí), el token guardado ya no sirve y la nube lo rechaza: se pide iniciar sesión de nuevo.

const PAGINA = 1000;
const MARGEN_VENCIMIENTO_MS = 30_000;
const COLUMNAS = 'tipo,clave,datos,actualizado,borrado,servidor_en';

export class ErrorSupabase extends Error {
  constructor(codigo, mensaje, { estado = null, cause } = {}) {
    super(mensaje, cause ? { cause } : undefined);
    this.name = 'ErrorSupabase';
    this.codigo = codigo;
    this.estado = estado;
  }
}

const base64url = (b) => Buffer.from(b).toString('base64url');

async function cuerpoDe(r) {
  try { return await r.json(); } catch { return null; }
}

function errorDeEstado(estado, cuerpo, porDefecto) {
  const detalle = cuerpo?.message ?? cuerpo?.msg ?? cuerpo?.error_description ?? cuerpo?.error ?? `HTTP ${estado}`;
  if (estado === 429) return new ErrorSupabase('demasiados_intentos', `Demasiados intentos: ${detalle}`, { estado });
  if (estado >= 500) return new ErrorSupabase('servidor', `Error del servidor de la nube: ${detalle}`, { estado });
  if (estado === 403 || cuerpo?.code === '42501') return new ErrorSupabase(porDefecto === 'codigo_invalido' ? 'codigo_invalido' : 'plan_requerido', String(detalle), { estado });
  return new ErrorSupabase(porDefecto ?? 'respuesta', String(detalle), { estado });
}

export function crearClienteSupabase({ url, anonKey, fetchFn = fetch, guardarSesion, leerSesion, timeoutMs = 30_000, pagina = PAGINA }) {
  const raiz = String(url).replace(/\/+$/, '');
  let renovando = null;

  async function pedir(ruta, { metodo = 'POST', cuerpo, token, headers = {} } = {}) {
    const h = { apikey: anonKey, 'Content-Type': 'application/json', ...headers };
    if (token) h.Authorization = `Bearer ${token}`;
    const control = new AbortController();
    const reloj = setTimeout(() => control.abort(new Error(`Sin respuesta de la nube en ${timeoutMs} ms`)), timeoutMs);
    try {
      return await fetchFn(`${raiz}${ruta}`, { method: metodo, headers: h, body: cuerpo === undefined ? undefined : JSON.stringify(cuerpo), signal: control.signal });
    } catch (e) {
      throw new ErrorSupabase('sin_red', `Sin conexión con la nube: ${e?.message ?? e}`, { cause: e });
    } finally {
      clearTimeout(reloj);
    }
  }

  const sesionDe = (r, previa) => ({
    access_token: r.access_token,
    refresh_token: r.refresh_token ?? previa?.refresh_token,
    id: r.user?.id ?? previa?.id ?? null,
    email: r.user?.email ?? previa?.email ?? null,
    expira_en: Date.now() + (Number(r.expires_in) || 3600) * 1000,
  });

  async function recibirSesion(r, porDefecto) {
    const cuerpo = await cuerpoDe(r);
    if (!r.ok || !cuerpo?.access_token) throw errorDeEstado(r.status, cuerpo, porDefecto);
    const s = sesionDe(cuerpo);
    await guardarSesion(s);
    return s;
  }

  /** Renueva con el token de renovación; varias llamadas simultáneas comparten una sola renovación. */
  function renovar() {
    renovando ??= (async () => {
      const previa = await leerSesion();
      if (!previa?.refresh_token) throw new ErrorSupabase('sin_sesion', 'No hay sesión iniciada');
      const r = await pedir('/auth/v1/token?grant_type=refresh_token', { cuerpo: { refresh_token: previa.refresh_token } });
      const cuerpo = await cuerpoDe(r);
      if (!r.ok || !cuerpo?.access_token) {
        // Solo si la nube rechaza el token de renovación se pierde la sesión; cualquier otra falla se reintenta luego.
        if (![400, 401, 403, 422].includes(r.status)) throw errorDeEstado(r.status, cuerpo, 'respuesta');
        await guardarSesion(null);
        throw new ErrorSupabase('sesion_vencida', 'La sesión venció: hay que iniciar sesión de nuevo', { estado: r.status });
      }
      const s = sesionDe(cuerpo, previa);
      await guardarSesion(s);
      return s;
    })().finally(() => { renovando = null; });
    return renovando;
  }

  /** Llamada autenticada: renueva antes si el token venció y ante un 401 renueva y reintenta una sola vez. */
  async function autenticada(ruta, opciones) {
    let s = await leerSesion();
    if (!s?.access_token) throw new ErrorSupabase('sin_sesion', 'No hay sesión iniciada');
    if (s.expira_en && s.expira_en - MARGEN_VENCIMIENTO_MS <= Date.now()) s = await renovar();
    let r = await pedir(ruta, { ...opciones, token: s.access_token });
    if (r.status === 401) {
      // Otra llamada pudo haber renovado ya: si el token guardado cambió se usa ese sin renovar de nuevo.
      const actual = await leerSesion();
      if (!actual?.access_token) throw new ErrorSupabase('sin_sesion', 'No hay sesión iniciada');
      s = actual.access_token !== s.access_token ? actual : await renovar();
      r = await pedir(ruta, { ...opciones, token: s.access_token });
      if (r.status === 401) throw new ErrorSupabase('respuesta', 'La nube no aceptó el token recién renovado', { estado: 401 });
    }
    return r;
  }

  async function exigir(r) {
    if (r.ok) return cuerpoDe(r);
    throw errorDeEstado(r.status, await cuerpoDe(r));
  }

  const cliente = {
    async enviarCodigo(email) {
      const r = await pedir('/auth/v1/otp', { cuerpo: { email, create_user: true } });
      if (!r.ok) throw errorDeEstado(r.status, await cuerpoDe(r));
    },

    async verificarCodigo(email, codigo) {
      const r = await pedir('/auth/v1/verify', { cuerpo: { type: 'email', email, token: String(codigo) } });
      return recibirSesion(r, 'codigo_invalido');
    },

    /**
     * URL a la que mandar al navegador. `verificadorPkce` es un secreto aleatorio que se guarda hasta la vuelta:
     * de 43 a 128 caracteres (p. ej. `crypto.randomBytes(32).toString('base64url')`).
     */
    urlGoogle(redirectTo, verificadorPkce) {
      const desafio = base64url(crypto.createHash('sha256').update(verificadorPkce).digest());
      const q = new URLSearchParams({ provider: 'google', redirect_to: redirectTo, code_challenge: desafio, code_challenge_method: 's256' });
      return `${raiz}/auth/v1/authorize?${q}`;
    },

    async canjearCodigoGoogle(codigo, verificadorPkce) {
      const r = await pedir('/auth/v1/token?grant_type=pkce', { cuerpo: { auth_code: codigo, code_verifier: verificadorPkce } });
      return recibirSesion(r, 'codigo_invalido');
    },

    /** Cierra la sesión local siempre, aunque la nube no responda. */
    async cerrarSesion() {
      const s = await leerSesion();
      try {
        if (s?.access_token) await pedir('/auth/v1/logout?scope=local', { token: s.access_token });
      } catch { /* sin red: igual se olvida la sesión local */ }
      await guardarSesion(null);
    },

    async cuenta() {
      const s = await leerSesion();
      if (!s?.access_token) throw new ErrorSupabase('sin_sesion', 'No hay sesión iniciada');
      const r = await autenticada(`/rest/v1/cuentas?select=${encodeURIComponent('plan,consentimiento_en')}`, { metodo: 'GET' });
      const filas = await exigir(r);
      const fila = Array.isArray(filas) ? filas[0] : null;
      const actual = await leerSesion();
      return { id: actual?.id ?? s.id ?? null, email: actual?.email ?? s.email ?? null, plan: fila?.plan ?? 'gratis', consentimiento_en: fila?.consentimiento_en ?? null };
    },

    async aceptarConsentimiento() {
      await exigir(await autenticada('/rest/v1/rpc/aceptar_consentimiento', { cuerpo: {} }));
    },

    /** Borra la cuenta y los datos de la nube (Edge Function `borrar-cuenta`) y cierra la sesión local. */
    async borrarCuenta() {
      await exigir(await autenticada('/functions/v1/borrar-cuenta', { cuerpo: {} }));
      await guardarSesion(null);
    },

    /** Remoto con la misma interfaz que `crearRemotoEnMemoria`: `subir(docs)` y `bajar(cursor)`. */
    remoto() {
      return {
        async subir(docs) {
          if (!docs.length) return;
          await exigir(await autenticada('/rest/v1/rpc/subir_documentos', { cuerpo: { docs } }));
        },
        async bajar(cursor) {
          const q = new URLSearchParams({ select: COLUMNAS, order: 'servidor_en.asc', limit: String(pagina) });
          if (cursor != null) q.set('servidor_en', `gt.${cursor}`);
          const filas = await exigir(await autenticada(`/rest/v1/documentos?${q}`, { metodo: 'GET' }));
          const lista = Array.isArray(filas) ? filas : [];
          const docs = lista.map(({ servidor_en: _omitido, ...doc }) => doc);
          return { docs, cursor: lista.length ? String(lista.at(-1).servidor_en) : (cursor ?? null) };
        },
      };
    },
  };
  return cliente;
}
