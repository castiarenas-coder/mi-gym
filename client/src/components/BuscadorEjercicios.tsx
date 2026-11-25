import { useEffect, useState } from 'react'
import { Plus, Search, X } from 'lucide-react'
import { useFiltros, useListaEjercicios } from '../api/ejercicios'
import { useAgregarEjercicio } from '../api/rutinas'
import { useRetardo } from '../lib/useRetardo'
import { AnimacionEjercicio } from './AnimacionEjercicio'

interface Props { rutina: number; dia: { id: number; nombre: string }; onCerrar: () => void }

/** Buscador del catálogo para sumar ejercicios a un día de la rutina. */
export function BuscadorEjercicios({ rutina, dia, onCerrar }: Props) {
  const [texto, setTexto] = useState('')
  const [musculo, setMusculo] = useState('')
  const q = useRetardo(texto)
  const filtros = useFiltros()
  const lista = useListaEjercicios({ q, musculo }, 20)
  const agregar = useAgregarEjercicio()
  const [ultimo, setUltimo] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const items = lista.data?.pages.flatMap(p => p.items) ?? []

  useEffect(() => {
    const alTeclear = (ev: KeyboardEvent) => { if (ev.key === 'Escape') onCerrar() }
    document.addEventListener('keydown', alTeclear)
    return () => document.removeEventListener('keydown', alTeclear)
  }, [onCerrar])

  const sumar = (id: string, nombre: string) => {
    setError(null)
    agregar.mutate({ rutina, dia: dia.id, ejercicio: id }, { onSuccess: () => setUltimo(nombre), onError: e => setError(e.message) })
  }

  return (
    <div className="modal" onClick={ev => { if (ev.target === ev.currentTarget) onCerrar() }}>
      <div className="modal__caja modal__caja--ancha" role="dialog" aria-modal="true" aria-labelledby="buscador-titulo">
        <div className="modal__cabecera">
          <h2 id="buscador-titulo">Agregar ejercicios a {dia.nombre}</h2>
          <button type="button" className="icono-boton" aria-label="Cerrar" onClick={onCerrar}><X size={22} aria-hidden /></button>
        </div>

        <div className="busqueda">
          <Search size={20} aria-hidden />
          <input type="search" className="busqueda__input" aria-label="Buscar ejercicio para agregar" placeholder="Buscar ejercicio…" value={texto} onChange={e => setTexto(e.target.value)} autoFocus />
        </div>
        <label className="campo">
          <span className="campo__etiqueta">Músculo</span>
          <select className="control" value={musculo} onChange={e => setMusculo(e.target.value)}>
            <option value="">Todos</option>
            {filtros.data?.musculos.map(m => <option key={m.valor} value={m.valor}>{m.valor}</option>)}
          </select>
        </label>

        {ultimo && <p className="aviso aviso--ok" role="status">Agregado: {ultimo}</p>}
        {error && <p className="aviso aviso--error" role="alert">{error}</p>}
        {lista.isSuccess && items.length === 0 && <p className="aviso">No encontramos ejercicios.</p>}

        <ul className="lista-busqueda">
          {items.map(e => (
            <li key={e.id} className="fila-busqueda">
              <AnimacionEjercicio ejercicio={{ ...e, img_fin: null }} miniatura className="miniatura" />
              <div className="fila-busqueda__texto">
                <strong>{e.nombre}</strong>
                <span>{[e.musculo_principal, e.equipo].filter(Boolean).join(' · ')}</span>
              </div>
              <button type="button" className="icono-boton icono-boton--acento" aria-label={`Agregar ${e.nombre}`} disabled={agregar.isPending} onClick={() => sumar(e.id, e.nombre)}>
                <Plus size={22} aria-hidden />
              </button>
            </li>
          ))}
        </ul>
        {lista.hasNextPage && (
          <button type="button" className="boton boton--secundario" disabled={lista.isFetchingNextPage} onClick={() => lista.fetchNextPage()}>Ver más</button>
        )}
        <button type="button" className="boton boton--principal" onClick={onCerrar}>Listo</button>
      </div>
    </div>
  )
}
