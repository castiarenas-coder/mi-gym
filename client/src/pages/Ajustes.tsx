import { useRef, useState } from 'react'
import { ACENTOS, aplicarApariencia, guardarApariencia, leerApariencia, prefiereOscuro, temaEfectivo, type Apariencia, type Tema } from '../lib/apariencia'
import { Copy, Download, Heart, Pencil, Plus, Power, RotateCcw, Save, Trash2, Upload } from 'lucide-react'
import { useBorrarPersona, useCrearPersona, useEditarPersona, type Persona } from '../api/personas'
import { usePersonaActiva } from '../app/PersonaContext'
import { AvatarPersona } from '../components/AvatarPersona'
import { FormularioPersona } from '../components/FormularioPersona'
import { useActualizacion, useApagar, useImportar, useInfo, useRespaldoAhora, useRespaldos, useRestaurar, type Respaldo } from '../api/ajustes'
import { CabeceraPagina } from '../components/ui/CabeceraPagina'
import { ConfirmarDialogo } from '../components/ConfirmarDialogo'

function fechaHora(iso: string) {
  return new Date(iso).toLocaleString('es-AR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' })
}

function tamano(bytes: number) {
  return bytes >= 1024 * 1024 ? `${(bytes / 1024 / 1024).toFixed(1)} MB` : `${Math.max(1, Math.round(bytes / 1024))} KB`
}

export const ALIAS_MP = 'gabycasti822.mp'
export const PAYPAL_URL = 'https://www.paypal.com/donate/?hosted_button_id=6G237RH4W2GRQ'

/** Donaciones voluntarias: alias de Mercado Pago para copiar y botón de PayPal. */
function SeccionDonaciones() {
  const [copiado, setCopiado] = useState(false)
  async function copiar() {
    try {
      await navigator.clipboard.writeText(ALIAS_MP)
      setCopiado(true)
      setTimeout(() => setCopiado(false), 2500)
    } catch { /* sin portapapeles: el alias queda visible para copiarlo a mano */ }
  }
  return (
    <section className="tarjeta bloque" aria-labelledby="aj-donar">
      <h2 id="aj-donar" className="bloque__titulo">Donaciones</h2>
      <p className="bloque__ayuda">Mi Gym es gratis y de código abierto. Si te sirve y querés apoyar el proyecto, podés donar lo que quieras.</p>
      <p className="bloque__ayuda">Mercado Pago (alias): <strong style={{ userSelect: 'all' }}>{ALIAS_MP}</strong></p>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem' }}>
        <button type="button" className="boton boton--secundario" onClick={copiar}>
          <Copy size={18} aria-hidden="true" /> Copiar alias
        </button>
        <a className="boton boton--principal" href={PAYPAL_URL} target="_blank" rel="noopener noreferrer">
          <Heart size={18} aria-hidden="true" /> Donar con PayPal
        </a>
      </div>
      {copiado && <p className="bloque__ayuda" role="status">Alias copiado</p>}
    </section>
  )
}

const TEMAS: { id: Tema; nombre: string }[] = [
  { id: 'sistema', nombre: 'Sistema' },
  { id: 'oscuro', nombre: 'Oscuro' },
  { id: 'claro', nombre: 'Claro' },
]

/** Tema y color de acento: se guardan en este dispositivo y valen para todas las personas. */
function SeccionApariencia() {
  const [apariencia, setApariencia] = useState<Apariencia>(() => leerApariencia())
  function cambiar(cambio: Partial<Apariencia>) {
    const nueva = { ...apariencia, ...cambio }
    setApariencia(nueva)
    guardarApariencia(nueva)
    aplicarApariencia(nueva)
  }
  const claro = temaEfectivo(apariencia.tema, prefiereOscuro()) === 'claro'
  return (
    <section className="tarjeta bloque" aria-labelledby="aj-apariencia">
      <h2 id="aj-apariencia" className="bloque__titulo">Apariencia</h2>
      <p className="bloque__ayuda">Se guarda en este dispositivo y vale para todas las personas.</p>
      <div className="apariencia__opciones" role="radiogroup" aria-label="Tema">
        {TEMAS.map(t => (
          <label key={t.id} className="apariencia__opcion">
            <input type="radio" name="tema" checked={apariencia.tema === t.id} onChange={() => cambiar({ tema: t.id })} aria-label={t.nombre} />
            <span>{t.nombre}</span>
          </label>
        ))}
      </div>
      <div className="apariencia__opciones" role="radiogroup" aria-label="Color de acento">
        {ACENTOS.map(a => (
          <label key={a.id} className="apariencia__opcion">
            <input type="radio" name="acento" checked={apariencia.acento === a.id} onChange={() => cambiar({ acento: a.id })} aria-label={`Acento ${a.nombre}`} />
            <span className="apariencia__muestra" style={{ background: claro ? a.colorClaro : a.color }} aria-hidden="true" />
            <span>{a.nombre}</span>
          </label>
        ))}
      </div>
    </section>
  )
}

