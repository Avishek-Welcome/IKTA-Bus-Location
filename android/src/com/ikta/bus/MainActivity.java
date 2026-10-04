package com.ikta.bus;

import android.Manifest;
import android.app.Activity;
import android.app.AlertDialog;
import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.content.ActivityNotFoundException;
import android.content.Context;
import android.content.DialogInterface;
import android.content.Intent;
import android.content.pm.PackageManager;
import android.location.Location;
import android.location.LocationListener;
import android.location.LocationManager;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.os.Looper;
import android.provider.Settings;
import android.view.WindowManager;
import android.webkit.GeolocationPermissions;
import android.webkit.JavascriptInterface;
import android.webkit.WebChromeClient;
import android.webkit.WebResourceError;
import android.webkit.WebResourceRequest;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;

import java.util.Arrays;
import java.util.List;
import java.util.Locale;

/**
 * The whole app: a full-screen WebView of the live website. The site's js/app-bridge.js
 * talks to {@link Bridge} (window.IKTAApp) for GPS, notifications and keeping the screen on.
 */
public class MainActivity extends Activity {
    static final String HOME = "https://ikta-bus.web.app/";
    /** Pages from these hosts open inside the app and may use the bridge; anything else opens in the browser. */
    static final List<String> HOSTS = Arrays.asList("ikta-bus.web.app", "ikta-bus.firebaseapp.com", "avishek-welcome.github.io");

    private static final int REQ_LOCATION = 1, REQ_NOTIFY = 2;
    private static final String ALERTS = "alerts";

    private WebView web;
    private LocationManager lm;
    private boolean locationOn, wantLocation, sharing, askedSettings;
    private long lastGpsFix;
    private GeolocationPermissions.Callback pendingGeo;
    private String pendingGeoOrigin;

    @Override
    protected void onCreate(Bundle saved) {
        super.onCreate(saved);
        lm = (LocationManager) getSystemService(Context.LOCATION_SERVICE);
        web = new WebView(this);
        setContentView(web);

        WebSettings s = web.getSettings();
        s.setJavaScriptEnabled(true);
        s.setDomStorageEnabled(true);
        s.setGeolocationEnabled(true);
        s.setMediaPlaybackRequiresUserGesture(false); // the arrival alert tone
        s.setUserAgentString(s.getUserAgentString() + " IKTABusApp/" + versionName());
        // Keep the page's renderer alive and running while the app is in the background (driver sharing)
        if (Build.VERSION.SDK_INT >= 26) web.setRendererPriorityPolicy(WebView.RENDERER_PRIORITY_IMPORTANT, false);

        web.addJavascriptInterface(new Bridge(), "IKTAApp");
        web.setWebViewClient(new Client());
        web.setWebChromeClient(new Chrome());

        if (saved != null && web.restoreState(saved) != null) return;
        web.loadUrl(startUrl(getIntent()));
    }

    @Override
    protected void onNewIntent(Intent intent) {
        super.onNewIntent(intent);
        Uri u = intent.getData();
        if (u != null && trusted(u)) web.loadUrl(u.toString());
    }

    private String startUrl(Intent intent) {
        Uri u = intent == null ? null : intent.getData();
        return u != null && trusted(u) ? u.toString() : HOME;
    }

    @Override
    protected void onSaveInstanceState(Bundle out) {
        super.onSaveInstanceState(out);
        web.saveState(out);
    }

    @Override
    protected void onResume() {
        super.onResume();
        if (wantLocation) startUpdates();
    }

    @Override
    protected void onPause() {
        super.onPause();
        // While the driver is sharing, GPS keeps running in the background (the
        // foreground service makes that allowed); otherwise save the battery.
        if (!sharing) stopUpdates();
    }

    @Override
    protected void onDestroy() {
        setSharing(false);
        stopUpdates();
        web.destroy();
        super.onDestroy();
    }

    @Override
    public void onBackPressed() {
        if (web.canGoBack()) web.goBack();
        else if (sharing) moveTaskToBack(true); // closing the page would stop sharing
        else super.onBackPressed();
    }

    // ---------- Helpers ----------
    static boolean trusted(Uri u) {
        return u != null && "https".equals(u.getScheme()) && u.getHost() != null && HOSTS.contains(u.getHost().toLowerCase(Locale.ROOT));
    }

    private boolean pageTrusted() {
        String url = web.getUrl();
        return url != null && trusted(Uri.parse(url));
    }

