@echo off
setlocal EnableExtensions

cd /d "%~dp0"

set "REPO_URL=https://github.com/fullydigital-design/ai-canvas.git"
set "DEFAULT_COMMIT_MSG=chore: sync local changes"
set "DEFAULT_GIT_USER=fullydigital-design"
set "DEFAULT_GIT_EMAIL=fullydigital-design@users.noreply.github.com"

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

git branch -M main
if errorlevel 1 (
  echo [ERROR] Failed to switch branch to main.
  pause
  exit /b 1
)

git config --get user.name >nul 2>nul
if errorlevel 1 (
  echo Setting local git user.name to %DEFAULT_GIT_USER%
  git config --local user.name "%DEFAULT_GIT_USER%"
  if errorlevel 1 (
    echo [ERROR] Failed to set user.name.
    pause
    exit /b 1
  )
)

git config --get user.email >nul 2>nul
if errorlevel 1 (
  echo Setting local git user.email to %DEFAULT_GIT_EMAIL%
  git config --local user.email "%DEFAULT_GIT_EMAIL%"
  if errorlevel 1 (
    echo [ERROR] Failed to set user.email.
    pause
    exit /b 1
  )
)

set "COMMIT_MSG=%*"
if "%COMMIT_MSG%"=="" set "COMMIT_MSG=%DEFAULT_COMMIT_MSG%"

echo Staging all changes...
git add -A
if errorlevel 1 (
  echo [ERROR] git add failed.
  pause
  exit /b 1
)

git diff --cached --quiet
if errorlevel 1 (
  echo Creating commit: %COMMIT_MSG%
  git commit -m "%COMMIT_MSG%"
  if errorlevel 1 (
    echo [ERROR] Commit failed.
    echo Check your Git user.name and user.email configuration.
    pause
    exit /b 1
  )
) else (
  echo No new staged changes to commit. Continuing to push...
)

echo Pushing main to origin...
git push -u origin main
if errorlevel 1 (
  echo Push failed. Attempting GitHub browser login...
  call "%~dp0github_login.bat"
  if errorlevel 1 (
    echo [ERROR] GitHub login failed.
    pause
    exit /b 1
  )

  echo Retrying push...
  git push -u origin main
  if errorlevel 1 (
    echo [ERROR] Push failed after login.
    pause
    exit /b 1
  )
)

echo Upload complete.
endlocal
exit /b 0
