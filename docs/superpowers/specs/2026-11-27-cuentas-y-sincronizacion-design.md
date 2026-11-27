# Cuentas y sincronización — diseño

Fecha: 2026-11-27 · Estado: borrador para aprobación

## Intención

Rumbo Fit hoy guarda todo en el equipo (PC o celular) y no tiene usuarios. Para vender los planes pagos (Pro, Coach, Gimnasio) hace falta que una familia tenga una cuenta y que sus datos se mantengan iguales entre equipos. Esta es la primera pieza del roadmap (F1 cuentas + F2 sincronización) y sirve en cualquier escenario que salga de las entrevistas.

## Decisiones tomadas con el usuario

- **Modelo de cuenta:** una cuenta por familia, con varias personas adentro, igual que hoy. Diseñado para que más adelante se pueda invitar a una persona a tener su propia cuenta.
- **Nube:** Supabase (cuentas, base Postgres y seguridad por filas) con un motor de sincronización propio en el servidor local de la app.
- **Choques:** gana el último cambio de cada registro; lo borrado queda marcado como borrado.
- **Qué se sincroniza:** personas, rutinas (con días y ejercicios), sesiones (con ejercicios y series), medidas, perfil y favoritos. Las fotos y videos propios de ejercicios quedan afuera por ahora.

## Objetivos

- Iniciar sesión con mail (código de un solo uso) o con Google, desde Windows y Android.
- La app sigue funcionando entera sin internet y sin cuenta; la cuenta es opcional.
- Con cuenta y plan habilitado, los datos de la familia se sincronizan solos entre todos sus equipos.
- Ningún dato se pierde en la primera sincronización ni en un choque.
- Cada cuenta tiene un plan (`gratis` / `pro`) que habilita la sincronización. El cobro queda para otra etapa: por ahora el plan se asigna a mano.
- Borrar la cuenta borra los datos de la nube; los del equipo quedan.

## No objetivos

- Modo Coach, panel de gimnasio, invitar personas a cuentas propias.
- Cobro con Mercado Pago o Google Play.
- Sincronizar fotos y videos propios, el catálogo (viene con la app) ni los ajustes del equipo (tema, acento).
- Edición en tiempo real entre dos equipos a la vez.

## Anti-objetivos (fracaso aunque funcione)

- Que alguien pierda entrenamientos al conectar un segundo equipo.
- Que la app deje de abrir o de registrar series sin internet.
- Que un usuario sin cuenta vea pantallas que lo obliguen a crearla.
- Que los datos de una familia sean visibles para otra.
- Guardar contraseñas propias o la clave de servicio de Supabase dentro de la app.

## Restricciones

- Stack: servidor local Node 22 + Express 5 con `node:sqlite` (Windows y Android vía nodejs-mobile), cliente React + Vite + TS. La sincronización vive en el servidor local, no en el navegador.
- Ley 25.326: el peso y las medidas son datos de salud. Consentimiento explícito antes de la primera subida, conexión cifrada, borrado de cuenta y exportación.
- Supabase plan gratis al inicio (verificar límites y pausa por inactividad al configurarlo).
- Open-core: el código del cliente (incluido el motor de sincronización) puede quedar en el repo público; lo que protege el plan pago son las reglas de acceso en Supabase, que viven en un repo privado (`rumbo-fit-nube`) junto con las migraciones de Postgres.
- Datos existentes: las bases actuales usan ids enteros autoincrementales por equipo, que chocan entre equipos.

## Enfoques considerados

1. **Supabase + motor propio (elegido):** cuentas y seguridad resueltas por Supabase; el ida y vuelta de datos lo programamos. Menos riesgo con contraseñas y más rápido. Costo: dependencia de un proveedor.
2. **Servidor propio:** control total, pero hay que hacer y mantener login, recuperación y seguridad. Más semanas y más riesgo.
3. **Base que sincroniza sola (tipo CouchDB):** obliga a reescribir el guardado de toda la app. Descartado.

## Diseño

### Datos locales: se sincronizan "documentos", no filas sueltas

La unidad de sincronización es un documento completo, no cada fila. Así una rutina o una sesión nunca queda a medias en otro equipo, y las rutas actuales que borran y recrean filas hijas no se tocan.

| Documento | Qué incluye | Identidad |
| --- | --- | --- |
| persona | nombre, color, avatar | `uid` de la persona |
| rutina | la rutina con todos sus días y ejercicios | `uid` de la rutina |
| sesión | la sesión con sus ejercicios y series (solo sesiones **finalizadas**) | `uid` de la sesión |
| medida | una medición | `uid` de la persona + fecha |
| perfil | perfil de una persona | `uid` de la persona |
| favorito | un ejercicio marcado | `uid` de la persona + id del ejercicio |

- `personas`, `rutinas` y `sesiones` suman `uid TEXT` (UUID v4, único) y `actualizado TEXT` (fecha ISO UTC del último cambio). Una migración asigna `uid` a todo lo existente. Los ids enteros siguen siendo la clave local y la de la API actual.
- Cualquier cambio en una fila hija (día, ejercicio de rutina, serie) actualiza el `actualizado` del documento padre, con disparadores de SQLite. Medidas, perfil y favoritos suman su propio `actualizado`.
- **Borrados sin cambiar las rutas:** los borrados siguen siendo reales en la base local (con sus cascadas actuales). Un disparador `AFTER DELETE` en cada tabla de documento anota en `sync_borrados` (tipo, identidad, fecha). Esa tabla es lo que se sube como borrado.
- Las sesiones en curso no se sincronizan: se suben cuando terminan. Así no hay dos entrenamientos en curso de la misma persona en dos equipos.
- Tabla `sync_estado`: cuenta vinculada, cursor de bajada, último envío y token de renovación de Supabase (cifrado con una clave del equipo).

