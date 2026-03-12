import { io } from 'socket.io-client';
import { drawMap, drawCompass, latLonToCanvas, canvasToLatLon, setViewport, getViewport, isOnLand, drawWaypoints, spawnMissile, spawnPlane, setImpactHandler } from './map.js';
import { CHOKEPOINTS } from '../shared/world-coastlines.js';
import {
  SIM_CONFIG, DANGER_ZONES, EVENTS, RISK_LEVELS, MAP_BOUNDS, GULF_BOUNDS,
  FUEL_COST_PER_UNIT, DEFAULT_VIEWPORT, OIL_TERMINALS, EXPORT_TERMINALS, IMPORT_TERMINALS,
  NPC_SHIP_TYPES, MILITARY_SHIPS, DROPOFF_POINT, DROPOFF_POINTS, MILITARY_BASES, CITIES,
  TERMINAL_REGIONS, getTerminalPrice, SUPPLY_DEMAND_CONFIG
} from '../shared/constants.js';
import { distanceDeg, headingToTarget, angleDiff, normalizeAngle, wrapLon } from '../shared/geography.js';
import { computeOceanRoute, computeAutopilotRoute } from '../shared/ocean-routing.js';

const socket = io(window.location.hostname === 'localhost'
  ? 'http://localhost:3001'
  : window.location.origin
);

// ============================================
// STATE
// ============================================
let gameState = null;
let myId = null;
let isHost = false;
let options = null;
// joinMode removed — no game codes

let modalShipTypeId = null;
let modalAisId = null;
let modalInsuranceId = null;
let modalSpawnTerminalId = null;

let gameSpeedMultiplier = 12;

// Find current player in game state — tries ID match, falls back to single-player
function getMe() {
  if (!gameState?.players) return null;
  return gameState.players.find(p => p.id === myId)
    || (gameState.players.length === 1 ? gameState.players[0] : null);
}

// Get live terminal price including supply/demand from NPC traffic
function getLivePrice(terminal) {
  const rl = gameState?.riskLevel || 'LOW';
  // Use local supply/demand-aware pricing when NPC data is available
  if (typeof npcShips !== 'undefined' && npcShips.length > 0) {
    return getTerminalPrice(terminal, rl, computeNpcTraffic());
  }
  // Fallback to server state
  if (gameState && gameState.terminalPrices && gameState.terminalPrices[terminal.id]) {
    return gameState.terminalPrices[terminal.id].price;
  }
  return terminal.buyPrice || terminal.sellPrice || 75;
}

let transitActive = false;
let simStartTime = 0;
let simGameTime = 0;
let lastFrameTime = 0;
let zoneCooldowns = {};
let lastEventCheck = 0;

// Server-sim interpolation targets (for smooth lerping between broadcasts)
const serverTargets = {};       // shipId -> { lat, lon, heading, speed }
const serverNpcTargets = [];    // index -> { lat, lon, heading }
const serverMilTargets = [];    // index -> { lat, lon, heading }

// Campaign state
const CAMPAIGN_DAYS = 7;
const CAMPAIGN_DURATION = CAMPAIGN_DAYS * 24 * 3600; // 7 days in game seconds
let campaignStats = {
  totalProfit: 0,
  totalRevenue: 0,
  totalCosts: 0,
  deliveries: 0,
  shipsBought: 0,
  shipsLost: 0,
  totalDamageTaken: 0,
  missileEvents: 0,
  attackLog: [],        // {time, region, type, description}
  regionIntensity: {},  // region -> {level, lastChange}
};
let campaignEnded = false;

// Region intensity definitions (used by situation monitor + mobile sitrep)
const REGION_INTENSITY_LEVELS = ['LOW', 'MODERATE', 'HIGH', 'CRITICAL'];
const REGION_DEFINITIONS = {
  gulf: { name: 'Persian Gulf', baseLevel: 3 },
  red_sea: { name: 'Red Sea / Bab el-Mandeb', baseLevel: 2 },
  somalia: { name: 'Gulf of Aden / Somalia', baseLevel: 1 },
  malacca: { name: 'Malacca Strait', baseLevel: 0 },
  singapore: { name: 'Singapore Strait', baseLevel: 0 },
  guinea: { name: 'Gulf of Guinea', baseLevel: 1 },
  panama: { name: 'Panama Canal', baseLevel: 0 },
  gulf_mexico: { name: 'Gulf of Mexico', baseLevel: 0 },
  cape_horn: { name: 'Cape Horn', baseLevel: 0 },
  south_china_sea: { name: 'South China Sea', baseLevel: 1 },
};

// Multi-ship state
let shipStates = {};
let shipWaypoints = {};
let shipTrails = {};
let shipCargo = {};
let shipAutopilot = {}; // { [shipId]: { active: bool, terminal: obj } }
let selectedShipId = null;

let npcShips = [];
let militaryShips = [];
let _currentFrame = 0;
let _fleetPanelDirty = false; // batch updateFleetPanel calls per frame

// Map label visibility settings
const mapLabelSettings = {
  cityNames: true,
  countryNames: true,
  baseNames: true,
  terminalNames: true,
  waterLabels: true,
  zoneLabels: true,
};

let viewport = { ...DEFAULT_VIEWPORT };
let isPanning = false;
let panStart = { x: 0, y: 0 };
let panViewportStart = null;

// ============================================
// DOM
// ============================================
const mapCanvas = document.getElementById('game-map');
const compassCanvas = document.getElementById('compass-canvas');

const screens = {
  title: document.getElementById('screen-title'),
  lobby: document.getElementById('screen-lobby'),
  transit: document.getElementById('screen-transit'),
  results: document.getElementById('screen-results'),
  gameover: document.getElementById('screen-gameover')
};

function showScreen(name) {
  Object.values(screens).forEach(s => s.classList.remove('active'));
  if (screens[name]) screens[name].classList.add('active');
}

// Campaign time helpers
function getCampaignDay() { return Math.floor(simGameTime / (24 * 3600)) + 1; }
function getGameHour() { return (simGameTime % (24 * 3600)) / 3600; }
// Sun longitude: at hour 0 (midnight UTC), the sun is at lon 180 (opposite side).
// The sun moves west at 15°/hour. At hour 12 (noon UTC), sun is at lon 0.
function getSunLon() {
  const h = getGameHour();
  let sunLon = 180 - h * 15; // midnight UTC → sun at 180°, noon UTC → sun at 0°
  while (sunLon > 180) sunLon -= 360;
  while (sunLon < -180) sunLon += 360;
  return sunLon;
}
// Returns 0 (full night) to 1 (full day) for a given longitude
function getDaylightAt(lon) {
  const sunLon = getSunLon();
  let diff = lon - sunLon;
  if (diff > 180) diff -= 360;
  if (diff < -180) diff += 360;
  const absDiff = Math.abs(diff);
  // Day within 90° of sun, night beyond 90°, with 15° twilight transition
  if (absDiff <= 75) return 1.0;
  if (absDiff >= 105) return 0.0;
  return 1.0 - (absDiff - 75) / 30;
}
function isNightAtLon(lon) { return getDaylightAt(lon) < 0.3; }
function getNightDetectionMultiplier(lon) {
  const daylight = getDaylightAt(lon);
  return 0.4 + 0.6 * daylight; // 0.4 at full night, 1.0 at full day
}

function formatMoney(n) {
  if (Math.abs(n) >= 1000000) return `$${(n / 1000000).toFixed(2)}M`;
  if (Math.abs(n) >= 1000) return `$${(n / 1000).toFixed(0)}K`;
  return `$${n}`;
}

function showError(msg) {
  const el = document.getElementById('error-msg');
  el.textContent = msg;
  el.classList.remove('hidden');
  setTimeout(() => el.classList.add('hidden'), 4000);
}

function escapeHtml(text) {
  const d = document.createElement('div');
  d.textContent = text;
  return d.innerHTML;
}

// ============================================
// PAN / ZOOM
// ============================================
function initPanZoom() {
  mapCanvas.addEventListener('wheel', (e) => {
    e.preventDefault();
    const rect = mapCanvas.getBoundingClientRect();
    const mx = e.clientX - rect.left;
    const my = e.clientY - rect.top;
    const vp = getViewport();
    const lonFrac = mx / rect.width;
    const latFrac = my / rect.height;
    const lonCenter = vp.west + lonFrac * (vp.east - vp.west);
    const latCenter = vp.north - latFrac * (vp.north - vp.south);
    const factor = e.deltaY > 0 ? 1.15 : 0.87;
    const newLonRange = (vp.east - vp.west) * factor;
    const newLatRange = (vp.north - vp.south) * factor;
    if (newLonRange < 0.5 || newLonRange > 360 || newLatRange < 0.3 || newLatRange > 145) return;
    viewport = clampViewport({
      west: lonCenter - newLonRange * lonFrac,
      east: lonCenter + newLonRange * (1 - lonFrac),
      north: latCenter + newLatRange * latFrac,
      south: latCenter - newLatRange * (1 - latFrac)
    });
    setViewport(viewport);
  }, { passive: false });

  mapCanvas.addEventListener('mousedown', (e) => {
    if (e.button === 2 || e.button === 1) {
      isPanning = true;
      panStart = { x: e.clientX, y: e.clientY };
      panViewportStart = { ...getViewport() };
      e.preventDefault();
    }
  });

  window.addEventListener('mousemove', (e) => {
    if (!isPanning || !panViewportStart) return;
    const rect = mapCanvas.getBoundingClientRect();
    const dx = e.clientX - panStart.x;
    const dy = e.clientY - panStart.y;
    const lonShift = -dx / rect.width * (panViewportStart.east - panViewportStart.west);
    const latShift = dy / rect.height * (panViewportStart.north - panViewportStart.south);
    viewport = clampViewport({
      west: panViewportStart.west + lonShift,
      east: panViewportStart.east + lonShift,
      north: panViewportStart.north + latShift,
      south: panViewportStart.south + latShift
    });
    setViewport(viewport);
  });

  window.addEventListener('mouseup', (e) => {
    if (e.button === 2 || e.button === 1) isPanning = false;
  });

  mapCanvas.addEventListener('contextmenu', (e) => e.preventDefault());

  // ---- TOUCH CONTROLS ----
  let touchStartTime = 0;
  let touchStartPos = null;
  let touchPanActive = false;
  let pinchStartDist = 0;
  let pinchStartViewport = null;
  let touchMoved = false;

  function getTouchDist(t1, t2) {
    return Math.sqrt(Math.pow(t1.clientX - t2.clientX, 2) + Math.pow(t1.clientY - t2.clientY, 2));
  }

  function getTouchCenter(t1, t2) {
    return { x: (t1.clientX + t2.clientX) / 2, y: (t1.clientY + t2.clientY) / 2 };
  }

  mapCanvas.addEventListener('touchstart', (e) => {
    e.preventDefault();
    if (e.touches.length === 1) {
      touchStartTime = Date.now();
      touchStartPos = { x: e.touches[0].clientX, y: e.touches[0].clientY };
      touchMoved = false;
      touchPanActive = true;
      panStart = { x: e.touches[0].clientX, y: e.touches[0].clientY };
      panViewportStart = { ...getViewport() };
    } else if (e.touches.length === 2) {
      touchPanActive = false;
      pinchStartDist = getTouchDist(e.touches[0], e.touches[1]);
      pinchStartViewport = { ...getViewport() };
    }
  }, { passive: false });

  mapCanvas.addEventListener('touchmove', (e) => {
    e.preventDefault();
    if (e.touches.length === 1 && touchPanActive && panViewportStart) {
      const dx = e.touches[0].clientX - panStart.x;
      const dy = e.touches[0].clientY - panStart.y;
      if (Math.abs(dx) > 5 || Math.abs(dy) > 5) touchMoved = true;
      const rect = mapCanvas.getBoundingClientRect();
      const lonShift = -dx / rect.width * (panViewportStart.east - panViewportStart.west);
      const latShift = dy / rect.height * (panViewportStart.north - panViewportStart.south);
      viewport = clampViewport({
        west: panViewportStart.west + lonShift,
        east: panViewportStart.east + lonShift,
        north: panViewportStart.north + latShift,
        south: panViewportStart.south + latShift
      });
      setViewport(viewport);
    } else if (e.touches.length === 2 && pinchStartViewport) {
      const dist = getTouchDist(e.touches[0], e.touches[1]);
      const scale = pinchStartDist / dist;
      const center = getTouchCenter(e.touches[0], e.touches[1]);
      const rect = mapCanvas.getBoundingClientRect();
      const lonFrac = (center.x - rect.left) / rect.width;
      const latFrac = (center.y - rect.top) / rect.height;
      const lonCenter = pinchStartViewport.west + lonFrac * (pinchStartViewport.east - pinchStartViewport.west);
      const latCenter = pinchStartViewport.north - latFrac * (pinchStartViewport.north - pinchStartViewport.south);
      const newLonRange = (pinchStartViewport.east - pinchStartViewport.west) * scale;
      const newLatRange = (pinchStartViewport.north - pinchStartViewport.south) * scale;
      if (newLonRange >= 0.5 && newLonRange <= 360 && newLatRange >= 0.3 && newLatRange <= 145) {
        viewport = clampViewport({
          west: lonCenter - newLonRange * lonFrac,
          east: lonCenter + newLonRange * (1 - lonFrac),
          north: latCenter + newLatRange * latFrac,
          south: latCenter - newLatRange * (1 - latFrac)
        });
        setViewport(viewport);
      }
      touchMoved = true;
    }
  }, { passive: false });

  mapCanvas.addEventListener('touchend', (e) => {
    e.preventDefault();
    if (e.touches.length === 0) {
      touchPanActive = false;
      // If short tap without moving, simulate a click
      if (!touchMoved && touchStartPos && (Date.now() - touchStartTime < 300)) {
        const clickEvent = new MouseEvent('click', {
          clientX: touchStartPos.x,
          clientY: touchStartPos.y,
          bubbles: true
        });
        mapCanvas.dispatchEvent(clickEvent);
      }
      touchStartPos = null;
      pinchStartViewport = null;
    } else if (e.touches.length === 1) {
      // Went from 2 fingers to 1: restart pan from current position
      touchPanActive = true;
      panStart = { x: e.touches[0].clientX, y: e.touches[0].clientY };
      panViewportStart = { ...getViewport() };
      pinchStartViewport = null;
    }
  }, { passive: false });
}
initPanZoom();

// Chokepoint quick-nav buttons
(function initChokepointNav() {
  const container = document.getElementById('chokepoint-buttons');
  if (!container) return;
  for (const cp of CHOKEPOINTS) {
    const btn = document.createElement('button');
    btn.className = 'chokepoint-btn';
    btn.innerHTML = `${cp.shortName} <span class="cp-flow">${cp.flowMbpd}mb/d</span>`;
    btn.title = cp.description;
    btn.addEventListener('click', () => {
      viewport = { ...cp.viewport };
      setViewport(viewport);
    });
    container.appendChild(btn);
  }
})();

// Fleet panel minimize toggle
document.getElementById('fleet-toggle').addEventListener('click', () => {
  const body = document.getElementById('dash-fleet');
  const icon = document.getElementById('fleet-toggle-icon');
  const hidden = body.style.display === 'none';
  body.style.display = hidden ? '' : 'none';
  icon.textContent = hidden ? '▾' : '▸';
});

// NPC and military ship hover detection
mapCanvas.addEventListener('mousemove', (e) => {
  const rect = mapCanvas.getBoundingClientRect();
  const cx = e.clientX - rect.left;
  const cy = e.clientY - rect.top;
  const hoverPanel = document.getElementById('npc-hover-info');
  let found = false;
  for (const npc of npcShips) {
    const pos = latLonToCanvas(npc.lat, npc.lon, rect.width, rect.height);
    if (Math.sqrt(Math.pow(cx - pos.x, 2) + Math.pow(cy - pos.y, 2)) < 15) {
      hoverPanel.innerHTML = `
        <div class="npc-name">${npc.shipName}</div>
        <div class="npc-detail">Type: ${npc.typeName} (${(npc.cargoType || 'oil').toUpperCase()})</div>
        <div class="npc-detail">Speed: ${Math.round(npc.speed)} kts</div>
        <div class="npc-detail">Dest: ${getNPCDestination(npc)}</div>`;
      hoverPanel.classList.remove('hidden');
      found = true; break;
    }
  }
  if (!found) {
    for (const mil of militaryShips) {
      const pos = latLonToCanvas(mil.lat, mil.lon, rect.width, rect.height);
      if (Math.sqrt(Math.pow(cx - pos.x, 2) + Math.pow(cy - pos.y, 2)) < 15) {
        const statusText = mil.state === 'idle' ? 'Station Keeping' : 'Patrolling';
        hoverPanel.innerHTML = `
          <div class="npc-name">${mil.name}</div>
          <div class="npc-detail">Country: ${mil.country}</div>
          <div class="npc-detail">Speed: ${Math.round(mil.speed)} kts</div>
          <div class="npc-detail">Status: ${statusText}</div>`;
        hoverPanel.classList.remove('hidden');
        found = true; break;
      }
    }
  }
  if (!found) hoverPanel.classList.add('hidden');
});

function clampViewport(vp) {
  const lonRange = vp.east - vp.west;
  const latRange = vp.north - vp.south;
  // Clamp latitude to map bounds
  let south = Math.max(MAP_BOUNDS.south, Math.min(MAP_BOUNDS.north - latRange, vp.south));
  // Allow free longitude panning — no clamping, supports circumnavigation
  let west = vp.west;
  return { west, east: west + lonRange, south, north: south + latRange };
}

function centerViewportOn(lat, lon) {
  const vp = getViewport();
  const lonRange = vp.east - vp.west;
  const latRange = vp.north - vp.south;
  viewport = clampViewport({
    west: lon - lonRange / 2, east: lon + lonRange / 2,
    north: lat + latRange / 2, south: lat - latRange / 2
  });
  setViewport(viewport);
}


// ============================================
// SETTINGS MENU
// ============================================
document.getElementById('settings-btn').addEventListener('click', () => {
  const panel = document.getElementById('settings-panel');
  if (panel.classList.contains('hidden')) {
    // Reset to main menu when opening
    document.getElementById('settings-menu').classList.remove('hidden');
    document.querySelectorAll('.settings-section').forEach(s => s.classList.add('hidden'));
    panel.classList.remove('hidden');
  } else {
    panel.classList.add('hidden');
  }
});

// Settings sub-menu navigation
document.querySelectorAll('.settings-menu-item[data-section]').forEach(btn => {
  btn.addEventListener('click', () => {
    const section = btn.dataset.section;
    document.getElementById('settings-menu').classList.add('hidden');
    document.getElementById(`settings-${section}`).classList.remove('hidden');
    if (section === 'leaderboard') fetchLeaderboard();
  });
});

document.querySelectorAll('.settings-back-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('.settings-section').forEach(s => s.classList.add('hidden'));
    document.getElementById('settings-menu').classList.remove('hidden');
  });
});

// Settings logout
document.getElementById('settings-logout-btn').addEventListener('click', () => {
  logout();
  document.getElementById('settings-panel').classList.add('hidden');
  showScreen('title');
  transitActive = false;
});

// Leaderboard
let leaderboardPeriod = 'week';

async function fetchLeaderboard() {
  const listEl = document.getElementById('settings-lb-list');
  listEl.innerHTML = '<div class="muted" style="padding:8px;font-size:11px;">Loading...</div>';
  try {
    const url = leaderboardPeriod === 'all' ? '/api/leaderboard' : `/api/leaderboard?period=${leaderboardPeriod}`;
    const res = await fetch(url);
    const rows = await res.json();
    if (rows.length === 0) {
      listEl.innerHTML = '<div class="muted" style="padding:8px;font-size:11px;">No data yet.</div>';
      return;
    }
    listEl.innerHTML = rows.map((r, i) => {
      const profit = r.period_profit != null ? r.period_profit : r.total_profit;
      return `<div class="settings-lb-row">
        <span class="settings-lb-rank">#${i + 1}</span>
        <span class="settings-lb-name">${escapeHtml(r.username)}</span>
        <span class="settings-lb-profit">${formatMoney(profit)}</span>
      </div>`;
    }).join('');
  } catch {
    listEl.innerHTML = '<div class="muted" style="padding:8px;font-size:11px;">Failed to load.</div>';
  }
}

document.querySelectorAll('.settings-lb-tab').forEach(tab => {
  tab.addEventListener('click', () => {
    document.querySelectorAll('.settings-lb-tab').forEach(t => t.classList.remove('active'));
    tab.classList.add('active');
    leaderboardPeriod = tab.dataset.period;
    fetchLeaderboard();
  });
});

const labelToggleMap = {
  'toggle-city-names': 'cityNames',
  'toggle-country-names': 'countryNames',
  'toggle-base-names': 'baseNames',
  'toggle-terminal-names': 'terminalNames',
  'toggle-water-labels': 'waterLabels',
};
for (const [elId, key] of Object.entries(labelToggleMap)) {
  document.getElementById(elId).addEventListener('change', (e) => {
    mapLabelSettings[key] = e.target.checked;
  });
}

// ============================================
// MOBILE TAB BAR & DRAWER
// ============================================
let mobileActiveTab = 'map';
let mobileEventLog = []; // stores {name, text, type} for mobile event log

function isMobile() {
  return window.innerWidth <= 768;
}

(function initMobileTabBar() {
  const tabs = document.querySelectorAll('.mobile-tab');
  const drawer = document.getElementById('mobile-drawer');
  const drawerContent = document.getElementById('mobile-drawer-content');

  tabs.forEach(tab => {
    tab.addEventListener('click', () => {
      const tabName = tab.dataset.tab;
      tabs.forEach(t => t.classList.remove('active'));
      tab.classList.add('active');

      if (tabName === 'map' || tabName === mobileActiveTab) {
        // Close drawer on map tab or toggle
        if (tabName === 'map') {
          drawer.classList.add('mobile-drawer-hidden');
          mobileActiveTab = 'map';
          tabs.forEach(t => t.classList.remove('active'));
          document.querySelector('.mobile-tab[data-tab="map"]').classList.add('active');
          return;
        }
        if (tabName === mobileActiveTab && !drawer.classList.contains('mobile-drawer-hidden')) {
          drawer.classList.add('mobile-drawer-hidden');
          mobileActiveTab = 'map';
          tabs.forEach(t => t.classList.remove('active'));
          document.querySelector('.mobile-tab[data-tab="map"]').classList.add('active');
          return;
        }
      }

      mobileActiveTab = tabName;
      drawer.classList.remove('mobile-drawer-hidden');
      renderMobileDrawer(tabName, drawerContent);
    });
  });
})();

function renderMobileDrawer(tabName, container) {
  switch (tabName) {
    case 'fleet': renderMobileFleet(container); break;
    case 'controls': renderMobileControls(container); break;
    case 'log': renderMobileLog(container); break;
    case 'settings': renderMobileSettings(container); break;
    case 'sitrep': renderMobileSitrep(container); break;
    default: container.innerHTML = '';
  }
}

function renderMobileSitrep(container) {
  const risk = RISK_LEVELS[gameState?.riskLevel] || RISK_LEVELS.LOW;
  const rl = gameState?.riskLevel || 'LOW';
  const levels = ['LOW', 'MODERATE', 'HIGH', 'CRITICAL'];
  const levelIdx = levels.indexOf(rl);

  // Threat dial SVG
  const dialColors = ['#40c070', '#f0a030', '#e04040', '#800000'];
  const dialColor = dialColors[levelIdx] || dialColors[0];
  const dialAngle = -90 + (levelIdx / 3) * 180; // -90 to 90 degrees
  const dialRad = dialAngle * Math.PI / 180;

  let html = `<div class="mobile-section-title">THREAT LEVEL</div>`;
  html += `<div style="text-align:center;margin:8px 0 12px;">
    <svg width="140" height="85" viewBox="0 0 140 85">
      <!-- Dial arc segments -->
      <path d="M 15 75 A 55 55 0 0 1 50 22" stroke="#40c070" stroke-width="8" fill="none" stroke-linecap="round"/>
      <path d="M 50 22 A 55 55 0 0 1 90 22" stroke="#f0a030" stroke-width="8" fill="none" stroke-linecap="round"/>
      <path d="M 90 22 A 55 55 0 0 1 125 75" stroke="#e04040" stroke-width="8" fill="none" stroke-linecap="round"/>
      <!-- Needle -->
      <line x1="70" y1="75" x2="${70 + Math.cos(dialRad) * 45}" y2="${75 + Math.sin(dialRad) * 45}" stroke="${dialColor}" stroke-width="3" stroke-linecap="round"/>
      <circle cx="70" cy="75" r="5" fill="${dialColor}"/>
      <!-- Label -->
      <text x="70" y="12" text-anchor="middle" fill="${dialColor}" font-family="Courier New" font-size="11" font-weight="bold">${risk.name.toUpperCase()}</text>
    </svg>
  </div>`;

  // Quick stats
  const recentAttacks = campaignStats.attackLog.filter(a => Date.now() - a.time < 24 * 60 * 1000); // last ~24 game minutes
  html += `<div style="display:flex;justify-content:space-around;margin-bottom:12px;">
    <div style="text-align:center;"><div style="font-size:18px;font-weight:bold;color:var(--danger);">${campaignStats.missileEvents || 0}</div><div style="font-size:9px;color:var(--text-muted);">MISSILES</div></div>
    <div style="text-align:center;"><div style="font-size:18px;font-weight:bold;color:var(--primary);">${recentAttacks.length}</div><div style="font-size:9px;color:var(--text-muted);">RECENT</div></div>
  </div>`;

  // Region intensity cards
  html += `<div class="mobile-section-title">REGIONAL THREAT</div>`;
  for (const [id, def] of Object.entries(REGION_DEFINITIONS)) {
    const ri = campaignStats.regionIntensity[id];
    if (!ri) continue;
    const threatClass = ri.level >= 2 ? 'sitmon-stat-bad' : ri.level === 1 ? 'sitmon-stat-warn' : 'sitmon-stat-ok';
    html += `<div style="display:flex;justify-content:space-between;padding:6px 0;border-bottom:1px solid rgba(42,48,80,0.3);">
      <span style="font-size:11px;">${def.name}</span>
      <span class="${threatClass}" style="font-size:10px;font-weight:bold;">${ri.levelName}</span>
    </div>`;
  }

  // View full monitor button
  html += `<button class="btn btn-small btn-primary" style="width:100%;margin-top:12px;" id="mobile-open-sitmon">OPEN FULL MONITOR</button>`;

  container.innerHTML = html;

  document.getElementById('mobile-open-sitmon')?.addEventListener('click', () => {
    openSituationMonitor();
  });
}

function renderMobileFleet(container) {
  try {
  // Try exact ID match first, then fallback to single-player (first player)
  const me = getMe();
  if (!me) { container.innerHTML = '<div class="muted">Connecting...</div>'; return; }

  let html = `<div class="mobile-section-title">FLEET — ${formatMoney(me.cash || 0)}</div>`;
  if (me.fleet.length === 0) {
    html += '<div class="muted">No ships. Buy one!</div>';
  } else {
    for (const s of me.fleet) {
      const state = shipStates[s.id];
      const cargo = shipCargo[s.id];
      const isSelected = selectedShipId === s.id;
      const hp = state ? Math.round((state.health - state.totalDamage) * 100) : Math.round(s.health * 100);
      const destroyed = state?.destroyed || state?.seized;
      const cargoText = destroyed ? 'LOST' : cargo?.delivered ? 'DELIVERED' : cargo?.loaded ? 'LOADED' : 'EMPTY';
      const cargoClass = destroyed ? 'stat-bad' : cargo?.delivered ? 'stat-good' : cargo?.loaded ? 'stat-warn' : 'stat-warn';
      html += `
        <div class="mobile-fleet-card ${isSelected ? 'selected' : ''}" data-mobile-ship="${s.id}">
          <div class="mobile-fleet-header">
            <span class="mobile-fleet-name">${s.name}</span>
            <div class="mobile-fleet-stats">
              <span class="stat">${(s.cargoType || 'oil').toUpperCase()}</span>
              <span class="stat ${hp > 70 ? 'stat-good' : hp > 40 ? 'stat-warn' : 'stat-bad'}">HP:${hp}%</span>
              <span class="stat ${cargoClass}">${cargoText}</span>
              ${shipAutopilot[s.id]?.active ? '<span class="stat stat-good">AP</span>' : ''}
            </div>
          </div>
          <div class="mobile-fleet-actions">
            <button class="btn btn-small btn-secondary mobile-select-ship" data-sid="${s.id}">SELECT</button>
            <button class="btn btn-small btn-primary mobile-manage-ship" data-sid="${s.id}">MANAGE</button>
          </div>
        </div>`;
    }
  }
  html += `<button id="mobile-buy-ship" class="btn btn-small btn-primary" style="width:100%;margin-top:8px;">+ BUY SHIP</button>`;
  container.innerHTML = html;

  container.querySelectorAll('.mobile-select-ship').forEach(btn => {
    btn.addEventListener('click', () => {
      selectShip(btn.dataset.sid);
      renderMobileFleet(container);
    });
  });
  container.querySelectorAll('.mobile-manage-ship').forEach(btn => {
    btn.addEventListener('click', () => {
      selectShip(btn.dataset.sid);
      openFleetManager();
    });
  });
  const buyBtn = document.getElementById('mobile-buy-ship');
  if (buyBtn) buyBtn.addEventListener('click', () => openShipPurchaseModal());
  } catch (e) { console.error('renderMobileFleet error:', e); }
}

