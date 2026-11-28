// Remoto en memoria para las pruebas del motor: se comporta como la nube (una sola versión por
// documento, la de `actualizado` más nuevo, y un `servidor_en` creciente por escritura aceptada).

const cursorDe = (n) => String(n).padStart(12, '0');

export function crearRemotoEnMemoria({ pagina = 1000 } = {}) {
  const filas = new Map(); // "tipo|clave" -> { doc, servidor_en }
  let contador = 0;
  const remoto = {
    fallaSubida: null, // Error que lanzará `subir` (se anula poniendo null)
    fallaBajada: null,
    llamadasSubir: 0,
    docsSubidos: 0, // documentos recibidos en total (aceptados o no)
    async subir(docs) {
      remoto.llamadasSubir++;
      if (remoto.fallaSubida) throw remoto.fallaSubida;
      for (const d of docs) {
        remoto.docsSubidos++;
        const k = `${d.tipo}|${d.clave}`;
        const previo = filas.get(k);
        // Solo gana el más nuevo; con la misma fecha gana el borrado (un vivo nunca pisa un borrado igual).
        // La RPC de Supabase debe respetar exactamente esta regla.
        if (previo && (previo.doc.actualizado > d.actualizado
          || (previo.doc.actualizado === d.actualizado && (previo.doc.borrado || !d.borrado)))) continue;
        filas.set(k, { doc: structuredClone(d), servidor_en: ++contador });
      }
    },
    async bajar(cursor) {
      if (remoto.fallaBajada) throw remoto.fallaBajada;
      const desde = Number(cursor ?? 0);
      const lote = [...filas.values()].filter(f => f.servidor_en > desde)
        .sort((a, b) => a.servidor_en - b.servidor_en).slice(0, pagina);
      return {
        docs: lote.map(f => structuredClone(f.doc)),
        cursor: lote.length ? cursorDe(lote.at(-1).servidor_en) : (cursor ?? cursorDe(0)),
      };
    },
    /** Estado actual del remoto, para inspeccionar en las pruebas. */
    documentos: () => [...filas.values()].map(f => structuredClone(f.doc)),
  };
  return remoto;
}
