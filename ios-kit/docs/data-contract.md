# Data contract with the IKTA Bus website (iPhone app)

The iPhone app, the Android app and the website (https://ikta-bus.web.app) share one Firebase project. Both
must read and write exactly this. Source of truth: the website repo's `database.rules.json`,
`js/backend-firebase.js`, `js/driver.js`, `js/passenger.js`, `js/road.js`, `js/common.js`.
If you find a difference between this file and that code, the code wins: fix this file.

## Firebase project

| Setting | Value |
| --- | --- |
| Project ID | `ikta-bus` |
| Realtime Database URL | `https://ikta-bus-default-rtdb.firebaseio.com` |
| Auth providers | Email/Password and Anonymous |
| iOS app | bundle ID `com.ikta.bus`; config comes from `IKTABus/GoogleService-Info.plist` (downloaded from the Firebase console, added in playbook step 5) |

## Accounts

- User ID rule: `^[a-z0-9][a-z0-9_-]{3,19}$` (lower case, 4 to 20 characters, no dots).
- User ID to email (`idToEmail`): trim, lower case; if it already contains `@` use it as is,
  otherwise `<id>@driver.ikta-bus.app`, `<id>@owner.ikta-bus.app` or `<id>@admin.ikta-bus.app`.
- One Firebase app instance per role (`passenger`, `driver`, `owner`, `admin`), each with its
  own auth session. Passenger uses anonymous sign-in.
- Owners create, re-password and delete driver accounts through a throw-away secondary
  Firebase app (in-memory auth), so the owner stays signed in.

## Keys

`keyOf(s)` = upper case, then remove everything that is not `A-Z` or `0-9`.
- `regKey` = `keyOf(regNo)`, e.g. `WB 23A 9999` → `WB23A9999`.
- `busKey` = `keyOf(busName)`, e.g. `DN 12` → `DN12`.

## Paths

```text
secretCodes/{code}            used, usedBy, usedByName, usedByUserId, usedAt, createdAt
owners/{uid}                  name, userId, phone, code, buses/{regKey}: true
usernames/{userId}            uid, role, ownerUid?
buses/{regKey}                regNo, busName, busKey, ownerUid, ownerName, driverUid?, driverName?
drivers/{uid}                 name, phone, userId, ownerUid, regKey, regNo, busName, busKey, createdAt
ownerDrivers/{ownerUid}/{uid} userId, password, name, regKey     (owner-only)
stops/{stopId}                name (<= 80 chars), lat, lng, createdBy
routes/{busKey}               busName, stops [ordered stopIds], source, destination, road?
live/{regKey}                 lat, lng, speed, heading, acc, ts, online, dir, busName, busKey, regNo, driverUid, driver
crowd/{regKey}                level, ts, count
feedback/{regKey}/{id}        level, by, ts
passengers/{uid}              coins, lastFeedbackAt, history/{id}, favorites
admins/{uid}                  true
```

## live/{regKey} (written only by the driver's phone)

| Field | Type and unit |
| --- | --- |
| `lat`, `lng` | number, rounded to 6 decimals |
| `speed` | number, metres per second, 1 decimal, smoothed |
| `heading` | whole degrees 0 to 359 (0 = north, clockwise), or `null` |
| `acc` | whole metres |
| `ts` | number, phone time in milliseconds since 1970 |
| `online` | boolean |
| `dir` | `"fwd"` (towards destination) or `"rev"` (towards source) |
| `busName`, `busKey`, `regNo`, `driverUid`, `driver` | strings |

Sending rules (`maybeSend` in `js/driver.js`):
- First send of each sharing session, or when `dir`/bus info changes: `set` the whole record.
- Afterwards: `update` with only `lat, lng, speed, heading, acc, ts, online`.
- Send when: moved >= 5 m and >= 1.5 s since the last send; or heading turned >= 8 degrees or
  speed changed >= 4 km/h, and >= 0.9 s since the last send; or 20 s since the last send.
- On start: register `onDisconnect().updateChildren({online: false})`.
- On stop: `update {online: false, ts: now}` and cancel the onDisconnect.
- Never replay old queued positions after being offline: send only the newest fix.

Speed smoothing (`onFix`): if GPS gives no speed, distance / time from the previous fix;
`speed = max(0, speed)`; if speed > 0.5 m/s, `speed = prev + (speed - prev) * 0.6`.
Heading: phone top edge from the compass (web: `deviceorientation`; Android: rotation vector sensor; iPhone: `CLLocationManager` heading or Core Motion `CMDeviceMotion` with `.xTrueNorthZVertical`) when the phone is aligned with the
GPS course; GPS course (only when speed >= 1.4 m/s) as fallback. A phone more than 50 degrees
off course in at least half of the last 6 to 12 checks while moving >= 4 m/s counts as not
aligned. See `phoneHeading`, `checkMount`, `busHeading`.

A bus is **fresh** when `online != false` and `now - ts < 3 minutes`.

## routes/{busKey}.road (saved by the driver route editor)

| Field | Meaning |
| --- | --- |
| `poly` | OSRM geometry, Google encoded polyline (precision 5) |
| `km` | total road km, 2 decimals |
| `legs` | metres per leg between consecutive stops |
| `idx` | vertex index in `poly` of each stop, in order |
| `sig` | stop ids joined with `>`; the road is valid only if it equals the route's current stops |

## ETA (passenger)

- Moving speed per bus: if `speed > 1.5` m/s and this `ts` is new, `v = v * 0.75 + speed * 0.25`
  (first value = speed). Use `clamp(v, 3.3, 16.7)` m/s (12 to 60 km/h); 5.5 m/s (about
  20 km/h) until the bus has moved.
- Seconds = distance left along the route path / speed + 20 s for each stop strictly between
  (more than 40 m from either end).
- A bus more than 60 m past the stop has passed (no ETA, no alert). Off route = more than
  700 m from the path.
- Alert when ETA <= 10 minutes, once per bus.

## Crowd and coins

- `level` is one of `empty` (Seats free), `moderate` (Standing), `crowded` (Crowded),
  `packed` (Packed). `ts` must be the server timestamp.
- Coins go up by exactly 5 per report, with `lastFeedbackAt` = server timestamp and at least
  110 s since the previous report; one `history/{id}` entry with `coins: 5`.

## Favourites

`passengers/{uid}/favorites = { lists: [{ id, name, items: [...] }], updatedAt }`.
Items are `{type: 'bus', busKey, ...}` or a route `{type: 'route', from, to, ...}` (see
`js/favs.js` for the exact fields). Saved on the phone first; newest `updatedAt` wins.