function renderMobileControls(container) {
  try {
  const ship = getSelectedShipData();
  const state = selectedShipId ? shipStates[selectedShipId] : null;
  if (!ship || !state) {
    container.innerHTML = '<div class="muted">Select a ship first</div>';
    return;
  }

  const ratedSpeed = ship.speed || 16;
  const spdLabel = (state.speed || 0) > ratedSpeed ? `${state.speed} kts !` : `${state.speed || 0} kts`;
  const aisId = ship.aisId || 'FULL_BROADCAST';
  const insId = ship.insuranceId || 'FULL_WAR_RISK';

  let html = `<div class="mobile-section-title">${ship.name} CONTROLS</div>`;
  html += `
    <div class="mobile-ctrl-row">
      <span class="mobile-ctrl-label">SPEED</span>
      <div class="mobile-speed-control">
        <button class="btn btn-small" id="mobile-spd-down">-</button>
        <span class="mobile-speed-value" id="mobile-spd-val">${spdLabel}</span>
        <button class="btn btn-small" id="mobile-spd-up">+</button>
      </div>
    </div>
    <div class="mobile-ctrl-row">
      <span class="mobile-ctrl-label">AIS</span>
      <div class="mobile-ctrl-buttons">
        <button class="btn btn-small mobile-ais ${aisId === 'FULL_BROADCAST' ? 'btn-primary' : 'btn-secondary'}" data-ais="FULL_BROADCAST">FULL</button>
        <button class="btn btn-small mobile-ais ${aisId === 'REDUCED' ? 'btn-primary' : 'btn-secondary'}" data-ais="REDUCED">RED</button>
        <button class="btn btn-small mobile-ais ${aisId === 'DARK' ? 'btn-primary' : 'btn-secondary'}" data-ais="DARK">DARK</button>
      </div>
    </div>
    <div class="mobile-ctrl-row">
      <span class="mobile-ctrl-label">INSURANCE</span>
      <div class="mobile-ctrl-buttons">
        <button class="btn btn-small mobile-ins ${insId === 'FULL_WAR_RISK' ? 'btn-primary' : 'btn-secondary'}" data-ins="FULL_WAR_RISK">WAR</button>
        <button class="btn btn-small mobile-ins ${insId === 'STANDARD_MARINE' ? 'btn-primary' : 'btn-secondary'}" data-ins="STANDARD">STD</button>
        <button class="btn btn-small mobile-ins ${insId === 'NONE' ? 'btn-primary' : 'btn-secondary'}" data-ins="NONE">NONE</button>
      </div>
    </div>`;


  // Upgrades section
  const me = getMe();
  const cash = me?.cash || 0;
  const dmg = state.totalDamage || 0;
  const repairCost = dmg > 0 ? Math.round((ship.cost || 0) * dmg * 0.3) : 0;
  const apState = shipAutopilot[ship.id];
  const apActive = apState && apState.active;

  html += `<div class="mobile-section-title" style="margin-top:8px;">UPGRADES</div>`;
  html += `<div class="mobile-upgrade-grid">`;

  // Repair
  if (dmg > 0) {
    html += `<button class="btn btn-small btn-upgrade mobile-upgrade" data-upgrade="repair" ${cash < repairCost ? 'disabled' : ''}>REPAIR ${formatMoney(repairCost)}</button>`;
  } else {
    html += `<button class="btn btn-small btn-upgrade mobile-upgrade" disabled>REPAIR (OK)</button>`;
  }

  // Engine
  if (ship.engineUpgrade) {
    html += `<button class="btn btn-small btn-upgrade owned mobile-upgrade" disabled>ENGINE UPGRADED</button>`;
  } else {
    html += `<button class="btn btn-small btn-upgrade mobile-upgrade" data-upgrade="engine" ${cash < 25000000 ? 'disabled' : ''}>ENGINE +4kts ${formatMoney(25000000)}</button>`;
  }

  // Defense
  if (ship.defenseUpgrade) {
    html += `<button class="btn btn-small btn-upgrade owned mobile-upgrade" disabled>DEFENSE UPGRADED</button>`;
  } else {
    html += `<button class="btn btn-small btn-upgrade mobile-upgrade" data-upgrade="defense" ${cash < 20000000 ? 'disabled' : ''}>DEFENSE ${formatMoney(20000000)}</button>`;
  }

  // Autopilot
  if (apActive) {
    html += `<button class="btn btn-small btn-upgrade owned mobile-upgrade" data-upgrade="autopilot">AUTOPILOT ON</button>`;
  } else if (ship.hasAutopilot) {
    html += `<button class="btn btn-small btn-upgrade mobile-upgrade" data-upgrade="autopilot">AUTOPILOT OFF</button>`;
  } else {
    html += `<button class="btn btn-small btn-upgrade mobile-upgrade" data-upgrade="autopilot" ${cash < 5000000 ? 'disabled' : ''}>AUTOPILOT ${formatMoney(5000000)}</button>`;
  }
  html += `</div>`;

  // Autopilot route selectors (if owned)
  if (ship.hasAutopilot || apActive) {
    const cargoType = ship.cargoType || 'oil';
    const isLng = cargoType === 'lng';
    const exports = Object.values(EXPORT_TERMINALS).filter(t => (t.cargoType || 'oil') === cargoType);
    const imports = Object.values(IMPORT_TERMINALS);

    html += `<div class="mobile-ctrl-row" style="margin-top:6px;">
      <span class="mobile-ctrl-label">AP LOAD AT</span>
      <select id="mobile-ap-terminal" class="mobile-select">`;
    for (const t of exports) {
      const sel = (apState?.terminal?.id === t.id) ? 'selected' : '';
      html += `<option value="${t.id}" ${sel}>${t.name} — $${getLivePrice(t)}/${isLng ? 'MMBtu' : 'bbl'}</option>`;
    }
    html += `</select></div>`;
    html += `<div class="mobile-ctrl-row">
      <span class="mobile-ctrl-label">AP DROP AT</span>
      <select id="mobile-ap-dropoff" class="mobile-select">`;
    for (const t of imports) {
      const sel = (apState?.dropoff?.id === t.id) ? 'selected' : '';
      const price = isLng ? (t.lngSellPrice || t.sellPrice || '?') : getLivePrice(t);
      html += `<option value="${t.id}" ${sel}>${t.name} — $${price}/${isLng ? 'MMBtu' : 'bbl'}</option>`;
    }
    html += `</select></div>`;
  }

  html += `<div id="mobile-upgrade-info" class="scp-upgrade-info" style="margin-top:6px;"></div>`;
  container.innerHTML = html;

  // Speed controls
  document.getElementById('mobile-spd-down')?.addEventListener('click', () => {
    if (state.destroyed || state.seized) return;
    state.speed = Math.max(0, Math.round(state.speed || 0) - 1);
    sendSpeedToServer(ship.id, state.speed);
    const el = document.getElementById('mobile-spd-val');
    if (el) el.textContent = `${state.speed} kts`;
    document.getElementById('scp-speed-value').textContent = `${state.speed} kts`;
  });
  document.getElementById('mobile-spd-up')?.addEventListener('click', () => {
    if (state.destroyed || state.seized) return;
    const maxSpd = ratedSpeed + 4;
    state.speed = Math.min(maxSpd, Math.round(state.speed || 0) + 1);
    sendSpeedToServer(ship.id, state.speed);
    const el = document.getElementById('mobile-spd-val');
    if (el) el.textContent = state.speed > ratedSpeed ? `${state.speed} kts !` : `${state.speed} kts`;
    document.getElementById('scp-speed-value').textContent = `${state.speed} kts`;
  });

  // AIS
  container.querySelectorAll('.mobile-ais').forEach(btn => {
    btn.addEventListener('click', () => {
      const aisKey = btn.dataset.ais;
      const aisOpt = options?.aisOptions?.[aisKey];
      if (!aisOpt) return;
      ship.aisId = aisKey; ship.aisName = aisOpt.name;
      addTransitEvent('AIS CHANGE', `Transponder set to: ${aisOpt.name}`, '');
      renderMobileControls(container);
    });
  });

  // Insurance
  container.querySelectorAll('.mobile-ins').forEach(btn => {
    btn.addEventListener('click', () => {
      const insKey = btn.dataset.ins;
      const insOpt = options?.insuranceOptions?.[insKey];
      if (!insOpt) return;
      ship.insuranceId = insKey; ship.insuranceName = insOpt.name;
      addTransitEvent('INSURANCE CHANGE', `Insurance set to: ${insOpt.name}`, '');
      renderMobileControls(container);
    });
  });

  // Upgrades
  container.querySelectorAll('.mobile-upgrade').forEach(btn => {
    btn.addEventListener('click', () => {
      const type = btn.dataset.upgrade;
      if (!type || !selectedShipId) return;
      const infoEl = document.getElementById('mobile-upgrade-info');
      const sid = selectedShipId;

      if (type === 'repair') {
        const _st = shipStates[sid];
        if (!_st || _st.destroyed || _st.seized) return;
        const _health = Math.max(0.01, (_st.health || 1) - (_st.totalDamage || 0));
        socket.emit('upgrade_ship', { shipId: sid, type: 'repair', health: _health }, (res) => {
          if (res?.success) {
            const st = shipStates[sid];
            if (st) {
              st.totalDamage = 0;
              const shipData = getSelectedShipData();
              if (shipData) st.speed = shipData.speed || st.speed;
            }
            addTransitEvent('SHIP REPAIRED', `Ship fully repaired.`, 'success');
            updateFleetPanel();
            renderMobileControls(container);
          } else if (infoEl) infoEl.textContent = 'Repair failed.';
        });
      } else if (type === 'engine') {
        socket.emit('upgrade_ship', { shipId: sid, type: 'engine' }, (res) => {
          if (res?.success) {
            const fresh = getSelectedShipData();
            if (fresh && !fresh.engineUpgrade) { fresh.engineUpgrade = 1; fresh.speed = (fresh.speed || 14) + 4; }
            addTransitEvent('ENGINE UPGRADE', `Engine upgraded! +4 kts`, 'success');
            updateFleetPanel();
            renderMobileControls(container);
          } else if (infoEl) infoEl.textContent = 'Upgrade failed.';
        });
      } else if (type === 'defense') {
        socket.emit('upgrade_ship', { shipId: sid, type: 'defense' }, (res) => {
          if (res?.success) {
            const fresh = getSelectedShipData();
            if (fresh) fresh.defenseUpgrade = 1;
            addTransitEvent('DEFENSE UPGRADE', `Armed guards & hull armor installed!`, 'success');
            updateFleetPanel();
            renderMobileControls(container);
          } else if (infoEl) infoEl.textContent = 'Upgrade failed.';
        });
      } else if (type === 'autopilot') {
        // Re-read ship data at click time (not stale closure)
        const currentShip = getSelectedShipData();
        const currentState = shipStates[sid];
        if (!currentShip || !currentState) return;
        if (currentState.destroyed || currentState.seized) return;
        const apSt = shipAutopilot[sid];
        if (apSt && apSt.active) {
          // Toggle off
          apSt.active = false;
          shipWaypoints[sid] = [];
          currentState.speed = 0;
          currentState.apCoastEscapeTimer = 0;
          sendAutopilotToServer(sid);
          sendWaypointsToServer(sid);
          sendSpeedToServer(sid, 0);
          addTransitEvent('AUTOPILOT OFF', `${currentShip.name}: Autopilot disengaged.`, '');
          updateFleetPanel();
          renderMobileControls(container);
        } else if (currentShip.hasAutopilot) {
          // Engage autopilot with selected terminals
          const termSel = document.getElementById('mobile-ap-terminal');
          const dropSel = document.getElementById('mobile-ap-dropoff');
          const terminal = getTerminalById(termSel?.value);
          const dropoff = getDropoffById(dropSel?.value) || DROPOFF_POINT;
          if (terminal) {
            shipAutopilot[sid] = { active: true, terminal, dropoff };
            currentState.apCoastEscapeTimer = 0;
            currentState.apCoastEscapeHeading = 0;
            shipWaypoints[sid] = [];
            sendAutopilotToServer(sid);
            sendWaypointsToServer(sid);
            addTransitEvent('AUTOPILOT ON', `${currentShip.name}: ${terminal.name} → ${dropoff.name}`, 'success');
            updateFleetPanel();
            renderMobileControls(container);
          }
        } else {
          // Buy autopilot
          socket.emit('upgrade_ship', { shipId: sid, type: 'autopilot' }, (res) => {
            if (res?.success) {
              const fresh = getSelectedShipData();
              if (fresh) fresh.hasAutopilot = true;
              addTransitEvent('AUTOPILOT INSTALLED', `Autopilot system installed.`, 'success');
              updateFleetPanel();
              renderMobileControls(container);
            } else if (infoEl) infoEl.textContent = 'Upgrade failed.';
          });
        }
      }
    });
  });
  } catch (e) { console.error('renderMobileControls error:', e); }
}

function renderMobileLog(container) {
  if (mobileEventLog.length === 0) {
    container.innerHTML = '<div class="muted">No events yet</div>';
    return;
  }
  let html = '<div class="mobile-section-title">EVENT LOG</div>';
  for (let i = mobileEventLog.length - 1; i >= 0; i--) {
    const ev = mobileEventLog[i];
    html += `<div class="mobile-event-item ${ev.type || ''}">
      <div class="mobile-event-name">${ev.name}</div>
      <div class="mobile-event-outcome">${ev.text}</div>
    </div>`;
  }
  container.innerHTML = html;
}

let mobileSettingsView = 'menu'; // 'menu', 'visual', 'leaderboard'

function renderMobileSettings(container) {
  if (mobileSettingsView === 'leaderboard') {
    renderMobileLeaderboard(container);
    return;
  }
  if (mobileSettingsView === 'visual') {
    renderMobileVisual(container);
    return;
  }

  // Main settings menu
  let html = '<div class="mobile-section-title">SETTINGS</div>';
  html += `<div style="display:flex;flex-direction:column;gap:6px;margin-bottom:12px;">
    <button class="btn btn-secondary mobile-settings-nav" data-view="leaderboard">LEADERBOARD</button>
    <button class="btn btn-secondary mobile-settings-nav" data-view="visual">VISUAL OPTIONS</button>
    <button class="btn btn-ghost mobile-settings-logout">LOGOUT</button>
  </div>`;


  container.innerHTML = html;

  container.querySelectorAll('.mobile-settings-nav').forEach(btn => {
    btn.addEventListener('click', () => {
      mobileSettingsView = btn.dataset.view;
      renderMobileSettings(container);
    });
  });

  container.querySelector('.mobile-settings-logout')?.addEventListener('click', () => {
    logout();
    showScreen('title');
    transitActive = false;
  });

}

function renderMobileVisual(container) {
  let html = `<button class="btn btn-ghost btn-small mobile-settings-back" style="margin-bottom:8px;">&larr; BACK</button>`;
  html += '<div class="mobile-section-title">MAP LABELS</div>';
  const labels = [
    { key: 'cityNames', label: 'City names', elId: 'toggle-city-names' },
    { key: 'countryNames', label: 'Country names', elId: 'toggle-country-names' },
    { key: 'baseNames', label: 'Military installations', elId: 'toggle-base-names' },
    { key: 'terminalNames', label: 'Terminal names', elId: 'toggle-terminal-names' },
    { key: 'waterLabels', label: 'Water body labels', elId: 'toggle-water-labels' },
  ];
  for (const l of labels) {
    html += `<div class="mobile-settings-row">
      <input type="checkbox" class="mobile-label-toggle" data-key="${l.key}" ${mapLabelSettings[l.key] ? 'checked' : ''}>
      <span>${l.label}</span>
    </div>`;
  }
  container.innerHTML = html;

  container.querySelector('.mobile-settings-back')?.addEventListener('click', () => {
    mobileSettingsView = 'menu';
    renderMobileSettings(container);
  });

  container.querySelectorAll('.mobile-label-toggle').forEach(cb => {
    cb.addEventListener('change', (e) => {
      const key = cb.dataset.key;
      mapLabelSettings[key] = e.target.checked;
      const desktopCb = document.getElementById(labels.find(l => l.key === key)?.elId);
      if (desktopCb) desktopCb.checked = e.target.checked;
    });
  });
}

function renderMobileLeaderboard(container) {
  let html = `<button class="btn btn-ghost btn-small mobile-settings-back" style="margin-bottom:8px;">&larr; BACK</button>`;
  html += '<div class="mobile-section-title">LEADERBOARD</div>';
  html += `<div class="mobile-ctrl-buttons" style="margin-bottom:8px;">
    <button class="btn btn-small mobile-lb-tab ${leaderboardPeriod === 'week' ? 'btn-primary' : 'btn-secondary'}" data-period="week">1W</button>
    <button class="btn btn-small mobile-lb-tab ${leaderboardPeriod === 'month' ? 'btn-primary' : 'btn-secondary'}" data-period="month">1M</button>
    <button class="btn btn-small mobile-lb-tab ${leaderboardPeriod === 'year' ? 'btn-primary' : 'btn-secondary'}" data-period="year">1Y</button>
    <button class="btn btn-small mobile-lb-tab ${leaderboardPeriod === 'all' ? 'btn-primary' : 'btn-secondary'}" data-period="all">ALL</button>
  </div>`;
  html += `<div id="mobile-lb-list" style="font-size:11px;"><div class="muted">Loading...</div></div>`;
  container.innerHTML = html;

  container.querySelector('.mobile-settings-back')?.addEventListener('click', () => {
    mobileSettingsView = 'menu';
    renderMobileSettings(container);
  });

  container.querySelectorAll('.mobile-lb-tab').forEach(tab => {
    tab.addEventListener('click', () => {
      leaderboardPeriod = tab.dataset.period;
      renderMobileLeaderboard(container);
    });
  });

  // Fetch leaderboard data
  const url = leaderboardPeriod === 'all' ? '/api/leaderboard' : `/api/leaderboard?period=${leaderboardPeriod}`;
  fetch(url).then(r => r.json()).then(rows => {
    const listEl = container.querySelector('#mobile-lb-list');
    if (!listEl) return;
    if (rows.length === 0) { listEl.innerHTML = '<div class="muted">No data yet.</div>'; return; }
    listEl.innerHTML = rows.map((r, i) => {
      const profit = r.period_profit != null ? r.period_profit : r.total_profit;
      return `<div class="settings-lb-row">
        <span class="settings-lb-rank">#${i + 1}</span>
        <span class="settings-lb-name">${escapeHtml(r.username)}</span>
        <span class="settings-lb-profit">${formatMoney(profit)}</span>
      </div>`;
    }).join('');
  }).catch(() => {
    const listEl = container.querySelector('#mobile-lb-list');
    if (listEl) listEl.innerHTML = '<div class="muted">Failed to load.</div>';
  });
}

// ============================================
// CLEAR WAYPOINTS
// ============================================
const clearWpBtn = document.getElementById('btn-clear-waypoints');
clearWpBtn.addEventListener('click', () => {
  if (selectedShipId) {
    shipWaypoints[selectedShipId] = [];
    if (shipStates[selectedShipId]) shipStates[selectedShipId].speed = 0;
    sendWaypointsToServer(selectedShipId);
    sendSpeedToServer(selectedShipId, 0);
  }
  updateClearWpButton();
});

function updateClearWpButton() {
  const wps = selectedShipId ? (shipWaypoints[selectedShipId] || []) : [];
  clearWpBtn.classList.toggle('hidden', wps.length === 0);
}

// ============================================
// SHIP CONTROL PANEL
// ============================================
let shipControlOpen = false;

function getSelectedShipData() {
  if (!gameState || !selectedShipId) return null;
  const me = getMe();
  return me?.fleet.find(s => s.id === selectedShipId) || null;
}

function openShipControlPanel() {
  try {
  if (!selectedShipId || !shipStates[selectedShipId]) return;
  const panel = document.getElementById('ship-control-panel');
  panel.classList.remove('hidden');
  shipControlOpen = true;
  const state = shipStates[selectedShipId];
  document.getElementById('scp-speed-value').textContent = `${state.speed} kts`;
  const ship = getSelectedShipData();
  const currentAisId = ship?.aisId || 'FULL_BROADCAST';
  document.querySelectorAll('.scp-ais-btn').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.ais === currentAisId);
  });
  refreshUpgradeButtons();
  } catch (e) { console.error('openShipControlPanel error:', e); }
}

function closeShipControlPanel() {
  document.getElementById('ship-control-panel').classList.add('hidden');
  shipControlOpen = false;
}

document.getElementById('scp-close').addEventListener('click', closeShipControlPanel);

document.getElementById('scp-speed-down').addEventListener('click', () => {
  if (!selectedShipId || !shipStates[selectedShipId]) return;
  const state = shipStates[selectedShipId];
  if (state.destroyed || state.seized) return;
  state.speed = Math.max(0, Math.round(state.speed || 0) - 1);
  sendSpeedToServer(selectedShipId, state.speed);
  document.getElementById('scp-speed-value').textContent = `${state.speed} kts`;
});

document.getElementById('scp-speed-up').addEventListener('click', () => {
  if (!selectedShipId || !shipStates[selectedShipId]) return;
  const ship = getSelectedShipData();
  const state = shipStates[selectedShipId];
  if (state.destroyed || state.seized) return;
  const ratedSpeed = ship?.speed || 16;
  const maxSpeed = ratedSpeed + 4;
  state.speed = Math.min(maxSpeed, Math.round(state.speed || 0) + 1);
  sendSpeedToServer(selectedShipId, state.speed);
  const label = state.speed > ratedSpeed ? `${state.speed} kts ⚠` : `${state.speed} kts`;
  document.getElementById('scp-speed-value').textContent = label;
});

document.querySelectorAll('.scp-ais-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    if (!selectedShipId || !options?.aisOptions) return;
    const aisKey = btn.dataset.ais;
    if (!aisKey) return;
    const aisOpt = options.aisOptions[aisKey];
    if (!aisOpt) return;
    const ship = getSelectedShipData();
    if (!ship) return;
    ship.aisId = aisKey; ship.aisName = aisOpt.name;
    document.querySelectorAll('.scp-ais-btn').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    addTransitEvent('AIS CHANGE', `Transponder set to: ${aisOpt.name}`, '');
  });
});

// Insurance buttons
document.querySelectorAll('.scp-ins-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    if (!selectedShipId || !options?.insuranceOptions) return;
    const insKey = btn.dataset.ins;
    if (!insKey) return;
    const insOpt = options.insuranceOptions[insKey];
    if (!insOpt) return;
    const ship = getSelectedShipData();
    if (!ship) return;
    ship.insuranceId = insKey; ship.insuranceName = insOpt.name;
    document.querySelectorAll('.scp-ins-btn').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    addTransitEvent('INSURANCE CHANGE', `Insurance set to: ${insOpt.name} (weekly)`, '');
  });
});

// Auto-renew toggle
document.getElementById('scp-autorenew-cb').addEventListener('change', (e) => {
  const ship = getSelectedShipData();
  if (ship) {
    ship.autoRenewInsurance = e.target.checked;
    addTransitEvent('INSURANCE', `Auto-renew ${e.target.checked ? 'enabled' : 'disabled'}`, '');
  }
});

// Upgrade: Repair
document.getElementById('scp-repair').addEventListener('click', () => {
  if (!selectedShipId) return;
  const state = shipStates[selectedShipId];
  const ship = getSelectedShipData();
  if (!state || !ship) return;
  if (state.destroyed || state.seized) return;
  if (!state.totalDamage || state.totalDamage <= 0) {
    document.getElementById('scp-upgrade-info').textContent = 'Ship is at full health.';
    return;
  }
  const repairCost = Math.round((ship.cost || 0) * state.totalDamage * 0.3);
  if (repairCost <= 0) return;
  const me = getMe();
  if (!me || me.cash < repairCost) {
    document.getElementById('scp-upgrade-info').textContent = `Need ${formatMoney(repairCost)} to repair.`;
    return;
  }
  const sid = selectedShipId;
  const currentHealth = Math.max(0.01, (state.health || 1) - state.totalDamage);
  socket.emit('upgrade_ship', { shipId: sid, type: 'repair', health: currentHealth }, (res) => {
    if (res?.success) {
      const st = shipStates[sid];
      if (st) {
        st.totalDamage = 0;
        const s2 = getShipData(sid);
        if (s2) st.speed = s2.speed || st.speed;
      }
      addTransitEvent('SHIP REPAIRED', `Ship fully repaired for ${formatMoney(repairCost)}.`, 'success');
      updateFleetPanel();
      refreshUpgradeButtons();
    }
  });
});

// Upgrade: Engine
document.getElementById('scp-engine').addEventListener('click', () => {
  if (!selectedShipId) return;
  const ship = getSelectedShipData();
  if (!ship) return;
  if (ship.engineUpgrade) {
    document.getElementById('scp-upgrade-info').textContent = 'Engine already upgraded.';
    return;
  }
  const cost = 25000000;
  const me = getMe();
  if (!me || me.cash < cost) {
    document.getElementById('scp-upgrade-info').textContent = `Need ${formatMoney(cost)} for engine upgrade.`;
    return;
  }
  const sid = selectedShipId;
  socket.emit('upgrade_ship', { shipId: sid, type: 'engine', cost }, (res) => {
    if (res?.success) {
      const fresh = getSelectedShipData();
      if (fresh && !fresh.engineUpgrade) { fresh.engineUpgrade = 1; fresh.speed = (fresh.speed || 14) + 4; }
      addTransitEvent('ENGINE UPGRADE', `Engine upgraded! +4 kts`, 'success');
      updateFleetPanel();
      refreshUpgradeButtons();
    }
  });
});

// Upgrade: Defense
const DEFENSE_COST = 20000000;
document.getElementById('scp-defense').addEventListener('click', () => {
  if (!selectedShipId) return;
  const ship = getSelectedShipData();
  if (!ship) return;
  if (ship.defenseUpgrade) {
    document.getElementById('scp-upgrade-info').textContent = 'Defense already upgraded.';
    return;
  }
  const me = getMe();
  if (!me || me.cash < DEFENSE_COST) {
    document.getElementById('scp-upgrade-info').textContent = `Need ${formatMoney(DEFENSE_COST)} for defense.`;
    return;
  }
  const sid = selectedShipId;
  socket.emit('upgrade_ship', { shipId: sid, type: 'defense', cost: DEFENSE_COST }, (res) => {
    if (res?.success) {
      const fresh = getSelectedShipData();
      if (fresh) fresh.defenseUpgrade = 1;
      addTransitEvent('DEFENSE UPGRADE', `Armed guards & hull armor installed!`, 'success');
      updateFleetPanel();
      refreshUpgradeButtons();
    }
  });
});

// Upgrade: Autopilot
function populateApTerminalSelect(ship) {
  const sel = document.getElementById('scp-ap-terminal');
  sel.innerHTML = '';
  const cargoType = ship.cargoType || 'oil';
  const isLng = cargoType === 'lng';
  // Export terminals (load cargo) — filter by cargo type
  const exports = Object.values(EXPORT_TERMINALS).filter(t => (t.cargoType || 'oil') === cargoType);
  // Group by region
  const byRegion = {};
  for (const t of exports) {
    const region = t.region || 'other';
    if (!byRegion[region]) byRegion[region] = [];
    byRegion[region].push(t);
  }
  for (const [region, terminals] of Object.entries(byRegion)) {
    const grp = document.createElement('optgroup');
    grp.label = TERMINAL_REGIONS[region] || region;
    for (const t of terminals) {
      const opt = document.createElement('option');
      opt.value = t.id;
      opt.textContent = `${t.name} — Buy $${getLivePrice(t)}/${isLng ? 'MMBtu' : 'bbl'}`;
      grp.appendChild(opt);
    }
    sel.appendChild(grp);
  }
  const ap = shipAutopilot[ship.id];
  if (ap && ap.terminal) sel.value = ap.terminal.id;

  // Import terminals (sell cargo)
  const dropSel = document.getElementById('scp-ap-dropoff');
  dropSel.innerHTML = '';
  const imports = Object.values(IMPORT_TERMINALS);
  const impByRegion = {};
  for (const t of imports) {
    const region = t.region || 'other';
    if (!impByRegion[region]) impByRegion[region] = [];
    impByRegion[region].push(t);
  }
  for (const [region, terminals] of Object.entries(impByRegion)) {
    const grp = document.createElement('optgroup');
    grp.label = TERMINAL_REGIONS[region] || region;
    for (const t of terminals) {
      const opt = document.createElement('option');
      opt.value = t.id;
      const price = isLng ? (t.lngSellPrice || t.sellPrice || '?') : getLivePrice(t);
      opt.textContent = `${t.name} — Sell $${price}/${isLng ? 'MMBtu' : 'bbl'}`;
      grp.appendChild(opt);
    }
    dropSel.appendChild(grp);
  }
  if (ap && ap.dropoff) dropSel.value = ap.dropoff.id;
}

