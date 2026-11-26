# Rumbo Fit

Tu gimnasio en tu PC: ejercicios, rutinas y progreso, todo en español, sin cuentas, sin suscripciones y sin mandar tus datos a ningún lado.

> ¿Te sirve? Podés apoyar el proyecto en [Donaciones](#donaciones) 💚

## Qué hace

- **Catálogo de 876 ejercicios en español**, con animación (fotos), músculos, equipo y pasos explicados.
- **Rutinas** por días, con tus propios ejercicios, series, repeticiones y descansos.
- **Entrenar** con cronómetro, temporizador de descanso y calculadora de discos: marcás cada serie al hacerla.
- **Entrenar en grupo**: varias personas en el mismo entrenamiento, cada una con sus propios pesos.
- **Varias personas** en la misma app, cada una con lo suyo.
- **Progreso y medidas**: historial, récords, gráficos de volumen y medidas corporales.
- **Calculadora** de IMC y calorías.
- **Todo local y sin cuentas**: los datos viven en una base SQLite en tu carpeta.
- **Backups**: respaldo automático, exportar/importar a archivo y restaurar.
- Funciona también desde el celular: con el wifi de tu casa o, mejor, instalando la app de Android (sin PC ni internet).

## Descargar e instalar (Windows)

La forma más fácil, sin comandos ni nada que instalar antes:

1. Entrá a [Releases](https://github.com/castiarenas-coder/mi-gym/releases/latest) y bajá **Rumbo-Fit-Setup-x.y.z.exe**.
2. Hacé doble clic en el archivo y seguí los pasos (son pocos). No pide permisos de administrador.
3. Al terminar, tocá **Abrir Rumbo Fit**. Después lo encontrás en el menú Inicio (y en el Escritorio, si lo tildaste).

El catálogo de 876 ejercicios con sus fotos ya viene adentro: **no necesita internet** para funcionar.

**Si Windows muestra "Windows protegió su PC":** es normal, el instalador todavía no tiene firma digital paga. Tocá **Más información** y después **Ejecutar de todas formas**.

- **Dónde quedan tus datos:** en `%APPDATA%\Mi Gym` (pegá eso en la barra del Explorador de archivos). Ahí están la base, tus fotos/GIF y los respaldos.
- **Cómo actualizar:** en **Ajustes → Acerca de** la app avisa cuando hay una versión nueva. Bajá el instalador nuevo y ejecutalo: se instala encima y **no toca tus datos**.
- **Cómo cerrarlo:** **Ajustes → Cerrar Rumbo Fit**. Si solo cerrás la ventana, el programa sigue en segundo plano (casi no consume) y se abre más rápido la próxima vez.
- **Cómo desinstalar:** Configuración de Windows → Aplicaciones → Rumbo Fit. Tus datos **no se borran**; si ya no los querés, borrá la carpeta `%APPDATA%\Mi Gym`.

### Armar el instalador (para quien desarrolla)

Requiere [Inno Setup 6](https://jrsoftware.org/isinfo.php) y haber corrido `npm run importar` una vez (para tener las fotos originales). Después:

```bash
npm run instalador   # deja release/Mi-Gym-Setup-<versión>.exe
```

Compila la interfaz, convierte el catálogo (fotos a WebP de hasta 480 px, unos 23 MB en total), baja Node 22 portátil verificando su SHA256 y compila el instalador. El Node portátil se guarda en `.cache/node/`.

## Descargar e instalar (Android)

Rumbo Fit corre **entero dentro del celular**: no necesita una PC, wifi ni internet. El catálogo de 876 ejercicios con sus fotos ya viene en la app.

1. Desde el celular, entrá a [Releases](https://github.com/castiarenas-coder/mi-gym/releases/latest) y bajá el archivo **Rumbo-Fit-x.y.z-arm64.apk**. Es el que sirve para casi todos los celulares de los últimos años; si Android dice que no es compatible, bajá el **-arm32.apk**.
2. Abrí el archivo bajado. Android te va a avisar que tu navegador no puede instalar apps: tocá **Configuración** y activá **Permitir de esta fuente** (o "Instalar apps desconocidas") para el navegador con el que lo bajaste. Volvé atrás.
3. Tocá **Instalar** y después **Abrir**. Si Play Protect pregunta, elegí **Instalar de todas formas** (la app todavía no está en Google Play).

- **Dónde quedan tus datos:** adentro del celular, en el almacenamiento privado de la app. Nada sale a internet.
- **Cómo guardar un backup:** **Ajustes → Exportar mis datos**. El archivo `mi-gym-AAAA-MM-DD.json` queda en la carpeta **Descargas** (en Android 9 o menos se abre el menú de compartir para guardarlo donde quieras). Mandátelo por mail o subilo a la nube. Para recuperarlo: **Ajustes → Importar desde un archivo**.
- **Si desinstalás la app, los datos se borran.** Solo se recuperan si tenés la copia automática de Google activada (Android la restaura al reinstalar o al estrenar celular con tu misma cuenta de Google) o un archivo exportado. Conviene exportar uno de vez en cuando.
- **Cómo actualizar:** cuando haya una versión nueva, bajá el APK nuevo y abrilo: se instala **encima** de la vieja y mantiene tus datos (siempre es la misma firma, no hace falta desinstalar).

### Armar el APK (para quien desarrolla)

Requisitos fuera del repo: JDK 17, Android SDK (plataforma 36, build-tools 36, NDK 28.2.13676358 y CMake 3.31.6) y [nodejs-mobile](https://github.com/nodejs-mobile/nodejs-mobile) 24.x descomprimido (carpeta con `bin/<abi>/libnode.so` e `include/node`; se indica con `NODEJS_MOBILE_DIR` o `-PnodejsMobile=`). Además, `android/keystore.properties` con los datos de la clave de firma (no se sube al repo; ver `android/app/build.gradle.kts`) y haber corrido `npm run preparar-catalogo`.

```bash
npm run apk   # deja release/Mi-Gym-<versión>-arm64.apk y -arm32.apk
```

Compila la interfaz, arma `android/app/src/main/assets/nodejs-project/` (servidor, interfaz, dependencias de producción y catálogo), y firma los APK. El `versionCode` sale de `version` en `package.json` (0.1.0 → 100): para publicar una actualización, subí la versión.

## Instalación para desarrolladores

Requisitos: [Node.js](https://nodejs.org) 22 o más nuevo (22.19+).

```bash
git clone https://github.com/castiarenas-coder/mi-gym.git
cd mi-gym
npm install
npm run importar   # baja ~100 MB de fotos del catálogo (una sola vez, necesita internet)
npm run build      # compila la interfaz
npm start
```

Abrí <http://127.0.0.1:8788> en el navegador.

El acceso directo en el Escritorio es opcional y solo para Windows (`npm run acceso-directo`, ver más abajo).

## Uso

| Comando | Qué hace |
| --- | --- |
| `npm start` | Abre el servidor en <http://127.0.0.1:8788>, solo accesible desde esta PC. |
| `npm run lan` | Igual, pero también accesible desde el celular. Las direcciones salen en la consola y en **Ajustes → Abrir en el celular** (con código QR). |
| `npm run dev` | Modo desarrollo con recarga automática. |
| `npm test` / `npm run test:client` | Pruebas del servidor y de la interfaz. |

Puerto distinto: variable `MI_GYM_PORT`.

### Acceso directo en el Escritorio

```bash
npm run acceso-directo
```

Crea el ícono **Rumbo Fit** en tu Escritorio. Al abrirlo levanta el servidor sin dejar ninguna consola abierta (si hace falta, compila la interfaz antes) y abre la app en tu navegador. Si movés la carpeta del proyecto, corré el comando de nuevo. Para quitarlo: `npm run acceso-directo -- --quitar`. El registro del servidor queda en `data/server.log`.

## Personas y entrenar en grupo

Rumbo Fit sirve para toda la casa. Cada **persona** tiene lo suyo, separado como los perfiles de una app de series:

- Rutinas, entrenamientos, historial, récords, medidas, perfil (altura, objetivo) y ejercicios favoritos.
- Lo único compartido es el catálogo de ejercicios y las fotos/GIF que subas a un ejercicio, y los ajustes de la app.

**Quién entrena.** Con una sola persona la app abre directo. Con más de una, al abrir (o al tocar el círculo con tu avatar, arriba a la derecha) aparece **¿Quién entrena?**, con una ficha por persona y **Agregar persona**. La elección se recuerda en ese navegador; en el celular se elige aparte. Cada persona nueva arranca con las 2 rutinas de ejemplo.

**Administrarlas.** **Ajustes → Personas**: agregar, cambiar nombre, color y avatar (un emoji o la inicial) y borrar. Borrar a alguien borra todas sus rutinas, entrenamientos, medidas y favoritos; la app te lo avisa y te sugiere exportar antes. No se puede borrar a la última persona.

**Entrenar en grupo.** Al empezar un día de rutina o una sesión libre, si hay más personas, la app pregunta **¿Entrena alguien más?**. Quienes marques entrenan con vos y el entrenamiento cuenta también para su progreso:

- Cada uno tiene su propia sesión, con los mismos ejercicios y **sus propios pesos** (se precarga lo que hizo cada uno la última vez).
- En la pantalla de entrenar hay una pestaña por persona para cargar las series de cada una. El descanso es uno solo para todos.
- Se puede sacar a alguien a mitad del entrenamiento (se descarta lo suyo y los demás siguen).
- Al terminar se cierra la sesión de todos y se muestra el resumen de cada uno (duración, volumen, récords nuevos). En el historial, cada sesión indica con quién entrenaste.
- Si alguien ya tiene un entrenamiento en curso, no se lo puede sumar al grupo hasta que lo termine o lo descarte.

Los datos de las personas viajan en el respaldo y en la exportación (el formato cambió con esta función: un archivo exportado antes de las personas no se importa; restaurá un respaldo de la lista, que se actualiza solo).

## Dónde están tus datos y cómo no perderlos

Todo lo tuyo (personas, rutinas, entrenamientos, medidas, favoritos y tus GIF/fotos) vive en la carpeta del proyecto:

| Qué | Dónde |
| --- | --- |
| Base de datos | `data/mi_gym.db` |
| Tus GIF, videos y fotos | `data/media/` |
| Fotos del catálogo | `data/img/` (se vuelven a bajar con `npm run importar`) |
| Respaldos | `backups/` |

La ruta exacta aparece en **Ajustes → Tus datos**.

Protección contra pérdidas, de menos a más segura:

1. **Respaldo automático**: al abrir la app y cada 24 horas se guarda una copia en `backups/`, y se conservan las últimas 30.
2. **Exportar a un archivo**: en **Ajustes → Exportar / importar** bajás `mi-gym-AAAA-MM-DD.json` con los datos de todas las personas. Guardalo en la nube o en un pendrive.
3. **Copiar las carpetas `data/` y `backups/`** a otro disco o a la nube de vez en cuando. Un respaldo que está en el mismo disco no te salva si el disco falla.

### Restaurar

- **Desde la app**: **Ajustes → Tus datos**, elegí un respaldo de la lista y tocá **Restaurar**. Antes de reemplazar nada la app guarda un respaldo de lo que tenías, así que se puede deshacer.
- **Desde un archivo exportado**: **Ajustes → Importar desde un archivo**. También hace un respaldo previo. Solo acepta archivos de la misma versión de la app; si es más vieja, restaurá un respaldo de la lista.
- **Desde la consola** (con el servidor apagado): `npm run backup` hace uno ahora y `npm run restore` vuelve al más reciente (o `npm run restore -- ruta/al/archivo.db`).

## Donaciones

Rumbo Fit es gratis y de código abierto. Si te sirve y querés apoyar el proyecto, podés donar lo que quieras:

- **Mercado Pago** (Argentina): alias **`gabycasti822.mp`**
- **PayPal**: [Donar con PayPal](https://www.paypal.com/donate/?hosted_button_id=6G237RH4W2GRQ)

¡Gracias! También ayuda mucho dejar una ⭐ en el repo o contar qué mejorarías en [Issues](https://github.com/castiarenas-coder/mi-gym/issues).

## Licencia

Rumbo Fit se distribuye bajo licencia MIT: ver [LICENSE](LICENSE). Los datos, imágenes, tipografías y proyectos que inspiraron esta app tienen sus propias licencias, detalladas en [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md).
