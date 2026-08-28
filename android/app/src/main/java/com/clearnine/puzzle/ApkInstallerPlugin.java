package com.clearnine.puzzle;

import android.app.DownloadManager;
import android.content.Context;
import android.content.Intent;
import android.content.pm.PackageManager;
import android.content.pm.ResolveInfo;
import android.database.Cursor;
import android.net.Uri;
import android.os.Build;
import android.os.Environment;
import android.os.Handler;
import android.os.Looper;
import android.provider.Settings;
import androidx.core.content.FileProvider;
import com.getcapacitor.JSObject;
import com.getcapacitor.Logger;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import java.io.File;
import java.util.List;

/**
 * Downloads an APK with DownloadManager and opens the system installer.
 * Chrome Custom Tabs (Capacitor Browser) often freeze GitHub APK downloads at 100%.
 */
@CapacitorPlugin(name = "ApkInstaller")
public class ApkInstallerPlugin extends Plugin {

    private static final String TAG = "ApkInstaller";
    private static final String FILE_NAME = "ClearNine-update.apk";
    private static final long POLL_MS = 400;
    private static final long TIMEOUT_MS = 180_000;

    @PluginMethod
    public void openUrl(PluginCall call) {
        String url = call.getString("url");
        if (url == null || url.isEmpty()) {
            call.reject("Must provide a URL");
            return;
        }
        try {
            Intent intent = new Intent(Intent.ACTION_VIEW, Uri.parse(url));
            intent.addCategory(Intent.CATEGORY_BROWSABLE);
            intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
            getContext().startActivity(intent);
            call.resolve();
        } catch (Exception ex) {
            Logger.error(TAG, "openUrl failed", ex);
            call.reject(ex.getLocalizedMessage());
        }
    }

    @PluginMethod
    public void downloadAndInstall(PluginCall call) {
        String url = call.getString("url");
        if (url == null || url.isEmpty()) {
            resolveFailed(call, "Missing download URL");
            return;
        }
        if (!isAllowedUrl(url)) {
            resolveFailed(call, "Update URL is not from GitHub");
            return;
        }

        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            if (!getContext().getPackageManager().canRequestPackageInstalls()) {
                try {
                    Intent settings = new Intent(Settings.ACTION_MANAGE_UNKNOWN_APP_SOURCES);
                    settings.setData(Uri.parse("package:" + getContext().getPackageName()));
                    settings.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
                    getContext().startActivity(settings);
                } catch (Exception ex) {
                    Logger.error(TAG, "Could not open unknown-sources settings", ex);
                }
                JSObject ret = new JSObject();
                ret.put("status", "need-permission");
                call.resolve(ret);
                return;
            }
        }

        File dir = getContext().getExternalFilesDir(Environment.DIRECTORY_DOWNLOADS);
        if (dir == null) {
            resolveFailed(call, "Storage is not available");
            return;
        }
        if (!dir.exists() && !dir.mkdirs()) {
            resolveFailed(call, "Could not create download folder");
            return;
        }
        File dest = new File(dir, FILE_NAME);
        if (dest.exists() && !dest.delete()) {
            Logger.warn(TAG, "Could not delete previous APK; DownloadManager may overwrite it");
        }

        DownloadManager manager = (DownloadManager) getContext().getSystemService(Context.DOWNLOAD_SERVICE);
        if (manager == null) {
            resolveFailed(call, "Download manager is unavailable");
            return;
        }

        DownloadManager.Request request = new DownloadManager.Request(Uri.parse(url));
        request.setMimeType("application/vnd.android.package-archive");
        request.setTitle("ClearNine update");
        request.setDescription("Downloading APK…");
        request.setNotificationVisibility(DownloadManager.Request.VISIBILITY_VISIBLE_NOTIFY_COMPLETED);
        request.setAllowedOverMetered(true);
        request.setAllowedOverRoaming(true);
        request.addRequestHeader("Accept", "application/octet-stream");
        request.setDestinationInExternalFilesDir(getContext(), Environment.DIRECTORY_DOWNLOADS, FILE_NAME);

