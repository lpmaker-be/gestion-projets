# GP - Installation Linux

## Installation rapide

```bash
git clone https://github.com/lpmaker-be/gestion-projets.git
cd gestion-projets/linux
chmod +x install.sh
./install.sh
```

Puis lancer GP :
```bash
gp-projets
```

Ou ouvrir directement : http://localhost:8742

## Prérequis

- Python 3.8+ (généralement pré-installé)
- pip3 (pour l'export Excel optionnel)

```bash
# Ubuntu/Debian/Mint
sudo apt install python3 python3-pip

# Fedora
sudo dnf install python3 python3-pip

# Arch Linux
sudo pacman -S python python-pip
```

## Ce que fait l'installeur

| Dossier | Contenu |
|---|---|
| `~/.local/share/GP/` | Fichiers de l'application |
| `~/.local/share/GP/data/` | Vos projets |
| `~/.local/share/GP/archives/` | Archives ZIP |
| `~/.local/bin/gp-projets` | Lanceur |
| `~/.local/share/applications/gp-projets.desktop` | Raccourci bureau |

## Désinstallation

```bash
cd gestion-projets/linux
chmod +x uninstall.sh
./uninstall.sh
```

Vos projets dans `data/` sont sauvegardés automatiquement avant suppression.

## Mise à jour

```bash
git pull
cd linux
./install.sh
```
