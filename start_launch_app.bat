@echo off
setlocal

cd /d "%~dp0"

where pnpm >nul 2>nul
if errorlevel 1 (
  echo [ERROR] pnpm is not installed or not in PATH.
  echo Install it with: npm install -g pnpm
  pause
  exit /b 1
)

if not exist "node_modules" (
  echo Installing dependencies...
  call pnpm install
  if errorlevel 1 (
    echo [ERROR] Failed to install dependencies.
    pause
    exit /b 1
  )
)

echo Starting AI Canvas app...
call pnpm electron:dev

if errorlevel 1 (
  echo [ERROR] App exited with an error.
  pause
  exit /b 1
)

endlocal
