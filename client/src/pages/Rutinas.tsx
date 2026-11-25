import { useState, type FormEvent } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { ChevronRight, Copy, Plus, Trash2 } from 'lucide-react'
import { useBorrarRutina, useCrearRutina, useDuplicarRutina, useRutinas } from '../api/rutinas'
import type { RutinaResumen } from '../api/tipos'
import { ConfirmarDialogo } from '../components/ConfirmarDialogo'

const plural = (n: number, uno: string, varios: string) => `${n} ${n === 1 ? uno : varios}`

export function Rutinas() {
  const navigate = useNavigate()
  const rutinas = useRutinas()
  const crear = useCrearRutina()
  const duplicar = useDuplicarRutina()
  const borrar = useBorrarRutina()
  const [creando, setCreando] = useState(false)
  const [nombre, setNombre] = useState('')
  const [aBorrar, setABorrar] = useState<RutinaResumen | null>(null)
  const [error, setError] = useState<string | null>(null)

  const alCrear = (ev: FormEvent) => {
    ev.preventDefault()
    if (!nombre.trim()) return
    crear.mutate({ nombre: nombre.trim() }, {
      onSuccess: r => navigate(`/rutinas/${r.id}`),
      onError: e => setError(e.message),
    })
  }

  return (
    <div className="pagina">
      <div className="cabecera-pagina">
        <h1>Rutinas</h1>
        {!creando && (
          <button type="button" className="boton boton--principal" onClick={() => setCreando(true)}>
            <Plus size={20} aria-hidden /> Nueva rutina
          </button>
        )}
      </div>

      {creando && (
        <form className="tarjeta formulario-linea" onSubmit={alCrear}>
          <label className="campo campo--crece">
            <span className="campo__etiqueta">Nombre de la rutina</span>
            <input className="control" value={nombre} onChange={e => setNombre(e.target.value)} maxLength={80} placeholder="Ej.: Empuje, tirón y piernas" autoFocus />
          </label>
          <button type="submit" className="boton boton--principal" disabled={!nombre.trim() || crear.isPending}>Crear rutina</button>
          <button type="button" className="boton boton--secundario" onClick={() => { setCreando(false); setNombre(''); setError(null) }}>Cancelar</button>
        </form>
      )}
      {error && <p className="aviso aviso--error" role="alert">{error}</p>}

      {rutinas.isPending && <p className="aviso">Cargando rutinas…</p>}
      {rutinas.isError && <p className="aviso aviso--error" role="alert">No pudimos cargar tus rutinas.</p>}
      {rutinas.isSuccess && rutinas.data.length === 0 && <p className="aviso">Todavía no tenés rutinas. Creá la primera.</p>}

      <div className="grilla-rutinas">
        {rutinas.data?.map(r => (
          <article key={r.id} className="tarjeta-rutina">
            <Link to={`/rutinas/${r.id}`} className="tarjeta-rutina__enlace">
              <div>
                <h2 className="tarjeta-rutina__nombre">{r.nombre}</h2>
                <p className="tarjeta-rutina__meta">{`${plural(r.dias.length, 'día', 'días')} · ${plural(r.total_ejercicios, 'ejercicio', 'ejercicios')}`}</p>
                {r.descripcion && <p className="tarjeta-rutina__desc">{r.descripcion}</p>}
              </div>
              <ChevronRight size={22} aria-hidden />
            </Link>
            {r.dias.length > 0 && (
              <ul className="insignias tarjeta-rutina__dias" aria-label="Días">
                {r.dias.map(d => <li key={d.id} className="insignia">{d.nombre}</li>)}
              </ul>
            )}
            <div className="tarjeta-rutina__acciones">
              <button type="button" className="boton boton--secundario" aria-label={`Duplicar ${r.nombre}`} disabled={duplicar.isPending} onClick={() => duplicar.mutate(r.id)}>
                <Copy size={18} aria-hidden /> Duplicar
              </button>
              <button type="button" className="boton boton--peligro" aria-label={`Eliminar ${r.nombre}`} onClick={() => setABorrar(r)}>
                <Trash2 size={18} aria-hidden /> Eliminar
              </button>
            </div>
          </article>
        ))}
      </div>

      {aBorrar && (
        <ConfirmarDialogo
          titulo="¿Eliminar la rutina?"
          mensaje={`Se va a borrar «${aBorrar.nombre}» con todos sus días y ejercicios. No se puede deshacer.`}
          ocupado={borrar.isPending}
          onCancelar={() => setABorrar(null)}
          onConfirmar={() => borrar.mutate(aBorrar.id, { onSuccess: () => setABorrar(null) })}
        />
      )}
    </div>
  )
}
