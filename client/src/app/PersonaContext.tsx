import { createContext, useContext, useState, type ReactNode } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { usePersonas, type Persona } from '../api/personas'
import { ElegirPersona } from '../components/ElegirPersona'
import { guardarPersona, personaGuardada } from '../lib/persona'

interface Valor {
  persona: Persona
  personas: Persona[]
  /** Abre la pantalla "¿Quién entrena?" para cambiar de persona. */
  cambiar: () => void
}

const Contexto = createContext<Valor | null>(null)

export function usePersonaActiva(): Valor {
  const v = useContext(Contexto)
  if (!v) throw new Error('usePersonaActiva se usa dentro de ProveedorPersona')
  return v
}

/** Decide quién entrena antes de mostrar nada: toda la app pide sus datos con la persona activa. */
export function ProveedorPersona({ children }: { children: ReactNode }) {
  const qc = useQueryClient()
  const lista = usePersonas()
  const [elegida, setElegida] = useState<number | null>(personaGuardada)
  const [eligiendo, setEligiendo] = useState(false)

  if (lista.isPending) return <p className="pantalla-estado">Cargando…</p>
  if (lista.isError) {
    return (
      <div className="pantalla-estado">
        <p className="aviso aviso--error" role="alert">No pudimos conectar con Rumbo Fit: {lista.error.message}</p>
        <button type="button" className="boton boton--principal" onClick={() => void lista.refetch()}>Reintentar</button>
      </div>
    )
  }

  const personas = lista.data
  const actual = personas.find(p => p.id === elegida) ?? (personas.length === 1 ? personas[0] : null)
  // Lo que se pide al servidor sale de acá: se deja anotada antes de dibujar las pantallas.
  if (actual && personaGuardada() !== actual.id) guardarPersona(actual.id)

  const elegir = (id: number) => {
    const cambio = id !== actual?.id
    guardarPersona(id)
    setElegida(id)
    setEligiendo(false)
    // Lo que había en memoria era de otra persona: se descarta y se vuelve a pedir.
    if (cambio) void qc.resetQueries({ predicate: q => q.queryKey[0] !== 'personas' })
  }

  if (!actual || eligiendo) {
    return <ElegirPersona personas={personas} actual={actual} onElegir={elegir} onCancelar={actual ? () => setEligiendo(false) : undefined} />
  }
  return <Contexto value={{ persona: actual, personas, cambiar: () => setEligiendo(true) }}>{children}</Contexto>
}
