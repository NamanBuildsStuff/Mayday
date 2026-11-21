#!/usr/bin/env python3
"""
MayDay PWA — Real-Time Multi-Device Backend & Official Disaster API Aggregator
Zero external dependencies (Python 3 stdlib only: http.server, sqlite3, urllib, queue).

Serves:
  - Static PWA files (index.html, styles.css, app.js, manifest.webmanifest, sw.js, icon.svg)
  - GET   /api/events             -> Real-time Server-Sent Events (SSE) push to all connected devices
  - GET   /api/official-alerts    -> Live official APIs (USGS, NASA EONET, NDMA SACHET, Open-Meteo)
  - GET   /api/reports            -> Real user-reported emergency calls (SQLite)
  - POST  /api/reports            -> Instantly log a call-triggered report & broadcast to all devices
  - PATCH /api/reports/:id        -> Optional caller note update after call is placed
  - POST  /api/reports/:id/verify -> Peer confirmation / false-alarm vote (2 = Verified, 3 = Dismissed)
  - POST  /api/reports/:id/help   -> Register danger-acknowledged minimal help (minor reports only)
"""

import concurrent.futures
import json
import os
import queue
import re
import socket
import sqlite3
import threading
import time
import urllib.parse
import urllib.request
import xml.etree.ElementTree as ET
from email.utils import parsedate_to_datetime
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer

PORT = int(os.environ.get("PORT", "8080"))
BASE_DIR = os.path.dirname(os.path.abspath(__file__))
DB_PATH = os.path.join(BASE_DIR, "mayday.db")

PATIALA_LAT = 30.3564
PATIALA_LNG = 76.3647
VERIFICATION_THRESHOLD = 2
FALSE_DISMISS_THRESHOLD = 3

OFFICIAL_CACHE = {"ts": 0, "payload": None}
CACHE_TTL_SEC = 180

# Thread-safe SSE client queues for instant multi-device notifications
SSE_LOCK = threading.Lock()
SSE_CLIENTS = set()

INDIA_REGION_COORDS = [
    ("patiala", "Patiala, Punjab", 30.3398, 76.3869),
    ("chandigarh", "Chandigarh", 30.7333, 76.7794),
    ("ludhiana", "Ludhiana, Punjab", 30.9010, 75.8573),
    ("amritsar", "Amritsar, Punjab", 31.6340, 74.8723),
    ("jalandhar", "Jalandhar, Punjab", 31.3260, 75.5762),
    ("punjab", "Punjab", 31.1471, 75.3412),
    ("haryana", "Haryana", 29.0588, 76.0856),
    ("himachal", "Himachal Pradesh", 31.1048, 77.1734),
    ("uttarakhand", "Uttarakhand", 30.0668, 79.0193),
    ("delhi", "Delhi NCR", 28.6139, 77.2090),
    ("jammu", "Jammu & Kashmir", 32.7266, 74.8570),
    ("rajasthan", "Rajasthan", 27.0238, 74.2179),
    ("uttar pradesh", "Uttar Pradesh", 26.8467, 80.9462),
    ("gujarat", "Gujarat", 22.2587, 71.1924),
    ("maharashtra", "Maharashtra", 19.7515, 75.7139),
    ("tamil nadu", "Tamil Nadu", 11.1271, 78.6569),
    ("kerala", "Kerala", 10.8505, 76.2711),
    ("odisha", "Odisha", 20.9517, 85.0985),
    ("west bengal", "West Bengal", 22.9868, 87.8550),
    ("assam", "Assam", 26.2006, 92.9376),
    ("bihar", "Bihar", 25.0961, 85.3131),
    ("andhra", "Andhra Pradesh", 15.9129, 79.7400),
    ("karnataka", "Karnataka", 15.3173, 75.7139),
    ("madhya pradesh", "Madhya Pradesh", 22.9734, 78.6569),
]


