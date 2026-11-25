// Minúsculas y sin acentos: así "Sentadilla", "sentadilla" y "SENTADÍLLA" se buscan igual.
export function normalizar(texto) {
  return String(texto ?? '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();
}
