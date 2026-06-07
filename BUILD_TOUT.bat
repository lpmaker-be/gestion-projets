@echo off
cd /d "D:\Onedrive\Documents\Claude\gestion_projets"

echo =============================================
echo  Build GP complet - PyInstaller + Inno Setup
echo =============================================
echo.

echo [1/4] Nettoyage...
if exist "build" rmdir /s /q "build"
echo OK

echo [2/4] PyInstaller...
pyinstaller --clean GP.spec
if errorlevel 1 ( echo ERREUR PyInstaller & pause & exit /b 1 )
echo OK

echo [3/4] Distribution...
if not exist "dist\GP" mkdir "dist\GP"
copy /y "dist\GP-serveur.exe"  "dist\GP\" >nul
copy /y "index.html"           "dist\GP\" >nul
copy /y "app.js"               "dist\GP\" >nul
copy /y "styles.css"           "dist\GP\" >nul
copy /y "aide.html"            "dist\GP\" >nul
copy /y "presentation.html"    "dist\GP\" >nul
copy /y "sw.js"                "dist\GP\" >nul
copy /y "morphdom.min.js"      "dist\GP\" >nul
if exist "favicon.svg" copy /y "favicon.svg" "dist\GP\" >nul
if not exist "dist\GP\data"     mkdir "dist\GP\data"
if not exist "dist\GP\archives" mkdir "dist\GP\archives"
(echo @echo off
echo cd /d "%%~dp0"
echo start "" "GP-serveur.exe"
echo timeout /t 2 /nobreak ^>nul
echo start "" "http://localhost:8742") > "dist\GP\start.bat"
echo OK

echo [4/4] Inno Setup...
if not exist "installer" mkdir "installer"
"C:\Program Files (x86)\Inno Setup 6\ISCC.exe" GP-installer.iss
if errorlevel 1 ( echo ERREUR Inno Setup & pause & exit /b 1 )

echo.
echo =============================================
echo  SUCCES !
echo  Installeur : installer\GP-Setup-1.0.0.exe
echo =============================================
pause