def broadcast_event(event_type, payload):
    """Push a real-time SSE message to every connected phone/browser."""
    msg = f"event: {event_type}\ndata: {json.dumps(payload)}\n\n".encode("utf-8")
    with SSE_LOCK:
        dead = []
        for q in SSE_CLIENTS:
            try:
                q.put_nowait(msg)
            except queue.Full:
                dead.append(q)
        for q in dead:
            SSE_CLIENTS.discard(q)


def init_db():
    conn = sqlite3.connect(DB_PATH)
    conn.execute(
        """
        CREATE TABLE IF NOT EXISTS user_reports (
            id TEXT PRIMARY KEY,
            category TEXT NOT NULL,
            title TEXT NOT NULL,
            location_name TEXT NOT NULL,
            lat REAL NOT NULL,
            lng REAL NOT NULL,
            description TEXT NOT NULL,
            dialed_number TEXT NOT NULL,
            status TEXT NOT NULL DEFAULT 'pending',
            confirmations INTEGER NOT NULL DEFAULT 0,
            false_flags INTEGER NOT NULL DEFAULT 0,
            minimal_helpers INTEGER NOT NULL DEFAULT 0,
            timestamp_ms INTEGER NOT NULL,
            caller_device_id TEXT NOT NULL DEFAULT ''
        )
        """
    )
    # Safe migration if upgrading from older table without caller_device_id
    cols = [r[1] for r in conn.execute("PRAGMA table_info(user_reports)").fetchall()]
    if "caller_device_id" not in cols:
        conn.execute("ALTER TABLE user_reports ADD COLUMN caller_device_id TEXT NOT NULL DEFAULT ''")
    conn.commit()
    conn.close()


def http_get(url, timeout=8):
    req = urllib.request.Request(
        url,
        headers={
            "User-Agent": "MayDay-Disaster-Alert-PWA/1.0 (+https://localhost)",
            "Accept": "application/json, application/xml, text/xml, */*",
        },
    )
    with urllib.request.urlopen(req, timeout=timeout) as resp:
        return resp.read().decode("utf-8", errors="replace")


def fetch_usgs_earthquakes():
    url = (
        "https://earthquake.usgs.gov/fdsnws/event/1/query"
        f"?format=geojson&latitude={PATIALA_LAT}&longitude={PATIALA_LNG}"
        "&maxradiuskm=1000&minmagnitude=2.5&orderby=time&limit=15"
    )
    raw = http_get(url, timeout=8)
    data = json.loads(raw)
    alerts = []

    for feat in data.get("features", []):
        props = feat.get("properties") or {}
        coords = (feat.get("geometry") or {}).get("coordinates") or []
        if len(coords) < 2:
            continue
        lng, lat = float(coords[0]), float(coords[1])
        mag = props.get("mag")
        mag_str = f"M{mag:.1f}" if isinstance(mag, (int, float)) else "Seismic Event"
        depth = f"{coords[2]:.1f} km depth" if len(coords) >= 3 and coords[2] is not None else "Depth N/A"

        alerts.append(
            {
                "id": f"GOV-USGS-{feat.get('id')}",
                "source": "govt_api",
                "agency": "USGS Earthquake Hazards (Official)",
                "tier": "major",
                "category": "Storm / Quake",
                "title": f"{mag_str} Earthquake",
                "locationName": props.get("place") or "Northern India / Himalayan Region",
                "lat": lat,
                "lng": lng,
                "radiusMeters": int(max(1500, (mag or 3) * 1500)),
                "description": f"Official USGS seismic event: {mag_str} earthquake ({depth}). Reported status: {props.get('status', 'reviewed')}.",
                "officialGuidance": "If shaking is felt: Drop, Cover, and Hold On. Stay away from glass and exterior walls. Dial 112 if structural damage occurs.",
                "sourceUrl": props.get("url") or "https://earthquake.usgs.gov/",
                "status": "official",
                "dialedNumber": "112",
                "timestamp": int(props.get("time") or time.time() * 1000),
            }
        )

    return alerts


