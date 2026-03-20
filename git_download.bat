@echo off
setlocal EnableExtensions

cd /d "%~dp0"

set "REPO_URL=https://github.com/fullydigital-design/ai-canvas.git"

where git >nul 2>nul
if errorlevel 1 (
  echo [ERROR] Git is not installed or not in PATH.
  pause
  exit /b 1
)

git rev-parse --is-inside-work-tree >nul 2>nul
if errorlevel 1 (
  echo [ERROR] This folder is not a Git repository.
  pause
  exit /b 1
)

git config --global --add safe.directory "%CD%" >nul 2>nul

git remote get-url origin >nul 2>nul
if errorlevel 1 (
  git remote add origin "%REPO_URL%"
) else (
  git remote set-url origin "%REPO_URL%"
)
if errorlevel 1 (
  echo [ERROR] Failed to configure remote 'origin'.
  pause
  exit /b 1
)

set "HAS_CHANGES=0"
git diff --quiet
if errorlevel 1 set "HAS_CHANGES=1"
git diff --cached --quiet
if errorlevel 1 set "HAS_CHANGES=1"
for /f "delims=" %%U in ('git ls-files --others --exclude-standard') do set "HAS_CHANGES=1"

if "%HAS_CHANGES%"=="1" (
  echo [ERROR] Working tree is not clean.
  echo Commit or stash your changes before downloading updates.
  git status --short
  pause
  exit /b 1
)

echo Fetching latest from origin...
git fetch origin
if errorlevel 1 (
  echo [ERROR] Fetch failed.
  pause
  exit /b 1
)

git show-ref --verify --quiet refs/heads/main
if errorlevel 1 (
  git checkout -b main origin/main
) else (
  git checkout main
)
if errorlevel 1 (
  echo [ERROR] Could not switch to branch main.
  pause
  exit /b 1
)

echo Pulling latest changes from origin/main...
git pull --ff-only origin main
if errorlevel 1 (
  echo [ERROR] Pull failed.
  pause
  exit /b 1
)

echo Download complete.
endlocal
exit /b 0
