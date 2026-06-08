@echo off
cd /d "%~dp0"

echo.
echo  ============================================
echo   BUILD GP - C# .NET 8
echo  ============================================
echo.

REM --- Verifier dotnet
dotnet --version >nul 2>&1
if errorlevel 1 (
    echo ERREUR: .NET SDK non installe.
    echo Telechargez sur : https://dotnet.microsoft.com/download
    pause & exit /b 1
)

echo [1/3] Nettoyage...
if exist "bin" rmdir /s /q "bin"
if exist "obj" rmdir /s /q "obj"
if exist "dist" rmdir /s /q "dist"
echo OK

echo [2/3] Compilation .NET (self-contained)...
dotnet publish GP.csproj -c Release -r win-x64 --self-contained true ^^
    /p:PublishSingleFile=true ^^
    -o dist\GP
if errorlevel 1 ( echo ERREUR compilation & pause & exit /b 1 )

echo [3/3] Copie fichiers statiques...
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

echo.
echo  ============================================
echo   SUCCES !
echo   Executable : installe_csharp\dist\GP\GP-serveur.exe
echo  ============================================
echo.
pause
