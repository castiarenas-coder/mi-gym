# Mi Gym

Ejercicios, rutinas y progreso, todo en español y guardado en tu PC. Sin cuentas, sin internet para usarla y sin suscripciones.

- Catálogo de unos 870 ejercicios con fotos y pasos explicados en español.
- Rutinas por días, con tus propios ejercicios, series y descansos.
- Entrenamientos en vivo: marcás cada serie, con temporizador de descanso y calculadora de discos.
- Varias personas en la misma app, cada una con lo suyo, y entrenamientos en grupo.
- Historial, récords, gráficos de volumen y medidas corporales.
- Funciona también desde el celular, con el wifi de tu casa.

## Requisitos

- Windows (el acceso directo es solo para Windows; el resto funciona en cualquier sistema).
- [Node.js](https://nodejs.org) 22.19 o más nuevo.

## Instalación

```bash
npm install
npm run importar   # descarga el catálogo y las fotos (una sola vez, necesita internet)
npm run build      # compila la interfaz
```

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

Crea el ícono **Mi Gym** en tu Escritorio. Al abrirlo levanta el servidor sin dejar ninguna consola abierta (si hace falta, compila la interfaz antes) y abre la app en tu navegador. Si movés la carpeta del proyecto, corré el comando de nuevo. Para quitarlo: `npm run acceso-directo -- --quitar`. El registro del servidor queda en `data/server.log`.

## Personas y entrenar en grupo

Mi Gym sirve para toda la casa. Cada **persona** tiene lo suyo, separado como los perfiles de una app de series:

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

## Créditos y licencias

- Catálogo de ejercicios: [free-exercise-db](https://github.com/yuhonas/free-exercise-db), de dominio público. Los nombres y pasos en español son una traducción propia.
- Inspirado en [doubtcrack/Fitness](https://github.com/doubtcrack/Fitness) (licencia MIT).
- Mi Gym se distribuye bajo licencia MIT.