### Nube (Supabase)

- Una tabla `documentos` con `cuenta_id` (el usuario de Supabase dueño de la familia), `tipo`, `clave` (la identidad de la tabla de arriba), `datos` (JSON del documento), `actualizado` (del equipo), `borrado` y `servidor_en` (fecha del servidor, para el cursor de bajada). Clave única: `cuenta_id + tipo + clave`.
- Tabla `cuentas` con `plan` (`gratis` | `pro`), `consentimiento_en` y `creada`. Un disparador la crea con `plan = 'gratis'` al registrarse. El plan se cambia a mano con SQL desde el repo privado hasta que exista el cobro.
- Seguridad por filas: cada usuario solo lee y escribe documentos con su `cuenta_id`, y solo si su cuenta tiene `plan = 'pro'`.
- Borrar la cuenta lo hace una Edge Function de Supabase (en el repo privado, con la clave de servicio), que borra documentos, fila de `cuentas` y usuario.
- La app usa solo la clave pública de Supabase (pensada para estar en el cliente).
- Mail y Google con la misma dirección deben terminar en el mismo usuario: se configura la vinculación de identidades de Supabase y se verifica antes de lanzar.

### Inicio de sesión

- En Ajustes, sección nueva "Cuenta": botón "Iniciar sesión", mail + código de 6 dígitos, o "Continuar con Google".
- El servidor local guarda la sesión (token de acceso y de renovación) y la renueva solo.
- Antes de la primera subida se muestra el consentimiento de datos de salud; sin aceptarlo no se sincroniza.
- Sin plan Pro: la cuenta queda creada y la sección muestra "Sincronización disponible con el plan Pro".

### Motor de sincronización

1. **Subida:** manda todas las filas con `actualizado` posterior al último envío, en lotes, con upsert por `uid`.
2. **Bajada:** pide las filas con `servidor_en` posterior al cursor guardado y las aplica.
3. **Choque:** si el documento cambió en los dos lados, gana el de `actualizado` más nuevo (reloj del equipo). Un borrado es un cambio más. Al aplicar, se reemplaza el documento local entero (la rutina con sus días y ejercicios, la sesión con sus series).
4. **Orden al bajar:** personas, después rutinas y perfiles, después sesiones, medidas y favoritos, traduciendo `uid` a ids locales. Si un documento llega antes que su persona, queda en espera hasta la próxima vuelta. Si nombra un ejercicio que no está en el catálogo del equipo (versión vieja), ese ejercicio se omite y se avisa en el registro.
5. **Cuándo:** al abrir la app, cada 5 minutos con conexión, al terminar un entrenamiento y con el botón "Sincronizar ahora". Sin conexión no hace nada y reintenta después.
6. **Estado visible:** en Ajustes, "Última sincronización: hace X" y los errores en lenguaje simple.

### Primer equipo y equipos nuevos

- **Cuenta nueva:** sube todo lo del equipo.
- **Equipo nuevo en una cuenta con datos:** si el equipo no tiene datos propios, baja todo. Si tiene datos, pregunta: "¿Juntar los datos de este equipo con los de tu cuenta?" (juntar o reemplazar los del equipo por los de la cuenta). Juntar suma todo; las personas con el mismo nombre se ofrecen para unificar, y unificar pasa todas las rutinas, sesiones, medidas y favoritos de una a la otra.

### Privacidad

- Borrar cuenta (en Ajustes): borra las filas de la nube y la cuenta de Supabase; los datos del equipo quedan.
- La exportación JSON actual sigue disponible.

## Lo que decide quien construye

- Tamaño de los lotes, intervalo exacto y estrategia de reintentos.
- Cómo se cifra el token de renovación en cada plataforma.
- La forma exacta de las pantallas de Cuenta, siguiendo el sistema visual del rediseño.
- Si el inicio con Google en Android usa el navegador del sistema o una vista interna (lo que Supabase y nodejs-mobile permitan).

## Llamadas mías (para revisar)

- Si una cuenta deja de tener plan Pro: deja de sincronizar, los datos del equipo quedan intactos y los de la nube se guardan 90 días por si vuelve; después se borran.
- Se sincronizan documentos completos (rutina, sesión) en lugar de filas sueltas, y las sesiones solo cuando terminan.
- Los borrados se registran en una tabla aparte en vez de cambiar todas las rutas que hoy borran.
- La migración corre igual en Windows y Android; las pruebas automáticas son en la PC y Android se prueba a mano con una copia de tus datos.

- Cuenta opcional: la app sigue siendo gratis y local sin registrarse.
- Inicio de sesión con código por mail y Google, sin contraseñas.
- Plan asignado a mano mientras no hay cobro.
- Reglas de acceso de Supabase en un repo privado nuevo `rumbo-fit-nube`; el motor de sincronización en la app pública.
- Gana el último cambio por registro, sin fusionar campos.