function getTerminalById(id) {
  return Object.values(OIL_TERMINALS).find(t => t.id === id);
}

function getDropoffById(id) {
  return Object.values(IMPORT_TERMINALS).find(d => d.id === id);
}

function engageAutopilot(ship) {
  const sel = document.getElementById('scp-ap-terminal');
  const terminal = getTerminalById(sel.value);
  if (!terminal) return;
  const dropSel = document.getElementById('scp-ap-dropoff');
  const dropoff = getDropoffById(dropSel.value) || DROPOFF_POINT;
  shipAutopilot[ship.id] = { active: true, terminal, dropoff };
  // Reset escape state and clear old waypoints so it re-routes
  const state = shipStates[ship.id];
  if (state) { state.apCoastEscapeTimer = 0; state.apCoastEscapeHeading = 0; }
  shipWaypoints[ship.id] = [];
  sendAutopilotToServer(ship.id);
  sendWaypointsToServer(ship.id);
  addTransitEvent('AUTOPILOT ON', `${ship.name}: ${terminal.name} → ${dropoff.name}`, 'success');
  refreshUpgradeButtons();
}

document.getElementById('scp-autopilot').addEventListener('click', () => {
  if (!selectedShipId) return;
  const ship = getSelectedShipData();
  const state = shipStates[selectedShipId];
  if (!ship || !state) return;
  if (state.destroyed || state.seized) return;

  const ap = shipAutopilot[ship.id];
  if (ap && ap.active) {
    // Toggle off — stop ship and clear waypoints
    ap.active = false;
    shipWaypoints[ship.id] = [];
    const st = shipStates[ship.id];
    if (st) { st.speed = 0; st.apCoastEscapeTimer = 0; }
    sendAutopilotToServer(ship.id);
    sendWaypointsToServer(ship.id);
    sendSpeedToServer(ship.id, 0);
    addTransitEvent('AUTOPILOT OFF', `${ship.name}: Autopilot disengaged.`, '');
    updateFleetPanel();
    refreshUpgradeButtons();
    return;
  }

  if (!ship.hasAutopilot) {
    const cost = 5000000;
    const me = getMe();
    if (!me || me.cash < cost) {
      document.getElementById('scp-upgrade-info').textContent = `Need ${formatMoney(cost)} for autopilot.`;
      return;
    }
    const sid = selectedShipId;
    socket.emit('upgrade_ship', { shipId: sid, type: 'autopilot', cost }, (res) => {
      if (res?.success) {
        const fresh = getSelectedShipData();
        if (!fresh) return;
        fresh.hasAutopilot = true;
        populateApTerminalSelect(fresh);
        engageAutopilot(fresh);
      }
    });
  } else {
    engageAutopilot(ship);
  }
});

// Shared reroute logic for autopilot destination changes
function autopilotReroute(ship) {
  if (!ship || !ship.id) return;
  const ap = shipAutopilot[ship.id];
  if (!ap || !ap.active) return;
  if (!ap.terminal || !ap.dropoff) return;
  const state = shipStates[ship.id];
  if (!state) return;
  state.apCoastEscapeTimer = 0;
  const cargo = shipCargo[ship.id];
  let dest;
  if (cargo && cargo.loaded) {
    dest = { lat: ap.dropoff.lat, lon: ap.dropoff.lon };
  } else {
    dest = { lat: ap.terminal.lat, lon: ap.terminal.lon };
  }
  if (dest.lat == null || dest.lon == null) return;
  const destTerminal = (cargo && cargo.loaded) ? ap.dropoff : ap.terminal;
  const route = computeAutopilotRoute(state.lat, state.lon, dest.lat, dest.lon, destTerminal?.loadRadius || 0.15);
  shipWaypoints[ship.id] = route;
  if (state.speed === 0) state.speed = Math.round(ship.speed || 14);
  if (route.length > 0) {
    state.targetHeading = headingToTarget(state.lat, state.lon, route[0].lat, route[0].lon);
  } else {
    state.targetHeading = headingToTarget(state.lat, state.lon, dest.lat, dest.lon);
  }
  addTransitEvent('AUTOPILOT REROUTE', `${ship.name}: ${ap.terminal.name} → ${ap.dropoff.name}`, 'success');
}

// Change autopilot load terminal while running
document.getElementById('scp-ap-terminal').addEventListener('change', () => {
  if (!selectedShipId) return;
  const ship = getSelectedShipData();
  if (!ship) return;
  const ap = shipAutopilot[ship.id];
  if (!ap || !ap.active) return;
  const terminal = getTerminalById(document.getElementById('scp-ap-terminal').value);
  if (!terminal) return;
  ap.terminal = terminal;
  autopilotReroute(ship);
});

// Change autopilot dropoff while running
document.getElementById('scp-ap-dropoff').addEventListener('change', () => {
  if (!selectedShipId) return;
  const ship = getSelectedShipData();
  if (!ship) return;
  const ap = shipAutopilot[ship.id];
  if (!ap || !ap.active) return;
  const dropoff = getDropoffById(document.getElementById('scp-ap-dropoff').value);
  if (!dropoff) return;
  ap.dropoff = dropoff;
  autopilotReroute(ship);
});

function refreshUpgradeButtons() {
  try {
  const ship = getSelectedShipData();
  const state = selectedShipId ? shipStates[selectedShipId] : null;
  if (!ship || !state) return;

  const me = getMe();
  const cash = me?.cash || 0;

  // Repair
  const repairBtn = document.getElementById('scp-repair');
  if (state.totalDamage <= 0) {
    repairBtn.textContent = 'REPAIR (OK)';
    repairBtn.disabled = true;
  } else {
    const repairCost = Math.round(ship.cost * state.totalDamage * 0.3);
    repairBtn.textContent = `REPAIR ${formatMoney(repairCost)}`;
    repairBtn.disabled = cash < repairCost;
  }

  // Engine
  const engineBtn = document.getElementById('scp-engine');
  if (ship.engineUpgrade) {
    engineBtn.textContent = 'ENGINE UPGRADED';
    engineBtn.classList.add('owned');
    engineBtn.disabled = true;
  } else {
    engineBtn.textContent = `ENGINE +4 kts ${formatMoney(25000000)}`;
    engineBtn.classList.remove('owned');
    engineBtn.disabled = cash < 25000000;
  }

  // Defense
  const defBtn = document.getElementById('scp-defense');
  if (ship.defenseUpgrade) {
    defBtn.textContent = 'DEFENSE UPGRADED';
    defBtn.classList.add('owned');
    defBtn.disabled = true;
  } else {
    defBtn.textContent = `DEFENSE ${formatMoney(DEFENSE_COST)}`;
    defBtn.classList.remove('owned');
    defBtn.disabled = cash < DEFENSE_COST;
  }

  // Autopilot
  const apBtn = document.getElementById('scp-autopilot');
  const apDest = document.getElementById('scp-ap-dest');
  const apState = shipAutopilot[ship.id];
  if (apState && apState.active) {
    apBtn.textContent = 'AUTOPILOT ON';
    apBtn.classList.add('owned');
    populateApTerminalSelect(ship);
    apDest.classList.remove('hidden');
  } else if (ship.hasAutopilot) {
    apBtn.textContent = 'AUTOPILOT OFF';
    apBtn.classList.remove('owned');
    populateApTerminalSelect(ship);
    apDest.classList.remove('hidden');
  } else {
    apBtn.textContent = `AUTOPILOT ${formatMoney(5000000)}`;
    apBtn.disabled = cash < 5000000;
    apDest.classList.add('hidden');
  }

  // Insurance
  const currentIns = ship.insuranceId || 'FULL_WAR_RISK';
  document.querySelectorAll('.scp-ins-btn').forEach(b => {
    b.classList.toggle('active', b.dataset.ins === currentIns);
  });
  document.getElementById('scp-autorenew-cb').checked = ship.autoRenewInsurance !== false;

  document.getElementById('scp-upgrade-info').textContent = '';
  } catch (e) { console.error('refreshUpgradeButtons error:', e); }
}

// ============================================
// FLEET MANAGER MODAL
// ============================================
function openFleetManager() {
  const me = getMe();
  if (!me || me.fleet.length === 0) return;
  closeShipControlPanel();
  document.getElementById('fleet-manager-modal').classList.remove('hidden');
  renderFleetManager();
}

function closeFleetManager() {
  document.getElementById('fleet-manager-modal').classList.add('hidden');
}

document.getElementById('fm-close').addEventListener('click', closeFleetManager);
document.getElementById('fleet-manager-modal').addEventListener('click', (e) => {
  if (e.target.id === 'fleet-manager-modal') closeFleetManager();
});
document.getElementById('btn-manage-all').addEventListener('click', openFleetManager);

// ============================================
// SITUATION MONITOR
// ============================================
function openSituationMonitor() {
  document.getElementById('situation-monitor-modal').classList.remove('hidden');
  renderSituationMonitor();
}
function closeSituationMonitor() {
  document.getElementById('situation-monitor-modal').classList.add('hidden');
}
document.getElementById('sitmon-close').addEventListener('click', closeSituationMonitor);
document.getElementById('situation-monitor-modal').addEventListener('click', (e) => {
  if (e.target.id === 'situation-monitor-modal') closeSituationMonitor();
});
document.getElementById('plan-risk').addEventListener('click', openSituationMonitor);

function renderSituationMonitor() {
  const container = document.getElementById('sitmon-body');
  const risk = RISK_LEVELS[gameState?.riskLevel] || RISK_LEVELS.LOW;
  const rl = gameState?.riskLevel || 'LOW';
  const levels = ['LOW', 'MODERATE', 'HIGH', 'CRITICAL'];
  const levelIdx = levels.indexOf(rl);

  // War zone definitions with dynamic intensity
  const warZones = [
    {
      name: 'PERSIAN GULF / STRAIT OF HORMUZ',
      region: 'gulf',
      belligerents: 'Iran (IRGC) vs US/Coalition',
      zones: DANGER_ZONES.filter(z => !z.region || z.region === 'gulf'),
      risks: ['Anti-ship missiles', 'Drone swarms', 'Mine fields', 'IRGC patrol boats', 'Ship seizure'],
      description: 'Active naval conflict zone. Iranian IRGC forces targeting commercial shipping through the Strait of Hormuz.',
    },
    {
      name: 'RED SEA / BAB EL-MANDEB',
      region: 'red_sea',
      belligerents: 'Ansar Allah (Houthi) vs Saudi/US Coalition',
      zones: DANGER_ZONES.filter(z => z.region === 'red_sea'),
      risks: ['Houthi anti-ship missiles', 'One-way attack drones', 'Pirate skiffs', 'Mine risk near Bab el-Mandeb'],
      description: 'Houthi forces launching anti-ship ballistic missiles and drones at commercial vessels transiting the Red Sea.',
    },
    {
      name: 'GULF OF ADEN / SOMALIA',
      region: 'somalia',
      belligerents: 'Somali pirate networks',
      zones: DANGER_ZONES.filter(z => z.region === 'somalia'),
      risks: ['Armed pirate boarding', 'Ransom demands', 'Crew hostage situations'],
      description: 'Persistent piracy threat. Armed groups in fast skiffs targeting slow-moving tankers.',
    },
    {
      name: 'MALACCA & SINGAPORE STRAITS',
      region: 'malacca',
      belligerents: 'Criminal pirate groups',
      zones: DANGER_ZONES.filter(z => z.region === 'malacca' || z.region === 'singapore'),
      risks: ['Piracy', 'Robbery at anchor', 'Opportunistic boarding'],
      description: 'Low-level piracy and armed robbery, primarily targeting vessels at anchor or slow speed.',
    },
    {
      name: 'GULF OF GUINEA',
      region: 'guinea',
      belligerents: 'Nigerian pirate syndicates',
      zones: DANGER_ZONES.filter(z => z.region === 'guinea'),
      risks: ['Armed robbery', 'Kidnap for ransom', 'Hijacking'],
      description: 'Most violent piracy region globally. Well-armed groups known for crew kidnapping.',
    },
    {
      name: 'SOUTH CHINA SEA',
      region: 'south_china_sea',
      belligerents: 'PRC Navy / Coast Guard vs regional claimants',
      zones: DANGER_ZONES.filter(z => z.region === 'south_china_sea'),
      risks: ['Naval patrols', 'Missile systems', 'Drone surveillance', 'Submarine activity'],
      description: 'Heavily militarized disputed waters. Chinese naval forces assert territorial claims across the region.',
    },
    {
      name: 'PANAMA CANAL',
      region: 'panama',
      belligerents: 'Criminal groups / congestion risk',
      zones: DANGER_ZONES.filter(z => z.region === 'panama'),
      risks: ['Transit delays', 'Piracy', 'Collision risk'],
      description: 'Critical Atlantic-Pacific link. Drought-related draft restrictions and congestion create delays and vulnerability.',
    },
    {
      name: 'GULF OF MEXICO',
      region: 'gulf_mexico',
      belligerents: 'Cartel-linked piracy / weather',
      zones: DANGER_ZONES.filter(z => z.region === 'gulf_mexico'),
      risks: ['Piracy', 'Severe weather', 'Collision risk'],
      description: 'Major oil production region. Seasonal hurricane risk and sporadic piracy near Mexican waters.',
    },
    {
      name: 'CAPE HORN',
      region: 'cape_horn',
      belligerents: 'Extreme weather',
      zones: DANGER_ZONES.filter(z => z.region === 'cape_horn'),
      risks: ['Extreme seas', 'High winds', 'Icebergs'],
      description: 'Notorious for extreme weather. Alternative route when Suez/Panama are disrupted. High natural hazard risk.',
    },
  ];

  let html = '';

  // --- Threat Dial + Stats Header ---
  const dialColors = ['#40c070', '#f0a030', '#e04040', '#800000'];
  const dialColor = dialColors[levelIdx] || dialColors[0];
  const dialAngle = -90 + (levelIdx / 3) * 180;
  const dialRad = dialAngle * Math.PI / 180;

  const recentAttacks = campaignStats.attackLog.filter(a => Date.now() - a.time < 24 * 60 * 1000);
  const totalAttacks = campaignStats.attackLog.length;

  html += `<div class="sitmon-zone" style="border-color:${dialColor};">
    <div style="display:flex;align-items:center;gap:20px;flex-wrap:wrap;">
      <div class="sitmon-dial-container">
        <svg width="140" height="85" viewBox="0 0 140 85">
          <path d="M 15 75 A 55 55 0 0 1 50 22" stroke="#40c070" stroke-width="8" fill="none" stroke-linecap="round"/>
          <path d="M 50 22 A 55 55 0 0 1 90 22" stroke="#f0a030" stroke-width="8" fill="none" stroke-linecap="round"/>
          <path d="M 90 22 A 55 55 0 0 1 125 75" stroke="#e04040" stroke-width="8" fill="none" stroke-linecap="round"/>
          <line x1="70" y1="75" x2="${70 + Math.cos(dialRad) * 45}" y2="${75 + Math.sin(dialRad) * 45}" stroke="${dialColor}" stroke-width="3" stroke-linecap="round"/>
          <circle cx="70" cy="75" r="5" fill="${dialColor}"/>
          <text x="70" y="12" text-anchor="middle" fill="${dialColor}" font-family="Courier New" font-size="11" font-weight="bold">${risk.name.toUpperCase()}</text>
        </svg>
      </div>
      <div style="flex:1;min-width:200px;">
        <div class="sitmon-stats-grid">
          <div class="sitmon-stat-card">
            <div class="sitmon-stat-number sitmon-stat-bad">${campaignStats.missileEvents || 0}</div>
            <div class="sitmon-stat-label">MISSILE STRIKES</div>
          </div>
          <div class="sitmon-stat-card">
            <div class="sitmon-stat-number sitmon-stat-warn">${recentAttacks.length}</div>
            <div class="sitmon-stat-label">RECENT ATTACKS</div>
          </div>
          <div class="sitmon-stat-card">
            <div class="sitmon-stat-number" style="color:var(--info);">${campaignStats.deliveries || 0}</div>
            <div class="sitmon-stat-label">DELIVERIES</div>
          </div>
          <div class="sitmon-stat-card">
            <div class="sitmon-stat-number" style="color:${(campaignStats.totalDamageTaken || 0) > 0.3 ? 'var(--danger)' : 'var(--success)'};">${Math.round((campaignStats.totalDamageTaken || 0) * 100)}%</div>
            <div class="sitmon-stat-label">FLEET DAMAGE</div>
          </div>
        </div>
        <div class="sitmon-zone-details" style="margin-top:4px;">
          <div class="sitmon-row"><span class="sitmon-row-label">Event Frequency</span><span class="sitmon-row-value ${risk.eventFrequency > 0.3 ? 'sitmon-stat-bad' : risk.eventFrequency > 0.1 ? 'sitmon-stat-warn' : 'sitmon-stat-ok'}">${(risk.eventFrequency * 100).toFixed(0)}%</span></div>
        </div>
      </div>
    </div>
  </div>`;

  // --- Two-column layout: Regions + Attack Log ---
  html += `<div class="sitmon-columns">`;

  // LEFT COLUMN: Conflict zones + fleet exposure
  html += `<div>`;
  html += `<div class="sitmon-section-title">CONFLICT ZONES</div>`;

  for (const wz of warZones) {
    const ri = campaignStats.regionIntensity[wz.region];
    const threat = ri ? ri.levelName : 'LOW';
    const threatClass = threat === 'CRITICAL' || threat === 'HIGH' ? 'high' : threat === 'MODERATE' ? 'moderate' : 'low';
    const zoneCount = wz.zones.length;
    const timeSinceChange = ri ? Math.round((Date.now() - ri.lastChange) / 1000) : 0;
    const changeAgo = timeSinceChange < 60 ? `${timeSinceChange}s ago` : `${Math.round(timeSinceChange / 60)}m ago`;

    html += `<div class="sitmon-zone">
      <div class="sitmon-zone-header">
        <span class="sitmon-zone-name">${wz.name}</span>
        <span class="sitmon-zone-threat sitmon-threat-${threatClass}">${threat}</span>
      </div>
      <div class="sitmon-zone-details">
        <div class="sitmon-row"><span class="sitmon-row-label">Belligerents</span><span class="sitmon-row-value">${wz.belligerents}</span></div>
        <div class="sitmon-row"><span class="sitmon-row-label">Active Zones</span><span class="sitmon-row-value">${zoneCount}</span></div>
        <div class="sitmon-row"><span class="sitmon-row-label">Last Change</span><span class="sitmon-row-value">${changeAgo}</span></div>
        <div class="sitmon-row"><span class="sitmon-row-label">Risks</span><span class="sitmon-row-value" style="text-align:right;max-width:60%;">${wz.risks.join(', ')}</span></div>
        <div style="margin-top:6px;font-size:10px;color:var(--text-muted);line-height:1.4;">${wz.description}</div>
      </div>
    </div>`;
  }

  // Fleet exposure
  const me = getMe();
  if (me && me.fleet.length > 0) {
    html += `<div class="sitmon-section-title">YOUR FLEET EXPOSURE</div>`;
    for (const ship of me.fleet) {
      const state = shipStates[ship.id];
      if (!state) continue;
      const inZones = DANGER_ZONES.filter(z =>
        state.lat >= z.bounds.south && state.lat <= z.bounds.north &&
        state.lon >= z.bounds.west && state.lon <= z.bounds.east
      );
      const exposure = inZones.length > 0
        ? inZones.map(z => z.label || z.name).join(', ')
        : 'Safe waters';
      const expClass = inZones.length > 0 ? 'sitmon-stat-bad' : 'sitmon-stat-ok';
      html += `<div class="sitmon-zone" style="padding:6px 12px;">
        <div class="sitmon-zone-header" style="margin-bottom:0;">
          <span class="sitmon-zone-name" style="font-size:11px;">${ship.name}</span>
          <span class="${expClass}" style="font-size:10px;font-weight:bold;">${exposure}</span>
        </div>
      </div>`;
    }
  }
  html += `</div>`;

  // RIGHT COLUMN: Attack log + region intensity
  html += `<div>`;

  // Region intensity summary
  html += `<div class="sitmon-section-title">REGIONAL INTENSITY</div>`;
  html += `<div class="sitmon-zone">`;
  for (const [id, def] of Object.entries(REGION_DEFINITIONS)) {
    const ri = campaignStats.regionIntensity[id];
    if (!ri) continue;
    const barWidth = ((ri.level + 1) / 4) * 100;
    const barColor = ri.level >= 3 ? '#800' : ri.level >= 2 ? 'var(--danger)' : ri.level >= 1 ? 'var(--primary)' : 'var(--success)';
    html += `<div style="margin-bottom:8px;">
      <div style="display:flex;justify-content:space-between;font-size:11px;margin-bottom:2px;">
        <span>${def.name}</span>
        <span style="color:${barColor};font-weight:bold;">${ri.levelName}</span>
      </div>
      <div style="background:rgba(42,48,80,0.4);height:6px;border-radius:3px;overflow:hidden;">
        <div style="width:${barWidth}%;height:100%;background:${barColor};border-radius:3px;transition:width 0.5s;"></div>
      </div>
    </div>`;
  }
  html += `</div>`;

  // Attack log
  html += `<div class="sitmon-section-title">ATTACK LOG (${totalAttacks} total, ${recentAttacks.length} recent)</div>`;
  html += `<div class="sitmon-zone sitmon-attack-log">`;
  if (campaignStats.attackLog.length === 0) {
    html += `<div style="color:var(--text-muted);font-size:11px;padding:8px;">No attacks recorded yet.</div>`;
  } else {
    const displayLog = [...campaignStats.attackLog].reverse().slice(0, 30);
    for (const entry of displayLog) {
      const ago = Math.round((Date.now() - entry.time) / 1000);
      const timeStr = ago < 60 ? `${ago}s` : `${Math.round(ago / 60)}m`;
      html += `<div class="sitmon-attack-item">
        <span class="sitmon-attack-time">${timeStr} ago</span>
        <span class="sitmon-attack-type">${entry.type}</span>
        <span class="sitmon-attack-region">${entry.region}</span>
      </div>`;
    }
  }
  html += `</div>`;
  html += `</div>`;

  html += `</div>`; // close sitmon-columns

  container.innerHTML = html;
}

