@echo off
setlocal

cd /d "%~dp0"

echo.
echo ================================
echo  Space-Flyer Dev Start
echo ================================
echo.

if not exist package.json (
  echo ERROR: package.json not found.
  echo.
  pause
  exit /b 1
)

where node >nul 2>nul
if errorlevel 1 (
  echo ERROR: Node.js not found.
  echo check https://nodejs.org/
  echo.
  pause
  exit /b 1
)

where npm >nul 2>nul
if errorlevel 1 (
  echo ERROR: npm not found.
  echo chech Node.js/npm installation.
  echo.
  pause
  exit /b 1
)

if not exist node_modules (
  echo node_modules missing. Running npm install...
  echo.
  call npm install
  if errorlevel 1 (
    echo.
    echo ERROR: npm install did not succeed.
    echo.
    pause
    exit /b 1
  )
)

echo.
echo Starting Vite Dev Server...
echo.

call npm run dev

echo.
echo Server has crashed.
echo.
pause
