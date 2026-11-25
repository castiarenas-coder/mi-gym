import { useState, type FormEvent } from 'react'
import { Trash2 } from 'lucide-react'
import { useBorrarMedida, useGuardarMedida, useMedidas } from '../../api/progreso'
import type { Medida } from '../../api/tipos'
import { ConfirmarDialogo } from '../../components/ConfirmarDialogo'
import { GraficoLinea } from '../../components/GraficoLinea'
import { fechaCorta, hoyLocal, kg } from '../../lib/formato'

type Campo = 'peso_kg' | 'cintura' | 'pecho' | 'brazo' | 'pierna' | 'grasa_pct'

const CAMPOS: { campo: Campo; etiqueta: string; unidad: string; titulo: string }[] = [
  { campo: 'peso_kg', etiqueta: 'Peso', unidad: 'kg', titulo: 'Peso corporal' },
  { campo: 'cintura', etiqueta: 'Cintura', unidad: 'cm', titulo: 'Cintura' },
  { campo: 'pecho', etiqueta: 'Pecho', unidad: 'cm', titulo: 'Pecho' },
  { campo: 'brazo', etiqueta: 'Brazo', unidad: 'cm', titulo: 'Brazo' },
  { campo: 'pierna', etiqueta: 'Pierna', unidad: 'cm', titulo: 'Pierna' },
  { campo: 'grasa_pct', etiqueta: 'Grasa corporal', unidad: '%', titulo: 'Grasa corporal' },
]

const aNumero = (t: string): number | null => {
  const n = Number(t.trim().replace(',', '.'))
  return t.trim() !== '' && Number.isFinite(n) ? n : null
}

export function TabMedidas() {
  const medidas = useMedidas()
  const guardar = useGuardarMedida()
  const borrar = useBorrarMedida()
  const [fecha, setFecha] = useState(hoyLocal)
  const [valores, setValores] = useState<Record<Campo, string>>({ peso_kg: '', cintura: '', pecho: '', brazo: '', pierna: '', grasa_pct: '' })
  const [campo, setCampo] = useState<Campo>('peso_kg')
  const [mensaje, setMensaje] = useState<{ tipo: 'ok' | 'error'; texto: string } | null>(null)
  const [aBorrar, setABorrar] = useState<Medida | null>(null)

  const vacio = CAMPOS.every(c => aNumero(valores[c.campo]) === null)

  const alGuardar = (ev: FormEvent) => {
    ev.preventDefault()
    setMensaje(null)
    const cuerpo: Partial<Medida> & { fecha: string } = { fecha }
    for (const c of CAMPOS) { const n = aNumero(valores[c.campo]); if (n !== null) cuerpo[c.campo] = n }
    guardar.mutate(cuerpo, {
      onSuccess: () => {
        setMensaje({ tipo: 'ok', texto: 'Medidas guardadas' })
        setValores({ peso_kg: '', cintura: '', pecho: '', brazo: '', pierna: '', grasa_pct: '' })
      },
      onError: e => setMensaje({ tipo: 'error', texto: e.message }),
    })
  }

  const info = CAMPOS.find(c => c.campo === campo)!
  const lista = medidas.data ?? []
  const puntos = lista.flatMap(m => (m[campo] === null ? [] : [{ fecha: m.fecha, valor: m[campo] as number }]))

  return (
    <>
      <form className="tarjeta formulario-medidas" onSubmit={alGuardar} aria-label="Cargar medidas">
        <h2 className="seccion__titulo">Cargar medidas</h2>
        <label className="campo">
          <span className="campo__etiqueta">Fecha</span>
          <input type="date" className="control" value={fecha} max={hoyLocal()} onChange={e => setFecha(e.target.value)} required />
        </label>
        <div className="grilla-campos">
          {CAMPOS.map(c => (
            <label key={c.campo} className="campo">
              <span className="campo__etiqueta">{c.etiqueta} ({c.unidad})</span>
              <input
                className="control"
                inputMode="decimal"
                autoComplete="off"
                value={valores[c.campo]}
                onChange={e => setValores(v => ({ ...v, [c.campo]: e.target.value }))}
              />
            </label>
          ))}
        </div>
        <p className="bloque__ayuda">Cargá solo lo que mediste. Si ya hay medidas de ese día, se completan o se actualizan.</p>
        {mensaje && <p className={`aviso ${mensaje.tipo === 'ok' ? 'aviso--ok' : 'aviso--error'}`} role={mensaje.tipo === 'ok' ? 'status' : 'alert'}>{mensaje.texto}</p>}
        <button type="submit" className="boton boton--principal" disabled={vacio || guardar.isPending}>Guardar medidas</button>
      </form>

      <section className="tarjeta" aria-labelledby="tit-evolucion">
        <h2 id="tit-evolucion" className="seccion__titulo">Evolución</h2>
        <div className="chips" role="group" aria-label="Medida a graficar">
          {CAMPOS.map(c => (
            <button key={c.campo} type="button" className={`chip${campo === c.campo ? ' chip--activo' : ''}`} aria-pressed={campo === c.campo} onClick={() => setCampo(c.campo)}>{c.etiqueta}</button>
          ))}
        </div>
        {medidas.isPending ? <p className="aviso">Cargando…</p> : (
          <GraficoLinea titulo={info.titulo} puntos={puntos} unidad={info.unidad} vacio={`Cargá al menos 2 mediciones de ${info.etiqueta.toLowerCase()} para ver cómo evoluciona.`} />
        )}
      </section>

      <section className="tarjeta" aria-labelledby="tit-tabla">
        <h2 id="tit-tabla" className="seccion__titulo">Historial de medidas</h2>
        {medidas.isSuccess && lista.length === 0 && <p className="aviso">Todavía no cargaste medidas.</p>}
        {lista.length > 0 && (
          <div className="tabla-scroll">
            <table className="tabla" aria-label="Medidas guardadas">
              <thead>
                <tr>
                  <th scope="col">Fecha</th>
                  {CAMPOS.map(c => <th key={c.campo} scope="col">{c.etiqueta}</th>)}
                  <th scope="col"><span className="oculto">Acciones</span></th>
                </tr>
              </thead>
              <tbody>
                {[...lista].reverse().map(m => (
                  <tr key={m.fecha}>
                    <th scope="row">{fechaCorta(m.fecha)}</th>
                    {CAMPOS.map(c => <td key={c.campo}>{m[c.campo] === null ? '–' : kg(m[c.campo])}</td>)}
                    <td>
                      <button type="button" className="icono-boton icono-boton--peligro" aria-label={`Eliminar medida del ${fechaCorta(m.fecha)}`} onClick={() => setABorrar(m)}>
                        <Trash2 size={18} aria-hidden />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {aBorrar && (
        <ConfirmarDialogo
          titulo="¿Eliminar estas medidas?"
          mensaje={`Se borran las medidas del ${fechaCorta(aBorrar.fecha)}. No se puede deshacer.`}
          ocupado={borrar.isPending}
          onCancelar={() => setABorrar(null)}
          onConfirmar={() => borrar.mutate(aBorrar.fecha, { onSettled: () => setABorrar(null) })}
        />
      )}
    </>
  )
}
