package com.ikta.bus;

import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.app.Service;
import android.content.Intent;
import android.content.pm.ServiceInfo;
import android.os.Build;
import android.os.IBinder;

/**
 * Runs while a driver shares the bus location. Showing this ongoing notification lets
 * Android keep the app's GPS running with the screen off or another app open; the
 * location work itself happens in {@link MainActivity}.
 */
public class LocationService extends Service {
    private static final String CHANNEL = "sharing";

    @Override
    public int onStartCommand(Intent intent, int flags, int startId) {
        NotificationManager nm = getSystemService(NotificationManager.class);
        Notification.Builder b;
        if (Build.VERSION.SDK_INT >= 26) {
            nm.createNotificationChannel(new NotificationChannel(CHANNEL, "Sharing bus location", NotificationManager.IMPORTANCE_LOW));
            b = new Notification.Builder(this, CHANNEL);
        } else {
            b = new Notification.Builder(this);
        }
        Intent open = new Intent(this, MainActivity.class).addFlags(Intent.FLAG_ACTIVITY_SINGLE_TOP);
        Notification n = b.setSmallIcon(R.drawable.ic_notify)
                .setContentTitle("Sharing bus location")
                .setContentText("Passengers can see your bus. Open IKTA Bus to stop sharing.")
                .setOngoing(true)
                .setContentIntent(PendingIntent.getActivity(this, 0, open, PendingIntent.FLAG_IMMUTABLE | PendingIntent.FLAG_UPDATE_CURRENT))
                .build();
        if (Build.VERSION.SDK_INT >= 29) startForeground(1, n, ServiceInfo.FOREGROUND_SERVICE_TYPE_LOCATION);
        else startForeground(1, n);
        return START_NOT_STICKY;
    }

    @Override
    public void onTaskRemoved(Intent rootIntent) {
        stopSelf(); // the app was swiped away, so the page that was sharing is gone
    }

    @Override
    public IBinder onBind(Intent intent) {
        return null;
    }
}
