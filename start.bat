@echo off
setlocal enabledelayedexpansion
cd /d "%~dp0"
title FileAnywhere
chcp 65001 >nul

where node >nul 2>nul
if errorlevel 1 (
  echo.
  echo [FileAnywhere] Node.js 20 or newer is required.
  echo Download it from https://nodejs.org/ and run this file again.
  echo.
  pause
  exit /b 1
)

for /f "delims=" %%v in ('node -p "process.versions.node"') do set "NODE_VERSION=%%v"
for /f "tokens=1 delims=." %%m in ("!NODE_VERSION!") do set "NODE_MAJOR=%%m"
if !NODE_MAJOR! LSS 20 (
  echo.
  echo [FileAnywhere] Node.js 20 or newer is required. Found !NODE_VERSION!.
  echo Download the current LTS from https://nodejs.org/ and run this file again.
  echo.
  pause
  exit /b 1
)

if not exist "node_modules\" (
  echo.
  echo [FileAnywhere] First run: installing dependencies...
  echo.
  call npm install --no-audit --no-fund
  if errorlevel 1 goto :failed
)

if not exist "dist\server\index.js" (
  echo.
  echo [FileAnywhere] Building the app...
  echo.
  call npm run build
  if errorlevel 1 goto :failed
)

set "FA_PORT=%PORT%"
if not defined FA_PORT set "FA_PORT=8666"

echo.
echo [FileAnywhere] Starting on http://localhost:%FA_PORT%
echo.
start "" /b powershell -NoProfile -WindowStyle Hidden -Command "Start-Sleep -Milliseconds 1800; Start-Process 'http://localhost:%FA_PORT%'"

node dist/server/index.js
if errorlevel 1 (
  echo.
  echo [FileAnywhere] The server stopped unexpectedly.
  pause
)
exit /b 0

:failed
echo.
echo [FileAnywhere] Setup failed. Review the messages above and try again.
pause
exit /b 1
