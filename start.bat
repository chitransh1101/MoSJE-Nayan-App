@echo off
REM Double-click: gets the latest version from GitHub, starts everything, opens the Home page.
REM (All the work is in scripts\start.ps1 - keep this file short.)
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0scripts\start.ps1"
pause
