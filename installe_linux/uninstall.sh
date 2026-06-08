#!/bin/bash
# ============================================================
#  GP - Desinstallation Linux
# ============================================================

RED='\033[0;31m'; GREEN='\033[0;32m'; YELLOW='\033[1;33m'; NC='\033[0m'

GP_DIR="$HOME/.local/share/GP"
BIN_FILE="$HOME/.local/bin/gp-projets"
DESKTOP_FILE="$HOME/.local/share/applications/gp-projets.desktop"

echo ""
echo -e "${RED}=============================================${NC}"
echo -e "${RED}  GP - Desinstallation${NC}"
echo -e "${RED}=============================================${NC}"
echo ""

read -p "Supprimer GP ? Vos projets dans data/ seront conserves. [o/N] " confirm
[[ "$confirm" != "o" && "$confirm" != "O" ]] && echo "Annule." && exit 0

# Sauvegarder les donnees
if [ -d "$GP_DIR/data" ] && [ "$(ls -A $GP_DIR/data 2>/dev/null)" ]; then
    BACKUP="$HOME/GP-backup-$(date +%Y%m%d_%H%M%S)"
    cp -r "$GP_DIR/data" "$BACKUP"
    cp -r "$GP_DIR/archives" "${BACKUP}-archives" 2>/dev/null || true
    echo -e "${YELLOW}  Projets sauvegardes : $BACKUP${NC}"
fi

[ -d "$GP_DIR" ]       && rm -rf "$GP_DIR"       && echo -e "${GREEN}  Supprime: $GP_DIR${NC}"
[ -f "$BIN_FILE" ]     && rm "$BIN_FILE"          && echo -e "${GREEN}  Supprime: $BIN_FILE${NC}"
[ -f "$DESKTOP_FILE" ] && rm "$DESKTOP_FILE"      && echo -e "${GREEN}  Supprime: $DESKTOP_FILE${NC}"
update-desktop-database "$HOME/.local/share/applications" 2>/dev/null || true

echo ""
echo -e "${GREEN}  Desinstallation terminee.${NC}"
echo ""
