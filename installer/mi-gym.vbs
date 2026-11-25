' Mi Gym: lanzador de la version instalada. No muestra ninguna consola.
' 1) Si SU servidor no responde, lo arranca oculto (datos en %APPDATA%\Mi Gym).
' 2) Espera a que este listo y abre la app en una ventana propia (Edge/Chrome en modo app) o en el navegador.
' Si el puerto 8788 lo usa otra aplicacion, el servidor toma el siguiente libre y lo anota en puerto.txt.
' Los errores se anotan en %APPDATA%\Mi Gym\lanzador.log (nunca un mensaje de Windows Script Host).
Option Explicit

Dim sh, fso, app, datos, archivoPuerto, cerrojo, log, logLanzador, puerto, i, propio, env, url
Set sh = CreateObject("WScript.Shell")
Set fso = CreateObject("Scripting.FileSystemObject")

app = fso.GetParentFolderName(WScript.ScriptFullName)
datos = sh.ExpandEnvironmentStrings("%APPDATA%") & "\Mi Gym"
archivoPuerto = datos & "\puerto.txt"
cerrojo = datos & "\arranque.lock"
log = datos & "\server.log"
logLanzador = datos & "\lanzador.log"
On Error Resume Next
If Not fso.FolderExists(datos) Then fso.CreateFolder datos
On Error GoTo 0

Sub Anotar(texto)
  On Error Resume Next
  Dim f
  Set f = fso.OpenTextFile(logLanzador, 8, True)
  f.WriteLine Now & " " & texto
  f.Close
  On Error GoTo 0
End Sub

Function LeerPuerto()
  LeerPuerto = 8788
  On Error Resume Next
  If fso.FileExists(archivoPuerto) Then
    Dim t
    t = Trim(fso.OpenTextFile(archivoPuerto, 1).ReadAll())
    If IsNumeric(t) Then If CLng(t) > 0 And CLng(t) < 65536 Then LeerPuerto = CLng(t)
  End If
  On Error GoTo 0
End Function

