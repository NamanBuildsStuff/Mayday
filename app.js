/* ============================================================================
   MayDay PWA — 100% Real Official APIs & User-Verified Call Reports
   Zero Fake Seed Data · Zero Machine Learning · Zero Social Media Scraping
   ============================================================================ */

const PATIALA_CENTER = [30.3564, 76.3647]; // Thapar Institute (TIET), Patiala
const DEMO_SAFE_CALL_MODE = false;          // Prevents placing real 112/101/108/100/1070 calls during demos
const VERIFICATION_THRESHOLD = 2;          // Nearby confirmations needed to verify a user report
const FALSE_DISMISS_THRESHOLD = 3;         // Flags needed to dismiss a false alarm
const LOCAL_VOTES_KEY = 'mayday_user_votes_v2';
const LOCAL_REPORTS_KEY = 'mayday_local_reports_v2';
const LOCAL_LOCATION_KEY = 'mayday_user_loc_v2';

// Real-time multi-device relay channel for static GitHub Pages hosting (override via ?room=myroom)
const NTFY_TOPIC = (() => {
  const room = new URLSearchParams(window.location.search).get('room');
  const clean = room ? room.replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 32) : '';
  return clean ? `mayday-patiala-${clean}` : 'mayday-patiala-tiet-demo-9427';
})();

const PATIALA_SECTORS = [
  { name: 'Thapar Institute (TIET) Main Gate', lat: 30.3564, lng: 76.3647 },
  { name: 'Thapar COS Market / Hostels', lat: 30.3545, lng: 76.3672 },
  { name: 'Bhadson Road / Adarsh Nagar', lat: 30.3522, lng: 76.3578 },
  { name: 'Model Town, Patiala', lat: 30.3435, lng: 76.3735 },
  { name: 'Leela Bhawan Market', lat: 30.3365, lng: 76.3812 },
  { name: 'Rajindra Hospital / GMC Patiala', lat: 30.3292, lng: 76.3822 },
  { name: 'Baradari Gardens / Mall Road', lat: 30.3378, lng: 76.3925 },
  { name: 'Qila Mubarak / Adalat Bazar', lat: 30.3243, lng: 76.4027 },
  { name: 'Tripuri Town / Badi Nadi Bridge', lat: 30.3592, lng: 76.3915 },
  { name: 'Gurdwara Dukhniwaran Sahib Sector', lat: 30.3510, lng: 76.3965 },
  { name: 'Patiala Railway Station', lat: 30.3442, lng: 76.4048 },
  { name: 'Patiala ISBT / Bus Stand', lat: 30.3420, lng: 76.4085 },
  { name: 'Patiala Focal Point Industrial Area', lat: 30.3335, lng: 76.4320 },
  { name: 'Urban Estate Phase 2 / Punjabi Univ', lat: 30.3565, lng: 76.4470 }
];

const CATEGORY_META = {
  Fire: { color: '#fb923c', badge: 'badge--fire', icon: 'ph-fire', dial: '101' },
  Flood: { color: '#38bdf8', badge: 'badge--flood', icon: 'ph-waves', dial: '1070' },
  Collapse: { color: '#c084fc', badge: 'badge--collapse', icon: 'ph-buildings', dial: '112' },
  Medical: { color: '#fb7185', badge: 'badge--medical', icon: 'ph-first-aid', dial: '108' },
  'Storm / Quake': { color: '#f59e0b', badge: 'badge--quake', icon: 'ph-warning-octagon', dial: '1070' },
  'General Emergency': { color: '#ef4444', badge: 'badge--govt', icon: 'ph-siren', dial: '112' },
  Police: { color: '#a1a1aa', badge: 'badge--govt', icon: 'ph-shield', dial: '100' }
};

/* ============================================================================
   1. APPLICATION STATE (ZERO FAKE SEED TRAGEDIES)
   ============================================================================ */
const DEVICE_ID = (() => {
  let id = sessionStorage.getItem('mayday_device_id');
  if (!id) {
    id = 'DEV-' + Math.random().toString(36).slice(2, 10);
    sessionStorage.setItem('mayday_device_id', id);
  }
  return id;
})();

const state = {
  activeView: 'home',          // 'home' | 'map' | 'verify'
  sourceFilter: 'all',         // 'all' | 'govt_api' | 'verified' | 'pending'
  selectedId: null,
  pendingDangerIncidentId: null,
  activeCallNumber: '112',
  lastCalledReportId: null,
  incomingPingReportId: null,
  connectedDevices: 1,
  backendAvailable: false,
  userLocation: {
    name: PATIALA_SECTORS[0].name,
    lat: PATIALA_SECTORS[0].lat,
    lng: PATIALA_SECTORS[0].lng,
    isGPS: false
  },
  officialAlerts: [],          // Live official Govt/Scientific API alerts only
  userReports: [],             // Real call-triggered user reports only
  userVotes: {},               // { reportId: 'confirmed' | 'false' }
  helpingIds: {},              // { reportId: true }
  apiSources: {},
  patialaWeather: null,
  deferredInstallPrompt: null
};

let eventSource = null;

let map = null;
let markerGroup = null;
let zoneGroup = null;
let userPinGroup = null;

function getAllIncidents() {
  return [...state.officialAlerts, ...state.userReports];
}

function loadLocalPrefs() {
  try {
    const savedLoc = JSON.parse(localStorage.getItem(LOCAL_LOCATION_KEY) || 'null');
    if (savedLoc && typeof savedLoc.lat === 'number') state.userLocation = savedLoc;

    const savedVotes = JSON.parse(localStorage.getItem(LOCAL_VOTES_KEY) || 'null');
    if (savedVotes && typeof savedVotes === 'object') {
      state.userVotes = savedVotes.votes || {};
      state.helpingIds = savedVotes.helping || {};
    }
  } catch (err) {
    // Ignore storage parse issues
  }
}

function saveLocalPrefs() {
  try {
    localStorage.setItem(LOCAL_LOCATION_KEY, JSON.stringify(state.userLocation));
    localStorage.setItem(
      LOCAL_VOTES_KEY,
      JSON.stringify({ votes: state.userVotes, helping: state.helpingIds })
    );
    if (!state.backendAvailable) {
      localStorage.setItem(LOCAL_REPORTS_KEY, JSON.stringify(state.userReports));
    }
  } catch (err) {
    // Ignore storage quota issues
  }
}

/* ============================================================================
   2. HELPERS (XSS ESCAPE, HAVERSINE DISTANCE, TIME)
   ============================================================================ */
