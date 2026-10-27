; Installatore dell'Agente di stampa per Windows (Inno Setup 6).
; Lo compila GitHub (.github/workflows/agente-windows.yml):  ISCC /DVersione=1.1.0 installatore.iss
; - si installa solo per l'utente di Windows, senza chiedere i permessi di amministratore;
; - icone sul desktop e nel menu Start (aprono la pagina dell'agente);
; - parte da solo all'accensione del PC (cartella Esecuzione automatica), senza finestre;
; - in modo silenzioso (/VERYSILENT) è l'aggiornamento automatico: chiude l'agente, lo sostituisce e lo riapre.

#ifndef Versione
  #define Versione "0.0.0"
#endif

[Setup]
AppId={{8F25D25E-6116-4749-BF29-B56385E840E5}
AppName=Agente di stampa
AppVersion={#Versione}
AppVerName=Agente di stampa {#Versione}
AppPublisher=Gestionale Ristoranti
VersionInfoVersion={#Versione}
VersionInfoDescription=Installazione dell'Agente di stampa
DefaultDirName={autopf}\Agente di stampa
PrivilegesRequired=lowest
DisableDirPage=yes
DisableProgramGroupPage=yes
ShowLanguageDialog=no
WizardStyle=modern
SetupIconFile=icona.ico
UninstallDisplayIcon={app}\AgenteStampa.exe
UninstallDisplayName=Agente di stampa
OutputDir=..\..\build
OutputBaseFilename=AgenteStampa-Setup
Compression=lzma2/max
SolidCompression=yes
ArchitecturesAllowed=x64compatible
ArchitecturesInstallIn64BitMode=x64compatible
MinVersion=10.0
CloseApplications=no
SetupLogging=yes

[Languages]
Name: "it"; MessagesFile: "compiler:Languages\Italian.isl"

[Files]
Source: "..\..\build\AgenteStampa.exe"; DestDir: "{app}"; Flags: ignoreversion
Source: "..\..\build\LICENSE-Node.js.txt"; DestDir: "{app}\Licenze"; Flags: ignoreversion

[Icons]
Name: "{autoprograms}\Agente di stampa"; Filename: "{app}\AgenteStampa.exe"; Comment: "Apre la pagina dell'Agente di stampa"
Name: "{autodesktop}\Agente di stampa"; Filename: "{app}\AgenteStampa.exe"; Comment: "Apre la pagina dell'Agente di stampa"
Name: "{autostartup}\Agente di stampa"; Filename: "{app}\AgenteStampa.exe"; Parameters: "--avvio"

[Run]
; Installazione normale: apre la pagina per collegarlo al locale
Filename: "{app}\AgenteStampa.exe"; Description: "Apri l'Agente di stampa"; Flags: nowait postinstall skipifsilent
; Aggiornamento automatico (silenzioso): lo riaccende senza aprire niente
Filename: "{app}\AgenteStampa.exe"; Parameters: "--avvio"; Flags: nowait skipifnotsilent

[UninstallRun]
Filename: "{sys}\taskkill.exe"; Parameters: "/F /IM AgenteStampa.exe"; Flags: runhidden; RunOnceId: "ChiudiAgente"

[UninstallDelete]
; Accesso salvato e registro
Type: filesandordirs; Name: "{userappdata}\Agente di stampa"

[Code]
// Prima di sostituire il programma lo chiude (aggiornamento o reinstallazione)
function PrepareToInstall(var NeedsRestart: Boolean): String;
var
  Codice: Integer;
begin
  Exec(ExpandConstant('{sys}\taskkill.exe'), '/F /IM AgenteStampa.exe', '', SW_HIDE, ewWaitUntilTerminated, Codice);
  Sleep(800);
  Result := '';
end;
