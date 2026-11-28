import { useEffect, useRef } from 'react'

interface Props {
  titulo: string
  mensaje: string
  confirmar?: string
  ocupado?: boolean
  onConfirmar: () => void
  onCancelar: () => void
}

/** Confirmación propia (en lugar de window.confirm) para acciones que no se pueden deshacer. */
export function ConfirmarDialogo({ titulo, mensaje, confirmar = 'Eliminar', ocupado = false, onConfirmar, onCancelar }: Props) {
  const cancelar = useRef<HTMLButtonElement>(null)
  useEffect(() => {
    cancelar.current?.focus()
    const alTeclear = (ev: KeyboardEvent) => { if (ev.key === 'Escape' && !ocupado) onCancelar() }
    document.addEventListener('keydown', alTeclear)
    return () => document.removeEventListener('keydown', alTeclear)
  }, [onCancelar, ocupado])

  return (
    <div className="modal modal--centro" onClick={ev => { if (ev.target === ev.currentTarget && !ocupado) onCancelar() }}>
      <div className="modal__caja" role="dialog" aria-modal="true" aria-labelledby="confirmar-titulo">
        <h2 id="confirmar-titulo" className="modal__titulo">{titulo}</h2>
        <p className="bloque__ayuda">{mensaje}</p>
        <div className="acciones acciones--fin">
          <button ref={cancelar} type="button" className="boton boton--secundario" disabled={ocupado} onClick={onCancelar}>Cancelar</button>
          <button type="button" className="boton boton--peligro" disabled={ocupado} onClick={onConfirmar}>{confirmar}</button>
        </div>
      </div>
    </div>
  )
}
