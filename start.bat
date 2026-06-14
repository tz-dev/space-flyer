@echo off
setlocal

cd /d "%~dp0"

echo.
echo ================================
echo  Space-Flyer Dev Start
echo ================================
echo.

if not exist package.json (
  echo ERROR: package.json wurde nicht gefunden.
  echo Stelle sicher, dass start.bat im Projekt-Hauptordner liegt.
  echo.
  pause
  exit /b 1
)

where node >nul 2>nul
if errorlevel 1 (
  echo ERROR: Node.js wurde nicht gefunden.
  echo Bitte Node.js installieren:
  echo https://nodejs.org/
  echo.
  pause
  exit /b 1
)

where npm >nul 2>nul
if errorlevel 1 (
  echo ERROR: npm wurde nicht gefunden.
  echo Node.js/npm Installation pruefen.
  echo.
  pause
  exit /b 1
)

if not exist node_modules (
  echo node_modules fehlt. Fuehre npm install aus...
  echo.
  call npm install
  if errorlevel 1 (
    echo.
    echo ERROR: npm install ist fehlgeschlagen.
    echo.
    pause
    exit /b 1
  )
)

echo.
echo Starte Vite Dev Server...
echo.

call npm run dev

echo.
echo Dev Server wurde beendet oder ist abgestuerzt.
echo.
pause