import { io } from 'socket.io-client';
import { drawMap, drawCompass, latLonToCanvas, canvasToLatLon, setViewport, getViewport, isOnLand, drawWaypoints, spawnMissile, spawnPlane, setImpactHandler } from './map.js';
import { CHOKEPOINTS } from './world-coastlines.js';
import {
  SIM_CONFIG, DANGER_ZONES, EVENTS, RISK_LEVELS, MAP_BOUNDS, GULF_BOUNDS,
  FUEL_COST_PER_UNIT, DEFAULT_VIEWPORT, OIL_TERMINALS, EXPORT_TERMINALS, IMPORT_TERMINALS,
  NPC_SHIP_TYPES, MILITARY_SHIPS, DROPOFF_POINT, DROPOFF_POINTS, MILITARY_BASES, CITIES,
  TERMINAL_REGIONS
} from '../shared/constants.js';

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
let joinMode = false;

let modalShipTypeId = null;
let modalAisId = null;
let modalInsuranceId = null;
let modalSpawnTerminalId = null;

let gameSpeedMultiplier = 1;

let transitActive = false;
let simStartTime = 0;
let simGameTime = 0;
let lastFrameTime = 0;
let zoneCooldowns = {};
let lastEventCheck = 0;

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
};
let campaignEnded = false;

// Multi-ship state
let shipStates = {};
let shipWaypoints = {};
let shipTrails = {};
let shipCargo = {};
let shipAutopilot = {}; // { [shipId]: { active: bool, terminal: obj } }
let selectedShipId = null;

let npcShips = [];
let militaryShips = [];

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
// GAME SPEED TOGGLE
// ============================================
document.querySelectorAll('.speed-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    gameSpeedMultiplier = parseInt(btn.dataset.speed);
    document.querySelectorAll('.speed-btn').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
  });
});

