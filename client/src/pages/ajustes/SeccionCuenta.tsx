import { useEffect, useState } from 'react'
import { LogOut, RefreshCw, Trash2 } from 'lucide-react'
import { ErrorApi } from '../../api/cliente'
import {
  haceCuanto, useAceptarConsentimiento, useBorrarCuenta, useCuenta, useEnviarCodigo, useSalir, useSincronizar, useUnificar,
  useVerificarCodigo, useVincular, useVinculo, type Duplicada, type EstadoCuenta, type ModoVinculo,
} from '../../api/cuenta'
import { ConfirmarDialogo } from '../../components/ConfirmarDialogo'

const ESPERA_GOOGLE_MS = 2 * 60 * 1000
const SONDEO_GOOGLE_MS = 3000

/** Ajustes → Cuenta: opcional. Sin cuenta la app funciona igual; la sincronización es solo para el plan Pro. */
export function SeccionCuenta() {
  const [esperandoGoogle, setEsperandoGoogle] = useState(false)
  const cuenta = useCuenta(esperandoGoogle ? SONDEO_GOOGLE_MS : false)
  const estado = cuenta.data

  // Después de abrir Google se consulta cada pocos segundos; se corta cuando aparece la sesión o a los 2 minutos.
  useEffect(() => {
    if (!esperandoGoogle) return
    if (estado?.sesion) { setEsperandoGoogle(false); return }
    const t = setTimeout(() => setEsperandoGoogle(false), ESPERA_GOOGLE_MS)
    return () => clearTimeout(t)
  }, [esperandoGoogle, estado?.sesion])

  if (!estado || !estado.habilitada) return null
  return (
    <section className="tarjeta bloque" aria-labelledby="aj-cuenta">
      <h2 id="aj-cuenta" className="bloque__titulo">Cuenta</h2>
      <p className="bloque__ayuda">Es opcional. Rumbo Fit funciona igual sin cuenta; con el plan Pro podés tener tus datos al día en todos tus equipos.</p>
      {estado.sesion
        ? <ConSesion estado={estado} sesion={estado.sesion} />
        : <SinSesion error={estado.error} google={estado.google} esperandoGoogle={esperandoGoogle} onGoogle={() => { window.open('/api/cuenta/google', '_blank'); setEsperandoGoogle(true) }} />}
    </section>
  )
}

function SinSesion({ error: errorServidor, google, esperandoGoogle, onGoogle }: { error: string | null; google: boolean; esperandoGoogle: boolean; onGoogle: () => void }) {
  const enviarCodigo = useEnviarCodigo()
  const verificar = useVerificarCodigo()
  const [email, setEmail] = useState('')
  const [codigo, setCodigo] = useState('')
  const [codigoEnviado, setCodigoEnviado] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const alFallar = (e: Error) => setError(e.message)

  return (
    <>
      <h3 className="grupo__titulo">Iniciar sesión</h3>
      <form
        className="bloque"
        onSubmit={ev => {
          ev.preventDefault()
          setError(null)
          if (!codigoEnviado) enviarCodigo.mutate(email.trim(), { onSuccess: () => setCodigoEnviado(true), onError: alFallar })
          else verificar.mutate({ email: email.trim(), codigo: codigo.trim() }, { onError: alFallar })
        }}
      >
        <label className="campo">
          <span className="campo__etiqueta">Tu mail</span>
          <input className="control" type="email" autoComplete="email" value={email} disabled={codigoEnviado} onChange={e => setEmail(e.target.value)} required />
        </label>
        {codigoEnviado && (
          <>
            <p className="bloque__ayuda">Te mandamos un código a {email.trim()}. Escribilo acá (puede tardar un minuto).</p>
            <label className="campo">
              <span className="campo__etiqueta">Código</span>
              <input className="control" inputMode="numeric" autoComplete="one-time-code" pattern="[0-9]{6,10}" maxLength={10} value={codigo} onChange={e => setCodigo(e.target.value)} required />
            </label>
          </>
        )}
        <div className="acciones">
          <button type="submit" className="boton boton--principal" disabled={enviarCodigo.isPending || verificar.isPending}>
            {codigoEnviado ? 'Verificar' : 'Enviar código'}
          </button>
          {codigoEnviado && (
            <button type="button" className="boton boton--texto" onClick={() => { setCodigoEnviado(false); setCodigo(''); setError(null) }}>Cambiar mail</button>
          )}
        </div>
      </form>
      {google && (
        <div className="acciones">
          <button type="button" className="boton boton--secundario" onClick={onGoogle}>Continuar con Google</button>
        </div>
      )}
      {esperandoGoogle && <p className="aviso" role="status">Esperando que termines en la otra ventana…</p>}
      {(error ?? errorServidor) && <p className="aviso aviso--error" role="alert">{error ?? errorServidor}</p>}
    </>
  )
}

