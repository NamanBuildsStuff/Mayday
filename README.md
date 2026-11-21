# MayDay

**MayDay** is an emergency calling, community-verified disaster awareness, neighborhood utility outage check, and official government alert platform — localized to **Patiala · Thapar Institute (TIET)** (`30.3564, 76.3647`) and adaptable anywhere via live GPS.

MayDay is built as **two separate applications**:
1. **MayDay Web PWA** — an installable Progressive Web App hosted on GitHub Pages that works in any mobile or desktop browser.
2. **MayDay Android App (`.apk`)** — a standalone native Kotlin Android app (`android/`) with **two native Android Home Screen Widgets** and automatic offline fallback.

> **Core Philosophy:** Zero machine learning · Zero social media scraping · Zero fake seed disasters · Emergency calling first, community verification second.

- **Live Web PWA:** https://namanbuildsstuff.github.io/Mayday/
- **Android APK Downloads:** https://github.com/NamanBuildsStuff/Mayday/releases (or the latest run under the **Actions** tab)

---

## Core Functions

Both the Web PWA and the Android app provide the complete MayDay feature set:

### 1. Six-Tile Icon-First Emergency Dialer
| Tile | Helpline / Action | What It Does |
| :--- | :--- | :--- |
| **Fire** | `101` | Immediately dials `101`, locks your GPS in the background, and pings nearby devices for verification. |
| **Collapse** | `112` | Immediately dials `112`, locks your GPS in the background, and pings nearby devices for verification. |
| **Medical** | `108` + Hospitals | Lists **7 real hospitals near Patiala / Thapar** sorted by live distance (Haversine formula) with real phone numbers, 1-tap Call, and Google Maps directions. **Private by default** (no automatic verification pings), with an opt-in **"Push Alert to Nearby Users"** option. |
| **Police** | `112` / `100` | **State-aware:** automatically chooses the right Police helpline across 14 Indian states using GPS or the manual state selector (`PB`, `CH`, `HR`, `DL`, `HP`, `UP`, `MH`, `RJ`, `GJ`, `KA`, `TN`, `WB`, `KL`, `TS`). |
| **Other** | `112` | Asks *"What is the emergency?"* (with quick chips like *Gas Leak*, *Road Accident*, *Fallen Tree / Wire*, *Trapped in Lift*) before dialing `112` and alerting nearby users. |
| **Contact (ICE)** | Personal | First tap prompts you to save a private Emergency Contact (name + phone number). Every tap after calls them directly without broadcasting publicly. Includes a top-right pencil icon to edit or remove the contact anytime. |

### 2. Neighborhood Utility Outage Checks
- Tap **Electricity Outage** or **Water Outage** to ping nearby residents and ask whether the outage is happening in their area (`Yes, Out` / `No, Working`).
- Confirmed outages display as active alerts and include a **`Resolved?`** button so neighbors can mark power or water as restored across all connected devices.

### 3. Minimalist Home Map Peek & Full Disaster Map
- **Home Map Peek:** Shows a dark minimalist live Carto map directly on the Home screen with your current pin, live Patiala weather pill, and active incident markers. Tap to open the full map.
- **Full Interactive Map:** Filter pins by `All`, `Govt`, `Verified`, or `Pending`, recenter on GPS, and inspect incident details or actions in the side/mobile inspector.

### 4. Official Government Alerts (Changeable Scope)
- Real-time alerts pulled directly from official government and scientific feeds (never seeded with mock tragedies).
- Defaults to a **10 km** radius around your location and can be switched anytime (`5 km`, `10 km`, `25 km`, `100 km`, `500 km`, or `All`).

### 5. Deterministic Peer Verification & Citizen Safety Rules
- **No ML / No Scraping:** Only two sources ever appear on the map — Official Government/Scientific APIs and direct User Reports.
- **Deterministic Consensus:** `2` nearby confirmations → **Community Verified**; `3` false-alarm flags → auto-dismissed.
- **Demo Reset Controls:** Delete individual reports or use **Clear All** to wipe test reports across all connected devices in real time.
- **Strict Safety Boundaries:**
  - **Official Government Alerts (Major Crises):** Strictly **Alert Only** — citizen volunteering is disabled.
  - **Minor Local User Incidents:** Optional minimal safe-distance support (such as keeping lanes clear for emergency vehicles) is gated behind a mandatory **"Reminder: You Are Endangering Yourself"** modal and explicit checkbox acknowledgment.

---

## Using the Web PWA

The **Web PWA** runs directly in Chrome, Safari, Edge, or Firefox with zero app store installation required.

### How to Open & Install
1. Visit https://namanbuildsstuff.github.io/Mayday/ on your phone or laptop.
2. **Install on Android (Chrome):** Tap the install icon in the top bar (or browser menu → **Install app / Add to Home screen**).
3. **Install on iPhone (Safari):** Tap **Share** → **Add to Home Screen**.
4. Tap the **Bell icon** in the top-right bar to enable live browser alert notifications.

