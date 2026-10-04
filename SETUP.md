# IKTA Bus — rebuild and redeploy from scratch

This guide lists every setting the live app depends on, so the project can be restored from this
repository (or a backup zip of it) onto a fresh machine, a new GitHub repo, or a new Firebase project.
No secrets are stored in the repository. The items marked 🔑 must be recreated by hand.

## 1. What is in the repository

| Path | Purpose |
|---|---|
| `*.html`, `css/`, `js/`, `icons/`, `lib/`, `manifest.webmanifest`, `sw.js` | The whole website (static files, no build step) |
| `js/firebase-config.js` | Firebase web config for project **ikta-bus** (public identifiers, not secrets) |
| `database.rules.json` | Realtime Database security rules |
| `firebase.json` | Hosting settings (public folder, ignored files, cache headers) and the rules file |
| `.firebaserc` | Default Firebase project (`ikta-bus`) for the Firebase CLI |
| `.github/workflows/firebase-hosting.yml` | Deploys every push to `main` to https://ikta-bus.web.app |
| `.github/workflows/jekyll-gh-pages.yml` | Deploys every push to `main` to GitHub Pages |
| `scripts/setup-firebase.sh` | One-command Firebase setup in Google Cloud Shell (auth, rules, admin, codes) |
| `scripts/deploy-hosting.sh` | Manual Hosting deploy from Cloud Shell (fallback only) |
| `scripts/generate-codes.mjs` | Generates one-time owner secret codes |

## 2. Run it locally (no Firebase needed)

Set `apiKey` in `js/firebase-config.js` to `'YOUR_API_KEY'` to get demo mode (data in the browser,
simulated buses), then serve the folder:

```bash
npx serve .            # or: python3 -m http.server 8080
```

Open http://localhost:8080. Demo logins are in `README.md`. Restore the real `apiKey` before deploying.

## 3. Current live settings

| Setting | Value |
|---|---|
| Firebase project ID | `ikta-bus` |
| Hosting URL | https://ikta-bus.web.app |
| GitHub Pages mirror | https://avishek-welcome.github.io/IKTA-Bus-Location/ |
| Realtime Database URL | `https://ikta-bus-default-rtdb.firebaseio.com` (set in `js/firebase-config.js`) |
| Firebase JS SDK | 12.19.0, loaded from `www.gstatic.com` |
| Sign-in methods | Email/Password and Anonymous |
| Internal login emails | `<userid>@owner.ikta-bus.app`, `<userid>@driver.ikta-bus.app`, admin `admin@admin.ikta-bus.app` |
| Admin | Firebase user `admin@admin.ikta-bus.app` (sign in with user ID `admin`), flagged at `/admins/<uid>: true` |
| Service worker cache | `ikta-v19` in `sw.js` (bump it whenever app files change) |

## 4. Rebuild on the same Firebase project (`ikta-bus`)

Nothing to do for the website: it is already deployed and redeploys on every push to `main`.
If the GitHub repo is new or the secret was lost, redo step 6 below.

## 5. Rebuild on a NEW Firebase project

1. Create a project at https://console.firebase.google.com and add a **Web app**. Copy its config.
2. Replace the values in `js/firebase-config.js` (`apiKey`, `authDomain`, `databaseURL`, `projectId`,
   `storageBucket`, `messagingSenderId`, `appId`, `measurementId`).
3. Replace `ikta-bus` with the new project ID in `.firebaserc`, `.github/workflows/firebase-hosting.yml`
   (`projectId`) and both scripts in `scripts/` (`PROJECT=`).
4. **Authentication → Sign-in method**: enable **Email/Password** and **Anonymous**.
   **Authentication → Settings → Authorized domains**: add your Hosting and GitHub Pages domains.
5. **Realtime Database**: create it (any region, locked mode). If the region is not us-central1, copy
   the URL from *Realtime Database → Data* into `databaseURL`.
6. Then either run the setup script in Google Cloud Shell (it publishes the rules, creates the admin
   and 20 owner codes):

   ```bash
   bash <(curl -sL https://raw.githubusercontent.com/<you>/<repo>/main/scripts/setup-firebase.sh)
   ```

   or do it by hand: `firebase deploy --only database`, add an admin user under
   *Authentication → Users*, set `admins/<uid>: true` in the database, and issue codes from
   `admin.html` or `node scripts/generate-codes.mjs 20 > codes.json` (import at `/secretCodes`).
7. Optional: in Google Cloud Console → APIs & Services → Credentials, restrict the web API key to
   your domains.

## 6. Automatic deploys from GitHub

🔑 **`FIREBASE_SERVICE_ACCOUNT`** (repo secret, required for Firebase Hosting deploys)

1. Firebase console → *Project settings → Service accounts* → **Generate new private key**.
2. GitHub repo → *Settings → Secrets and variables → Actions* → **New repository secret**,
   name `FIREBASE_SERVICE_ACCOUNT`, paste the whole JSON file. Delete the downloaded file.
3. *Actions → Deploy to Firebase Hosting → Run workflow*, or push to `main`.

Without the secret the workflow just prints a notice and skips.

**GitHub Pages**: repo *Settings → Pages → Source: GitHub Actions*. The Jekyll workflow then
publishes every push to `main`.

Cloud Shell `firebase deploy --only hosting` uploads have timed out before; use the GitHub
Action instead. `scripts/deploy-hosting.sh` is kept as a fallback.

## 7. Things to recreate by hand (never in the repo)

| Item | Where it lives | How to recreate |
|---|---|---|
| 🔑 `FIREBASE_SERVICE_ACCOUNT` | GitHub repo secret | Section 6 |
| 🔑 Admin password | Firebase Authentication | Reset it in *Authentication → Users*, or rerun the setup script |
| 🔑 Owner / driver accounts and passwords | Firebase Authentication + database | Owners re-register with new secret codes; owners recreate drivers |
| Database data (stops, routes, buses, coins, codes) | Realtime Database | Export from *Realtime Database → ⋮ → Export JSON* to keep a copy; import the same way |

The database **is not** part of this repository. To keep a full backup, export the JSON from the
console from time to time and store it somewhere private (it contains driver passwords stored for
owners, so do not commit it).

## 8. Free external services (no API keys)

| Service | Used for | Notes |
|---|---|---|
| OpenStreetMap tiles `tile.openstreetmap.org` | Raster base map (first paint, fallback) | Fair use; switch to a keyed provider (e.g. MapTiler) if traffic grows |
| OpenFreeMap `tiles.openfreemap.org` (style *liberty*) | Vector base map with local-language labels, drawn by MapLibre GL (`lib/maplibre-gl/`, bundled) | Free, no key |
| Photon `photon.komoot.io` | Place name hints in the driver's route editor | Fair use, no bulk requests |
| OSRM `routing.openstreetmap.de`, backup `router.project-osrm.org` | Road distance and route line when a driver saves a route | Light use only; results are saved with the route |
| Leaflet 1.9.4 (cdnjs), leaflet-rotate 0.2.8 (jsDelivr) | Map library | CDN |
| Google Fonts | Web font | CDN |
| Firebase SDK (`www.gstatic.com/firebasejs/`) | Auth + Realtime Database | CDN |

Do not use CARTO basemaps: they now return "API KEY REQUIRED".