' Hay un Mi Gym en ese puerto Y usa ESTA carpeta de datos? (Otra copia de Mi Gym, p. ej. una de desarrollo, no cuenta.)
Function Arriba(p)
  Arriba = False
  On Error Resume Next
  Dim http, txt
  Set http = CreateObject("MSXML2.ServerXMLHTTP")
  http.setTimeouts 1000, 1000, 1000, 1000
  http.open "GET", "http://127.0.0.1:" & p & "/api/info", False
  http.send
  If Err.Number = 0 Then
    If http.status = 200 Then
      ' El JSON escapa las barras invertidas (\\): se normalizan antes de comparar.
      txt = LCase(Replace(http.responseText, "\\", "\"))
      If InStr(txt, LCase(datos & "\mi_gym.db")) > 0 Then Arriba = True
    End If
  End If
  On Error GoTo 0
End Function

' Crea arranque.lock; devuelve False si otro lanzador ya lo tiene. Un cerrojo viejo (>90 s) se descarta.
Function TomarCerrojo()
  TomarCerrojo = False
  On Error Resume Next
  If fso.FileExists(cerrojo) Then
    If DateDiff("s", fso.GetFile(cerrojo).DateLastModified, Now) > 90 Then fso.DeleteFile cerrojo, True
  End If
  Err.Clear
  Dim f
  Set f = fso.CreateTextFile(cerrojo, False)
  If Err.Number = 0 Then
    f.Close
    TomarCerrojo = True
  End If
  On Error GoTo 0
End Function

Function Buscar(rutas)
  Dim r
  Buscar = ""
  For Each r In rutas
    If r <> "" Then
      If fso.FileExists(r) Then
        Buscar = r
        Exit Function
      End If
    End If
  Next
End Function

Function RutaEdge()
  Dim r
  r = ""
  On Error Resume Next
  r = sh.RegRead("HKLM\SOFTWARE\Microsoft\Windows\CurrentVersion\App Paths\msedge.exe\")
  If r = "" Then r = sh.RegRead("HKCU\SOFTWARE\Microsoft\Windows\CurrentVersion\App Paths\msedge.exe\")
  Err.Clear
  On Error GoTo 0
  r = Replace(Trim(r), """", "")
  If r <> "" Then
    If Not fso.FileExists(r) Then r = ""
  End If
  If r = "" Then
    r = Buscar(Array(sh.ExpandEnvironmentStrings("%ProgramFiles(x86)%") & "\Microsoft\Edge\Application\msedge.exe", _
                     sh.ExpandEnvironmentStrings("%ProgramFiles%") & "\Microsoft\Edge\Application\msedge.exe", _
                     sh.ExpandEnvironmentStrings("%LOCALAPPDATA%") & "\Microsoft\Edge\Application\msedge.exe"))
  End If
  RutaEdge = r
End Function

Function RutaChrome()
  RutaChrome = Buscar(Array(sh.ExpandEnvironmentStrings("%ProgramFiles%") & "\Google\Chrome\Application\chrome.exe", _
                            sh.ExpandEnvironmentStrings("%ProgramFiles(x86)%") & "\Google\Chrome\Application\chrome.exe", _
                            sh.ExpandEnvironmentStrings("%LOCALAPPDATA%") & "\Google\Chrome\Application\chrome.exe"))
End Function

' Abre la ventana de la app; si algo falla, cae al navegador predeterminado.
Sub AbrirVentana(direccion)
  Dim navegador, comando, ok
  ok = False
  navegador = RutaEdge()
  If navegador = "" Then navegador = RutaChrome()
  If navegador <> "" Then
    ' Se lanza con "cmd /c start": wscript no puede ejecutar msedge.exe directamente (error -1) en algunas PCs.
    comando = "cmd /c start """" """ & navegador & """ --app=" & direccion & " --user-data-dir=""" & datos & "\ventana"" --no-first-run --no-default-browser-check --window-size=1200,860"
    On Error Resume Next
    sh.Run comando, 0, False
    If Err.Number = 0 Then
      ok = True
    Else
      Anotar "No se pudo abrir la ventana (" & Err.Number & ": " & Err.Description & "): " & comando
      Err.Clear
    End If
    On Error GoTo 0
  End If
  If Not ok Then
    On Error Resume Next
    sh.Run direccion, 1, False
    If Err.Number <> 0 Then Anotar "Tampoco se pudo abrir el navegador predeterminado (" & Err.Number & ": " & Err.Description & ")"
    On Error GoTo 0
  End If
End Sub

puerto = LeerPuerto()

If Not Arriba(puerto) Then
  ' Un solo lanzador arranca el servidor: si alguien hace doble clic dos veces, el segundo solo espera.
  propio = TomarCerrojo()
  If propio Then
    ' El puerto.txt que quede es de una corrida anterior: se borra para leer el nuevo.
    On Error Resume Next
    If fso.FileExists(archivoPuerto) Then fso.DeleteFile archivoPuerto, True
    ' El registro no crece sin limite.
    If fso.FileExists(log) Then
      If fso.GetFile(log).Size > 5242880 Then fso.DeleteFile log, True
    End If
    On Error GoTo 0
    Set env = sh.Environment("PROCESS")
    env("MI_GYM_DATA") = datos
    env("MI_GYM_IMG") = app & "\catalogo\img"
    env("MI_GYM_CATALOGO") = app & "\catalogo"
    env("MI_GYM_INSTALADO") = "1"
    sh.CurrentDirectory = app
    Dim cmd
    cmd = "cmd /c """"" & app & "\MiGymServidor.exe"" ""server\index.js"" >> """ & log & """ 2>&1"""
    On Error Resume Next
    sh.Run cmd, 0, False
    If Err.Number <> 0 Then
      Anotar "No se pudo arrancar el servidor (" & Err.Number & ": " & Err.Description & "): " & cmd
      Err.Clear
    End If
    On Error GoTo 0
  End If
  For i = 1 To 120
    WScript.Sleep 500
    If fso.FileExists(archivoPuerto) Then
      puerto = LeerPuerto()
      If Arriba(puerto) Then Exit For
    End If
  Next
  If propio Then
    On Error Resume Next
    fso.DeleteFile cerrojo, True
    On Error GoTo 0
  End If
  If Not Arriba(puerto) Then
    Anotar "El servidor no respondio a tiempo (puerto " & puerto & ")."
    MsgBox "Mi Gym no pudo arrancar." & vbCrLf & vbCrLf & "Si el problema sigue, reinstalalo o revisa este archivo:" & vbCrLf & log, vbExclamation, "Mi Gym"
    WScript.Quit 1
  End If
End If

url = "http://127.0.0.1:" & puerto
AbrirVentana url
