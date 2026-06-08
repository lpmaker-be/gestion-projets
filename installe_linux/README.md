# GP - Installation Linux

## Installation rapide

```bash
git clone https://github.com/lpmaker-be/gestion-projets.git
cd gestion-projets/installe_linux
chmod +x install.sh
./install.sh
```

Puis lancer :
```bash
gp-projets
```

## Prérequis

- Python 3 (pré-installé sur la plupart des distributions)

```bash
# Ubuntu/Debian/Mint
sudo apt install python3 python3-pip

# Fedora
sudo dnf install python3 python3-pip

# Arch
sudo pacman -S python python-pip
```

## Ce que fait l'installateur

| Emplacement | Contenu |
|---|---|
| `~/.local/share/GP/` | Fichiers application |
| `~/.local/share/GP/data/` | Vos projets |
| `~/.local/share/GP/archives/` | Archives ZIP |
| `~/.local/bin/gp-projets` | Lanceur |
| `~/.local/share/applications/gp-projets.desktop` | Raccourci menu |

## Mise à jour

```bash
git pull
cd installe_linux
./install.sh
```

## Désinstallation

```bash
./uninstall.sh
```
Vos projets sont sauvegardés automatiquement avant suppression.