function renderFleetManager() {
  try {
  const me = getMe();
  if (!me) return;
  const cash = me.cash || 0;
  const container = document.getElementById('fm-ship-list');

  container.innerHTML = me.fleet.map(ship => {
    const state = shipStates[ship.id];
    const cargo = shipCargo[ship.id];
    const destroyed = state?.destroyed || state?.seized;
    const hp = state ? Math.round((state.health - state.totalDamage) * 100) : Math.round(ship.health * 100);
    const cargoText = destroyed ? 'LOST' : cargo?.delivered ? 'DELIVERED' : cargo?.loaded ? 'LOADED' : 'EMPTY';
    const cargoClass = destroyed ? 'stat-bad' : cargo?.delivered ? 'stat-good' : cargo?.loaded ? 'stat-warn' : 'stat-warn';
    const spd = state ? state.speed : 0;
    const ratedSpeed = ship.speed || 16;
    const spdLabel = spd > ratedSpeed ? `${spd} kts ⚠` : `${spd} kts`;
    const aisId = ship.aisId || 'FULL_BROADCAST';
    const insId = ship.insuranceId || 'FULL_WAR_RISK';
    const ap = shipAutopilot[ship.id];
    const apActive = ap && ap.active;

    return `
      <div class="fm-ship-row ${destroyed ? 'destroyed' : ''}" data-fm-ship="${ship.id}">
        <div class="fm-ship-header">
          <span class="fm-ship-name">${ship.name}</span>
          <div class="fm-ship-badges">
            <span class="stat">${(ship.cargoType || 'oil').toUpperCase()}</span>
            <span class="stat">${(ship.capacity / 1000).toFixed(0)}K</span>
            <span class="stat ${hp > 70 ? 'stat-good' : hp > 40 ? 'stat-warn' : 'stat-bad'}">HP:${hp}%</span>
            <span class="stat ${cargoClass}">${cargoText}</span>
          </div>
        </div>
        <div class="fm-controls">
          <div class="fm-control-group">
            <div class="fm-control-label">SPEED</div>
            <div class="fm-speed-row">
              <button class="btn btn-small fm-spd-down" data-sid="${ship.id}">-</button>
              <span class="fm-speed-val" id="fm-spd-${ship.id}">${spdLabel}</span>
              <button class="btn btn-small fm-spd-up" data-sid="${ship.id}">+</button>
            </div>
          </div>
          <div class="fm-control-group">
            <div class="fm-control-label">AIS</div>
            <div class="fm-btn-group">
              <button class="btn btn-small fm-ais-btn ${aisId === 'FULL_BROADCAST' ? 'active' : ''}" data-sid="${ship.id}" data-ais="FULL_BROADCAST">FULL</button>
              <button class="btn btn-small fm-ais-btn ${aisId === 'REDUCED' ? 'active' : ''}" data-sid="${ship.id}" data-ais="REDUCED">RED</button>
              <button class="btn btn-small fm-ais-btn ${aisId === 'DARK' ? 'active' : ''}" data-sid="${ship.id}" data-ais="DARK">DARK</button>
            </div>
          </div>
          <div class="fm-control-group">
            <div class="fm-control-label">INSURANCE</div>
            <div class="fm-btn-group">
              <button class="btn btn-small fm-ins-btn ${insId === 'FULL_WAR_RISK' ? 'active' : ''}" data-sid="${ship.id}" data-ins="FULL_WAR_RISK">WAR</button>
              <button class="btn btn-small fm-ins-btn ${insId === 'STANDARD_MARINE' ? 'active' : ''}" data-sid="${ship.id}" data-ins="STANDARD_MARINE">STD</button>
              <button class="btn btn-small fm-ins-btn ${insId === 'NONE' ? 'active' : ''}" data-sid="${ship.id}" data-ins="NONE">NONE</button>
            </div>
          </div>
          <div class="fm-control-group">
            <div class="fm-control-label">UPGRADES</div>
            <div class="fm-upgrades">
              ${state && state.totalDamage > 0 ? `<button class="btn btn-small fm-repair-btn" data-sid="${ship.id}">REPAIR</button>` : ''}
              ${!ship.engineUpgrade ? `<button class="btn btn-small fm-engine-btn" data-sid="${ship.id}" ${cash < 25000000 ? 'disabled' : ''}>ENG</button>` : '<button class="btn btn-small owned" disabled>ENG</button>'}
              ${!ship.defenseUpgrade ? `<button class="btn btn-small fm-def-btn" data-sid="${ship.id}" ${cash < 20000000 ? 'disabled' : ''}>DEF</button>` : '<button class="btn btn-small owned" disabled>DEF</button>'}
              <button class="btn btn-small fm-ap-btn ${apActive ? 'owned' : ''}" data-sid="${ship.id}">${apActive ? 'AP ON' : ship.hasAutopilot ? 'AP OFF' : 'AP'}</button>
            </div>
          </div>
        </div>
        ${apActive || ship.hasAutopilot ? `
        <div class="fm-ap-row" style="margin-top:6px;">
          <span class="fm-control-label" style="margin-right:4px;">ROUTE:</span>
          <select class="fm-ap-terminal" data-sid="${ship.id}"></select>
          <span style="color:var(--text-muted);font-size:9px;">→</span>
          <select class="fm-ap-dropoff" data-sid="${ship.id}"></select>
          <button class="btn btn-small fm-ap-reroute" data-sid="${ship.id}">${apActive ? 'REROUTE' : 'START'}</button>
        </div>` : ''}
      </div>`;
  }).join('');

  // Add close button at bottom for mobile
  if (isMobile()) {
    container.innerHTML += `<button id="fm-close-bottom" class="btn btn-primary" style="width:100%;margin-top:12px;min-height:48px;font-size:14px;">CLOSE</button>`;
    document.getElementById('fm-close-bottom')?.addEventListener('click', closeFleetManager);
  }

  // Populate autopilot selects
  me.fleet.forEach(ship => {
    const ap = shipAutopilot[ship.id];
    const termSel = container.querySelector(`.fm-ap-terminal[data-sid="${ship.id}"]`);
    const dropSel = container.querySelector(`.fm-ap-dropoff[data-sid="${ship.id}"]`);
    if (termSel && dropSel) {
      populateFmApSelect(termSel, dropSel, ship);
      if (ap && ap.terminal) termSel.value = ap.terminal.id;
      if (ap && ap.dropoff) dropSel.value = ap.dropoff.id;
    }
  });

  // Helper: safe speed label update
  function updateFmSpeedLabel(sid, st) {
    const el = document.getElementById(`fm-spd-${sid}`);
    if (!el) return;
    const s = getShipData(sid);
    const rated = s?.speed || 16;
    const spd = st.speed || 0;
    el.textContent = spd > rated ? `${spd} kts ⚠` : `${spd} kts`;
  }

  // Helper: check ship is alive and manageable
  function fmShipAlive(sid) {
    const st = shipStates[sid];
    if (!st || st.destroyed || st.seized) return false;
    return true;
  }

  // Wire up event handlers
  container.querySelectorAll('.fm-spd-down').forEach(btn => {
    btn.addEventListener('click', () => {
      const sid = btn.dataset.sid;
      if (!fmShipAlive(sid)) return;
      const st = shipStates[sid];
      st.speed = Math.max(0, Math.round(st.speed || 0) - 1);
      updateFmSpeedLabel(sid, st);
    });
  });

  container.querySelectorAll('.fm-spd-up').forEach(btn => {
    btn.addEventListener('click', () => {
      const sid = btn.dataset.sid;
      if (!fmShipAlive(sid)) return;
      const st = shipStates[sid];
      const s = getShipData(sid);
      const rated = s?.speed || 16;
      st.speed = Math.min(rated + 4, Math.round(st.speed || 0) + 1);
      updateFmSpeedLabel(sid, st);
    });
  });

  container.querySelectorAll('.fm-ais-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const sid = btn.dataset.sid;
      if (!fmShipAlive(sid)) return;
      const aisKey = btn.dataset.ais;
      if (!aisKey) return;
      const aisOpt = options?.aisOptions?.[aisKey];
      const s = getShipData(sid);
      if (!s || !aisOpt) return;
      s.aisId = aisKey;
      s.aisName = aisOpt.name;
      container.querySelectorAll(`.fm-ais-btn[data-sid="${sid}"]`).forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
    });
  });

  container.querySelectorAll('.fm-ins-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const sid = btn.dataset.sid;
      if (!fmShipAlive(sid)) return;
      const insKey = btn.dataset.ins;
      if (!insKey) return;
      const insOpt = options?.insuranceOptions?.[insKey];
      const s = getShipData(sid);
      if (!s || !insOpt) return;
      s.insuranceId = insKey;
      s.insuranceName = insOpt.name;
      container.querySelectorAll(`.fm-ins-btn[data-sid="${sid}"]`).forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
    });
  });

  container.querySelectorAll('.fm-repair-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const sid = btn.dataset.sid;
      if (!fmShipAlive(sid)) return;
      const st = shipStates[sid];
      const s = getShipData(sid);
      if (!st || !s) return;
      if (!st.totalDamage || st.totalDamage <= 0) return;
      const repairCost = Math.round((s.cost || 0) * st.totalDamage * 0.3);
      if (repairCost <= 0) return;
      const me2 = getMe();
      if (!me2 || me2.cash < repairCost) return;
      btn.disabled = true;
      const currentHealth = Math.max(0.01, (st.health || 1) - st.totalDamage);
      socket.emit('upgrade_ship', { shipId: sid, type: 'repair', health: currentHealth }, (res) => {
        if (res?.success) {
          const freshSt = shipStates[sid];
          if (freshSt) {
            freshSt.totalDamage = 0;
            const freshShip = getShipData(sid);
            if (freshShip) freshSt.speed = freshShip.speed || freshSt.speed;
          }
          renderFleetManager(); updateFleetPanel();
        }
        else { btn.disabled = false; }
      });
    });
  });

  container.querySelectorAll('.fm-engine-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const sid = btn.dataset.sid;
      if (!fmShipAlive(sid)) return;
      const s = getShipData(sid);
      if (!s || s.engineUpgrade) return;
      const me2 = getMe();
      if (!me2 || me2.cash < 25000000) return;
      btn.disabled = true;
      socket.emit('upgrade_ship', { shipId: sid, type: 'engine', cost: 25000000 }, (res) => {
        if (res?.success) {
          // Re-fetch ship data in case game_update replaced the object
          const fresh = getShipData(sid);
          if (fresh && !fresh.engineUpgrade) { fresh.engineUpgrade = 1; fresh.speed = (fresh.speed || 14) + 4; }
          renderFleetManager(); updateFleetPanel();
        } else { btn.disabled = false; }
      });
    });
  });

  container.querySelectorAll('.fm-def-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const sid = btn.dataset.sid;
      if (!fmShipAlive(sid)) return;
      const s = getShipData(sid);
      if (!s || s.defenseUpgrade) return;
      const me2 = getMe();
      if (!me2 || me2.cash < DEFENSE_COST) return;
      btn.disabled = true;
      socket.emit('upgrade_ship', { shipId: sid, type: 'defense', cost: DEFENSE_COST }, (res) => {
        if (res?.success) {
          const fresh = getShipData(sid);
          if (fresh) fresh.defenseUpgrade = 1;
          renderFleetManager(); updateFleetPanel();
        } else { btn.disabled = false; }
      });
    });
  });

  container.querySelectorAll('.fm-ap-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const sid = btn.dataset.sid;
      if (!fmShipAlive(sid)) return;
      const s = getShipData(sid);
      const st = shipStates[sid];
      if (!s || !st) return;
      const ap = shipAutopilot[s.id];
      if (ap && ap.active) {
        ap.active = false;
        shipWaypoints[s.id] = [];
        st.speed = 0;
        st.apCoastEscapeTimer = 0;
        sendAutopilotToServer(s.id);
        sendWaypointsToServer(s.id);
        sendSpeedToServer(s.id, 0);
        renderFleetManager(); updateFleetPanel();
        return;
      }
      if (!s.hasAutopilot) {
        const me2 = getMe();
        if (!me2 || me2.cash < 5000000) return;
        btn.disabled = true;
        socket.emit('upgrade_ship', { shipId: sid, type: 'autopilot', cost: 5000000 }, (res) => {
          if (res?.success) {
            const fresh = getShipData(sid);
            if (fresh) fresh.hasAutopilot = true;
            renderFleetManager(); updateFleetPanel();
          } else { btn.disabled = false; }
        });
      } else {
        // Engage autopilot using the selects in this row
        const termSel = container.querySelector(`.fm-ap-terminal[data-sid="${sid}"]`);
        const dropSel = container.querySelector(`.fm-ap-dropoff[data-sid="${sid}"]`);
        if (!termSel || !dropSel) return;
        const terminal = getTerminalById(termSel.value);
        const dropoff = getDropoffById(dropSel.value) || DROPOFF_POINT;
        if (!terminal) return;
        shipAutopilot[s.id] = { active: true, terminal, dropoff };
        st.apCoastEscapeTimer = 0;
        st.apCoastEscapeHeading = 0;
        shipWaypoints[s.id] = [];
        if (st.speed === 0) st.speed = Math.round(s.speed || 14);
        sendAutopilotToServer(s.id);
        sendWaypointsToServer(s.id);
        sendSpeedToServer(s.id, st.speed);
        renderFleetManager(); updateFleetPanel();
      }
    });
  });

  container.querySelectorAll('.fm-ap-reroute').forEach(btn => {
    btn.addEventListener('click', () => {
      const sid = btn.dataset.sid;
      if (!fmShipAlive(sid)) return;
      const s = getShipData(sid);
      const st = shipStates[sid];
      if (!s || !st) return;
      const termSel = container.querySelector(`.fm-ap-terminal[data-sid="${sid}"]`);
      const dropSel = container.querySelector(`.fm-ap-dropoff[data-sid="${sid}"]`);
      if (!termSel || !dropSel) return;
      const terminal = getTerminalById(termSel.value);
      const dropoff = getDropoffById(dropSel.value) || DROPOFF_POINT;
      if (!terminal) return;
      const ap = shipAutopilot[s.id];
      if (ap && ap.active) {
        // Already active — reroute to new terminals
        ap.terminal = terminal;
        ap.dropoff = dropoff;
        autopilotReroute(s);
        sendAutopilotToServer(s.id);
        sendWaypointsToServer(s.id);
      } else {
        // Not active — engage autopilot with selected terminals
        shipAutopilot[s.id] = { active: true, terminal, dropoff };
        st.apCoastEscapeTimer = 0;
        st.apCoastEscapeHeading = 0;
        shipWaypoints[s.id] = [];
        if (st.speed === 0) st.speed = Math.round(s.speed || 14);
        sendAutopilotToServer(s.id);
        sendWaypointsToServer(s.id);
        sendSpeedToServer(s.id, st.speed);
      }
      renderFleetManager(); updateFleetPanel();
    });
  });
  } catch (e) { console.error('renderFleetManager error:', e); }
}

function getShipData(shipId) {
  const me = getMe();
  return me?.fleet.find(s => s.id === shipId);
}

function populateFmApSelect(termSel, dropSel, ship) {
  termSel.innerHTML = '';
  const cargoType = ship.cargoType || 'oil';
  const isLng = cargoType === 'lng';
  const exports = Object.values(EXPORT_TERMINALS).filter(t => (t.cargoType || 'oil') === cargoType);
  const byRegion = {};
  for (const t of exports) {
    const region = t.region || 'other';
    if (!byRegion[region]) byRegion[region] = [];
    byRegion[region].push(t);
  }
  for (const [region, terminals] of Object.entries(byRegion)) {
    const grp = document.createElement('optgroup');
    grp.label = TERMINAL_REGIONS[region] || region;
    for (const t of terminals) {
      const opt = document.createElement('option');
      opt.value = t.id;
      opt.textContent = t.name;
      grp.appendChild(opt);
    }
    termSel.appendChild(grp);
  }
  dropSel.innerHTML = '';
  const imports = Object.values(IMPORT_TERMINALS);
  const impByRegion = {};
  for (const t of imports) {
    const region = t.region || 'other';
    if (!impByRegion[region]) impByRegion[region] = [];
    impByRegion[region].push(t);
  }
  for (const [region, terminals] of Object.entries(impByRegion)) {
    const grp = document.createElement('optgroup');
    grp.label = TERMINAL_REGIONS[region] || region;
    for (const t of terminals) {
      const opt = document.createElement('option');
      opt.value = t.id;
      opt.textContent = t.name;
      grp.appendChild(opt);
    }
    dropSel.appendChild(grp);
  }
}

// ============================================
// AUTH
// ============================================
let authToken = localStorage.getItem('bts_token') || null;
let authUser = null;
let authMode = null; // 'login' or 'register'

let isGuest = false;

function updateAuthUI() {
  const statusEl = document.getElementById('auth-status');
  const usernameEl = document.getElementById('auth-username');
  const authBtns = document.getElementById('auth-buttons');
  const menuBtns = document.getElementById('menu-buttons');
  const nameInput = document.getElementById('input-name');

  if (authUser) {
    statusEl.classList.remove('hidden');
    usernameEl.textContent = authUser.username;
    authBtns.classList.add('hidden');
    menuBtns.classList.remove('hidden');
    nameInput.value = authUser.username;
    nameInput.readOnly = true;
  } else if (isGuest) {
    statusEl.classList.add('hidden');
    authBtns.classList.add('hidden');
    menuBtns.classList.remove('hidden');
    nameInput.readOnly = false;
  } else {
    statusEl.classList.add('hidden');
    authBtns.classList.remove('hidden');
    menuBtns.classList.add('hidden');
    nameInput.readOnly = false;
  }
}

function showAuthForm(mode) {
  authMode = mode;
  document.getElementById('auth-form-title').textContent = mode === 'login' ? 'LOGIN' : 'REGISTER';
  document.getElementById('auth-form-area').classList.remove('hidden');
  document.getElementById('menu-buttons').classList.add('hidden');
  document.getElementById('auth-buttons').classList.add('hidden');
  document.getElementById('input-auth-user').value = '';
  document.getElementById('input-auth-pass').value = '';
  document.getElementById('input-auth-user').focus();
}

function hideAuthForm() {
  document.getElementById('auth-form-area').classList.add('hidden');
  updateAuthUI();
}

async function submitAuth() {
  const username = document.getElementById('input-auth-user').value.trim();
  const password = document.getElementById('input-auth-pass').value;
  if (!username || !password) { showError('Enter username and password'); return; }

  const endpoint = authMode === 'login' ? '/api/login' : '/api/register';
  try {
    const res = await fetch(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, password })
    });
    const data = await res.json();
    if (data.success) {
      authToken = data.token;
      authUser = data.user;
      localStorage.setItem('bts_token', authToken);
      hideAuthForm();
      updateAuthUI();
      // Auth the socket too
      socket.emit('auth', { token: authToken }, (res) => {
        if (res?.displaced) {
          showError('Previous session on another device was ended.');
        }
      });
    } else {
      showError(data.error || 'Authentication failed');
    }
  } catch (e) {
    showError('Connection error');
  }
}

function logout() {
  authToken = null;
  authUser = null;
  localStorage.removeItem('bts_token');
  updateAuthUI();
}

// Auto-login on page load if token exists
async function tryAutoLogin() {
  if (!authToken) return;
  try {
    const res = await fetch('/api/profile', {
      headers: { 'Authorization': `Bearer ${authToken}` }
    });
    if (res.ok) {
      authUser = await res.json();
      updateAuthUI();
      socket.emit('auth', { token: authToken });
    } else {
      localStorage.removeItem('bts_token');
      authToken = null;
    }
  } catch {
    // Silently fail auto-login
  }
}
tryAutoLogin();

document.getElementById('btn-login').addEventListener('click', () => showAuthForm('login'));
document.getElementById('btn-register').addEventListener('click', () => showAuthForm('register'));
document.getElementById('btn-auth-back').addEventListener('click', hideAuthForm);
document.getElementById('btn-auth-submit').addEventListener('click', submitAuth);
document.getElementById('btn-logout').addEventListener('click', () => {
  logout();
  isGuest = false;
  updateAuthUI();
});
document.getElementById('btn-guest').addEventListener('click', () => {
  isGuest = true;
  updateAuthUI();
});

['input-auth-user', 'input-auth-pass'].forEach(id => {
  document.getElementById(id).addEventListener('keydown', (e) => {
    if (e.key === 'Enter') submitAuth();
  });
});

// ============================================
// TITLE SCREEN
// ============================================
document.getElementById('btn-create').addEventListener('click', () => {
  document.getElementById('name-input-area').classList.remove('hidden');
  document.getElementById('menu-buttons').classList.add('hidden');
  document.getElementById('auth-buttons').classList.add('hidden');
  if (authUser) {
    document.getElementById('input-name').value = authUser.username;
  }
  document.getElementById('input-name').focus();
});

document.getElementById('btn-back').addEventListener('click', () => {
  document.getElementById('name-input-area').classList.add('hidden');
  document.getElementById('menu-buttons').classList.remove('hidden');
  updateAuthUI();
});

document.getElementById('btn-confirm').addEventListener('click', () => {
  const name = document.getElementById('input-name').value.trim();
  if (!name) { showError('Enter a captain name'); return; }
  if (!socket.connected) { showError('Not connected to server'); return; }

  const token = authToken || undefined;

  socket.emit('create_game', { playerName: name, token }, (res) => {
    if (res.success) {
      myId = socket.id; gameState = res.game; isHost = true;
      fetchOptions(); renderLobby(); showScreen('lobby');
    } else { showError('Failed to create game'); }
  });
});

document.getElementById('input-name').addEventListener('keydown', (e) => {
  if (e.key === 'Enter') document.getElementById('btn-confirm').click();
});

function fetchOptions() {
  socket.emit('get_options', null, (opts) => { options = opts; });
}

// ============================================
// LOBBY
// ============================================
function renderLobby() {
  const list = document.getElementById('lobby-players');
  list.innerHTML = gameState.players.map(p => `
    <div class="player-card">
      <span class="name">${escapeHtml(p.name)}</span>
      ${p.id === gameState.players[0]?.id ? '<span class="host-badge">HOST</span>' : ''}
    </div>
  `).join('');
  const btnStart = document.getElementById('btn-start');
  const waiting = document.getElementById('lobby-waiting');
  if (isHost) { btnStart.classList.remove('hidden'); waiting.classList.add('hidden'); }
  else { btnStart.classList.add('hidden'); waiting.classList.remove('hidden'); }
}

document.getElementById('btn-start').addEventListener('click', () => {
  socket.emit('start_game', null, (res) => {
    if (!res.success) showError(res.error);
  });
});

// ============================================
// ENTER GAME (replaces planning screen)
// ============================================
function enterGame() {
  transitActive = true;
  simStartTime = performance.now();
  lastFrameTime = simStartTime;
  simGameTime = 0;
  zoneCooldowns = {};
  lastEventCheck = 0;
  campaignEnded = false;
  campaignStats = { totalProfit: 0, totalRevenue: 0, totalCosts: 0, deliveries: 0, shipsBought: 0, shipsLost: 0, totalDamageTaken: 0, missileEvents: 0, attackLog: [], regionIntensity: {} };
  initRegionIntensity();
  lastRegionIntensityCheck = 0;


  const me = getMe();
  if (me) {
    for (const ship of me.fleet) {
      if (!shipStates[ship.id]) spawnShipState(ship);
    }
  }

  spawnNPCShips();
  spawnMilitaryShips();

  showScreen('transit');
  document.getElementById('hud-events').innerHTML = '';
  mapCanvas.style.pointerEvents = 'auto';
  mapCanvas.style.cursor = 'crosshair';

  viewport = { north: 30.0, south: 23.0, west: 47.5, east: 60.0 };
  setViewport(viewport);

  updateFleetPanel();
  updateHUD();
  addTransitEvent('GAME STARTED', 'Buy a ship and navigate to a terminal to load cargo.', 'success');

  requestAnimationFrame(transitLoop);
}

function spawnShipState(ship, spawnLat, spawnLon) {
  const baseLat = spawnLat != null ? spawnLat : SIM_CONFIG.SPAWN_LAT;
  const baseLon = spawnLon != null ? spawnLon : SIM_CONFIG.SPAWN_LON;
  const pos = randomWaterPos(baseLat - 0.15, baseLat + 0.15, baseLon - 0.15, baseLon + 0.15, 50);
  const lat = pos.lat;
  const lon = pos.lon;
  shipStates[ship.id] = {
    lat, lon, heading: 270, targetHeading: 270, speed: 0,
    health: ship.health, totalDamage: 0, totalMoneyLoss: 0, totalDelay: 0,
    seized: false, destroyed: false,
    apCoastEscapeTimer: 0, apCoastEscapeHeading: 0
  };
  shipWaypoints[ship.id] = [];
  shipTrails[ship.id] = [];
  shipCargo[ship.id] = { loaded: false, terminal: null, terminalId: null };
}

// ============================================
// UNIVERSAL IMPACT HANDLER — proximity damage for all missiles & bombs
// ============================================
const BLAST_RADIUS = 0.12;       // degrees (~13km) — max damage range
const MISSILE_MAX_DMG = 1.00;    // max damage at epicenter for missiles
const BOMB_MAX_DMG = 1.00;       // max damage at epicenter for bombs
const NPC_DESTROY_THRESHOLD = 0.95; // NPC destroyed when cumulative damage reaches this

setImpactHandler((impactLat, impactLon, type) => {
  const maxDmg = type === 'bomb' ? BOMB_MAX_DMG : MISSILE_MAX_DMG;

  // --- Check player ships ---
  const me = gameState?.players?.find(p => p.id === myId);
  if (me) {
    for (const ship of me.fleet) {
      const state = shipStates[ship.id];
      if (!state || state.destroyed || state.seized) continue;
      const dist = Math.hypot(state.lat - impactLat, state.lon - impactLon);
      if (dist < BLAST_RADIUS) {
        // Linear falloff: full damage at epicenter, zero at edge
        const intensity = 1 - (dist / BLAST_RADIUS);
        const defLevel = ship.defenseUpgrade || 0;
        const defReduction = 1 - defLevel * 0.15;
        const dmg = maxDmg * intensity * defReduction;
        state.totalDamage = Math.min(0.95, state.totalDamage + dmg);
        if (dmg > 0.05) {
          state.speed = Math.round(Math.max(5, (ship.speed || 16) * (1 - state.totalDamage * 0.5)));
        }
        const pct = Math.round(dmg * 100);
        const label = type === 'bomb' ? 'AIRSTRIKE HIT' : 'MISSILE HIT';
        addTransitEvent(`${ship.name}: ${label}`, `${dist < 0.03 ? 'Direct hit' : 'Near miss shrapnel'}! [Dmg: ${pct}%]`, 'danger');
        _fleetPanelDirty = true;
      }
    }
  }

  // --- Check NPC ships ---
  for (let i = npcShips.length - 1; i >= 0; i--) {
    const npc = npcShips[i];
    const dist = Math.hypot(npc.lat - impactLat, npc.lon - impactLon);
    if (dist < BLAST_RADIUS) {
      // Sliding scale damage: full at epicenter, zero at edge
      const intensity = 1 - (dist / BLAST_RADIUS);
      const dmg = maxDmg * intensity;
      npc.totalDamage = Math.min(1, (npc.totalDamage || 0) + dmg);
      npc.speed = Math.max(3, (npc.baseSpeed || 13) * (1 - npc.totalDamage * 0.5));
      const pct = Math.round(dmg * 100);
      if (npc.totalDamage >= NPC_DESTROY_THRESHOLD) {
        // Accumulated enough damage — NPC destroyed
        npcShips[i] = createNPCTanker(false);
      } else {
        if (intensity > 0.3 && npc.state !== 'waiting_safe') {
          // Spooked — divert to safety
          // Find nearest safe anchorage (use the global list, not hardcoded)
          let nearestAnch = SAFE_ANCHORAGES[0], bestAnchDist = Infinity;
          for (const anch of SAFE_ANCHORAGES) {
            const ad = distanceDeg(npc.lat, npc.lon, anch.lat, anch.lon);
            if (ad < bestAnchDist) { bestAnchDist = ad; nearestAnch = anch; }
          }
          npc.safeAnchorage = nearestAnch;
          npc.savedState = npc.state;
          npc.state = 'waiting_safe';
          npc.waitTimer = 30 + Math.random() * 60;
          npc.targetHeading = headingToTarget(npc.lat, npc.lon, npc.safeAnchorage.lat, npc.safeAnchorage.lon);
          npc.speed = (npc.baseSpeed || 13) * 0.6 * (1 - npc.totalDamage * 0.5);
          npc._cautionChecked = false;
        }
      }
    }
  }
});

// ============================================
// FLEET PANEL (top-left, always visible during transit)
// ============================================
function updateFleetPanel() {
  try {
  const me = getMe();
  if (!me) return;

  const cashEl = document.getElementById('plan-cash');
  if (cashEl) cashEl.textContent = formatMoney(me.cash || 0);
  const riskBadge = document.getElementById('plan-risk');
  if (riskBadge && gameState.riskInfo) {
    riskBadge.textContent = gameState.riskInfo.name.toUpperCase();
    riskBadge.className = `risk-badge risk-${gameState.riskLevel}`;
  }

  const container = document.getElementById('ship-selector');
  if (!container) return;

  if (me.fleet.length === 0) {
    container.innerHTML = '<div class="muted">No ships yet. Buy one!</div>';
    return;
  }

  container.innerHTML = me.fleet.map(s => {
    const state = shipStates[s.id];
    const cargo = shipCargo[s.id];
    const isSelected = selectedShipId === s.id;
    const hp = state ? Math.round((state.health - state.totalDamage) * 100) : Math.round(s.health * 100);
    const destroyed = state?.destroyed || state?.seized;
    const cargoText = destroyed ? 'LOST' : cargo?.delivered ? 'DELIVERED' : cargo?.loaded ? 'LOADED' : 'EMPTY';
    const cargoClass = destroyed ? 'stat-bad' : cargo?.delivered ? 'stat-good' : cargo?.loaded ? 'stat-warn' : 'stat-warn';
    return `
      <div class="option-card ${isSelected ? 'selected' : ''} ${destroyed ? 'destroyed' : ''}" data-ship-id="${s.id}">
        <div class="option-name">${s.name}</div>
        <div class="option-stats">
          <span class="stat">${(s.cargoType || 'oil').toUpperCase()}</span>
          <span class="stat">${(s.capacity / 1000).toFixed(0)}K</span>
          <span class="stat ${hp > 70 ? 'stat-good' : hp > 40 ? 'stat-warn' : 'stat-bad'}">HP:${hp}%</span>
          <span class="stat ${cargoClass}">${cargoText}</span>
          ${shipAutopilot[s.id]?.active ? '<span class="stat stat-good">AP</span>' : ''}
          ${s.defenseUpgrade ? '<span class="stat">DEF</span>' : ''}
        </div>
        ${isSelected && !destroyed ? '<button class="btn btn-small btn-manage" data-manage-id="' + s.id + '">MANAGE</button>' : ''}
      </div>`;
  }).join('');

  container.querySelectorAll('.option-card').forEach(card => {
    card.addEventListener('click', (e) => {
      // Don't toggle selection if clicking the manage button
      if (e.target.classList.contains('btn-manage')) return;
      if (card.dataset.shipId === selectedShipId) deselectShip();
      else selectShip(card.dataset.shipId);
    });
  });
  container.querySelectorAll('.btn-manage').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      selectShip(btn.dataset.manageId);
      openShipControlPanel();
    });
  });
  } catch (e) { console.error('updateFleetPanel error:', e); }
}

function selectShip(shipId) {
  selectedShipId = shipId;
  const state = shipStates[shipId];
  if (state) centerViewportOn(state.lat, state.lon);
  if (shipControlOpen) closeShipControlPanel();
  hideTerminalPopup();
  updateFleetPanel();
  updateClearWpButton();
  updateHUD();
}

function deselectShip() {
  selectedShipId = null;
  if (shipControlOpen) closeShipControlPanel();
  updateFleetPanel();
  updateClearWpButton();
  updateHUD();
}

function addWaypointForSelectedShip(target) {
  if (!selectedShipId || !shipStates[selectedShipId]) return;
  // Allow terminal waypoints (they have loadRadius) even if on land — terminals are coastal
  if (!target.loadRadius && isOnLand(target.lat, target.lon)) return;
  const wps = shipWaypoints[selectedShipId] || [];
  wps.push(target);
  shipWaypoints[selectedShipId] = wps;
  updateClearWpButton();
  const state = shipStates[selectedShipId];
  if (state.speed === 0) { const ship = getSelectedShipData(); state.speed = Math.round(ship?.speed || 14); sendSpeedToServer(selectedShipId, state.speed); }
  if (wps.length === 1) {
    state.targetHeading = headingToTarget(state.lat, state.lon, target.lat, target.lon);
  }
  sendWaypointsToServer(selectedShipId);
}

// ============================================
// SHIP PURCHASE MODAL
// ============================================
function openShipPurchaseModal() {
  if (!options) return;
  const modal = document.getElementById('ship-purchase-modal');
  modal.classList.remove('hidden');
  modalShipTypeId = null; modalAisId = 'FULL_BROADCAST'; modalInsuranceId = 'FULL_WAR_RISK'; modalSpawnTerminalId = null;
  document.getElementById('modal-step-ship').classList.remove('hidden');
  document.getElementById('modal-step-spawn').classList.add('hidden');
  // Hide config step entirely — AIS/insurance managed from ship dashboard
  const configStep = document.getElementById('modal-step-config');
  if (configStep) configStep.classList.add('hidden');

  const me = getMe();
  const shipList = document.getElementById('modal-ship-list');
  shipList.innerHTML = Object.entries(options.shipTypes).map(([key, s]) => `
    <div class="option-card" data-type-key="${key}">
      <div class="option-name">${s.name}</div>
      <div class="option-desc">${s.description}</div>
      <div class="option-stats">
        <span class="stat">${(s.capacity / 1000).toFixed(0)}K DWT</span>
        <span class="stat">${s.speed} kts</span>
        <span class="stat">${formatMoney(s.cost)}</span>
        <span class="stat ${(me?.cash || 0) >= s.cost ? 'stat-good' : 'stat-bad'}">
          ${(me?.cash || 0) >= s.cost ? 'Can Afford' : 'Too Expensive'}
        </span>
      </div>
    </div>`).join('');

  shipList.querySelectorAll('.option-card').forEach(card => {
    card.addEventListener('click', () => {
      const key = card.dataset.typeKey;
      if ((me?.cash || 0) < options.shipTypes[key].cost) { showError('Cannot afford'); return; }
      modalShipTypeId = key;
      // Go straight to spawn location selection
      showModalSpawnStep();
    });
  });
}

