import { useCallback, useEffect, useRef, useState } from 'react'

/**
 * Cuenta regresiva de descanso. Se calcula contra la hora real (no sumando ticks), así sigue exacta
 * aunque el celular frene los temporizadores con la pantalla apagada.
 */
export function useDescanso(alTerminar: () => void) {
  const [fin, setFin] = useState<number | null>(null)
  const [ahora, setAhora] = useState(() => Date.now())
  const [terminado, setTerminado] = useState(false)
  const aviso = useRef(alTerminar)
  const disparado = useRef(false)

  useEffect(() => { aviso.current = alTerminar }, [alTerminar])

  useEffect(() => {
    if (fin === null) return
    const t = setInterval(() => {
      const n = Date.now()
      setAhora(n)
      if (n >= fin && !disparado.current) {
        disparado.current = true
        setFin(null)
        setTerminado(true)
        aviso.current()
      }
    }, 250)
    return () => clearInterval(t)
  }, [fin])

  const iniciar = useCallback((segundos: number) => {
    if (!(segundos > 0)) return
    const n = Date.now()
    disparado.current = false
    setTerminado(false)
    setAhora(n)
    setFin(n + segundos * 1000)
  }, [])

  const ajustar = useCallback((delta: number) => setFin(f => (f === null ? f : f + delta * 1000)), [])

  const saltar = useCallback(() => { disparado.current = true; setFin(null); setTerminado(false) }, [])

  const restante = fin === null ? 0 : Math.max(0, Math.ceil((fin - ahora) / 1000))
  return { activo: fin !== null || terminado, terminado, restante, iniciar, ajustar, saltar }
}
