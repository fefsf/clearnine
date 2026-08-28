package com.clearnine.puzzle;

import android.content.Intent;
import android.content.pm.PackageManager;
import android.content.pm.ResolveInfo;
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
import java.io.BufferedInputStream;
import java.io.File;
import java.io.FileInputStream;
import java.io.FileOutputStream;
import java.io.InputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.util.ArrayList;
import java.util.List;
import java.util.Locale;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.atomic.AtomicBoolean;

/**
 * Downloads an APK in-process (not DownloadManager / Custom Tabs) and opens the installer.
 *
 * GitHub release assets 302 to release-assets.githubusercontent.com with a long signed URL.
 * Chrome on the GitHub release page handles that; DownloadManager and Custom Tabs often sit
 * at 100% waiting for the connection to close. We follow redirects ourselves and stop after
 * Content-Length bytes.
 */
@CapacitorPlugin(name = "ApkInstaller")
public class ApkInstallerPlugin extends Plugin {

    private static final String TAG = "ApkInstaller";
    private static final String FILE_NAME = "ClearNine-update.apk";
    private static final String USER_AGENT =
        "Mozilla/5.0 (Linux; Android 14; Mobile) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Mobile Safari/537.36";
    private static final int MAX_REDIRECTS = 8;
    private static final int CONNECT_TIMEOUT_MS = 20_000;
    private static final int READ_TIMEOUT_MS = 30_000;
    private static final long TIMEOUT_MS = 180_000;
    private static final int BUF_SIZE = 16 * 1024;

    private final ExecutorService io = Executors.newSingleThreadExecutor();
    private final AtomicBoolean cancelRequested = new AtomicBoolean(false);
    private volatile HttpURLConnection currentConn;

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
    public void cancelDownload(PluginCall call) {
        cancelRequested.set(true);
        HttpURLConnection conn = currentConn;
        if (conn != null) {
            try {
                conn.disconnect();
            } catch (Exception ignored) {}
        }
        call.resolve();
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

        cancelRequested.set(false);
        io.execute(() -> downloadThenInstall(call, url, dest));
    }

    private void downloadThenInstall(PluginCall call, String startUrl, File dest) {
        try {
            downloadToFile(startUrl, dest);
            if (cancelRequested.get()) {
                resolveCancelled(call);
                return;
            }
            if (!looksLikeApk(dest)) {
                if (dest.exists()) {
                    //noinspection ResultOfMethodCallIgnored
                    dest.delete();
                }
                resolveFailed(call, "Downloaded file is not an APK");
                return;
            }
            new Handler(Looper.getMainLooper()).post(() -> installApk(call, dest));
        } catch (CancelledException ex) {
            resolveCancelled(call);
        } catch (Exception ex) {
            Logger.error(TAG, "download failed", ex);
            if (cancelRequested.get()) {
                resolveCancelled(call);
                return;
            }
            String message = ex.getLocalizedMessage();
            if (message == null || message.isEmpty()) {
                message = "Download failed";
            }
            resolveFailed(call, message);
        } finally {
            currentConn = null;
        }
    }

