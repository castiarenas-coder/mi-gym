; Instalador de Rumbo Fit (Inno Setup 6). Lo arma `npm run instalador` pasando:
;   /DAppVersion=x.y.z  /DStaging=<carpeta armada>  /DSalida=<carpeta de salida>
; Instala por usuario (sin permisos de administrador). Los datos viven en %APPDATA%\Mi Gym, fuera de la
; carpeta de instalacion: reinstalar o actualizar no los toca y desinstalar tampoco los borra.

#ifndef AppVersion
  #define AppVersion "0.0.0"
#endif
#ifndef Staging
  #error Falta /DStaging=<carpeta>
#endif
#ifndef Salida
  #define Salida "."
#endif

[Setup]
; GUID fijo: una version nueva se instala encima de la anterior.
AppId={{8C1F6E2A-3B47-4D5E-9A10-6F2D7B9C4E31}
AppName=Rumbo Fit
AppVersion={#AppVersion}
AppVerName=Rumbo Fit {#AppVersion}
AppPublisher=Rumbo Fit
AppPublisherURL=https://github.com/castiarenas-coder/mi-gym
AppSupportURL=https://github.com/castiarenas-coder/mi-gym/issues
AppUpdatesURL=https://github.com/castiarenas-coder/mi-gym/releases
VersionInfoVersion={#AppVersion}
DefaultDirName={localappdata}\Programs\Mi Gym
DefaultGroupName=Rumbo Fit
DisableProgramGroupPage=yes
DisableDirPage=yes
DisableReadyPage=yes
PrivilegesRequired=lowest
ArchitecturesAllowed=x64compatible
ArchitecturesInstallIn64BitMode=x64compatible
SetupIconFile={#Staging}\mi-gym.ico
UninstallDisplayIcon={app}\mi-gym.ico
UninstallDisplayName=Rumbo Fit
OutputDir={#Salida}
OutputBaseFilename=Rumbo-Fit-Setup-{#AppVersion}
Compression=lzma2/max
SolidCompression=yes
WizardStyle=modern
CloseApplications=no

[Languages]
Name: "spanish"; MessagesFile: "compiler:Languages\Spanish.isl"

[Tasks]
Name: "desktopicon"; Description: "Crear un acceso directo en el Escritorio"; GroupDescription: "Accesos directos:"; Flags: unchecked

[InstallDelete]
; Las versiones nuevas reemplazan el programa completo (los datos del usuario no estan aca).
Type: filesandordirs; Name: "{app}\server"
Type: filesandordirs; Name: "{app}\client"
Type: filesandordirs; Name: "{app}\catalogo"
Type: filesandordirs; Name: "{app}\node_modules"

[Files]
Source: "{#Staging}\*"; DestDir: "{app}"; Flags: ignoreversion recursesubdirs createallsubdirs

[Icons]
Name: "{autoprograms}\Rumbo Fit"; Filename: "{sys}\wscript.exe"; Parameters: """{app}\mi-gym.vbs"""; WorkingDir: "{app}"; IconFilename: "{app}\mi-gym.ico"; Comment: "Ejercicios, rutinas y progreso"
Name: "{autoprograms}\Desinstalar Rumbo Fit"; Filename: "{uninstallexe}"
Name: "{autodesktop}\Rumbo Fit"; Filename: "{sys}\wscript.exe"; Parameters: """{app}\mi-gym.vbs"""; WorkingDir: "{app}"; IconFilename: "{app}\mi-gym.ico"; Comment: "Ejercicios, rutinas y progreso"; Tasks: desktopicon

[Run]
Filename: "{sys}\wscript.exe"; Parameters: """{app}\mi-gym.vbs"""; WorkingDir: "{app}"; Description: "Abrir Rumbo Fit"; Flags: nowait postinstall skipifsilent

[Code]
// El servidor queda corriendo en segundo plano: hay que cerrarlo para poder reemplazar o borrar sus archivos.
procedure CerrarServidor();
var
  Codigo: Integer;
begin
  Exec(ExpandConstant('{sys}\taskkill.exe'), '/F /T /IM MiGymServidor.exe', '', SW_HIDE, ewWaitUntilTerminated, Codigo);
  Sleep(600);
end;

function PrepareToInstall(var NeedsRestart: Boolean): String;
begin
  CerrarServidor();
  Result := '';
end;

function InitializeUninstall(): Boolean;
begin
  CerrarServidor();
  Result := True;
end;

procedure CurUninstallStepChanged(CurUninstallStep: TUninstallStep);
begin
  if CurUninstallStep = usPostUninstall then
    MsgBox('Rumbo Fit se desinstaló.' + #13#10 + #13#10 +
           'Tus datos (rutinas, entrenamientos, medidas y respaldos) NO se borraron: siguen en' + #13#10 +
           ExpandConstant('{userappdata}\Mi Gym') + #13#10 +
           'Si volvés a instalar Rumbo Fit, los vas a encontrar tal cual. Si ya no los querés, borrá esa carpeta.',
           mbInformation, MB_OK);
end;
