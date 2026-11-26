import { NOMBRE_APP } from '../../lib/marca';

export function Marca({ compacta = false }: { compacta?: boolean }) {
  const isotipo = (
    <svg
      className="marca__isotipo"
      viewBox="0 0 24 24"
      width="24"
      height="24"
      fill="currentColor"
      aria-hidden={compacta ? undefined : true}
      focusable="false"
    >
      <rect x="1" y="8" width="3" height="8" rx="1" />
      <rect x="4.5" y="5" width="3.5" height="14" rx="1" />
      <rect x="8" y="10.5" width="8" height="3" />
      <rect x="16" y="5" width="3.5" height="14" rx="1" />
      <rect x="20" y="8" width="3" height="8" rx="1" />
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