        long id;
        try {
            id = manager.enqueue(request);
        } catch (Exception ex) {
            Logger.error(TAG, "enqueue failed", ex);
            resolveFailed(call, "Could not start download");
            return;
        }

        pollDownload(call, manager, id, dest, System.currentTimeMillis());
    }

    private void pollDownload(PluginCall call, DownloadManager manager, long id, File dest, long startedAt) {
        new Handler(Looper.getMainLooper()).postDelayed(
            () -> {
                if (System.currentTimeMillis() - startedAt > TIMEOUT_MS) {
                    try {
                        manager.remove(id);
                    } catch (Exception ignored) {}
                    resolveFailed(call, "Download timed out");
                    return;
                }

                DownloadManager.Query query = new DownloadManager.Query().setFilterById(id);
                try (Cursor cursor = manager.query(query)) {
                    if (cursor == null || !cursor.moveToFirst()) {
                        if (System.currentTimeMillis() - startedAt < 8_000) {
                            pollDownload(call, manager, id, dest, startedAt);
                            return;
                        }
                        resolveFailed(call, "Download was cancelled");
                        return;
                    }
                    int statusIdx = cursor.getColumnIndex(DownloadManager.COLUMN_STATUS);
                    int reasonIdx = cursor.getColumnIndex(DownloadManager.COLUMN_REASON);
                    int status = statusIdx >= 0 ? cursor.getInt(statusIdx) : DownloadManager.STATUS_FAILED;
                    if (status == DownloadManager.STATUS_SUCCESSFUL) {
                        installApk(call, dest);
                        return;
                    }
                    if (status == DownloadManager.STATUS_FAILED) {
                        int reason = reasonIdx >= 0 ? cursor.getInt(reasonIdx) : -1;
                        resolveFailed(call, "Download failed (" + reason + ")");
                        return;
                    }
                } catch (Exception ex) {
                    Logger.error(TAG, "poll failed", ex);
                    resolveFailed(call, "Download failed");
                    return;
                }

                pollDownload(call, manager, id, dest, startedAt);
            },
            POLL_MS
        );
    }

    private void installApk(PluginCall call, File dest) {
        if (!dest.exists() || dest.length() <= 0) {
            resolveFailed(call, "Downloaded file is missing");
            return;
        }
        try {
            Uri apkUri = FileProvider.getUriForFile(
                getContext(),
                getContext().getPackageName() + ".fileprovider",
                dest
            );
            Intent intent = new Intent(Intent.ACTION_VIEW);
            intent.setDataAndType(apkUri, "application/vnd.android.package-archive");
            intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
            intent.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION);
            intent.addFlags(Intent.FLAG_ACTIVITY_CLEAR_TOP);

            PackageManager pm = getContext().getPackageManager();
            List<ResolveInfo> handlers = pm.queryIntentActivities(intent, PackageManager.MATCH_DEFAULT_ONLY);
            for (ResolveInfo info : handlers) {
                getContext()
                    .grantUriPermission(
                        info.activityInfo.packageName,
                        apkUri,
                        Intent.FLAG_GRANT_READ_URI_PERMISSION
                    );
            }

            getContext().startActivity(intent);
            JSObject ret = new JSObject();
            ret.put("status", "ok");
            call.resolve(ret);
        } catch (Exception ex) {
            Logger.error(TAG, "install prompt failed", ex);
            resolveFailed(call, "Could not open installer");
        }
    }

    private static boolean isAllowedUrl(String url) {
        Uri uri = Uri.parse(url);
        if (uri == null || uri.getScheme() == null || uri.getHost() == null) {
            return false;
        }
        if (!"https".equalsIgnoreCase(uri.getScheme())) {
            return false;
        }
        String host = uri.getHost().toLowerCase();
        return host.equals("github.com")
            || host.endsWith(".github.com")
            || host.equals("objects.githubusercontent.com")
            || host.endsWith(".githubusercontent.com");
    }

    private static void resolveFailed(PluginCall call, String message) {
        JSObject ret = new JSObject();
        ret.put("status", "failed");
        ret.put("message", message);
        call.resolve(ret);
    }
}
