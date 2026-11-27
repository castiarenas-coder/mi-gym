# Cuentas y sincronización — plan de implementación

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Cuenta opcional por familia (mail con código o Google) y sincronización de documentos entre equipos vía Supabase, sin romper el uso local y sin perder datos.

**Architecture:** El servidor local (Node + `node:sqlite`) suma identificadores únicos, registro de cambios y borrados, un serializador de "documentos" y un motor de sincronización que habla con un `remoto` abstracto. La implementación real del remoto usa la API REST y Auth de Supabase con `fetch`. La UI agrega Ajustes → Cuenta. El esquema de Postgres, la seguridad por filas y la función de borrado viven en un repo privado nuevo.

**Tech Stack:** Node 22, Express 5, `node:sqlite`, `node:test`; React + Vite + TS, Vitest; Supabase (Auth, PostgREST, Edge Functions, SQL).

**Spec:** `docs/superpowers/specs/2026-11-27-cuentas-y-sincronizacion-design.md`

## Global Constraints

- La cuenta es opcional: sin cuenta la app funciona igual que hoy y ninguna pantalla obliga a crearla.
- Sin internet todo sigue funcionando; la sincronización reintenta sola.
- Documentos: persona, rutina (con días y ejercicios), sesión **finalizada** (con ejercicios y series), medida (persona + fecha), perfil (persona), favorito (persona + ejercicio). Fotos/videos propios, catálogo y ajustes del equipo NO se sincronizan.
- Gana el `actualizado` más nuevo por documento; un borrado es un cambio más.
- Sincroniza al abrir, cada 5 minutos con conexión, al terminar un entrenamiento y con "Sincronizar ahora".
- Solo se sincroniza con `plan = 'pro'` y consentimiento de datos de salud aceptado (Ley 25.326).
- La app solo contiene la clave pública de Supabase; la clave de servicio vive solo en el repo privado `rumbo-fit-nube`.
- No cambiar nombres de datos existentes (`%APPDATA%\Mi Gym`, `mi_gym.db`, `X-Mi-Gym`, claves de localStorage, marcador de respaldo `app: 'mi-gym'`).
- Español rioplatense en la interfaz. Strict TDD. Preservar finales de línea de cada archivo. Commits convencionales sin firma de IA.

## Review Focus

- Dos equipos editan la misma rutina sin conexión y después sincronizan: queda la más nueva en los dos, sin duplicados. → test en Task 3.
- Se borra una sesión en el equipo A mientras B sigue sin conexión: al sincronizar, desaparece de B y no vuelve a A. → test en Task 3.
- Un documento llega antes que su persona, o nombra un ejercicio que no existe en el catálogo local: no rompe la sincronización. → tests en Task 3.
- El token de Supabase venció o la red se corta a mitad de una subida: no se marca nada como enviado y se reintenta. → test en Task 5.
- Un equipo con datos se conecta a una cuenta con datos y elige "juntar": no se pierde ningún entrenamiento. → test en Task 4.

---

### Task 1: Migración 6 — identidades, marcas de cambio y borrados

**Files:**
- Modify: `server/db.js` (nueva migración `version: 6` en `MIGRACIONES`)
- Test: `test/migracion6.test.js`

**Interfaces:**
- Produces: columnas `uid TEXT UNIQUE` y `actualizado TEXT` en `personas`, `rutinas`, `sesiones`; columna `actualizado TEXT` en `medidas`, `perfil`, `favoritos`; tablas `sync_borrados(tipo TEXT, clave TEXT, fecha TEXT, PRIMARY KEY(tipo, clave))` y `sync_estado(clave TEXT PRIMARY KEY, valor TEXT)`.