### Using the PWA Day-to-Day
- **Set Location:** Tap the crosshair icon on the Home map peek to lock your live GPS, or pick a Patiala sector from the dropdown.
- **Adjust Govt Alert Scope:** Use the radius selector (`10 km` default) next to **Govt Alerts** or in the **Verify** tab.
- **Multi-Device Live Sync:** Open the PWA on two or more phones — pressing an emergency button, reporting an outage, confirming, resolving, or deleting syncs across devices in `< 300ms` via Server-Sent Events (`ntfy.sh` relay).
  - Tip: Add `?room=myteam` to the URL (e.g. `https://namanbuildsstuff.github.io/Mayday/?room=demo`) on all test phones for a private demo channel.
- **Offline Support:** The Service Worker (`sw.js`) caches the app shell so the UI loads even on poor connectivity.

### Running the PWA Locally with Python Backend
Requires **Python 3** (no `pip install` or Node needed):
```bash
python3 server.py
```
Open `http://localhost:8080` on your computer or `http://<your-lan-ip>:8080` on phones on the same Wi-Fi. Local mode enables SQLite persistence (`mayday.db`), local SSE (`/api/events`), and the live **NDMA SACHET** RSS proxy.

---

## Using the Android App (`.apk`)

The **Android App** is a standalone native Kotlin application in `android/` (completely separate from the web PWA files).

### How to Download & Install
1. Download **`Mayday.apk`** from https://github.com/NamanBuildsStuff/Mayday/releases (or from the latest completed run under **Actions → Build MayDay Android APK → Artifacts → `Mayday-APK`**).
2. Open `Mayday.apk` on your Android phone and allow **Install unknown apps** if prompted.
3. Launch **MayDay** from your app drawer and allow **Location** (for live GPS + state police auto-detection) and **Notifications** when prompted.

### How the Android App Differs from the PWA
- **Pre-Filled Native Dialer (`Intent.ACTION_DIAL`):** Tapping any emergency tile, hospital number, or personal emergency contact opens Android's native phone dialer pre-filled with the number — 1 tap to place the call, preventing accidental pocket dials and requiring zero invasive `CALL_PHONE` permission.
- **Native Google Maps Integration:** Tapping directions on any nearby hospital opens the native Google Maps app directly.
- **Bundled Offline Fallback:** Loads the live MayDay experience when online and automatically falls back to bundled local assets (`android/app/src/main/assets/www/`) if opened with no internet connection.
- **Android Back Button Support:** Pressing hardware/gesture Back closes open modals or returns to the Home screen before exiting the app.
- **Native Home Screen Widgets:** Syncs your saved Personal Emergency Contact and selected State automatically to your Android Home Screen Widgets.

---

## Android Home Screen Widgets

MayDay includes **two dark-obsidian native Android widgets** designed for instant access without even opening the app.

### 1. MayDay Quick Dial (`4×2`, resizable)
- **Header:** Left-aligned `Mayday.` brand link (opens app home) + quick **Hospitals** chip (jumps straight to the Nearby Hospitals list) + **Map** chip (opens the full live disaster map).
- **4 Pre-Filled Dialer Tiles:**
  - **Fire (`101`)** → opens dialer pre-filled with `101`.
  - **Medical (`108`)** → opens dialer pre-filled with `108`.
  - **Police (`112` / `100`)** → dynamically displays your selected state (e.g. `Police · PB`) and opens dialer pre-filled with that state's police number.
  - **Personal Emergency Contact** → shows `+ Add` before setup (tapping jumps directly to the Save Emergency Contact modal in MayDay). Once saved, it displays your contact's name (e.g., `Mom`) and opens the dialer pre-filled with their phone number.

### 2. MayDay Contact & 112 (`2×1`, compact bar)
- Minimal two-button home screen strip for tight layouts:
  - **Left (`112`):** Opens pre-filled dialer with `112`.
  - **Right (Personal Contact):** Shows your saved contact's name and opens pre-filled dialer (or opens the Save Contact modal if not set yet).

### How to Add & Sync Widgets
1. Long-press an empty space on your Android home screen → tap **Widgets** → scroll to **MayDay**.
2. Drag **MayDay Quick Dial** or **MayDay Contact & 112** onto your home screen.
3. Whenever you save/edit your Personal Emergency Contact or change your State inside the MayDay Android app, a native JavaScript bridge (`MaydayAndroid`) saves it to Android `SharedPreferences` and refreshes all placed widgets immediately.

---

## What We Used to Build MayDay