function ConSesion({ estado, sesion }: { estado: EstadoCuenta; sesion: NonNullable<EstadoCuenta['sesion']> }) {
  const salir = useSalir()
  const borrar = useBorrarCuenta()
  const [aBorrar, setABorrar] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [duplicadas, setDuplicadas] = useState<Duplicada[]>([])
  const alFallar = (e: Error) => setError(e.message)

  const pro = sesion.plan === 'pro'
  const listo = pro && sesion.consentimiento === true
  return (
    <>
      <p className="bloque__ayuda">{sesion.email ? <>Sesión iniciada como <strong>{sesion.email}</strong></> : 'Sesión iniciada en la cuenta de la PC.'}</p>
      {estado.error && <p className="aviso aviso--error" role="alert">{estado.error}</p>}
      {sesion.plan === 'gratis' && <p className="aviso">Sincronización disponible con el plan Pro</p>}
      {pro && sesion.consentimiento === false && <Consentimiento onError={alFallar} />}
      {listo && (estado.vinculado
        ? <Sincronizacion estado={estado} onError={alFallar} />
        : <Vincular onError={alFallar} onDuplicadas={setDuplicadas} />)}
      {duplicadas.length > 0 && <Unificar duplicadas={duplicadas} onQuitar={d => setDuplicadas(p => p.filter(x => x !== d))} onError={alFallar} />}
      {error && <p className="aviso aviso--error" role="alert">{error}</p>}
      <div className="acciones">
        <button type="button" className="boton boton--secundario" disabled={salir.isPending} onClick={() => { setError(null); salir.mutate(undefined, { onError: alFallar }) }}>
          <LogOut size={18} aria-hidden /> Cerrar sesión
        </button>
        <button type="button" className="boton boton--peligro" onClick={() => { setError(null); setABorrar(true) }}>
          <Trash2 size={18} aria-hidden /> Borrar cuenta
        </button>
      </div>
      {aBorrar && (
        <ConfirmarDialogo
          titulo="¿Borrar tu cuenta?"
          mensaje="Se borran tu cuenta y tus datos de la nube. No se puede deshacer. Los datos de este equipo quedan."
          confirmar="Borrar cuenta"
          ocupado={borrar.isPending}
          onCancelar={() => setABorrar(false)}
          onConfirmar={() => borrar.mutate(undefined, {
            onSettled: () => setABorrar(false),
            onError: e => setError(e instanceof ErrorApi && e.codigo === 'sin_red'
              ? 'No pudimos confirmar el borrado. Revisá tu conexión y fijate en un rato si tu cuenta sigue.'
              : e.message),
          })}
        />
      )}
    </>
  )
}

function Consentimiento({ onError }: { onError: (e: Error) => void }) {
  const aceptar = useAceptarConsentimiento()
  return (
    <div className="bloque">
      <p className="bloque__ayuda">
        Para sincronizar, tus datos se guardan en la nube: personas, rutinas, entrenamientos, medidas y favoritos. Tu peso y tus medidas corporales son
        datos de salud (datos sensibles según la Ley 25.326 de Protección de Datos Personales) y también se suben. Solo vos podés verlos con tu cuenta.
      </p>
      <p className="bloque__ayuda">Responsable de los datos: Rumbo Fit.</p>
      <p className="bloque__ayuda">Finalidad: sincronizar tus datos entre tus equipos.</p>
      <p className="bloque__ayuda">Tenés derecho a acceder, corregir y borrar tus datos. Podés borrar tu cuenta y todo lo que subiste, cuando quieras, desde esta misma sección.</p>
      <div className="acciones">
        <button type="button" className="boton boton--principal" disabled={aceptar.isPending} onClick={() => aceptar.mutate(undefined, { onError })}>Aceptar</button>
      </div>
    </div>
  )
}

function Sincronizacion({ estado, onError }: { estado: EstadoCuenta; onError: (e: Error) => void }) {
  const sincronizar = useSincronizar()
  return (
    <div className="bloque">
      <p className="bloque__ayuda">{estado.ultimaSincronizacion ? `Última sincronización: ${haceCuanto(estado.ultimaSincronizacion)}` : 'Todavía no se sincronizó.'}</p>
      <div className="acciones">
        <button
          type="button"
          className="boton boton--principal"
          disabled={sincronizar.isPending}
          onClick={() => sincronizar.mutate(undefined, { onError })}
        >
          <RefreshCw size={18} aria-hidden /> Sincronizar ahora
        </button>
      </div>
      {sincronizar.data && !sincronizar.isPending && <ResultadoSincronizacion datos={sincronizar.data} />}
    </div>
  )
}

function ResultadoSincronizacion({ datos }: { datos: NonNullable<ReturnType<typeof useSincronizar>['data']> }) {
  if (datos.error) return <p className="aviso aviso--error" role="alert">{datos.error}</p>
  const r = datos.resultado
  const aviso = r.parcial ? ' Quedó una parte para la próxima vuelta.' : ''
  return <p className="aviso aviso--ok" role="status">Listo: subimos {r.subidos} y bajamos {r.bajados}.{aviso}</p>
}