    private String versionName() {
        try {
            return getPackageManager().getPackageInfo(getPackageName(), 0).versionName;
        } catch (PackageManager.NameNotFoundException e) {
            return "?";
        }
    }

    private boolean granted(String perm) {
        return checkSelfPermission(perm) == PackageManager.PERMISSION_GRANTED;
    }

    private boolean hasLocation() {
        return granted(Manifest.permission.ACCESS_FINE_LOCATION) || granted(Manifest.permission.ACCESS_COARSE_LOCATION);
    }

    private void js(String code) {
        web.evaluateJavascript(code, null);
    }

    // ---------- Location ----------
    private final LocationListener listener = new LocationListener() {
        @Override public void onLocationChanged(Location l) { deliver(l); }
        // These four have default bodies only from Android 11, so they must be implemented
        @Override public void onStatusChanged(String p, int status, Bundle extras) {}
        @Override public void onProviderEnabled(String p) {}
        @Override public void onProviderDisabled(String p) { if (!locationEnabled()) geoError(2, "Location is turned off on this phone"); }
    };

    private void requestLocation() {
        wantLocation = true;
        if (hasLocation()) startUpdates();
        else requestPermissions(new String[]{Manifest.permission.ACCESS_FINE_LOCATION, Manifest.permission.ACCESS_COARSE_LOCATION}, REQ_LOCATION);
    }

    private boolean locationEnabled() {
        if (Build.VERSION.SDK_INT >= 28) return lm.isLocationEnabled();
        return lm.isProviderEnabled(LocationManager.GPS_PROVIDER) || lm.isProviderEnabled(LocationManager.NETWORK_PROVIDER);
    }

    private void startUpdates() {
        if (locationOn || !hasLocation()) return;
        try {
            List<String> providers = lm.getAllProviders();
            boolean gps = providers.contains(LocationManager.GPS_PROVIDER) && granted(Manifest.permission.ACCESS_FINE_LOCATION);
            if (gps) lm.requestLocationUpdates(LocationManager.GPS_PROVIDER, 1000, 0, listener, Looper.getMainLooper());
            if (providers.contains(LocationManager.NETWORK_PROVIDER))
                lm.requestLocationUpdates(LocationManager.NETWORK_PROVIDER, 3000, 0, listener, Looper.getMainLooper());
            locationOn = true;
            // Hand over a recent fix straight away so the map doesn't wait for the first new one
            Location best = null;
            for (String p : providers) {
                Location l = lm.getLastKnownLocation(p);
                if (l != null && System.currentTimeMillis() - l.getTime() < 60000 && (best == null || l.getAccuracy() < best.getAccuracy())) best = l;
            }
            if (best != null) deliver(best);
        } catch (SecurityException | IllegalArgumentException e) {
            geoError(2, "GPS is not available: " + e.getMessage());
        }
        if (!locationEnabled()) {
            geoError(2, "Location is turned off on this phone");
            if (!askedSettings) {
                askedSettings = true;
                new AlertDialog.Builder(this)
                        .setTitle("Turn on location")
                        .setMessage("IKTA Bus needs the phone's location (GPS) to show where you are.")
                        .setPositiveButton("Open settings", opener(new Intent(Settings.ACTION_LOCATION_SOURCE_SETTINGS)))
                        .setNegativeButton("Not now", null)
                        .show();
            }
        }
    }

    private void stopUpdates() {
        if (!locationOn) return;
        lm.removeUpdates(listener);
        locationOn = false;
    }

    private void deliver(Location l) {
        boolean isGps = LocationManager.GPS_PROVIDER.equals(l.getProvider());
        if (isGps) lastGpsFix = System.currentTimeMillis();
        // Rough network fixes would make the bus jump about between GPS fixes
        else if (System.currentTimeMillis() - lastGpsFix < 10000) return;
        String json = String.format(Locale.ROOT, "{\"lat\":%.7f,\"lng\":%.7f,\"acc\":%.1f,\"alt\":%s,\"speed\":%s,\"heading\":%s,\"ts\":%d}",
                l.getLatitude(), l.getLongitude(), l.getAccuracy(),
                l.hasAltitude() ? String.format(Locale.ROOT, "%.1f", l.getAltitude()) : "null",
                l.hasSpeed() ? String.format(Locale.ROOT, "%.2f", l.getSpeed()) : "null",
                l.hasBearing() ? String.format(Locale.ROOT, "%.1f", l.getBearing()) : "null",
                l.getTime());
        js("window.IKTAApp_onFix&&IKTAApp_onFix(" + json + ")");
    }

