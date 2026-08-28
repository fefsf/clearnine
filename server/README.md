# ClearNine Leaderboard (Windows)

Listens on `0.0.0.0:45589`. Cloudflare should send `https://c9.heezynet.com` here.

```powershell
cd D:\cursor\ClearNine\server
node index.mjs
```

Keep-alive: run `install-startup.ps1` in an **elevated** PowerShell (Task Scheduler at logon + private firewall for 45589).

Health: `https://c9.heezynet.com/health` → `{"ok":true}`