- [ ] **Step 1: Tests que fallan** en `test/migracion6.test.js` (seguí el estilo de `test/migracion5.test.js`):
  - una base en versión 5 con 2 personas, 1 rutina con 2 días, 1 sesión finalizada con series, medidas y favoritos migra a 6 sin perder filas;
  - toda persona, rutina y sesión tiene `uid` con formato UUID v4 y distinto entre sí, y `actualizado` no nulo;
  - insertar una serie en una sesión cambia el `actualizado` de esa sesión; insertar o borrar un `rutina_dias`/`rutina_ejercicios` cambia el `actualizado` de la rutina;
  - borrar una rutina deja una fila en `sync_borrados` con `tipo='rutina'` y `clave` = su `uid`; borrar una persona deja filas para la persona y para cada rutina y sesión que se borran por cascada;
  - borrar una medida deja `tipo='medida'`, `clave` = `<uid persona>|<fecha>`; borrar un favorito, `tipo='favorito'`, `clave` = `<uid persona>|<ejercicio_id>`.
- [ ] **Step 2:** `npm test` en la raíz → FAIL.
- [ ] **Step 3:** Implementar la migración: columnas, `UPDATE` con UUID generados en JS antes del `exec` (SQLite no genera v4) o con `lower(hex(randomblob(16)))` formateado como v4; disparadores `AFTER INSERT/UPDATE/DELETE` que tocan el `actualizado` del documento padre; disparadores `AFTER DELETE` que llenan `sync_borrados`; disparadores `AFTER INSERT` que asignan `uid` cuando viene nulo (las rutas actuales no lo mandan).
- [ ] **Step 4:** `npm test` en la raíz → PASS (los 163 existentes siguen pasando).
- [ ] **Step 5:** Commit `feat: identidades unicas y registro de cambios para sincronizar`.

### Task 2: Documentos — leer, listar cambios y aplicar

**Files:**
- Create: `server/sync/documentos.js`
- Test: `test/sync-documentos.test.js`

**Interfaces:**
- Consumes: esquema de Task 1.
- Produces:
  - `type Documento = { tipo: 'persona'|'rutina'|'sesion'|'medida'|'perfil'|'favorito', clave: string, actualizado: string, borrado: boolean, datos: object|null }`
  - `cambiosLocales(db, desde: string|null): Documento[]` — documentos con `actualizado > desde` más borrados de `sync_borrados` con `fecha > desde`; excluye sesiones `en_curso`.
  - `aplicarDocumento(db, doc: Documento): 'aplicado'|'ignorado'|'en_espera'` — aplica solo si `doc.actualizado` es más nuevo que el local; reemplaza el documento entero (rutina con días y ejercicios, sesión con ejercicios y series); traduce `uid` de persona a id local; devuelve `'en_espera'` si la persona todavía no existe; omite ejercicios que no están en el catálogo. Aplicar no debe generar un cambio local nuevo para subir (marcar con el mismo `actualizado` recibido).
- [ ] **Step 1: Tests que fallan:** ida y vuelta de cada tipo (`cambiosLocales` en una base, `aplicarDocumento` en otra vacía con la misma persona → mismos datos); un documento más viejo que el local devuelve `'ignorado'` y no cambia nada; un borrado elimina el documento local; una rutina remota con 3 días reemplaza a la local de 2; sesión cuya persona no existe → `'en_espera'`; sesión con un `ejercicio_id` desconocido se aplica sin ese ejercicio; aplicar no aparece después en `cambiosLocales(db, antes)`.
- [ ] **Step 2:** Correr → FAIL.
- [ ] **Step 3:** Implementar.
- [ ] **Step 4:** Correr → PASS.
- [ ] **Step 5:** Commit `feat: documentos de sincronizacion`.

### Task 3: Motor de sincronización con remoto abstracto

**Files:**
- Create: `server/sync/motor.js`, `test/helpers-remoto.js` (remoto en memoria)
- Test: `test/sync-motor.test.js`

