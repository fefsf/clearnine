# ClearNine Leaderboard (Windows)

Listens on `0.0.0.0:45589`. Cloudflare should send `https://c9.heezynet.com` here.

Hidden 24/7 (no console window): run once

```powershell
powershell -ExecutionPolicy Bypass -File D:\cursor\ClearNine\server\install-startup.ps1
```

That registers a Task Scheduler job that starts at Windows logon and checks every 5 minutes. It launches `node` hidden — Cursor is not required.

Foreground debug (visible window): `start.cmd`

Health: `https://c9.heezynet.com/health` → `{"ok":true,"service":"clearnine-board"}` (the port is not included).

## Submit token

`X-C9-Token` (or `Authorization: Bearer`) is a public speed bump. The same value ships in the app, so it only slows casual scripts. It is not a secret. Leave it in place so already-installed builds can still post.

## Rate limits

Score posts are limited per device id (40/hour) and per IP (60/hour). Every request except CORS preflight shares a looser per-IP cap (600/hour). Counts live in memory and reset when the process restarts.

`X-Forwarded-For` is ignored unless `C9_TRUST_PROXY=1`. Set that only when this process is reached through a trusted reverse proxy. `start.cmd` and `start-hidden.ps1` set it because Cloudflare connects here directly and appends the client address it saw. The limiter uses the **right-most** hop. A client that talks to the origin directly cannot pick a bucket by sending the header.

## Scores

`deviceId` is required (8–64 printable characters). The old shared `c9-anonymous` id is rejected. If the phone cannot persist an id, the app uses a random in-memory id for that session instead.

`periodKey` must be empty for classic and blitz, `YYYY-MM-DD` for daily, or `YYYY-Www` for weekly (the shapes the client sends). Dated boards are pruned to the newest 60 daily dates and 60 weekly keys. Request bodies are capped at 4 KB.
