import { Heart } from 'lucide-react'
import { useFavorito } from '../api/ejercicios'

export function BotonFavorito({ id, favorito, className = '' }: { id: string; favorito: boolean; className?: string }) {
  const { mutate, isPending } = useFavorito()
  return (
    <button
      type="button"
      className={`favorito${favorito ? ' favorito--activo' : ''} ${className}`.trim()}
      aria-label={favorito ? 'Quitar de favoritos' : 'Marcar como favorito'}
      disabled={isPending}
      onClick={() => mutate({ id, favorito: !favorito })}
    >
      <Heart size={22} aria-hidden fill={favorito ? 'currentColor' : 'none'} />
    </button>
  )
}
