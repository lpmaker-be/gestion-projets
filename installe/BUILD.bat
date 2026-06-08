@echo off
cd /d "%~dp0"

echo.
echo  ============================================
echo   BUILD GP - PyInstaller + Inno Setup
echo  ============================================
echo.

REM --- Verifier que server.py existe dans le dossier parent
if not exist "..\server.py" (
    echo ERREUR: server.py non trouve dans le dossier parent !
    pause & exit /b 1
)

REM --- Verifier PyInstaller
pyinstaller --version >nul 2>&1
if errorlevel 1 (
    echo ERREUR: PyInstaller non installe.
    echo Installez-le avec: pip install pyinstaller
    pause & exit /b 1
)

REM --- Verifier Inno Setup
set ISCC="C:\Program Files (x86)\Inno Setup 6\ISCC.exe"
if not exist %ISCC% (
    echo ERREUR: Inno Setup 6 non installe.
    echo Telechargez sur : https://jrsoftware.org/isdl.php
    pause & exit /b 1
)

echo [1/4] Nettoyage...
if exist "build" rmdir /s /q "build"
if exist "dist"  rmdir /s /q "dist"
echo OK

echo [2/4] PyInstaller...
pyinstaller --clean GP.spec
if errorlevel 1 ( echo ERREUR PyInstaller & pause & exit /b 1 )
echo OK

echo [3/4] Copie fichiers statiques...
if not exist "dist\GP" mkdir "dist\GP"
copy /y "..\index.html"        "dist\GP\" >nul
copy /y "..\app.js"            "dist\GP\" >nul
copy /y "..\styles.css"        "dist\GP\" >nul
copy /y "..\aide.html"         "dist\GP\" >nul
copy /y "..\presentation.html" "dist\GP\" >nul
copy /y "..\sw.js"             "dist\GP\" >nul
copy /y "..\morphdom.min.js"   "dist\GP\" >nul
if exist "..\favicon.svg" copy /y "..\favicon.svg" "dist\GP\" >nul
if not exist "dist\GP\data"     mkdir "dist\GP\data"
if not exist "dist\GP\archives" mkdir "dist\GP\archives"
(echo @echo off
echo cd /d "%%~dp0"
echo start "" "GP-serveur.exe"
echo timeout /t 2 /nobreak ^>nul
echo start "" "http://localhost:8742") > "dist\GP\start.bat"
echo OK

echo [4/4] Inno Setup...
%ISCC% GP-installer.iss
if errorlevel 1 ( echo ERREUR Inno Setup & pause & exit /b 1 )

echo.
echo  ============================================
echo   SUCCES !
echo   Installeur : installe\dist\GP-Setup-1.0.0.exe
echo  ============================================
echo.
pause
