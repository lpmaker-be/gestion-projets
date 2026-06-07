#!/bin/bash
# ============================================================
#  GP - Gestionnaire de Projets
#  Script d'installation Linux
#  Compatible : Ubuntu, Debian, Fedora, Mint, Arch...
# ============================================================

set -e

GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
BLUE='\033[0;34m'
NC='\033[0m'

GP_VERSION="1.0.0"
GP_DIR="$HOME/.local/share/GP"
BIN_DIR="$HOME/.local/bin"
DESKTOP_DIR="$HOME/.local/share/applications"

echo ""
echo -e "${BLUE}=============================================${NC}"
echo -e "${BLUE}  GP - Gestionnaire de Projets v${GP_VERSION}${NC}"
echo -e "${BLUE}  Installation Linux${NC}"
echo -e "${BLUE}=============================================${NC}"
echo ""

# ── 1. Verifier Python 3 ─────────────────────────────────
echo -e "${YELLOW}[1/5] Verification Python 3...${NC}"
if command -v python3 &>/dev/null; then
    PY=$(python3 --version)
    echo -e "${GREEN}  OK: $PY${NC}"
else
    echo -e "${RED}  ERREUR: Python 3 non installe !${NC}"
    echo "  Installez-le avec :"
    echo "    Ubuntu/Debian : sudo apt install python3"
    echo "    Fedora        : sudo dnf install python3"
    echo "    Arch          : sudo pacman -S python"
    exit 1
fi

# ── 2. Installer openpyxl (optionnel, pour export Excel) ─
echo -e "${YELLOW}[2/5] Installation dependances...${NC}"
if python3 -c "import openpyxl" &>/dev/null; then
    echo -e "${GREEN}  OK: openpyxl deja installe${NC}"
else
    echo "  Installation de openpyxl (export Excel)..."
    if pip3 install openpyxl --user --quiet 2>/dev/null || \
       pip install openpyxl --user --quiet 2>/dev/null; then
        echo -e "${GREEN}  OK: openpyxl installe${NC}"
    else
        echo -e "${YELLOW}  AVERTISSEMENT: openpyxl non installe (export Excel indisponible)${NC}"
    fi
fi

# ── 3. Copier les fichiers dans ~/.local/share/GP/ ────────
echo -e "${YELLOW}[3/5] Copie des fichiers...${NC}"
mkdir -p "$GP_DIR/data"
mkdir -p "$GP_DIR/archives"

# Detecter le repertoire source (le dossier parent de install.sh)
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SOURCE_DIR="$(dirname "$SCRIPT_DIR")"

# Copier les fichiers de l'application
for f in server.py index.html app.js styles.css aide.html presentation.html sw.js morphdom.min.js favicon.svg; do
    if [ -f "$SOURCE_DIR/$f" ]; then
        cp "$SOURCE_DIR/$f" "$GP_DIR/"
    fi
done

echo -e "${GREEN}  OK: fichiers copies dans $GP_DIR${NC}"

# ── 4. Creer le lanceur ───────────────────────────────────
echo -e "${YELLOW}[4/5] Creation du lanceur...${NC}"
mkdir -p "$BIN_DIR"

cat > "$BIN_DIR/gp-projets" << 'LAUNCHER'
#!/bin/bash
GP_DIR="$HOME/.local/share/GP"
cd "$GP_DIR"

# Ouvrir le navigateur apres 2 secondes
(sleep 2 && xdg-open "http://localhost:8742" 2>/dev/null || \
           python3 -m webbrowser "http://localhost:8742") &

echo ""
echo "  ========================================"
echo "   GP - Gestionnaire de Projets"
echo "  ========================================"
echo ""
echo "  Adresse : http://localhost:8742"
echo "  Donnees : $GP_DIR/data"
echo ""
echo "  Ctrl+C pour arreter le serveur"
echo ""
python3 server.py
LAUNCHER

chmod +x "$BIN_DIR/gp-projets"
echo -e "${GREEN}  OK: lanceur cree dans $BIN_DIR/gp-projets${NC}"

# Ajouter ~/.local/bin au PATH si pas deja present
if [[ ":$PATH:" != *":$HOME/.local/bin:"* ]]; then
    echo ""
    echo -e "${YELLOW}  ATTENTION: $HOME/.local/bin n'est pas dans votre PATH${NC}"
    echo "  Ajoutez cette ligne a ~/.bashrc ou ~/.zshrc :"
    echo "    export PATH=\"\$HOME/.local/bin:\$PATH\""
fi

# ── 5. Creer l'entree .desktop ───────────────────────────
echo -e "${YELLOW}[5/5] Creation raccourci bureau...${NC}"
mkdir -p "$DESKTOP_DIR"

cat > "$DESKTOP_DIR/gp-projets.desktop" << DESKTOP
[Desktop Entry]
Version=1.0
Type=Application
Name=GP - Gestionnaire de Projets
GenericName=Gestionnaire de Projets
Comment=Gestionnaire de projets local pour Makers
Exec=$BIN_DIR/gp-projets
Icon=$GP_DIR/favicon.svg
Terminal=true
Categories=Office;ProjectManagement;
Keywords=projet;gestion;maker;arduino;
StartupNotify=true
DESKTOP

chmod +x "$DESKTOP_DIR/gp-projets.desktop"
update-desktop-database "$DESKTOP_DIR" 2>/dev/null || true
echo -e "${GREEN}  OK: raccourci bureau cree${NC}"

# ── Résumé ────────────────────────────────────────────────
echo ""
echo -e "${GREEN}=============================================${NC}"
echo -e "${GREEN}  Installation terminee !${NC}"
echo -e "${GREEN}=============================================${NC}"
echo ""
echo -e "  Lancer GP :  ${BLUE}gp-projets${NC}"
echo -e "  Ou depuis le menu Applications"
echo -e "  Ou : ${BLUE}python3 $GP_DIR/server.py${NC}"
echo ""
echo -e "  Acces : ${BLUE}http://localhost:8742${NC}"
echo ""