function escapeHtml(str) {
  return String(str || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function calcDistanceKm(lat1, lng1, lat2, lng2) {
  const toRad = d => (d * Math.PI) / 180;
  const R = 6371;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) *
    Math.sin(dLng / 2) * Math.sin(dLng / 2);
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function formatDistance(km) {
  return km < 1 ? `${Math.round(km * 1000)} m` : `${km.toFixed(1)} km`;
}

function formatTimeAgo(ts) {
  const sec = Math.max(0, Math.floor((Date.now() - ts) / 1000));
  if (sec < 60) return `${sec}s ago`;
  const min = Math.floor(sec / 60);
  if (min < 60) return `${min}m ago`;
  const hrs = Math.floor(min / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}

function getSourceBadge(inc) {
  if (inc.source === 'govt_api') {
    return `<span class="badge badge--govt"><i class="ph-bold ph-seal-warning"></i> Official API</span>`;
  }
  if (inc.status === 'verified') {
    return `<span class="badge badge--verified"><i class="ph-bold ph-check-circle"></i> Verified Report</span>`;
  }
  return `<span class="badge badge--pending"><i class="ph-bold ph-clock"></i> Pending Verify (${inc.confirmations}/${VERIFICATION_THRESHOLD})</span>`;
}

function getCategoryBadge(cat) {
  const meta = CATEGORY_META[cat] || CATEGORY_META['General Emergency'];
  return `<span class="badge ${meta.badge}">${escapeHtml(cat)}</span>`;
}

/* ============================================================================
   3. REAL LIVE OFFICIAL APIs (BACKEND AGGREGATOR + DIRECT BROWSER FALLBACK)
   ============================================================================ */
async function loadUserReports() {
  if (location.protocol !== 'file:') {
    try {
      const res = await fetch('/api/reports', { cache: 'no-store' });
      if (res.ok) {
        const data = await res.json();
        state.backendAvailable = true;
        state.userReports = data.reports || [];
        return;
      }
    } catch (err) {
      // Backend not running; fall back to localStorage below
    }
  }

  state.backendAvailable = false;
  try {
    const saved = JSON.parse(localStorage.getItem(LOCAL_REPORTS_KEY) || '[]');
    state.userReports = Array.isArray(saved) ? saved : [];
  } catch (err) {
    state.userReports = [];
  }
}

async function fetchDirectBrowserAPIs() {
  const alerts = [];
  const sources = {};
  let patialaWeather = null;

  // 1. Live USGS Earthquake API (within 1000km of Patiala, M2.5+)
  try {
    const usgsUrl = `https://earthquake.usgs.gov/fdsnws/event/1/query?format=geojson&latitude=${PATIALA_CENTER[0]}&longitude=${PATIALA_CENTER[1]}&maxradiuskm=1000&minmagnitude=2.5&orderby=time&limit=15`;
    const res = await fetch(usgsUrl);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();
    const list = (data.features || []).map(feat => {
      const [lng, lat, depth] = feat.geometry.coordinates;
      const mag = feat.properties.mag;
      const magStr = typeof mag === 'number' ? `M${mag.toFixed(1)}` : 'Seismic Event';
      return {
        id: `GOV-USGS-${feat.id}`,
        source: 'govt_api',
        agency: 'USGS Earthquake Hazards (Official)',
        tier: 'major',
        category: 'Storm / Quake',
        title: `${magStr} Earthquake`,
        locationName: feat.properties.place || 'Northern India Region',
        lat,
        lng,
        radiusMeters: Math.max(1500, Math.round((mag || 3) * 1500)),
        description: `Official USGS seismic report (${typeof depth === 'number' ? depth.toFixed(1) + ' km depth' : 'depth N/A'}).`,
        officialGuidance: 'If shaking occurs: Drop, Cover, and Hold On. Stay away from glass and exterior walls. Dial 112 for emergencies.',
        sourceUrl: feat.properties.url || 'https://earthquake.usgs.gov/',
        status: 'official',
        dialedNumber: '112',
        timestamp: feat.properties.time || Date.now()
      };
    });
    alerts.push(...list);
    sources.usgs = { ok: true, count: list.length };
  } catch (err) {
    sources.usgs = { ok: false, count: 0 };
  }

  // 2. Live NASA EONET v3 API (India bounding box)
  try {
    const res = await fetch('https://eonet.gsfc.nasa.gov/api/v3/events?status=open&limit=60');
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();
    let count = 0;
    (data.events || []).forEach(ev => {
      const geoms = ev.geometry || [];
      if (!geoms.length) return;
      const latest = geoms[geoms.length - 1];
      const coords = latest.coordinates;
      if (!Array.isArray(coords) || coords.length < 2 || Array.isArray(coords[0])) return;
      const [lng, lat] = coords;
      if (lat < 6 || lat > 38 || lng < 67 || lng > 98) return;

      const catTitle = ev.categories?.[0]?.title || 'Natural Event';
      const low = catTitle.toLowerCase();
      const category = low.includes('fire') ? 'Fire' : (low.includes('flood') ? 'Flood' : 'Storm / Quake');
      alerts.push({
        id: `GOV-EONET-${ev.id}`,
        source: 'govt_api',
        agency: `NASA EONET (${catTitle})`,
        tier: 'major',
        category,
        title: ev.title,
        locationName: `${lat.toFixed(2)}°N, ${lng.toFixed(2)}°E (India Region)`,
        lat,
        lng,
        radiusMeters: 4000,
        description: `Active official natural event tracked by NASA Earth Observatory (${catTitle}).`,
        officialGuidance: 'Official satellite-tracked natural hazard. Strictly Alert Only — follow local authorities.',
        sourceUrl: ev.sources?.[0]?.url || ev.link || 'https://eonet.gsfc.nasa.gov/',
        status: 'official',
        dialedNumber: category === 'Fire' ? '101' : '1070',
        timestamp: latest.date ? Date.parse(latest.date) : Date.now()
      });
      count++;
    });
    sources.nasa_eonet = { ok: true, count };
  } catch (err) {
    sources.nasa_eonet = { ok: false, count: 0 };
  }

  // 3. Live Open-Meteo Weather Station for Patiala · Thapar
  try {
    const wxUrl = `https://api.open-meteo.com/v1/forecast?latitude=${PATIALA_CENTER[0]}&longitude=${PATIALA_CENTER[1]}&current=temperature_2m,rain,wind_speed_10m,wind_gusts_10m,weather_code`;
    const res = await fetch(wxUrl);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();
    const cur = data.current || {};
    const wmo = {
      0: 'Clear sky', 1: 'Mainly clear', 2: 'Partly cloudy', 3: 'Overcast',
      45: 'Fog', 48: 'Dense fog', 51: 'Light drizzle', 53: 'Moderate drizzle',
      61: 'Slight rain', 63: 'Moderate rain', 65: 'Heavy rain',
      80: 'Rain showers', 81: 'Heavy showers', 82: 'Violent showers',
      95: 'Thunderstorm', 96: 'Thunderstorm + hail', 99: 'Severe thunderstorm'
    };
    const condition = wmo[cur.weather_code] || `Code ${cur.weather_code}`;
    patialaWeather = {
      temperatureC: cur.temperature_2m,
      rainMm: cur.rain || 0,
      windKmh: cur.wind_speed_10m || 0,
      gustsKmh: cur.wind_gusts_10m || 0,
      condition
    };
    let wxAlerts = 0;
    if ([65, 82, 95, 96, 99].includes(cur.weather_code) || (cur.rain || 0) >= 10 || (cur.wind_gusts_10m || 0) >= 50) {
      alerts.push({
        id: `GOV-WX-PATIALA-${Math.floor(Date.now() / 3600000)}`,
        source: 'govt_api',
        agency: 'Open-Meteo Live Station (Patiala)',
        tier: 'major',
        category: (cur.rain || 0) >= 10 ? 'Flood' : 'Storm / Quake',
        title: `Live Severe Weather in Patiala: ${condition}`,
        locationName: 'Patiala · Thapar (Live Station)',
        lat: PATIALA_CENTER[0],
        lng: PATIALA_CENTER[1],
        radiusMeters: 2200,
        description: `Real-time readings: ${condition}, Rain ${cur.rain || 0} mm, Wind ${cur.wind_speed_10m || 0} km/h (gusts ${cur.wind_gusts_10m || 0} km/h).`,
        officialGuidance: 'Stay indoors and avoid flooded roads or overhead wires. Dial 112 / 1070 for help.',
        sourceUrl: 'https://open-meteo.com/',
        status: 'official',
        dialedNumber: '1070',
        timestamp: Date.now()
      });
      wxAlerts = 1;
    }
    sources.open_meteo = { ok: true, count: wxAlerts };
  } catch (err) {
    sources.open_meteo = { ok: false, count: 0 };
  }

  sources.ndma_sachet = { ok: false, note: 'Run server.py for NDMA RSS' };
  alerts.sort((a, b) => (b.timestamp || 0) - (a.timestamp || 0));
  return { syncedAt: Date.now(), sources, patialaWeather, alerts };
}

async function syncOfficialGovtAPIs(forceRefresh = false) {
  const icon = document.getElementById('icon-sync-api');
  if (icon) icon.classList.add('icon-spin');

  try {
    let payload = null;

    if (location.protocol !== 'file:') {
      try {
        const res = await fetch(`/api/official-alerts?refresh=${forceRefresh ? '1' : '0'}`, { cache: 'no-store' });
        if (res.ok) {
          payload = await res.json();
          state.backendAvailable = true;
        }
      } catch (err) {
        // Fall through to direct browser API fetches
      }
    }

    if (!payload) {
      payload = await fetchDirectBrowserAPIs();
    }

    state.officialAlerts = payload.alerts || [];
    state.apiSources = payload.sources || {};
    state.patialaWeather = payload.patialaWeather || null;

    const syncedTime = new Date(payload.syncedAt || Date.now()).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    document.getElementById('govt-sync-label').textContent = `Synced ${syncedTime}`;

    updateWeatherAndSourceStatus();
    refreshAll();

    if (forceRefresh) {
      showToast(`Live official APIs synced (${state.officialAlerts.length} real regional alert${state.officialAlerts.length === 1 ? '' : 's'}).`, 'success');
    }
  } catch (err) {
    document.getElementById('govt-sync-label').textContent = 'Offline — No network';
    if (forceRefresh) {
      showToast('Could not reach live official APIs. Check internet connection.', 'warning');
    }
  } finally {
    if (icon) icon.classList.remove('icon-spin');
  }
}

function updateWeatherAndSourceStatus() {
  const wxEl = document.getElementById('patiala-weather-pill');
  if (wxEl) {
    if (state.patialaWeather) {
      const w = state.patialaWeather;
      wxEl.textContent = `Patiala · Thapar live station: ${w.temperatureC}°C · ${w.condition} · Wind ${w.windKmh} km/h · Rain ${w.rainMm} mm`;
    } else {
      wxEl.textContent = 'Patiala · Thapar live station: offline';
    }
  }

  const srcEl = document.getElementById('api-sources-status');
  if (srcEl) {
    const labels = {
      usgs: 'USGS Quakes',
      nasa_eonet: 'NASA EONET',
      ndma_sachet: 'NDMA SACHET',
      open_meteo: 'Open-Meteo'
    };
    const parts = Object.entries(labels).map(([key, label]) => {
      const s = state.apiSources[key];
      if (!s) return `${label}: —`;
      if (s.ok) return `<span style="color: var(--success);">●</span> ${label} (${s.count})`;
      return `<span style="color: var(--text-muted);">○</span> ${label}${s.note ? ' (server.py)' : ' (offline)'}`;
    });
    srcEl.innerHTML = parts.join(' &nbsp; ');
  }
}

/* ============================================================================
   4. NAVIGATION, TOPBAR DROPDOWN & LOCATION
   ============================================================================ */
function switchView(view) {
  state.activeView = view;

  ['home', 'map', 'verify'].forEach(v => {
    document.getElementById(`view-${v}`).classList.toggle('is-hidden', v !== view);
    document.getElementById(`dnav-${v}`)?.classList.toggle('is-active', v === view);
    document.getElementById(`mnav-${v}`)?.classList.toggle('is-active', v === view);
  });

  closeStatsDropdown();

  if (view === 'map') {
    if (!map) initMap();
    setTimeout(() => {
      if (map) {
        map.invalidateSize();
        renderMap();
      }
    }, 60);
  }
}

function toggleStatsDropdown() {
  const btn = document.getElementById('btn-stats-dropdown');
  const panel = document.getElementById('stats-dropdown-panel');
  const willOpen = panel.classList.contains('is-hidden');

  panel.classList.toggle('is-hidden', !willOpen);
  btn.classList.toggle('is-open', willOpen);
  btn.setAttribute('aria-expanded', willOpen ? 'true' : 'false');
}

function closeStatsDropdown() {
  const btn = document.getElementById('btn-stats-dropdown');
  const panel = document.getElementById('stats-dropdown-panel');
  if (panel) panel.classList.add('is-hidden');
  if (btn) {
    btn.classList.remove('is-open');
    btn.setAttribute('aria-expanded', 'false');
  }
}

function populateSectorSelects() {
  const sel = document.getElementById('home-sector-select');
  if (!sel) return;
  sel.innerHTML = '';

  if (state.userLocation.isGPS) {
    const gpsOpt = document.createElement('option');
    gpsOpt.value = 'gps';
    gpsOpt.textContent = `Live GPS (${state.userLocation.lat.toFixed(3)}, ${state.userLocation.lng.toFixed(3)})`;
    gpsOpt.selected = true;
    sel.appendChild(gpsOpt);
  }

  PATIALA_SECTORS.forEach((sec, idx) => {
    const opt = document.createElement('option');
    opt.value = String(idx);
    opt.textContent = sec.name;
    if (!state.userLocation.isGPS && state.userLocation.name === sec.name) {
      opt.selected = true;
    }
    sel.appendChild(opt);
  });
}

function setUserSectorByIndex(val) {
  if (val === 'gps') return;
  const sec = PATIALA_SECTORS[Number(val)];
  if (!sec) return;
  state.userLocation = { name: sec.name, lat: sec.lat, lng: sec.lng, isGPS: false };
  populateSectorSelects();
  saveLocalPrefs();
  refreshAll();
  showToast(`Area set to ${sec.name}. Nearby reports updated.`, 'info');
}

function detectUserGPS() {
  if (!navigator.geolocation) {
    showToast('GPS is unavailable in this browser. Pick your Patiala sector instead.', 'warning');
    return;
  }
  showToast('Detecting your GPS coordinates...', 'info');
  navigator.geolocation.getCurrentPosition(
    (pos) => {
      state.userLocation = {
        name: 'Live GPS Location',
        lat: pos.coords.latitude,
        lng: pos.coords.longitude,
        isGPS: true
      };
      populateSectorSelects();
      saveLocalPrefs();
      refreshAll();
      if (map) map.flyTo([state.userLocation.lat, state.userLocation.lng], 14, { duration: 0.7 });
      showToast('GPS synced. Verification alerts sorted by your location.', 'success');
    },
    () => {
      showToast('Location permission denied. Using selected Patiala sector.', 'warning');
    },
    { enableHighAccuracy: true, timeout: 6000 }
  );
}

/* ============================================================================
   5. INSTANT CALL + AUTOMATIC GPS CAPTURE + INDEPENDENT BACKGROUND PING
   ============================================================================ */
function resolveNearestLabel(lat, lng) {
  let closest = null;
  let minKm = Infinity;
  PATIALA_SECTORS.forEach(sec => {
    const d = calcDistanceKm(lat, lng, sec.lat, sec.lng);
    if (d < minKm) {
      minKm = d;
      closest = sec;
    }
  });
  if (closest && minKm <= 3.0) {
    return `Near ${closest.name} (GPS)`;
  }
  return `GPS ${lat.toFixed(4)}°N, ${lng.toFixed(4)}°E`;
}

function captureFreshGPS(timeoutMs = 3500) {
  return new Promise((resolve) => {
    if (!navigator.geolocation) {
      resolve({ ...state.userLocation, freshGPS: false });
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const lat = pos.coords.latitude;
        const lng = pos.coords.longitude;
        const name = resolveNearestLabel(lat, lng);
        state.userLocation = { name, lat, lng, isGPS: true };
        populateSectorSelects();
        saveLocalPrefs();
        resolve({ name, lat, lng, freshGPS: true });
      },
      () => {
        resolve({ ...state.userLocation, freshGPS: false });
      },
      { enableHighAccuracy: true, timeout: timeoutMs, maximumAge: 15000 }
    );
  });
}

async function triggerEmergencyCall(phoneNumber, category) {
  state.activeCallNumber = phoneNumber;

  // 1. Place the call IMMEDIATELY on button press (demo-safe when DEMO_SAFE_CALL_MODE is true)
  if (!DEMO_SAFE_CALL_MODE) {
    const telLink = document.createElement('a');
    telLink.href = `tel:${phoneNumber}`;
    telLink.style.display = 'none';
    document.body.appendChild(telLink);
    telLink.click();
    telLink.remove();
  }

  // Show non-blocking call status strip right away — caller does NOT need to fill any form!
  const strip = document.getElementById('active-call-strip');
  const titleEl = document.getElementById('active-call-title');
  const subEl = document.getElementById('active-call-sub');
  strip.classList.remove('is-hidden');
  titleEl.textContent = DEMO_SAFE_CALL_MODE
    ? `Call Placed to ${phoneNumber} (${category}) · Demo Safe Mode`
    : `Calling ${phoneNumber} (${category})...`;
  subEl.textContent = 'Locking GPS location & pinging nearby devices automatically...';

  // 2. Completely independent parallel flow: grab GPS & auto-broadcast verification ping
  const loc = await captureFreshGPS(3500);

  const payload = {
    category,
    locationName: loc.name,
    lat: loc.lat,
    lng: loc.lng,
    description: `Automatic alert: Caller dialed ${phoneNumber} (${category}) at ${loc.name}. Nearby residents requested to verify.`,
    dialedNumber: phoneNumber,
    callerDeviceId: DEVICE_ID
  };

  let created = null;
  if (state.backendAvailable) {
    try {
      const res = await fetch('/api/reports', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      if (res.ok) {
        const data = await res.json();
        created = data.report;
      }
    } catch (err) {
      state.backendAvailable = false;
    }
  }

  if (!created) {
    created = {
      id: 'USR-' + Math.floor(1000 + Math.random() * 8999),
      source: 'user_report',
      agency: `Caller Dialed ${phoneNumber}`,
      tier: 'minor',
      category,
      title: `${category} Call (${phoneNumber})`,
      locationName: loc.name,
      lat: loc.lat,
      lng: loc.lng,
      radiusMeters: 0,
      description: payload.description,
      officialGuidance: 'Stay outside the immediate hazard zone and keep roads clear for emergency authorities.',
      status: 'pending',
      confirmations: 0,
      falseFlags: 0,
      minimalHelpers: 0,
      dialedNumber: phoneNumber,
      callerDeviceId: DEVICE_ID,
      timestamp: Date.now()
    };
  }

  state.lastCalledReportId = created.id;
  upsertUserReport(created);
  state.selectedId = created.id;
  saveLocalPrefs();
  refreshAll();

  // When hosted statically on GitHub Pages, broadcast live via ntfy.sh relay to all devices
  if (!state.backendAvailable) {
    publishRelayEvent({ type: 'new_report', report: created });
  }

  const gpsTag = loc.freshGPS ? 'Live GPS locked' : 'Sector fallback used (enable GPS on phone)';
  subEl.textContent = `${gpsTag}: ${loc.name} · Nearby devices pinged for verification.`;
  showToast(`Emergency ping broadcast to nearby devices (${loc.name}).`, 'warning');
}

function dismissActiveCallStrip() {
  document.getElementById('active-call-strip')?.classList.add('is-hidden');
}

function openOptionalNoteModal() {
  if (!state.lastCalledReportId) return;
  const rep = state.userReports.find(r => r.id === state.lastCalledReportId);
  if (!rep) return;

  document.getElementById('call-modal-service').textContent = `Active Report (${rep.category}) — Already Pinged`;
  document.getElementById('call-modal-tel-link').textContent = DEMO_SAFE_CALL_MODE
    ? `Demo · ${rep.dialedNumber}`
    : `Dialed ${rep.dialedNumber}`;
  document.getElementById('report-notes-input').value = '';
  document.getElementById('call-report-modal').classList.remove('is-hidden');
}

async function saveOptionalCallNote() {
  const note = document.getElementById('report-notes-input').value.trim();
  const id = state.lastCalledReportId;
  if (!note || !id) {
    closeModal('call-report-modal');
    return;
  }

  if (state.backendAvailable) {
    try {
      const res = await fetch(`/api/reports/${encodeURIComponent(id)}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ description: note })
      });
      if (res.ok) {
        const data = await res.json();
        if (data.report) upsertUserReport(data.report);
      }
    } catch (err) {
      const rep = state.userReports.find(r => r.id === id);
      if (rep) rep.description = note;
    }
  } else {
    const rep = state.userReports.find(r => r.id === id);
    if (rep) rep.description = note;
    publishRelayEvent({ type: 'update_note', id, description: note });
  }

  saveLocalPrefs();
  closeModal('call-report-modal');
  refreshAll();
  showToast('Optional note added and synced to nearby devices.', 'success');
}

function handleOfficialHelplineClick(phoneNumber, category) {
  if (DEMO_SAFE_CALL_MODE) {
    showToast(`Demo mode: Real call to ${phoneNumber} (${category}) is disabled for safety.`, 'info');
    return;
  }
  triggerEmergencyCall(phoneNumber, category);
}

/* ============================================================================
   5B. REAL-TIME MULTI-DEVICE SSE STREAM & INCOMING VERIFICATION NOTIFICATIONS
   ============================================================================ */
function upsertUserReport(report) {
  const idx = state.userReports.findIndex(r => r.id === report.id);
  if (idx === -1) {
    state.userReports.unshift(report);
  } else {
    state.userReports[idx] = report;
  }
}

function playAlertTone(kind = 'ping') {
  try {
    const AudioCtx = window.AudioContext || window.webkitAudioContext;
    if (!AudioCtx) return;
    const ctx = new AudioCtx();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'sine';
    osc.frequency.value = kind === 'verified' ? 660 : 880;
    gain.gain.setValueAtTime(0.08, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 0.35);
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start();
    osc.stop(ctx.currentTime + 0.36);
  } catch (err) {
    // Ignore autoplay restrictions before first tap
  }
}

function enableBrowserNotifications() {
  playAlertTone('verified'); // Unlocks mobile audio on user tap
  if (!('Notification' in window)) {
    showToast('Live in-app alert popups are active on this device.', 'info');
    return;
  }
  if (Notification.permission === 'granted') {
    showToast('Live OS notifications are already enabled on this device.', 'success');
    updateNotifButtonUI();
    return;
  }
  Notification.requestPermission().then((perm) => {
    updateNotifButtonUI();
    showToast(
      perm === 'granted'
        ? 'Notifications enabled! This device will alert immediately when another device calls.'
        : 'Browser notifications blocked — in-app live popups will still work.',
      perm === 'granted' ? 'success' : 'warning'
    );
  });
}

function updateNotifButtonUI() {
  const btn = document.getElementById('btn-notif-toggle');
  const icon = document.getElementById('icon-notif');
  const label = document.getElementById('label-notif');
  if (!btn || !('Notification' in window)) return;
  if (Notification.permission === 'granted') {
    btn.classList.add('btn--success-outline');
    if (icon) icon.className = 'ph-fill ph-bell-ringing';
    if (label) label.textContent = 'Alerts On';
  }
}

function sendBrowserNotification(title, body) {
  if ('Notification' in window && Notification.permission === 'granted') {
    try {
      new Notification(title, { body, icon: './icon.svg', tag: 'mayday-live-ping' });
    } catch (err) {
      // Fallback to in-app modal
    }
  }
}

function showIncomingPingModal(report) {
  state.incomingPingReportId = report.id;
  const distKm = calcDistanceKm(state.userLocation.lat, state.userLocation.lng, report.lat, report.lng);

  document.getElementById('ping-badges').innerHTML = `${getSourceBadge(report)} ${getCategoryBadge(report.category)}`;
  document.getElementById('ping-location').textContent = report.locationName;
  document.getElementById('ping-meta').textContent = `${formatDistance(distKm)} away · Caller dialed ${report.dialedNumber} · just now`;
  document.getElementById('ping-desc').textContent = report.description;

  const alreadyVoted = Boolean(state.userVotes[report.id]);
  document.getElementById('btn-ping-confirm').disabled = alreadyVoted;
  document.getElementById('btn-ping-false').disabled = alreadyVoted;

  document.getElementById('incoming-ping-modal').classList.remove('is-hidden');
}

async function respondToIncomingPing(vote) {
  const id = state.incomingPingReportId;
  closeModal('incoming-ping-modal');
  if (id) await verifyUserReport(id, vote);
}

function viewIncomingPingOnMap() {
  const id = state.incomingPingReportId;
  closeModal('incoming-ping-modal');
  if (id) selectIncident(id, true);
}

const seenPeers = new Set([DEVICE_ID]);

async function publishRelayEvent(evt) {
  try {
    await fetch(`https://ntfy.sh/${NTFY_TOPIC}`, {
      method: 'POST',
      body: JSON.stringify(evt)
    });
  } catch (err) {
    // Offline or relay temporarily unreachable
  }
}

function applyRelayEvent(evt, isLive) {
  if (!evt || !evt.type) return;

  if (evt.type === 'presence' && evt.deviceId) {
    seenPeers.add(evt.deviceId);
    state.connectedDevices = seenPeers.size;
    renderListsAndStats();
    return;
  }

  if (evt.type === 'new_report' && evt.report) {
    const rep = evt.report;
    const alreadyExists = state.userReports.some(r => r.id === rep.id);
    if (!alreadyExists) {
      upsertUserReport(rep);
      saveLocalPrefs();
      refreshAll();
    }

    if (isLive && rep.callerDeviceId !== DEVICE_ID) {
      playAlertTone('ping');
      const distKm = calcDistanceKm(state.userLocation.lat, state.userLocation.lng, rep.lat, rep.lng);
      sendBrowserNotification(
        `MayDay Verification: ${rep.category} (${rep.dialedNumber})`,
        `${formatDistance(distKm)} away at ${rep.locationName}. Tap to verify.`
      );
      showIncomingPingModal(rep);
      showToast(`Live nearby call (${rep.category}) at ${rep.locationName} — verification requested!`, 'warning');
    }
    return;
  }

  if (evt.type === 'verify_vote' && evt.id && evt.voterDeviceId) {
    const idx = state.userReports.findIndex(r => r.id === evt.id);
    if (idx === -1) return;
    const rep = state.userReports[idx];
    rep._voters = rep._voters || {};
    if (rep._voters[evt.voterDeviceId]) return; // Deduplicate replayed votes
    rep._voters[evt.voterDeviceId] = evt.vote;

    if (evt.vote === 'confirmed') {
      const wasVerified = rep.status === 'verified';
      rep.confirmations = (rep.confirmations || 0) + 1;
      if (rep.confirmations >= VERIFICATION_THRESHOLD) {
        rep.status = 'verified';
      }
      saveLocalPrefs();
      refreshAll();

      if (isLive && !wasVerified && rep.status === 'verified') {
        playAlertTone('verified');
        sendBrowserNotification(
          `MayDay Verified Alert: ${rep.category}`,
          `Community verified at ${rep.locationName}. Stay alert and avoid the area.`
        );
        showToast(`Community Verified: ${rep.title} at ${rep.locationName}!`, 'success');
      }
    } else if (evt.vote === 'false') {
      rep.falseFlags = (rep.falseFlags || 0) + 1;
      if (rep.falseFlags >= FALSE_DISMISS_THRESHOLD) {
        state.userReports.splice(idx, 1);
        if (state.selectedId === evt.id) state.selectedId = null;
        if (state.incomingPingReportId === evt.id) closeModal('incoming-ping-modal');
      }
      saveLocalPrefs();
      refreshAll();
    }
    return;
  }

  if (evt.type === 'update_note' && evt.id && evt.description) {
    const rep = state.userReports.find(r => r.id === evt.id);
    if (rep) {
      rep.description = evt.description;
      saveLocalPrefs();
      refreshAll();
    }
    return;
  }

  if (evt.type === 'minimal_help' && evt.id && evt.helperDeviceId) {
    const rep = state.userReports.find(r => r.id === evt.id);
    if (!rep) return;
    rep._helpers = rep._helpers || {};
    if (rep._helpers[evt.helperDeviceId]) return;
    rep._helpers[evt.helperDeviceId] = true;
    rep.minimalHelpers = (rep.minimalHelpers || 0) + 1;
    saveLocalPrefs();
    refreshAll();
  }
}

function connectNtfyRelay() {
  if (typeof EventSource === 'undefined') return;
  if (eventSource) eventSource.close();

  // Replays last 2 hours so late-joining phones see recent calls & votes automatically
  eventSource = new EventSource(`https://ntfy.sh/${NTFY_TOPIC}/sse?since=2h`);

  eventSource.addEventListener('open', () => {
    publishRelayEvent({ type: 'presence', deviceId: DEVICE_ID });
  });

  eventSource.addEventListener('message', (e) => {
    try {
      const envelope = JSON.parse(e.data || '{}');
      if (envelope.event !== 'message' || !envelope.message) return;
      const evt = JSON.parse(envelope.message);
      const ageMs = Date.now() - ((envelope.time || 0) * 1000);
      const isLive = ageMs <= 25000;
      applyRelayEvent(evt, isLive);
    } catch (err) {
      // Ignore malformed messages
    }
  });
}

function connectLiveEventStream() {
  if (typeof EventSource === 'undefined') return;

  // Use local server.py SSE when available; otherwise automatically use GitHub Pages ntfy.sh relay!
  if (!state.backendAvailable) {
    connectNtfyRelay();
    return;
  }

  if (eventSource) eventSource.close();
  eventSource = new EventSource('/api/events');

  eventSource.addEventListener('connected', (e) => {
    const data = JSON.parse(e.data || '{}');
    state.backendAvailable = true;
    if (data.devices) {
      state.connectedDevices = data.devices;
      renderListsAndStats();
    }
  });

  eventSource.addEventListener('devices_count', (e) => {
    const data = JSON.parse(e.data || '{}');
    if (data.devices) {
      state.connectedDevices = data.devices;
      renderListsAndStats();
    }
  });

  eventSource.addEventListener('new_report', (e) => {
    const { report } = JSON.parse(e.data || '{}');
    if (!report) return;
    upsertUserReport(report);
    refreshAll();

    if (report.callerDeviceId !== DEVICE_ID) {
      playAlertTone('ping');
      const distKm = calcDistanceKm(state.userLocation.lat, state.userLocation.lng, report.lat, report.lng);
      sendBrowserNotification(
        `MayDay Verification: ${report.category} (${report.dialedNumber})`,
        `${formatDistance(distKm)} away at ${report.locationName}. Tap to verify.`
      );
      showIncomingPingModal(report);
      showToast(`Live nearby call (${report.category}) at ${report.locationName} — verification requested!`, 'warning');
    }
  });

  eventSource.addEventListener('report_verified', (e) => {
    const { report } = JSON.parse(e.data || '{}');
    if (!report) return;
    upsertUserReport(report);
    refreshAll();
    playAlertTone('verified');
    sendBrowserNotification(
      `MayDay Verified Alert: ${report.category}`,
      `Community verified at ${report.locationName}. Stay alert and avoid the area.`
    );
    showToast(`Community Verified: ${report.title} at ${report.locationName}!`, 'success');
  });

  eventSource.addEventListener('report_updated', (e) => {
    const { report } = JSON.parse(e.data || '{}');
    if (!report) return;
    upsertUserReport(report);
    refreshAll();
  });

  eventSource.addEventListener('report_dismissed', (e) => {
    const { id } = JSON.parse(e.data || '{}');
    state.userReports = state.userReports.filter(r => r.id !== id);
    if (state.selectedId === id) state.selectedId = null;
    if (state.incomingPingReportId === id) closeModal('incoming-ping-modal');
    refreshAll();
  });
}

/* ============================================================================
   6. DETERMINISTIC PEER VERIFICATION (ZERO ML)
   ============================================================================ */
async function verifyUserReport(id, voteType) {
  const idx = state.userReports.findIndex(i => i.id === id);
  if (idx === -1) return;

  if (state.userVotes[id]) {
    showToast('You already submitted verification feedback for this report.', 'info');
    return;
  }

  state.userVotes[id] = voteType;

  if (state.backendAvailable) {
    try {
      const res = await fetch(`/api/reports/${encodeURIComponent(id)}/verify`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ vote: voteType })
      });
      if (res.ok) {
        const data = await res.json();
        if (data.dismissed) {
          state.userReports.splice(idx, 1);
          if (state.selectedId === id) state.selectedId = null;
          showToast(`Report dismissed after ${FALSE_DISMISS_THRESHOLD} false-alarm flags.`, 'info');
        } else if (data.report) {
          state.userReports[idx] = data.report;
          showToast(
            data.report.status === 'verified'
              ? `Confirmed! "${data.report.title}" is now Community Verified.`
              : `Verification recorded (${data.report.confirmations}/${VERIFICATION_THRESHOLD}).`,
            data.report.status === 'verified' ? 'success' : 'info'
          );
        }
        saveLocalPrefs();
        refreshAll();
        return;
      }
    } catch (err) {
      state.backendAvailable = false;
    }
  }

  // GitHub Pages / static mode: apply locally AND broadcast vote to all devices via ntfy.sh relay
  const inc = state.userReports[idx];
  inc._voters = inc._voters || {};
  inc._voters[DEVICE_ID] = voteType;

  if (voteType === 'confirmed') {
    inc.confirmations += 1;
    if (inc.confirmations >= VERIFICATION_THRESHOLD) {
      inc.status = 'verified';
      showToast(`Confirmed! "${inc.title}" is now Community Verified.`, 'success');
    } else {
      showToast(`Confirmation recorded (${inc.confirmations}/${VERIFICATION_THRESHOLD}).`, 'info');
    }
  } else {
    inc.falseFlags += 1;
    if (inc.falseFlags >= FALSE_DISMISS_THRESHOLD) {
      state.userReports.splice(idx, 1);
      if (state.selectedId === id) state.selectedId = null;
      showToast(`Report dismissed after ${FALSE_DISMISS_THRESHOLD} false-alarm flags.`, 'info');
    } else {
      showToast(`Flagged as false alarm (${inc.falseFlags}/${FALSE_DISMISS_THRESHOLD}).`, 'warning');
    }
  }

  publishRelayEvent({ type: 'verify_vote', id, vote: voteType, voterDeviceId: DEVICE_ID });
  saveLocalPrefs();
  refreshAll();
}

