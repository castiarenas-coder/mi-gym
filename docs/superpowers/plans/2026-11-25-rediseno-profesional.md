# Rediseño profesional del frontend — plan de implementación

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Que el cliente de Mi Gym se vea como un producto comercial (estilo minimalista, datos primero), con tema claro/oscuro y acento configurable, sin cambiar lo que hace.

**Architecture:** Todo el estilo sale de tokens CSS en `client/src/styles/tokens.css`, con tema por atributo `data-tema` en `<html>` y acento en `--acento`. Componentes base chicos en `client/src/components/ui/`. Lógica nueva mínima y probada: preferencias de apariencia y días entrenados de la semana.

**Tech Stack:** React 19 + Vite + TypeScript, CSS propio, `lucide-react`, `@tanstack/react-query`, Vitest + Testing Library, fuentes `@fontsource-variable`.

**Spec:** `docs/superpowers/specs/2026-11-25-rediseno-profesional-design.md`

## Global Constraints

- Sin funcionalidad nueva ni campos nuevos en la API: si un dato no existe, el elemento se omite.
- Offline: fuentes e íconos incluidos en el paquete; nada desde CDN.
- Tamaño táctil mínimo 48 px (`--toque`); contraste AA en ambos temas; respetar `prefers-reduced-motion`.
- Registrar una serie no puede llevar más toques que hoy.
- Español rioplatense en toda la interfaz. El nombre sale de una sola constante: `NOMBRE_APP = 'Mi Gym'`.
- Tipografía: títulos y números en Archivo variable condensada (`@fontsource-variable/archivo`); texto en Manrope (ya instalada). Quitar Unbounded.
- Tema por defecto: oscuro. Tema y acento se guardan por equipo en `localStorage`, iguales para todas las personas.
- Strict TDD para lógica; lo solo visual se verifica con capturas a 375 px y 1280 px en tema oscuro y claro.
- Commits convencionales, sin atribución de IA, autor ya configurado en el repo.
- Al terminar, todos los tests del cliente y del servidor siguen pasando (`npm test` en `client/` y en la raíz).

## Review Focus

- `localStorage` con valores corruptos o viejos (tema `"azul"`, acento inexistente): la app arranca con los valores por defecto, sin romperse. → test en Task 2.
- Fechas de sesiones en el borde de la semana (domingo 23:30, lunes 00:10, otra semana, otro año) y semana vacía. → tests en Task 5.
- Persona sin rutinas, sin sesiones y sin favoritos: Inicio muestra invitaciones útiles, no huecos ni "0 esta semana". → test en Task 6.
- Nombre de persona largo o vacío en el saludo: no rompe el layout y no muestra "Hola, ". → test en Task 6.
- Android (WebView) con tema "sistema": sigue el modo del teléfono; si no puede detectarlo, oscuro. → test en Task 2.

---

### Task 1: Fuentes, tokens y temas

**Files:**
- Modify: `client/package.json` (agregar `@fontsource-variable/archivo`, quitar `@fontsource-variable/unbounded`)
- Modify: `client/src/main.tsx` (imports de fuentes)
- Modify: `client/src/styles/tokens.css`
- Modify: `client/src/styles/global.css` (base, botones, tarjetas, chips, campos, pestañas)

**Interfaces:**
- Produces: tokens `--fondo --superficie --superficie-2 --borde --texto --texto-suave --acento --acento-texto --record --ok --aviso --peligro`, escala `--t-display --t-titulo --t-subtitulo --t-chico` y `--fuente-titulo` (Archivo, `font-stretch: 75%`), `--fuente-texto` (Manrope). Bloques `:root, [data-tema="oscuro"]` y `[data-tema="claro"]`. Clase utilitaria `.numero` con `font-variant-numeric: tabular-nums` en fuente de título.

- [ ] **Step 1:** Instalar Archivo, desinstalar Unbounded (`npm i @fontsource-variable/archivo && npm rm @fontsource-variable/unbounded` en `client/`) y actualizar imports en `main.tsx`.
- [ ] **Step 2:** Reescribir `tokens.css` con los dos temas. Oscuro: fondo casi negro con leve tono frío; claro: fondo blanco roto, superficies blancas. Sin glows ni degradados (quitar `--sombra` brillante; sombra sutil solo en tema claro).
- [ ] **Step 3:** En `global.css`, títulos con `--fuente-titulo` en mayúsculas condensadas; `.boton--principal` con acento plano sin brillo; chips y filtros con `scrollbar-width: none` y `::-webkit-scrollbar { display: none }`; `@media (prefers-reduced-motion: reduce)` anulando transiciones.
- [ ] **Step 4:** Verificar: `npm run build` en `client/` sin errores y `npm test` en `client/` pasa (121 tests).
- [ ] **Step 5:** Commit `style: tokens de tema oscuro y claro y tipografia Archivo`.