    private void geoError(int code, String msg) {
        js("window.IKTAApp_onGeoError&&IKTAApp_onGeoError(" + code + "," + quote(msg) + ")");
    }

    private static String quote(String s) {
        return "\"" + s.replace("\\", "\\\\").replace("\"", "\\\"").replace("\n", " ") + "\"";
    }

    private void open(Intent i) {
        try {
            startActivity(i);
        } catch (ActivityNotFoundException ignored) {
        }
    }

    private DialogInterface.OnClickListener opener(final Intent i) {
        return new DialogInterface.OnClickListener() {
            @Override public void onClick(DialogInterface d, int which) { open(i); }
        };
    }

    @Override
    public void onRequestPermissionsResult(int req, String[] perms, int[] results) {
        if (req == REQ_LOCATION) {
            boolean ok = hasLocation();
            if (pendingGeo != null) { pendingGeo.invoke(pendingGeoOrigin, ok, false); pendingGeo = null; }
            if (ok) {
                startUpdates();
                if (sharing) startService(true);
            } else {
                wantLocation = false;
                geoError(1, "Location permission denied");
                // "Don't ask again" was picked: only Settings can turn it back on
                if (!shouldShowRequestPermissionRationale(Manifest.permission.ACCESS_FINE_LOCATION) && !askedSettings) {
                    askedSettings = true;
                    new AlertDialog.Builder(this)
                            .setTitle("Location is blocked")
                            .setMessage("To use GPS, allow Location for IKTA Bus in Settings → Permissions.")
                            .setPositiveButton("Open settings", opener(new Intent(Settings.ACTION_APPLICATION_DETAILS_SETTINGS, Uri.parse("package:" + getPackageName()))))
                            .setNegativeButton("Not now", null)
                            .show();
                }
            }
        } else if (req == REQ_NOTIFY) {
            getSharedPreferences("app", MODE_PRIVATE).edit().putBoolean("askedNotify", true).apply();
            js("window.IKTAApp_onNotifyPermission&&IKTAApp_onNotifyPermission(" + quote(notifyPermission()) + ")");
        }
    }

    // ---------- Driver sharing: foreground service + screen on ----------
    private void setSharing(boolean on) {
        if (on == sharing) return;
        sharing = on;
        if (on) {
            if (Build.VERSION.SDK_INT >= 33 && !granted(Manifest.permission.POST_NOTIFICATIONS))
                requestPermissions(new String[]{Manifest.permission.POST_NOTIFICATIONS}, REQ_NOTIFY);
            // Android only lets a location service start once location is allowed;
            // otherwise it starts from onRequestPermissionsResult
            if (hasLocation()) startService(true);
        } else {
            startService(false);
            if (!hasWindowFocus()) stopUpdates();
        }
    }

    private void startService(boolean on) {
        Intent i = new Intent(this, LocationService.class);
        try {
            if (!on) stopService(i);
            else if (Build.VERSION.SDK_INT >= 26) startForegroundService(i);
            else startService(i);
        } catch (RuntimeException e) {
            // e.g. the app is not in the foreground: sharing still works while it is open
        }
    }