/* ============================================================================
   7. DANGER-GATED MINIMAL HELP (MINOR USER REPORTS ONLY; BLOCKED FOR GOVT APIs)
   ============================================================================ */
function openDangerWarningModal(incidentId) {
  const inc = getAllIncidents().find(i => i.id === incidentId);
  if (!inc) return;

  if (inc.source === 'govt_api' || inc.tier === 'major') {
    showToast('Volunteering is strictly disabled for Official Government API alerts. Alert & safety only.', 'danger');
    return;
  }

  state.pendingDangerIncidentId = incidentId;
  document.getElementById('danger-modal-target').textContent = `${inc.category} · ${inc.locationName}`;
  document.getElementById('danger-ack-checkbox').checked = false;
  document.getElementById('btn-danger-proceed').disabled = true;
  document.getElementById('danger-warning-modal').classList.remove('is-hidden');
}

function toggleDangerProceedBtn() {
  document.getElementById('btn-danger-proceed').disabled = !document.getElementById('danger-ack-checkbox').checked;
}

async function confirmMinimalHelp() {
  const idx = state.userReports.findIndex(i => i.id === state.pendingDangerIncidentId);
  if (idx === -1) return;
  const inc = state.userReports[idx];

  if (!state.helpingIds[inc.id]) {
    state.helpingIds[inc.id] = true;
    if (state.backendAvailable) {
      try {
        const res = await fetch(`/api/reports/${encodeURIComponent(inc.id)}/help`, { method: 'POST' });
        if (res.ok) {
          const data = await res.json();
          if (data.report) state.userReports[idx] = data.report;
        }
      } catch (err) {
        inc.minimalHelpers = (inc.minimalHelpers || 0) + 1;
      }
    } else {
      inc._helpers = inc._helpers || {};
      inc._helpers[DEVICE_ID] = true;
      inc.minimalHelpers = (inc.minimalHelpers || 0) + 1;
      publishRelayEvent({ type: 'minimal_help', id: inc.id, helperDeviceId: DEVICE_ID });
    }
  }

  saveLocalPrefs();
  closeModal('danger-warning-modal');
  refreshAll();
  showToast(`Minimal safe-distance help active for ${inc.locationName}. Stay clear of the hazard zone.`, 'warning');
}