// ============================================
// SETTINGS MENU
// ============================================
document.getElementById('settings-btn').addEventListener('click', () => {
  document.getElementById('settings-panel').classList.toggle('hidden');
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
// CLEAR WAYPOINTS
// ============================================
const clearWpBtn = document.getElementById('btn-clear-waypoints');
clearWpBtn.addEventListener('click', () => {
  if (selectedShipId) {
    shipWaypoints[selectedShipId] = [];
    if (shipStates[selectedShipId]) shipStates[selectedShipId].speed = 0;
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
  const me = gameState.players.find(p => p.id === myId);
  return me?.fleet.find(s => s.id === selectedShipId) || null;
}

function openShipControlPanel() {
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
  document.getElementById('scp-speed-value').textContent = `${state.speed} kts`;
});

document.getElementById('scp-speed-up').addEventListener('click', () => {
  if (!selectedShipId || !shipStates[selectedShipId]) return;
  const ship = getSelectedShipData();
  const state = shipStates[selectedShipId];
  if (state.destroyed || state.seized) return;
  state.speed = Math.min(20, Math.round(state.speed || 0) + 1);
  const ratedSpeed = ship?.speed || 16;
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
  const me = gameState?.players.find(p => p.id === myId);
  if (!me || me.cash < repairCost) {
    document.getElementById('scp-upgrade-info').textContent = `Need ${formatMoney(repairCost)} to repair.`;
    return;
  }
  const sid = selectedShipId;
  socket.emit('upgrade_ship', { shipId: sid, type: 'repair', cost: repairCost }, (res) => {
    if (res?.success) {
      const st = shipStates[sid];
      if (st) st.totalDamage = 0;
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
  const me = gameState?.players.find(p => p.id === myId);
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
  const me = gameState?.players.find(p => p.id === myId);
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
      opt.textContent = `${t.name} — Buy $${t.buyPrice || '?'}/${isLng ? 'MMBtu' : 'bbl'}`;
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
      const price = isLng ? (t.lngSellPrice || t.sellPrice || '?') : (t.sellPrice || '?');
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
    addTransitEvent('AUTOPILOT OFF', `${ship.name}: Autopilot disengaged.`, '');
    updateFleetPanel();
    refreshUpgradeButtons();
    return;
  }

  if (!ship.hasAutopilot) {
    const cost = 30000000;
    const me = gameState?.players.find(p => p.id === myId);
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
  const route = computeAutopilotRoute(state.lat, state.lon, dest.lat, dest.lon);
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
  const ap = shipAutopilot[ship.id];
  if (!ship || !ap || !ap.active) return;
  const terminal = getTerminalById(document.getElementById('scp-ap-terminal').value);
  if (!terminal) return;
  ap.terminal = terminal;
  autopilotReroute(ship);
});

// Change autopilot dropoff while running
document.getElementById('scp-ap-dropoff').addEventListener('change', () => {
  if (!selectedShipId) return;
  const ship = getSelectedShipData();
  const ap = shipAutopilot[ship.id];
  if (!ship || !ap || !ap.active) return;
  const dropoff = getDropoffById(document.getElementById('scp-ap-dropoff').value);
  if (!dropoff) return;
  ap.dropoff = dropoff;
  autopilotReroute(ship);
});

function refreshUpgradeButtons() {
  const ship = getSelectedShipData();
  const state = selectedShipId ? shipStates[selectedShipId] : null;
  if (!ship || !state) return;

  const me = gameState?.players.find(p => p.id === myId);
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
    apBtn.textContent = `AUTOPILOT ${formatMoney(30000000)}`;
    apBtn.disabled = cash < 30000000;
    apDest.classList.add('hidden');
  }

  // Insurance
  const currentIns = ship.insuranceId || 'FULL_WAR_RISK';
  document.querySelectorAll('.scp-ins-btn').forEach(b => {
    b.classList.toggle('active', b.dataset.ins === currentIns);
  });
  document.getElementById('scp-autorenew-cb').checked = ship.autoRenewInsurance !== false;

  document.getElementById('scp-upgrade-info').textContent = '';
}

// ============================================
// FLEET MANAGER MODAL
// ============================================
function openFleetManager() {
  const me = gameState?.players.find(p => p.id === myId);
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

function renderFleetManager() {
  const me = gameState?.players.find(p => p.id === myId);
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
      st.speed = Math.min(20, Math.round(st.speed || 0) + 1);
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
      const me2 = gameState?.players.find(p => p.id === myId);
      if (!me2 || me2.cash < repairCost) return;
      btn.disabled = true;
      socket.emit('upgrade_ship', { shipId: sid, type: 'repair', cost: repairCost }, (res) => {
        if (res?.success) { st.totalDamage = 0; renderFleetManager(); updateFleetPanel(); }
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
      const me2 = gameState?.players.find(p => p.id === myId);
      if (!me2 || me2.cash < 25000000) return;
      btn.disabled = true;
      socket.emit('upgrade_ship', { shipId: sid, type: 'engine', cost: 25000000 }, (res) => {
        if (res?.success) {
          // Re-fetch ship data in case game_update replaced the object
          const fresh = getShipData(sid);
          if (fresh) { fresh.engineUpgrade = 1; fresh.speed = (fresh.speed || 14) + 4; }
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
      const me2 = gameState?.players.find(p => p.id === myId);
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
        renderFleetManager(); updateFleetPanel();
        return;
      }
      if (!s.hasAutopilot) {
        const me2 = gameState?.players.find(p => p.id === myId);
        if (!me2 || me2.cash < 30000000) return;
        btn.disabled = true;
        socket.emit('upgrade_ship', { shipId: sid, type: 'autopilot', cost: 30000000 }, (res) => {
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
      } else {
        // Not active — engage autopilot with selected terminals
        shipAutopilot[s.id] = { active: true, terminal, dropoff };
        st.apCoastEscapeTimer = 0;
        st.apCoastEscapeHeading = 0;
        shipWaypoints[s.id] = [];
        if (st.speed === 0) st.speed = Math.round(s.speed || 14);
      }
      renderFleetManager(); updateFleetPanel();
    });
  });
}

function getShipData(shipId) {
  const me = gameState?.players.find(p => p.id === myId);
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
// TITLE SCREEN
// ============================================
document.getElementById('btn-create').addEventListener('click', () => {
  joinMode = false;
  document.getElementById('name-input-area').classList.remove('hidden');
  document.getElementById('input-game-id').classList.add('hidden');
  document.getElementById('btn-create').classList.add('hidden');
  document.getElementById('btn-join').classList.add('hidden');
  document.getElementById('input-name').focus();
});

document.getElementById('btn-join').addEventListener('click', () => {
  joinMode = true;
  document.getElementById('name-input-area').classList.remove('hidden');
  document.getElementById('input-game-id').classList.remove('hidden');
  document.getElementById('btn-create').classList.add('hidden');
  document.getElementById('btn-join').classList.add('hidden');
  document.getElementById('input-name').focus();
});

document.getElementById('btn-back').addEventListener('click', () => {
  document.getElementById('name-input-area').classList.add('hidden');
  document.getElementById('btn-create').classList.remove('hidden');
  document.getElementById('btn-join').classList.remove('hidden');
});

document.getElementById('btn-confirm').addEventListener('click', () => {
  const name = document.getElementById('input-name').value.trim();
  if (!name) { showError('Enter a captain name'); return; }
  if (!socket.connected) { showError('Not connected to server'); return; }

  if (joinMode) {
    const code = document.getElementById('input-game-id').value.trim().toUpperCase();
    if (!code) { showError('Enter a game code'); return; }
    socket.emit('join_game', { gameId: code, playerName: name }, (res) => {
      if (res.success) {
        myId = socket.id; gameState = res.game; isHost = false;
        fetchOptions(); renderLobby(); showScreen('lobby');
      } else { showError(res.error || 'Failed to join'); }
    });
  } else {
    socket.emit('create_game', { playerName: name }, (res) => {
      if (res.success) {
        myId = socket.id; gameState = res.game; isHost = true;
        fetchOptions(); renderLobby(); showScreen('lobby');
      } else { showError('Failed to create game'); }
    });
  }
});

['input-name', 'input-game-id'].forEach(id => {
  document.getElementById(id).addEventListener('keydown', (e) => {
    if (e.key === 'Enter') document.getElementById('btn-confirm').click();
  });
});

function fetchOptions() {
  socket.emit('get_options', null, (opts) => { options = opts; });
}

// ============================================
// LOBBY
// ============================================
function renderLobby() {
  document.getElementById('lobby-code').textContent = gameState.id;
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
  campaignStats = { totalProfit: 0, totalRevenue: 0, totalCosts: 0, deliveries: 0, shipsBought: 0, shipsLost: 0, totalDamageTaken: 0, missileEvents: 0 };


  const me = gameState.players.find(p => p.id === myId);
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
const NPC_KILL_THRESHOLD = 0.08; // NPC destroyed if impact within this range

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
        updateFleetPanel();
      }
    }
  }

  // --- Check NPC ships ---
  for (let i = npcShips.length - 1; i >= 0; i--) {
    const npc = npcShips[i];
    const dist = Math.hypot(npc.lat - impactLat, npc.lon - impactLon);
    if (dist < NPC_KILL_THRESHOLD) {
      // Close hit — NPC destroyed
      addTransitEvent('NPC SHIP HIT', `${npc.shipName} struck by ${type}!`, 'danger');
      npcShips[i] = createNPCTanker(false);
    } else if (dist < BLAST_RADIUS) {
      // Glancing hit — NPC takes speed penalty and may divert
      const intensity = 1 - (dist / BLAST_RADIUS);
      npc.speed = Math.max(3, npc.speed * (1 - intensity * 0.5));
      if (intensity > 0.3 && npc.state !== 'waiting_safe') {
        // Spooked — divert to safety
        const SAFE_ANCHORAGES = [{ lat: 24.5, lon: 57.8, name: 'Gulf of Oman' }];
        npc.safeAnchorage = SAFE_ANCHORAGES[0];
        npc.savedState = npc.state;
        npc.state = 'waiting_safe';
        npc.waitTimer = 30 + Math.random() * 60;
        npc.targetHeading = headingToTarget(npc.lat, npc.lon, npc.safeAnchorage.lat, npc.safeAnchorage.lon);
        npc.speed = npc.baseSpeed * 0.6;
        npc._cautionChecked = false;
      }
    }
  }
});

// ============================================
// FLEET PANEL (top-left, always visible during transit)
// ============================================
function updateFleetPanel() {
  const me = gameState?.players.find(p => p.id === myId);
  if (!me) return;

  const cashEl = document.getElementById('plan-cash');
  if (cashEl) cashEl.textContent = formatMoney(me.cash || 0);
  const oilEl = document.getElementById('plan-oil-price');
  if (oilEl) oilEl.textContent = (gameState.oilPrice || 0).toFixed(2);
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
  if (isOnLand(target.lat, target.lon)) return;
  const wps = shipWaypoints[selectedShipId] || [];
  wps.push(target);
  shipWaypoints[selectedShipId] = wps;
  updateClearWpButton();
  const state = shipStates[selectedShipId];
  if (state.speed === 0) { const ship = getSelectedShipData(); state.speed = Math.round(ship?.speed || 14); }
  if (wps.length === 1) {
    state.targetHeading = headingToTarget(state.lat, state.lon, target.lat, target.lon);
  }
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

  const me = gameState.players.find(p => p.id === myId);
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
            ? `Sell $${t.sellPrice || '?'}/bbl`
            : `Buy $${t.buyPrice || '?'}/bbl`;
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
    shipTypeId: modalShipTypeId, aisId: modalAisId, insuranceId: modalInsuranceId
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
  { lat: 24.5, lon: 57.8, name: 'Gulf of Oman' },
  { lat: 1.2, lon: 104.0, name: 'Singapore Strait' },
  { lat: 36.0, lon: 14.5, name: 'Central Mediterranean' },
  { lat: 28.5, lon: -89.0, name: 'US Gulf Anchorage' },
  { lat: -33.5, lon: 18.0, name: 'Cape Town Roads' },
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

// ============================================
// OCEAN WAYPOINT GRAPH — NPC route planning
// ============================================
// Waypoints at key ocean locations; NPCs navigate through these to avoid land
const OCEAN_NODES = [
  // Persian Gulf (dense waypoints for complex coastline)
  { id: 'gulf_nw', lat: 29.4, lon: 48.5 },
  { id: 'gulf_w', lat: 28.0, lon: 50.0 },
  { id: 'gulf', lat: 27.0, lon: 50.0 },
  { id: 'gulf_central', lat: 26.5, lon: 52.0 },
  { id: 'gulf_qatar_e', lat: 25.5, lon: 53.0 },
  { id: 'gulf_uae', lat: 26.0, lon: 54.5 },
  { id: 'hormuz_ch', lat: 26.5, lon: 57.0 },
  { id: 'hormuz', lat: 26.5, lon: 56.5 },
  { id: 'gulf_oman', lat: 25.5, lon: 58.5 },
  { id: 'oman_se', lat: 24.5, lon: 59.0 },
  { id: 'oman', lat: 24.0, lon: 60.0 },
  // Indian Ocean
  { id: 'arabian_sea', lat: 15.0, lon: 60.0 },
  { id: 'mumbai_app', lat: 18.5, lon: 71.0 },
  { id: 'india_w', lat: 15.0, lon: 70.0 },
  { id: 'india_s', lat: 5.0, lon: 76.0 },
  { id: 'ceylon_e', lat: 5.5, lon: 83.0 },
  // Red Sea / Suez
  { id: 'bab', lat: 12.5, lon: 43.5 },
  { id: 'red_sea', lat: 20.0, lon: 38.5 },
  { id: 'red_sea_n', lat: 25.5, lon: 35.0 },
  { id: 'suez_app', lat: 28.5, lon: 33.2 },
  { id: 'suez_s', lat: 30.0, lon: 32.5 },
  { id: 'suez_n', lat: 31.5, lon: 32.2 },
  // Mediterranean / Europe
  { id: 'med_e', lat: 34.0, lon: 28.0 },
  { id: 'med_c', lat: 36.0, lon: 15.0 },
  { id: 'sicily_ch', lat: 38.0, lon: 12.0 },
  { id: 'med_w', lat: 38.0, lon: 3.0 },
  { id: 'gib_strait', lat: 35.97, lon: -5.4 },
  { id: 'gibraltar', lat: 36.1, lon: -6.2 },
  { id: 'biscay', lat: 45.0, lon: -8.0 },
  { id: 'channel', lat: 50.0, lon: -2.0 },
  { id: 'dover', lat: 51.0, lon: 1.5 },
  { id: 'north_sea', lat: 58.0, lon: 3.0 },
  { id: 'skagerrak', lat: 57.8, lon: 9.5 },
  { id: 'kattegat', lat: 56.5, lon: 11.0 },
  { id: 'baltic_south', lat: 55.0, lon: 16.0 },
  { id: 'baltic_east', lat: 57.5, lon: 20.0 },
  { id: 'baltic', lat: 59.5, lon: 24.0 },
  { id: 'primorsk_app', lat: 59.8, lon: 27.0 },
  // Africa
  { id: 'guinea', lat: 4.0, lon: -5.0 },
  { id: 'w_africa', lat: 4.0, lon: 3.0 },
  { id: 'cameroon', lat: 3.5, lon: 9.5 },
  { id: 'gabon', lat: -1.0, lon: 8.5 },
  { id: 'e_africa', lat: 0.0, lon: 45.0 },
  { id: 'angola', lat: -8.0, lon: 12.0 },
  { id: 'namibia', lat: -22.0, lon: 10.0 },
  { id: 'mozambique', lat: -15.0, lon: 42.0 },
  { id: 'madagascar_s', lat: -25.0, lon: 47.0 },
  { id: 'cape', lat: -34.5, lon: 18.5 },
  // Atlantic
  { id: 'atl_n', lat: 40.0, lon: -35.0 },
  { id: 'atl_s', lat: -10.0, lon: -20.0 },
  // Americas
  { id: 'us_east', lat: 38.0, lon: -72.0 },
  { id: 'florida_east', lat: 27.0, lon: -79.0 },
  { id: 'florida_str', lat: 24.0, lon: -81.5 },
  { id: 'us_gulf', lat: 28.0, lon: -90.0 },
  { id: 'caribbean', lat: 15.0, lon: -70.0 },
  { id: 'trinidad', lat: 11.0, lon: -62.0 },
  { id: 'venezuela', lat: 11.0, lon: -66.0 },
  { id: 'panama_c', lat: 9.4, lon: -79.6 },
  { id: 'panama_p', lat: 8.0, lon: -79.6 },
  { id: 'brazil', lat: -23.0, lon: -42.0 },
  { id: 'alaska', lat: 59.0, lon: -148.0 },
  { id: 'pac_n', lat: 45.0, lon: -155.0 },
  // Asia Pacific
  { id: 'andaman', lat: 8.0, lon: 96.0 },
  { id: 'malacca', lat: 2.5, lon: 101.0 },
  { id: 'singapore', lat: 1.3, lon: 104.0 },
  { id: 'gulf_thai', lat: 7.5, lon: 103.0 },
  { id: 'natuna', lat: 3.0, lon: 108.0 },
  { id: 'scs_south', lat: 7.0, lon: 112.0 },
  { id: 'scs', lat: 12.0, lon: 114.0 },
  { id: 'ecs', lat: 30.0, lon: 123.0 },
  { id: 'korea', lat: 34.0, lon: 129.5 },
  { id: 'japan', lat: 35.0, lon: 140.0 },
];

// Adjacency — pairs of connected waypoint IDs
const OCEAN_EDGES = [
  // Persian Gulf internal corridors
  ['gulf_nw', 'gulf_w'], ['gulf_w', 'gulf'], ['gulf_nw', 'gulf'],
  ['gulf', 'gulf_central'], ['gulf_central', 'gulf_qatar_e'],
  ['gulf_qatar_e', 'gulf_uae'], ['gulf_uae', 'hormuz_ch'],
  ['hormuz_ch', 'hormuz'], ['gulf_central', 'gulf_uae'],
  // Strait of Hormuz to Gulf of Oman
  ['hormuz_ch', 'hormuz'],
  ['hormuz_ch', 'gulf_oman'], ['gulf_oman', 'oman_se'],
  ['oman_se', 'oman'],
  // Indian Ocean
  ['oman', 'arabian_sea'], ['arabian_sea', 'india_w'], ['india_w', 'india_s'],
  ['mumbai_app', 'india_w'], ['mumbai_app', 'arabian_sea'],
  // Red Sea route
  ['arabian_sea', 'bab'], ['bab', 'red_sea'], ['red_sea', 'red_sea_n'],
  ['red_sea_n', 'suez_app'], ['suez_app', 'suez_s'],
  ['suez_s', 'suez_n'], ['suez_n', 'med_e'],
  // East Africa
  ['bab', 'e_africa'], ['e_africa', 'arabian_sea'],
  // Mediterranean
  ['med_e', 'med_c'], ['med_c', 'sicily_ch'],
  ['sicily_ch', 'med_w'], ['med_w', 'gib_strait'],
  ['gib_strait', 'gibraltar'],
  // Europe
  ['gibraltar', 'biscay'], ['biscay', 'channel'], ['channel', 'dover'],
  ['dover', 'north_sea'],
  ['north_sea', 'skagerrak'], ['skagerrak', 'kattegat'],
  ['kattegat', 'baltic_south'],
  ['baltic_south', 'baltic_east'], ['baltic_east', 'baltic'],
  ['baltic', 'primorsk_app'],
  // Atlantic crossings
  ['gibraltar', 'atl_n'], ['biscay', 'atl_n'], ['atl_n', 'us_east'],
  ['atl_n', 'atl_s'], ['gibraltar', 'w_africa'], ['gibraltar', 'guinea'],
  // West Africa — coastal route avoids cutting across land
  ['guinea', 'w_africa'], ['guinea', 'atl_n'], ['guinea', 'atl_s'],
  ['w_africa', 'cameroon'], ['cameroon', 'gabon'],
  ['gabon', 'angola'], ['angola', 'namibia'], ['namibia', 'cape'],
  ['w_africa', 'atl_s'], ['atl_s', 'cape'], ['atl_s', 'brazil'],
  ['angola', 'atl_s'],
  // East Africa — Cape route to Indian Ocean
  ['cape', 'madagascar_s'], ['madagascar_s', 'mozambique'],
  ['mozambique', 'e_africa'],
  // Americas (route around Florida via florida_str)
  ['us_east', 'florida_east'], ['florida_east', 'florida_str'],
  ['florida_str', 'us_gulf'],
  ['us_east', 'caribbean'], ['florida_east', 'caribbean'],
  ['florida_str', 'caribbean'],
  ['caribbean', 'venezuela'], ['caribbean', 'panama_c'],
  ['caribbean', 'trinidad'], ['trinidad', 'venezuela'],
  ['panama_c', 'panama_p'],
  ['atl_s', 'brazil'], ['brazil', 'cape'],
  // Pacific — full circumnavigation routes
  ['panama_p', 'pac_n'], ['pac_n', 'alaska'], ['pac_n', 'japan'],
  // Asia
  ['india_s', 'ceylon_e'], ['ceylon_e', 'andaman'],
  ['andaman', 'malacca'], ['malacca', 'singapore'],
  ['singapore', 'gulf_thai'], ['gulf_thai', 'natuna'],
  ['singapore', 'natuna'], ['natuna', 'scs_south'], ['scs_south', 'scs'],
  ['gulf_thai', 'scs_south'],
  ['scs', 'ecs'], ['ecs', 'korea'], ['korea', 'japan'], ['ecs', 'japan'],
];

// Build adjacency list
const OCEAN_ADJ = {};
for (const n of OCEAN_NODES) OCEAN_ADJ[n.id] = [];
for (const [a, b] of OCEAN_EDGES) {
  OCEAN_ADJ[a].push(b);
  OCEAN_ADJ[b].push(a);
}

// Find nearest waypoint to a lat/lon (handles longitude wrapping)
function nearestWaypoint(lat, lon) {
  let best = OCEAN_NODES[0], bestD = Infinity;
  for (const n of OCEAN_NODES) {
    let dLon = n.lon - lon;
    if (dLon > 180) dLon -= 360;
    if (dLon < -180) dLon += 360;
    const d = (n.lat - lat) ** 2 + dLon * dLon;
    if (d < bestD) { bestD = d; best = n; }
  }
  return best;
}

// BFS shortest path between two waypoint IDs
function bfsRoute(startId, endId) {
  if (startId === endId) return [];
  const visited = new Set([startId]);
  const queue = [[startId]];
  while (queue.length > 0) {
    const path = queue.shift();
    const curr = path[path.length - 1];
    for (const next of (OCEAN_ADJ[curr] || [])) {
      if (next === endId) return [...path.slice(1), next]; // exclude start
      if (!visited.has(next)) {
        visited.add(next);
        queue.push([...path, next]);
      }
    }
  }
  return []; // no path found
}

// Compute waypoint route from (lat,lon) to (lat,lon)
function computeOceanRoute(fromLat, fromLon, toLat, toLon) {
  const startNode = nearestWaypoint(fromLat, fromLon);
  const endNode = nearestWaypoint(toLat, toLon);
  // If close enough, just go direct
  if (distanceDeg(fromLat, fromLon, toLat, toLon) < 2) return [];
  const nodeIds = bfsRoute(startNode.id, endNode.id);
  const nodeMap = {};
  for (const n of OCEAN_NODES) nodeMap[n.id] = n;
  return nodeIds.map(id => ({ lat: nodeMap[id].lat, lon: nodeMap[id].lon }));
}

function createNPCTanker(staggered) {
  const type = NPC_SHIP_TYPES[Math.floor(Math.random() * NPC_SHIP_TYPES.length)];
  // Pick a terminal matching the ship's cargo type
  const exportTerminals = Object.values(EXPORT_TERMINALS);
  const matchingTerminals = exportTerminals.filter(t => (t.cargoType || 'oil') === type.cargoType);
  const terminal = matchingTerminals[Math.floor(Math.random() * matchingTerminals.length)];
  const speed = type.speed + (Math.random() - 0.5) * 2;
  const shipName = NPC_SHIP_NAMES[npcNameIndex % NPC_SHIP_NAMES.length];
  npcNameIndex++;

  const states = [NPC_STATE.HEADING_TO_TERMINAL, NPC_STATE.LOADING, NPC_STATE.HEADING_TO_DROPOFF, NPC_STATE.UNLOADING];
  const state = staggered ? states[Math.floor(Math.random() * states.length)] : NPC_STATE.HEADING_TO_DROPOFF;

  // Caution: 0 = daring (ignores risk), 1 = very cautious
  const caution = Math.random() < 0.2 ? Math.random() * 0.2 : 0.4 + Math.random() * 0.6;

  // Each NPC gets a random dropoff destination
  const dropoff = randomDropoff();

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
    npc.route.push({ lat: terminal.lat, lon: terminal.lon });
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
    npc.route.push({ lat: dropoff.lat, lon: dropoff.lon });
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

function headingToTarget(fromLat, fromLon, toLat, toLon) {
  let dLon = toLon - fromLon;
  if (dLon > 180) dLon -= 360;
  if (dLon < -180) dLon += 360;
  return normalizeAngle(Math.atan2(dLon, toLat - fromLat) * 180 / Math.PI);
}

function wrapLon(lon) {
  while (lon > 180) lon -= 360;
  while (lon < -180) lon += 360;
  return lon;
}

function distanceDeg(lat1, lon1, lat2, lon2) {
  let dLon = lon2 - lon1;
  // Shortest path around the globe
  if (dLon > 180) dLon -= 360;
  if (dLon < -180) dLon += 360;
  return Math.sqrt(Math.pow(lat1 - lat2, 2) + dLon * dLon);
}

// Autopilot route uses the ocean waypoint graph (same as NPC ships).
function computeAutopilotRoute(fromLat, fromLon, toLat, toLon) {
  const route = computeOceanRoute(fromLat, fromLon, toLat, toLon);
  route.push({ lat: toLat, lon: toLon });
  return route;
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
            npc._cautionChecked = false;
            // Recompute route from current position
            const dest = npc.state === NPC_STATE.HEADING_TO_TERMINAL ? npc.targetTerminal : npc.dropoff;
            npc.route = computeOceanRoute(npc.lat, npc.lon, dest.lat, dest.lon);
            npc.route.push({ lat: dest.lat, lon: dest.lon });
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
          npc.state = NPC_STATE.HEADING_TO_DROPOFF;
          npc.route = computeOceanRoute(npc.lat, npc.lon, npc.dropoff.lat, npc.dropoff.lon);
          npc.route.push({ lat: npc.dropoff.lat, lon: npc.dropoff.lon });
          npc.routeIdx = 0;
          const wp = npc.route[0];
          npc.targetHeading = headingToTarget(npc.lat, npc.lon, wp.lat, wp.lon);
        } else {
          // Pick new terminal and new dropoff for return trip
          const allT = Object.values(EXPORT_TERMINALS);
          const matching = allT.filter(t => (t.cargoType || 'oil') === npc.cargoType);
          npc.targetTerminal = matching[Math.floor(Math.random() * matching.length)];
          npc.dropoff = randomDropoff();
          npc.state = NPC_STATE.HEADING_TO_TERMINAL;
          npc.route = computeOceanRoute(npc.lat, npc.lon, npc.targetTerminal.lat, npc.targetTerminal.lon);
          npc.route.push({ lat: npc.targetTerminal.lat, lon: npc.targetTerminal.lon });
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
          npc.route.push({ lat: dest.lat, lon: dest.lon });
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
    const nearDest = npcDest && distanceDeg(npc.lat, npc.lon, npcDest.lat, npcDest.lon) < 0.4;

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

  // Real frame delta for consistent speed
  const realDt = Math.min((timestamp - lastFrameTime) / 1000, 0.1);
  lastFrameTime = timestamp;
  const dt = realDt * gameSpeedMultiplier;
  const elapsed = (timestamp - simStartTime) / 1000;
  simGameTime += realDt * SIM_CONFIG.TIME_SCALE * gameSpeedMultiplier;

  const me = gameState?.players.find(p => p.id === myId);

  // Update each player ship
  if (me) {
    for (const ship of me.fleet) {
      const state = shipStates[ship.id];
      if (!state || state.destroyed || state.seized) continue;

      // Autopilot: auto-manage waypoints for terminal ↔ dropoff loop
      const ap = shipAutopilot[ship.id];
      const apActive = ap && ap.active;
      if (apActive && ap.terminal && ap.dropoff) {
        const cargo = shipCargo[ship.id];
        const curWps = shipWaypoints[ship.id] || [];
        if (curWps.length === 0 && state.speed === 0) {
          // If empty → head to load terminal; if loaded → head to dropoff
          let dest;
          if (cargo && cargo.loaded) {
            dest = { lat: ap.dropoff.lat, lon: ap.dropoff.lon };
          } else {
            dest = { lat: ap.terminal.lat, lon: ap.terminal.lon };
          }
          const route = computeAutopilotRoute(state.lat, state.lon, dest.lat, dest.lon);
          shipWaypoints[ship.id] = route;
          state.speed = Math.round(ship.speed || 14);
          state.targetHeading = headingToTarget(state.lat, state.lon, route[0].lat, route[0].lon);
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
            const dest = (cargo && cargo.loaded)
              ? { lat: ap.dropoff.lat, lon: ap.dropoff.lon }
              : { lat: ap.terminal.lat, lon: ap.terminal.lon };
            const route = computeAutopilotRoute(state.lat, state.lon, dest.lat, dest.lon);
            shipWaypoints[ship.id] = route;
            state.apCoastEscapeTimer = 0;
            state.targetHeading = headingToTarget(state.lat, state.lon, route[0].lat, route[0].lon);
          }
          state.progressTimer = 0;
          state.progressLat = state.lat;
          state.progressLon = state.lon;
        }
      }

      // Autopilot land avoidance — same proven approach as NPC ships:
      // commit to escape heading when coast detected, ignore waypoints until clear
      if (apActive && state.speed > 0) {
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
            if (isOnLand(state.lat + Math.cos(resumeRad) * 0.5, state.lon + Math.sin(resumeRad) * 0.5)) {
              // Still blocked — find a new escape heading
              for (const angle of [45, -45, 70, -70, 90, -90, 120, -120]) {
                const tryRad = normalizeAngle(state.heading + angle) * Math.PI / 180;
                if (!isOnLand(state.lat + Math.cos(tryRad) * 0.5, state.lon + Math.sin(tryRad) * 0.5)) {
                  state.apCoastEscapeHeading = normalizeAngle(state.heading + angle);
                  state.apCoastEscapeTimer = 5 + Math.random() * 3;
                  state.targetHeading = state.apCoastEscapeHeading;
                  break;
                }
              }
            }
          }
        } else {
          // Proactive lookahead: check ahead for land
          const headRad = state.heading * Math.PI / 180;
          for (const la of [0.1, 0.2, 0.35, 0.5]) {
            if (isOnLand(state.lat + Math.cos(headRad) * la, state.lon + Math.sin(headRad) * la)) {
              for (const angle of [45, -45, 70, -70, 90, -90, 120, -120]) {
                const tryRad = normalizeAngle(state.heading + angle) * Math.PI / 180;
                if (!isOnLand(state.lat + Math.cos(tryRad) * 0.5, state.lon + Math.sin(tryRad) * 0.5)) {
                  state.apCoastEscapeHeading = normalizeAngle(state.heading + angle);
                  state.apCoastEscapeTimer = 5 + Math.random() * 4;
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
      const nearWpDest = nextWpDest && distanceDeg(state.lat, state.lon, nextWpDest.lat, nextWpDest.lon) < 0.4;
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
          updateFleetPanel();
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
            const buyPrice = terminal.buyPrice || 70;
            const cost = Math.round(ship.capacity * buyPrice);
            cargo.loaded = true; cargo.terminal = terminal; cargo.terminalId = terminal.id;
            cargo.buyCost = cost;
            const label = shipCargoType === 'lng' ? 'LNG LOADED' : 'CARGO LOADED';
            addTransitEvent(label, `${ship.name}: Loaded ${shipCargoType.toUpperCase()} at ${terminal.name} for ${formatMoney(cost)}.`, 'success');
            updateFleetPanel(); break;
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
            const sellPrice = isLng ? (dp.lngSellPrice || dp.sellPrice || 85) : (dp.sellPrice || 85);
            const grossRevenue = Math.round(ship.capacity * sellPrice * (1 - state.totalDamage));
            const buyCost = cargo.buyCost || 0;
            const profit = grossRevenue - buyCost;
            const revenue = Math.max(0, grossRevenue);
            socket.emit('deliver_cargo', { shipId: ship.id, revenue: profit }, (res) => {
              if (res?.success) {
                addTransitEvent('CARGO DELIVERED', `${ship.name}: Sold for ${formatMoney(grossRevenue)} (profit: ${formatMoney(profit)})!`, 'success');
              }
            });
            // Track campaign stats
            campaignStats.deliveries++;
            campaignStats.totalRevenue += grossRevenue;
            campaignStats.totalCosts += buyCost;
            campaignStats.totalProfit += profit;
            shipCargo[ship.id] = { loaded: false, terminal: null, terminalId: null };
            addTransitEvent('CARGO DELIVERED', `${ship.name}: Arrived at ${dp.name}. Sold for ${formatMoney(grossRevenue)} (profit: ${formatMoney(profit)})`, 'success');
            updateFleetPanel();
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
            const me = gameState?.players.find(p => p.id === myId);
            if (me) {
              me.fleet = me.fleet.filter(s => s.id !== ship.id);
            }
            // Clean up local state
            delete shipStates[ship.id];
            delete shipWaypoints[ship.id];
            delete shipTrails[ship.id];
            delete shipCargo[ship.id];
            if (selectedShipId === ship.id) {
              selectedShipId = me?.fleet[0]?.id || null;
            }
            updateFleetPanel();
          }
        });
        updateFleetPanel();
      }
    }
  }

  updateNPCShips(dt, elapsed);
  updateMilitaryShips(dt);

  if (elapsed - lastEventCheck > SIM_CONFIG.EVENT_CHECK_INTERVAL / 1000) {
    lastEventCheck = elapsed;
    checkDangerZonesAllShips(elapsed);
  }

  updateAmbientWar(elapsed);

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

  drawMap(mapCanvas, {
    showZones: false, showFinish: false, showTerminals: true, showSpawn: false,
    selectedTerminalId: null,
    ship: selectedState, allTrails,
    targetPoint: selectedWps.length > 0 ? selectedWps[0] : null,
    waypoints: selectedWps,
    npcShips, militaryShips, showMinimap: true, playerShips,
    labels: mapLabelSettings,
    sunLon: getSunLon(),
  });

  if (selectedState) drawCompass(compassCanvas, selectedState.heading);

  requestAnimationFrame(transitLoop);
}

// ============================================
// HUD UPDATE
// ============================================
function updateHUD() {
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
}

// ============================================
// CAMPAIGN REPORT CARD
// ============================================
function showCampaignReport() {
  transitActive = false;
  const me = gameState?.players.find(p => p.id === myId);
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
// Stagger initial offsets so they don't start in sync
let iranianOffset = 0;
let alliedOffset = 1.5 + Math.random() * 1.5; // 1.5-3s after Iranian

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
      if (npcShips.length > 0 && iranMissileBases.length > 0 && Math.random() < 0.15) {
        const movingNpcs = npcShips.filter(n => n.speed > 0);
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
}

// ============================================
// DANGER ZONES (all ships)
// ============================================
function checkDangerZonesAllShips(elapsed) {
  const me = gameState?.players.find(p => p.id === myId);
  if (!me) return;
  const risk = RISK_LEVELS[gameState.riskLevel];

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
      let prob = zone.baseProbability * risk.eventFrequency * ais.detectionMultiplier * (2 - (state.health - state.totalDamage)) * defReduction * nightMult;
      if (Math.random() < prob) {
        const eventId = zone.events[Math.floor(Math.random() * zone.events.length)];
        const evt = EVENTS.find(e => e.id === eventId);
        if (!evt) continue;
        const roll = Math.random();
        let oi = 0, cw = 0;
        for (let w = 0; w < 3; w++) { cw += [0.5, 0.25, 0.25][w]; if (roll < cw) { oi = w; break; } }
        const outcome = evt.outcomes[oi];
        zoneCooldowns[cooldownKey] = elapsed;
        // Defense reduces damage taken
        const damageReduction = 1 - defLevel * 0.15;
        state.totalDamage += outcome.damagePercent * damageReduction;
        state.totalDelay += Math.max(0, outcome.delayHours);
        state.totalMoneyLoss += outcome.moneyLoss;
        if (outcome.delayHours >= 720) state.seized = true;
        if (outcome.damagePercent > 0.1) state.speed = Math.round(Math.max(5, ship.speed * (1 - state.totalDamage * 0.5)));
        campaignStats.totalDamageTaken += outcome.damagePercent * damageReduction;
        if (eventId === 'missile_alert' || eventId === 'drone_swarm') campaignStats.missileEvents++;
        // Spawn missile animation for missile events
        if (eventId === 'missile_alert' || eventId === 'drone_swarm') {
          const iranBases = MILITARY_BASES.filter(b => b.country === 'Iran');
          const alliedCountries = ['US', 'UAE', 'Oman', 'Qatar', 'Bahrain', 'Kuwait', 'Israel'];
          const alliedBases = MILITARY_BASES.filter(b => alliedCountries.includes(b.country));
          const alliedCities = CITIES.filter(c => alliedCountries.includes(c.country));
          if (iranBases.length > 0) {
            const launcher = iranBases[Math.floor(Math.random() * iranBases.length)];
            const roll = Math.random();
            if (roll < 0.25) {
              // 25% chance: missile aimed directly at this ship
              const shipTarget = scatterTarget(state.lat, state.lon);
              spawnMissile(launcher.lat, launcher.lon, shipTarget.lat, shipTarget.lon);
            } else {
              // 75% chance: missile aimed at allied target (base/city/random land)
              const target = pickMissileTarget(alliedBases, alliedCities);
              if (target) {
                if (Math.random() < 0.05) {
                  // 5% malfunction — hits ship instead
                  const shipTarget = scatterTarget(state.lat, state.lon);
                  spawnMissile(launcher.lat, launcher.lon, shipTarget.lat, shipTarget.lon);
                  addTransitEvent('MISSILE MALFUNCTION', 'An enemy missile veered off course toward your vessel!', 'danger');
                } else {
                  spawnMissile(launcher.lat, launcher.lon, target.lat, target.lon);
                }
              }
            }
          }
          // Fighter plane sorties
          const iranAirBases = MILITARY_BASES.filter(b => b.country === 'Iran' && b.type === 'air');
          if (iranAirBases.length > 0) {
            const airBase = iranAirBases[Math.floor(Math.random() * iranAirBases.length)];
            const roll2 = Math.random();
            if (roll2 < 0.25) {
              spawnPlane(airBase.id, airBase.lat, airBase.lon, state.lat, state.lon);
            } else {
              const target = pickMissileTarget(alliedBases, alliedCities);
              if (target) {
                if (Math.random() < 0.05) {
                  spawnPlane(airBase.id, airBase.lat, airBase.lon, state.lat, state.lon);
                  addTransitEvent('AIRSTRIKE ERROR', 'An enemy fighter veered off course toward your vessel!', 'danger');
                } else {
                  spawnPlane(airBase.id, airBase.lat, airBase.lon, target.lat, target.lon);
                }
              }
            }
          }
        }
        let extra = '';
        if (outcome.damagePercent > 0) extra += ` [Dmg: ${Math.round(outcome.damagePercent * 100)}%]`;
        if (outcome.moneyLoss > 0) extra += ` [Loss: ${Math.round(outcome.moneyLoss * 100)}%]`;
        addTransitEvent(`${ship.name}: ${evt.name}`, outcome.text + extra,
          outcome.damagePercent > 0 || outcome.moneyLoss > 0 ? 'danger' : outcome.delayHours < 0 ? 'success' : '');
        updateFleetPanel();
      }
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
    container.firstChild.style.opacity = '0';
    setTimeout(() => container.firstChild?.remove(), 300);
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
    const buyPrice = terminal.buyPrice || 70;
    priceHtml = `<div class="terminal-popup-row"><span>Buy Price:</span><span class="stat-warn">$${buyPrice}/${unit}</span></div>`;
  } else {
    const sellPrice = isLng ? (terminal.lngSellPrice || terminal.sellPrice || 85) : (terminal.sellPrice || 85);
    priceHtml = `<div class="terminal-popup-row"><span>Sell Price:</span><span class="stat-good">$${sellPrice}/${unit}</span></div>`;
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
// MAP CLICK HANDLER
// ============================================
mapCanvas.addEventListener('click', (e) => {
  if (!transitActive || isPanning) return;
  const rect = mapCanvas.getBoundingClientRect();
  const cx = e.clientX - rect.left;
  const cy = e.clientY - rect.top;
  const target = canvasToLatLon(cx, cy, rect.width, rect.height);

  // Check ship click first (higher priority than terminals)
  const me = gameState?.players.find(p => p.id === myId);
  if (me) {
    for (const ship of me.fleet) {
      const state = shipStates[ship.id];
      if (!state || state.destroyed || state.seized) continue;
      const shipPos = latLonToCanvas(state.lat, state.lon, rect.width, rect.height);
      if (Math.sqrt(Math.pow(cx - shipPos.x, 2) + Math.pow(cy - shipPos.y, 2)) < 20) {
        if (ship.id === selectedShipId) {
          // Click selected ship again → deselect
          deselectShip();
        } else {
          selectShip(ship.id);
        }
        return;
      }
    }
  }

  // Check terminal click (all terminals — export and import)
  for (const terminal of Object.values(OIL_TERMINALS)) {
    const tPos = latLonToCanvas(terminal.lat, terminal.lon, rect.width, rect.height);
    if (Math.sqrt(Math.pow(cx - tPos.x, 2) + Math.pow(cy - tPos.y, 2)) < 20) {
      if (selectedShipId && shipStates[selectedShipId]) {
        addWaypointForSelectedShip({ lat: terminal.lat, lon: terminal.lon });
      } else {
        showTerminalPopup(terminal, e.clientX, e.clientY);
      }
      return;
    }
  }

  if (shipControlOpen) closeShipControlPanel();
  hideTerminalPopup();

  // Add waypoint for selected ship
  if (!selectedShipId || !shipStates[selectedShipId]) return;
  addWaypointForSelectedShip(target);
});

mapCanvas.addEventListener('contextmenu', (e) => e.preventDefault());

// ============================================
// ANGLE UTILITIES
// ============================================
function normalizeAngle(a) { a = a % 360; if (a < 0) a += 360; return a; }
function angleDiff(from, to) { let diff = to - from; while (diff > 180) diff -= 360; while (diff < -180) diff += 360; return diff; }

// ============================================
// SOCKET EVENTS
// ============================================
socket.on('connect', () => { myId = socket.id; });

socket.on('game_update', (state) => {
  gameState = state;
  if (state.players.length > 0 && state.players[0].id === myId) isHost = true;
  const activeScreen = document.querySelector('.screen.active');
  if (activeScreen?.id === 'screen-lobby') renderLobby();
  if (transitActive) updateFleetPanel();
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