### Task 2: Preferencias de apariencia

**Files:**
- Create: `client/src/lib/apariencia.ts`
- Test: `client/src/lib/apariencia.test.ts`
- Modify: `client/src/main.tsx` (aplicar al iniciar)
- Modify: `client/src/pages/Ajustes.tsx` (sección "Apariencia")
- Test: `client/src/pages/Ajustes.test.tsx`

**Interfaces:**
- Produces:
  - `type Tema = 'sistema' | 'oscuro' | 'claro'`
  - `const ACENTOS: { id: string; nombre: string; color: string; texto: string }[]` (6 entradas; la primera `{ id: 'lima', nombre: 'Lima', color: '#c6ff3d', texto: '#0b0d10' }`)
  - `interface Apariencia { tema: Tema; acento: string }`, `APARIENCIA_DEFECTO = { tema: 'oscuro', acento: 'lima' }`
  - `leerApariencia(almacen: Storage = localStorage): Apariencia`
  - `guardarApariencia(a: Apariencia, almacen?: Storage): void` (clave `mi-gym:apariencia`)
  - `temaEfectivo(tema: Tema, prefiereOscuro: boolean | null): 'oscuro' | 'claro'`
  - `aplicarApariencia(a: Apariencia, raiz: HTMLElement = document.documentElement, prefiereOscuro?: boolean | null): void` — pone `data-tema` y las variables `--acento` / `--acento-texto`.

- [ ] **Step 1: Tests que fallan** en `apariencia.test.ts`:
  - `leerApariencia` sin dato devuelve `{ tema: 'oscuro', acento: 'lima' }`.
  - con JSON inválido, tema `"azul"` o acento `"xx"` devuelve el defecto en el campo inválido.
  - `guardarApariencia` + `leerApariencia` devuelve lo guardado.
  - `temaEfectivo('sistema', true) === 'oscuro'`, `('sistema', false) === 'claro'`, `('sistema', null) === 'oscuro'`, `('claro', true) === 'claro'`.
  - `aplicarApariencia({ tema: 'claro', acento: ACENTOS[1].id }, raiz)` deja `raiz.dataset.tema === 'claro'` y `raiz.style.getPropertyValue('--acento') === ACENTOS[1].color`.
- [ ] **Step 2:** `npx vitest run src/lib/apariencia.test.ts` → FAIL (módulo inexistente).
- [ ] **Step 3:** Implementar `apariencia.ts`. `prefiereOscuro` sale de `matchMedia('(prefers-color-scheme: dark)')` cuando existe, si no `null`. Los 6 acentos se eligen con contraste AA de `texto` sobre `color`.
- [ ] **Step 4:** Tests pasan.
- [ ] **Step 5: Test que falla** en `Ajustes.test.tsx`: "Apariencia" muestra radios Sistema / Oscuro / Claro y los 6 acentos; elegir "Claro" deja `document.documentElement.dataset.tema === 'claro'` y lo guarda.
- [ ] **Step 6:** Implementar la sección en `Ajustes.tsx`, agrupando Ajustes en secciones Apariencia, Personas, Respaldo, Acerca de. Aplicar al iniciar en `main.tsx` y escuchar cambios de `prefers-color-scheme` cuando el tema es `sistema`.
- [ ] **Step 7:** `npm test` en `client/` pasa.
- [ ] **Step 8:** Commit `feat: tema claro, oscuro o del sistema y color de acento`.

### Task 3: Componentes base

**Files:**
- Create: `client/src/components/ui/Marca.tsx`, `EstadoVacio.tsx`, `Metrica.tsx`, `CabeceraPagina.tsx`
- Create: `client/src/styles/ui.css` (importado desde `global.css`)
- Create: `client/src/lib/marca.ts`
- Test: `client/src/components/ui/ui.test.tsx`

**Interfaces:**
- Produces:
  - `NOMBRE_APP = 'Mi Gym'` en `lib/marca.ts`
  - `<Marca compacta?: boolean />`: isotipo SVG geométrico (mancuerna o barra, legible a 24 px) en `--acento` + `NOMBRE_APP`; con `compacta` solo el isotipo con `aria-label={NOMBRE_APP}`.
  - `<EstadoVacio icono: LucideIcon titulo: string texto: string accion?: { texto: string; a: string } />`
  - `<Metrica valor: string | number unidad?: string etiqueta: string />`
  - `<CabeceraPagina titulo: string accion?: ReactNode />`