/* ============================================================================
   8. MAP RENDERING & INCIDENT INSPECTOR
   ============================================================================ */
function initMap() {
  map = L.map('map', {
    center: PATIALA_CENTER,
    zoom: 12,
    zoomControl: false
  });

  L.control.zoom({ position: 'bottomright' }).addTo(map);

  L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png?key=cb1_5de2_1_819a0e8faff413028929fbe5', {
    attribution: '&copy; OpenStreetMap &copy; CARTO',
    subdomains: 'abcd',
    maxZoom: 19
  }).addTo(map);

  zoneGroup = L.layerGroup().addTo(map);
  markerGroup = L.layerGroup().addTo(map);
  userPinGroup = L.layerGroup().addTo(map);
}

function setSourceFilter(filter) {
  state.sourceFilter = filter;
  document.querySelectorAll('.filter-pill').forEach(btn => {
    btn.classList.toggle('is-active', btn.dataset.source === filter);
  });
  renderMap();
}

function getFilteredMapIncidents() {
  return getAllIncidents().filter(inc => {
    if (state.sourceFilter === 'all') return true;
    if (state.sourceFilter === 'govt_api') return inc.source === 'govt_api';
    if (state.sourceFilter === 'verified') return inc.source === 'user_report' && inc.status === 'verified';
    if (state.sourceFilter === 'pending') return inc.source === 'user_report' && inc.status === 'pending';
    return true;
  });
}

