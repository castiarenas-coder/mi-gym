import { Link, useSearchParams } from 'react-router-dom'
import { History } from 'lucide-react'
import { CabeceraPagina } from '../components/ui/CabeceraPagina'
import { TabCalculadora } from './progreso/TabCalculadora'
import { TabEjercicios } from './progreso/TabEjercicios'
import { TabMedidas } from './progreso/TabMedidas'
import { TabResumen } from './progreso/TabResumen'

const TABS = [
  { id: 'resumen', texto: 'Resumen', Componente: TabResumen },
  { id: 'ejercicios', texto: 'Ejercicios', Componente: TabEjercicios },
  { id: 'medidas', texto: 'Medidas', Componente: TabMedidas },
  { id: 'calculadora', texto: 'Calculadora', Componente: TabCalculadora },
] as const

export function Progreso() {
  const [params, setParams] = useSearchParams()
  const actual = TABS.find(t => t.id === params.get('tab')) ?? TABS[0]
  const { Componente } = actual

  const elegir = (id: string) => setParams(id === 'resumen' ? {} : { tab: id }, { replace: true })
  // Flechas izquierda/derecha para moverse entre pestañas.
  const alTeclear = (ev: React.KeyboardEvent, i: number) => {
    if (ev.key !== 'ArrowRight' && ev.key !== 'ArrowLeft') return
    const sig = TABS[(i + (ev.key === 'ArrowRight' ? 1 : TABS.length - 1)) % TABS.length]
    elegir(sig.id)
    document.getElementById(`tab-${sig.id}`)?.focus()
  }

  return (
    <div className="pagina">
      <CabeceraPagina
        titulo="Progreso"
        accion={<Link to="/historial" className="boton boton--secundario"><History size={20} aria-hidden /> Ver historial</Link>}
      />

      <div className="chips tabs" role="tablist" aria-label="Secciones de progreso">
        {TABS.map((t, i) => (
          <button
            key={t.id}
            id={`tab-${t.id}`}
            type="button"
            role="tab"
            aria-selected={t.id === actual.id}
            aria-controls="panel-progreso"
            tabIndex={t.id === actual.id ? 0 : -1}
            className={`chip${t.id === actual.id ? ' chip--activo' : ''}`}
            onClick={() => elegir(t.id)}
            onKeyDown={ev => alTeclear(ev, i)}
          >
            {t.texto}
          </button>
        ))}
      </div>

      <div id="panel-progreso" role="tabpanel" aria-labelledby={`tab-${actual.id}`} className="pagina">
        <Componente />
      </div>
    </div>
  )
}
