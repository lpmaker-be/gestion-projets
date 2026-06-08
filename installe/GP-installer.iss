; ============================================================
;  GP - Gestionnaire de Projets
;  Script Inno Setup 6
; ============================================================

#define AppName      "GP - Gestionnaire de Projets"
#define AppVersion   "1.0.0"
#define AppPublisher "Philippe lpmaker-be"
#define AppURL       "https://github.com/lpmaker-be/gestion-projets"
#define AppExeName   "GP-serveur.exe"
#define SourceDir    "dist\GP"

[Setup]
AppId={{A1B2C3D4-E5F6-7890-ABCD-EF1234567890}
AppName={#AppName}
AppVersion={#AppVersion}
AppPublisher={#AppPublisher}
AppPublisherURL={#AppURL}
DefaultDirName={autopf}\GP
DefaultGroupName={#AppName}
DisableProgramGroupPage=yes
OutputDir=dist
OutputBaseFilename=GP-Setup-{#AppVersion}
Compression=lzma2/ultra64
SolidCompression=yes
WizardStyle=modern
PrivilegesRequired=lowest
MinVersion=10.0

[Languages]
Name: "french"; MessagesFile: "compiler:Languages\French.isl"

[Tasks]
Name: "desktopicon";   Description: "Raccourci sur le Bureau";          GroupDescription: "Raccourcis :"
Name: "startmenuicon"; Description: "Entree dans le menu Demarrer";     GroupDescription: "Raccourcis :"
Name: "autostart";     Description: "Lancer GP au demarrage de Windows"; GroupDescription: "Options :"; Flags: unchecked

[Files]
Source: "{#SourceDir}\{#AppExeName}";  DestDir: "{app}"; Flags: ignoreversion
Source: "{#SourceDir}\index.html";        DestDir: "{app}"; Flags: ignoreversion
Source: "{#SourceDir}\app.js";            DestDir: "{app}"; Flags: ignoreversion
Source: "{#SourceDir}\styles.css";        DestDir: "{app}"; Flags: ignoreversion
Source: "{#SourceDir}\aide.html";         DestDir: "{app}"; Flags: ignoreversion
Source: "{#SourceDir}\presentation.html"; DestDir: "{app}"; Flags: ignoreversion
Source: "{#SourceDir}\sw.js";             DestDir: "{app}"; Flags: ignoreversion
Source: "{#SourceDir}\morphdom.min.js";   DestDir: "{app}"; Flags: ignoreversion
Source: "{#SourceDir}\favicon.svg";       DestDir: "{app}"; Flags: ignoreversion; Check: FileExists(ExpandConstant('{src}\{#SourceDir}\favicon.svg'))
Source: "{#SourceDir}\start.bat";         DestDir: "{app}"; Flags: ignoreversion

[Dirs]
Name: "{app}\data"
Name: "{app}\archives"

[Icons]
Name: "{autodesktop}\GP";       Filename: "{app}\{#AppExeName}"; Tasks: desktopicon
Name: "{group}\GP";             Filename: "{app}\{#AppExeName}"; Tasks: startmenuicon
Name: "{group}\Aide GP";        Filename: "{app}\aide.html";     Tasks: startmenuicon
Name: "{group}\Desinstaller GP"; Filename: "{uninstallexe}";     Tasks: startmenuicon
Name: "{autostartup}\GP";       Filename: "{app}\{#AppExeName}"; Tasks: autostart

[Run]
Filename: "{app}\{#AppExeName}"; Description: "Lancer GP maintenant"; Flags: nowait postinstall skipifsilent shellexec

[UninstallDelete]
Type: files; Name: "{app}\tuto.txt"
Type: files; Name: "{app}\settings.json"
Type: files; Name: "{app}\historique.json"

[Code]
function PrepareToInstall(var NeedsRestart: Boolean): String;
var DataDir: String;
begin
  DataDir := ExpandConstant('{app}\data');
  if DirExists(DataDir) then begin
    if MsgBox('Un dossier data existe deja.' + #13#10 + 'Vos projets seront conserves.' + #13#10#13#10 + 'Continuer la mise a jour ?', mbConfirmation, MB_YESNO) = IDNO then
      Result := 'Installation annulee.'
    else Result := '';
  end else Result := '';
end;