def fetch_nasa_eonet():
    url = "https://eonet.gsfc.nasa.gov/api/v3/events?status=open&limit=60"
    raw = http_get(url, timeout=8)
    data = json.loads(raw)
    alerts = []

    for ev in data.get("events", []):
        geoms = ev.get("geometry") or []
        if not geoms:
            continue
        latest = geoms[-1]
        coords = latest.get("coordinates")
        if not isinstance(coords, list) or len(coords) < 2 or isinstance(coords[0], list):
            continue
        lng, lat = float(coords[0]), float(coords[1])
        if not (6.0 <= lat <= 38.0 and 67.0 <= lng <= 98.0):
            continue

        cats = ev.get("categories") or []
        cat_raw = (cats[0].get("title") if cats else "") or ""
        cat_low = cat_raw.lower()
        if "fire" in cat_low:
            category, dial = "Fire", "101"
        elif "flood" in cat_low:
            category, dial = "Flood", "1070"
        else:
            category, dial = "Storm / Quake", "1070"

        ts_ms = int(time.time() * 1000)
        date_str = latest.get("date")
        if date_str:
            try:
                from datetime import datetime
                ts_ms = int(datetime.fromisoformat(date_str.replace("Z", "+00:00")).timestamp() * 1000)
            except Exception:
                pass

        sources = ev.get("sources") or []
        src_url = sources[0].get("url") if sources else ev.get("link") or "https://eonet.gsfc.nasa.gov/"

        alerts.append(
            {
                "id": f"GOV-EONET-{ev.get('id')}",
                "source": "govt_api",
                "agency": f"NASA EONET ({cat_raw or 'Natural Event'})",
                "tier": "major",
                "category": category,
                "title": ev.get("title") or "Active Natural Hazard",
                "locationName": f"{lat:.2f}°N, {lng:.2f}°E (India Region)",
                "lat": lat,
                "lng": lng,
                "radiusMeters": 4000,
                "description": f"Active official natural event tracked by NASA Earth Observatory ({cat_raw}).",
                "officialGuidance": "Official satellite-tracked natural hazard. Alert & awareness only — follow NDMA / local administration orders.",
                "sourceUrl": src_url,
                "status": "official",
                "dialedNumber": dial,
                "timestamp": ts_ms,
            }
        )

    return alerts


def fetch_ndma_sachet_rss():
    url = "https://sachet.ndma.gov.in/cap_public_website/rss/rss_india.xml"
    xml_text = http_get(url, timeout=8)
    root = ET.fromstring(xml_text)
    alerts = []

    for idx, item in enumerate(root.findall(".//item")[:20]):
        title = (item.findtext("title") or "").strip()
        desc = re.sub(r"<[^>]+>", " ", (item.findtext("description") or "")).strip()
        link = (item.findtext("link") or "https://sachet.ndma.gov.in/").strip()
        pub_raw = (item.findtext("pubDate") or "").strip()

        ts_ms = int(time.time() * 1000)
        if pub_raw:
            try:
                ts_ms = int(parsedate_to_datetime(pub_raw).timestamp() * 1000)
            except Exception:
                pass

        combined = f"{title} {desc}".lower()
        loc_name, lat, lng = "India (NDMA SACHET)", 28.6139, 77.2090
        for key, region_label, rlat, rlng in INDIA_REGION_COORDS:
            if key in combined:
                loc_name, lat, lng = region_label, rlat, rlng
                break

        if any(w in combined for w in ("flood", "rain", "inundat", "river")):
            category, dial = "Flood", "1070"
        elif any(w in combined for w in ("fire", "forest")):
            category, dial = "Fire", "101"
        else:
            category, dial = "Storm / Quake", "1070"

        alerts.append(
            {
                "id": f"GOV-NDMA-{idx}-{abs(hash(title)) % 100000}",
                "source": "govt_api",
                "agency": "NDMA SACHET (Govt. of India)",
                "tier": "major",
                "category": category,
                "title": title or "NDMA Official Advisory",
                "locationName": loc_name,
                "lat": lat,
                "lng": lng,
                "radiusMeters": 3500,
                "description": (desc[:260] + ("..." if len(desc) > 260 else "")) or title,
                "officialGuidance": "Official Government of India NDMA SACHET CAP alert. Strictly Alert Only — follow district administration advisories.",
                "sourceUrl": link,
                "status": "official",
                "dialedNumber": dial,
                "timestamp": ts_ms,
            }
        )

    return alerts


