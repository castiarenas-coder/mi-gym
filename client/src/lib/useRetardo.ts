import { useEffect, useState } from 'react'

/** Devuelve `valor` recién después de `ms` sin cambios. */
export function useRetardo<T>(valor: T, ms = 300): T {
  const [retardado, setRetardado] = useState(valor)
  useEffect(() => {
    const t = setTimeout(() => setRetardado(valor), ms)
    return () => clearTimeout(t)
  }, [valor, ms])
  return retardado
}
