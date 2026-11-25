import { useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { ArrowLeft, Check, X } from 'lucide-react'
import { useAgregarEjercicio, useRutinas } from '../api/rutinas'
import type { RutinaResumen } from '../api/tipos'

/** Ventana para elegir rutina y día donde agregar un ejercicio. */
export function SelectorRutina({ ejercicioId, onCerrar }: { ejercicioId: string; onCerrar: () => void }) {
  const rutinas = useRutinas()
  const agregar = useAgregarEjercicio()
  const [rutina, setRutina] = useState<RutinaResumen | null>(null)
  const [mensaje, setMensaje] = useState<string | null>(null)
  const cerrar = useRef<HTMLButtonElement>(null)

  useEffect(() => {
    cerrar.current?.focus()
    const alTeclear = (ev: KeyboardEvent) => { if (ev.key === 'Escape') onCerrar() }
    document.addEventListener('keydown', alTeclear)
    return () => document.removeEventListener('keydown', alTeclear)
  }, [onCerrar])

  const elegirDia = (dia: { id: number; nombre: string }) => {
    if (!rutina) return
    setMensaje(null)
    agregar.mutate(
      { rutina: rutina.id, dia: dia.id, ejercicio: ejercicioId },
      { onSuccess: () => setMensaje(`Agregado a ${dia.nombre} de ${rutina.nombre}`), onError: e => setMensaje(e.message) },
    )
  }

  return (
    <div className="modal" onClick={ev => { if (ev.target === ev.currentTarget) onCerrar() }}>
      <div className="modal__caja" role="dialog" aria-modal="true" aria-labelledby="sel-rutina-titulo">
        <div className="modal__cabecera">
          <h2 id="sel-rutina-titulo">Agregar a rutina</h2>
          <button ref={cerrar} type="button" className="icono-boton" aria-label="Cerrar" onClick={onCerrar}><X size={22} aria-hidden /></button>
        </div>

        {rutinas.isPending && <p className="aviso">Cargando rutinas…</p>}
        {rutinas.isError && <p className="aviso aviso--error" role="alert">No pudimos cargar tus rutinas.</p>}
        {rutinas.isSuccess && rutinas.data.length === 0 && (
          <p className="aviso">Todavía no tenés rutinas. <Link to="/rutinas" className="enlace">Crear una rutina</Link></p>
        )}

        {rutinas.isSuccess && !rutina && rutinas.data.length > 0 && (
          <>
            <p className="bloque__ayuda">¿En qué rutina?</p>
            <ul className="lista-opciones">
              {rutinas.data.map(r => (
                <li key={r.id}>
                  <button type="button" className="opcion" onClick={() => { setRutina(r); setMensaje(null) }}>
                    <strong>{r.nombre}</strong>
                    <span>{r.dias.length} {r.dias.length === 1 ? 'día' : 'días'} · {r.total_ejercicios} ejercicios</span>
                  </button>
                </li>
              ))}
            </ul>
          </>
        )}

        {rutina && (
          <>
            <button type="button" className="volver" onClick={() => { setRutina(null); setMensaje(null) }}>
              <ArrowLeft size={18} aria-hidden /> {rutina.nombre}
            </button>
            <p className="bloque__ayuda">¿En qué día?</p>
            <ul className="lista-opciones">
              {rutina.dias.map(d => (
                <li key={d.id}>
                  <button type="button" className="opcion" disabled={agregar.isPending} onClick={() => elegirDia(d)}>
                    <strong>{d.nombre}</strong>
                    <span>{d.cantidad} ejercicios</span>
                  </button>
                </li>
              ))}
            </ul>
          </>
        )}

        {mensaje && <p className="aviso aviso--ok" role="status"><Check size={16} aria-hidden /> {mensaje}</p>}
      </div>
    </div>
  )
}
