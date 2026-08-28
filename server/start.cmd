@echo off
cd /d "%~dp0"
if not exist logs mkdir logs
node index.mjs >> "logs\server.log" 2>&1
