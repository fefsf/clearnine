# ClearNine

Original, **ad-free** block puzzle for Android and the browser. Place shapes on a 9×9 board, clear full rows, columns, and 3×3 regions, and beat your high score. No ads, no accounts, no tracking.

## Play in the browser

```bash
cd clearnine
npm install
npm run dev
```

Open the local URL (usually `http://localhost:5173`) on your phone’s browser for touch play.

## Build a sideloadable Android APK

### Requirements

- Node.js 20+
- **JDK 21+** (Capacitor 8 requires Java 21; [Microsoft OpenJDK 21](https://learn.microsoft.com/en-us/java/openjdk/download) works well)
- Android SDK / command-line tools (Android Studio is the easiest way)

Set before building if needed:

```powershell
$env:JAVA_HOME = "C:\Program Files\Microsoft\jdk-21.0.11-hotspot"
$env:ANDROID_HOME = "$env:LOCALAPPDATA\Android\Sdk"
```

### One-shot debug APK

```bash
npm run apk
```

That runs `build` → Capacitor sync → `gradlew assembleDebug`.

The APK lands at:

- `android/app/build/outputs/apk/debug/app-debug.apk`
- `ClearNine.apk` (copy at project root after a successful build)

### Install on Mom’s phone

1. Copy `app-debug.apk` to the phone (USB, email, Drive, or Nearby Share).
2. On the phone: open the file → allow **Install unknown apps** for that source if prompted.
3. Tap **Install**, then open **ClearNine**.

Debug APKs are unsigned for store use but fine for personal sideloading.

### Open in Android Studio (optional)

```bash
npm run cap:sync
npm run cap:open
```

Then **Build → Build Bundle(s) / APK(s) → Build APK(s)**.

## How to play

From the home screen:

- **Play Classic** — endless mode (3 undos per game)
- **Daily Challenge** — same piece sequence for the calendar day (1 undo); beat today’s personal best
- **Records** — classic best, daily streak, lifetime stats, recent scores
- **Goals** — local trophies (unlock themes)
- **Themes** — Ocean (free), Sunset / Forest / Midnight (unlock via goals)

In a game:

- You always have up to **3** pieces in the tray.
- Drag a piece onto the board (no rotating).
- Completing a **row**, **column**, or **3×3 block** clears those cells.
- Clearing several at once scores a **combo**; clearing on consecutive moves builds a **streak**.
- Use **Undo** when stuck (limited per game).
- Game over when none of the remaining tray pieces can fit.

Everything stays on the device — no accounts, no servers, no ads.

## Scoring

| Event | Points |
|---|---|
| Each cell placed | +1 |
| Each cleared row / column / 3×3 | +18 |
| Combo (2+ clears in one move) | bonus scales with combo size |
| Streak (2+ clear-moves in a row) | +5 × streak level |

Best score and an unfinished game are saved on the device (`localStorage`).

## Project scripts

| Script | Purpose |
|---|---|
| `npm run dev` | Local web play |
| `npm run build` | Production web build → `dist/` |
| `npm run cap:sync` | Build + copy into Android project |
| `npm run apk` | Produce debug APK |

## License / branding

Original game — not affiliated with any commercial block-puzzle title.
