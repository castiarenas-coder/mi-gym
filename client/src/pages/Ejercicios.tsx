import { useEffect, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { Heart, Search, X } from 'lucide-react'
import { useFiltros, useListaEjercicios } from '../api/ejercicios'
import type { ConsultaEjercicios, ValorFiltro } from '../api/tipos'
import { TarjetaEjercicio } from '../components/TarjetaEjercicio'
import { CabeceraPagina } from '../components/ui/CabeceraPagina'
import { useRetardo } from '../lib/useRetardo'

function SelectorFiltro({ etiqueta, valor, opciones, onChange }: { etiqueta: string; valor: string; opciones: ValorFiltro[]; onChange: (v: string) => void }) {
  return (
    <label className="campo">
      <span className="campo__etiqueta">{etiqueta}</span>
      <select className="control" value={valor} onChange={e => onChange(e.target.value)}>
        <option value="">Todos</option>
        {opciones.map(o => <option key={o.valor} value={o.valor}>{o.valor}</option>)}
      </select>
    </label>
  )
}

export function Ejercicios() {
  const [params, setParams] = useSearchParams()
  const q = params.get('q') ?? ''
  const [texto, setTexto] = useState(q)
  const textoRetardado = useRetardo(texto)

  const cambiar = (cambios: Record<string, string | null>) => setParams(prev => {
    const sig = new URLSearchParams(prev)
    for (const [k, v] of Object.entries(cambios)) { if (v) sig.set(k, v); else sig.delete(k) }
    return sig
  }, { replace: true })

  useEffect(() => {
    if (textoRetardado.trim() !== q.trim()) cambiar({ q: textoRetardado.trim() || null })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [textoRetardado])

  const consulta: ConsultaEjercicios = {
    q, musculo: params.get('musculo') ?? '', equipo: params.get('equipo') ?? '',
    nivel: params.get('nivel') ?? '', categoria: params.get('categoria') ?? '', favoritos: params.get('favoritos') === '1',
  }
  const hayFiltros = !!(consulta.q || consulta.musculo || consulta.equipo || consulta.nivel || consulta.categoria || consulta.favoritos)

  const filtros = useFiltros()
  const lista = useListaEjercicios(consulta)
  const items = lista.data?.pages.flatMap(p => p.items) ?? []
  const total = lista.data?.pages[0]?.total ?? 0

  const limpiar = () => { setTexto(''); setParams({}, { replace: true }) }

  return (
    <div className="pagina">
      <CabeceraPagina titulo="Ejercicios" />

      <div className="buscador-fijo">
      <div className="busqueda">
        <Search size={20} aria-hidden />
        <input
          type="search"
          className="busqueda__input"
          aria-label="Buscar ejercicio"
          placeholder="Buscar: sentadilla, bíceps, mancuernas…"
          value={texto}
          onChange={e => setTexto(e.target.value)}
        />
        {texto && (
          <button type="button" className="busqueda__borrar" aria-label="Borrar búsqueda" onClick={() => setTexto('')}>
            <X size={18} aria-hidden />
          </button>
        )}
      </div>

      <div className="chips" role="group" aria-label="Músculo y favoritos">
        <button
          type="button"
          className={`chip chip--favoritos${consulta.favoritos ? ' chip--activo' : ''}`}
          aria-pressed={consulta.favoritos}
          onClick={() => cambiar({ favoritos: consulta.favoritos ? null : '1' })}
        >
          <Heart size={16} aria-hidden fill={consulta.favoritos ? 'currentColor' : 'none'} /> Solo favoritos
        </button>
        {filtros.data?.musculos.map(m => (
          <button
            key={m.valor}
            type="button"
            className={`chip${consulta.musculo === m.valor ? ' chip--activo' : ''}`}
            aria-pressed={consulta.musculo === m.valor}
            onClick={() => cambiar({ musculo: consulta.musculo === m.valor ? null : m.valor })}
          >
            {m.valor}
          </button>
        ))}
      </div>
      </div>

      <div className="filtros-fila">
        <SelectorFiltro etiqueta="Equipo" valor={consulta.equipo ?? ''} opciones={filtros.data?.equipos ?? []} onChange={v => cambiar({ equipo: v || null })} />
        <SelectorFiltro etiqueta="Nivel" valor={consulta.nivel ?? ''} opciones={filtros.data?.niveles ?? []} onChange={v => cambiar({ nivel: v || null })} />
        <SelectorFiltro etiqueta="Categoría" valor={consulta.categoria ?? ''} opciones={filtros.data?.categorias ?? []} onChange={v => cambiar({ categoria: v || null })} />
      </div>

      <div className="resultado-barra">
        <p className="resultado-barra__cuenta" aria-live="polite">
          {lista.isSuccess ? `${total} ${total === 1 ? 'ejercicio' : 'ejercicios'}` : ' '}
        </p>
        {hayFiltros && <button type="button" className="boton boton--texto" onClick={limpiar}>Limpiar filtros</button>}
      </div>

      {lista.isError && (
        <p className="aviso aviso--error" role="alert">
          No pudimos cargar los ejercicios. <button type="button" className="boton boton--texto" onClick={() => lista.refetch()}>Reintentar</button>
        </p>
      )}
      {lista.isPending && <p className="aviso">Cargando ejercicios…</p>}
      {lista.isSuccess && items.length === 0 && <p className="aviso">No encontramos ejercicios con esos filtros.</p>}

      <div className="grilla-ej">
        {items.map(e => <TarjetaEjercicio key={e.id} ejercicio={e} />)}
      </div>

      {lista.hasNextPage && (
        <div className="centrado">
          <button type="button" className="boton boton--secundario" disabled={lista.isFetchingNextPage} onClick={() => lista.fetchNextPage()}>
            {lista.isFetchingNextPage ? 'Cargando…' : 'Ver más'}
          </button>
        </div>
      )}
    </div>
  )
}
