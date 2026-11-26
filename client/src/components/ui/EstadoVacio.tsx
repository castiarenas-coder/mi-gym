import type { LucideIcon } from 'lucide-react';
import { Link } from 'react-router-dom';

interface Props {
  icono: LucideIcon;
  titulo: string;
  texto: string;
  accion?: { texto: string; a: string };
}

export function EstadoVacio({ icono: Icono, titulo, texto, accion }: Props) {
  return (
    <div className="estado-vacio">
      <span className="estado-vacio__icono" aria-hidden="true">
        <Icono size={32} />
      </span>
      <h2 className="estado-vacio__titulo">{titulo}</h2>
      <p className="estado-vacio__texto">{texto}</p>
      {accion && (
        <Link className="estado-vacio__accion" to={accion.a}>
          {accion.texto}
        </Link>
      )}
    </div>
  );
}