function showModalSpawnStep() {
  document.getElementById('modal-step-ship').classList.add('hidden');
  const configStep = document.getElementById('modal-step-config');
  if (configStep) configStep.classList.add('hidden');
  document.getElementById('modal-step-spawn').classList.remove('hidden');

  // All terminals organized by region with dropdown selectors
  const allTerminals = Object.values(OIL_TERMINALS);
  const byRegion = {};
  for (const t of allTerminals) {
    const region = t.region || 'other';
    if (!byRegion[region]) byRegion[region] = [];
    byRegion[region].push(t);
  }

  const spawnList = document.getElementById('modal-spawn-list');
  modalSpawnTerminalId = null;
  let html = '';
  for (const [region, terminals] of Object.entries(byRegion)) {
    const regionName = TERMINAL_REGIONS[region] || region;
    html += `<div class="spawn-region">
      <div class="spawn-region-header" data-region="${region}">
        <span class="spawn-region-toggle">&#9654;</span> ${regionName} <span class="spawn-region-count">(${terminals.length})</span>
      </div>
      <div class="spawn-region-body hidden" data-region-body="${region}">
        ${terminals.map(t => {
          const roleLabel = t.role === 'import' ? 'IMPORT' : 'EXPORT';
          const priceInfo = t.role === 'import'
            ? `Sell $${getLivePrice(t)}/bbl`
            : `Buy $${getLivePrice(t)}/bbl`;
          return `<div class="option-card" data-spawn-id="${t.id}" data-spawn-lat="${t.lat}" data-spawn-lon="${t.lon}">
            <div class="option-name">${t.name}</div>
            <div class="option-desc">${t.country || ''} — ${roleLabel} — ${priceInfo}</div>
          </div>`;
        }).join('')}
      </div>
    </div>`;
  }
  spawnList.innerHTML = html;

  // Region toggle behavior
  spawnList.querySelectorAll('.spawn-region-header').forEach(header => {
    header.addEventListener('click', () => {
      const region = header.dataset.region;
      const body = spawnList.querySelector(`[data-region-body="${region}"]`);
      const toggle = header.querySelector('.spawn-region-toggle');
      if (body.classList.contains('hidden')) {
        body.classList.remove('hidden');
        toggle.innerHTML = '&#9660;';
      } else {
        body.classList.add('hidden');
        toggle.innerHTML = '&#9654;';
      }
    });
  });

  // Terminal selection
  spawnList.querySelectorAll('.option-card').forEach(card => {
    card.addEventListener('click', () => {
      spawnList.querySelectorAll('.option-card').forEach(c => c.classList.remove('selected'));
      card.classList.add('selected');
      modalSpawnTerminalId = {
        id: card.dataset.spawnId,
        lat: parseFloat(card.dataset.spawnLat),
        lon: parseFloat(card.dataset.spawnLon)
      };
    });
  });
}

function closeShipPurchaseModal() {
  document.getElementById('ship-purchase-modal').classList.add('hidden');
}

document.getElementById('modal-cancel').addEventListener('click', closeShipPurchaseModal);

// Legacy step 2 → step 3 button — now hidden, but keep listener to avoid errors
const modalToSpawnBtn = document.getElementById('modal-to-spawn');
if (modalToSpawnBtn) {
  modalToSpawnBtn.addEventListener('click', () => { showModalSpawnStep(); });
}

document.getElementById('modal-confirm-buy').addEventListener('click', () => {
  if (!modalShipTypeId) {
    showError('Select a ship type'); return;
  }
  if (!modalSpawnTerminalId) {
    showError('Select a spawn location'); return;
  }
  socket.emit('buy_ship', {
    shipTypeId: modalShipTypeId, aisId: modalAisId, insuranceId: modalInsuranceId,
    spawnLat: modalSpawnTerminalId.lat, spawnLon: modalSpawnTerminalId.lon
  }, (res) => {
    if (res.success) {
      closeShipPurchaseModal();
      campaignStats.shipsBought++;
      if (res.ship) {
        spawnShipState(res.ship, modalSpawnTerminalId.lat, modalSpawnTerminalId.lon);
        selectedShipId = res.ship.id;
        centerViewportOn(shipStates[res.ship.id].lat, shipStates[res.ship.id].lon);
      }
      setTimeout(() => { updateFleetPanel(); updateHUD(); }, 100);
    } else { showError(res.error || 'Cannot buy ship'); }
  });
});

document.getElementById('btn-buy-ship').onclick = () => openShipPurchaseModal();

// ============================================
// NPC & MILITARY SHIPS
// ============================================
const NPC_STATE = {
  HEADING_TO_TERMINAL: 'heading_to_terminal',
  LOADING: 'loading',
  HEADING_TO_DROPOFF: 'heading_to_dropoff',
  UNLOADING: 'unloading',
  WAITING_SAFE: 'waiting_safe', // anchored outside danger zone, waiting for conditions to improve
};

// Safe anchorage zones — worldwide
const SAFE_ANCHORAGES = [
  { lat: 23.0, lon: 60.5, name: 'Gulf of Oman' },           // well outside missile_range zone (ends 24.5N/58E)
  { lat: 0.5, lon: 105.5, name: 'South of Singapore' },     // outside singapore_pirates zone
  { lat: 36.0, lon: 14.5, name: 'Central Mediterranean' },
  { lat: 28.5, lon: -89.0, name: 'US Gulf Anchorage' },
  { lat: -33.5, lon: 18.0, name: 'Cape Town Roads' },
  { lat: 2.0, lon: -5.0, name: 'West Africa Offshore' },    // offshore from Gulf of Guinea pirates
];

const NPC_SHIP_NAMES = [
  'Pacific Voyager', 'Gulf Pioneer', 'Sea Fortune', 'Ocean Grace',
  'Star Horizon', 'Desert Wind', 'Al Jazeera', 'Eastern Promise',
  'Coral Spirit', 'Golden Eagle', 'Silver Dawn', 'Arctic Breeze',
  'Pearl Venture', 'Crimson Tide', 'Blue Marlin', 'Iron Duke',
  'Swift Arrow', 'Amber Sun', 'Jade Empress', 'Ruby Crown',
  'Sapphire Wave', 'Diamond Crest', 'Emerald Bay', 'Crystal Sea',
  'Atlantic Star', 'Rio Grande', 'Cape Runner', 'Nordic Spirit',
  'Lagos Express', 'Maracaibo Sun', 'Bayou Queen', 'Texas Titan',
  'Amazon Dawn', 'Bonny Light', 'Suez Passage', 'Panama Pride',
  'North Star', 'Caspian Wind', 'Baltic Trader', 'Aegean Wave',
  'Orinoco Dream', 'Alaskan Valor', 'Gulf Stream', 'Bering Scout',
];
let npcNameIndex = 0;

function randomWaterPos(latMin, latMax, lonMin, lonMax, maxTries) {
  for (let i = 0; i < (maxTries || 30); i++) {
    const lat = latMin + Math.random() * (latMax - latMin);
    const lon = lonMin + Math.random() * (lonMax - lonMin);
    if (!isOnLand(lat, lon)) return { lat, lon };
  }
  // Fallback: known safe water point in Gulf of Oman
  return { lat: 25.3, lon: 59.0 };
}

// Pick a random global dropoff point
function randomDropoff() {
  const all = Object.values(IMPORT_TERMINALS);
  return all[Math.floor(Math.random() * all.length)];
}

// ============================================
// NPC SUPPLY/DEMAND — traffic tracking & profit-weighted routing
// ============================================

// Cached traffic data — recomputed at most once per frame
let _trafficCache = null;
let _trafficCacheFrame = -1;

// Count how many ships (NPC + player) are heading to or at each terminal
function computeNpcTraffic() {
  // Return cached result if already computed this frame
  if (_trafficCache && _trafficCacheFrame === _currentFrame) return _trafficCache;

  const traffic = {};
  for (const t of Object.values(OIL_TERMINALS)) traffic[t.id] = 0;
  // NPC ships
  for (const npc of npcShips) {
    if (npc.state === 'heading_to_terminal' || npc.state === 'loading') {
      if (npc.targetTerminal) traffic[npc.targetTerminal.id] = (traffic[npc.targetTerminal.id] || 0) + 1;
    }
    if (npc.state === 'heading_to_dropoff' || npc.state === 'unloading') {
      if (npc.dropoff) traffic[npc.dropoff.id] = (traffic[npc.dropoff.id] || 0) + 1;
    }
  }
  // Player ships — their autopilot destinations also create demand/supply
  const me = gameState?.players?.find(p => p.id === myId);
  if (me) {
    for (const ship of me.fleet) {
      const ap = shipAutopilot[ship.id];
      if (!ap || !ap.active) continue;
      const cargo = shipCargo[ship.id];
      if (cargo && cargo.loaded) {
        // Heading to sell — counts toward import terminal traffic
        if (ap.dropoff) traffic[ap.dropoff.id] = (traffic[ap.dropoff.id] || 0) + 1;
      } else {
        // Heading to buy — counts toward export terminal traffic
        if (ap.terminal) traffic[ap.terminal.id] = (traffic[ap.terminal.id] || 0) + 1;
      }
    }
  }
  _trafficCache = traffic;
  _trafficCacheFrame = _currentFrame;
  return traffic;
}

// Estimate route danger for traveling between two points
// Returns a score from 0 (safe) to 1 (extremely dangerous)
function estimateRouteDanger(fromLat, fromLon, toLat, toLon) {
  const rl = gameState?.riskLevel || 'LOW';
  const riskMult = RISK_LEVELS[rl]?.eventFrequency || 0.05;
  let dangerScore = 0;

  // Check how many danger zones the route's bounding box overlaps
  const minLat = Math.min(fromLat, toLat);
  const maxLat = Math.max(fromLat, toLat);
  const minLon = Math.min(fromLon, toLon);
  const maxLon = Math.max(fromLon, toLon);

  for (const zone of DANGER_ZONES) {
    const b = zone.bounds;
    // Check if route bounding box overlaps this danger zone
    if (maxLat >= b.south && minLat <= b.north && maxLon >= b.west && minLon <= b.east) {
      dangerScore += (zone.baseProbability || 0.05);
    }
  }

  // Scale by current global risk level
  dangerScore *= riskMult / 0.05; // normalize: at LOW (0.05) danger is baseline, scales up at higher risk
  return Math.min(1, dangerScore);
}

// Weighted random selection: picks an index based on weights (higher = more likely)
function weightedRandomIndex(weights) {
  const total = weights.reduce((a, b) => a + b, 0);
  if (total <= 0) return Math.floor(Math.random() * weights.length);
  let r = Math.random() * total;
  for (let i = 0; i < weights.length; i++) {
    r -= weights[i];
    if (r <= 0) return i;
  }
  return weights.length - 1;
}

// Pick an export terminal weighted by profitability and safety
// caution: 0 = daring (ignores risk), 1 = very cautious
function pickProfitableExport(cargoType, fromLat, fromLon, caution) {
  const rl = gameState?.riskLevel || 'LOW';
  const traffic = computeNpcTraffic();
  const exports = Object.values(EXPORT_TERMINALS).filter(t => (t.cargoType || 'oil') === cargoType);
  if (exports.length === 0) return null;

  // Get best import sell price (what we'd sell for) to estimate margin
  const imports = Object.values(IMPORT_TERMINALS);
  const bestSellPrice = Math.max(...imports.map(t => getTerminalPrice(t, rl, traffic)));

  const weights = exports.map(t => {
    const buyPrice = getTerminalPrice(t, rl, traffic);
    const margin = Math.max(1, bestSellPrice - buyPrice); // minimum $1 to avoid zero weights

    // Rough distance penalty (degrees as proxy — not perfect but cheap)
    const dist = Math.hypot(t.lat - fromLat, t.lon - fromLon);
    const distPenalty = 1 / (1 + dist * 0.02); // gentle falloff for farther terminals

    // Route danger
    const danger = estimateRouteDanger(fromLat, fromLon, t.lat, t.lon);
    const safetyFactor = 1 - danger * caution; // cautious NPCs heavily penalize dangerous routes

    return Math.max(0.01, margin * distPenalty * Math.max(0.05, safetyFactor));
  });

  return exports[weightedRandomIndex(weights)];
}

// Pick an import terminal weighted by sell price and safety
function pickProfitableImport(buyPrice, fromLat, fromLon, caution) {
  const rl = gameState?.riskLevel || 'LOW';
  const traffic = computeNpcTraffic();
  const imports = Object.values(IMPORT_TERMINALS);
  if (imports.length === 0) return null;

  const weights = imports.map(t => {
    const sellPrice = getTerminalPrice(t, rl, traffic);
    const margin = Math.max(1, sellPrice - buyPrice);

    const dist = Math.hypot(t.lat - fromLat, t.lon - fromLon);
    const distPenalty = 1 / (1 + dist * 0.02);

    const danger = estimateRouteDanger(fromLat, fromLon, t.lat, t.lon);
    const safetyFactor = 1 - danger * caution;

    return Math.max(0.01, margin * distPenalty * Math.max(0.05, safetyFactor));
  });

  return imports[weightedRandomIndex(weights)];
}

// Build terminal prices with local supply/demand for map display
function computeLocalTerminalPrices() {
  const rl = gameState?.riskLevel || 'LOW';
  const traffic = (typeof npcShips !== 'undefined' && npcShips.length > 0) ? computeNpcTraffic() : null;
  const prices = {};
  for (const [key, terminal] of Object.entries(OIL_TERMINALS)) {
    const price = getTerminalPrice(terminal, rl, traffic);
    prices[terminal.id] = {
      id: terminal.id,
      price,
      role: terminal.role,
      base: terminal.role === 'export' ? terminal.buyPrice : terminal.sellPrice
    };
  }
  return prices;
}

// Global NPC spawn zones — spread NPCs across major shipping lanes
const NPC_SPAWN_ZONES = [
  // Middle East / Indian Ocean
  { latMin: 24.0, latMax: 27.0, lonMin: 53.0, lonMax: 58.0 },     // Persian Gulf / Hormuz
  { latMin: 8.0, latMax: 15.0, lonMin: 68.0, lonMax: 78.0 },      // Arabian Sea
  { latMin: 12.0, latMax: 16.0, lonMin: 42.0, lonMax: 46.0 },     // Bab el-Mandeb / Red Sea
  // Asia / Pacific
  { latMin: 0.0, latMax: 5.0, lonMin: 98.0, lonMax: 105.0 },      // Malacca Strait
  { latMin: 28.0, latMax: 33.0, lonMin: 120.0, lonMax: 124.0 },    // East China Sea
  { latMin: 5.0, latMax: 12.0, lonMin: 108.0, lonMax: 118.0 },     // South China Sea
  // Mediterranean / Europe
  { latMin: 34.0, latMax: 38.0, lonMin: 10.0, lonMax: 20.0 },      // Mediterranean
  { latMin: 29.0, latMax: 31.5, lonMin: 31.0, lonMax: 34.0 },      // Suez Canal
  { latMin: 48.0, latMax: 52.0, lonMin: -5.0, lonMax: 4.0 },       // English Channel
  { latMin: 57.0, latMax: 62.0, lonMin: 2.0, lonMax: 10.0 },       // North Sea
  // Africa
  { latMin: -2.0, latMax: 5.0, lonMin: 40.0, lonMax: 50.0 },       // East Africa
  { latMin: 2.0, latMax: 6.0, lonMin: 3.0, lonMax: 8.0 },          // Gulf of Guinea / Nigeria
  { latMin: -35.0, latMax: -30.0, lonMin: 16.0, lonMax: 22.0 },    // Cape of Good Hope
  // Americas
  { latMin: 27.0, latMax: 30.0, lonMin: -97.0, lonMax: -88.0 },    // US Gulf Coast
  { latMin: 8.0, latMax: 12.0, lonMin: -80.0, lonMax: -64.0 },     // Caribbean / Venezuela
  { latMin: -25.0, latMax: -20.0, lonMin: -46.0, lonMax: -40.0 },   // Brazil
  { latMin: 7.0, latMax: 10.0, lonMin: -81.0, lonMax: -78.0 },     // Panama Canal
];


function createNPCTanker(staggered) {
  const type = NPC_SHIP_TYPES[Math.floor(Math.random() * NPC_SHIP_TYPES.length)];
  const speed = type.speed + (Math.random() - 0.5) * 2;
  const shipName = NPC_SHIP_NAMES[npcNameIndex % NPC_SHIP_NAMES.length];
  npcNameIndex++;

  const states = [NPC_STATE.HEADING_TO_TERMINAL, NPC_STATE.LOADING, NPC_STATE.HEADING_TO_DROPOFF, NPC_STATE.UNLOADING];
  const state = staggered ? states[Math.floor(Math.random() * states.length)] : NPC_STATE.HEADING_TO_DROPOFF;

  // Caution: 0 = daring (ignores risk), 1 = very cautious
  const caution = Math.random() < 0.2 ? Math.random() * 0.2 : 0.4 + Math.random() * 0.6;

  // Pick terminal and dropoff based on profitability, supply/demand, and route danger
  // Use a spawn zone center as rough origin for initial route danger estimate
  const spawnZone = NPC_SPAWN_ZONES[Math.floor(Math.random() * NPC_SPAWN_ZONES.length)];
  const roughLat = (spawnZone.latMin + spawnZone.latMax) / 2;
  const roughLon = (spawnZone.lonMin + spawnZone.lonMax) / 2;
  const terminal = pickProfitableExport(type.cargoType, roughLat, roughLon, caution)
    || Object.values(EXPORT_TERMINALS).find(t => (t.cargoType || 'oil') === type.cargoType);
  const buyPrice = getTerminalPrice(terminal, gameState?.riskLevel || 'LOW', computeNpcTraffic());
  const dropoff = pickProfitableImport(buyPrice, terminal.lat, terminal.lon, caution)
    || randomDropoff();

  const npc = {
    lat: 0, lon: 0, heading: 0, targetHeading: 0, speed, baseSpeed: speed,
    size: type.size, color: type.color, typeName: type.name, shipName,
    name: `${shipName} (${type.name})`,
    cargoType: type.cargoType,
    targetTerminal: terminal,
    dropoff,
    state,
    caution,
    waitTimer: 0,
    safeAnchorage: null,
    loadTimer: 0, wanderTimer: 5 + Math.random() * 10, wanderOffset: 0, stuckCount: 0,
    coastEscapeTimer: 0, coastEscapeHeading: 0, progressTimer: 0, progressLat: 0, progressLon: 0,
    trail: [],
    route: [],     // waypoint route [{lat,lon}, ...]
    routeIdx: 0,   // current waypoint index
    totalDamage: 0,
  };

  // Place based on state
  if (npc.state === NPC_STATE.LOADING) {
    const lp = randomWaterPos(terminal.lat - 0.1, terminal.lat + 0.1, terminal.lon - 0.1, terminal.lon + 0.1);
    npc.lat = lp.lat; npc.lon = lp.lon; npc.speed = 0;
    npc.loadTimer = 10 + Math.random() * 20;
  } else if (npc.state === NPC_STATE.UNLOADING) {
    const dp = randomWaterPos(dropoff.lat - 0.2, dropoff.lat + 0.2, dropoff.lon - 0.2, dropoff.lon + 0.2);
    npc.lat = dp.lat; npc.lon = dp.lon; npc.speed = 0;
    npc.loadTimer = 8 + Math.random() * 12;
  } else if (npc.state === NPC_STATE.HEADING_TO_TERMINAL) {
    const zone = NPC_SPAWN_ZONES[Math.floor(Math.random() * NPC_SPAWN_ZONES.length)];
    const mp = randomWaterPos(zone.latMin, zone.latMax, zone.lonMin, zone.lonMax);
    npc.lat = mp.lat; npc.lon = mp.lon;
    npc.route = computeOceanRoute(npc.lat, npc.lon, terminal.lat, terminal.lon);
    npc.route.push({ lat: terminal.lat, lon: terminal.lon, loadRadius: terminal.loadRadius || 0.15 });
    npc.routeIdx = 0;
    const wp = npc.route[0];
    npc.heading = headingToTarget(npc.lat, npc.lon, wp.lat, wp.lon);
    npc.targetHeading = npc.heading;
  } else {
    // HEADING_TO_DROPOFF
    const zone = NPC_SPAWN_ZONES[Math.floor(Math.random() * NPC_SPAWN_ZONES.length)];
    const mp = randomWaterPos(zone.latMin, zone.latMax, zone.lonMin, zone.lonMax);
    npc.lat = mp.lat; npc.lon = mp.lon;
    npc.route = computeOceanRoute(npc.lat, npc.lon, dropoff.lat, dropoff.lon);
    npc.route.push({ lat: dropoff.lat, lon: dropoff.lon, loadRadius: dropoff.loadRadius || 0.15 });
    npc.routeIdx = 0;
    const wp = npc.route[0];
    npc.heading = headingToTarget(npc.lat, npc.lon, wp.lat, wp.lon);
    npc.targetHeading = npc.heading;
  }
  return npc;
}

function spawnNPCShips() {
  npcShips = [];
  for (let i = 0; i < SIM_CONFIG.NPC_COUNT; i++) npcShips.push(createNPCTanker(true));
}

function spawnMilitaryShips() {
  militaryShips = [];
  for (const type of Object.values(MILITARY_SHIPS)) {
    const pb = type.patrolBounds;
    const pos = randomWaterPos(pb.south, pb.north, pb.west, pb.east);
    const heading = Math.random() * 360;
    militaryShips.push({
      lat: pos.lat, lon: pos.lon, heading, baseSpeed: type.speed,
      speed: 0, // start idle
      size: type.size, color: type.color, name: type.name, country: type.country,
      dangerRadius: type.dangerRadius, friendlyFireChance: type.friendlyFireChance,
      patrolBounds: pb, targetHeading: heading,
      state: 'idle', // 'idle' or 'moving'
      idleTimer: Math.random() * 180, // stagger initial idle times
      moveDest: null,
    });
  }
}

function npcShouldSeekSafety(npc) {
  const risk = RISK_LEVELS[gameState?.riskLevel] || RISK_LEVELS.LOW;
  // Higher risk + higher caution = more likely to seek safety
  // eventFrequency: LOW=0.05, MODERATE=0.15, HIGH=0.3, CRITICAL=0.5
  return npc.caution > (1 - risk.eventFrequency * 2);
}

function updateNPCShips(dt, elapsed) {
  for (let i = 0; i < npcShips.length; i++) {
    const npc = npcShips[i];

    // Trail — always expire old points so trail fades even when stopped
    // Must run before any `continue` so stopped boats still expire their trails
    const trail = npc.trail;
    if (npc.speed > 0) {
      if (trail.length === 0 || elapsed - trail[trail.length - 1].t > 0.5) {
        trail.push({ lat: npc.lat, lon: npc.lon, t: elapsed });
      }
    }
    while (trail.length > 0 && elapsed - trail[0].t > 4) trail.shift();

    // WAITING_SAFE: heading to or anchored at safe zone
    if (npc.state === NPC_STATE.WAITING_SAFE) {
      if (npc.safeAnchorage && npc.speed > 0) {
        // Still heading to anchorage — steer toward it
        const adist = distanceDeg(npc.lat, npc.lon, npc.safeAnchorage.lat, npc.safeAnchorage.lon);
        npc.targetHeading = headingToTarget(npc.lat, npc.lon, npc.safeAnchorage.lat, npc.safeAnchorage.lon);
        if (adist < 0.15) {
          npc.speed = 0;
          npc.waitTimer = 60 + Math.random() * 120;
        }
        // Fall through to movement code below
      } else {
        // Anchored — wait and periodically re-evaluate
        npc.speed = 0;
        npc.waitTimer -= dt;
        if (npc.waitTimer <= 0) {
          if (npcShouldSeekSafety(npc) && Math.random() < 0.7) {
            npc.waitTimer = 60 + Math.random() * 120;
          } else {
            npc.speed = npc.baseSpeed || 13;
            npc.state = npc.savedState || NPC_STATE.HEADING_TO_TERMINAL;
            npc._cautionChecked = true; // stay true so NPC doesn't immediately re-divert
            // Recompute route from current position
            const dest = npc.state === NPC_STATE.HEADING_TO_TERMINAL ? npc.targetTerminal : npc.dropoff;
            npc.route = computeOceanRoute(npc.lat, npc.lon, dest.lat, dest.lon);
            npc.route.push({ lat: dest.lat, lon: dest.lon, loadRadius: dest.loadRadius || 0.15 });
            npc.routeIdx = 0;
            const wp = npc.route[0];
            npc.targetHeading = headingToTarget(npc.lat, npc.lon, wp.lat, wp.lon);
          }
        }
        continue;
      }
    }

    // Stationary states
    if (npc.state === NPC_STATE.LOADING || npc.state === NPC_STATE.UNLOADING) {
      npc.loadTimer -= dt; npc.speed = 0;
      if (npc.loadTimer <= 0) {
        npc.speed = npc.baseSpeed || 13;
        if (npc.state === NPC_STATE.LOADING) {
          // Finished loading — pick best import terminal to sell at
          const loadBuyPrice = getTerminalPrice(npc.targetTerminal, gameState?.riskLevel || 'LOW', computeNpcTraffic());
          const bestImport = pickProfitableImport(loadBuyPrice, npc.lat, npc.lon, npc.caution);
          if (bestImport) npc.dropoff = bestImport;
          npc.state = NPC_STATE.HEADING_TO_DROPOFF;
          npc.route = computeOceanRoute(npc.lat, npc.lon, npc.dropoff.lat, npc.dropoff.lon);
          npc.route.push({ lat: npc.dropoff.lat, lon: npc.dropoff.lon, loadRadius: npc.dropoff.loadRadius || 0.15 });
          npc.routeIdx = 0;
          const wp = npc.route[0];
          npc.targetHeading = headingToTarget(npc.lat, npc.lon, wp.lat, wp.lon);
        } else {
          // Finished unloading — pick most profitable export terminal for next load
          const newTerminal = pickProfitableExport(npc.cargoType, npc.lat, npc.lon, npc.caution);
          npc.targetTerminal = newTerminal || npc.targetTerminal;
          const newBuyPrice = getTerminalPrice(npc.targetTerminal, gameState?.riskLevel || 'LOW', computeNpcTraffic());
          const newDropoff = pickProfitableImport(newBuyPrice, npc.targetTerminal.lat, npc.targetTerminal.lon, npc.caution);
          npc.dropoff = newDropoff || randomDropoff();
          npc.state = NPC_STATE.HEADING_TO_TERMINAL;
          npc.route = computeOceanRoute(npc.lat, npc.lon, npc.targetTerminal.lat, npc.targetTerminal.lon);
          npc.route.push({ lat: npc.targetTerminal.lat, lon: npc.targetTerminal.lon, loadRadius: npc.targetTerminal.loadRadius || 0.15 });
          npc.routeIdx = 0;
          const wp = npc.route[0];
          npc.targetHeading = headingToTarget(npc.lat, npc.lon, wp.lat, wp.lon);
        }
        npc.wanderOffset = 0;
        npc._cautionChecked = false; // re-evaluate caution on new leg
      }
      continue;
    }

    // Caution check: should this moving NPC divert to safety?
    if (npcShouldSeekSafety(npc) && !npc._cautionChecked) {
      npc._cautionChecked = true; // only check once per leg
      // Check if route passes through a danger zone
      const inDanger = DANGER_ZONES.some(z =>
        npc.lat >= z.bounds.south - 0.3 && npc.lat <= z.bounds.north + 0.3 &&
        npc.lon >= z.bounds.west - 0.3 && npc.lon <= z.bounds.east + 0.3
      );
      if (inDanger) {
        // Divert to nearest safe anchorage
        let nearest = SAFE_ANCHORAGES[0], bestDist = Infinity;
        for (const anch of SAFE_ANCHORAGES) {
          const d = distanceDeg(npc.lat, npc.lon, anch.lat, anch.lon);
          if (d < bestDist) { bestDist = d; nearest = anch; }
        }
        npc.safeAnchorage = nearest;
        npc.savedState = npc.state;
        npc.state = NPC_STATE.WAITING_SAFE;
        npc.waitTimer = 30 + Math.random() * 90; // wait 30-120s before first re-check
        npc.targetHeading = headingToTarget(npc.lat, npc.lon, nearest.lat, nearest.lon);
        // Move toward anchorage at reduced speed
        npc.speed = npc.baseSpeed * 0.6;
        continue;
      }
    }

    // Moving states — follow waypoint route, check arrival
    if (npc.state === NPC_STATE.HEADING_TO_TERMINAL || npc.state === NPC_STATE.HEADING_TO_DROPOFF) {
      // Check arrival at final destination
      const dest = npc.state === NPC_STATE.HEADING_TO_TERMINAL ? npc.targetTerminal : npc.dropoff;
      const arriveR = npc.state === NPC_STATE.HEADING_TO_TERMINAL ? (dest.loadRadius || 0.15) : (dest.radius || 0.3);
      if (distanceDeg(npc.lat, npc.lon, dest.lat, dest.lon) < arriveR) {
        if (npc.state === NPC_STATE.HEADING_TO_TERMINAL) {
          npc.state = NPC_STATE.LOADING; npc.loadTimer = 15 + Math.random() * 25;
        } else {
          npc.state = NPC_STATE.UNLOADING; npc.loadTimer = 8 + Math.random() * 12;
        }
        npc.speed = 0; continue;
      }
      // Follow waypoint route — advance to next waypoint when close
      if (npc.route && npc.route.length > 0 && npc.routeIdx < npc.route.length) {
        const wp = npc.route[npc.routeIdx];
        const wpDist = distanceDeg(npc.lat, npc.lon, wp.lat, wp.lon);
        if (wpDist < 1.5) {
          // Reached this waypoint, advance to next
          npc.routeIdx++;
        }
        if (npc.routeIdx < npc.route.length) {
          const nextWp = npc.route[npc.routeIdx];
          npc.targetHeading = headingToTarget(npc.lat, npc.lon, nextWp.lat, nextWp.lon);
        } else {
          // Past all waypoints, head directly to destination
          npc.targetHeading = headingToTarget(npc.lat, npc.lon, dest.lat, dest.lon);
        }
      } else {
        // No route — head directly (fallback for short distances)
        npc.targetHeading = headingToTarget(npc.lat, npc.lon, dest.lat, dest.lon);
      }
    }

    // Stuck detection: if ship hasn't made progress in 15 seconds, reroute
    npc.progressTimer = (npc.progressTimer || 0) + dt;
    if (npc.progressTimer > 15) {
      const moved = distanceDeg(npc.lat, npc.lon, npc.progressLat || npc.lat, npc.progressLon || npc.lon);
      if (moved < 0.3 && npc.speed > 0) {
        // Stuck — recompute route from current position
        const dest = npc.state === NPC_STATE.HEADING_TO_TERMINAL ? npc.targetTerminal : npc.dropoff;
        if (dest) {
          npc.route = computeOceanRoute(npc.lat, npc.lon, dest.lat, dest.lon);
          npc.route.push({ lat: dest.lat, lon: dest.lon, loadRadius: dest.loadRadius || 0.15 });
          npc.routeIdx = 0;
          npc.coastEscapeTimer = 0;
          npc.stuckCount = 0;
        }
      }
      npc.progressTimer = 0;
      npc.progressLat = npc.lat;
      npc.progressLon = npc.lon;
    }

    // Coast escape mode: after hitting land, commit to escape heading
    // until safely away from coast before resuming normal navigation
    if (npc.coastEscapeTimer > 0) {
      npc.coastEscapeTimer -= dt;
      // Keep heading locked to escape direction, no wander
      const diff = angleDiff(npc.heading, npc.coastEscapeHeading);
      if (Math.abs(diff) > 0.5) npc.heading = normalizeAngle(npc.heading + Math.sign(diff) * Math.min(Math.abs(diff), 2.5 * dt * 60));
      // When timer expires, check if target heading is still blocked
      if (npc.coastEscapeTimer <= 0) {
        const tgtRad = npc.targetHeading * Math.PI / 180;
        if (isOnLand(npc.lat + Math.cos(tgtRad) * 0.5, npc.lon + Math.sin(tgtRad) * 0.5)) {
          // Still blocked — find a new escape heading from current position
          for (const angle of [45, -45, 70, -70, 90, -90, 120, -120]) {
            const tryRad = normalizeAngle(npc.heading + angle) * Math.PI / 180;
            if (!isOnLand(npc.lat + Math.cos(tryRad) * 0.5, npc.lon + Math.sin(tryRad) * 0.5)) {
              npc.coastEscapeHeading = normalizeAngle(npc.heading + angle);
              npc.coastEscapeTimer = 5 + Math.random() * 3;
              npc.wanderOffset = 0;
              break;
            }
          }
        }
      }
    } else {
      // Normal steering toward target
      npc.wanderTimer -= dt;
      if (npc.wanderTimer <= 0) { npc.wanderOffset = (Math.random() - 0.5) * 5; npc.wanderTimer = 8 + Math.random() * 12; }
      const adjustedTarget = normalizeAngle(npc.targetHeading + (npc.wanderOffset || 0));
      const diff = angleDiff(npc.heading, adjustedTarget);
      if (Math.abs(diff) > 0.5) npc.heading = normalizeAngle(npc.heading + Math.sign(diff) * Math.min(Math.abs(diff), 1.5 * dt * 60));
    }

    // NPC-NPC separation: push positions apart (no steering = no orbits)
    for (let j = 0; j < npcShips.length; j++) {
      if (j === i) continue;
      const other = npcShips[j];
      if (other.speed === 0) continue;
      const d = distanceDeg(npc.lat, npc.lon, other.lat, other.lon);
      if (d < 0.1 && d > 0.001) {
        const pushStr = (0.1 - d) * 0.02;
        const dlat = (npc.lat - other.lat) / d;
        const dlon = (npc.lon - other.lon) / d;
        npc.lat += dlat * pushStr;
        npc.lon += dlon * pushStr;
      }
    }

    // Movement
    const speedDeg = npc.speed * SIM_CONFIG.KNOTS_TO_DEG_PER_SEC;
    const rad = npc.heading * Math.PI / 180;
    const newLon = npc.lon + Math.sin(rad) * speedDeg * dt;
    const newLat = npc.lat + Math.cos(rad) * speedDeg * dt;

    // Skip land avoidance when very close to destination (terminals are near coast)
    const npcDest = npc.state === NPC_STATE.HEADING_TO_TERMINAL ? npc.targetTerminal : npc.dropoff;
    const nearDestR = (npcDest && npcDest.loadRadius) ? Math.max(0.5, npcDest.loadRadius * 4) : 0.5;
    const nearDest = npcDest && distanceDeg(npc.lat, npc.lon, npcDest.lat, npcDest.lon) < nearDestR;

    // Land avoidance
    if (!isOnLand(newLat, newLon) || nearDest) {
      npc.lon = newLon; npc.lat = newLat; npc.stuckCount = 0;
      // Proactive: check multiple distances ahead for early avoidance (skip if near dest)
      if (!nearDest) {
        const lookAheads = [0.1, 0.2, 0.35, 0.5];
        for (const la of lookAheads) {
          if (isOnLand(npc.lat + Math.cos(rad) * la, npc.lon + Math.sin(rad) * la)) {
            // Find a clear direction and enter coast escape mode
            for (const angle of [45, -45, 70, -70, 90, -90, 120, -120]) {
              const tryRad = normalizeAngle(npc.heading + angle) * Math.PI / 180;
              if (!isOnLand(npc.lat + Math.cos(tryRad) * 0.5, npc.lon + Math.sin(tryRad) * 0.5)) {
                npc.coastEscapeHeading = normalizeAngle(npc.heading + angle);
                npc.coastEscapeTimer = 5 + Math.random() * 4; // commit for 5-9 seconds
                npc.wanderOffset = 0;
                break;
              }
            }
            break;
          }
        }
      }
    } else {
      npc.stuckCount = (npc.stuckCount || 0) + 1;
      const probeDist = 0.08;
      let escaped = false;
      for (const angle of [90, -90, 120, -120, 150, -150, 180]) {
        const th = normalizeAngle(npc.heading + angle);
        const tr = th * Math.PI / 180;
        if (!isOnLand(npc.lat + Math.cos(tr) * probeDist, npc.lon + Math.sin(tr) * probeDist)) {
          npc.heading = th; npc.wanderOffset = 0;
          npc.lon += Math.sin(tr) * probeDist * 0.6;
          npc.lat += Math.cos(tr) * probeDist * 0.6;
          // Enter coast escape: commit to this heading for a while
          npc.coastEscapeHeading = th;
          npc.coastEscapeTimer = 6 + Math.random() * 4; // commit for 6-10 seconds
          escaped = true; break;
        }
      }
      if (!escaped) {
        npc.heading = normalizeAngle(npc.heading + 180);
        const rr = npc.heading * Math.PI / 180;
        npc.lon += Math.sin(rr) * probeDist * 0.6;
        npc.lat += Math.cos(rr) * probeDist * 0.6;
        npc.coastEscapeHeading = npc.heading;
        npc.coastEscapeTimer = 5;
      }
      if (npc.stuckCount > 30) { npcShips[i] = createNPCTanker(false); continue; }
    }

    // Clamp latitude, wrap longitude
    npc.lat = Math.max(MAP_BOUNDS.south + 0.5, Math.min(MAP_BOUNDS.north - 0.5, npc.lat));
    npc.lon = wrapLon(npc.lon);

  }
}

