import { useState } from 'react'
import { Plus } from 'lucide-react'
import { useCrearPersona, type Persona } from '../api/personas'
import { AvatarPersona } from './AvatarPersona'
import { FormularioPersona } from './FormularioPersona'

interface Props {
  personas: Persona[]
  actual: Persona | null
  onElegir: (id: number) => void
  onCancelar?: () => void
}

/** Pantalla "¿Quién entrena?": una ficha grande por persona, como los perfiles de una app de series. */
export function ElegirPersona({ personas, actual, onElegir, onCancelar }: Props) {
  const crear = useCrearPersona()
  const [agregando, setAgregando] = useState(false)

  return (
    <div className="elegir-persona">
      <h1 className="elegir-persona__titulo">¿Quién entrena?</h1>
      {!agregando ? (
        <>
          <ul className="elegir-persona__lista">
            {personas.map(p => (
              <li key={p.id}>
                <button type="button" className={`ficha-persona${actual?.id === p.id ? ' ficha-persona--actual' : ''}`} onClick={() => onElegir(p.id)}>
                  <AvatarPersona persona={p} tamano="grande" />
                  <span className="ficha-persona__nombre">{p.nombre}</span>
                </button>
              </li>
            ))}
            <li>
              <button type="button" className="ficha-persona ficha-persona--agregar" onClick={() => setAgregando(true)}>
                <span className="avatar avatar--grande avatar--vacio" aria-hidden><Plus size={32} /></span>
                <span className="ficha-persona__nombre">Agregar persona</span>
              </button>
            </li>
          </ul>
          {onCancelar && <button type="button" className="boton boton--texto" onClick={onCancelar}>Volver</button>}
        </>
      ) : (
        <div className="tarjeta elegir-persona__nueva">
          <FormularioPersona
            ocupado={crear.isPending}
            error={crear.error?.message}
            onCancelar={() => setAgregando(false)}
            onGuardar={datos => crear.mutate(datos, { onSuccess: nueva => onElegir(nueva.id) })}
          />
        </div>
      )}
    </div>
  )
}
