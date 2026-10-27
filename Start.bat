@echo off
title ImmoPortfolio
cd /d "%~dp0"

where node >nul 2>nul
if errorlevel 1 (
  echo.
  echo   Node.js wurde nicht gefunden.
  echo   Bitte von https://nodejs.org installieren und erneut starten.
  echo.
  pause
  exit /b 1
)

node server.js
echo.
echo   Server beendet.
pause