function getNPCDestination(npc) {
  if (npc.state === NPC_STATE.HEADING_TO_TERMINAL) return npc.targetTerminal?.name || 'Terminal';
  if (npc.state === NPC_STATE.LOADING) return `Loading at ${npc.targetTerminal?.name || 'Terminal'}`;
  if (npc.state === NPC_STATE.HEADING_TO_DROPOFF) return npc.dropoff?.name || 'Destination';
  if (npc.state === NPC_STATE.UNLOADING) return `Unloading at ${npc.dropoff?.name || 'Destination'}`;
  if (npc.state === NPC_STATE.WAITING_SAFE) {
    if (npc.speed > 0) return `Diverting to ${npc.safeAnchorage?.name || 'safe zone'}`;
    return `Anchored at ${npc.safeAnchorage?.name || 'safe zone'}`;
  }
  return 'Unknown';
}

function updateMilitaryShips(dt) {
  for (const mil of militaryShips) {
    const pb = mil.patrolBounds;

    if (mil.state === 'idle') {
      mil.speed = 0;
      mil.idleTimer -= dt;
      if (mil.idleTimer <= 0) {
        // Pick a nearby point within patrol zone (small adjustment)
        const offsetLat = (Math.random() - 0.5) * (pb.north - pb.south) * 0.3;
        const offsetLon = (Math.random() - 0.5) * (pb.east - pb.west) * 0.3;
        let destLat = mil.lat + offsetLat;
        let destLon = mil.lon + offsetLon;
        // Clamp within patrol bounds
        destLat = Math.max(pb.south, Math.min(pb.north, destLat));
        destLon = Math.max(pb.west, Math.min(pb.east, destLon));
        mil.moveDest = { lat: destLat, lon: destLon };
        mil.targetHeading = headingToTarget(mil.lat, mil.lon, destLat, destLon);
        mil.state = 'moving';
        mil.speed = mil.baseSpeed * (0.3 + Math.random() * 0.3); // slow repositioning
      }
    } else if (mil.state === 'moving') {
      // Check if arrived at destination
      const dist = distanceDeg(mil.lat, mil.lon, mil.moveDest.lat, mil.moveDest.lon);
      if (dist < 0.02) {
        mil.state = 'idle';
        mil.idleTimer = 150 + Math.random() * 60; // ~3 minutes idle
        mil.speed = 0;
        continue;
      }
      // Steer toward destination
      mil.targetHeading = headingToTarget(mil.lat, mil.lon, mil.moveDest.lat, mil.moveDest.lon);
    }

    // Turn toward target heading
    const diff = angleDiff(mil.heading, mil.targetHeading);
    if (Math.abs(diff) > 0.5) mil.heading = normalizeAngle(mil.heading + Math.sign(diff) * Math.min(Math.abs(diff), 2.0 * dt * 60));

    // Move
    const speedDeg = mil.speed * SIM_CONFIG.KNOTS_TO_DEG_PER_SEC;
    const rad = mil.heading * Math.PI / 180;
    const newLon = mil.lon + Math.sin(rad) * speedDeg * dt;
    const newLat = mil.lat + Math.cos(rad) * speedDeg * dt;
    if (!isOnLand(newLat, newLon)) { mil.lon = newLon; mil.lat = newLat; }
    else { mil.targetHeading = normalizeAngle(mil.heading + 90 + Math.random() * 90); }
  }
}

// ============================================

// ============================================
// TRANSIT LOOP
// ============================================
function transitLoop(timestamp) {
  if (!transitActive) return;
  _currentFrame++;
  try { _transitLoopInner(timestamp); } catch (e) { console.error('Transit loop fatal error:', e); }
  requestAnimationFrame(transitLoop);
}

function _transitLoopInner(timestamp) {

  // Real frame delta for consistent speed
  const realDt = Math.min((timestamp - lastFrameTime) / 1000, 0.1);
  lastFrameTime = timestamp;
  const dt = serverSimActive ? realDt : realDt * gameSpeedMultiplier;
  const elapsed = (timestamp - simStartTime) / 1000;
  if (!serverSimActive) {
    simGameTime += realDt * SIM_CONFIG.TIME_SCALE * gameSpeedMultiplier;
  } else {
    simGameTime += realDt * SIM_CONFIG.TIME_SCALE;
  }

  const me = getMe();

  // Update each player ship (skip when server simulation is active)
  if (me && !serverSimActive) {
    for (const ship of me.fleet) {
      const state = shipStates[ship.id];
      if (!state || state.destroyed || state.seized) continue;

      try {
      // Autopilot: auto-manage waypoints for terminal ↔ dropoff loop
      const ap = shipAutopilot[ship.id];
      const apActive = ap && ap.active;
      if (apActive && ap.terminal && ap.dropoff) {
        const cargo = shipCargo[ship.id];
        const curWps = shipWaypoints[ship.id] || [];
        if (curWps.length === 0 && state.speed === 0) {
          // If empty → head to load terminal; if loaded → head to dropoff
          const destT = (cargo && cargo.loaded) ? ap.dropoff : ap.terminal;
          if (destT && destT.lat != null && destT.lon != null) {
            const dest = { lat: destT.lat, lon: destT.lon };
            const route = computeAutopilotRoute(state.lat, state.lon, dest.lat, dest.lon, destT?.loadRadius || 0.15);
            shipWaypoints[ship.id] = route;
            state.speed = Math.round(ship.speed || 14);
            if (route.length > 0) {
              state.targetHeading = headingToTarget(state.lat, state.lon, route[0].lat, route[0].lon);
            }
          }
        }
      }

      // Read waypoints fresh (autopilot block above may have replaced them)
      const wps = shipWaypoints[ship.id] || [];

      // Waypoint navigation (skip during coast escape — committed to escape heading)
      const apEscaping = apActive && state.apCoastEscapeTimer > 0;
      if (wps.length > 0 && !apEscaping) {
        const wp = wps[0];
        const distToWP = distanceDeg(state.lat, state.lon, wp.lat, wp.lon);
        if (distToWP < 0.03) {
          wps.shift();
          if (ship.id === selectedShipId) updateClearWpButton();
          if (wps.length > 0) {
            const next = wps[0];
            state.targetHeading = headingToTarget(state.lat, state.lon, next.lat, next.lon);
          } else { state.speed = 0; }
        } else {
          state.targetHeading = headingToTarget(state.lat, state.lon, wp.lat, wp.lon);
        }
      }

      // Autopilot stuck detection: if ship hasn't made progress in 15 seconds, reroute
      if (apActive && state.speed > 0) {
        state.progressTimer = (state.progressTimer || 0) + dt;
        if (state.progressTimer > 15) {
          const moved = distanceDeg(state.lat, state.lon, state.progressLat || state.lat, state.progressLon || state.lon);
          if (moved < 0.3) {
            // Stuck — recompute route from current position
            const cargo = shipCargo[ship.id];
            const destTerminal2 = (cargo && cargo.loaded) ? ap.dropoff : ap.terminal;
            if (destTerminal2 && destTerminal2.lat != null && destTerminal2.lon != null) {
              const dest = { lat: destTerminal2.lat, lon: destTerminal2.lon };
              const route = computeAutopilotRoute(state.lat, state.lon, dest.lat, dest.lon, destTerminal2?.loadRadius || 0.15);
              shipWaypoints[ship.id] = route;
              state.apCoastEscapeTimer = 0;
              if (route.length > 0) {
                state.targetHeading = headingToTarget(state.lat, state.lon, route[0].lat, route[0].lon);
              }
            }
          }
          state.progressTimer = 0;
          state.progressLat = state.lat;
          state.progressLon = state.lon;
        }
      }

      // Autopilot land avoidance — same proven approach as NPC ships:
      // commit to escape heading when coast detected, ignore waypoints until clear
      if (apActive && state.speed > 0) {
        const hasRouteWps = (shipWaypoints[ship.id] || []).length > 0;
        if (state.apCoastEscapeTimer > 0) {
          // Committed to escape heading — steer toward it, ignore waypoints
          state.apCoastEscapeTimer -= dt;
          const diff = angleDiff(state.heading, state.apCoastEscapeHeading);
          if (Math.abs(diff) > 0.5) {
            state.heading = normalizeAngle(state.heading + Math.sign(diff) * Math.min(Math.abs(diff), 2.5 * dt * 60));
          }
          state.targetHeading = state.apCoastEscapeHeading;
          // When timer expires, check if target heading is still blocked
          if (state.apCoastEscapeTimer <= 0) {
            const tgtRad = state.targetHeading * Math.PI / 180;
            const wps = shipWaypoints[ship.id] || [];
            const resumeHeading = wps.length > 0
              ? headingToTarget(state.lat, state.lon, wps[0].lat, wps[0].lon)
              : state.targetHeading;
            const resumeRad = resumeHeading * Math.PI / 180;
            const recheckDist = hasRouteWps ? 0.2 : 0.5;
            if (isOnLand(state.lat + Math.cos(resumeRad) * recheckDist, state.lon + Math.sin(resumeRad) * recheckDist)) {
              // Still blocked — find a new escape heading
              const recheckEscape = hasRouteWps ? 2 + Math.random() * 2 : 5 + Math.random() * 3;
              for (const angle of [45, -45, 70, -70, 90, -90, 120, -120]) {
                const tryRad = normalizeAngle(state.heading + angle) * Math.PI / 180;
                if (!isOnLand(state.lat + Math.cos(tryRad) * recheckDist, state.lon + Math.sin(tryRad) * recheckDist)) {
                  state.apCoastEscapeHeading = normalizeAngle(state.heading + angle);
                  state.apCoastEscapeTimer = recheckEscape;
                  state.targetHeading = state.apCoastEscapeHeading;
                  break;
                }
              }
            }
          }
        } else {
          // Proactive lookahead: check ahead for land
          // Use shorter lookahead when following route waypoints (trusted path)
          const headRad = state.heading * Math.PI / 180;
          const lookDistances = hasRouteWps ? [0.05, 0.1, 0.15] : [0.1, 0.2, 0.35, 0.5];
          const escapeCheckDist = hasRouteWps ? 0.2 : 0.5;
          const escapeTime = hasRouteWps ? 2 + Math.random() * 2 : 5 + Math.random() * 4;
          for (const la of lookDistances) {
            if (isOnLand(state.lat + Math.cos(headRad) * la, state.lon + Math.sin(headRad) * la)) {
              for (const angle of [45, -45, 70, -70, 90, -90, 120, -120]) {
                const tryRad = normalizeAngle(state.heading + angle) * Math.PI / 180;
                if (!isOnLand(state.lat + Math.cos(tryRad) * escapeCheckDist, state.lon + Math.sin(tryRad) * escapeCheckDist)) {
                  state.apCoastEscapeHeading = normalizeAngle(state.heading + angle);
                  state.apCoastEscapeTimer = escapeTime;
                  state.targetHeading = state.apCoastEscapeHeading;
                  break;
                }
              }
              break;
            }
          }

          // Avoid NPC ships (gentle steering)
          for (const npc of npcShips) {
            const d = distanceDeg(state.lat, state.lon, npc.lat, npc.lon);
            if (d < 0.08 && d > 0.001) {
              const awayAngle = headingToTarget(npc.lat, npc.lon, state.lat, state.lon);
              const steerDiff = angleDiff(state.targetHeading, awayAngle);
              state.targetHeading = normalizeAngle(state.targetHeading + Math.sign(steerDiff) * Math.min(Math.abs(steerDiff), 15));
            }
          }
          // Avoid military ships (gentle steering)
          for (const mil of militaryShips) {
            const d = distanceDeg(state.lat, state.lon, mil.lat, mil.lon);
            if (d < (mil.dangerRadius + 0.05) && d > 0.001) {
              const awayAngle = headingToTarget(mil.lat, mil.lon, state.lat, state.lon);
              const steerDiff = angleDiff(state.targetHeading, awayAngle);
              state.targetHeading = normalizeAngle(state.targetHeading + Math.sign(steerDiff) * Math.min(Math.abs(steerDiff), 20));
            }
          }
        }
      }

      // Turn toward target heading
      const headingDiff = angleDiff(state.heading, state.targetHeading);
      if (Math.abs(headingDiff) > 0.5) {
        state.heading = normalizeAngle(state.heading + Math.sign(headingDiff) * Math.min(Math.abs(headingDiff), SIM_CONFIG.TURN_RATE * dt * 60));
      }

      // Move
      const speedDeg = state.speed * SIM_CONFIG.KNOTS_TO_DEG_PER_SEC;
      const headingRad = state.heading * Math.PI / 180;
      const newLon = state.lon + Math.sin(headingRad) * speedDeg * dt;
      const newLat = state.lat + Math.cos(headingRad) * speedDeg * dt;
      // Skip land check when very close to waypoint destination (terminals near coast)
      const nextWpDest = (shipWaypoints[ship.id] || [])[0];
      const wpDestR = (nextWpDest && nextWpDest.loadRadius) ? Math.max(0.5, nextWpDest.loadRadius * 4) : 0.5;
      const nearWpDest = nextWpDest && distanceDeg(state.lat, state.lon, nextWpDest.lat, nextWpDest.lon) < wpDestR;
      if (!isOnLand(newLat, newLon) || nearWpDest) { state.lon = newLon; state.lat = newLat; }
      else if (apActive) {
        // Autopilot hit land: same approach as NPC — probe for clear direction, nudge, commit
        const probeDist = 0.08;
        let escaped = false;
        for (const angle of [90, -90, 120, -120, 150, -150, 180]) {
          const th = normalizeAngle(state.heading + angle);
          const tr = th * Math.PI / 180;
          if (!isOnLand(state.lat + Math.cos(tr) * probeDist, state.lon + Math.sin(tr) * probeDist)) {
            state.heading = th;
            state.lon += Math.sin(tr) * probeDist * 0.6;
            state.lat += Math.cos(tr) * probeDist * 0.6;
            state.apCoastEscapeHeading = th;
            state.apCoastEscapeTimer = 4 + Math.random() * 3;
            state.targetHeading = th;
            escaped = true;
            break;
          }
        }
        if (!escaped) {
          state.heading = normalizeAngle(state.heading + 180);
          const rr = state.heading * Math.PI / 180;
          state.lon += Math.sin(rr) * probeDist * 0.6;
          state.lat += Math.cos(rr) * probeDist * 0.6;
          state.apCoastEscapeHeading = state.heading;
          state.apCoastEscapeTimer = 5;
        }
      }
      else { state.speed = Math.max(0, Math.round(state.speed * 0.5)); shipWaypoints[ship.id] = []; if (ship.id === selectedShipId) updateClearWpButton(); }

      state.lat = Math.max(MAP_BOUNDS.south + 0.5, Math.min(MAP_BOUNDS.north - 0.5, state.lat));
      state.lon = wrapLon(state.lon);

      // Overspeed reliability check — pushing beyond rated speed risks malfunction
      const ratedSpeed = ship.speed || 16;
      if (state.speed > ratedSpeed && !state.destroyed && !state.seized) {
        const overRatio = (state.speed - ratedSpeed) / (20 - ratedSpeed || 1);
        // Higher overspeed = higher malfunction chance per tick
        const malfunctionProb = 0.0005 + overRatio * 0.003;
        if (Math.random() < malfunctionProb * dt * 60) {
          const roll = Math.random();
          if (roll < 0.4) {
            // Engine stall — speed drops to half rated
            state.speed = Math.round(ratedSpeed * 0.5);
            addTransitEvent('ENGINE MALFUNCTION', `${ship.name}: Engine stall from overspeed! Speed reduced to ${state.speed} kts.`, 'danger');
          } else if (roll < 0.75) {
            // Mechanical damage
            const dmg = 0.03 + overRatio * 0.07;
            state.totalDamage = Math.min(0.89, state.totalDamage + dmg);
            state.speed = Math.round(Math.min(state.speed, ratedSpeed));
            addTransitEvent('MECHANICAL FAILURE', `${ship.name}: Hull stress damage (${Math.round(dmg * 100)}%) from overspeed!`, 'danger');
          } else {
            // Fuel system failure — dead stop
            state.speed = 0;
            addTransitEvent('FUEL SYSTEM FAILURE', `${ship.name}: Fuel line rupture from overspeed! Engines offline.`, 'danger');
          }
          _fleetPanelDirty = true;
        }
      }

      // Trail - expire points older than 60 seconds
      const trail = shipTrails[ship.id];
      if (trail) {
        if (trail.length === 0 || elapsed - trail[trail.length - 1].t > 0.5) {
          trail.push({ lat: state.lat, lon: state.lon, t: elapsed });
        }
        while (trail.length > 0 && elapsed - trail[0].t > 4) trail.shift();
      }

      // Terminal cargo loading at EXPORT terminals (cargo type must match)
      const cargo = shipCargo[ship.id];
      if (cargo && !cargo.loaded) {
        const shipCargoType = ship.cargoType || 'oil';
        for (const terminal of Object.values(EXPORT_TERMINALS)) {
          const terminalCargoType = terminal.cargoType || 'oil';
          if (shipCargoType !== terminalCargoType) continue;
          const dist = distanceDeg(state.lat, state.lon, terminal.lat, terminal.lon);
          if (dist < (terminal.loadRadius || SIM_CONFIG.LOAD_RADIUS)) {
            const buyPrice = getLivePrice(terminal);
            const cost = Math.round(ship.capacity * buyPrice);
            cargo.loaded = true; cargo.terminal = terminal; cargo.terminalId = terminal.id;
            cargo.buyCost = cost;
            const label = shipCargoType === 'lng' ? 'LNG LOADED' : 'CARGO LOADED';
            addTransitEvent(label, `${ship.name}: Loaded ${shipCargoType.toUpperCase()} at ${terminal.name} for ${formatMoney(cost)}.`, 'success');
            // Stop and clear waypoints so autopilot immediately routes to dropoff
            if (apActive) { shipWaypoints[ship.id] = []; state.speed = 0; }
            _fleetPanelDirty = true; break;
          }
        }
      }

      // Delivery check at IMPORT terminals
      if (cargo && cargo.loaded && !cargo.delivered) {
        for (const dp of Object.values(IMPORT_TERMINALS)) {
          const dropDist = distanceDeg(state.lat, state.lon, dp.lat, dp.lon);
          if (dropDist < (dp.loadRadius || 0.3)) {
            // Revenue = sell price × capacity × (1 - damage) - buy cost
            const isLng = (ship.cargoType || 'oil') === 'lng';
            const sellPrice = isLng ? (dp.lngSellPrice || dp.sellPrice || 85) : getLivePrice(dp);
            const grossRevenue = Math.round(ship.capacity * sellPrice * (1 - state.totalDamage));
            const buyCost = cargo.buyCost || 0;
            const profit = grossRevenue - buyCost;
            const revenue = Math.max(0, grossRevenue);
            socket.emit('deliver_cargo', { shipId: ship.id, revenue: profit });
            // Track campaign stats
            campaignStats.deliveries++;
            campaignStats.totalRevenue += grossRevenue;
            campaignStats.totalCosts += buyCost;
            campaignStats.totalProfit += profit;
            shipCargo[ship.id] = { loaded: false, terminal: null, terminalId: null };
            addTransitEvent('CARGO DELIVERED', `${ship.name}: Arrived at ${dp.name}. Sold for ${formatMoney(grossRevenue)} (profit: ${formatMoney(profit)})`, 'success');
            // Stop and clear waypoints so autopilot immediately routes back to load terminal
            if (apActive) { shipWaypoints[ship.id] = []; state.speed = 0; }
            _fleetPanelDirty = true;
            break;
          }
        }
      }

      // Destruction check
      if (state.totalDamage >= 0.9 && !state.destroyed) {
        state.destroyed = true;
        campaignStats.shipsLost++;
        addTransitEvent('VESSEL DESTROYED', `${ship.name} has been destroyed!`, 'danger');
        // Report destruction to server for insurance payout and fleet removal
        socket.emit('ship_destroyed', { shipId: ship.id }, (res) => {
          if (res?.success) {
            if (res.insurancePayout > 0) {
              addTransitEvent('INSURANCE PAYOUT',
                `Received ${formatMoney(res.insurancePayout)} insurance payout for ${ship.name}.`, 'success');
            }
            // Remove from local fleet
            const me = getMe();
            if (me) {
              me.fleet = me.fleet.filter(s => s.id !== ship.id);
            }
            // Clean up local state
            delete shipStates[ship.id];
            delete shipWaypoints[ship.id];
            delete shipTrails[ship.id];
            delete shipCargo[ship.id];
            delete shipAutopilot[ship.id];
            if (selectedShipId === ship.id) {
              selectedShipId = me?.fleet[0]?.id || null;
            }
            updateFleetPanel();
          }
        });
        _fleetPanelDirty = true;
      }
      } catch (e) {
        console.error(`Transit loop error for ship ${ship.id}:`, e);
      }
    }
  }

  if (!serverSimActive) {
    try { updateNPCShips(dt, elapsed); } catch (e) { console.error('NPC update error:', e); }
    updateMilitaryShips(dt);

    if (elapsed - lastEventCheck > SIM_CONFIG.EVENT_CHECK_INTERVAL / 1000) {
      lastEventCheck = elapsed;
      try { checkDangerZonesAllShips(elapsed); } catch (e) { console.error('Danger zone check error:', e); }
      try { checkAisFines(elapsed); } catch (e) { console.error('AIS fine check error:', e); }
    }

    try { updateAmbientWar(elapsed); } catch (e) { console.error('Ambient war error:', e); }
    updateRegionIntensity(elapsed);
  } else {
    // Server sim active: lerp all ship positions toward server targets
    const lerpRate = 1 - Math.pow(0.001, realDt); // ~smooth over ~150ms

    // Player ships
    const me = getMe();
    if (me) {
      for (const ship of me.fleet) {
        const state = shipStates[ship.id];
        const target = serverTargets[ship.id];
        if (!state || !target) continue;
        // Dead-reckon toward target using heading/speed, then lerp to correct drift
        const speedDeg = state.speed * SIM_CONFIG.KNOTS_TO_DEG_PER_SEC;
        const headingRad = state.heading * Math.PI / 180;
        state.lon += Math.sin(headingRad) * speedDeg * dt;
        state.lat += Math.cos(headingRad) * speedDeg * dt;
        // Lerp toward server authoritative position
        state.lat += (target.lat - state.lat) * lerpRate;
        state.lon += (target.lon - state.lon) * lerpRate;
        state.heading += (target.heading - state.heading) * lerpRate;
      }
    }

    // NPC ships
    for (let i = 0; i < npcShips.length; i++) {
      const npc = npcShips[i];
      const target = serverNpcTargets[i];
      if (!target || npc.lat === undefined) continue;
      const speedDeg = (npc.speed || 0) * SIM_CONFIG.KNOTS_TO_DEG_PER_SEC;
      const headingRad = (npc.heading || 0) * Math.PI / 180;
      npc.lon += Math.sin(headingRad) * speedDeg * dt;
      npc.lat += Math.cos(headingRad) * speedDeg * dt;
      npc.lat += (target.lat - npc.lat) * lerpRate;
      npc.lon += (target.lon - npc.lon) * lerpRate;
      npc.heading += (target.heading - npc.heading) * lerpRate;
    }

    // Military ships
    for (let i = 0; i < militaryShips.length; i++) {
      const mil = militaryShips[i];
      const target = serverMilTargets[i];
      if (!target || mil.lat === undefined) continue;
      const speedDeg = (mil.speed || 0) * SIM_CONFIG.KNOTS_TO_DEG_PER_SEC;
      const headingRad = (mil.heading || 0) * Math.PI / 180;
      mil.lon += Math.sin(headingRad) * speedDeg * dt;
      mil.lat += Math.cos(headingRad) * speedDeg * dt;
      mil.lat += (target.lat - mil.lat) * lerpRate;
      mil.lon += (target.lon - mil.lon) * lerpRate;
      mil.heading += (target.heading - mil.heading) * lerpRate;
    }
  }

  // Batch fleet panel updates — only rebuild DOM once per frame
  if (_fleetPanelDirty) {
    _fleetPanelDirty = false;
    updateFleetPanel();
  }

  updateHUD();

  // Campaign end check
  if (!campaignEnded && simGameTime >= CAMPAIGN_DURATION) {
    campaignEnded = true;
    showCampaignReport();
  }

  // Render
  const selectedState = selectedShipId ? shipStates[selectedShipId] : null;
  const selectedWps = selectedShipId ? (shipWaypoints[selectedShipId] || []) : [];

  const playerShips = [];
  const allTrails = [];
  if (me) {
    for (const ship of me.fleet) {
      const st = shipStates[ship.id];
      if (st && !st.destroyed && !st.seized) {
        playerShips.push({ lat: st.lat, lon: st.lon, heading: st.heading, isSelected: ship.id === selectedShipId });
        const t = shipTrails[ship.id];
        if (t && t.length > 1) allTrails.push({ trail: t, color: ship.id === selectedShipId ? 'rgba(240, 160, 48,' : 'rgba(64, 192, 112,' });
      }
    }
  }
  for (const npc of npcShips) {
    if (npc.trail && npc.trail.length > 1) allTrails.push({ trail: npc.trail, color: 'rgba(100, 120, 160,' });
  }

  let termPrices;
  try { termPrices = computeLocalTerminalPrices(); } catch (e) { termPrices = gameState?.terminalPrices || null; }

  drawMap(mapCanvas, {
    showZones: false, showFinish: false, showTerminals: true, showSpawn: false,
    selectedTerminalId: null,
    terminalPrices: termPrices,
    ship: selectedState, allTrails,
    targetPoint: selectedWps.length > 0 ? selectedWps[0] : null,
    waypoints: selectedWps,
    npcShips, militaryShips, showMinimap: true, playerShips,
    labels: mapLabelSettings,
    sunLon: getSunLon(),
  });

  if (selectedState) drawCompass(compassCanvas, selectedState.heading);
}