/** Alta, edición y baja de personas: cada una tiene sus rutinas, entrenamientos, medidas y favoritos. */
function SeccionPersonas() {
  const { personas } = usePersonaActiva()
  const crear = useCrearPersona()
  const editar = useEditarPersona()
  const borrar = useBorrarPersona()
  const [formulario, setFormulario] = useState<'nueva' | Persona | null>(null)
  const [aBorrar, setABorrar] = useState<Persona | null>(null)
  const cerrar = () => setFormulario(null)

  return (
    <section className="tarjeta bloque" aria-labelledby="aj-personas">
      <h2 id="aj-personas" className="bloque__titulo">Personas</h2>
      <p className="bloque__ayuda">Cada persona tiene sus propias rutinas, entrenamientos, medidas y favoritos. Cuando entrenan juntos, la sesión cuenta para el progreso de cada una.</p>
      <ul className="lista-personas">
        {personas.map(p => (
          <li key={p.id} className="persona-fila">
            <AvatarPersona persona={p} />
            <span className="persona-fila__nombre">{p.nombre}</span>
            <button type="button" className="icono-boton" aria-label={`Editar ${p.nombre}`} onClick={() => { crear.reset(); editar.reset(); setFormulario(p) }}><Pencil size={18} aria-hidden /></button>
            <button type="button" className="icono-boton icono-boton--peligro" aria-label={`Borrar ${p.nombre}`} disabled={personas.length <= 1} onClick={() => setABorrar(p)}><Trash2 size={18} aria-hidden /></button>
          </li>
        ))}
      </ul>
      {personas.length <= 1 && <p className="bloque__ayuda">Tiene que quedar al menos una persona.</p>}
      <button type="button" className="boton boton--secundario" onClick={() => { crear.reset(); setFormulario('nueva') }}><Plus size={18} aria-hidden /> Agregar persona</button>

      {formulario && (
        <div className="modal modal--centro" onClick={ev => { if (ev.target === ev.currentTarget) cerrar() }}>
          <div className="modal__caja" role="dialog" aria-modal="true" aria-label={formulario === 'nueva' ? 'Nueva persona' : 'Editar persona'}>
            <FormularioPersona
              persona={formulario === 'nueva' ? undefined : formulario}
              ocupado={crear.isPending || editar.isPending}
              error={(formulario === 'nueva' ? crear.error : editar.error)?.message}
              onCancelar={cerrar}
              onGuardar={datos => formulario === 'nueva'
                ? crear.mutate(datos, { onSuccess: cerrar })
                : editar.mutate({ id: formulario.id, ...datos }, { onSuccess: cerrar })}
            />
          </div>
        </div>
      )}
      {aBorrar && (
        <ConfirmarDialogo
          titulo={`¿Borrar a ${aBorrar.nombre}?`}
          mensaje={`Se borran todas las rutinas, entrenamientos, medidas y favoritos de ${aBorrar.nombre}. No se puede deshacer. Antes conviene exportar tus datos (más abajo, en Exportar / importar).`}
          confirmar="Borrar"
          ocupado={borrar.isPending}
          onCancelar={() => setABorrar(null)}
          onConfirmar={() => borrar.mutate(aBorrar.id, { onSettled: () => setABorrar(null) })}
        />
      )}
    </section>
  )
}

