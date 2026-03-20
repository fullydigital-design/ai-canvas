@echo off
setlocal EnableExtensions

cd /d "%~dp0"

if defined ELECTRON_RUN_AS_NODE (
  echo [INFO] Clearing ELECTRON_RUN_AS_NODE for Electron GUI launch.
  set "ELECTRON_RUN_AS_NODE="
)

call :check_pnpm || exit /b 1
call :ensure_deps || exit /b 1
call :ensure_electron || exit /b 1

echo Starting AI Canvas app...
call pnpm electron:dev

if errorlevel 1 (
  echo [ERROR] App exited with an error.
  pause
  exit /b 1
)

endlocal
exit /b 0

:check_pnpm
where pnpm >nul 2>nul
if errorlevel 1 (
  echo [ERROR] pnpm is not installed or not in PATH.
  echo Install it with: npm install -g pnpm
  pause
  exit /b 1
)
exit /b 0

:ensure_deps
if exist "node_modules" exit /b 0
echo Installing dependencies...
call pnpm install
if errorlevel 1 (
  echo [ERROR] Failed to install dependencies.
  pause
  exit /b 1
)
exit /b 0

:ensure_electron
echo Verifying Electron installation...
call pnpm exec electron --version >nul 2>nul
if not errorlevel 1 exit /b 0

echo [WARN] Electron is missing or corrupted. Repairing installation...
call pnpm install --force
if errorlevel 1 (
  echo [ERROR] Failed to repair dependencies.
  pause
  exit /b 1
)

call pnpm rebuild --pending >nul 2>nul

call pnpm exec electron --version >nul 2>nul
if not errorlevel 1 (
  echo Electron repair succeeded.
  exit /b 0
)

echo [ERROR] Electron is still not working after repair.
echo If this is the first run with pnpm v10 script approvals, run:
echo   pnpm approve-builds
echo Then run this launcher again.
pause
exit /b 1