### Web PWA & Optional Local Backend
- **HTML5 & Pure Standard CSS3:** Custom dark-obsidian minimalist design system with CSS custom properties — **zero CSS frameworks** (no Tailwind, no Bootstrap).
- **Vanilla JavaScript (ES6+):** Zero frontend frameworks or bundlers; direct DOM rendering, Haversine distance calculation, `localStorage` persistence, and `EventSource` real-time updates.
- **Leaflet.js (`1.9.4`) + Carto Dark Basemaps:** Interactive dark vector/raster map (`dark_all` for full map, `dark_nolabels` for the minimalist Home peek).
- **Phosphor Icons + Google Fonts (`Inter` & `JetBrains Mono`):** Clean icon-first UI and tabular monospace telemetry numbers.
- **PWA APIs:** Web App Manifest (`manifest.webmanifest`), Service Worker (`sw.js`), Geolocation API, and Web Notifications API.
- **Real-Time Live Data & Sync:**
  - **USGS Earthquake Hazards API** (live seismic events)
  - **NASA EONET v3** (live satellite-tracked wildfires, storms, and floods)
  - **Open-Meteo API** (live Patiala · Thapar weather & severe thresholds)
  - **NDMA SACHET CAP RSS** (official Govt. of India advisories via local backend)
  - **Server-Sent Events (SSE) + `ntfy.sh` Relay** (real-time cross-device sync on static GitHub Pages)
- **Python 3 Standard Library (`server.py`):** Zero-dependency local HTTP/SSE server with built-in `sqlite3` (`mayday.db`) and `urllib` RSS aggregator.

### Standalone Android App & Widgets
- **Kotlin (`1.9.24`) & Android SDK (`compileSdk 34`, `targetSdk 34`, `minSdk 24`)**
- **Gradle (`8.7`) & Android Gradle Plugin (`8.5.2`)** on **Java 17 (Temurin JDK)**
- **AndroidX Libraries:** `androidx.core:core-ktx` (`1.13.1`) and `androidx.appcompat` (`1.7.0`)
- **Android Native Components:**
  - `WebView`, `WebViewClient`, `WebChromeClient` (runtime GPS & notification permission handling, `tel:` / Google Maps intent routing, offline fallback)
  - `@JavascriptInterface` (`MaydayAndroid`) + Android `SharedPreferences` (automatic live sync between app state and native widgets)
  - `AppWidgetProvider`, `RemoteViews`, `PendingIntent` (`FLAG_IMMUTABLE`), `Intent.ACTION_DIAL`, and native XML `<vector>` / `<shape>` drawables (adaptive launcher icon + dark obsidian widgets)

### Hosting & Cloud APK Build
- **GitHub Pages:** Hosts the live HTTPS Web PWA directly from `main`.
- **GitHub Actions (`.github/workflows/build-apk.yml`):** Automatically compiles `Mayday.apk` in the cloud on `ubuntu-latest` (JDK 17 + Gradle 8.7) whenever `android/` changes, uploading it to **Actions Artifacts** and **GitHub Releases**.

---

## Project Structure

```text
Mayday App/
├── .github/workflows/build-apk.yml           # Cloud Android APK build & Releases workflow
├── index.html                                # Web PWA shell (Call, Map, Verify views + modals)
├── styles.css                                # Pure standard minimalist dark obsidian CSS
├── app.js                                    # Dialer, hospitals, ICE contact, outages, APIs & SSE sync
├── manifest.webmanifest                      # PWA install manifest (standalone mode)
├── sw.js                                     # Service Worker for offline caching
├── icon.svg                                  # MayDay radar-beacon vector icon
├── server.py                                 # Optional zero-dependency Python 3 backend (SQLite + SSE)
└── android/                                  # Standalone native Android APK project (separate from PWA)
    ├── settings.gradle.kts
    ├── build.gradle.kts
    ├── gradle.properties
    └── app/
        ├── build.gradle.kts
        └── src/main/
            ├── AndroidManifest.xml
            ├── assets/www/                   # Bundled offline web assets
            ├── java/com/mayday/app/
            │   ├── MainActivity.kt           # Full-screen WebView, GPS, ACTION_DIAL & widget bridge
            │   ├── MaydayPrefs.kt            # SharedPreferences store & widget refresh helpers
            │   ├── QuickDialWidgetProvider.kt   # 4×2 Emergency Quick Dial & Map/Hospital widget
            │   └── CompactSosWidgetProvider.kt  # 2×1 Compact 112 & Personal Contact widget
            └── res/                          # Dark obsidian widget layouts, vector icons & adaptive icon
```

---

## Configuration Notes

- **Live Calling vs. Demo Safe Mode (`app.js` line 7):**
  ```js
  const DEMO_SAFE_CALL_MODE = false;
  ```
  - `false` (default): Triggers real `tel:` dialing on phones.
  - `true`: Simulates calls safely for demos while still running real GPS capture, map plotting, and multi-device verification pings.
- **PWA Cache Refresh:** After editing `index.html`, `styles.css`, or `app.js`, bump `CACHE_NAME` on line 1 of `sw.js` (currently `mayday-pwa-v11`) so installed PWAs fetch fresh files on reload.
- **Building the APK Locally (Optional):** Open `android/` in Android Studio or run `gradle assembleDebug` inside `android/` with JDK 17 + Android SDK installed (`android/app/build/outputs/apk/debug/app-debug.apk`).