function Vincular({ onError, onDuplicadas }: { onError: (e: Error) => void; onDuplicadas: (d: Duplicada[]) => void }) {
  const vinculo = useVinculo(true)
  const vincular = useVincular()
  const [confirmar, setConfirmar] = useState<'subir' | 'reemplazar' | null>(null)
  const [forzar, setForzar] = useState<{ modo: 'subir' | 'juntar'; mensaje: string } | null>(null)
  const v = vinculo.data

  function ejecutar(modo: ModoVinculo, forzado = false) {
    setConfirmar(null)
    setForzar(null)
    // mutateAsync: al juntar, la sección se desmonta (ya quedó vinculado) y los callbacks de mutate no llegarían.
    vincular.mutateAsync({ modo, ...(forzado ? { forzar: true } : {}) }).then(
      r => { if (r.duplicadas.length > 0) onDuplicadas(r.duplicadas) },
      (e: Error) => {
        if (e instanceof ErrorApi && e.codigo === 'otra_cuenta' && (modo === 'subir' || modo === 'juntar')) setForzar({ modo, mensaje: e.message })
        else onError(e)
      },
    )
  }

  if (vinculo.isError) return <p className="aviso aviso--error" role="alert">{vinculo.error.message}</p>
  if (!v) return <p className="bloque__ayuda">Revisando tus datos…</p>

  return (
    <div className="bloque">
      {v.estado === 'cuenta_vacia' && (
        <>
          <p className="bloque__ayuda">Tu cuenta todavía no tiene datos. Podés subir los de este equipo.</p>
          <div className="acciones"><button type="button" className="boton boton--principal" disabled={vincular.isPending} onClick={() => setConfirmar('subir')}>Subir mis datos</button></div>
        </>
      )}
      {v.estado === 'equipo_vacio' && (
        <>
          <p className="bloque__ayuda">Este equipo no tiene datos. Podés traer los de tu cuenta.</p>
          <div className="acciones"><button type="button" className="boton boton--principal" disabled={vincular.isPending} onClick={() => ejecutar('bajar')}>Traer mis datos</button></div>
        </>
      )}
      {v.estado === 'ambos_con_datos' && (
        <>
          <p className="bloque__ayuda">¿Juntar los datos de este equipo con los de tu cuenta?</p>
          <div className="acciones">
            <button type="button" className="boton boton--principal" disabled={vincular.isPending} onClick={() => ejecutar('juntar')}>Juntar</button>
            <button type="button" className="boton boton--peligro" disabled={vincular.isPending} onClick={() => setConfirmar('reemplazar')}>Reemplazar</button>
          </div>
        </>
      )}
      {forzar && (
        <div className="aviso aviso--suave" role="alert">
          <p>{forzar.mensaje}</p>
          <p>Si seguís, los datos de este equipo se mezclan con los de esta otra cuenta. Hacelo solo si estás seguro de que querés eso.</p>
          <div className="acciones">
            <button type="button" className="boton boton--peligro" onClick={() => ejecutar(forzar.modo, true)}>{forzar.modo === 'subir' ? 'Subir igual' : 'Juntar igual'}</button>
            <button type="button" className="boton boton--secundario" onClick={() => setForzar(null)}>Cancelar</button>
          </div>
        </div>
      )}
      {confirmar === 'subir' && (
        <ConfirmarDialogo
          titulo="¿Subir los datos de este equipo?"
          mensaje="Se copian tus personas, rutinas, entrenamientos, medidas y favoritos a tu cuenta. Tu peso y tus medidas son datos de salud."
          confirmar="Subir"
          ocupado={vincular.isPending}
          onCancelar={() => setConfirmar(null)}
          onConfirmar={() => ejecutar('subir')}
        />
      )}
      {confirmar === 'reemplazar' && (
        <ConfirmarDialogo
          titulo="¿Reemplazar los datos de este equipo?"
          mensaje="Los datos de este equipo se borran y quedan los de tu cuenta. Antes hacemos un respaldo de lo que tenés acá, pero no se puede deshacer sin restaurarlo."
          confirmar="Reemplazar"
          ocupado={vincular.isPending}
          onCancelar={() => setConfirmar(null)}
          onConfirmar={() => ejecutar('reemplazar')}
        />
      )}
    </div>
  )
}

function Unificar({ duplicadas, onQuitar, onError }: { duplicadas: Duplicada[]; onQuitar: (d: Duplicada) => void; onError: (e: Error) => void }) {
  const unificar = useUnificar()
  return (
    <div className="bloque">
      <p className="bloque__ayuda">Estas parecen estar repetidas. ¿Querés dejar una sola?</p>
      <ul className="lista-personas">
        {duplicadas.map(d => (
          <li key={`${d.conservar}-${d.duplicada}`} className="persona-fila">
            <span className="persona-fila__nombre">{d.nombre}</span>
            <button type="button" className="boton boton--secundario" aria-label={`Unificar ${d.nombre}`} disabled={unificar.isPending} onClick={() => unificar.mutate({ conservar: d.conservar, duplicada: d.duplicada }, { onSuccess: () => onQuitar(d), onError })}>Unificar</button>
            <button type="button" className="boton boton--texto" aria-label={`Dejar así ${d.nombre}`} onClick={() => onQuitar(d)}>Dejar así</button>
          </li>
        ))}
      </ul>
    </div>
  )
}
