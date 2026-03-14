@echo off
setlocal EnableExtensions EnableDelayedExpansion

cd /d "%~dp0"

call :check_pnpm || exit /b 1
call :ensure_deps || exit /b 1
call :resolve_release_target || exit /b 1
call :close_running_processes

echo Building app bundle...
call pnpm build
if errorlevel 1 (
  echo [ERROR] Frontend build failed.
  pause
  exit /b 1
)

echo Building portable EXE...
echo Output folder: %TARGET_OUTPUT_DIR%
call :run_builder "%TARGET_OUTPUT_DIR%"
if errorlevel 1 (
  echo [ERROR] Build failed.
  pause
  exit /b 1
)

set "BUILT_OUTPUT="
for /f "delims=" %%F in ('dir /b /s "%TARGET_OUTPUT_DIR%\*Portable*.exe" 2^>nul') do (
  set "BUILT_OUTPUT=%%F"
  goto :artifact_found
)
for /f "delims=" %%F in ('dir /b /s "%TARGET_OUTPUT_DIR%\*.exe" 2^>nul') do (
  set "BUILT_OUTPUT=%%F"
  goto :artifact_found
)

echo [ERROR] Build finished but no EXE was found in:
echo "%cd%\%TARGET_OUTPUT_DIR%"
pause
exit /b 1

:artifact_found
(
  echo release_label=%RELEASE_LABEL%
  echo release_version=%RELEASE_VERSION%
  echo package_version=%PKG_VERSION%
  echo built_at=%date% %time%
  echo artifact=%BUILT_OUTPUT%
) > "%TARGET_OUTPUT_DIR%\build-info.txt"

call :cleanup_release_history

echo.
echo Build complete.
echo Release label: %RELEASE_LABEL%
echo Portable EXE: "%BUILT_OUTPUT%"
echo Build info: "%cd%\%TARGET_OUTPUT_DIR%\build-info.txt"
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

:resolve_release_target
set "PKG_VERSION="
set "RELEASE_VERSION="
set "RELEASE_LABEL="
set "TARGET_OUTPUT_DIR="
set "META_FILE="

if not exist "release" mkdir "release"

set "META_FILE=%TEMP%\aic_release_meta_%RANDOM%%RANDOM%.txt"
powershell -NoProfile -ExecutionPolicy Bypass -Command ^
  "$ErrorActionPreference = 'Stop';" ^
  "$pkg = Get-Content -Raw 'package.json' | ConvertFrom-Json;" ^
  "$pkgVersion = [string]$pkg.version;" ^
  "$parts = $pkgVersion.Split('.');" ^
  "$major = 0; $minor = 0;" ^
  "if ($parts.Length -gt 0) { [void][int]::TryParse(($parts[0] -replace '[^0-9]',''), [ref]$major) };" ^
  "if ($parts.Length -gt 1) { [void][int]::TryParse(($parts[1] -replace '[^0-9]',''), [ref]$minor) };" ^
  "$minorFmt = '{0:00}' -f $minor;" ^
  "$pat = '^release-' + $major + '\.' + $minorFmt + '\.(\d+)$';" ^
  "$max = 0;" ^
  "Get-ChildItem -Path 'release' -Directory -ErrorAction SilentlyContinue | ForEach-Object { if ($_.Name -match $pat) { $n = [int]$Matches[1]; if ($n -gt $max) { $max = $n } } };" ^
  "$seqFmt = '{0:00}' -f ($max + 1);" ^
  "$releaseVersion = '{0}.{1}.{2}' -f $major, $minorFmt, $seqFmt;" ^
  "$releaseLabel = 'release-' + $releaseVersion;" ^
  "Write-Output ($pkgVersion + '|' + $releaseVersion + '|' + $releaseLabel)" > "%META_FILE%"

if errorlevel 1 (
  del "%META_FILE%" >nul 2>nul
  echo [ERROR] Could not resolve release folder name.
  pause
  exit /b 1
)

for /f "usebackq tokens=1,2,3 delims=|" %%A in ("%META_FILE%") do (
  set "PKG_VERSION=%%A"
  set "RELEASE_VERSION=%%B"
  set "RELEASE_LABEL=%%C"
)
del "%META_FILE%" >nul 2>nul

if not defined RELEASE_LABEL (
  echo [ERROR] Could not resolve release folder name.
  pause
  exit /b 1
)

set "TARGET_OUTPUT_DIR=release\%RELEASE_LABEL%"

if not exist "%TARGET_OUTPUT_DIR%" mkdir "%TARGET_OUTPUT_DIR%"
exit /b 0

:close_running_processes
echo Closing running AI Canvas processes that can lock build files...
powershell -NoProfile -ExecutionPolicy Bypass -Command "$root = [IO.Path]::GetFullPath('%cd%'); $targets = Get-CimInstance Win32_Process | Where-Object { ($_.Name -eq 'electron.exe' -or $_.Name -eq 'AI Canvas Editor.exe') -and $_.CommandLine -like ""*$root*"" }; foreach ($p in $targets) { try { Stop-Process -Id $p.ProcessId -Force -ErrorAction Stop } catch {} }" >nul 2>nul
exit /b 0

:run_builder
set "TARGET_OUTPUT=%~1"
call pnpm exec electron-builder --win portable --config.directories.output="%TARGET_OUTPUT%" --config.win.signAndEditExecutable=false
exit /b %errorlevel%

:cleanup_release_history
echo Cleaning release folders (keeping Portable EXE + build-info.txt only)...
call :remove_dir_retry "release\win-unpacked" 5 >nul 2>nul

for /f "delims=" %%F in ('dir /b /a:-d "release" 2^>nul') do (
  del /q "release\%%~nxF" 2>nul
)

for /d %%D in ("release\release-*") do (
  for /d %%S in ("%%~fD\*") do (
    call :remove_dir_retry "%%~fS" 5 >nul 2>nul
  )

  for /f "delims=" %%F in ('dir /b /a:-d "%%~fD" 2^>nul') do (
    if /i "%%~nxF"=="build-info.txt" (
      rem keep
    ) else (
      echo %%~nF | findstr /i "Portable" >nul
      if errorlevel 1 (
        del /q "%%~fD\%%~nxF" 2>nul
      ) else (
        if /i not "%%~xF"==".exe" del /q "%%~fD\%%~nxF" 2>nul
      )
    )
  )
)
exit /b 0

:remove_dir_retry
set "TARGET_DIR=%~1"
set "RETRIES=%~2"
if not exist "%TARGET_DIR%" exit /b 0
for /L %%I in (1,1,%RETRIES%) do (
  rmdir /s /q "%TARGET_DIR%" >nul 2>nul
  if not exist "%TARGET_DIR%" exit /b 0
  timeout /t 1 /nobreak >nul
)
exit /b 1
