# MayDay

**MayDay** is a real-time emergency calling, community-verified disaster awareness, official government alert, and neighborhood utility outage platform — localized to **Patiala · Thapar Institute (TIET)** (`30.3564, 76.3647`) and adaptable anywhere via live GPS.

It ships in **two separate forms**:
1. **Installable Web PWA** — pure HTML, standard CSS (zero frameworks), vanilla JavaScript, and an optional zero-dependency Python 3 backend.
2. **Standalone Android App (`.apk`) with Native Home Screen Widgets** — an independent Kotlin Android project inside `android/` with pre-filled emergency dialing and live-synced home screen widgets.

**Zero machine learning · Zero social media scraping · Zero fake seed disasters.**

- **Live Web PWA:** https://namanbuildsstuff.github.io/Mayday/
- **Android APK Releases:** https://github.com/NamanBuildsStuff/Mayday/releases

---

## Web PWA Features

### 1. Minimalist Live Map & Location Controls
- **Home Map Peek:** Live Carto dark basemap preview right on the Home screen showing your location pin, live Patiala weather telemetry, and active alerts. Tap anywhere to expand the full interactive disaster map.
- **Full Disaster Map:** Source filter pills (`All`, `Govt`, `Verified`, `Pending`), GPS recenter, and slide-in incident inspector.
- **Location Switching:** One-tap live GPS detection or manual selection across 14 Patiala / TIET sectors.

### 2. Six-Tile Icon-First Emergency Dialer
| Tile | Number / Action | Behavior |
| :--- | :--- | :--- |
| **Fire** | `101` | Initiates call immediately, locks GPS in background, and pings nearby devices to verify. |
| **Collapse** | `112` | Initiates call immediately, locks GPS in background, and pings nearby devices to verify. |
| **Medical** | `108` + Hospitals | Opens a list of **7 real Patiala / Thapar hospitals** sorted by Haversine distance with direct phone numbers, 1-tap Call, and Google Maps directions. **Private by default** (no automatic verification pings), with an opt-in **"Push Alert to Nearby Users"** option. |
| **Police** | `112` / `100` | **State-aware**: automatically selects the right Police helpline across 14 Indian states via GPS or the state selector (`PB`, `CH`, `HR`, `DL`, `HP`, `UP`, `MH`, `RJ`, `GJ`, `KA`, `TN`, `WB`, `KL`, `TS`). |
| **Other** | `112` | Prompts *"What is the emergency?"* (with quick chips like *Gas Leak*, *Road Accident*, *Fallen Tree / Wire*, *Trapped in Lift*) before calling `112` and alerting nearby users. |
| **Contact (ICE)** | Personal | First tap saves a private emergency contact (name + phone) on-device in `localStorage`. Every tap after calls them directly without broadcasting publicly. Includes a top-right pencil button to edit or remove anytime. |

### 3. Neighborhood Utility Outage Checks
- One-tap **Electricity Outage** and **Water Outage** checks ping neighbors to ask if the outage is affecting them (`Yes, Out` / `No, Working`).
- Confirmed outages appear as active alerts and include a **`Resolved?`** button so neighbors can mark power or water as restored across all connected devices.

### 4. Official Government Alerts (Changeable Radius)
- Live official feeds default to a **10 km** scope around your location and can be switched anytime (`5 km`, `10 km`, `25 km`, `100 km`, `500 km`, or `All`).
- Filtering stays synced across Home, Verify, Map, Mini-Map, and Telemetry.

### 5. Deterministic Peer Verification & Citizen Safety Boundaries
- **Zero AI / Zero Scraping:** Only two data sources ever appear on the map — Official Government/Scientific APIs and direct User Reports.
- **Deterministic Verification:** `2` nearby confirmations → **Community Verified**; `3` false-alarm flags → auto-dismissed.
- **Demo Reset Controls:** Individual report delete icons and a **Clear All** button remove test reports across all connected devices in real time.
- **Strict Safety Rules:**
  - **Official Government Alerts (Major Crises):** Strictly **Alert Only** — citizen volunteering is disabled in both UI and backend.
  - **Minor Local User Reports:** Optional minimal safe-distance help (e.g., clearing lanes for fire engines) is gated behind an explicit **"Reminder: You Are Endangering Yourself"** warning modal and required acknowledgment checkbox.

---

## Live Official Data Sources

No placeholder or mock disasters are seeded anywhere in the app:

| Source | Data Provided | Availability |
| :--- | :--- | :--- |
| **USGS Earthquake Hazards API** | Live M2.5+ earthquakes near Patiala / North India | GitHub Pages & Local Server |
| **NASA EONET v3** | Live satellite-tracked wildfires, floods, and severe storms | GitHub Pages & Local Server |
| **Open-Meteo Weather Station** | Live Patiala · Thapar (`30.3564, 76.3647`) weather & severe advisories | GitHub Pages & Local Server |
| **NDMA SACHET (Govt. of India)** | Official India CAP RSS disaster advisories | Local Server (`server.py`) |

---

## Multi-Device Real-Time Sync

MayDay automatically selects the right real-time transport based on how it is hosted:

