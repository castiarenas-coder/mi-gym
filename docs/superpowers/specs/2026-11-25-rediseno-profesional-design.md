# Rediseño profesional del frontend — diseño

Fecha: 2026-11-25 · Estado: borrador para aprobación

## Intención

La app se va a vender a gimnasios, profes y personas. La demo en el celular es lo primero que ve un dueño de gimnasio en las entrevistas, así que tiene que verse como un producto comercial, no como un proyecto personal. Hoy la base (oscura, acento lima) está bien, pero se ve casera: logo de solo texto, copia heredada de otra app ("Hoy se entrena"), estados vacíos pobres, brillo lima en todo, barra de scroll visible en los filtros, fotos del catálogo desparejas, jerarquía tipográfica floja.

El usuario delegó la decisión de estilo después de pasar una lista de referencias: Nike Training Club, Hevy, Strava, Garmin Connect, MyFitnessPal, Daily Yoga, Runkeeper y la app de VivaGym.

## Lectura de las referencias

| Referencia | Qué se toma | Qué no |
| --- | --- | --- |
| Hevy | Producto más parecido (registro de series y pesos). Interfaz minimalista y enfocada, registro sin fricción, detalle de ejercicio con músculos | Su paleta azul genérica |
| Strava | Datos primero: números grandes, resúmenes semanales, logros y récords visibles | Mapas, comunidad |
| Nike Training Club | Tipografía condensada fuerte para títulos y números, mucho aire, fotos grandes en las tarjetas destacadas | Pantallas editoriales a sangre completa: nuestras fotos de catálogo no tienen esa calidad y quedarían expuestas |
| Garmin Connect | Tablero de métricas en tarjetas sobre fondo oscuro | Densidad excesiva |
| VivaGym | App con la marca del gimnasio, planes por objetivo | — clave para el plan "Gimnasio Plus" con marca propia |
| MyFitnessPal, Daily Yoga, Runkeeper | Nada específico: otro dominio (nutrición, yoga, running) | — |

## Enfoques considerados

1. **Minimalista estilo Hevy, datos primero (elegido).** Estructura limpia, paleta neutra con un solo acento usado con moderación, números grandes, registro rápido. Un elemento propio reconocible: la franja semanal de entrenamientos. Profesional, legible y coherente con lo que hace la app.
2. **Editorial estilo Nike Training Club.** Tipografía gigante, fotos a sangre, blanco y negro. Muy llamativo, pero las fotos del catálogo (free-exercise-db) son de calidad desigual y el estilo prioriza la inspiración sobre el registro, que es el corazón de la app.
3. **Gimnasio de marca estilo VivaGym.** Toda la identidad gira alrededor del gimnasio. Sirve para el plan con marca propia, pero hoy no hay gimnasio cliente y la app personal quedaría sin identidad.

Se toma el enfoque 1 con dos préstamos: la tipografía condensada de Nike para títulos y números, y el acento cambiable de VivaGym (marca propia por gimnasio).

## Objetivos

- Que la app se vea como un producto comercial en una demo de 2 minutos, en celular Android y en PC.
- Inicio útil desde el primer segundo: qué toca hoy, cómo viene la semana, último entrenamiento.
- Sistema visual coherente en todas las pantallas, definido en tokens.
- Tema claro además del oscuro (oscuro por defecto); el claro también prepara el futuro panel de gimnasio en PC.
- Color de acento configurable en un solo token, base de la marca propia del plan Gimnasio Plus.
- Logo y nombre en un único componente, para cambiar el nombre comercial en un solo lugar cuando se decida.

## No objetivos

- Funcionalidad nueva (cuentas, sync, panel, licencias): son otras fases del roadmap.
- Reemplazar las fotos del catálogo.
- Cambiar textos de las pantallas más allá de corregir copia heredada y estados vacíos.
- iOS o cambios del empaquetado de Windows/Android.

## Anti-objetivos (fracaso aunque funcione)

- Que registrar una serie lleve más toques o sea más lento que hoy.
- Que algún dato del usuario se pierda o cambie de lugar sin aviso.
- Que la app deje de funcionar sin internet (fuentes y recursos tienen que ir incluidos, nada desde CDN).
- Bajar el contraste o el tamaño táctil (mínimo 48 px) para "verse más fino".
- Romper los tests existentes (servidor 99, cliente 121) sin reemplazarlos.

## Restricciones

- Stack actual: React + Vite + TypeScript, CSS propio con tokens en `client/src/styles/tokens.css`, iconos `lucide-react`, fuentes vía `@fontsource-variable`. Sin agregar frameworks de UI.
- Funciona offline en Windows (servidor local) y Android (WebView con nodejs-mobile).
- Interfaz en español rioplatense.
- Repo público MIT: el rediseño vive en el cliente abierto.
- Strict TDD del proyecto: cambios de comportamiento con test primero; los cambios solo visuales se verifican con capturas en el navegador.

## Diseño

### Identidad

- **Logo:** componente `Marca` con isotipo simple (una forma geométrica derivada de una mancuerna o una barra, en SVG) + nombre en texto. El nombre sale de una sola constante, hoy "Mi Gym".
- **Tipografía:** títulos y números grandes en una condensada fuerte (Archivo variable, ancho condensado, `@fontsource-variable/archivo`); textos de interfaz en Manrope (ya instalada). Se quita Unbounded.
- **Escala:** 4 tamaños de título y 3 de texto definidos en tokens; números de métricas con cifras tabulares.

