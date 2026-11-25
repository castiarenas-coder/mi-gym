import type { LucideIcon } from 'lucide-react'

export function Proximamente({ titulo, icono: Icono }: { titulo: string; icono: LucideIcon }) {
  return (
    <section className="tarjeta proximamente">
      <Icono size={40} aria-hidden />
      <h1>{titulo}</h1>
      <p>Próximamente</p>
    </section>
  )
}
