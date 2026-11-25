import { useState } from 'react'
import type { DatosPersona, Persona } from '../api/personas'
import { AvatarPersona } from './AvatarPersona'

export const COLORES = ['#c6ff3d', '#ff7a1a', '#4dc3ff', '#ff5fa2', '#b48cff', '#3ddc84', '#ffd23d', '#ff4d4d']
export const AVATARES = ['💪', '🏋️', '🦊', '🐯', '🦁', '🐺', '🦅', '🔥', '⚡', '🌟', '🚀', '🎯']

interface Props {
  /** Si viene, se edita esa persona; si no, se crea una nueva. */
  persona?: Persona
  ocupado?: boolean
  error?: string | null
  onGuardar: (datos: DatosPersona) => void
  onCancelar?: () => void
}

export function FormularioPersona({ persona, ocupado = false, error, onGuardar, onCancelar }: Props) {
  const [nombre, setNombre] = useState(persona?.nombre ?? '')
  const [color, setColor] = useState(persona?.color ?? COLORES[Math.floor(Math.random() * COLORES.length)])
  const [avatar, setAvatar] = useState(persona?.avatar ?? '')
  const edita = !!persona
  const valido = nombre.trim().length > 0

  return (
    <form
      className="form-persona"
      aria-label={edita ? 'Editar persona' : 'Nueva persona'}
      onSubmit={ev => { ev.preventDefault(); if (valido) onGuardar({ nombre: nombre.trim(), color, avatar }) }}
    >
      <div className="form-persona__vista"><AvatarPersona persona={{ nombre: nombre || '?', color, avatar }} tamano="grande" /></div>
      <label className="campo">
        <span className="campo__etiqueta">Nombre</span>
        <input className="control" value={nombre} maxLength={30} autoFocus onChange={e => setNombre(e.target.value)} placeholder="Cómo te llamás" />
      </label>
      <div className="campo" role="radiogroup" aria-label="Color">
        <span className="campo__etiqueta">Color</span>
        <div className="opciones">
          {COLORES.map(c => (
            <button key={c} type="button" role="radio" aria-checked={color === c} aria-label={`Color ${c}`} className={`opcion opcion--color${color === c ? ' opcion--activa' : ''}`} style={{ background: c }} onClick={() => setColor(c)} />
          ))}
        </div>
      </div>
      <div className="campo" role="radiogroup" aria-label="Avatar">
        <span className="campo__etiqueta">Avatar</span>
        <div className="opciones">
          <button type="button" role="radio" aria-checked={avatar === ''} aria-label="Avatar con la inicial" className={`opcion${avatar === '' ? ' opcion--activa' : ''}`} onClick={() => setAvatar('')}>Aa</button>
          {AVATARES.map(a => (
            <button key={a} type="button" role="radio" aria-checked={avatar === a} aria-label={`Avatar ${a}`} className={`opcion${avatar === a ? ' opcion--activa' : ''}`} onClick={() => setAvatar(a)}>{a}</button>
          ))}
        </div>
      </div>
      {error && <p className="aviso aviso--error" role="alert">{error}</p>}
      <div className="acciones acciones--fin">
        {onCancelar && <button type="button" className="boton boton--secundario" onClick={onCancelar}>Cancelar</button>}
        <button type="submit" className="boton boton--principal" disabled={!valido || ocupado}>{edita ? 'Guardar' : 'Crear persona'}</button>
      </div>
    </form>
  )
}
