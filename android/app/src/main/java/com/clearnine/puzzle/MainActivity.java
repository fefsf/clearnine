package com.clearnine.puzzle;

import android.content.Context;
import android.content.SharedPreferences;
import android.os.Bundle;
import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    private static final String PREFS = "clearnine";
    private static final String KEY_CACHED_VERSION = "cached_version_name";

    @Override
    public void onCreate(Bundle savedInstanceState) {
        registerPlugin(ApkInstallerPlugin.class);
        super.onCreate(savedInstanceState);
    }

    @Override
    public void onStart() {
        super.onStart();
        clearWebCacheAfterApkUpdate();
    }

    /** After an in-app APK replace, drop stale localhost assets so the new bundle can load. */
    private void clearWebCacheAfterApkUpdate() {
        if (getBridge() == null || getBridge().getWebView() == null) {
            return;
        }
        String versionName = "";
        try {
            versionName = getPackageManager().getPackageInfo(getPackageName(), 0).versionName;
        } catch (Exception ignored) {
            return;
        }
        if (versionName == null || versionName.isEmpty()) {
            return;
        }
        SharedPreferences prefs = getSharedPreferences(PREFS, Context.MODE_PRIVATE);
        String last = prefs.getString(KEY_CACHED_VERSION, "");
        if (versionName.equals(last)) {
            return;
        }
        getBridge().getWebView().clearCache(true);
        prefs.edit().putString(KEY_CACHED_VERSION, versionName).apply();
    }
}
