@echo off
setlocal EnableExtensions

cd /d "%~dp0"

where git >nul 2>nul
if errorlevel 1 (
  echo [ERROR] Git is not installed or not in PATH.
  pause
  exit /b 1
)

git config --global credential.helper manager-core >nul 2>nul
git credential-manager configure >nul 2>nul

echo Opening GitHub browser login...
git credential-manager github login --browser --url https://github.com
if errorlevel 1 (
  echo [ERROR] GitHub login was not completed.
  pause
  exit /b 1
)

echo GitHub login complete.
endlocal
exit /b 0
