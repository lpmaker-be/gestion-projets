#!/bin/bash
# ============================================================
#  GP - Gestionnaire de Projets
#  Installateur Linux
#  Compatible : Ubuntu, Debian, Fedora, Mint, Arch...
# ============================================================

set -e
GREEN='\033[0;32m'; YELLOW='\033[1;33m'; RED='\033[0;31m'; BLUE='\033[0;34m'; NC='\033[0m'

GP_DIR="$HOME/.local/share/GP"
BIN_DIR="$HOME/.local/bin"
DESKTOP_DIR="$HOME/.local/share/applications"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SOURCE_DIR="$(dirname "$SCRIPT_DIR")"

echo ""
echo -e "${BLUE}=============================================${NC}"
echo -e "${BLUE}  GP - Gestionnaire de Projets${NC}"
echo -e "${BLUE}  Installation Linux${NC}"
echo -e "${BLUE}=============================================${NC}"
echo ""

# 1. Verifier Python 3
echo -e "${YELLOW}[1/5] Verification Python 3...${NC}"
if command -v python3 &>/dev/null; then
    echo -e "${GREEN}  OK: $(python3 --version)${NC}"
else
    echo -e "${RED}  ERREUR: Python 3 non installe !${NC}"
    echo "  Ubuntu/Debian : sudo apt install python3"
    echo "  Fedora        : sudo dnf install python3"
    echo "  Arch          : sudo pacman -S python"
    exit 1
fi

# 2. Installer openpyxl (export Excel optionnel)
echo -e "${YELLOW}[2/5] Dependances...${NC}"
if python3 -c "import openpyxl" &>/dev/null; then
    echo -e "${GREEN}  OK: openpyxl deja installe${NC}"
else
    pip3 install openpyxl --user --quiet 2>/dev/null && \
        echo -e "${GREEN}  OK: openpyxl installe${NC}" || \
        echo -e "${YELLOW}  AVERT: openpyxl non installe (export Excel indisponible)${NC}"
fi

# 3. Copier les fichiers
echo -e "${YELLOW}[3/5] Copie des fichiers...${NC}"
mkdir -p "$GP_DIR/data" "$GP_DIR/archives"
for f in server.py index.html app.js styles.css aide.html presentation.html sw.js morphdom.min.js favicon.svg; do
    [ -f "$SOURCE_DIR/$f" ] && cp "$SOURCE_DIR/$f" "$GP_DIR/"
done
echo -e "${GREEN}  OK: fichiers copies dans $GP_DIR${NC}"

# 4. Creer le lanceur
echo -e "${YELLOW}[4/5] Creation lanceur...${NC}"
mkdir -p "$BIN_DIR"
cat > "$BIN_DIR/gp-projets" << 'LAUNCHER'
#!/bin/bash
cd "$HOME/.local/share/GP"
(sleep 2 && xdg-open "http://localhost:8742" 2>/dev/null || python3 -m webbrowser "http://localhost:8742") &
echo ""
echo "  ====================================="
echo "   GP - Gestionnaire de Projets"
echo "  ====================================="
echo "  http://localhost:8742"
echo "  Ctrl+C pour arreter"
echo ""
python3 server.py
LAUNCHER
chmod +x "$BIN_DIR/gp-projets"
echo -e "${GREEN}  OK: $BIN_DIR/gp-projets${NC}"

# Ajouter ~/.local/bin au PATH si besoin
[[ ":$PATH:" != *":$HOME/.local/bin:"* ]] && \
    echo -e "${YELLOW}  ATTENTION: Ajoutez export PATH=\"\$HOME/.local/bin:\$PATH\" a votre ~/.bashrc${NC}"

# 5. Raccourci bureau
echo -e "${YELLOW}[5/5] Raccourci bureau...${NC}"
mkdir -p "$DESKTOP_DIR"
cat > "$DESKTOP_DIR/gp-projets.desktop" << DESKTOP
[Desktop Entry]
Version=1.0
Type=Application
Name=GP - Gestionnaire de Projets
Comment=Gestionnaire de projets local pour Makers
Exec=$BIN_DIR/gp-projets
Icon=$GP_DIR/favicon.svg
Terminal=true
Categories=Office;ProjectManagement;
DESKTOP
chmod +x "$DESKTOP_DIR/gp-projets.desktop"
update-desktop-database "$DESKTOP_DIR" 2>/dev/null || true
echo -e "${GREEN}  OK: raccourci cree${NC}"

echo ""
echo -e "${GREEN}=============================================${NC}"
echo -e "${GREEN}  Installation terminee !${NC}"
echo -e "${GREEN}=============================================${NC}"
echo -e "  Lancer : ${BLUE}gp-projets${NC}  ou depuis le menu Applications"
echo -e "  Acces  : ${BLUE}http://localhost:8742${NC}"
echo ""