// ============================================
// HUD UPDATE
// ============================================
function updateHUD() {
  try {
  const day = getCampaignDay();
  const hourOfDay = Math.floor(getGameHour());
  const minuteOfDay = Math.floor((simGameTime % 3600) / 60);
  const timeStr = `${String(hourOfDay).padStart(2,'0')}:${String(minuteOfDay).padStart(2,'0')}`;
  const selState = selectedShipId ? shipStates[selectedShipId] : null;
  const nightIcon = (selState && isNightAtLon(selState.lon)) ? ' [NIGHT]' : '';
  document.getElementById('hud-time').textContent = `DAY ${Math.min(day, CAMPAIGN_DAYS)} - ${timeStr}${nightIcon}`;

  const state = selectedShipId ? shipStates[selectedShipId] : null;
  const ship = getSelectedShipData();

  if (state && ship) {
    const ratedSpd = ship.speed || 16;
    const speedEl = document.getElementById('hud-speed');
    speedEl.textContent = `${state.speed} kts`;
    speedEl.style.color = state.speed > ratedSpd ? '#e04040' : state.speed > 0 ? '#40c070' : '#6b7394';
    document.getElementById('hud-heading').innerHTML = `${Math.round(state.heading)}&deg;`;
    const hp = state.health - state.totalDamage;
    document.getElementById('hud-health').textContent = `${Math.round(hp * 100)}%`;
    document.getElementById('hud-health').style.color = hp > 0.7 ? '#40c070' : hp > 0.4 ? '#f0a030' : '#e04040';
    document.getElementById('hud-ship-name').textContent = ship.name;
    const cargo = shipCargo[selectedShipId];
    const cargoEl = document.getElementById('hud-cargo-status');
    if (cargo?.delivered) { cargoEl.textContent = 'DELIVERED'; cargoEl.className = 'hud-cargo loaded'; }
    else if (cargo?.loaded) {
      const ap = shipAutopilot[selectedShipId];
      const dropName = (ap && ap.dropoff) ? ap.dropoff.name : 'an import terminal';
      cargoEl.textContent = `LOADED - Sell at ${dropName}`; cargoEl.className = 'hud-cargo loading';
    }
    else { cargoEl.textContent = 'BUY CARGO AT EXPORT TERMINAL'; cargoEl.className = 'hud-cargo loading'; }
    document.getElementById('hud-progress').textContent = cargo?.delivered ? 'DONE' : cargo?.loaded ? 'LOADED' : 'EMPTY';
  } else {
    document.getElementById('hud-speed').textContent = '-- kts';
    document.getElementById('hud-heading').innerHTML = '--&deg;';
    document.getElementById('hud-health').textContent = '--%';
    document.getElementById('hud-ship-name').textContent = 'Select a ship';
    document.getElementById('hud-cargo-status').textContent = 'BUY OR SELECT A SHIP';
    document.getElementById('hud-cargo-status').className = 'hud-cargo loading';
    document.getElementById('hud-progress').textContent = '--';
  }
  } catch (e) { console.error('updateHUD error:', e); }
}

// ============================================
// CAMPAIGN REPORT CARD
// ============================================
function showCampaignReport() {
  transitActive = false;
  const me = getMe();
  const cash = me?.cash || 0;
  const fleetSize = me?.fleet.length || 0;

  // Grade based on profit
  let grade, gradeColor;
  if (campaignStats.totalProfit >= 5000000) { grade = 'S'; gradeColor = '#ffd700'; }
  else if (campaignStats.totalProfit >= 2000000) { grade = 'A'; gradeColor = '#40c070'; }
  else if (campaignStats.totalProfit >= 1000000) { grade = 'B'; gradeColor = '#4090d0'; }
  else if (campaignStats.totalProfit >= 500000) { grade = 'C'; gradeColor = '#f0a030'; }
  else if (campaignStats.totalProfit >= 0) { grade = 'D'; gradeColor = '#e06040'; }
  else { grade = 'F'; gradeColor = '#e04040'; }

  const report = `
    <div style="text-align:center; padding: 20px;">
      <h1 style="color: var(--accent); margin-bottom: 5px;">CAMPAIGN COMPLETE</h1>
      <p style="color: var(--text-muted); margin-bottom: 20px;">7-Day Campaign Report</p>
      <div style="font-size: 64px; font-weight: bold; color: ${gradeColor}; margin: 10px 0;">${grade}</div>
      <p style="color: var(--text-muted); font-size: 12px; margin-bottom: 20px;">OVERALL GRADE</p>
      <div style="text-align: left; max-width: 350px; margin: 0 auto;">
        <div style="display:flex; justify-content:space-between; padding: 6px 0; border-bottom: 1px solid rgba(240,160,48,0.15);">
          <span style="color: var(--text-muted);">Total Profit</span>
          <span style="color: ${campaignStats.totalProfit >= 0 ? '#40c070' : '#e04040'}; font-weight: bold;">${formatMoney(campaignStats.totalProfit)}</span>
        </div>
        <div style="display:flex; justify-content:space-between; padding: 6px 0; border-bottom: 1px solid rgba(240,160,48,0.15);">
          <span style="color: var(--text-muted);">Total Revenue</span>
          <span>${formatMoney(campaignStats.totalRevenue)}</span>
        </div>
        <div style="display:flex; justify-content:space-between; padding: 6px 0; border-bottom: 1px solid rgba(240,160,48,0.15);">
          <span style="color: var(--text-muted);">Cargo Costs</span>
          <span>${formatMoney(campaignStats.totalCosts)}</span>
        </div>
        <div style="display:flex; justify-content:space-between; padding: 6px 0; border-bottom: 1px solid rgba(240,160,48,0.15);">
          <span style="color: var(--text-muted);">Deliveries</span>
          <span>${campaignStats.deliveries}</span>
        </div>
        <div style="display:flex; justify-content:space-between; padding: 6px 0; border-bottom: 1px solid rgba(240,160,48,0.15);">
          <span style="color: var(--text-muted);">Ships Bought</span>
          <span>${campaignStats.shipsBought}</span>
        </div>
        <div style="display:flex; justify-content:space-between; padding: 6px 0; border-bottom: 1px solid rgba(240,160,48,0.15);">
          <span style="color: var(--text-muted);">Ships Lost</span>
          <span style="color: ${campaignStats.shipsLost > 0 ? '#e04040' : '#40c070'};">${campaignStats.shipsLost}</span>
        </div>
        <div style="display:flex; justify-content:space-between; padding: 6px 0; border-bottom: 1px solid rgba(240,160,48,0.15);">
          <span style="color: var(--text-muted);">Missile Events</span>
          <span>${campaignStats.missileEvents}</span>
        </div>
        <div style="display:flex; justify-content:space-between; padding: 6px 0; border-bottom: 1px solid rgba(240,160,48,0.15);">
          <span style="color: var(--text-muted);">Total Damage Taken</span>
          <span>${Math.round(campaignStats.totalDamageTaken * 100)}%</span>
        </div>
        <div style="display:flex; justify-content:space-between; padding: 6px 0;">
          <span style="color: var(--text-muted);">Final Cash</span>
          <span style="font-weight: bold;">${formatMoney(cash)}</span>
        </div>
      </div>
    </div>`;

  showScreen('gameover');
  document.getElementById('final-leaderboard').innerHTML = report;
}

// ============================================
// AMBIENT WAR - missiles and planes fly between bases independent of ships
// ============================================
let lastIranianCheck = 0;
let lastAlliedCheck = 0;
// Independent intervals so Iranian and allied salvos don't always coincide
const IRANIAN_INTERVAL = 3;  // seconds between Iranian launch checks
const ALLIED_INTERVAL = 3;   // seconds between allied launch checks
const HOUTHI_INTERVAL = 5;   // seconds between Houthi launch checks (less frequent)
const HOUTHI_COUNTER_INTERVAL = 6;
// Stagger initial offsets so they don't start in sync
let iranianOffset = 0;
let alliedOffset = 1.5 + Math.random() * 1.5; // 1.5-3s after Iranian
let houthiOffset = 2 + Math.random() * 2;
let houthiCounterOffset = 3.5 + Math.random() * 2;
let lastHouthiCheck = -999;
let lastHouthiCounterCheck = -999;

// War zone bounds — missiles only target ships within this region
// Covers the Persian Gulf, Strait of Hormuz, Gulf of Oman, Red Sea, and Arabian Sea
const WAR_ZONE = { north: 33, south: 10, west: 32, east: 65 };

function isInWarZone(lat, lon) {
  return lat >= WAR_ZONE.south && lat <= WAR_ZONE.north &&
         lon >= WAR_ZONE.west && lon <= WAR_ZONE.east;
}

// Add slight randomness to impact point (scatter around target)
function scatterTarget(lat, lon) {
  const scatter = 0.08; // ~8km spread
  return {
    lat: lat + (Math.random() - 0.5) * scatter,
    lon: lon + (Math.random() - 0.5) * scatter
  };
}

// Pick a missile/plane target for a given side
// 50% military base, 20% city, 30% random land on enemy territory
function pickMissileTarget(bases, cities) {
  const roll = Math.random();
  if (roll < 0.50 && bases.length > 0) {
    const t = bases[Math.floor(Math.random() * bases.length)];
    return scatterTarget(t.lat, t.lon);
  } else if (roll < 0.70 && cities.length > 0) {
    const t = cities[Math.floor(Math.random() * cities.length)];
    return scatterTarget(t.lat, t.lon);
  } else {
    // Random land hit on enemy territory — pick a point near a known location
    // and scatter widely to simulate hitting random infrastructure/terrain
    const all = [...bases, ...cities];
    if (all.length === 0) return null;
    const t = all[Math.floor(Math.random() * all.length)];
    // Wide scatter: 0.3-0.8 degrees (~30-80km) from known location
    const angle = Math.random() * Math.PI * 2;
    const dist = 0.3 + Math.random() * 0.5;
    const candidate = { lat: t.lat + Math.sin(angle) * dist, lon: t.lon + Math.cos(angle) * dist };
    // Verify it's on land; if not, fall back to tighter scatter
    if (isOnLand(candidate.lat, candidate.lon)) return candidate;
    return { lat: t.lat + (Math.random() - 0.5) * 0.3, lon: t.lon + (Math.random() - 0.5) * 0.3 };
  }
}

function updateAmbientWar(elapsed) {
  const risk = RISK_LEVELS[gameState?.riskLevel] || RISK_LEVELS.LOW;
  const ambientChance = risk.eventFrequency;
  const rl = gameState?.riskLevel || 'LOW';
  const planeChance = rl === 'CRITICAL' ? 0.5 : rl === 'HIGH' ? 0.25 : rl === 'MODERATE' ? 0.4 : 0.4;

  const iranMissileBases = MILITARY_BASES.filter(b => b.country === 'Iran' && (b.type === 'missile' || b.type === 'naval'));
  const iranAirBases = MILITARY_BASES.filter(b => b.country === 'Iran' && b.type === 'air');
  const iranCities = CITIES.filter(c => c.country === 'Iran');

  const alliedCountries = ['US', 'UAE', 'Oman', 'Qatar', 'Bahrain', 'Kuwait', 'Israel'];
  const alliedBases = MILITARY_BASES.filter(b => alliedCountries.includes(b.country));
  const alliedMissileBases = MILITARY_BASES.filter(b => alliedCountries.includes(b.country) && (b.type !== 'radar'));
  const alliedAirBases = MILITARY_BASES.filter(b => alliedCountries.includes(b.country) && b.type === 'air');
  const alliedCities = CITIES.filter(c => alliedCountries.includes(c.country));

  // --- Iranian salvo (independent timer) ---
  const iranTime = elapsed - iranianOffset;
  if (iranTime >= 0 && iranTime - lastIranianCheck >= IRANIAN_INTERVAL) {
    lastIranianCheck = iranTime;
    // Randomize next interval slightly (2-5s) so salvos feel organic
    iranianOffset += (Math.random() - 0.5) * 2;

    if (Math.random() < ambientChance) {
      if (iranMissileBases.length > 0 && Math.random() < 0.6) {
        const salvoSize = 2 + Math.floor(Math.random() * Math.min(4, iranMissileBases.length));
        const shuffled = [...iranMissileBases].sort(() => Math.random() - 0.5);
        const firingBases = shuffled.slice(0, salvoSize);
        for (let si = 0; si < firingBases.length; si++) {
          const launcher = firingBases[si];
          const target = pickMissileTarget(alliedBases, alliedCities);
          if (target) {
            const delay = si * (100 + Math.random() * 200);
            setTimeout(() => spawnMissile(launcher.lat, launcher.lon, target.lat, target.lon), delay);
          }
        }
      }

      if (iranAirBases.length > 0 && Math.random() < planeChance) {
        const airBase = iranAirBases[Math.floor(Math.random() * iranAirBases.length)];
        const target = pickMissileTarget(alliedBases, alliedCities);
        if (target) spawnPlane(airBase.id, airBase.lat, airBase.lon, target.lat, target.lon);
      }

      // --- Missiles targeting NPC ships (small chance, Iranian only) ---
      // Damage is handled by the global impact handler (proximity-based)
      // Only target ships within the gulf war zone (not ships sailing near New York, etc.)
      if (npcShips.length > 0 && iranMissileBases.length > 0 && Math.random() < 0.15) {
        const movingNpcs = npcShips.filter(n => n.speed > 0 && isInWarZone(n.lat, n.lon));
        if (movingNpcs.length > 0) {
          const targetNpc = movingNpcs[Math.floor(Math.random() * movingNpcs.length)];
          const launcher = iranMissileBases[Math.floor(Math.random() * iranMissileBases.length)];
          const hitPoint = scatterTarget(targetNpc.lat, targetNpc.lon);
          spawnMissile(launcher.lat, launcher.lon, hitPoint.lat, hitPoint.lon);
        }
      }
    }
  }

  // --- Allied counter-salvo (independent timer, offset from Iranian) ---
  const alliedTime = elapsed - alliedOffset;
  if (alliedTime >= 0 && alliedTime - lastAlliedCheck >= ALLIED_INTERVAL) {
    lastAlliedCheck = alliedTime;
    // Randomize next interval slightly
    alliedOffset += (Math.random() - 0.5) * 2;

    if (Math.random() < ambientChance) {
      if (alliedMissileBases.length > 0 && Math.random() < 0.5) {
        const salvoSize = 2 + Math.floor(Math.random() * Math.min(3, alliedMissileBases.length));
        const shuffled = [...alliedMissileBases].sort(() => Math.random() - 0.5);
        const firingBases = shuffled.slice(0, salvoSize);
        for (let si = 0; si < firingBases.length; si++) {
          const launcher = firingBases[si];
          const target = pickMissileTarget(iranMissileBases, iranCities);
          if (target) {
            const delay = si * (100 + Math.random() * 200);
            setTimeout(() => spawnMissile(launcher.lat, launcher.lon, target.lat, target.lon), delay);
          }
        }
      }

      if (alliedAirBases.length > 0 && Math.random() < planeChance) {
        const airBase = alliedAirBases[Math.floor(Math.random() * alliedAirBases.length)];
        const target = pickMissileTarget(iranMissileBases, iranCities);
        if (target) spawnPlane(airBase.id, airBase.lat, airBase.lon, target.lat, target.lon);
      }
    }
  }

  // =============================================
  // HOUTHI / RED SEA AMBIENT WAR (less frequent)
  // =============================================
  const houthiBases = MILITARY_BASES.filter(b => b.country === 'Houthi' && (b.type === 'missile' || b.type === 'naval'));
  const houthiAirBases = MILITARY_BASES.filter(b => b.country === 'Houthi' && b.type === 'air');
  const houthiCities = CITIES.filter(c => c.country === 'Houthi');
  const coalitionRedSeaBases = MILITARY_BASES.filter(b =>
    (b.country === 'Saudi Arabia' || b.country === 'US') && b.lat < 22
  );
  const coalitionRedSeaCities = CITIES.filter(c =>
    c.country === 'Saudi Arabia' || c.country === 'Djibouti'
  );
  const houthiChance = ambientChance * 0.4; // 40% of gulf frequency

  // --- Houthi salvos ---
  const houthiTime = elapsed - houthiOffset;
  if (houthiTime >= 0 && houthiTime - lastHouthiCheck >= HOUTHI_INTERVAL) {
    lastHouthiCheck = houthiTime;
    houthiOffset += (Math.random() - 0.5) * 3;

    if (Math.random() < houthiChance) {
      if (houthiBases.length > 0 && Math.random() < 0.5) {
        const salvoSize = 1 + Math.floor(Math.random() * Math.min(3, houthiBases.length));
        const shuffled = [...houthiBases].sort(() => Math.random() - 0.5);
        const firingBases = shuffled.slice(0, salvoSize);
        for (let si = 0; si < firingBases.length; si++) {
          const launcher = firingBases[si];
          const targets = [...coalitionRedSeaBases, ...coalitionRedSeaCities];
          if (targets.length > 0) {
            const target = pickMissileTarget(coalitionRedSeaBases, coalitionRedSeaCities);
            if (target) {
              const delay = si * (150 + Math.random() * 300);
              setTimeout(() => spawnMissile(launcher.lat, launcher.lon, target.lat, target.lon), delay);
            }
          }
        }
      }

      // Houthi drone sorties
      if (houthiAirBases.length > 0 && Math.random() < 0.3) {
        const airBase = houthiAirBases[Math.floor(Math.random() * houthiAirBases.length)];
        const target = pickMissileTarget(coalitionRedSeaBases, coalitionRedSeaCities);
        if (target) spawnPlane(airBase.id, airBase.lat, airBase.lon, target.lat, target.lon);
      }

      // Houthi missiles targeting NPC ships in Red Sea
      if (npcShips.length > 0 && houthiBases.length > 0 && Math.random() < 0.12) {
        const redSeaNpcs = npcShips.filter(n => n.speed > 0 &&
          n.lat >= 10 && n.lat <= 30 && n.lon >= 32 && n.lon <= 45);
        if (redSeaNpcs.length > 0) {
          const targetNpc = redSeaNpcs[Math.floor(Math.random() * redSeaNpcs.length)];
          const launcher = houthiBases[Math.floor(Math.random() * houthiBases.length)];
          const hitPoint = scatterTarget(targetNpc.lat, targetNpc.lon);
          spawnMissile(launcher.lat, launcher.lon, hitPoint.lat, hitPoint.lon);
        }
      }
    }
  }

  // --- Coalition counter-strikes on Houthi positions ---
  const hcTime = elapsed - houthiCounterOffset;
  if (hcTime >= 0 && hcTime - lastHouthiCounterCheck >= HOUTHI_COUNTER_INTERVAL) {
    lastHouthiCounterCheck = hcTime;
    houthiCounterOffset += (Math.random() - 0.5) * 3;

    if (Math.random() < houthiChance * 0.6) {
      if (coalitionRedSeaBases.length > 0 && Math.random() < 0.4) {
        const salvoSize = 1 + Math.floor(Math.random() * 2);
        const shuffled = [...coalitionRedSeaBases].sort(() => Math.random() - 0.5);
        const firingBases = shuffled.slice(0, salvoSize);
        for (let si = 0; si < firingBases.length; si++) {
          const launcher = firingBases[si];
          const target = pickMissileTarget(houthiBases, houthiCities);
          if (target) {
            const delay = si * (100 + Math.random() * 200);
            setTimeout(() => spawnMissile(launcher.lat, launcher.lon, target.lat, target.lon), delay);
          }
        }
      }
    }
  }
}

// ============================================
// REGION INTENSITY SYSTEM
// ============================================
let lastRegionIntensityCheck = 0;
const REGION_INTENSITY_INTERVAL = 30; // check every 30 seconds of game time

function initRegionIntensity() {
  for (const [id, def] of Object.entries(REGION_DEFINITIONS)) {
    campaignStats.regionIntensity[id] = {
      level: def.baseLevel,
      levelName: REGION_INTENSITY_LEVELS[def.baseLevel],
      lastChange: Date.now(),
    };
  }
}

function updateRegionIntensity(elapsed) {
  if (elapsed - lastRegionIntensityCheck < REGION_INTENSITY_INTERVAL) return;
  lastRegionIntensityCheck = elapsed;

  for (const [id, def] of Object.entries(REGION_DEFINITIONS)) {
    const ri = campaignStats.regionIntensity[id];
    if (!ri) continue;

    // Small chance to escalate or de-escalate each check
    const roll = Math.random();
    let newLevel = ri.level;

    if (roll < 0.08) {
      // 8% chance to escalate
      newLevel = Math.min(3, ri.level + 1);
    } else if (roll < 0.14) {
      // 6% chance to de-escalate
      newLevel = Math.max(0, ri.level - 1);
    }

    if (newLevel !== ri.level) {
      const oldName = REGION_INTENSITY_LEVELS[ri.level];
      const newName = REGION_INTENSITY_LEVELS[newLevel];
      ri.level = newLevel;
      ri.levelName = newName;
      ri.lastChange = Date.now();

      const escalated = newLevel > ri.level - (newLevel - ri.level) ? true : false;
      const direction = newLevel > (newLevel - 1) ? 'ESCALATION' : 'DE-ESCALATION';
      const msgType = newLevel >= 2 ? 'danger' : newLevel === 1 ? '' : 'success';

      addTransitEvent(
        `INTEL: ${def.name}`,
        `Threat level changed: ${oldName} → ${newName}`,
        msgType
      );

      // Update danger zone probabilities for this region
      for (const zone of DANGER_ZONES) {
        const zoneRegion = zone.region || 'gulf';
        if (zoneRegion === id) {
          // Scale probability based on intensity level
          const scale = [0.3, 0.6, 1.0, 1.5][newLevel];
          zone._currentProbability = zone.baseProbability * scale;
        }
      }
    }
  }
}

// ============================================
// DANGER ZONES (all ships)
// ============================================
function checkDangerZonesAllShips(elapsed) {
  const me = getMe();
  if (!me) return;
  const risk = RISK_LEVELS[gameState?.riskLevel] || RISK_LEVELS.LOW;

  for (const ship of me.fleet) {
    const state = shipStates[ship.id];
    if (!state || state.destroyed || state.seized) continue;
    const aisId = ship.aisId || 'FULL_BROADCAST';
    const ais = options?.aisOptions?.[aisId] || { detectionMultiplier: 1.0 };

    for (const zone of DANGER_ZONES) {
      if (state.lat < zone.bounds.south || state.lat > zone.bounds.north) continue;
      if (state.lon < zone.bounds.west || state.lon > zone.bounds.east) continue;
      const cooldownKey = `${ship.id}_${zone.id}`;
      if ((zoneCooldowns[cooldownKey] || 0) > elapsed - SIM_CONFIG.EVENT_COOLDOWN / 1000) continue;

      // Defense upgrades reduce event probability
      const defLevel = ship.defenseUpgrade || 0;
      const defReduction = 1 - defLevel * 0.2; // 20% reduction per level
      const nightMult = getNightDetectionMultiplier(state.lon);
      const zoneProbability = zone._currentProbability || zone.baseProbability;
      let prob = zoneProbability * risk.eventFrequency * ais.detectionMultiplier * (2 - (state.health - state.totalDamage)) * defReduction * nightMult;
      if (Math.random() < prob) {
        const eventId = zone.events[Math.floor(Math.random() * zone.events.length)];
        const evt = EVENTS.find(e => e.id === eventId);
        if (!evt) continue;
        const roll = Math.random();
        let oi = 0, cw = 0;
        for (let w = 0; w < 3; w++) { cw += [0.5, 0.25, 0.25][w]; if (roll < cw) { oi = w; break; } }
        const outcome = evt.outcomes[oi];
        zoneCooldowns[cooldownKey] = elapsed;
        const isHouthiEvent = eventId === 'houthi_missile' || eventId === 'houthi_drone';
        const isIranEvent = eventId === 'missile_alert' || eventId === 'drone_swarm';
        const isMissileOrDrone = isIranEvent || isHouthiEvent;
        // For missile/drone events: skip direct damage — spawn a visible missile at the ship
        // and let the impact handler deal damage on proximity hit
        if (!isMissileOrDrone) {
          // Non-missile events (mines, seizure, pirates, etc.) apply damage directly
          const damageReduction = 1 - defLevel * 0.15;
          state.totalDamage += outcome.damagePercent * damageReduction;
          state.totalDelay += Math.max(0, outcome.delayHours);
          state.totalMoneyLoss += outcome.moneyLoss;
          if (outcome.delayHours >= 720) state.seized = true;
          if (outcome.damagePercent > 0.1) state.speed = Math.round(Math.max(5, ship.speed * (1 - state.totalDamage * 0.5)));
          campaignStats.totalDamageTaken += outcome.damagePercent * damageReduction;
        }
        if (isMissileOrDrone) campaignStats.missileEvents++;
        // Spawn visible missile/plane aimed at the ship for missile/drone events
        if (isIranEvent) {
          const iranBases = MILITARY_BASES.filter(b => b.country === 'Iran');
          if (iranBases.length > 0) {
            const launcher = iranBases[Math.floor(Math.random() * iranBases.length)];
            const shipTarget = scatterTarget(state.lat, state.lon);
            spawnMissile(launcher.lat, launcher.lon, shipTarget.lat, shipTarget.lon);
          }
          const iranAirBases = MILITARY_BASES.filter(b => b.country === 'Iran' && b.type === 'air');
          if (iranAirBases.length > 0 && Math.random() < 0.4) {
            const airBase = iranAirBases[Math.floor(Math.random() * iranAirBases.length)];
            spawnPlane(airBase.id, airBase.lat, airBase.lon, state.lat, state.lon);
          }
        }
        if (isHouthiEvent) {
          const hBases = MILITARY_BASES.filter(b => b.country === 'Houthi');
          if (hBases.length > 0) {
            const launcher = hBases[Math.floor(Math.random() * hBases.length)];
            const shipTarget = scatterTarget(state.lat, state.lon);
            spawnMissile(launcher.lat, launcher.lon, shipTarget.lat, shipTarget.lon);
          }
          const hAir = MILITARY_BASES.filter(b => b.country === 'Houthi' && b.type === 'air');
          if (hAir.length > 0 && Math.random() < 0.4) {
            const airBase = hAir[Math.floor(Math.random() * hAir.length)];
            spawnPlane(airBase.id, airBase.lat, airBase.lon, state.lat, state.lon);
          }
        }
        let extra = '';
        if (outcome.damagePercent > 0) extra += ` [Dmg: ${Math.round(outcome.damagePercent * 100)}%]`;
        if (outcome.moneyLoss > 0) extra += ` [Loss: ${Math.round(outcome.moneyLoss * 100)}%]`;
        addTransitEvent(`${ship.name}: ${evt.name}`, outcome.text + extra,
          outcome.damagePercent > 0 || outcome.moneyLoss > 0 ? 'danger' : outcome.delayHours < 0 ? 'success' : '');
        _fleetPanelDirty = true;
      }
    }
  }
}