def fetch_patiala_weather():
    url = (
        f"https://api.open-meteo.com/v1/forecast?latitude={PATIALA_LAT}&longitude={PATIALA_LNG}"
        "&current=temperature_2m,precipitation,rain,wind_speed_10m,wind_gusts_10m,weather_code"
    )
    raw = http_get(url, timeout=6)
    data = json.loads(raw)
    cur = data.get("current") or {}

    temp = cur.get("temperature_2m")
    rain = cur.get("rain") or 0
    wind = cur.get("wind_speed_10m") or 0
    gusts = cur.get("wind_gusts_10m") or 0
    code = cur.get("weather_code") or 0

    wmo_labels = {
        0: "Clear sky", 1: "Mainly clear", 2: "Partly cloudy", 3: "Overcast",
        45: "Fog", 48: "Dense fog", 51: "Light drizzle", 53: "Moderate drizzle",
        55: "Dense drizzle", 61: "Slight rain", 63: "Moderate rain", 65: "Heavy rain",
        80: "Rain showers", 81: "Heavy rain showers", 82: "Violent rain showers",
        95: "Thunderstorm", 96: "Thunderstorm with hail", 99: "Severe thunderstorm with hail",
    }
    condition = wmo_labels.get(code, f"Weather code {code}")

    weather_alerts = []
    if code in (65, 82, 95, 96, 99) or rain >= 10.0 or gusts >= 50.0:
        weather_alerts.append(
            {
                "id": f"GOV-WX-PATIALA-{int(time.time() // 3600)}",
                "source": "govt_api",
                "agency": "Open-Meteo Live Telemetry (Patiala)",
                "tier": "major",
                "category": "Flood" if rain >= 10.0 else "Storm / Quake",
                "title": f"Live Severe Weather in Patiala: {condition}",
                "locationName": "Patiala · Thapar (Live Station)",
                "lat": PATIALA_LAT,
                "lng": PATIALA_LNG,
                "radiusMeters": 2200,
                "description": f"Real-time station readings: {condition}, Rain {rain} mm, Wind {wind} km/h (gusts {gusts} km/h), Temp {temp}°C.",
                "officialGuidance": "Seek indoor shelter, avoid low-lying waterlogged roads and overhead power lines. Dial 112 / 1070 if assistance is needed.",
                "sourceUrl": "https://open-meteo.com/",
                "status": "official",
                "dialedNumber": "1070",
                "timestamp": int(time.time() * 1000),
            }
        )

    return {
        "temperatureC": temp,
        "rainMm": rain,
        "windKmh": wind,
        "gustsKmh": gusts,
        "condition": condition,
        "alerts": weather_alerts,
    }