### Color y temas

- Oscuro (por defecto): fondo casi negro con un leve tono frío, dos niveles de superficie, bordes sutiles.
- Claro: fondo blanco roto, superficies blancas, bordes grises.
- Acento: lima actual, usado solo en la acción principal de cada pantalla, el estado activo de la navegación y los datos destacados. Se quitan los brillos (glow) y degradados de fondo.
- Colores de estado: ok, aviso, peligro, más un naranja para récords.
- Selector de tema (Sistema / Oscuro / Claro) en Ajustes, guardado en el equipo.
- El acento se define en un solo token y se puede cambiar desde Ajustes con 6 colores predefinidos que respetan contraste en ambos temas.

### Navegación

- Celular: barra inferior de 5 secciones con icono y texto legible.
- PC (≥ 900 px): barra lateral con logo arriba, secciones con icono y nombre, persona activa y Ajustes abajo. Se quita la cabecera duplicada.

### Pantallas

- **Inicio:** saludo con nombre de la persona y fecha; tarjeta principal "Entrenar hoy" con la rutina sugerida y botón grande; franja semanal (lunes a domingo, días entrenados marcados) como elemento propio de la marca; tarjeta del último entrenamiento (fecha, duración, volumen, récords); favoritos en carrusel. Accesos rápidos en una grilla pareja, sin tarjetas huérfanas.
- **Ejercicios:** buscador fijo arriba, filtros en chips sin barra de scroll visible, tarjetas con foto en proporción fija, recorte uniforme y degradado inferior para leer el nombre, etiqueta de músculo y equipo.
- **Detalle de ejercicio:** foto/animación grande, músculos principales y secundarios, instrucciones numeradas, historial y mejor marca de la persona.
- **Rutinas y rutina:** lista con cantidad de ejercicios y duración estimada; edición con arrastre y controles grandes.
- **Entrenar / sesión en curso:** cronómetro grande, ejercicio actual destacado, series en filas con peso y repeticiones grandes, marcar serie con un toque, temporizador de descanso visible. Ningún toque extra respecto de hoy.
- **Progreso:** métricas clave en tarjetas con número grande (sesiones, volumen, racha), gráficos con el estilo nuevo, estados vacíos con ilustración simple, explicación y botón.
- **Historial, Ajustes, personas:** mismo sistema; Ajustes agrupado en secciones (Apariencia, Personas, Respaldo, Acerca de).

### Componentes base

Botón (primario, secundario, fantasma), tarjeta, chip, campo, pestañas, estado vacío, cabecera de página, métrica (número + etiqueta + variación), franja semanal, `Marca`. Todos leen solo de tokens.

### Calidad

- Contraste AA en ambos temas.
- Movimiento reducido respetado (`prefers-reduced-motion`).
- Verificación visual de cada pantalla en 375 px (celular) y 1280 px (PC), tema oscuro y claro.

## Lo que decide quien construye

- Forma exacta del isotipo, dentro de la línea "geométrico, simple, legible a 24 px".
- Valores exactos de la paleta, respetando contraste AA.
- Los 6 colores de acento predefinidos.
- Orden de implementación por pantalla, empezando por tokens, componentes base, navegación e Inicio (lo que se ve en la demo).

## Aclaraciones (revisión previa)

- **Solo datos que ya existen.** Si un elemento del diseño necesita un dato que la API no da hoy, se omite; no se agregan campos al servidor.
- **Tarjeta "Entrenar hoy":** no hay lógica de sugerencia. Muestra "Continuar" si hay una sesión en curso; si no, el botón para empezar y acceso a las rutinas de la persona. Sin rutinas: invita a crear la primera.
- **Último entrenamiento:** fecha, duración y volumen (lo que trae el resumen). Sin récords.
- **Franja semanal:** días entrenados por la persona activa, calculados en el cliente a partir del historial existente; semana de lunes a domingo, hora local. Es lógica nueva chica: va con test primero.
- **Detalle de ejercicio y rutinas:** músculos secundarios, mejor marca o duración estimada se muestran solo si ya están en los datos.
- **Copia heredada:** el nombre sigue siendo "Mi Gym" hasta que se decida el comercial. Se reemplazan "Hoy se entrena" y "guardado en tu PC" (no aplica a Android) por textos neutros.
- **Entrenamiento grupal y selector de personas:** entran en el rediseño con el mismo sistema.
- **Navegación:** las secciones son las de `rutas.ts`. En celular queda una barra superior fina con logo, persona y Ajustes, más la barra inferior; en PC la barra lateral reemplaza a la superior.
- **Tema y acento:** por equipo (almacenamiento local), iguales para todas las personas del equipo.

## Llamadas mías (para revisar)

- Enfoque minimalista estilo Hevy con tipografía condensada y acento cambiable.
- Archivo reemplaza a Unbounded; Manrope se queda.
- Tema claro incluido; oscuro por defecto.
- Selector de acento con colores predefinidos (no libre) para no romper contraste.
- Sin funcionalidad nueva en este rediseño.
