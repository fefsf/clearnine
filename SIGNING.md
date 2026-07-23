# ClearNine release signing

Keep these files **private** (they are gitignored):

- `android/clearnine-release.keystore`
- `android/keystore.properties`

If you lose the keystore, you cannot update the same app install later with a new key — you’d have to uninstall first (scores wipe).

## Build release APK

```powershell
$env:JAVA_HOME = "C:\Program Files\Microsoft\jdk-21.0.11-hotspot"
$env:ANDROID_HOME = "$env:LOCALAPPDATA\Android\Sdk"
npm run apk:release
```

Output:

- `android/app/build/outputs/apk/release/app-release.apk`
- `ClearNine-release.apk` (copy at project root)