def collect_official_alerts(force_refresh=False):
    now = time.time()
    if not force_refresh and OFFICIAL_CACHE["payload"] and (now - OFFICIAL_CACHE["ts"] < CACHE_TTL_SEC):
        return OFFICIAL_CACHE["payload"]

    sources_status = {}
    all_alerts = []
    patiala_weather = None

    tasks = {
        "usgs": fetch_usgs_earthquakes,
        "nasa_eonet": fetch_nasa_eonet,
        "ndma_sachet": fetch_ndma_sachet_rss,
        "open_meteo": fetch_patiala_weather,
    }

    with concurrent.futures.ThreadPoolExecutor(max_workers=4) as pool:
        future_map = {pool.submit(fn): name for name, fn in tasks.items()}
        for fut in concurrent.futures.as_completed(future_map):
            name = future_map[fut]
            try:
                res = fut.result()
                if name == "open_meteo":
                    patiala_weather = {k: v for k, v in res.items() if k != "alerts"}
                    all_alerts.extend(res["alerts"])
                    sources_status[name] = {"ok": True, "count": len(res["alerts"])}
                else:
                    all_alerts.extend(res)
                    sources_status[name] = {"ok": True, "count": len(res)}
            except Exception as exc:
                sources_status[name] = {"ok": False, "error": str(exc)[:120], "count": 0}

    all_alerts.sort(key=lambda a: a.get("timestamp", 0), reverse=True)

    payload = {
        "syncedAt": int(now * 1000),
        "sources": sources_status,
        "patialaWeather": patiala_weather,
        "alerts": all_alerts,
    }
    OFFICIAL_CACHE["ts"] = now
    OFFICIAL_CACHE["payload"] = payload
    return payload


SELECT_COLS = (
    "id, category, title, location_name, lat, lng, description, dialed_number, "
    "status, confirmations, false_flags, minimal_helpers, timestamp_ms, caller_device_id"
)


def row_to_report(row):
    return {
        "id": row[0],
        "source": "user_report",
        "agency": f"Caller Dialed {row[7]}",
        "tier": "minor",
        "category": row[1],
        "title": row[2],
        "locationName": row[3],
        "lat": row[4],
        "lng": row[5],
        "radiusMeters": 0,
        "description": row[6],
        "officialGuidance": "Stay outside the immediate hazard zone and keep roads clear for emergency authorities.",
        "dialedNumber": row[7],
        "status": row[8],
        "confirmations": row[9],
        "falseFlags": row[10],
        "minimalHelpers": row[11],
        "timestamp": row[12],
        "callerDeviceId": row[13],
    }


def get_lan_ip():
    try:
        s = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
        s.connect(("8.8.8.8", 80))
        ip = s.getsockname()[0]
        s.close()
        return ip
    except Exception:
        return "127.0.0.1"