export function Ajustes() {
  const info = useInfo()
  const respaldos = useRespaldos()
  const ahora = useRespaldoAhora()
  const restaurar = useRestaurar()
  const importar = useImportar()
  const actualizacion = useActualizacion()
  const apagar = useApagar()
  const [aCerrar, setACerrar] = useState(false)
  const [cerrada, setCerrada] = useState(false)
  const [aRestaurar, setARestaurar] = useState<Respaldo | null>(null)
  const [aImportar, setAImportar] = useState<unknown>(null)
  const [mensaje, setMensaje] = useState<{ tipo: 'ok' | 'error'; texto: string } | null>(null)
  const archivoRef = useRef<HTMLInputElement>(null)

  async function elegirArchivo(ev: React.ChangeEvent<HTMLInputElement>) {
    const archivo = ev.target.files?.[0]
    ev.target.value = ''
    if (!archivo) return
    try {
      const datos = JSON.parse(await archivo.text())
      if (datos?.app !== 'mi-gym') throw new Error('formato')
      setAImportar(datos)
    } catch {
      setMensaje({ tipo: 'error', texto: 'Ese archivo no es un respaldo de Mi Gym.' })
    }
  }

  const resultado = (texto: string) => ({
    onSuccess: () => setMensaje({ tipo: 'ok', texto }),
    onError: (err: Error) => setMensaje({ tipo: 'error', texto: err.message }),
    onSettled: () => { setARestaurar(null); setAImportar(null) },
  })

  const i = info.data
  const enAndroid = i?.plataforma === 'android'
  return (
    <div className="pagina">
      <CabeceraPagina titulo="Ajustes" />
      {mensaje && <p className={mensaje.tipo === 'ok' ? 'aviso aviso--ok' : 'aviso aviso--error'} role={mensaje.tipo === 'ok' ? 'status' : 'alert'}>{mensaje.texto}</p>}

      <SeccionApariencia />

      <SeccionPersonas />

      <h2 className="grupo__titulo">Respaldo</h2>
      <section className="tarjeta bloque" aria-labelledby="aj-datos">
        <h3 id="aj-datos" className="bloque__titulo">Tus datos</h3>
        <p className="bloque__ayuda">Todo se guarda en {enAndroid ? 'este celular' : 'esta PC'}, en un solo archivo. No sale a internet.</p>
        {i && (
          <dl className="datos">
            <dt>Ubicación</dt><dd className="datos__ruta">{i.db ?? 'No disponible'}</dd>
            <dt>Respaldos en</dt><dd className="datos__ruta">{i.respaldos_dir ?? 'No disponible'}</dd>
            <dt>Último respaldo</dt><dd>{i.ultimo_respaldo ? fechaHora(i.ultimo_respaldo) : 'Todavía no hay'}</dd>
          </dl>
        )}
        <button type="button" className="boton boton--principal" disabled={ahora.isPending} onClick={() => ahora.mutate(undefined, resultado('Respaldo guardado.'))}>
          <Save size={18} aria-hidden /> Hacer backup ahora
        </button>
        <p className="bloque__ayuda">Se hace uno solo al abrir la app y cada 24 horas; se conservan los últimos 30.</p>
        {respaldos.isSuccess && respaldos.data.length === 0 && <p className="aviso">Todavía no hay respaldos.</p>}
        {respaldos.isSuccess && respaldos.data.length > 0 && (
          <ul className="respaldos" aria-label="Respaldos">
            {respaldos.data.map(r => (
              <li key={r.archivo} className="respaldos__item">
                <span className="respaldos__texto"><strong>{fechaHora(r.fecha)}</strong><span>{r.archivo} · {tamano(r.tamano)}</span></span>
                <button type="button" className="boton boton--secundario" onClick={() => setARestaurar(r)} aria-label={`Restaurar ${r.archivo}`}>
                  <RotateCcw size={16} aria-hidden /> Restaurar
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="tarjeta bloque" aria-labelledby="aj-export">
        <h3 id="aj-export" className="bloque__titulo">Exportar / importar</h3>
        <p className="bloque__ayuda">Un archivo con las personas y sus rutinas, entrenamientos, medidas y favoritos. {enAndroid ? 'Sirve para llevarlos a otro celular o guardarlos en la nube. Si desinstalás Mi Gym, los datos del celular se borran: guardá un archivo antes.' : 'Sirve para llevarlos a otra PC o guardarlos en la nube.'}</p>
        <div className="acciones">
          <a className="boton boton--secundario" href="/api/respaldo/exportar" download><Download size={18} aria-hidden /> Exportar mis datos</a>
          <button type="button" className="boton boton--secundario" onClick={() => archivoRef.current?.click()}><Upload size={18} aria-hidden /> Importar desde un archivo</button>
          <input ref={archivoRef} type="file" accept="application/json,.json" hidden aria-label="Archivo para importar" onChange={elegirArchivo} />
        </div>
      </section>

      {!enAndroid && (
        <section className="tarjeta bloque" aria-labelledby="aj-celu">
          <h3 id="aj-celu" className="bloque__titulo">Abrir en el celular</h3>
          {i?.lan ? (
            i.urls.length > 0 ? (
              <>
                <p className="bloque__ayuda">Con el celular conectado al mismo wifi, escaneá el código o escribí la dirección.</p>
                {i.qr && <div className="qr" role="img" aria-label="Código QR para abrir en el celular" dangerouslySetInnerHTML={{ __html: i.qr }} />}
                <ul className="direcciones">{i.urls.map(u => <li key={u}><code>{u}</code></li>)}</ul>
              </>
            ) : <p className="aviso">No encontramos una red a la que conectar el celular.</p>
          ) : (
            <p className="bloque__ayuda">Ahora la app solo se abre en esta PC. Para usarla desde el celular, cerrala y arrancá con <code>npm run lan</code>; acá van a aparecer la dirección y un código QR.</p>
          )}
        </section>
      )}

      <section className="tarjeta bloque" aria-labelledby="aj-acerca">
        <h2 id="aj-acerca" className="bloque__titulo">Acerca de</h2>
        <p className="bloque__ayuda">Mi Gym {i ? `versión ${i.version}` : ''}</p>
        {actualizacion.data?.hay_nueva && (
          <p className="aviso" role="status">
            Hay una versión nueva: v{actualizacion.data.ultima} —{' '}
            <a href={actualizacion.data.url ?? 'https://github.com/castiarenas-coder/mi-gym/releases/latest'} target="_blank" rel="noopener noreferrer">Descargar</a>
          </p>
        )}
        <p className="bloque__ayuda">Catálogo de ejercicios: free-exercise-db, de dominio público. Inspirado en doubtcrack/Fitness (licencia MIT).</p>
        {i?.apagable && !enAndroid && (
          cerrada ? <p className="aviso" role="status">Mi Gym se cerró. Ya podés cerrar esta ventana.</p> : (
            <>
              <button type="button" className="boton boton--secundario" onClick={() => setACerrar(true)}><Power size={18} aria-hidden /> Cerrar Mi Gym</button>
              <p className="bloque__ayuda">Apaga Mi Gym por completo. Para volver a usarlo, abrilo de nuevo desde su acceso directo.</p>
            </>
          )
        )}
      </section>

      <SeccionDonaciones />

      {aCerrar && (
        <ConfirmarDialogo
          titulo="¿Cerrar Mi Gym?"
          mensaje="Se apaga la app. Tus datos quedan guardados; para volver a usarla, abrila desde el acceso directo."
          confirmar="Cerrar"
          ocupado={apagar.isPending}
          onConfirmar={() => apagar.mutate(undefined, { onSuccess: () => { setACerrar(false); setCerrada(true) }, onError: () => setACerrar(false) })}
          onCancelar={() => setACerrar(false)}
        />
      )}
      {aRestaurar && (
        <ConfirmarDialogo
          titulo="¿Restaurar este respaldo?"
          mensaje={`Tus datos van a volver al estado del ${fechaHora(aRestaurar.fecha)}. Antes de hacerlo guardamos un respaldo de lo que tenés ahora, así que no perdés nada.`}
          confirmar="Restaurar"
          ocupado={restaurar.isPending}
          onConfirmar={() => restaurar.mutate(aRestaurar.archivo, resultado('Respaldo restaurado.'))}
          onCancelar={() => setARestaurar(null)}
        />
      )}
      {aImportar !== null && (
        <ConfirmarDialogo
          titulo="¿Importar este archivo?"
          mensaje="Las personas, rutinas, entrenamientos, medidas y favoritos actuales se reemplazan por los del archivo. Antes guardamos un respaldo de lo que tenés ahora."
          confirmar="Importar"
          ocupado={importar.isPending}
          onConfirmar={() => importar.mutate(aImportar, resultado('Datos importados.'))}
          onCancelar={() => setAImportar(null)}
        />
      )}
    </div>
  )
}
