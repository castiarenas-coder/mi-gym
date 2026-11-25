import { useAgregarEjercicio } from '../api/rutinas'
import { BuscadorCatalogo } from './BuscadorCatalogo'

interface Props { rutina: number; dia: { id: number; nombre: string }; onCerrar: () => void }

/** Buscador del catálogo para sumar ejercicios a un día de la rutina. */
export function BuscadorEjercicios({ rutina, dia, onCerrar }: Props) {
  const agregar = useAgregarEjercicio()
  return (
    <BuscadorCatalogo
      titulo={`Agregar ejercicios a ${dia.nombre}`}
      ocupado={agregar.isPending}
      onAgregar={id => agregar.mutateAsync({ rutina, dia: dia.id, ejercicio: id })}
      onCerrar={onCerrar}
    />
  )
}
