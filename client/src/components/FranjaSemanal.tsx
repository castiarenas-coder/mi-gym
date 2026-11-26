import { Check } from 'lucide-react'
import { useSesiones } from '../api/entrenar'
import { diasEntrenados, posicionHoy } from '../lib/semana'

const LETRAS = ['L', 'M', 'X', 'J', 'V', 'S', 'D']
const NOMBRES = ['lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado', 'domingo']

export function FranjaSemanal({ hoy }: { hoy?: Date }) {
  const ahora = hoy ?? new Date()
  const { data } = useSesiones(30)
  const dias = diasEntrenados((data?.items ?? []).map(s => s.fecha), ahora)
  const pos = posicionHoy(ahora)
  const total = dias.filter(Boolean).length
  return (
    <section className="franja" aria-label="Tu semana">
      <ol className="franja__dias">
        {dias.map((hecho, i) => (
          <li
            key={i}
            className={`franja__dia${hecho ? ' franja__dia--hecho' : ''}${i === pos && !hecho ? ' franja__dia--hoy' : ''}`}
            aria-label={`${NOMBRES[i]}${hecho ? ': entrenaste' : ''}`}
            aria-current={i === pos ? 'date' : undefined}
          >
            <span className="franja__letra" aria-hidden="true">{LETRAS[i]}</span>
            {hecho && <Check size={16} aria-hidden="true" />}
          </li>
        ))}
      </ol>
      <p className="franja__texto">{total === 1 ? '1 día esta semana' : `${total} días esta semana`}</p>
    </section>
  )
}
