import { useState, type FocusEvent, type FormEvent } from 'react'
import { Link, useParams } from 'react-router-dom'
import { ArrowDown, ArrowLeft, ArrowUp, Plus, Trash2, X } from 'lucide-react'
import {
  useAgregarDia, useBorrarDia, useEditarItem, useEditarRutina, useOrdenarDias, useOrdenarItems,
  useQuitarItem, useRenombrarDia, useRutina,
} from '../api/rutinas'
import type { DiaRutina, ItemRutina, RutinaDetalle } from '../api/tipos'
import { AnimacionEjercicio } from '../components/AnimacionEjercicio'
import { BuscadorEjercicios } from '../components/BuscadorEjercicios'
import { ConfirmarDialogo } from '../components/ConfirmarDialogo'

function mover<T>(lista: T[], desde: number, hacia: number): T[] {
  const copia = [...lista]
  const [x] = copia.splice(desde, 1)
  copia.splice(hacia, 0, x)
  return copia
}

/** Campo que se guarda al salir de él, solo si cambió y es válido. */
function enBlur(actual: string, guardar: (valor: string) => boolean | void) {
  return (ev: FocusEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    const valor = ev.target.value.trim()
    if (valor === actual) return
    if (guardar(valor) === false) ev.target.value = actual
  }
}

function FilaEjercicio({ rutina, dia, item, indice, total }: { rutina: RutinaDetalle; dia: DiaRutina; item: ItemRutina; indice: number; total: number }) {
  const editar = useEditarItem()
  const quitar = useQuitarItem()
  const ordenar = useOrdenarItems()
  const base = { rutina: rutina.id, dia: dia.id, item: item.id }
  const ids = dia.ejercicios.map(e => e.id)
  const entero = (valor: string, min: number, max: number) => {
    const n = Number(valor)
    return valor !== '' && Number.isInteger(n) && n >= min && n <= max ? n : null
  }

  return (
    <li className="fila-ej">
      <div className="fila-ej__cabecera">
        <AnimacionEjercicio ejercicio={{ nombre: item.nombre, img_ini: item.img_ini, img_fin: null, media_propia: item.media_propia }} miniatura className="miniatura" />
        <div className="fila-ej__titulo">
          <Link to={`/ejercicios/${encodeURIComponent(item.ejercicio_id)}`} className="fila-ej__nombre">{item.nombre}</Link>
          <span className="fila-ej__meta">{[item.musculo_principal, item.equipo].filter(Boolean).join(' · ')}</span>
        </div>
        <div className="fila-ej__botones">
          <button type="button" className="icono-boton" aria-label={`Subir ${item.nombre}`} disabled={indice === 0 || ordenar.isPending}
            onClick={() => ordenar.mutate({ rutina: rutina.id, dia: dia.id, ids: mover(ids, indice, indice - 1) })}>
            <ArrowUp size={20} aria-hidden />
          </button>
          <button type="button" className="icono-boton" aria-label={`Bajar ${item.nombre}`} disabled={indice === total - 1 || ordenar.isPending}
            onClick={() => ordenar.mutate({ rutina: rutina.id, dia: dia.id, ids: mover(ids, indice, indice + 1) })}>
            <ArrowDown size={20} aria-hidden />
          </button>
          <button type="button" className="icono-boton icono-boton--peligro" aria-label={`Quitar ${item.nombre}`} disabled={quitar.isPending}
            onClick={() => quitar.mutate(base)}>
            <X size={20} aria-hidden />
          </button>
        </div>
      </div>

      <div className="fila-ej__campos">
        <label className="campo">
          <span className="campo__etiqueta">Series</span>
          <input key={item.series} className="control" type="number" inputMode="numeric" min={1} max={20} defaultValue={item.series}
            aria-label={`Series de ${item.nombre}`}
            onBlur={enBlur(String(item.series), v => { const n = entero(v, 1, 20); if (n === null) return false; editar.mutate({ ...base, series: n }) })} />
        </label>
        <label className="campo">
          <span className="campo__etiqueta">Reps</span>
          <input key={item.reps} className="control" type="text" maxLength={20} defaultValue={item.reps}
            aria-label={`Repeticiones de ${item.nombre}`}
            onBlur={enBlur(item.reps, v => { if (!v) return false; editar.mutate({ ...base, reps: v }) })} />
        </label>
        <label className="campo">
          <span className="campo__etiqueta">Descanso (s)</span>
          <input key={item.descanso_seg} className="control" type="number" inputMode="numeric" min={0} max={1200} step={5} defaultValue={item.descanso_seg}
            aria-label={`Descanso en segundos de ${item.nombre}`}
            onBlur={enBlur(String(item.descanso_seg), v => { const n = entero(v, 0, 1200); if (n === null) return false; editar.mutate({ ...base, descanso_seg: n }) })} />
        </label>
        <label className="campo campo--nota">
          <span className="campo__etiqueta">Nota</span>
          <input key={item.nota ?? ''} className="control" type="text" maxLength={300} defaultValue={item.nota ?? ''} placeholder="Ej.: bajar lento"
            aria-label={`Nota de ${item.nombre}`}
            onBlur={enBlur(item.nota ?? '', v => { editar.mutate({ ...base, nota: v || null }) })} />
        </label>
      </div>
      {(editar.isError || quitar.isError || ordenar.isError) && <p className="aviso aviso--error" role="alert">No se pudo guardar el cambio.</p>}
    </li>
  )
}

