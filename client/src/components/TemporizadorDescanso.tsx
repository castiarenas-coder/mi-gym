import { Minus, Plus, SkipForward } from 'lucide-react'
import { reloj } from '../lib/formato'

interface Props {
  restante: number
  total: number
  terminado: boolean
  onAjustar: (delta: number) => void
  onSaltar: () => void
}

/** Barra fija de descanso entre series: cuenta regresiva, ±15 s y saltar. */
export function TemporizadorDescanso({ restante, total, terminado, onAjustar, onSaltar }: Props) {
  const avance = terminado ? 100 : total > 0 ? Math.min(100, Math.max(0, ((total - restante) / total) * 100)) : 0
  return (
    <section className={`descanso${terminado ? ' descanso--fin' : ''}`} aria-label="Descanso">
      <div className="descanso__barra" aria-hidden><span style={{ width: `${avance}%` }} /></div>
      <div className="descanso__cuerpo">
        <div className="descanso__tiempo" role="timer" aria-live="off">
          <span className="descanso__etiqueta">{terminado ? '¡A la siguiente serie!' : 'Descanso'}</span>
          <strong>{terminado ? '0:00' : reloj(restante)}</strong>
        </div>
        {!terminado && (
          <>
            <button type="button" className="icono-boton" aria-label="Restar 15 segundos" onClick={() => onAjustar(-15)}><Minus size={22} aria-hidden /></button>
            <button type="button" className="icono-boton" aria-label="Sumar 15 segundos" onClick={() => onAjustar(15)}><Plus size={22} aria-hidden /></button>
          </>
        )}
        <button type="button" className="boton boton--secundario descanso__saltar" aria-label={terminado ? 'Cerrar aviso de descanso' : 'Saltar descanso'} onClick={onSaltar}>
          <SkipForward size={20} aria-hidden /> {terminado ? 'Seguir' : 'Saltar'}
        </button>
      </div>
    </section>
  )
}
