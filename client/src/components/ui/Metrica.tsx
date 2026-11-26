interface Props {
  valor: string | number;
  unidad?: string;
  etiqueta: string;
}

export function Metrica({ valor, unidad, etiqueta }: Props) {
  return (
    <div className="metrica">
      <div className="metrica__valor">
        <span className="numero metrica__numero">{valor}</span>
        {unidad && <span className="metrica__unidad">{unidad}</span>}
      </div>
      <div className="metrica__etiqueta">{etiqueta}</div>
    </div>
  );
}