function Dia({ rutina, dia, indice }: { rutina: RutinaDetalle; dia: DiaRutina; indice: number }) {
  const renombrar = useRenombrarDia()
  const ordenar = useOrdenarDias()
  const borrar = useBorrarDia()
  const [buscando, setBuscando] = useState(false)
  const [confirmando, setConfirmando] = useState(false)
  const ids = rutina.dias.map(d => d.id)

  return (
    <section className="dia" aria-label={dia.nombre}>
      <div className="dia__cabecera">
        <input key={dia.nombre} className="control dia__nombre" aria-label="Nombre del día" defaultValue={dia.nombre} maxLength={60}
          onBlur={enBlur(dia.nombre, v => { if (!v) return false; renombrar.mutate({ rutina: rutina.id, dia: dia.id, nombre: v }) })} />
        <button type="button" className="icono-boton" aria-label="Subir día" disabled={indice === 0 || ordenar.isPending}
          onClick={() => ordenar.mutate({ rutina: rutina.id, ids: mover(ids, indice, indice - 1) })}><ArrowUp size={20} aria-hidden /></button>
        <button type="button" className="icono-boton" aria-label="Bajar día" disabled={indice === rutina.dias.length - 1 || ordenar.isPending}
          onClick={() => ordenar.mutate({ rutina: rutina.id, ids: mover(ids, indice, indice + 1) })}><ArrowDown size={20} aria-hidden /></button>
        <button type="button" className="icono-boton icono-boton--peligro" aria-label="Eliminar día" onClick={() => setConfirmando(true)}><Trash2 size={20} aria-hidden /></button>
      </div>

      {dia.ejercicios.length === 0
        ? <p className="bloque__ayuda">Este día todavía no tiene ejercicios.</p>
        : (
          <ol className="lista-ej">
            {dia.ejercicios.map((it, i) => <FilaEjercicio key={it.id} rutina={rutina} dia={dia} item={it} indice={i} total={dia.ejercicios.length} />)}
          </ol>
        )}

      <button type="button" className="boton boton--secundario boton--ancho" onClick={() => setBuscando(true)}>
        <Plus size={20} aria-hidden /> Agregar ejercicio
      </button>

      {buscando && <BuscadorEjercicios rutina={rutina.id} dia={dia} onCerrar={() => setBuscando(false)} />}
      {confirmando && (
        <ConfirmarDialogo
          titulo="¿Eliminar el día?"
          mensaje={`Se va a borrar «${dia.nombre}»${dia.ejercicios.length ? ` y sus ${dia.ejercicios.length} ejercicios` : ''}. No se puede deshacer.`}
          ocupado={borrar.isPending}
          onCancelar={() => setConfirmando(false)}
          onConfirmar={() => borrar.mutate({ rutina: rutina.id, dia: dia.id }, { onSuccess: () => setConfirmando(false) })}
        />
      )}
    </section>
  )
}

export function Rutina() {
  const { id } = useParams()
  const { data: rutina, isPending, isError } = useRutina(id)
  const editar = useEditarRutina()
  const agregarDia = useAgregarDia()
  const [nuevoDia, setNuevoDia] = useState<string | null>(null)

  if (isPending) return <p className="aviso">Cargando…</p>
  if (isError || !rutina) {
    return (
      <div className="pagina">
        <p className="aviso aviso--error" role="alert">No encontramos esa rutina.</p>
        <Link to="/rutinas" className="boton boton--secundario">Ver mis rutinas</Link>
      </div>
    )
  }

  const alCrearDia = (ev: FormEvent) => {
    ev.preventDefault()
    if (!nuevoDia?.trim()) return
    agregarDia.mutate({ rutina: rutina.id, nombre: nuevoDia.trim() }, { onSuccess: () => setNuevoDia(null) })
  }

  return (
    <div className="pagina">
      <Link to="/rutinas" className="volver"><ArrowLeft size={18} aria-hidden /> Rutinas</Link>

      <div className="rutina-cabecera">
        <input key={rutina.nombre} className="titulo-editable" aria-label="Nombre de la rutina" defaultValue={rutina.nombre} maxLength={80}
          onBlur={enBlur(rutina.nombre, v => { if (!v) return false; editar.mutate({ id: rutina.id, nombre: v }) })} />
        <textarea key={rutina.descripcion} className="control control--area" aria-label="Descripción" placeholder="Descripción (opcional)" rows={2} maxLength={500}
          defaultValue={rutina.descripcion} onBlur={enBlur(rutina.descripcion, v => { editar.mutate({ id: rutina.id, descripcion: v }) })} />
      </div>

      {rutina.dias.map((d, i) => <Dia key={d.id} rutina={rutina} dia={d} indice={i} />)}

      {nuevoDia === null
        ? <button type="button" className="boton boton--principal boton--ancho" onClick={() => setNuevoDia("")}><Plus size={20} aria-hidden /> Agregar día</button>
        : (
          <form className="tarjeta formulario-linea" onSubmit={alCrearDia}>
            <label className="campo campo--crece">
              <span className="campo__etiqueta">Nombre del nuevo día</span>
              <input className="control" value={nuevoDia} onChange={e => setNuevoDia(e.target.value)} maxLength={60} placeholder="Ej.: Día C – Piernas" autoFocus />
            </label>
            <button type="submit" className="boton boton--principal" disabled={!nuevoDia.trim() || agregarDia.isPending}>Crear día</button>
            <button type="button" className="boton boton--secundario" onClick={() => setNuevoDia(null)}>Cancelar</button>
          </form>
        )}
    </div>
  )
}
