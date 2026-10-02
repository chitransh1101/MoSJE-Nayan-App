@echo off
REM Double-click to stop DoSJE Nigrani (your data is kept).
cd /d "%~dp0"
taskkill /IM DoSJE-Nigrani.exe /F >nul 2>&1
where docker >nul 2>&1 && docker compose down
echo Stopped. Your data is safe - start.bat brings everything back.
timeout /t 4 >nul