function renderMap() {
  if (!map || !markerGroup || !zoneGroup || !userPinGroup) return;

  zoneGroup.clearLayers();
  markerGroup.clearLayers();
  userPinGroup.clearLayers();

  // Plot User's Current Location
  const userIcon = L.divIcon({
    className: 'custom-user-icon',
    html: `<div class="user-pin"></div>`,
    iconSize: [14, 14],
    iconAnchor: [7, 7]
  });
  L.marker([state.userLocation.lat, state.userLocation.lng], { icon: userIcon, zIndexOffset: 500 })
    .bindTooltip(`<strong>Your Location</strong><br/>${escapeHtml(state.userLocation.name)}`, { direction: 'top', offset: [0, -8] })
    .addTo(userPinGroup);

  getFilteredMapIncidents().forEach(inc => {
    const isGovt = inc.source === 'govt_api';
    const isPending = inc.status === 'pending';
    const isSelected = state.selectedId === inc.id;
    const catColor = (CATEGORY_META[inc.category] || CATEGORY_META['General Emergency']).color;
    const pinColor = isGovt ? '#ef4444' : (isPending ? '#eab308' : catColor);

    if (isGovt && inc.radiusMeters) {
      L.circle([inc.lat, inc.lng], {
        radius: inc.radiusMeters,
        color: '#ef4444',
        weight: 1.5,
        dashArray: '6, 6',
        fillColor: '#ef4444',
        fillOpacity: 0.12
      }).addTo(zoneGroup);
    }

    const pulseHTML = isGovt || !isPending
      ? `<div class="pin-pulse" style="background: ${pinColor};"></div>`
      : '';

    const coreCls = isPending ? 'pin-core pin-core--pending' : 'pin-core';
    const icon = L.divIcon({
      className: 'custom-pin-icon',
      html: `
        <div class="pin-wrap ${isSelected ? 'is-selected' : ''}">
          ${pulseHTML}
          <div class="${coreCls}" style="background: ${pinColor};"></div>
        </div>
      `,
      iconSize: [26, 26],
      iconAnchor: [13, 13]
    });

    const sourceText = isGovt
      ? `${escapeHtml(inc.agency)} · Alert Only`
      : (isPending ? `Pending Verify (${inc.confirmations}/${VERIFICATION_THRESHOLD})` : 'Community Verified');

    L.marker([inc.lat, inc.lng], { icon })
      .on('click', () => selectIncident(inc.id, false))
      .bindTooltip(
        `<strong>${escapeHtml(inc.title)}</strong><br/>${escapeHtml(inc.locationName)}<br/><span style="color:#a1a1aa;">${sourceText}</span>`,
        { direction: 'top', offset: [0, -10] }
      )
      .addTo(markerGroup);
  });
}