class MayDayHandler(SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=BASE_DIR, **kwargs)

    def log_message(self, format, *args):
        # Keep console output crisp
        if "/api/" in (args[0] if args else ""):
            super().log_message(format, *args)

    def send_json(self, code, data):
        body = json.dumps(data).encode("utf-8")
        self.send_response(code)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        self.send_header("Cache-Control", "no-store")
        self.end_headers()
        self.wfile.write(body)

    def read_json_body(self):
        length = int(self.headers.get("Content-Length", "0"))
        if length <= 0 or length > 65536:
            return {}
        return json.loads(self.rfile.read(length).decode("utf-8"))

    def handle_sse(self):
        self.send_response(200)
        self.send_header("Content-Type", "text/event-stream")
        self.send_header("Cache-Control", "no-cache")
        self.send_header("Connection", "keep-alive")
        self.send_header("X-Accel-Buffering", "no")
        self.end_headers()

        q = queue.Queue(maxsize=32)
        with SSE_LOCK:
            SSE_CLIENTS.add(q)
            connected_count = len(SSE_CLIENTS)

        try:
            hello = f"event: connected\ndata: {json.dumps({'devices': connected_count})}\n\n".encode("utf-8")
            self.wfile.write(hello)
            self.wfile.flush()
            broadcast_event("devices_count", {"devices": connected_count})

            while True:
                try:
                    msg = q.get(timeout=20)
                    self.wfile.write(msg)
                    self.wfile.flush()
                except queue.Empty:
                    self.wfile.write(b": keepalive\n\n")
                    self.wfile.flush()
        except (BrokenPipeError, ConnectionResetError, OSError):
            pass
        finally:
            with SSE_LOCK:
                SSE_CLIENTS.discard(q)
                remaining = len(SSE_CLIENTS)
            broadcast_event("devices_count", {"devices": remaining})

    def do_GET(self):
        parsed = urllib.parse.urlparse(self.path)

        if parsed.path == "/api/events":
            self.handle_sse()
            return

        if parsed.path == "/api/official-alerts":
            qs = urllib.parse.parse_qs(parsed.query)
            force = qs.get("refresh", ["0"])[0] == "1"
            self.send_json(200, collect_official_alerts(force_refresh=force))
            return

        if parsed.path == "/api/reports":
            conn = sqlite3.connect(DB_PATH)
            rows = conn.execute(f"SELECT {SELECT_COLS} FROM user_reports ORDER BY timestamp_ms DESC").fetchall()
            conn.close()
            with SSE_LOCK:
                devices = len(SSE_CLIENTS)
            self.send_json(200, {"reports": [row_to_report(r) for r in rows], "devices": devices})
            return

        return super().do_GET()

    def do_PATCH(self):
        parsed = urllib.parse.urlparse(self.path)
        m = re.match(r"^/api/reports/([A-Za-z0-9_-]+)$", parsed.path)
        if not m:
            self.send_json(404, {"error": "Unknown endpoint"})
            return

        rep_id = m.group(1)
        body = self.read_json_body()
        desc = str(body.get("description") or "").strip()[:400]
        if not desc:
            self.send_json(400, {"error": "Empty description"})
            return

        conn = sqlite3.connect(DB_PATH)
        cur = conn.execute("UPDATE user_reports SET description = ? WHERE id = ?", (desc, rep_id))
        if cur.rowcount == 0:
            conn.close()
            self.send_json(404, {"error": "Report not found"})
            return
        conn.commit()
        row = conn.execute(f"SELECT {SELECT_COLS} FROM user_reports WHERE id = ?", (rep_id,)).fetchone()
        conn.close()
        rep = row_to_report(row)
        broadcast_event("report_updated", {"report": rep})
        self.send_json(200, {"report": rep})

    def do_POST(self):
        parsed = urllib.parse.urlparse(self.path)

        # POST /api/reports -> Auto-created immediately when caller presses emergency button
        if parsed.path == "/api/reports":
            try:
                body = self.read_json_body()
                category = str(body.get("category") or "General Emergency")[:40]
                location_name = str(body.get("locationName") or "GPS Coordinates")[:100]
                lat = float(body.get("lat", PATIALA_LAT))
                lng = float(body.get("lng", PATIALA_LNG))
                dialed = re.sub(r"[^0-9+]", "", str(body.get("dialedNumber") or "112"))[:16] or "112"
                caller_device_id = str(body.get("callerDeviceId") or "")[:64]
                desc = str(body.get("description") or "").strip()[:400]
                if not desc:
                    desc = f"Automatic alert: A nearby caller pressed {dialed} ({category}) at {location_name}. Nearby users requested to verify."
                title = f"{category} Call ({dialed})"
                rep_id = f"USR-{int(time.time() * 1000) % 1000000}"
                ts_ms = int(time.time() * 1000)

                conn = sqlite3.connect(DB_PATH)
                conn.execute(
                    """
                    INSERT INTO user_reports
                    (id, category, title, location_name, lat, lng, description, dialed_number, status, confirmations, false_flags, minimal_helpers, timestamp_ms, caller_device_id)
                    VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'pending', 0, 0, 0, ?, ?)
                    """,
                    (rep_id, category, title, location_name, lat, lng, desc, dialed, ts_ms, caller_device_id),
                )
                conn.commit()
                row = conn.execute(f"SELECT {SELECT_COLS} FROM user_reports WHERE id = ?", (rep_id,)).fetchone()
                conn.close()

                rep = row_to_report(row)
                broadcast_event("new_report", {"report": rep})
                self.send_json(201, {"report": rep})
            except Exception as exc:
                self.send_json(400, {"error": str(exc)})
            return

        # POST /api/reports/<id>/verify
        m_ver = re.match(r"^/api/reports/([A-Za-z0-9_-]+)/verify$", parsed.path)
        if m_ver:
            rep_id = m_ver.group(1)
            body = self.read_json_body()
            vote = body.get("vote")
            if vote not in ("confirmed", "false"):
                self.send_json(400, {"error": "Invalid vote"})
                return

            conn = sqlite3.connect(DB_PATH)
            row = conn.execute(
                "SELECT confirmations, false_flags, status FROM user_reports WHERE id = ?",
                (rep_id,),
            ).fetchone()
            if not row:
                conn.close()
                self.send_json(404, {"error": "Report not found"})
                return

            conf, flags, status = row
            if vote == "confirmed":
                conf += 1
                just_verified = False
                if conf >= VERIFICATION_THRESHOLD and status != "verified":
                    status = "verified"
                    just_verified = True
                conn.execute(
                    "UPDATE user_reports SET confirmations = ?, status = ? WHERE id = ?",
                    (conf, status, rep_id),
                )
                conn.commit()
                updated = conn.execute(f"SELECT {SELECT_COLS} FROM user_reports WHERE id = ?", (rep_id,)).fetchone()
                conn.close()
                rep = row_to_report(updated)
                broadcast_event("report_verified" if just_verified else "report_updated", {"report": rep})
                self.send_json(200, {"dismissed": False, "report": rep})
            else:
                flags += 1
                if flags >= FALSE_DISMISS_THRESHOLD:
                    conn.execute("DELETE FROM user_reports WHERE id = ?", (rep_id,))
                    conn.commit()
                    conn.close()
                    broadcast_event("report_dismissed", {"id": rep_id})
                    self.send_json(200, {"dismissed": True, "id": rep_id})
                else:
                    conn.execute("UPDATE user_reports SET false_flags = ? WHERE id = ?", (flags, rep_id))
                    conn.commit()
                    updated = conn.execute(f"SELECT {SELECT_COLS} FROM user_reports WHERE id = ?", (rep_id,)).fetchone()
                    conn.close()
                    rep = row_to_report(updated)
                    broadcast_event("report_updated", {"report": rep})
                    self.send_json(200, {"dismissed": False, "report": rep})
            return

        # POST /api/reports/<id>/help
        m_help = re.match(r"^/api/reports/([A-Za-z0-9_-]+)/help$", parsed.path)
        if m_help:
            rep_id = m_help.group(1)
            conn = sqlite3.connect(DB_PATH)
            cur = conn.execute(
                "UPDATE user_reports SET minimal_helpers = minimal_helpers + 1 WHERE id = ?",
                (rep_id,),
            )
            if cur.rowcount == 0:
                conn.close()
                self.send_json(404, {"error": "Report not found"})
                return
            conn.commit()
            updated = conn.execute(f"SELECT {SELECT_COLS} FROM user_reports WHERE id = ?", (rep_id,)).fetchone()
            conn.close()
            rep = row_to_report(updated)
            broadcast_event("report_updated", {"report": rep})
            self.send_json(200, {"report": rep})
            return

        self.send_json(404, {"error": "Unknown endpoint"})


if __name__ == "__main__":
    init_db()
    lan_ip = get_lan_ip()
    server = ThreadingHTTPServer(("0.0.0.0", PORT), MayDayHandler)
    print(f"MayDay PWA Server Running!")
    print(f"  Local:   http://localhost:{PORT}")
    print(f"  Network: http://{lan_ip}:{PORT}  (open on other phones on same Wi-Fi)")
    print("  Real-time SSE push active on /api/events")
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        print("\nShutting down MayDay server.")
        server.server_close()
