# AI Canvas Editor — task runner (Windows / PowerShell)
set windows-shell := ["powershell.exe", "-NoProfile", "-Command"]

# Default: show available recipes
default:
    @just --list

# Launch Electron + Vite dev (main dev flow)
dev:
    pnpm electron:dev

# Launch Vite renderer only (no Electron shell)
vite:
    pnpm dev

# Build portable Windows .exe
build:
    ./build_portable.bat

# Install dependencies
install:
    pnpm install

# Clean node_modules and reinstall
fresh:
    Remove-Item -Recurse -Force node_modules -ErrorAction SilentlyContinue; pnpm install

# TypeScript type-check (no emit)
typecheck:
    pnpm tsc --noEmit

# Audit dependencies for security issues
security:
    pnpm audit

# Open planning docs (PROJECT_STATUS + KNOWN_ISSUES + ARCHITECTURE)
plan:
    Start-Process "docs\PROJECT_STATUS.md"; \
    Start-Process "docs\KNOWN_ISSUES.md"; \
    Start-Process "docs\ARCHITECTURE.md"