**Interfaces:**
- Consumes: `cambiosLocales`, `aplicarDocumento` (Task 2).
- Produces:
  - `interface Remoto { subir(docs: Documento[]): Promise<void>; bajar(cursor: string|null): Promise<{ docs: Documento[], cursor: string }> }` (el remoto resuelve el choque guardando solo el más nuevo, igual que la nube).
  - `sincronizar(db, remoto: Remoto, { ahora }): Promise<{ subidos: number, bajados: number, enEspera: number }>` — lee/guarda `ultimo_envio` y `cursor` en `sync_estado`; primero sube, después baja; reintenta en la misma vuelta los `'en_espera'` después de aplicar personas; solo guarda `ultimo_envio` si `subir` no falló.
  - `crearRemotoEnMemoria(): Remoto` en `test/helpers-remoto.js`.
- [ ] **Step 1: Tests que fallan** con dos bases A y B y un remoto en memoria:
  - A crea persona, rutina y sesión → sincroniza A, después B → B tiene todo;
  - A y B editan la misma rutina offline (B más tarde) → tras sincronizar ambos dos veces, los dos tienen la versión de B;
  - A borra una sesión; B sincroniza → la sesión desaparece de B y no reaparece en A;
  - el remoto devuelve una sesión antes que su persona en el mismo lote → queda aplicada al terminar la vuelta;
  - `subir` lanza error → `ultimo_envio` no cambia y la siguiente vuelta vuelve a subir lo mismo;
  - una sesión `en_curso` no se sube; al finalizarla, sí.
- [ ] **Step 2:** Correr → FAIL.
- [ ] **Step 3:** Implementar.
- [ ] **Step 4:** Correr → PASS.
- [ ] **Step 5:** Commit `feat: motor de sincronizacion`.

### Task 4: Primer vínculo de un equipo — juntar o reemplazar

**Files:**
- Create: `server/sync/vincular.js`
- Test: `test/sync-vincular.test.js`

**Interfaces:**
- Consumes: `sincronizar`, `Remoto`.
- Produces:
  - `estadoVinculo(db, remoto): Promise<'cuenta_vacia'|'equipo_vacio'|'ambos_con_datos'>`
  - `vincular(db, remoto, modo: 'subir'|'bajar'|'juntar'|'reemplazar'): Promise<void>` — `reemplazar` borra los documentos locales sin registrar borrados y baja todo; `juntar` sube y baja todo.
  - `personasDuplicadas(db): { conservar: number, duplicada: number, nombre: string }[]` y `unificarPersonas(db, conservar: number, duplicada: number): void` — mueve rutinas, sesiones, medidas, perfil (si el conservado no tiene) y favoritos, y borra la duplicada.
- [ ] **Step 1: Tests que fallan:** los tres estados; `juntar` con 3 sesiones locales y 2 remotas deja 5 en los dos lados; `reemplazar` deja solo lo remoto y no sube borrados; dos personas "Yo" → `personasDuplicadas` las reporta y `unificarPersonas` deja una con todas las sesiones de ambas.
- [ ] **Step 2:** Correr → FAIL.
- [ ] **Step 3:** Implementar.
- [ ] **Step 4:** Correr → PASS.
- [ ] **Step 5:** Commit `feat: vincular un equipo a la cuenta`.

### Task 5: Remoto real de Supabase y sesión segura

**Files:**
- Create: `server/sync/supabase.js`, `server/sync/secreto.js`
- Modify: `server/config.js` (leer `MI_GYM_SUPABASE_URL` y `MI_GYM_SUPABASE_ANON_KEY`; sin ellos la cuenta queda deshabilitada)
- Test: `test/sync-supabase.test.js`

**Interfaces:**
- Produces:
  - `crearClienteSupabase({ url, anonKey, fetchFn = fetch, guardarSesion, leerSesion })` con: `enviarCodigo(email)`, `verificarCodigo(email, codigo)`, `urlGoogle(redirectTo, verificadorPkce)`, `canjearCodigoGoogle(codigo, verificadorPkce)`, `cerrarSesion()`, `cuenta(): Promise<{ email, plan, consentimiento_en }>`, `aceptarConsentimiento()`, `borrarCuenta()` (llama a la Edge Function `borrar-cuenta`), y `remoto(): Remoto` sobre la tabla `documentos` (upsert con `on_conflict=cuenta_id,tipo,clave` sólo si el entrante es más nuevo, vía función RPC `subir_documentos`; bajada por `servidor_en > cursor` ordenada).
  - Renueva el token de acceso con el de renovación cuando vence (401) y reintenta una vez.
  - `cifrar(texto, clave)`, `descifrar(texto, clave)` en `secreto.js` (AES-256-GCM, clave por equipo guardada en `sync_estado` al crearse).