// AIS compliance enforcement — worldwide, 5% chance per check (~1 min game-time intervals)
const aisFineCooldowns = {};
const AIS_FINE_INTERVAL = 60; // seconds of game time between checks per ship
function checkAisFines(elapsed) {
  const me = getMe();
  if (!me) return;
  for (const ship of me.fleet) {
    const state = shipStates[ship.id];
    if (!state || state.destroyed || state.seized) continue;
    const aisId = ship.aisId || 'FULL_BROADCAST';
    if (aisId === 'FULL_BROADCAST' || aisId === 'full_broadcast') continue;
    const lastCheck = aisFineCooldowns[ship.id] || 0;
    if (elapsed - lastCheck < AIS_FINE_INTERVAL) continue;
    aisFineCooldowns[ship.id] = elapsed;
    if (Math.random() < 0.05) {
      const ais = options?.aisOptions?.[aisId];
      const fine = ais?.legalPenalty || (aisId === 'DARK' ? 500000 : 50000);
      socket.emit('ais_fine', { shipId: ship.id, amount: fine }, (res) => {
        if (res?.success) updateFleetPanel();
      });
      const modeLabel = aisId === 'DARK' ? 'AIS Dark' : 'Reduced AIS';
      addTransitEvent('AIS VIOLATION',
        `${ship.name}: Caught operating with ${modeLabel}. Fined ${formatMoney(fine)}.`, 'danger');
    }
  }
}

function addTransitEvent(name, text, type) {
  const container = document.getElementById('hud-events');
  const div = document.createElement('div');
  div.className = `event-item ${type || ''}`;
  const closeBtn = document.createElement('span');
  closeBtn.className = 'event-close';
  closeBtn.textContent = '\u00d7';
  closeBtn.addEventListener('click', () => { div.style.opacity = '0'; setTimeout(() => div.remove(), 300); });
  div.innerHTML = `<div class="event-name">${name}</div><div class="event-outcome">${text}</div>`;
  div.appendChild(closeBtn);
  container.appendChild(div);
  container.scrollTop = container.scrollHeight;
  // Auto-dismiss after 60 seconds
  setTimeout(() => { if (div.parentNode) { div.style.opacity = '0'; setTimeout(() => div.remove(), 300); } }, 60000);
  while (container.children.length > 8) {
    container.firstChild.remove();
  }
  // Also store for mobile log
  mobileEventLog.push({ name, text, type });
  // Track in attack log for situation monitor
  if (type === 'danger') {
    const region = name.toLowerCase().includes('houthi') ? 'red_sea'
      : name.toLowerCase().includes('pirate') ? 'piracy'
      : 'gulf';
    campaignStats.attackLog.push({ time: Date.now(), region, type: name, description: text });
    // Keep last 100 entries
    if (campaignStats.attackLog.length > 100) campaignStats.attackLog.shift();
  }
  if (mobileEventLog.length > 50) mobileEventLog.shift();
  // Live-update mobile log if visible
  if (isMobile() && mobileActiveTab === 'log') {
    const dc = document.getElementById('mobile-drawer-content');
    if (dc) renderMobileLog(dc);
  }
}

// ============================================
// TERMINAL INFO POPUP
// ============================================
function showTerminalPopup(terminal, screenX, screenY) {
  const popup = document.getElementById('terminal-info-popup');
  const isLng = terminal.cargoType === 'lng';
  const isExport = terminal.role === 'export';
  const unit = isLng ? 'MMBtu' : 'bbl';
  document.getElementById('terminal-popup-name').textContent = terminal.name;

  let priceHtml;
  if (isExport) {
    const buyPrice = getLivePrice(terminal);
    const basePrice = terminal.buyPrice || 70;
    const changed = buyPrice !== basePrice;
    priceHtml = `<div class="terminal-popup-row"><span>Buy Price:</span><span class="stat-warn">$${buyPrice}/${unit}${changed ? ` <small style="opacity:0.6">(base $${basePrice})</small>` : ''}</span></div>`;
  } else {
    const sellPrice = isLng ? (terminal.lngSellPrice || terminal.sellPrice || 85) : getLivePrice(terminal);
    const basePrice = terminal.sellPrice || 85;
    const changed = sellPrice !== basePrice;
    priceHtml = `<div class="terminal-popup-row"><span>Sell Price:</span><span class="stat-good">$${sellPrice}/${unit}${changed ? ` <small style="opacity:0.6">(base $${basePrice})</small>` : ''}</span></div>`;
  }

  document.getElementById('terminal-popup-body').innerHTML = `
    <div class="terminal-popup-row"><span>Type:</span><span>${isLng ? 'LNG' : 'Oil'} ${isExport ? 'EXPORT' : 'IMPORT'}</span></div>
    <div class="terminal-popup-row"><span>Country:</span><span>${terminal.country || '—'}</span></div>
    ${terminal.capacity ? `<div class="terminal-popup-row"><span>Capacity:</span><span>${terminal.capacity}</span></div>` : ''}
    ${priceHtml}
    <div class="terminal-popup-desc">${terminal.description}</div>`;
  const popupW = 260, popupH = 200;
  let left = Math.min(screenX + 15, window.innerWidth - popupW - 10);
  let top = Math.min(screenY - 20, window.innerHeight - popupH - 10);
  popup.style.left = Math.max(10, left) + 'px';
  popup.style.top = Math.max(10, top) + 'px';
  popup.classList.remove('hidden');
}

function hideTerminalPopup() {
  document.getElementById('terminal-info-popup').classList.add('hidden');
}

document.getElementById('terminal-popup-close').addEventListener('click', hideTerminalPopup);
document.getElementById('terminal-popup-select').addEventListener('click', hideTerminalPopup);

// ============================================
// CHOKEPOINT THREAT ASSESSMENT POPUP
// ============================================
function showChokepointPopup(cp, screenX, screenY) {
  const popup = document.getElementById('chokepoint-popup');
  document.getElementById('chokepoint-popup-name').textContent = cp.name;

  // Find nearby danger zones
  const nearbyZones = DANGER_ZONES.filter(z => {
    const zCenterLat = (z.bounds.north + z.bounds.south) / 2;
    const zCenterLon = (z.bounds.east + z.bounds.west) / 2;
    const dist = Math.sqrt(Math.pow(cp.lat - zCenterLat, 2) + Math.pow(cp.lon - zCenterLon, 2));
    return dist < 15;
  });

  // Find region intensity
  const cpRegions = new Set(nearbyZones.map(z => z.region || 'gulf'));
  let maxThreat = 'LOW';
  let maxLevel = 0;
  for (const regionId of cpRegions) {
    const ri = campaignStats.regionIntensity[regionId];
    if (ri && ri.level > maxLevel) {
      maxLevel = ri.level;
      maxThreat = ri.levelName;
    }
  }

  const threatClass = maxLevel >= 2 ? 'sitmon-stat-bad' : maxLevel === 1 ? 'sitmon-stat-warn' : 'sitmon-stat-ok';
  const risks = [...new Set(nearbyZones.flatMap(z => z.events))];
  const riskLabels = risks.map(r => {
    const evtDef = EVENTS.find(e => e.id === r);
    return evtDef ? evtDef.name : r;
  });

  // Recent attacks near this chokepoint
  const recentAttacks = campaignStats.attackLog.filter(a => {
    for (const regionId of cpRegions) {
      if (a.region === regionId) return true;
    }
    return false;
  }).length;

  // Ships near chokepoint
  const me = getMe();
  const shipsNear = me ? me.fleet.filter(s => {
    const st = shipStates[s.id];
    if (!st) return false;
    return Math.sqrt(Math.pow(st.lat - cp.lat, 2) + Math.pow(st.lon - cp.lon, 2)) < 5;
  }).length : 0;

  let html = `
    <div class="ship-info-row"><span>Flow:</span><span>${cp.flowMbpd} mb/d</span></div>
    <div class="ship-info-row"><span>Threat:</span><span class="${threatClass}" style="font-weight:bold;">${maxThreat}</span></div>
    <div class="ship-info-row"><span>Danger Zones:</span><span>${nearbyZones.length}</span></div>
    <div class="ship-info-row"><span>Active Risks:</span><span style="font-size:10px;">${riskLabels.length > 0 ? riskLabels.join(', ') : 'None'}</span></div>
    <div class="ship-info-row"><span>Recent Attacks:</span><span>${recentAttacks}</span></div>
    <div class="ship-info-row"><span>Your Ships Nearby:</span><span>${shipsNear}</span></div>
    <div style="margin-top:6px;font-size:10px;color:var(--text-muted);">${cp.description}</div>`;

  document.getElementById('chokepoint-popup-body').innerHTML = html;
  popup.style.left = Math.min(screenX + 10, window.innerWidth - 280) + 'px';
  popup.style.top = Math.min(screenY - 10, window.innerHeight - 250) + 'px';
  popup.classList.remove('hidden');
}

function hideChokepointPopup() {
  document.getElementById('chokepoint-popup').classList.add('hidden');
}

document.getElementById('chokepoint-popup-close').addEventListener('click', hideChokepointPopup);

// ============================================
// SHIP INFO DIALOG (mobile tap)
// ============================================
function showShipInfoDialog(ship, state) {
  const dialog = document.getElementById('ship-info-dialog');
  document.getElementById('ship-info-name').textContent = ship.name;
  const hp = state ? Math.round((state.health - (state.totalDamage || 0)) * 100) : Math.round((ship.health || 1) * 100);
  const cargo = shipCargo[ship.id];
  const cargoText = state?.destroyed ? 'DESTROYED' : state?.seized ? 'SEIZED' : cargo?.delivered ? 'DELIVERED' : cargo?.loaded ? `LOADED (${(ship.cargoType || 'oil').toUpperCase()})` : 'EMPTY';
  const speedText = state ? `${Math.round(state.speed || 0)} kts` : `${ship.speed || 0} kts`;
  const aisText = ship.aisName || ship.aisId || '—';
  const insText = ship.insuranceName || ship.insuranceId || '—';

  document.getElementById('ship-info-body').innerHTML = `
    <div class="ship-info-row"><span>Type:</span><span>${ship.name}</span></div>
    <div class="ship-info-row"><span>HP:</span><span class="${hp > 70 ? 'stat-good' : hp > 40 ? 'stat-warn' : 'stat-bad'}">${hp}%</span></div>
    <div class="ship-info-row"><span>Speed:</span><span>${speedText}</span></div>
    <div class="ship-info-row"><span>Cargo:</span><span>${cargoText}</span></div>
    <div class="ship-info-row"><span>Capacity:</span><span>${(ship.capacity || 0).toLocaleString()} ${(ship.cargoType || 'oil') === 'lng' ? 'MMBtu' : 'bbl'}</span></div>
    <div class="ship-info-row"><span>AIS:</span><span>${aisText}</span></div>
    <div class="ship-info-row"><span>Insurance:</span><span>${insText}</span></div>
    ${ship.engineUpgrade ? '<div class="ship-info-row"><span>Engine:</span><span class="stat-good">UPGRADED</span></div>' : ''}
    ${ship.defenseUpgrade ? '<div class="ship-info-row"><span>Defense:</span><span class="stat-good">UPGRADED</span></div>' : ''}
    ${ship.hasAutopilot ? '<div class="ship-info-row"><span>Autopilot:</span><span class="stat-good">INSTALLED</span></div>' : ''}`;

  dialog.dataset.shipId = ship.id;
  dialog.classList.remove('hidden');
}

function showNpcInfoDialog(npc) {
  const dialog = document.getElementById('ship-info-dialog');
  document.getElementById('ship-info-name').textContent = npc.shipName;
  document.getElementById('ship-info-body').innerHTML = `
    <div class="ship-info-row"><span>Type:</span><span>${npc.typeName} (NPC)</span></div>
    <div class="ship-info-row"><span>Cargo:</span><span>${(npc.cargoType || 'oil').toUpperCase()}</span></div>
    <div class="ship-info-row"><span>Speed:</span><span>${Math.round(npc.speed)} kts</span></div>
    <div class="ship-info-row"><span>Heading:</span><span>${Math.round(npc.heading || 0)}&deg;</span></div>`;
  dialog.dataset.shipId = '';
  // Hide manage/select for NPC ships
  document.getElementById('ship-info-select').classList.add('hidden');
  document.getElementById('ship-info-manage').classList.add('hidden');
  dialog.classList.remove('hidden');
}

function hideShipInfoDialog() {
  document.getElementById('ship-info-dialog').classList.add('hidden');
  document.getElementById('ship-info-select').classList.remove('hidden');
  document.getElementById('ship-info-manage').classList.remove('hidden');
}

document.getElementById('ship-info-close').addEventListener('click', hideShipInfoDialog);
document.getElementById('ship-info-select').addEventListener('click', () => {
  const shipId = document.getElementById('ship-info-dialog').dataset.shipId;
  if (shipId) selectShip(shipId);
  hideShipInfoDialog();
});
document.getElementById('ship-info-manage').addEventListener('click', () => {
  const shipId = document.getElementById('ship-info-dialog').dataset.shipId;
  if (shipId) {
    selectShip(shipId);
    openFleetManager();
  }
  hideShipInfoDialog();
});

// ============================================
// MAP CLICK HANDLER
// ============================================
mapCanvas.addEventListener('click', (e) => {
  if (!transitActive || isPanning) return;
  const rect = mapCanvas.getBoundingClientRect();
  const cx = e.clientX - rect.left;
  const cy = e.clientY - rect.top;
  const target = canvasToLatLon(cx, cy, rect.width, rect.height);
  const mobile = isMobile();

  // Check ship click first (higher priority than terminals)
  const me = getMe();
  if (me) {
    for (const ship of me.fleet) {
      const state = shipStates[ship.id];
      if (!state || state.destroyed || state.seized) continue;
      const shipPos = latLonToCanvas(state.lat, state.lon, rect.width, rect.height);
      if (Math.sqrt(Math.pow(cx - shipPos.x, 2) + Math.pow(cy - shipPos.y, 2)) < (mobile ? 30 : 20)) {
        showShipInfoDialog(ship, state);
        if (!mobile && ship.id !== selectedShipId) {
          selectShip(ship.id);
        }
        return;
      }
    }
  }

  // Check NPC ship click (both desktop and mobile)
  for (const npc of npcShips) {
    const npcPos = latLonToCanvas(npc.lat, npc.lon, rect.width, rect.height);
    if (Math.sqrt(Math.pow(cx - npcPos.x, 2) + Math.pow(cy - npcPos.y, 2)) < (mobile ? 30 : 15)) {
      showNpcInfoDialog(npc);
      return;
    }
  }

  // Check chokepoint click
  for (const cp of CHOKEPOINTS) {
    const cpPos = latLonToCanvas(cp.lat, cp.lon, rect.width, rect.height);
    if (Math.sqrt(Math.pow(cx - cpPos.x, 2) + Math.pow(cy - cpPos.y, 2)) < (mobile ? 35 : 20)) {
      showChokepointPopup(cp, e.clientX, e.clientY);
      return;
    }
  }

  // Check terminal click (all terminals — export and import)
  for (const terminal of Object.values(OIL_TERMINALS)) {
    const tPos = latLonToCanvas(terminal.lat, terminal.lon, rect.width, rect.height);
    if (Math.sqrt(Math.pow(cx - tPos.x, 2) + Math.pow(cy - tPos.y, 2)) < (mobile ? 30 : 20)) {
      if (selectedShipId && shipStates[selectedShipId]) {
        addWaypointForSelectedShip({ lat: terminal.lat, lon: terminal.lon, loadRadius: terminal.loadRadius || 0.15 });
      } else {
        showTerminalPopup(terminal, e.clientX, e.clientY);
      }
      return;
    }
  }

  if (shipControlOpen) closeShipControlPanel();
  hideTerminalPopup();
  hideChokepointPopup();
  hideShipInfoDialog();

  // Add waypoint for selected ship
  if (!selectedShipId || !shipStates[selectedShipId]) return;
  addWaypointForSelectedShip(target);
});

mapCanvas.addEventListener('contextmenu', (e) => e.preventDefault());

// ============================================
// SOCKET EVENTS
// ============================================
socket.on('connect', () => {
  const oldId = myId;
  myId = socket.id;
  // If we were in a game, rejoin after reconnection
  if (oldId && oldId !== myId && gameState) {
    const oldMe = gameState.players.find(p => p.id === oldId);
    const playerName = oldMe?.name || authUser?.username || 'Captain';
    socket.emit('rejoin_game', {
      gameId: gameState.id,
      playerName,
      token: authToken || undefined
    }, (res) => {
      if (res?.success) {
        gameState = res.game;
        // Request current simulation state to restore ship positions
        socket.emit('get_sim_state', {}, (simRes) => {
          if (simRes?.success && simRes.simState) {
            serverSimActive = true;
            // Trigger the sim_state handler directly
            socket.listeners('sim_state').forEach(fn => fn(simRes.simState));
          }
        });
        if (transitActive) {
          updateFleetPanel();
          if (mobileActiveTab === 'fleet') {
            const dc = document.getElementById('mobile-drawer-content');
            if (dc) renderMobileFleet(dc);
          }
        }
      }
    });
    // Re-auth socket if logged in
    if (authToken) socket.emit('auth', { token: authToken });
  }
});

socket.on('game_update', (state) => {
  gameState = state;
  if (state.players.length > 0 && state.players[0].id === myId) isHost = true;
  const activeScreen = document.querySelector('.screen.active');
  if (activeScreen?.id === 'screen-lobby') renderLobby();
  if (transitActive) {
    // Ensure all fleet ships have local state (handles race between game_update and buy callback)
    const me = getMe();
    if (me) {
      for (const ship of me.fleet) {
        if (!shipStates[ship.id]) spawnShipState(ship);
      }
    }
    updateFleetPanel();
    // Refresh mobile fleet drawer if it's currently open
    if (mobileActiveTab === 'fleet') {
      const dc = document.getElementById('mobile-drawer-content');
      if (dc) renderMobileFleet(dc);
    }
  }
});

socket.on('phase_change', ({ phase }) => {
  if (phase === 'planning') enterGame();
});

socket.on('game_over', ({ leaderboard }) => {
  transitActive = false;
  showScreen('gameover');
  document.getElementById('final-leaderboard').innerHTML = `<h3>FINAL STANDINGS</h3>
    ${leaderboard.map((p, i) => `<div class="lb-row"><span class="lb-rank">#${i + 1}</span>
    <span class="lb-name">${escapeHtml(p.name)} ${p.id === myId ? '(you)' : ''}</span>
    <span class="lb-worth">${formatMoney(p.netWorth)}</span></div>`).join('')}`;
});

// Server-side simulation state handler
// When the server sends sim_state, update all ship positions, NPC positions, etc.
let serverSimActive = false;

socket.on('sim_state', (simState) => {
  if (!transitActive) return;
  serverSimActive = true;
  simGameTime = simState.simTime;

  const me = getMe();
  if (!me) return;

  // Update player ship states from server
  for (const ship of me.fleet) {
    const serverShip = simState.shipStates[ship.id];
    if (!serverShip) continue;

    if (!shipStates[ship.id]) {
      // First time seeing this ship — init local rendering state
      shipStates[ship.id] = {};
      shipTrails[ship.id] = [];
      shipCargo[ship.id] = { loaded: false };
    }

    const state = shipStates[ship.id];
    // Store server targets for lerping instead of snapping
    serverTargets[ship.id] = {
      lat: serverShip.lat, lon: serverShip.lon,
      heading: serverShip.heading, speed: serverShip.speed
    };
    // On first receive, snap immediately
    if (state.lat === undefined) {
      state.lat = serverShip.lat;
      state.lon = serverShip.lon;
      state.heading = serverShip.heading;
    }
    state.targetHeading = serverShip.targetHeading;
    state.speed = serverShip.speed;
    state.health = serverShip.health;
    state.totalDamage = serverShip.totalDamage;
    state.totalMoneyLoss = serverShip.totalMoneyLoss;
    state.totalDelay = serverShip.totalDelay;
    state.seized = serverShip.seized;
    state.destroyed = serverShip.destroyed;

    // Update waypoints from server
    shipWaypoints[ship.id] = simState.shipWaypoints[ship.id] || [];

    // Update cargo from server
    if (simState.shipCargo[ship.id]) {
      shipCargo[ship.id] = simState.shipCargo[ship.id];
    }

    // Update autopilot from server
    if (simState.shipAutopilot[ship.id]) {
      shipAutopilot[ship.id] = simState.shipAutopilot[ship.id];
    }

    // Trail tracking
    const trail = shipTrails[ship.id];
    if (trail) {
      const now = performance.now() / 1000;
      if (trail.length === 0 || now - trail[trail.length - 1].t > 0.5) {
        trail.push({ lat: state.lat, lon: state.lon, t: now });
      }
      while (trail.length > 0 && now - trail[0].t > 4) trail.shift();
    }
  }

  // Update NPC ships from server
  if (simState.npcShips) {
    // Sync NPC array to server state
    while (npcShips.length < simState.npcShips.length) npcShips.push({});
    while (npcShips.length > simState.npcShips.length) npcShips.pop();
    for (let i = 0; i < simState.npcShips.length; i++) {
      const sn = simState.npcShips[i];
      // Store targets for lerping
      serverNpcTargets[i] = { lat: sn.lat, lon: sn.lon, heading: sn.heading };
      // Snap on first receive
      if (npcShips[i].lat === undefined) {
        npcShips[i].lat = sn.lat;
        npcShips[i].lon = sn.lon;
        npcShips[i].heading = sn.heading;
      }
      npcShips[i].speed = sn.speed;
      npcShips[i].typeName = sn.typeName;
      npcShips[i].shipName = sn.shipName;
      npcShips[i].state = sn.state;
      npcShips[i].totalDamage = sn.totalDamage;
      npcShips[i].cargoType = sn.cargoType;
    }
  }

  // Update military ships from server
  if (simState.militaryShips) {
    while (militaryShips.length < simState.militaryShips.length) militaryShips.push({});
    while (militaryShips.length > simState.militaryShips.length) militaryShips.pop();
    for (let i = 0; i < simState.militaryShips.length; i++) {
      const sm = simState.militaryShips[i];
      // Store targets for lerping
      serverMilTargets[i] = { lat: sm.lat, lon: sm.lon, heading: sm.heading };
      const mil = militaryShips[i];
      // Snap on first receive
      if (mil.lat === undefined) {
        mil.lat = sm.lat;
        mil.lon = sm.lon;
        mil.heading = sm.heading;
      }
      // Copy non-position fields
      mil.speed = sm.speed;
      mil.typeName = sm.typeName;
      mil.shipName = sm.shipName;
      mil.state = sm.state;
      mil.idleTimer = sm.idleTimer;
    }
  }

  // Show recent events from server
  if (simState.recentEvents) {
    if (!window._shownServerEvents) window._shownServerEvents = new Set();
    // Prevent unbounded growth — server keeps last 30s of events
    if (window._shownServerEvents.size > 200) window._shownServerEvents.clear();
    for (const evt of simState.recentEvents) {
      const evtKey = evt.time + '_' + evt.name;
      if (!window._shownServerEvents.has(evtKey)) {
        window._shownServerEvents.add(evtKey);
        addTransitEvent(evt.name, evt.text, evt.type);
        // Spawn visible missile/plane for missile/drone events
        if (evt.missile) {
          const eid = evt.missile.eventId;
          const shipLat = evt.missile.shipLat;
          const shipLon = evt.missile.shipLon;
          const isHouthi = eid === 'houthi_missile' || eid === 'houthi_drone';
          const isIran = eid === 'missile_alert' || eid === 'drone_swarm';
          const country = isHouthi ? 'Houthi' : isIran ? 'Iran' : null;
          if (country) {
            const bases = MILITARY_BASES.filter(b => b.country === country);
            if (bases.length > 0) {
              const launcher = bases[Math.floor(Math.random() * bases.length)];
              const scatter = () => ({ lat: shipLat + (Math.random() - 0.5) * 0.3, lon: shipLon + (Math.random() - 0.5) * 0.3 });
              spawnMissile(launcher.lat, launcher.lon, scatter().lat, scatter().lon);
            }
            const airBases = MILITARY_BASES.filter(b => b.country === country && b.type === 'air');
            if (airBases.length > 0 && Math.random() < 0.4) {
              const airBase = airBases[Math.floor(Math.random() * airBases.length)];
              spawnPlane(airBase.id, airBase.lat, airBase.lon, shipLat, shipLon);
            }
          }
        }
      }
    }
  }

  _fleetPanelDirty = true;
});

// Server notifies us a ship was destroyed (with insurance payout)
socket.on('ship_destroyed_notify', ({ shipId, insurancePayout }) => {
  if (insurancePayout > 0) {
    addTransitEvent('INSURANCE PAYOUT', `Received ${formatMoney(insurancePayout)} insurance payout.`, 'success');
  }
  const me = getMe();
  if (me) {
    me.fleet = me.fleet.filter(s => s.id !== shipId);
  }
  delete shipStates[shipId];
  delete shipWaypoints[shipId];
  delete shipTrails[shipId];
  delete shipCargo[shipId];
  delete shipAutopilot[shipId];
  if (selectedShipId === shipId) {
    selectedShipId = me?.fleet[0]?.id || null;
  }
  updateFleetPanel();
});

// Helper: send waypoints to server
function sendWaypointsToServer(shipId) {
  if (!serverSimActive) return;
  socket.emit('set_waypoints', { shipId, waypoints: shipWaypoints[shipId] || [] });
}

// Helper: send speed to server
function sendSpeedToServer(shipId, speed) {
  if (!serverSimActive) return;
  socket.emit('set_speed', { shipId, speed });
}

// Helper: send autopilot state to server
function sendAutopilotToServer(shipId) {
  if (!serverSimActive) return;
  const ap = shipAutopilot[shipId];
  if (ap) {
    socket.emit('set_autopilot', { shipId, active: ap.active, terminal: ap.terminal, dropoff: ap.dropoff });
  }
}

socket.on('force_logout', ({ reason }) => {
  logout();
  isGuest = false;
  updateAuthUI();
  showScreen('title');
  // Show persistent modal so the user understands what happened
  const overlay = document.getElementById('force-logout-overlay');
  const reasonEl = document.getElementById('force-logout-reason');
  reasonEl.textContent = reason || 'Your account was logged in from another device. This session has been ended.';
  overlay.classList.remove('hidden');
});

document.getElementById('force-logout-ok').addEventListener('click', () => {
  document.getElementById('force-logout-overlay').classList.add('hidden');
});

socket.on('disconnect', () => showError('Disconnected from server'));

document.getElementById('btn-new-game').addEventListener('click', () => window.location.reload());

// ============================================
// BACKGROUND MAP
// ============================================
function drawBackgroundMap() {
  if (transitActive) return;
  try { drawMap(mapCanvas, { showTerminals: false, showZones: false, showFinish: false, showSpawn: false }); }
  catch (e) { console.error('Map draw error:', e); }
}
window.addEventListener('resize', drawBackgroundMap);
drawBackgroundMap();
setInterval(() => { if (!transitActive) drawBackgroundMap(); }, 2000);