    private void downloadToFile(String startUrl, File dest) throws Exception {
        if (dest.exists() && !dest.delete()) {
            Logger.warn(TAG, "Could not delete previous APK");
        }

        String url = startUrl;
        List<String> cookies = new ArrayList<>();
        HttpURLConnection conn = null;
        long startedAt = System.currentTimeMillis();

        try {
            for (int hop = 0; hop <= MAX_REDIRECTS; hop++) {
                throwIfCancelled();
                if (System.currentTimeMillis() - startedAt > TIMEOUT_MS) {
                    throw new Exception("Download timed out");
                }
                if (!isAllowedUrl(url)) {
                    throw new Exception("Update redirected off GitHub");
                }

                conn = (HttpURLConnection) new URL(url).openConnection();
                currentConn = conn;
                conn.setInstanceFollowRedirects(false);
                conn.setConnectTimeout(CONNECT_TIMEOUT_MS);
                conn.setReadTimeout(READ_TIMEOUT_MS);
                conn.setRequestMethod("GET");
                conn.setRequestProperty("User-Agent", USER_AGENT);
                conn.setRequestProperty("Accept", "*/*");
                conn.setRequestProperty("Accept-Encoding", "identity");
                conn.setRequestProperty("Referer", "https://github.com/");
                if (!cookies.isEmpty()) {
                    conn.setRequestProperty("Cookie", String.join("; ", cookies));
                }

                int code = conn.getResponseCode();
                collectCookies(conn, cookies);

                if (code >= 300 && code < 400) {
                    String location = conn.getHeaderField("Location");
                    conn.disconnect();
                    currentConn = null;
                    if (location == null || location.isEmpty()) {
                        throw new Exception("Download redirect was empty");
                    }
                    url = new URL(new URL(url), location).toString();
                    continue;
                }

                if (code != HttpURLConnection.HTTP_OK) {
                    throw new Exception("Download failed (HTTP " + code + ")");
                }

                String ctype = conn.getContentType();
                if (ctype != null && ctype.toLowerCase(Locale.US).contains("text/html")) {
                    throw new Exception("GitHub did not return an APK");
                }

                long total = conn.getContentLengthLong();
                emitProgress(0, total);

                try (InputStream raw = conn.getInputStream();
                        BufferedInputStream in = new BufferedInputStream(raw);
                        FileOutputStream out = new FileOutputStream(dest)) {
                    byte[] buf = new byte[BUF_SIZE];
                    long copied = 0;
                    long lastEmit = 0;
                    while (true) {
                        throwIfCancelled();
                        if (System.currentTimeMillis() - startedAt > TIMEOUT_MS) {
                            throw new Exception("Download timed out");
                        }
                        int toRead = buf.length;
                        if (total > 0) {
                            long left = total - copied;
                            if (left <= 0) {
                                break;
                            }
                            toRead = (int) Math.min(buf.length, left);
                        }
                        int n = in.read(buf, 0, toRead);
                        if (n < 0) {
                            break;
                        }
                        out.write(buf, 0, n);
                        copied += n;
                        long now = System.currentTimeMillis();
                        if (now - lastEmit >= 200 || (total > 0 && copied >= total)) {
                            emitProgress(copied, total);
                            lastEmit = now;
                        }
                    }
                    out.flush();
                    if (total > 0 && copied < total) {
                        throw new Exception("Download was cut off");
                    }
                    emitProgress(copied, total > 0 ? total : copied);
                }
                return;
            }
            throw new Exception("Too many download redirects");
        } finally {
            if (conn != null) {
                try {
                    conn.disconnect();
                } catch (Exception ignored) {}
            }
            currentConn = null;
        }
    }

    private void throwIfCancelled() throws CancelledException {
        if (cancelRequested.get()) {
            throw new CancelledException();
        }
    }

    private void emitProgress(long received, long total) {
        JSObject data = new JSObject();
        data.put("received", received);
        data.put("total", total);
        notifyListeners("downloadProgress", data);
    }

    private static void collectCookies(HttpURLConnection conn, List<String> cookies) {
        List<String> set = conn.getHeaderFields().get("Set-Cookie");
        if (set == null) {
            set = conn.getHeaderFields().get("set-cookie");
        }
        if (set == null) {
            return;
        }
        for (String raw : set) {
            if (raw == null) {
                continue;
            }
            String nv = raw.split(";", 2)[0].trim();
            int eq = nv.indexOf('=');
            if (eq <= 0) {
                continue;
            }
            String name = nv.substring(0, eq);
            cookies.removeIf(c -> c.startsWith(name + "="));
            cookies.add(nv);
        }
    }

    private static boolean looksLikeApk(File dest) {
        if (!dest.exists() || dest.length() < 100) {
            return false;
        }
        try (FileInputStream in = new FileInputStream(dest)) {
            byte[] mag = new byte[4];
            if (in.read(mag) < 4) {
                return false;
            }
            // ZIP / APK local file header
            return mag[0] == 0x50 && mag[1] == 0x4B && mag[2] == 0x03 && mag[3] == 0x04;
        } catch (Exception ex) {
            return false;
        }
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
        String host = uri.getHost().toLowerCase(Locale.US);
        if (host.equals("github.com") || host.endsWith(".github.com")) {
            return true;
        }
        if (host.equals("objects.githubusercontent.com") || host.endsWith(".githubusercontent.com")) {
            return true;
        }
        return host.equals("github-cloud.s3.amazonaws.com") ||
            (host.endsWith(".amazonaws.com") && host.contains("github-production-release-asset"));
    }

    private static void resolveFailed(PluginCall call, String message) {
        JSObject ret = new JSObject();
        ret.put("status", "failed");
        ret.put("message", message);
        call.resolve(ret);
    }

    private static void resolveCancelled(PluginCall call) {
        JSObject ret = new JSObject();
        ret.put("status", "cancelled");
        call.resolve(ret);
    }

    private static final class CancelledException extends Exception {
        CancelledException() {
            super("cancelled");
        }
    }
}