- [ ] **Step 1: Tests que fallan** con `fetchFn` simulado: los endpoints y cuerpos exactos de Auth (OTP por mail, verificación, PKCE), el upsert vía RPC y la bajada con cursor; un 401 dispara renovación y reintento; una caída de red en `subir` propaga el error (el motor no marca enviado); el token se guarda cifrado y `descifrar(cifrar(x)) === x`.
- [ ] **Step 2:** Correr → FAIL.
- [ ] **Step 3:** Implementar (sin dependencias nuevas: `fetch` y `node:crypto`).
- [ ] **Step 4:** Correr → PASS.
- [ ] **Step 5:** Commit `feat: cliente de Supabase para cuentas y sincronizacion`.

### Task 6: API local de cuenta y sincronización automática

**Files:**
- Create: `server/routes/cuenta.js`, `server/sync/programador.js`
- Modify: `server/app.js` (montar `/api/cuenta`, arrancar el programador), `server/routes/sesiones.js` (avisar al programador al finalizar)
- Test: `test/cuenta-api.test.js`, `test/sync-programador.test.js`

**Interfaces:**
- Consumes: Tasks 3, 4 y 5.
- Produces rutas (mutaciones con `X-Mi-Gym: 1` como el resto):
  - `GET /api/cuenta` → `{ habilitada, sesion: null|{ email, plan, consentimiento: boolean }, ultimaSincronizacion, error }`
  - `POST /api/cuenta/codigo {email}`, `POST /api/cuenta/verificar {email, codigo}`
  - `GET /api/cuenta/google` → redirige a Google; `GET /api/cuenta/google/vuelta` canjea y muestra "Listo, ya podés volver a Rumbo Fit".
  - `POST /api/cuenta/consentimiento`, `GET /api/cuenta/vinculo` → estado de Task 4, `POST /api/cuenta/vincular {modo}`, `POST /api/cuenta/unificar {conservar, duplicada}`
  - `POST /api/cuenta/sincronizar`, `POST /api/cuenta/salir`, `DELETE /api/cuenta`
  - `crearProgramador({ sincronizar, intervaloMs = 300000, ahora })` con `iniciar()`, `detener()`, `avisar()`; no corre si no hay sesión, plan pro y consentimiento.
- [ ] **Step 1: Tests que fallan:** sin variables de Supabase `GET /api/cuenta` da `habilitada:false` y el resto responde 404; flujo código → verificar guarda la sesión; sin consentimiento `sincronizar` responde 409; con plan gratis responde 402; el programador llama a `sincronizar` al iniciar, a los 5 minutos (reloj falso) y al `avisar()` después de finalizar una sesión; nunca corre dos vueltas a la vez.
- [ ] **Step 2:** Correr → FAIL.
- [ ] **Step 3:** Implementar.
- [ ] **Step 4:** `npm test` en la raíz → PASS.
- [ ] **Step 5:** Commit `feat: api de cuenta y sincronizacion automatica`.

### Task 7: Ajustes → Cuenta en la interfaz

**Files:**
- Create: `client/src/api/cuenta.ts`, `client/src/pages/ajustes/SeccionCuenta.tsx`
- Modify: `client/src/pages/Ajustes.tsx` (sección "Cuenta" después de "Apariencia")
- Test: `client/src/pages/ajustes/SeccionCuenta.test.tsx`

