@echo off
title Gestionnaire de Projets
color 0A
echo.
echo  ========================================
echo   Gestionnaire de Projets - Demarrage
echo  ========================================
echo.
echo  Dossier donnees : D:\claude\gestion_projets\
echo  Adresse         : http://localhost:8742
echo.
echo  Ferme cette fenetre pour arreter le serveur
echo.

cd /d "%~dp0"
python server.py

pause
