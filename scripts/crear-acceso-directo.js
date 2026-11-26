// Crea el acceso directo "Rumbo Fit" en el Escritorio (Windows). Al abrirlo: levanta el servidor oculto si
// no está corriendo (compilando la interfaz antes si falta client/dist) y abre la app en el navegador.
//   npm run acceso-directo                    crea el acceso directo en el Escritorio
//   npm run acceso-directo -- --quitar        lo borra
//   npm run acceso-directo -- --destino DIR   lo crea en otra carpeta (para pruebas)
// El lanzador (data/mi-gym.vbs) lleva rutas absolutas: si movés la carpeta del proyecto, volvé a correr el comando.
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const raizPorDefecto = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const NOMBRE = 'Rumbo Fit';

// Las comillas se duplican dentro de un literal de VBScript.
const q = s => String(s).replace(/"/g, '""');

export function generarLanzador({ raiz = raizPorDefecto, node = process.execPath, puerto = 8788 } = {}) {
  const url = `http://127.0.0.1:${puerto}`;
  const log = path.join(raiz, 'data', 'server.log');
  const indice = path.join(raiz, 'client', 'dist', 'index.html');
  const servidor = `cmd /c ""${q(node)}" "${q(path.join(raiz, 'server', 'index.js'))}" >> "${q(log)}" 2>&1"`;
  const compilar = `cmd /c "cd /d "${q(raiz)}" && npm run build >> "${q(log)}" 2>&1"`;
  return [
    "' Rumbo Fit: levanta el servidor (si hace falta) y abre la app. No muestra ninguna consola.",
    'Set sh = CreateObject("WScript.Shell")',
    'Set fso = CreateObject("Scripting.FileSystemObject")',
    `sh.CurrentDirectory = "${q(raiz)}"`,
    `url = "${url}"`,
    '',
    'Function Arriba()',
    '  Arriba = False',
    '  On Error Resume Next',
    '  Set http = CreateObject("MSXML2.ServerXMLHTTP")',
    '  http.setTimeouts 1000, 1000, 1000, 1000',
    '  http.open "GET", url & "/api/salud", False',
    '  http.send',
    '  If Err.Number = 0 Then If http.status = 200 Then Arriba = True',
    '  On Error GoTo 0',
    'End Function',
    '',
    'If Not Arriba() Then',
    `  If Not fso.FolderExists("${q(path.join(raiz, 'data'))}") Then fso.CreateFolder "${q(path.join(raiz, 'data'))}"`,
    `  If Not fso.FileExists("${q(indice)}") Then sh.Run "${q(compilar)}", 0, True`,
    `  sh.Run "${q(servidor)}", 0, False`,
    '  For i = 1 To 60',
    '    If Arriba() Then Exit For',
    '    WScript.Sleep 500',
    '  Next',
    'End If',
    'sh.Run url, 1, False',
    '',
  ].join('\r\n');
}

function carpetaEscritorio() {
  const ps = '[Environment]::GetFolderPath("Desktop")';
  return execFileSync('powershell', ['-NoProfile', '-Command', ps], { encoding: 'utf8' }).trim();
}

export function crearAccesoDirecto({ raiz = raizPorDefecto, destino, node = process.execPath, puerto = 8788 } = {}) {
  const carpeta = destino ?? carpetaEscritorio();
  fs.mkdirSync(path.join(raiz, 'data'), { recursive: true });
  const vbs = path.join(raiz, 'data', 'mi-gym.vbs');
  fs.writeFileSync(vbs, generarLanzador({ raiz, node, puerto }));
  const lnk = path.join(carpeta, `${NOMBRE}.lnk`);
  const wscript = path.join(process.env.WINDIR ?? 'C:\\Windows', 'System32', 'wscript.exe');
  const ps = [
    '$sh = New-Object -ComObject WScript.Shell',
    `$l = $sh.CreateShortcut('${lnk.replace(/'/g, "''")}')`,
    `$l.TargetPath = '${wscript.replace(/'/g, "''")}'`,
    `$l.Arguments = '"${vbs.replace(/'/g, "''")}"'`,
    `$l.WorkingDirectory = '${raiz.replace(/'/g, "''")}'`,
    `$l.Description = '${NOMBRE}: ejercicios, rutinas y progreso'`,
    `$l.IconLocation = '${node.replace(/'/g, "''")},0'`,
    '$l.Save()',
  ].join('; ');
  execFileSync('powershell', ['-NoProfile', '-Command', ps], { stdio: 'pipe' });
  return { lnk, vbs };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  if (process.platform !== 'win32') { console.error('El acceso directo solo está preparado para Windows.'); process.exit(1); }
  const i = process.argv.indexOf('--destino');
  const destino = i > 0 ? path.resolve(process.argv[i + 1]) : undefined;
  if (process.argv.includes('--quitar')) {
    const lnk = path.join(destino ?? carpetaEscritorio(), `${NOMBRE}.lnk`);
    fs.rmSync(lnk, { force: true });
    console.log(`Acceso directo quitado: ${lnk}`);
  } else {
    const { lnk } = crearAccesoDirecto({ destino });
    console.log(`Listo: ${lnk}`);
    console.log('Al abrirlo arranca Rumbo Fit (si hace falta) y lo abre en el navegador.');
  }
}