function recenterMap() {
  if (map) map.flyTo(PATIALA_CENTER, 12, { duration: 0.7 });
}

function selectIncident(id, openMapTab = false) {
  state.selectedId = id;
  if (openMapTab) switchView('map');
  renderInspector();
  renderMap();

  const inc = getAllIncidents().find(i => i.id === id);
  if (inc && map) {
    const targetZoom = inc.source === 'govt_api' ? 8 : 14;
    map.flyTo([inc.lat, inc.lng], targetZoom, { duration: 0.7 });
  }

  if (window.innerWidth < 900) {
    document.getElementById('map-inspector').classList.add('is-mobile-open');
  }
}

function closeMobileInspector() {
  document.getElementById('map-inspector').classList.remove('is-mobile-open');
}

function renderInspector() {
  const container = document.getElementById('inspector-body');
  const all = getAllIncidents();
  const inc = all.find(i => i.id === state.selectedId) || all[0];

  if (!inc) {
    container.innerHTML = `<div class="empty-state">All clear — no active disasters currently reported. Real official API alerts and user emergency call reports will appear here automatically.</div>`;
    return;
  }

  state.selectedId = inc.id;
  const distKm = calcDistanceKm(state.userLocation.lat, state.userLocation.lng, inc.lat, inc.lng);
  const isGovt = inc.source === 'govt_api';
  const userVote = state.userVotes[inc.id] || null;
  const isHelping = Boolean(state.helpingIds[inc.id]);
  const gmapsUrl = `https://www.google.com/maps/dir/?api=1&origin=${state.userLocation.lat},${state.userLocation.lng}&destination=${inc.lat},${inc.lng}`;

  let verifySectionHTML = '';
  if (!isGovt) {
    const pct = Math.min(100, Math.round((inc.confirmations / VERIFICATION_THRESHOLD) * 100));
    const voteDisabled = userVote ? 'disabled' : '';
    const voteNote = userVote
      ? `<span class="micro-label">You marked: ${userVote === 'confirmed' ? 'Confirmed' : 'False Alarm'}</span>`
      : `<span class="micro-label">Near this area? Help verify</span>`;

    verifySectionHTML = `
      <div class="inspector-block">
        <div class="incident-card-top">
          <span class="micro-label">Peer Verification</span>
          <span class="incident-meta">${inc.confirmations}/${VERIFICATION_THRESHOLD} confirmed</span>
        </div>
        <div class="verify-bar">
          <div class="verify-bar-fill ${inc.status === 'pending' ? 'verify-bar-fill--pending' : ''}" style="width: ${pct}%"></div>
        </div>
        ${voteNote}
        <div class="verify-actions">
          <button type="button" onclick="verifyUserReport('${inc.id}', 'confirmed')" class="btn btn--success-outline" style="flex:1;" ${voteDisabled}>
            <i class="ph-bold ph-check"></i> Confirm
          </button>
          <button type="button" onclick="verifyUserReport('${inc.id}', 'false')" class="btn" style="flex:1;" ${voteDisabled}>
            <i class="ph-bold ph-x"></i> False Alarm
          </button>
        </div>
      </div>
    `;
  }

  let actionBlockHTML = '';
  if (isGovt || inc.tier === 'major') {
    const srcBtn = inc.sourceUrl
      ? `<a href="${escapeHtml(inc.sourceUrl)}" target="_blank" rel="noopener noreferrer" class="btn btn--full"><i class="ph-bold ph-arrow-square-out"></i><span>View Official Source Report</span></a>`
      : '';

    actionBlockHTML = `
      <div class="inspector-block">
        <span class="micro-label">Major Crisis Policy</span>
        <div class="alert-only-note">
          <i class="ph-fill ph-shield-warning" style="font-size: 16px; flex-shrink: 0;"></i>
          <span><strong>Alert Only — Volunteering Disabled.</strong> Official government API disasters require trained SDRF/NDRF authorities. Follow official safety instructions.</span>
        </div>
        ${srcBtn}
        <button type="button" onclick="handleOfficialHelplineClick('${escapeHtml(inc.dialedNumber || '112')}', '${escapeHtml(inc.category)}')" class="btn btn--danger btn--full">
          <i class="ph-bold ph-phone-call"></i>
          <span>Official Helpline (${escapeHtml(inc.dialedNumber || '112')} &middot; Demo Safe)</span>
        </button>
      </div>
    `;
  } else if (isHelping) {
    actionBlockHTML = `
      <div class="inspector-block">
        <span class="micro-label">Minimal Safe-Distance Help Active</span>
        <div class="alert-only-note" style="background-color: var(--warning-soft); border-color: var(--warning-border); color: var(--warning);">
          <i class="ph-bold ph-warning"></i>
          <span><strong>Safety Reminder:</strong> Stay outside the hazard zone. Only clear access lanes or offer safe-distance support (${inc.minimalHelpers || 1} citizen helper${(inc.minimalHelpers || 1) === 1 ? '' : 's'}).</span>
        </div>
        <a href="${gmapsUrl}" target="_blank" rel="noopener noreferrer" class="btn btn--primary btn--full">
          <i class="ph-bold ph-navigation-arrow"></i>
          <span>Directions (Google Maps)</span>
        </a>
      </div>
    `;
  } else {
    actionBlockHTML = `
      <div class="inspector-block">
        <div class="incident-card-top">
          <span class="micro-label">Minor Incident Support</span>
          <span class="incident-meta">${inc.minimalHelpers || 0} helping safely</span>
        </div>
        <p class="incident-desc">
          Minimal safe-distance help (such as keeping roads clear for fire engines) is optional for minor local reports.
        </p>
        <button type="button" onclick="openDangerWarningModal('${inc.id}')" class="btn btn--warning-outline btn--full">
          <i class="ph-bold ph-warning-octagon"></i>
          <span>Offer Minimal Help (Danger Warning)</span>
        </button>
      </div>
    `;
  }

  container.innerHTML = `
    <div class="inspector-block">
      <div class="badge-row">
        ${getSourceBadge(inc)}
        ${getCategoryBadge(inc.category)}
      </div>
      <h3 class="incident-title" style="font-size: 16px;">${escapeHtml(inc.title)}</h3>
      <div class="incident-meta">
        ${escapeHtml(inc.locationName)} &middot; ${formatDistance(distKm)} away &middot; ${formatTimeAgo(inc.timestamp)}
      </div>
      <div class="incident-meta">Source: ${escapeHtml(inc.agency)}</div>
    </div>

    <div class="inspector-block">
      <span class="micro-label">Details</span>
      <p class="incident-desc">${escapeHtml(inc.description)}</p>
      <span class="micro-label" style="margin-top: 4px;">Safety Guidance</span>
      <p class="incident-desc">${escapeHtml(inc.officialGuidance)}</p>
    </div>

    ${verifySectionHTML}
    ${actionBlockHTML}
  `;
}

