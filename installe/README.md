# Dossier `installe/`

Contient tous les fichiers pour créer l'installeur Windows.

## Contenu

| Fichier | Rôle |
|---|---|
| `BUILD.bat` | Lance le build complet (PyInstaller + Inno Setup) |
| `GP.spec` | Configuration PyInstaller |
| `GP-installer.iss` | Script Inno Setup |
| `dist/` | Généré par le build (gité ignoré) |
| `build/` | Temporaire PyInstaller (gité ignoré) |

## Prérequis

- Python 3 + PyInstaller : `pip install pyinstaller`
- [Inno Setup 6](https://jrsoftware.org/isdl.php)

## Lancement

```
cd installe
BUILD.bat
```

Résultat : `installe\dist\GP-Setup-1.0.0.exe`
