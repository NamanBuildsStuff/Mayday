# MayDay

**MayDay** is an installable **Progressive Web App (PWA)** for real-time emergency calling, community-verified local disaster awareness, and official government disaster alerts — focused on **Patiala · Thapar Institute (TIET)**.

Built with **pure HTML, standard CSS, vanilla JavaScript, and Python stdlib** — with **zero machine learning** and **zero social media scraping**.

**Live Demo:** https://namanbuildsstuff.github.io/Mayday/

---

## Core Design Principles

1. **Instant Emergency Calling First:** One-tap emergency dial cards (`112` National Emergency, `101` Fire, `112` Collapse, `108` Ambulance, `1070` Disaster/Flood, `100` Police) initiate the call immediately on press.
2. **Independent Parallel Alerting:** As soon as a call button is pressed, MayDay captures the caller's GPS coordinates in the background and automatically pings nearby devices for verification — **without requiring the caller to fill out any form**.
3. **Deterministic Peer Verification (No ML / No Scraping):** Only two sources ever appear on the disaster map:
   - **Official Government / Scientific APIs**
   - **Direct User-Reported Emergency Calls** — verified deterministically by nearby residents (`2` nearby confirmations → **Community Verified**; `3` false-alarm flags → auto-dismissed).
4. **Strict Citizen Safety Boundaries:**
   - **Major Crises (Official APIs):** Strictly **Alert Only**. Citizen volunteering is disabled in both UI and backend; only official guidance and emergency helplines are shown.
   - **Minor Local Incidents (e.g., localized fire):** Optional minimal safe-distance support (such as clearing access roads for fire tenders) is gated behind a mandatory **"You Are Endangering Yourself"** safety warning and explicit acknowledgment checkbox.

---

## Real Live Data Sources

No mock or placeholder disasters are seeded in the app. All official alerts come directly from live endpoints:

| Source | Data Provided | Availability |
| :--- | :--- | :--- |
| **USGS Earthquake Hazards API** | Live M2.5+ earthquakes within 1,000 km of Patiala | GitHub Pages & Local Server |
| **NASA EONET v3** | Live satellite-tracked wildfires, floods & severe storms (India region) | GitHub Pages & Local Server |
| **Open-Meteo Weather Station** | Real-time Patiala · Thapar (`30.3564, 76.3647`) weather & severe threshold alerts | GitHub Pages & Local Server |
| **NDMA SACHET (Govt. of India)** | Official India CAP RSS disaster advisories | Local Server (`server.py`) |

---

## Multi-Device Live Sync

MayDay automatically adapts its real-time push transport based on where it is hosted:

- **On GitHub Pages (Static HTTPS):** Automatically connects via Server-Sent Events (`ntfy.sh` relay) so pressing an emergency button on **Device 1** pushes a live verification modal, sound alert, and browser notification to **all other connected phones** in `< 300ms`.
  - Pass `?room=<name>` in the URL (e.g., `https://namanbuildsstuff.github.io/Mayday/?room=demo`) on all devices to start a clean isolated demo session.
- **With Local Backend (`server.py`):** Uses built-in Python SSE (`/api/events`), SQLite persistence (`mayday.db`), and the NDMA SACHET RSS proxy.

---

## Project Structure

```text
Mayday App/
├── index.html             # PWA shell (Emergency Call, Disaster Map, Verify & Alerts views + modals)
├── styles.css             # Pure minimalist dark obsidian CSS (zero frameworks)
├── app.js                 # Call flow, GPS lock, peer verification, live APIs & SSE multi-device sync
├── manifest.webmanifest   # PWA install manifest (standalone mode)
├── sw.js                  # Service Worker for offline app-shell caching
├── icon.svg               # MayDay radar-beacon vector icon
└── server.py              # Optional zero-dependency Python 3 backend (SQLite + SSE + NDMA RSS proxy)
```

---

## Running Locally

Requires **Python 3** (no `pip install` or Node build tools needed):

```bash
python3 server.py
```

Open `http://localhost:8080` in your browser, or open the printed LAN IP (`http://<your-ip>:8080`) on devices connected to the same Wi-Fi network.

---

## Demo Safe Mode

To prevent accidentally dialing real emergency authorities (`112`, `101`, `108`, `1070`, `100`) during presentations and judging, **Demo Safe Mode** is enabled by default in `app.js`:

```js
const DEMO_SAFE_CALL_MODE = true;
```

- When `true`: Emergency buttons simulate the call safely while still running real GPS capture, map plotting, and live multi-device verification pings.
- When `false`: Emergency buttons trigger native `tel:` dialing on the device.

*(After making any edits, bump `CACHE_NAME` on line 1 of `sw.js` so installed PWAs refresh their cached files.)*