/* ============================================================================
   9. HOME & VERIFY LISTS + TELEMETRY STATS
   ============================================================================ */
function renderIncidentCard(inc, { showVerifyControls = false } = {}) {
  const distKm = calcDistanceKm(state.userLocation.lat, state.userLocation.lng, inc.lat, inc.lng);
  const isGovt = inc.source === 'govt_api';
  const cardMod = isGovt ? 'incident-card--govt' : (inc.status === 'pending' ? 'incident-card--pending' : 'incident-card--verified');

  const card = document.createElement('div');
  card.className = `incident-card ${cardMod} animate-in`;

  let footerHTML = '';
  if (isGovt) {
    const srcLink = inc.sourceUrl
      ? `<a href="${escapeHtml(inc.sourceUrl)}" target="_blank" rel="noopener noreferrer" class="btn" style="height: 30px;"><i class="ph-bold ph-arrow-square-out"></i> Source</a>`
      : '';
    footerHTML = `
      <div class="alert-only-note">
        <i class="ph-bold ph-warning-circle"></i>
        <span>Official Alert Only — Volunteering disabled for major API crises.</span>
      </div>
      <div class="verify-actions">
        <button type="button" onclick="selectIncident('${inc.id}', true)" class="btn" style="height: 30px;">
          <i class="ph-bold ph-map-pin"></i> Map
        </button>
        ${srcLink}
        <button type="button" onclick="handleOfficialHelplineClick('${escapeHtml(inc.dialedNumber || '112')}', '${escapeHtml(inc.category)}')" class="btn btn--danger" style="height: 30px;">
          <i class="ph-bold ph-phone-call"></i> ${escapeHtml(inc.dialedNumber || '112')}
        </button>
      </div>
    `;
  } else if (showVerifyControls) {
    const disabled = state.userVotes[inc.id] ? 'disabled' : '';
    footerHTML = `
      <div class="verify-actions">
        <button type="button" onclick="verifyUserReport('${inc.id}', 'confirmed')" class="btn btn--success-outline" style="height: 30px;" ${disabled}>
          <i class="ph-bold ph-check"></i> Confirm (${inc.confirmations}/${VERIFICATION_THRESHOLD})
        </button>
        <button type="button" onclick="verifyUserReport('${inc.id}', 'false')" class="btn" style="height: 30px;" ${disabled}>
          <i class="ph-bold ph-x"></i> False
        </button>
        <button type="button" onclick="selectIncident('${inc.id}', true)" class="btn" style="height: 30px;">
          Map
        </button>
      </div>
    `;
  }

  card.innerHTML = `
    <div class="incident-card-top">
      <div class="badge-row">
        ${getSourceBadge(inc)}
        ${getCategoryBadge(inc.category)}
      </div>
      <span class="incident-meta">${formatDistance(distKm)} &middot; ${formatTimeAgo(inc.timestamp)}</span>
    </div>
    <div class="incident-title">${escapeHtml(inc.title)}</div>
    <div class="incident-meta">${escapeHtml(inc.locationName)} &middot; ${escapeHtml(inc.agency)}</div>
    <p class="incident-desc">${escapeHtml(inc.description)}</p>
    ${footerHTML}
  `;

  return card;
}