- [ ] **Step 1: Tests que fallan:** `Marca` muestra el texto `NOMBRE_APP`; compacta tiene `aria-label` igual a `NOMBRE_APP` y no muestra el texto; `EstadoVacio` con `accion` renderiza un link con ese texto y `href`; `Metrica` muestra valor, unidad y etiqueta.
- [ ] **Step 2:** Correr y ver FAIL.
- [ ] **Step 3:** Implementar los cuatro y `ui.css` (solo tokens).
- [ ] **Step 4:** Tests pasan.
- [ ] **Step 5:** Commit `feat: componentes base de interfaz y marca`.

### Task 4: Navegación

**Files:**
- Modify: `client/src/app/Layout.tsx`
- Modify: `client/src/styles/global.css` (reglas `.header`, `.nav`, `.lateral`)
- Test: `client/src/app/Personas.test.tsx` (ajustar si cambian roles o textos)

**Interfaces:**
- Consumes: `Marca`, `SECCIONES` de `app/rutas.ts`, `usePersonaActiva`, `AvatarPersona`.

- [ ] **Step 1:** Escribir test (en un nuevo `client/src/app/Layout.test.tsx`): existe una navegación "Secciones" con los 5 enlaces de `SECCIONES`, el botón "Cambiar de persona (…)" y el enlace "Ajustes"; el nombre de la app aparece una sola vez en la página.
- [ ] **Step 2:** Correr y ver FAIL (el nombre está como "MI GYM" partido).
- [ ] **Step 3:** Rehacer `Layout`: celular (<900 px) = barra superior fina (Marca, persona, Ajustes) + barra inferior de 5 secciones con texto ≥ 11 px; PC (≥900 px) = barra lateral con Marca arriba, secciones con icono y nombre, persona y Ajustes abajo, sin barra superior. Un solo `<nav aria-label="Secciones">` en el DOM; CSS decide la posición.
- [ ] **Step 4:** `npm test` en `client/` pasa.
- [ ] **Step 5:** Commit `feat: navegacion lateral en PC y barra inferior en celular`.

### Task 5: Franja semanal

**Files:**
- Create: `client/src/lib/semana.ts`
- Test: `client/src/lib/semana.test.ts`
- Create: `client/src/components/FranjaSemanal.tsx`

**Interfaces:**
- Produces:
  - `diasEntrenados(fechas: string[], hoy: Date): boolean[]` — 7 posiciones, lunes a domingo de la semana de `hoy`, hora local.
  - `<FranjaSemanal hoy?: Date />` — usa `useSesiones(30)`; marca días entrenados, el día de hoy con borde punteado si no entrenó, y el texto "N días esta semana".

- [ ] **Step 1: Tests que fallan** con `hoy = new Date(2026, 10, 25, 12)` (miércoles):
  - `[]` → 7 `false`.
  - fechas del lunes 23/11 y el miércoles 25/11 → posiciones 0 y 2 en `true`.
  - domingo 22/11 23:30 local → todo `false` (semana anterior); domingo 29/11 23:30 → posición 6.
  - dos sesiones el mismo día → una sola posición `true`.
  - con `hoy = new Date(2027, 0, 1)` (viernes) y fecha 28/12/2026 → posición 0.
- [ ] **Step 2:** Correr y ver FAIL.
- [ ] **Step 3:** Implementar `diasEntrenados` (parsear la fecha ISO con `new Date(fecha)` y comparar en hora local) y `FranjaSemanal`.
- [ ] **Step 4:** Tests pasan.
- [ ] **Step 5:** Commit `feat: franja semanal de dias entrenados`.

### Task 6: Inicio

**Files:**
- Modify: `client/src/pages/Inicio.tsx`
- Modify: `client/src/styles/global.css` (quitar `.portada`, `.acceso` viejos)
- Test: `client/src/pages/Inicio.test.tsx`

**Interfaces:**
- Consumes: `usePersonaActiva().persona.nombre`, `useResumenProgreso`, `useRutinas`, `FranjaSemanal`, `Metrica`, `EstadoVacio`, `TarjetaEjercicio`, `duracionLarga`, `fechaCorta`.

- [ ] **Step 1: Tests que fallan:**
  - no aparece "Hoy se entrena" ni "guardado en tu PC".
  - saludo "Hola, {nombre}" con la fecha de hoy; con nombre vacío muestra solo "Hola".
  - con `sesion_activa` muestra "Continuar" y el título de la sesión; sin ella muestra "Empezar".
  - sin rutinas muestra la invitación "Creá tu primera rutina" con enlace a `/rutinas`.
  - con `ultima_sesion` muestra duración y volumen como métricas; sin ella no muestra la tarjeta.
