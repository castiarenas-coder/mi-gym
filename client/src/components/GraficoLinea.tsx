import { useState } from 'react'
import { fechaCorta, kg } from '../lib/formato'
import { escala } from '../lib/graficos'

export interface PuntoLinea { fecha: string; valor: number }

interface Props {
  titulo: string
  puntos: PuntoLinea[]
  unidad: string
  vacio?: string
}

const W = 640
const H = 280
const M = { arriba: 16, derecha: 20, abajo: 36, izquierda: 52 }

/** Gráfico de línea en SVG, accesible: cada punto es un botón con su valor. */
export function GraficoLinea({ titulo, puntos, unidad, vacio }: Props) {
  const [activo, setActivo] = useState<number | null>(null)

  if (puntos.length < 2) {
    return (
      <div className="grafico grafico--vacio">
        <p className="aviso">{vacio ?? 'Necesitás al menos 2 registros para ver el gráfico.'}</p>
        {puntos.length === 1 && <p className="grafico__unico">{fechaCorta(puntos[0].fecha)}: <strong>{kg(puntos[0].valor)} {unidad}</strong></p>}
      </div>
    )
  }

  const e = escala(puntos.map(p => p.valor), 4)
  const ancho = W - M.izquierda - M.derecha
  const alto = H - M.arriba - M.abajo
  const tiempos = puntos.map(p => new Date(p.fecha.length === 10 ? `${p.fecha}T12:00:00` : p.fecha).getTime())
  const t0 = tiempos[0]
  const t1 = tiempos[tiempos.length - 1]
  const x = (i: number) => M.izquierda + (t1 === t0 ? ancho / 2 : ((tiempos[i] - t0) / (t1 - t0)) * ancho)
  const y = (v: number) => M.arriba + alto - ((v - e.min) / (e.max - e.min)) * alto
  const camino = puntos.map((p, i) => `${i === 0 ? 'M' : 'L'}${x(i).toFixed(1)} ${y(p.valor).toFixed(1)}`).join(' ')
  const area = `${camino} L${x(puntos.length - 1).toFixed(1)} ${M.arriba + alto} L${x(0).toFixed(1)} ${M.arriba + alto} Z`
  const etiquetasX = new Set([0, Math.floor((puntos.length - 1) / 2), puntos.length - 1])
  const ultimo = puntos[puntos.length - 1]
  const descripcion = `${titulo}: de ${kg(puntos[0].valor)} ${unidad} el ${fechaCorta(puntos[0].fecha)} a ${kg(ultimo.valor)} ${unidad} el ${fechaCorta(ultimo.fecha)}.`

  return (
    <figure className="grafico" onMouseLeave={() => setActivo(null)}>
      <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label={descripcion} className="grafico__svg">
        {e.ticks.map(t => (
          <g key={t}>
            <line x1={M.izquierda} x2={W - M.derecha} y1={y(t)} y2={y(t)} className="grafico__guia" />
            <text x={M.izquierda - 8} y={y(t) + 4} textAnchor="end" className="grafico__texto">{kg(t)}</text>
          </g>
        ))}
        <text x={14} y={M.arriba + alto / 2} textAnchor="middle" transform={`rotate(-90 14 ${M.arriba + alto / 2})`} className="grafico__texto">{unidad}</text>
        <path d={area} className="grafico__area" />
        <path d={camino} className="grafico__linea" />
        {[...etiquetasX].map(i => (
          <text key={i} x={x(i)} y={H - 10} textAnchor={i === 0 ? 'start' : i === puntos.length - 1 ? 'end' : 'middle'} className="grafico__texto">{fechaCorta(puntos[i].fecha)}</text>
        ))}
        {puntos.map((p, i) => (
          <g
            key={`${p.fecha}-${i}`}
            role="button"
            tabIndex={0}
            aria-label={`${fechaCorta(p.fecha)}: ${kg(p.valor)} ${unidad}`}
            className={`grafico__punto${activo === i ? ' grafico__punto--activo' : ''}`}
            onMouseEnter={() => setActivo(i)}
            onFocus={() => setActivo(i)}
            onClick={() => setActivo(i)}
            onKeyDown={ev => { if (ev.key === 'Escape') setActivo(null) }}
          >
            <circle cx={x(i)} cy={y(p.valor)} r={18} className="grafico__toque" />
            <circle cx={x(i)} cy={y(p.valor)} r={activo === i ? 7 : 5} className="grafico__marca" />
          </g>
        ))}
      </svg>
      {activo !== null && (
        <div
          role="tooltip"
          className="grafico__tooltip"
          style={{ left: `${(x(activo) / W) * 100}%`, top: `${(y(puntos[activo].valor) / H) * 100}%` }}
        >
          <strong>{kg(puntos[activo].valor)} {unidad}</strong>
          <span>{fechaCorta(puntos[activo].fecha)}</span>
        </div>
      )}
    </figure>
  )
}
