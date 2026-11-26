import type { ReactNode } from 'react';

export function CabeceraPagina({ titulo, accion }: { titulo: string; accion?: ReactNode }) {
  return (
    <header className="cabecera-pagina">
      <h1 className="cabecera-pagina__titulo">{titulo}</h1>
      {accion && <div className="cabecera-pagina__accion">{accion}</div>}
    </header>
  );
}
