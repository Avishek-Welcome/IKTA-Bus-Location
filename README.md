# IKTA Bus — Where is my bus?

A mobile-first web app (PWA) for live bus tracking. It runs in any modern browser on Android and iPhone and can be installed to the home screen. It has three account types:

| Account | Page | Sign-in |
|---|---|---|
| **Passenger** (default) | `index.html`, `favorites.html`, `coins.html` | None. An anonymous session is created in the background for coins and favourites. |
| **Driver** | `driver.html` | User ID and password created by the bus owner |
| **Owner** | `owner.html` | Registers with a one-time secret code, then signs in with user ID and password |
| Admin (code issuer) | `admin.html` | Firebase account listed under `/admins` |

## Features

**Passenger (home page)**
- Full-screen live map. Bus markers move smoothly and show the bus name, registration number and direction.
- Source is your GPS location (default) or any bus stop. Destination is a bus stop, with an autocomplete list ranked by name match and distance.
- Finds every route (bus name, e.g. *DN 12*) that serves both stops in the right direction. Shows each incoming bus with its distance along the route, its ETA to your boarding stop and a progress bar. The closest incoming bus is marked **Nearest incoming**.
- Chips list every bus name on the route so you can pick a preferred bus.
- **Minutes to arrive**: each bus shows about how many minutes it needs to reach your boarding stop and your destination, with clock times. With no destination set, it shows the minutes to the stop on its route nearest to you. The estimate is the road distance left ÷ the bus's recent moving speed (kept within 12–60 km/h, 20 km/h until it moves), plus about 20 s for each stop on the way.
- **Bus number view**: pick a bus number (chips under the search, a bus marker's popup, or a favourite bus) to see its whole road route with every stop, the total km by road, and every bus of that number running now. ETAs and distances use the road route when the driver has saved one.
- **10-minute alert**: a tone plays (Web Audio, no download needed) and the phone vibrates when a bus is 10 minutes or less from your stop. If the app is in the background, a system notification is shown instead. A bus that has already passed your stop never triggers an alert.
- **Live crowd feedback** (🟢 Seats free · 🟡 Standing · 🔴 Crowded · ⛔ Packed). Each report earns **5 IKTA Coins**.
- **Favourites**: you can keep several named lists of routes and bus numbers. They are saved on the device and synced to Firebase.

**Driver**
- Signs in with credentials from the owner. **"Save user ID & password"** allows one-tap sign-in later.
- One button starts or stops GPS broadcasting. Updates are sent every 1.5 s while moving and every 20 s while standing still (only the position, speed and direction after the first update). A screen wake lock keeps the phone awake. The bus is shown as offline automatically if the connection drops.
- A direction toggle (towards destination or towards source) lets passengers' ETAs skip buses going the other way.
- **Route & stops editor**: add a stop at your current GPS position, by tapping the map, or from existing stops. Stops are auto-arranged by distance from the source, and you can reorder them or change the source and destination. One route is shared by every bus with the same name.
- **Place hints**: typing a place or bus stop name shows saved stops plus OpenStreetMap places with their road, town, district and state ([Photon](https://photon.komoot.io), free, no key; fair use only, no bulk requests).
- **Road distance**: the route is measured along the roads through the source, every stop in order, and the destination ([OSRM](https://project-osrm.org) via the FOSSGIS server `routing.openstreetmap.de`, with the OSRM demo server as backup; free, no key, light use only). The road line, total km and per-stop km are saved with the route, so passengers' phones never call the router.

**Owner**
- Registration needs a **10-character one-time secret code** (letters, digits and special characters, no repeated characters). The code is used up in an atomic transaction and the owner's name, user ID and time are recorded on it.
- Add any number of buses (the same bus name can have many registration numbers) and see them grouped by bus name.
- Create a driver login for each bus, change a driver's password, share login details (Web Share / copy), and remove drivers or buses.
- Live fleet map plus live, speed and crowd status for each bus.

**Admin**: generate secret codes and see which codes were used, and by whom.

## Fast map loading on the home page

- `preconnect` to the Leaflet CDN and the OpenStreetMap tile server (no API key needed), and `preload` for Leaflet.
- `js/map-boot.js` creates the map and starts downloading tiles **immediately**, at the last viewed position, before the app modules, the Firebase SDK or a GPS fix are available.
- The Firebase SDK is loaded **lazily** after the map is visible. The web font loads without blocking rendering.
- Stops and routes are cached in `localStorage` for instant search on the next visit.
- The service worker (`sw.js`) serves the app shell stale-while-revalidate and caches map tiles cache-first (up to 800). Repeat visits load almost instantly and still work with a poor network.
- Live positions travel over the Firebase Realtime Database WebSocket (usually 100–300 ms from driver to passenger).

## Try it now (demo mode)

When `apiKey` in `js/firebase-config.js` is set to `'YOUR_API_KEY'`, the app runs in **demo mode**:
- All data is stored in the browser (`localStorage`) and synced across tabs.
- Simulated buses move along three North Kolkata routes (DN 12, DN 8, L38).

Serve the folder over HTTP. Geolocation needs `https://` or `localhost`:

```bash
npx serve .            # or: python3 -m http.server 8080
```

| Demo login | User ID | Password |
|---|---|---|
| Owner | `demo_owner` | `Demo@1234` |
| Driver (bus WB 23A 9999) | `driver_dn12` | `Drive@1234` |
| Admin | `admin` | `Admin@1234` |

Unused demo secret codes: `K7@p2Q!x9M`, `A4%tR8&zW1`, `Z9*mB3+qL6`, `H2=vN5?cT8`, `P6~dF1^kY3`.
Open `driver.html` in one tab and `index.html` in another to watch your own broadcast appear live.

## Going live with Firebase

1. ✅ Done: `js/firebase-config.js` holds the config for the **ikta-bus** project and loads Firebase JS SDK **12.19.0**. Analytics starts only when the browser is idle, so it does not slow down the map.
   - Check `databaseURL` there. It is set to the us-central1 default (`https://ikta-bus-default-rtdb.firebaseio.com`). If your Realtime Database is in another region, copy the URL shown at the top of *Realtime Database → Data*.
   - To go back to demo mode, set `apiKey` to `'YOUR_API_KEY'`.
2. **Authentication → Sign-in method**: enable **Email/Password** and **Anonymous**.
   - User IDs are mapped internally to `userid@owner.ikta-bus.app` / `userid@driver.ikta-bus.app`, so users never need a real email address.
3. **Realtime Database**: create a database, then publish `database.rules.json`, either through the console's Rules tab or with `firebase deploy --only database`.
4. **Create an admin**:
   - Under *Authentication → Users*, add a user, e.g. `admin@admin.ikta-bus.app` (sign in later with user ID `admin`), or any real email.
   - In the database, add `admins/<that user's UID>: true`.
5. **Issue secret codes**:
   - Sign in at `admin.html` and press *Generate*, or
   - Run `node scripts/generate-codes.mjs 20 > codes.json` and import that file at `/secretCodes` while the node is still empty.
6. Deploy as static files, either with `firebase deploy --only hosting` (uses `firebase.json`) or with the included GitHub Pages workflow.
   - **Automatic Firebase deploys:** `.github/workflows/firebase-hosting.yml` deploys every push to `main` to https://ikta-bus.web.app. Turn it on once:
     1. In the Firebase console, open *Project settings → Service accounts* and press **Generate new private key**. A `.json` file downloads.
     2. On GitHub, open the repo's *Settings → Secrets and variables → Actions*, press **New repository secret**, name it `FIREBASE_SERVICE_ACCOUNT`, and paste the whole contents of that file.
     3. Under *Actions → Deploy to Firebase Hosting*, press **Run workflow**, or push to `main`. Delete the downloaded key file afterwards.

### Data model (Realtime Database)

```
secretCodes/{code}            used, usedBy, usedByName, usedByUserId, usedAt, createdAt
owners/{uid}                  name, userId, phone, code, buses/{regKey}: true
usernames/{userId}            uid, role, ownerUid?          (unique user IDs)
buses/{regKey}                regNo, busName, busKey, ownerUid, ownerName, driverUid?, driverName?
drivers/{uid}                 name, phone, userId, ownerUid, regKey, regNo, busName, busKey
ownerDrivers/{ownerUid}/{uid} userId, password, name         (owner-only, see note)
stops/{stopId}                name, lat, lng, createdBy
routes/{busKey}               busName, stops[ordered stopIds], source, destination
live/{regKey}                 lat, lng, speed, heading, acc, ts, online, dir, busName, busKey, regNo
crowd/{regKey}                level, ts, count               (latest crowd summary)
feedback/{regKey}/{id}        level, by, ts
passengers/{uid}              coins, lastFeedbackAt, history/{id}, favorites
```

### Security (summary of `database.rules.json`)
- Only the driver assigned to a bus (`buses/{reg}/driverUid`), or the bus's owner, can write `live/{reg}`. Unauthorised broadcasts are rejected by the server.
- A secret code can only change from `used: false` to `used: true` with `usedBy` set to the caller. An owner profile is only accepted if the caller has used that code.
- Owners can only manage their own buses and drivers. Drivers can only edit the route for their own bus name.
- Coins can only go up by exactly 5, together with a server-timestamped report at least about 2 minutes after the previous one.

> **Note on driver passwords.** Owners need to see and change their drivers' passwords, so the client-only design stores each driver's password under `ownerDrivers/{ownerUid}`, which only that owner can read. For stronger security, move driver creation and password changes to a Cloud Function using the Admin SDK and stop storing the password.

## Platform notes
- iPhone: install with Safari → Share → *Add to Home Screen*. iOS pauses GPS when a web app is in the background, so drivers should keep the app open on screen. The wake lock helps on supported versions.
- Alert sounds need one tap anywhere on the page first (a browser autoplay rule).

## Android app (APK)
`android/` is a small native app that shows https://ikta-bus.web.app full screen, so every website update reaches the app with no reinstall. On top of the website it adds:
- the phone's own GPS (through `js/app-bridge.js`), which keeps running while a driver shares with the screen off or another app open (an ongoing "Sharing bus location" notification shows while it does);
- the screen kept awake while sharing, and bus-arrival notifications;
- long-press shortcuts for Find my bus, Favourites and Driver.

**Download:** https://github.com/Avishek-Welcome/IKTA-Bus-Location/releases/download/android-latest/ikta-bus.apk
**Install:** open the file on the phone, allow "Install unknown apps" for the browser or Files app when asked, then tap Install. Allow Location when the app asks (and Notifications for drivers).

**Building:** `.github/workflows/android-apk.yml` builds and signs the APK on every push to `main` that changes `android/` (or from *Actions → Android APK → Run workflow*) and puts it on the `android-latest` release. It needs the repo secrets `ANDROID_KEYSTORE_BASE64` and `ANDROID_KEYSTORE_PASSWORD`. Keep the keystore safe and never commit it: Android only installs an update signed with the same key. Locally, `android/build.sh` builds with the Android SDK's build-tools (no Gradle).

## iPhone
**Install today (no App Store):** open https://ikta-bus.web.app in Safari, tap **Share**, then **Add to Home Screen**, then **Add**. IKTA Bus then opens full screen from its own icon, like an app. iPhones only install apps from the App Store or TestFlight, so there is no downloadable file like the Android APK.

**iPhone app (`ios/`):** a small native app that shows the website full screen, like the Android app, with the phone's own GPS, notifications and screen kept on while a driver shares (through `js/app-bridge.js`). The Xcode project is generated from `ios/project.yml` with [XcodeGen](https://github.com/yonaskolb/XcodeGen).

**Building:** `.github/workflows/ios-app.yml` builds it on a Mac runner on every push to `main` that changes `ios/` (or from *Actions → iOS app → Run workflow*) and puts an unsigned `ikta-bus-unsigned.ipa` on the `ios-latest` release. To send it to TestFlight it needs an Apple Developer Program membership, an app record in App Store Connect for the bundle ID `com.ikta.bus` (or the repo variable `IOS_BUNDLE_ID`), and the repo secrets `APPLE_TEAM_ID`, `APPSTORE_API_KEY_ID`, `APPSTORE_API_ISSUER_ID` and `APPSTORE_API_KEY_P8`. Locally on a Mac: `cd ios && xcodegen generate && open IKTABus.xcodeproj`.

## Project structure

```
index.html  favorites.html  coins.html  driver.html  owner.html  admin.html
css/app.css                 design system (light/dark, glass UI, mobile-first)
js/map-boot.js              critical-path map bootstrap
js/passenger.js             search, ETA engine, alerts, feedback
js/driver.js  js/owner.js  js/favorites.js  js/coins.js  js/admin.js
js/common.js                UI helpers, icons, geo math, map helpers
js/api.js                   backend selector (Firebase or demo)
js/backend-firebase.js      Firebase Auth + Realtime Database adapter
js/backend-demo.js          in-browser demo backend
js/demo-seed.js             demo stops/routes/buses and bus simulator
js/favs.js                  favourite lists + sync
sw.js  manifest.webmanifest icons/   PWA
js/app-bridge.js            GPS/notifications/screen-on from the Android and iPhone apps
android/                    Android app (WebView wrapper) + build.sh
ios/                        iPhone app (WKWebView wrapper), XcodeGen project.yml
database.rules.json  firebase.json  scripts/generate-codes.mjs
```
