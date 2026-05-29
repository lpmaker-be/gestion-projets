@echo off
title Gestionnaire de Projets
color 0A
echo.
echo  ========================================
echo   Gestionnaire de Projets - Demarrage
echo  ========================================
echo.
echo  Adresse : http://localhost:8742
echo  Donnees : D:\Onedrive\Documents\Claude\gestion_projets\projets.json
echo.
echo  Ferme cette fenetre pour arreter le serveur
echo.

cd /d "%~dp0"
python server.py

pause
