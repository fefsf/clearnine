@echo off
REM Visible console for debugging. Daily use is start-hidden.ps1 / Task Scheduler.
cd /d "%~dp0"
if not exist logs mkdir logs
node index.mjs >> "logs\server.log" 2>&1
