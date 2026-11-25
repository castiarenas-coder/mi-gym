import { useState } from 'react'
import { kg } from '../lib/formato'
import { escala } from '../lib/graficos'

export interface DatoBarra { etiqueta: string; valor: number; detalle: string }

interface Props {
  titulo: string
  datos: DatoBarra[]
  vacio?: string
  /** Para conteos: las marcas del eje son enteras. */
  enteros?: boolean
}

const W = 640
const H = 240
const M = { arriba: 14, derecha: 12, abajo: 32, izquierda: 44 }

/** Barras en SVG, accesibles: cada barra es un botón con su descripción completa. */
export function GraficoBarras({ titulo, datos, vacio, enteros = false }: Props) {
  const [activo, setActivo] = useState<number | null>(null)

  if (datos.length === 0 || datos.every(d => d.valor === 0)) {
    return <div className="grafico grafico--vacio"><p className="aviso">{vacio ?? 'Todavía no hay datos para mostrar.'}</p></div>
  }

  const e = escala(datos.map(d => d.valor), 4, { desdeCero: true, entero: enteros })
  const ancho = W - M.izquierda - M.derecha
  const alto = H - M.arriba - M.abajo
  const paso = ancho / datos.length
  const barra = Math.min(40, paso * 0.62)
  const y = (v: number) => M.arriba + alto - (v / e.max) * alto
  const cada = datos.length > 8 ? 2 : 1

  return (
    <figure className="grafico" onMouseLeave={() => setActivo(null)}>
      <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label={`${titulo}: ${datos.length} semanas`} className="grafico__svg">
        {e.ticks.map(t => (
          <g key={t}>
            <line x1={M.izquierda} x2={W - M.derecha} y1={y(t)} y2={y(t)} className="grafico__guia" />
            <text x={M.izquierda - 8} y={y(t) + 4} textAnchor="end" className="grafico__texto">{kg(t)}</text>
          </g>
        ))}
        {datos.map((d, i) => {
          const cx = M.izquierda + paso * i + paso / 2
          const alta = Math.max(d.valor > 0 ? 3 : 0, M.arriba + alto - y(d.valor))
          return (
            <g
              key={`${d.etiqueta}-${i}`}
              role="button"
              tabIndex={0}
              aria-label={d.detalle}
              className={`grafico__barra${activo === i ? ' grafico__barra--activa' : ''}`}
              onMouseEnter={() => setActivo(i)}
              onFocus={() => setActivo(i)}
              onClick={() => setActivo(i)}
              onKeyDown={ev => { if (ev.key === 'Escape') setActivo(null) }}
            >
              <rect x={cx - paso / 2} y={M.arriba} width={paso} height={alto} className="grafico__toque" />
              <rect x={cx - barra / 2} y={M.arriba + alto - alta} width={barra} height={alta} rx={4} className="grafico__relleno" />
              {i % cada === 0 && <text x={cx} y={H - 10} textAnchor="middle" className="grafico__texto">{d.etiqueta}</text>}
            </g>
          )
        })}
      </svg>
      {activo !== null && (
        <div
          role="tooltip"
          className="grafico__tooltip"
          style={{ left: `${((M.izquierda + paso * activo + paso / 2) / W) * 100}%`, top: `${(y(datos[activo].valor) / H) * 100}%` }}
        >
          <span>{datos[activo].detalle}</span>
        </div>
      )}
    </figure>
  )
}
