import { useEffect, useState } from 'react'
import { Plus, Search, X } from 'lucide-react'
import { useFiltros, useListaEjercicios } from '../api/ejercicios'
import { useRetardo } from '../lib/useRetardo'
import { AnimacionEjercicio } from './AnimacionEjercicio'

interface Props {
  titulo: string
  ocupado?: boolean
  /** Debe devolver una promesa: si falla, se muestra el mensaje del error. */
  onAgregar: (id: string, nombre: string) => Promise<unknown>
  onCerrar: () => void
}

/** Buscador del catálogo en una ventana; cada ejercicio se suma con el botón "+". */
export function BuscadorCatalogo({ titulo, ocupado = false, onAgregar, onCerrar }: Props) {
  const [texto, setTexto] = useState('')
  const [musculo, setMusculo] = useState('')
  const q = useRetardo(texto)
  const filtros = useFiltros()
  const lista = useListaEjercicios({ q, musculo }, 20)
  const [ultimo, setUltimo] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const items = lista.data?.pages.flatMap(p => p.items) ?? []

  useEffect(() => {
    const alTeclear = (ev: KeyboardEvent) => { if (ev.key === 'Escape') onCerrar() }
    document.addEventListener('keydown', alTeclear)
    return () => document.removeEventListener('keydown', alTeclear)
  }, [onCerrar])

  const sumar = async (id: string, nombre: string) => {
    setError(null)
    try { await onAgregar(id, nombre); setUltimo(nombre) } catch (e) { setError(e instanceof Error ? e.message : 'No pudimos agregarlo') }
  }

  return (
    <div className="modal" onClick={ev => { if (ev.target === ev.currentTarget) onCerrar() }}>
      <div className="modal__caja modal__caja--ancha" role="dialog" aria-modal="true" aria-labelledby="buscador-titulo">
        <div className="modal__cabecera">
          <h2 id="buscador-titulo">{titulo}</h2>
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
              <button type="button" className="icono-boton icono-boton--acento" aria-label={`Agregar ${e.nombre}`} disabled={ocupado} onClick={() => sumar(e.id, e.nombre)}>
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
