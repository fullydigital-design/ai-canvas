@echo off
setlocal

cd /d "%~dp0"

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

git remote get-url origin >nul 2>nul
if errorlevel 1 (
  echo [ERROR] Remote 'origin' is not configured.
  echo Set it with: git remote add origin ^<repo-url^>
  pause
  exit /b 1
)

for /f "delims=" %%B in ('git branch --show-current') do set "BRANCH=%%B"
if "%BRANCH%"=="" (
  echo [ERROR] Could not detect current branch.
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
  echo Commit or stash changes before pushing.
  git status --short
  pause
  exit /b 1
)

echo Pushing branch '%BRANCH%' to origin...
git push
if errorlevel 1 (
  echo No upstream detected, trying to set upstream...
  git push -u origin "%BRANCH%"
  if errorlevel 1 (
    echo [ERROR] Push failed.
    pause
    exit /b 1
  )
)

echo Push complete.
endlocal