function renderListsAndStats() {
  const govtAlerts = [...state.officialAlerts].sort((a, b) =>
    calcDistanceKm(state.userLocation.lat, state.userLocation.lng, a.lat, a.lng) -
    calcDistanceKm(state.userLocation.lat, state.userLocation.lng, b.lat, b.lng)
  );
  const userReports = [...state.userReports].sort((a, b) =>
    calcDistanceKm(state.userLocation.lat, state.userLocation.lng, a.lat, a.lng) -
    calcDistanceKm(state.userLocation.lat, state.userLocation.lng, b.lat, b.lng)
  );

  const verifiedReports = userReports.filter(i => i.status === 'verified');
  const pendingReports = userReports.filter(i => i.status === 'pending');
  const totalHelpers = userReports.reduce((sum, i) => sum + (i.minimalHelpers || 0), 0);

  const totalActive = govtAlerts.length + verifiedReports.length;
  document.getElementById('summary-active-num').textContent = totalActive;
  document.getElementById('dnav-map-count').textContent = govtAlerts.length + userReports.length;
  document.getElementById('dnav-pending-count').textContent = pendingReports.length;

  document.getElementById('stat-govt').textContent = govtAlerts.length;
  document.getElementById('stat-verified').textContent = verifiedReports.length;
  document.getElementById('stat-pending').textContent = pendingReports.length;
  document.getElementById('stat-devices').textContent = state.connectedDevices;

  // Home — Live Official Govt API Alerts
  const homeGovtEl = document.getElementById('home-govt-alerts');
  homeGovtEl.innerHTML = '';
  if (govtAlerts.length === 0) {
    homeGovtEl.innerHTML = `<div class="empty-state">All clear — no active official disaster alerts near Patiala / Northern India right now.</div>`;
  } else {
    govtAlerts.slice(0, 4).forEach(inc => homeGovtEl.appendChild(renderIncidentCard(inc)));
  }

  // Home — Pending Nearby User Reports
  const homePendingEl = document.getElementById('home-pending-list');
  homePendingEl.innerHTML = '';
  const homeVerifyItems = pendingReports.length > 0 ? pendingReports : verifiedReports;
  if (homeVerifyItems.length === 0) {
    homePendingEl.innerHTML = `<div class="empty-state">No user-reported emergencies near Patiala · Thapar. When someone dials an emergency number above, nearby residents will see a verification request here.</div>`;
  } else {
    homeVerifyItems.slice(0, 4).forEach(inc =>
      homePendingEl.appendChild(renderIncidentCard(inc, { showVerifyControls: true }))
    );
  }

  // Verify View — All User Reports
  const verifyUserEl = document.getElementById('verify-user-list');
  verifyUserEl.innerHTML = '';
  if (userReports.length === 0) {
    verifyUserEl.innerHTML = `<div class="empty-state">No real emergency call reports have been logged yet.</div>`;
  } else {
    userReports.forEach(inc =>
      verifyUserEl.appendChild(renderIncidentCard(inc, { showVerifyControls: true }))
    );
  }

  // Verify View — All Live Official Govt Alerts
  const verifyGovtEl = document.getElementById('verify-govt-list');
  verifyGovtEl.innerHTML = '';
  if (govtAlerts.length === 0) {
    verifyGovtEl.innerHTML = `<div class="empty-state">All clear — no active events returned by USGS, NASA EONET, NDMA SACHET, or Open-Meteo.</div>`;
  } else {
    govtAlerts.forEach(inc => verifyGovtEl.appendChild(renderIncidentCard(inc)));
  }
}

function refreshAll() {
  renderListsAndStats();
  renderInspector();
  if (map) renderMap();
}

/* ============================================================================
   10. MODALS, TOASTS & PWA REGISTRATION
   ============================================================================ */
function closeModal(id) {
  document.getElementById(id)?.classList.add('is-hidden');
}

function handleBackdropClick(event, id) {
  if (event.target.id === id) closeModal(id);
}

function showToast(message, type = 'info') {
  const container = document.getElementById('toast-container');
  const toast = document.createElement('div');
  const icons = {
    info: 'ph-info toast-icon--info',
    success: 'ph-check-circle toast-icon--success',
    warning: 'ph-warning-circle toast-icon--warning',
    danger: 'ph-warning-octagon toast-icon--danger'
  };

  toast.className = 'toast animate-in';
  toast.innerHTML = `
    <i class="ph-fill ${icons[type] || icons.info} toast-icon"></i>
    <div class="toast-body">${escapeHtml(message)}</div>
    <button type="button" onclick="this.parentElement.remove()" class="modal-close" aria-label="Dismiss">
      <i class="ph-bold ph-x"></i>
    </button>
  `;
  container.appendChild(toast);

  setTimeout(() => {
    toast.style.opacity = '0';
    setTimeout(() => toast.remove(), 250);
  }, 4600);
}

function registerPWA() {
  if ('serviceWorker' in navigator && location.protocol !== 'file:') {
    navigator.serviceWorker.register('./sw.js').catch(() => {});
  }

  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault();
    state.deferredInstallPrompt = e;
    document.getElementById('btn-install-pwa')?.classList.remove('is-hidden');
  });
}

async function promptInstallPWA() {
  if (!state.deferredInstallPrompt) return;
  state.deferredInstallPrompt.prompt();
  await state.deferredInstallPrompt.userChoice;
  state.deferredInstallPrompt = null;
  document.getElementById('btn-install-pwa')?.classList.add('is-hidden');
}

/* ============================================================================
   11. BOOTSTRAP
   ============================================================================ */
window.addEventListener('load', async () => {
  loadLocalPrefs();
  populateSectorSelects();
  updateNotifButtonUI();
  registerPWA();

  await loadUserReports();
  refreshAll();

  // Connect real-time SSE broadcast stream for instant multi-device notifications
  connectLiveEventStream();

  // Immediately sync real official APIs on startup
  await syncOfficialGovtAPIs(false);

  // Close dropdowns / modals on outside click or Escape
  document.addEventListener('click', (e) => {
    if (!e.target.closest('.dropdown-wrap')) closeStatsDropdown();
  });

  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      closeStatsDropdown();
      closeModal('call-report-modal');
      closeModal('incoming-ping-modal');
      closeModal('danger-warning-modal');
    }
  });

  window.addEventListener('resize', () => {
    if (map) map.invalidateSize();
  });

  // Refresh relative timestamps every 30 seconds
  setInterval(() => {
    renderListsAndStats();
    renderInspector();
  }, 30000);
});