    private void keepScreenOn(boolean on) {
        if (on) getWindow().addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);
        else getWindow().clearFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);
    }

    // ---------- Notifications ----------
    private String notifyPermission() {
        NotificationManager nm = getSystemService(NotificationManager.class);
        if (nm.areNotificationsEnabled()) return "granted";
        boolean asked = getSharedPreferences("app", MODE_PRIVATE).getBoolean("askedNotify", false);
        return Build.VERSION.SDK_INT >= 33 && !asked ? "default" : "denied";
    }

    private void notify(String title, String body, String tag) {
        NotificationManager nm = getSystemService(NotificationManager.class);
        Notification.Builder b;
        if (Build.VERSION.SDK_INT >= 26) {
            NotificationChannel ch = new NotificationChannel(ALERTS, "Bus arrival alerts", NotificationManager.IMPORTANCE_HIGH);
            ch.enableVibration(true);
            nm.createNotificationChannel(ch);
            b = new Notification.Builder(this, ALERTS);
        } else {
            b = new Notification.Builder(this).setPriority(Notification.PRIORITY_HIGH).setDefaults(Notification.DEFAULT_ALL);
        }
        Intent open = new Intent(this, MainActivity.class).addFlags(Intent.FLAG_ACTIVITY_SINGLE_TOP);
        b.setSmallIcon(R.drawable.ic_notify)
                .setContentTitle(title)
                .setContentText(body)
                .setStyle(new Notification.BigTextStyle().bigText(body))
                .setAutoCancel(true)
                .setContentIntent(PendingIntent.getActivity(this, 0, open, PendingIntent.FLAG_IMMUTABLE | PendingIntent.FLAG_UPDATE_CURRENT));
        nm.notify(tag == null || tag.isEmpty() ? null : tag, 1, b.build());
    }

    /**
     * window.IKTAApp. Methods are called on a background thread, so each one hops to the
     * UI thread, and only does anything while one of our own pages is showing.
     */
    private class Bridge {
        private abstract class Ui implements Runnable {
            Ui() { runOnUiThread(this); }
            @Override public final void run() { if (pageTrusted()) go(); }
            abstract void go();
        }

        @JavascriptInterface public String version() { return versionName(); }
        /** GPS is always used (both pages ask for high accuracy); network fixes only fill in until it locks on. */
        @JavascriptInterface public void startLocation() { new Ui() { void go() { requestLocation(); } }; }
        @JavascriptInterface public void stopLocation() { new Ui() { void go() { wantLocation = false; if (!sharing) stopUpdates(); } }; }
        @JavascriptInterface public void setSharing(final boolean on) { new Ui() { void go() { MainActivity.this.setSharing(on); } }; }
        @JavascriptInterface public void keepScreenOn(final boolean on) { new Ui() { void go() { MainActivity.this.keepScreenOn(on); } }; }
        @JavascriptInterface public String notificationPermission() { return notifyPermission(); }
        @JavascriptInterface public void requestNotificationPermission() {
            new Ui() {
                void go() {
                    if (Build.VERSION.SDK_INT >= 33 && !granted(Manifest.permission.POST_NOTIFICATIONS))
                        requestPermissions(new String[]{Manifest.permission.POST_NOTIFICATIONS}, REQ_NOTIFY);
                    else js("window.IKTAApp_onNotifyPermission&&IKTAApp_onNotifyPermission(" + quote(notifyPermission()) + ")");
                }
            };
        }
        @JavascriptInterface public void notify(final String title, final String body, final String tag) {
            new Ui() { void go() { MainActivity.this.notify(title, body, tag); } };
        }
    }

    // ---------- WebView clients ----------
    private class Client extends WebViewClient {
        @Override
        public boolean shouldOverrideUrlLoading(WebView view, WebResourceRequest req) {
            Uri u = req.getUrl();
            if (trusted(u)) return false;
            open(new Intent(Intent.ACTION_VIEW, u)); // other sites, tel:, maps, WhatsApp… open in their own apps
            return true;
        }

        @Override
        public void onPageStarted(WebView view, String url, android.graphics.Bitmap icon) {
            // A new page isn't sharing (driver.html tells us again if it starts)
            MainActivity.this.setSharing(false);
            keepScreenOn(false);
            wantLocation = false;
            stopUpdates();
        }

        @Override
        public void onReceivedError(WebView view, WebResourceRequest req, WebResourceError err) {
            if (!req.isForMainFrame()) return;
            String html = "<html><head><meta name=viewport content='width=device-width,initial-scale=1'></head>"
                    + "<body style='background:#070b17;color:#e8ecff;font-family:sans-serif;text-align:center;padding:30vh 24px 0'>"
                    + "<h2>No internet connection</h2><p style='opacity:.7'>IKTA Bus needs the internet to show live buses.</p>"
                    + "<p><a href='" + HOME + "' style='display:inline-block;margin-top:12px;padding:12px 28px;border-radius:24px;"
                    + "background:#2f5bff;color:#fff;text-decoration:none;font-weight:bold'>Try again</a></p></body></html>";
            view.loadDataWithBaseURL(null, html, "text/html", "utf-8", null);
        }
    }

    private class Chrome extends WebChromeClient {
        // Fallback for pages that use the browser's own geolocation rather than the bridge
        @Override
        public void onGeolocationPermissionsShowPrompt(String origin, GeolocationPermissions.Callback cb) {
            if (!trusted(Uri.parse(origin))) { cb.invoke(origin, false, false); return; }
            if (hasLocation()) { cb.invoke(origin, true, false); return; }
            pendingGeo = cb;
            pendingGeoOrigin = origin;
            requestPermissions(new String[]{Manifest.permission.ACCESS_FINE_LOCATION, Manifest.permission.ACCESS_COARSE_LOCATION}, REQ_LOCATION);
        }
    }
}
