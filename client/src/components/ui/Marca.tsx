import { NOMBRE_APP } from '../../lib/marca';

export function Marca({ compacta = false }: { compacta?: boolean }) {
  const isotipo = (
    <svg
      className="marca__isotipo"
      viewBox="0 0 96 96"
      width="24"
      height="24"
      aria-hidden={compacta ? undefined : true}
      focusable="false"
    >
      <circle cx="48" cy="48" r="40" fill="none" stroke="currentColor" strokeWidth="6" />
      <path d="M48 16 L60 48 L48 80 L36 48 Z" fill="var(--texto-suave)" fillOpacity="0.55" />
      <path d="M48 16 L60 48 L36 48 Z" fill="currentColor" />
      <circle cx="48" cy="48" r="5" fill="var(--fondo)" />
    </svg>
  );
  if (compacta) {
    return (
      <span className="marca marca--compacta" role="img" aria-label={NOMBRE_APP}>
        {isotipo}
      </span>
    );
  }
  return (
    <span className="marca">
      {isotipo}
      <span className="marca__nombre">{NOMBRE_APP}</span>
    </span>
  );
}
