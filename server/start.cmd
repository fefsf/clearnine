@echo off
REM Visible console for debugging. Daily use is start-hidden.ps1 / Task Scheduler.
cd /d "%~dp0"
if not exist logs mkdir logs
REM Cloudflare is the only public path to this host, so trust its X-Forwarded-For.
set C9_TRUST_PROXY=1
node index.mjs >> "logs\server.log" 2>&1
