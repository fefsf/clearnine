# ClearNine Leaderboard (Windows)

Listens on `0.0.0.0:45589`. Cloudflare should send `https://c9.heezynet.com` here.

Hidden 24/7 (no console window): run once

```powershell
powershell -ExecutionPolicy Bypass -File D:\cursor\ClearNine\server\install-startup.ps1
```

That registers a Task Scheduler job that starts at Windows logon and checks every 5 minutes. It launches `node` hidden — Cursor is not required.

Foreground debug (visible window): `start.cmd`

Health: `https://c9.heezynet.com/health` → `{"ok":true}`