**Interfaces:**
- Consumes: rutas de Task 6.
- [ ] **Step 1: Tests que fallan:** con `habilitada:false` la sección no aparece; sin sesión muestra "Iniciar sesión" con campo de mail y botón "Continuar con Google"; tras "Enviar código" pide los 6 dígitos; con sesión y plan gratis muestra "Sincronización disponible con el plan Pro"; con plan pro y sin consentimiento muestra el texto de consentimiento y "Aceptar"; con todo listo muestra "Última sincronización: hace X" y "Sincronizar ahora"; si `vinculo === 'ambos_con_datos'` pregunta "¿Juntar los datos de este equipo con los de tu cuenta?" con "Juntar" y "Reemplazar"; "Borrar cuenta" pide confirmación con el texto "Se borran tus datos de la nube. Los de este equipo quedan.".
- [ ] **Step 2:** Correr → FAIL.
- [ ] **Step 3:** Implementar con los componentes y tokens del rediseño.
- [ ] **Step 4:** `npm test` en `client/` y `npx tsc --noEmit` → PASS.
- [ ] **Step 5:** Commit `feat: seccion cuenta en ajustes`.

### Task 8: Repo privado `rumbo-fit-nube` (esquema, seguridad y borrado)

**Files (repo nuevo, local en `D:\apps\rumbo-fit-nube`, sin subir hasta que el usuario cree el repo privado):**
- Create: `supabase/migrations/0001_cuentas_documentos.sql`, `supabase/functions/borrar-cuenta/index.ts`, `README.md`, `test/rls.sql`

- [ ] **Step 1:** `0001`: tablas `cuentas(id uuid PK = auth.uid, plan text check in ('gratis','pro') default 'gratis', consentimiento_en timestamptz, creada timestamptz default now())` y `documentos(cuenta_id uuid, tipo text, clave text, datos jsonb, actualizado timestamptz, borrado boolean, servidor_en timestamptz default now(), PK(cuenta_id,tipo,clave))`; índice por `(cuenta_id, servidor_en)`; disparador que crea `cuentas` al registrarse un usuario; RLS: el usuario lee y escribe solo su fila de `cuentas` (sin poder cambiar `plan`) y solo sus `documentos` si su plan es `pro`; función `subir_documentos(docs jsonb)` que hace upsert solo si `actualizado` entrante es mayor y actualiza `servidor_en`; función `aceptar_consentimiento()`; columna `plan_cambiado_en timestamptz` en `cuentas` y una tarea programada diaria (pg_cron) que borra los documentos de cuentas con `plan = 'gratis'` y `plan_cambiado_en` de hace más de 90 días.
- [ ] **Step 2:** `test/rls.sql`: con dos usuarios de prueba, uno no ve los documentos del otro; con plan gratis no puede insertar; un upsert más viejo no pisa uno más nuevo.
- [ ] **Step 3:** Edge Function `borrar-cuenta`: con la clave de servicio borra documentos, cuenta y usuario del que llama.
- [ ] **Step 4:** `README.md`: cómo aplicar las migraciones, cómo pasar una cuenta a `pro` con SQL, cómo activar la vinculación de identidades mail/Google y la pausa por inactividad del plan gratis.
- [ ] **Step 5:** `git init` y commit local `feat: esquema y seguridad de la nube`.

### Task 9: Puesta en marcha con un proyecto real (requiere al usuario)

- [ ] **Step 1:** El usuario crea el proyecto en Supabase y el repo privado en GitHub (son cuentas y datos suyos), y activa el inicio con Google. Pasa la URL del proyecto y la clave pública.
- [ ] **Step 2:** Aplicar las migraciones de Task 8 y correr `test/rls.sql` en el proyecto.
- [ ] **Step 3:** Configurar `MI_GYM_SUPABASE_URL` y `MI_GYM_SUPABASE_ANON_KEY` en el armado de Windows y Android.
- [ ] **Step 4:** Prueba de punta a punta: PC con una copia de los datos actuales + celular; crear cuenta, pasarla a `pro`, aceptar consentimiento, juntar, cargar un entrenamiento en el celular y verlo en la PC; borrar una rutina en la PC y verla desaparecer en el celular; borrar la cuenta.
- [ ] **Step 5:** Commit de la configuración `chore: configuracion de supabase para los armados`.
