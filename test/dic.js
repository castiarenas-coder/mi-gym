import fs from 'node:fs';
export const DICCIONARIO = JSON.parse(fs.readFileSync(new URL('../scripts/traducciones/diccionario.json', import.meta.url), 'utf8'));