- **GitHub Pages (Static HTTPS):** Uses Server-Sent Events via `ntfy.sh` so an emergency call, outage check, vote, resolution, or delete syncs across connected phones in `< 300ms`.
  - Append `?room=<name>` to the URL (e.g., `https://namanbuildsstuff.github.io/Mayday/?room=demo`) on all devices to isolate a demo room.
- **Local Backend (`server.py`):** Uses built-in Python SSE (`/api/events`), SQLite persistence (`mayday.db`), and the NDMA SACHET RSS proxy.

---

## Standalone Android App & Home Screen Widgets (`android/`)

The `android/` folder is a **completely separate native Kotlin Android project** (`com.mayday.app`, `minSdk 24`, `targetSdk 34`) that does not modify the web PWA:

- **Native Wrapper + Offline Fallback:** Runs MayDay in a full-screen dark obsidian WebView with native Android **GPS** and **Notification** permissions, native Google Maps opening for hospital directions, and bundled offline fallback assets (`android/app/src/main/assets/www/`).
- **Pre-Filled Dialer (`Intent.ACTION_DIAL`):** All widget and in-app `tel:` calls open the Android dialer pre-filled with the number (pocket-dial safe, zero dangerous `CALL_PHONE` permission needed).
- **Live JS ↔ Android Widget Sync:** A lightweight WebView bridge automatically syncs your saved **Personal Emergency Contact** and **State Police number** from `localStorage` into Android `SharedPreferences` and refreshes your widgets immediately.
- **Two Native Home Screen Widgets:**
  1. **MayDay Quick Dial (`4×2` resizable):** One-tap pre-filled dial tiles for **Fire (`101`)**, **Medical (`108`)**, **State Police (`112`/`100`)**, and your **Saved Emergency Contact** (or `+ Add` to open the Save Contact modal), plus quick **Hospitals** and **Map** buttons.
  2. **MayDay Contact & 112 (`2×1` compact):** Minimal two-button bar for **`112`** and your **Saved Emergency Contact**.

### Building the Android APK
- **Cloud Build (Recommended — GitHub Actions):**
  - Configured via `.github/workflows/build-apk.yml`. Every push to `android/**` (or manual run in the **Actions** tab) compiles `Mayday.apk` using JDK 17 + Gradle 8.7 and publishes it directly to **GitHub Releases** (`android-latest`) and **Actions Artifacts**.
- **Local Build (Android Studio / Gradle):**
  - Open the `android/` directory in Android Studio, or run `gradle assembleDebug` inside `android/` with JDK 17 and the Android SDK installed. Output: `android/app/build/outputs/apk/debug/app-debug.apk`.

---

## Project Structure

```text
Mayday App/
├── .github/workflows/build-apk.yml           # GitHub Actions cloud Android APK build & Release workflow
├── index.html                                # Web PWA shell (Call, Map, Verify views + modals)
├── styles.css                                # Pure standard minimalist dark obsidian CSS
├── app.js                                    # Calling, hospitals, ICE contact, outages, live APIs & SSE sync
├── manifest.webmanifest                      # PWA install manifest (standalone mode)
├── sw.js                                     # Service Worker for offline caching
├── icon.svg                                  # MayDay radar-beacon vector icon
├── server.py                                 # Optional zero-dependency Python 3 backend (SQLite + SSE + NDMA RSS)
└── android/                                  # Standalone native Android APK project (separate from PWA)
    ├── settings.gradle.kts
    ├── build.gradle.kts
    ├── gradle.properties
    ├── github-workflow-build-apk.yml         # Ready-to-use GitHub Actions cloud APK workflow
    └── app/
        ├── build.gradle.kts
        └── src/main/
            ├── AndroidManifest.xml
            ├── assets/www/                   # Bundled offline web assets
            ├── java/com/mayday/app/
            │   ├── MainActivity.kt           # Full-screen WebView, GPS, ACTION_DIAL & widget sync bridge
            │   ├── MaydayPrefs.kt            # SharedPreferences store & widget refresh helpers
            │   ├── QuickDialWidgetProvider.kt   # 4×2 Emergency Quick Dial & Map/Hospital widget
            │   └── CompactSosWidgetProvider.kt  # 2×1 Compact 112 & Personal Contact widget
            └── res/                          # Dark obsidian widget layouts, vector icons & adaptive launcher
```

---

## Running Locally (Web PWA + Backend)

Requires **Python 3** (no `pip install` or Node build tools required):

```bash
python3 server.py
```

Open `http://localhost:8080` in your browser, or open the printed LAN IP (`http://<your-ip>:8080`) on phones connected to the same Wi-Fi network.

---

## Calling Mode & PWA Cache Notes

- **Live Calling vs. Demo Safe Mode (`app.js` line 7):**
  ```js
  const DEMO_SAFE_CALL_MODE = false;
  ```
  - `false` (current): Emergency buttons trigger native `tel:` dialing on the device.
  - `true`: Simulates calls safely during presentations while still running GPS lock, map plotting, and live multi-device pings.
- **Refreshing Installed PWAs:** Whenever you edit `index.html`, `styles.css`, or `app.js`, increment `CACHE_NAME` on line 1 of `sw.js` (currently `mayday-pwa-v11`) so phones pull the latest version on reload.