- [ ] **Step 2:** Correr y ver FAIL.
- [ ] **Step 3:** Implementar el Inicio del diseño: saludo y fecha, `FranjaSemanal`, tarjeta "Entrenar hoy" (rutinas de la persona como accesos), último entrenamiento con `Metrica`, favoritos en tira, "Para probar hoy". Sin la grilla de accesos (la navegación ya los cubre; Historial y Favoritos quedan como enlaces en sus secciones).
- [ ] **Step 4:** `npm test` en `client/` pasa.
- [ ] **Step 5:** Commit `feat: inicio con saludo, semana, entrenar hoy y ultimo entrenamiento`.

### Task 7: Ejercicios y detalle

**Files:**
- Modify: `client/src/pages/Ejercicios.tsx`, `client/src/pages/Ejercicio.tsx`, `client/src/components/TarjetaEjercicio.tsx`, `BuscadorCatalogo.tsx`
- Modify: `client/src/styles/ejercicios.css`

- [ ] **Step 1:** Tarjeta: foto con `aspect-ratio: 4 / 3`, `object-fit: cover`, degradado inferior suave para el corazón y el play, nombre y etiquetas debajo. Buscador fijo arriba, chips sin barra de scroll, selects con el estilo de campo.
- [ ] **Step 2:** Detalle: foto grande, músculos e instrucciones numeradas; historial y mejor marca solo si `useHistorialEjercicio` trae datos. `CabeceraPagina` en ambas.
- [ ] **Step 3:** `npm test` en `client/` pasa (los tests existentes de Ejercicios/Ejercicio no cambian de comportamiento).
- [ ] **Step 4:** Captura en 375 y 1280 px, oscuro y claro, sin barra gris visible ni recortes.
- [ ] **Step 5:** Commit `style: catalogo y detalle de ejercicio con el sistema nuevo`.

### Task 8: Rutinas, entrenar y grupo

**Files:**
- Modify: `client/src/pages/Rutinas.tsx`, `Rutina.tsx`, `Entrenar.tsx`, `client/src/components/SesionEnCurso.tsx`, `ResumenSesion.tsx`, `ResumenGrupo.tsx`, `TemporizadorDescanso.tsx`, `SelectorRutina.tsx`
- Modify: `client/src/styles/rutinas.css`, `entrenar.css`

- [ ] **Step 1:** Rutinas: lista con nombre y cantidad de ejercicios (sin duración: no existe el dato); estado vacío con `EstadoVacio`.
- [ ] **Step 2:** Sesión en curso: cronómetro en `--t-display` con `.numero`, ejercicio actual destacado, filas de serie con peso y reps grandes, marcar serie en un toque (mismos controles y orden que hoy), temporizador de descanso visible.
- [ ] **Step 3:** Grupo y resúmenes con `Metrica`.
- [ ] **Step 4:** `npm test` en `client/` pasa, incluidos `Entrenar.test.tsx` y `EntrenarGrupo.test.tsx` sin cambiar sus pasos de interacción (prueba de que no se agregaron toques).
- [ ] **Step 5:** Commit `style: rutinas y entrenamiento con el sistema nuevo`.

### Task 9: Progreso, historial, ajustes y personas

**Files:**
- Modify: `client/src/pages/Progreso.tsx`, `client/src/pages/progreso/*.tsx`, `Historial.tsx`, `Ajustes.tsx`, `client/src/components/ElegirPersona.tsx`, `FormularioPersona.tsx`, `GraficoBarras.tsx`, `GraficoLinea.tsx`
- Modify: `client/src/styles/personas.css`, `global.css`

- [ ] **Step 1:** Progreso: métricas en `Metrica` (sesiones, volumen, racha), gráficos con colores de tokens, estados vacíos con `EstadoVacio`.
- [ ] **Step 2:** Historial, Ajustes (secciones de Task 2) y selector de personas con `CabeceraPagina` y el estilo nuevo.
- [ ] **Step 3:** `npm test` en `client/` pasa.
- [ ] **Step 4:** Commit `style: progreso, historial, ajustes y personas con el sistema nuevo`.

### Task 10: Verificación final

- [ ] **Step 1:** `npm test` en `client/` y en la raíz (servidor) pasan; `npm run build` sin errores.
- [ ] **Step 2:** Con el servidor de desarrollo, capturas de Inicio, Ejercicios, Detalle, Rutinas, Entrenar, Progreso y Ajustes a 375 y 1280 px en oscuro y claro.
- [ ] **Step 3:** Revisar contraste AA del texto suave y del texto sobre acento en ambos temas con los 6 acentos (cálculo en consola del navegador).
- [ ] **Step 4:** Corregir lo que aparezca y commit `fix: ajustes visuales del rediseno`.
