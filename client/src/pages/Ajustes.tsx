import { useRef, useState } from 'react'
import { Download, RotateCcw, Save, Upload } from 'lucide-react'
import { useImportar, useInfo, useRespaldoAhora, useRespaldos, useRestaurar, type Respaldo } from '../api/ajustes'
import { ConfirmarDialogo } from '../components/ConfirmarDialogo'

function fechaHora(iso: string) {
  return new Date(iso).toLocaleString('es-AR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' })
}

function tamano(bytes: number) {
  return bytes >= 1024 * 1024 ? `${(bytes / 1024 / 1024).toFixed(1)} MB` : `${Math.max(1, Math.round(bytes / 1024))} KB`
}

export function Ajustes() {
  const info = useInfo()
  const respaldos = useRespaldos()
  const ahora = useRespaldoAhora()
  const restaurar = useRestaurar()
  const importar = useImportar()
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
  return (
    <div className="pagina">
      <h1>Ajustes</h1>
      {mensaje && <p className={mensaje.tipo === 'ok' ? 'aviso aviso--ok' : 'aviso aviso--error'} role={mensaje.tipo === 'ok' ? 'status' : 'alert'}>{mensaje.texto}</p>}

      <section className="tarjeta bloque" aria-labelledby="aj-datos">
        <h2 id="aj-datos" className="bloque__titulo">Tus datos</h2>
        <p className="bloque__ayuda">Todo se guarda en esta PC, en un solo archivo. No sale a internet.</p>
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
        <p className="bloque__ayuda">Se hace uno solo cada día al abrir la app y se conservan los últimos 30.</p>
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
        <h2 id="aj-export" className="bloque__titulo">Exportar / importar</h2>
        <p className="bloque__ayuda">Un archivo con tus rutinas, entrenamientos, medidas y favoritos. Sirve para llevarlos a otra PC o guardarlos en la nube.</p>
        <div className="acciones">
          <a className="boton boton--secundario" href="/api/respaldo/exportar" download><Download size={18} aria-hidden /> Exportar mis datos</a>
          <button type="button" className="boton boton--secundario" onClick={() => archivoRef.current?.click()}><Upload size={18} aria-hidden /> Importar desde un archivo</button>
          <input ref={archivoRef} type="file" accept="application/json,.json" hidden aria-label="Archivo para importar" onChange={elegirArchivo} />
        </div>
      </section>

      <section className="tarjeta bloque" aria-labelledby="aj-celu">
        <h2 id="aj-celu" className="bloque__titulo">Abrir en el celular</h2>
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

      <section className="tarjeta bloque" aria-labelledby="aj-acerca">
        <h2 id="aj-acerca" className="bloque__titulo">Acerca de</h2>
        <p className="bloque__ayuda">Mi Gym {i ? `versión ${i.version}` : ''}</p>
        <p className="bloque__ayuda">Catálogo de ejercicios: free-exercise-db, de dominio público. Inspirado en doubtcrack/Fitness (licencia MIT).</p>
      </section>

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
          mensaje="Tus rutinas, entrenamientos, medidas y favoritos actuales se reemplazan por los del archivo. Antes guardamos un respaldo de lo que tenés ahora."
          confirmar="Importar"
          ocupado={importar.isPending}
          onConfirmar={() => importar.mutate(aImportar, resultado('Datos importados.'))}
          onCancelar={() => setAImportar(null)}
        />
      )}
    </div>
  )
}
