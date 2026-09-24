# Building the mobile app (iOS / Android)

openGym ships in two flavors from the same codebase:

| | **Self-hosted** (this repo's default) | **Mobile app** (`VITE_MOBILE=1`) |
|---|---|---|
| Runs | in any browser, against your own server | natively on iPhone / Android (Capacitor shell) |
| Accounts | passkey sign-in, one profile per person | none by default; optional sync token from a passkey session |
| Data | synced to your server, readable on desktop | `opengym-state.json` on the phone; optional sync to your server |
| Reminders | Web Push from your server | native local notifications, no server involved |
| Exercise media | served by your server (`img/`, `gif/`) | loaded from the jsDelivr CDN |

The phone keeps `opengym-state.json` in the app's private data directory on every change
(iOS is allowed to evict WebView storage under pressure — the file is the durable copy
and is restored on launch). Settings can optionally sync that file to a self-hosted
server: sign in with a passkey on the server, copy the sync token, and paste the server
address and token on the phone. Newest edit wins per workout day, and a day is never
deleted silently. Signing out and a failed sync leave the file in place. Backups go out
through the OS share sheet instead of a browser download.

## Prerequisites

- Node 20+
- **Android:** Android Studio (bundles the SDK). Java 21 for Gradle — Android Studio's JDK is enough; a system Java 17 is not.
- **iOS:** a Mac with Xcode 15+ and CocoaPods (`brew install cocoapods`). A free Apple ID
  is enough to run the app on your own iPhone (see below); paid membership is only needed
  for App Store distribution, which openGym doesn't do.

## Build & run

```sh
cd frontend
npm install
npm run build:mobile        # sets VITE_MOBILE and syncs android/ and ios/ (works in cmd and bash)

npx cap open android        # opens Android Studio → run on emulator or device
npx cap open ios            # opens Xcode (Mac only) → set your signing team, then run
```

`npm run build:mobile` bakes the CDN media base into the bundle and copies the web build
into both native projects — re-run it after every web-code change before building natively.

> **Heads-up:** after `build:mobile`, `frontend/dist` contains the *mobile* bundle.
> Run a plain `npm run build` again before deploying `dist` to a server.

## App icons & splash screens

`frontend/resources/icon.svg` is the 1024×1024 source (the app's dumbbell glyph on the
app background). Generate all platform assets from it on a machine with the tooling:

```sh
cd frontend
npx @capacitor/assets generate --iconBackgroundColor '#0c0e12' --splashBackgroundColor '#0c0e12'
```

(If the generator won't take the SVG directly, export it to `resources/icon.png` at
1024×1024 first — any image tool can do it.)

## Distribution — deliberately no app stores

openGym's mobile app is not on the Play Store or App Store, and that's a choice: no store
accounts, no store rules, no yearly fees between you and an open-source app.

### Android — sideload the APK

The official signed APK is at **[opengym.duarte-santos.ch](https://opengym.duarte-santos.ch)**.
Android asks you to allow installs from the browser the first time — that's standard for any
app outside the Play Store.

To build and sign your own:

```sh
cd frontend && npm run build:mobile
cd android && ./gradlew assembleRelease
```

`assembleRelease` signs the APK when `android/keystore.properties` is present. That file
and `opengym-release.keystore` stay on your machine (both are gitignored). Keep both:
an update signed with a different key will not install over the existing app. Copy the
example if you are creating the key yourself:

```sh
cd frontend/android
cp keystore.properties.example keystore.properties
keytool -genkeypair -keystore opengym-release.keystore -alias opengym -keyalg RSA -keysize 2048 -validity 10950
```

Put the same password in `storePassword` and `keyPassword`. Android Studio's Java 21
`keytool` is the one to use.

### iPhone — what's actually possible

Apple does not allow installing apps outside the App Store, so there is no `.ipa` download
that would simply install. Your free options:

- **Self-host + PWA** (recommended): open your instance in Safari → Share → *Add to Home
  Screen*. Full-screen app, no expiry, plus sync and passkeys.
- **Xcode free signing:** open `ios/` in Xcode with a free Apple ID as the team and run it
  onto your own iPhone. Apple expires the signature after 7 days; re-run from Xcode to renew.
- **AltStore:** automates that 7-day re-signing over Wi-Fi via a Mac companion app.

### Release notes for maintainers

- Bump `versionName`/`versionCode` in `android/app/build.gradle` per release; keep them in
  step with `frontend/package.json`. `versionCode` must strictly increase or updates won't
  install over an existing APK.
- **License:** openGym is AGPL-3.0, which by itself sits badly with app-store terms of
  service. `NOTICE.md` carries an app-store exception (an additional permission under
  AGPL §7) granted by the copyright holder — relevant only if store distribution ever happens.
- The app requests notification permission only when the workout-day reminder is switched
  on, and (on Android) declares `SCHEDULE_EXACT_ALARM` so the reminder fires to the minute
  where the user allows it.
