import { io } from 'socket.io-client';
import { drawMap, drawCompass, latLonToCanvas, canvasToLatLon, setViewport, getViewport, isOnLand, drawWaypoints, spawnMissile, spawnPlane, setImpactHandler } from './map.js';
import { CHOKEPOINTS } from './world-coastlines.js';
import {
  SIM_CONFIG, DANGER_ZONES, EVENTS, RISK_LEVELS, MAP_BOUNDS, GULF_BOUNDS,
  FUEL_COST_PER_UNIT, DEFAULT_VIEWPORT, OIL_TERMINALS,
  NPC_SHIP_TYPES, MILITARY_SHIPS, DROPOFF_POINT, MILITARY_BASES, CITIES
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

let gameSpeedMultiplier = 1;

let transitActive = false;
let simStartTime = 0;
let simGameTime = 0;
let lastFrameTime = 0;
let zoneCooldowns = {};
let lastEventCheck = 0;

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
  // Allow longitude panning freely (wrap if needed)
  let west = Math.max(MAP_BOUNDS.west, Math.min(MAP_BOUNDS.east - lonRange, vp.west));
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
  state.speed = Math.max(0, state.speed - 1);
  document.getElementById('scp-speed-value').textContent = `${state.speed} kts`;
});

document.getElementById('scp-speed-up').addEventListener('click', () => {
  if (!selectedShipId || !shipStates[selectedShipId]) return;
  const ship = getSelectedShipData();
  const state = shipStates[selectedShipId];
  state.speed = Math.min(20, state.speed + 1);
  const ratedSpeed = ship?.speed || 16;
  const label = state.speed > ratedSpeed ? `${state.speed} kts ⚠` : `${state.speed} kts`;
  document.getElementById('scp-speed-value').textContent = label;
});

document.querySelectorAll('.scp-ais-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    if (!selectedShipId || !options) return;
    const aisKey = btn.dataset.ais;
    const aisOpt = options.aisOptions[aisKey];
    if (aisOpt) {
      const ship = getSelectedShipData();
      if (ship) { ship.aisId = aisKey; ship.aisName = aisOpt.name; }
      document.querySelectorAll('.scp-ais-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      addTransitEvent('AIS CHANGE', `Transponder set to: ${aisOpt.name}`, '');
    }
  });
});

// Insurance buttons
document.querySelectorAll('.scp-ins-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    if (!selectedShipId || !options) return;
    const insKey = btn.dataset.ins;
    const insOpt = options.insuranceOptions[insKey];
    if (insOpt) {
      const ship = getSelectedShipData();
      if (ship) { ship.insuranceId = insKey; ship.insuranceName = insOpt.name; }
      document.querySelectorAll('.scp-ins-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      addTransitEvent('INSURANCE CHANGE', `Insurance set to: ${insOpt.name} (weekly)`, '');
    }
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
  if (state.totalDamage <= 0) {
    document.getElementById('scp-upgrade-info').textContent = 'Ship is at full health.';
    return;
  }
  const repairCost = Math.round(ship.cost * state.totalDamage * 0.3);
  const me = gameState?.players.find(p => p.id === myId);
  if (!me || me.cash < repairCost) {
    document.getElementById('scp-upgrade-info').textContent = `Need ${formatMoney(repairCost)} to repair.`;
    return;
  }
  socket.emit('upgrade_ship', { shipId: selectedShipId, type: 'repair', cost: repairCost }, (res) => {
    if (res?.success) {
      state.totalDamage = 0;
      addTransitEvent('SHIP REPAIRED', `${ship.name} fully repaired for ${formatMoney(repairCost)}.`, 'success');
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
  socket.emit('upgrade_ship', { shipId: selectedShipId, type: 'engine', cost }, (res) => {
    if (res?.success) {
      ship.engineUpgrade = 1;
      ship.speed += 4;
      addTransitEvent('ENGINE UPGRADE', `${ship.name}: Engine upgraded! +4 kts`, 'success');
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
  socket.emit('upgrade_ship', { shipId: selectedShipId, type: 'defense', cost: DEFENSE_COST }, (res) => {
    if (res?.success) {
      ship.defenseUpgrade = 1;
      addTransitEvent('DEFENSE UPGRADE', `${ship.name}: Armed guards & hull armor installed!`, 'success');
      refreshUpgradeButtons();
    }
  });
});

// Upgrade: Autopilot
function populateApTerminalSelect(ship) {
  const sel = document.getElementById('scp-ap-terminal');
  sel.innerHTML = '';
  const cargoType = ship.cargoType || 'oil';
  const terminals = Object.values(OIL_TERMINALS).filter(t => (t.cargoType || 'oil') === cargoType);
  terminals.forEach(t => {
    const opt = document.createElement('option');
    opt.value = t.id;
    opt.textContent = `${t.name} (${t.country}) +${Math.round(t.loadingBonus * 100)}%`;
    sel.appendChild(opt);
  });
  // Pre-select current terminal if set
  const ap = shipAutopilot[ship.id];
  if (ap && ap.terminal) sel.value = ap.terminal.id;
}

function getTerminalById(id) {
  return Object.values(OIL_TERMINALS).find(t => t.id === id);
}

function engageAutopilot(ship) {
  const sel = document.getElementById('scp-ap-terminal');
  const terminal = getTerminalById(sel.value);
  if (!terminal) return;
  shipAutopilot[ship.id] = { active: true, terminal };
  // Reset escape state and clear old waypoints so it re-routes
  const state = shipStates[ship.id];
  if (state) { state.apCoastEscapeTimer = 0; state.apCoastEscapeHeading = 0; }
  shipWaypoints[ship.id] = [];
  addTransitEvent('AUTOPILOT ON', `${ship.name}: Route → ${terminal.name} ↔ ${DROPOFF_POINT.name}`, 'success');
  refreshUpgradeButtons();
}

document.getElementById('scp-autopilot').addEventListener('click', () => {
  if (!selectedShipId) return;
  const ship = getSelectedShipData();
  const state = shipStates[selectedShipId];
  if (!ship || !state) return;

  const ap = shipAutopilot[ship.id];
  if (ap && ap.active) {
    // Toggle off — stop ship and clear waypoints
    ap.active = false;
    shipWaypoints[ship.id] = [];
    const state = shipStates[ship.id];
    if (state) { state.speed = 0; state.apCoastEscapeTimer = 0; }
    addTransitEvent('AUTOPILOT OFF', `${ship.name}: Autopilot disengaged.`, '');
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
    socket.emit('upgrade_ship', { shipId: selectedShipId, type: 'autopilot', cost }, (res) => {
      if (res?.success) {
        ship.hasAutopilot = true;
        populateApTerminalSelect(ship);
        engageAutopilot(ship);
      }
    });
  } else {
    engageAutopilot(ship);
  }
});

// Change autopilot destination while running
document.getElementById('scp-ap-terminal').addEventListener('change', () => {
  if (!selectedShipId) return;
  const ship = getSelectedShipData();
  const ap = shipAutopilot[ship.id];
  if (!ship || !ap || !ap.active) return;
  const terminal = getTerminalById(document.getElementById('scp-ap-terminal').value);
  if (!terminal) return;
  ap.terminal = terminal;
  const state = shipStates[ship.id];
  if (state) {
    state.apCoastEscapeTimer = 0;
    // Immediately compute new route to updated destination
    const cargo = shipCargo[ship.id];
    let dest;
    if (cargo && cargo.loaded) {
      dest = { lat: DROPOFF_POINT.lat, lon: DROPOFF_POINT.lon };
    } else {
      dest = { lat: terminal.lat, lon: terminal.lon };
    }
    const route = computeAutopilotRoute(state.lat, state.lon, dest.lat, dest.lon);
    shipWaypoints[ship.id] = route;
    if (state.speed === 0) state.speed = Math.round(ship.speed || 14);
    state.targetHeading = headingToTarget(state.lat, state.lon, route[0].lat, route[0].lon);
  }
  addTransitEvent('AUTOPILOT REROUTE', `${ship.name}: New route → ${terminal.name} ↔ ${DROPOFF_POINT.name}`, 'success');
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

function spawnShipState(ship) {
  const lat = SIM_CONFIG.SPAWN_LAT + (Math.random() - 0.5) * 0.3;
  const lon = SIM_CONFIG.SPAWN_LON + (Math.random() - 0.5) * 0.3;
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
    state.targetHeading = normalizeAngle(Math.atan2(target.lon - state.lon, target.lat - state.lat) * 180 / Math.PI);
  }
}

// ============================================
// SHIP PURCHASE MODAL
// ============================================
function openShipPurchaseModal() {
  if (!options) return;
  const modal = document.getElementById('ship-purchase-modal');
  modal.classList.remove('hidden');
  modalShipTypeId = null; modalAisId = null; modalInsuranceId = null;
  document.getElementById('modal-step-ship').classList.remove('hidden');
  document.getElementById('modal-step-config').classList.add('hidden');

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
      showModalConfigStep(options.shipTypes[key]);
    });
  });
}

function showModalConfigStep(shipType) {
  document.getElementById('modal-step-ship').classList.add('hidden');
  document.getElementById('modal-step-config').classList.remove('hidden');
  document.getElementById('modal-ship-name').textContent = shipType.name;
  modalAisId = null; modalInsuranceId = null;

  const aisList = document.getElementById('modal-ais-list');
  aisList.innerHTML = Object.entries(options.aisOptions).map(([key, opt]) => {
    const detClass = opt.detectionMultiplier <= 0.5 ? 'stat-good' : opt.detectionMultiplier >= 1.2 ? 'stat-bad' : 'stat-warn';
    return `<div class="option-card" data-ais-key="${key}">
      <div class="option-name">${opt.name}</div>
      <div class="option-desc">${opt.description}</div>
      <div class="option-stats">
        <span class="stat ${detClass}">Detection: ${opt.detectionMultiplier}x</span>
        ${opt.legalPenalty > 0 ? `<span class="stat stat-bad">Fine: ${formatMoney(opt.legalPenalty)}</span>` : ''}
      </div>
    </div>`;
  }).join('');
  aisList.querySelectorAll('.option-card').forEach(card => {
    card.addEventListener('click', () => {
      aisList.querySelectorAll('.option-card').forEach(c => c.classList.remove('selected'));
      card.classList.add('selected');
      modalAisId = card.dataset.aisKey;
    });
  });

  const insList = document.getElementById('modal-insurance-list');
  insList.innerHTML = Object.entries(options.insuranceOptions).map(([key, opt]) => `
    <div class="option-card" data-ins-key="${key}">
      <div class="option-name">${opt.name}</div>
      <div class="option-desc">${opt.description}</div>
      <div class="option-stats">
        <span class="stat">${(opt.weeklyPremiumPercent * 100).toFixed(1)}%/week</span>
        <span class="stat ${opt.coveragePercent >= 0.8 ? 'stat-good' : opt.coveragePercent > 0 ? 'stat-warn' : 'stat-bad'}">
          ${Math.round(opt.coveragePercent * 100)}% coverage
        </span>
      </div>
    </div>`).join('');
  insList.querySelectorAll('.option-card').forEach(card => {
    card.addEventListener('click', () => {
      insList.querySelectorAll('.option-card').forEach(c => c.classList.remove('selected'));
      card.classList.add('selected');
      modalInsuranceId = card.dataset.insKey;
    });
  });
}

function closeShipPurchaseModal() {
  document.getElementById('ship-purchase-modal').classList.add('hidden');
}

document.getElementById('modal-cancel').addEventListener('click', closeShipPurchaseModal);

document.getElementById('modal-confirm-buy').addEventListener('click', () => {
  if (!modalShipTypeId || !modalAisId || !modalInsuranceId) {
    showError('Select AIS and insurance'); return;
  }
  socket.emit('buy_ship', {
    shipTypeId: modalShipTypeId, aisId: modalAisId, insuranceId: modalInsuranceId
  }, (res) => {
    if (res.success) {
      closeShipPurchaseModal();
      if (res.ship) {
        spawnShipState(res.ship);
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

// Safe anchorage zone — Gulf of Oman only
const SAFE_ANCHORAGES = [
  { lat: 24.5, lon: 57.8, name: 'Gulf of Oman' },
];

const NPC_SHIP_NAMES = [
  'Pacific Voyager', 'Gulf Pioneer', 'Sea Fortune', 'Ocean Grace',
  'Star Horizon', 'Desert Wind', 'Al Jazeera', 'Eastern Promise',
  'Coral Spirit', 'Golden Eagle', 'Silver Dawn', 'Arctic Breeze',
  'Pearl Venture', 'Crimson Tide', 'Blue Marlin', 'Iron Duke',
  'Swift Arrow', 'Amber Sun', 'Jade Empress', 'Ruby Crown',
  'Sapphire Wave', 'Diamond Crest', 'Emerald Bay', 'Crystal Sea',
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

function createNPCTanker(staggered) {
  const type = NPC_SHIP_TYPES[Math.floor(Math.random() * NPC_SHIP_TYPES.length)];
  // Pick a terminal matching the ship's cargo type
  const allTerminals = Object.values(OIL_TERMINALS);
  const matchingTerminals = allTerminals.filter(t => (t.cargoType || 'oil') === type.cargoType);
  const terminal = matchingTerminals[Math.floor(Math.random() * matchingTerminals.length)];
  const speed = type.speed + (Math.random() - 0.5) * 2;
  const shipName = NPC_SHIP_NAMES[npcNameIndex % NPC_SHIP_NAMES.length];
  npcNameIndex++;

  const states = [NPC_STATE.HEADING_TO_TERMINAL, NPC_STATE.LOADING, NPC_STATE.HEADING_TO_DROPOFF, NPC_STATE.UNLOADING];
  const state = staggered ? states[Math.floor(Math.random() * states.length)] : NPC_STATE.HEADING_TO_DROPOFF;

  // Caution: 0 = daring (ignores risk), 1 = very cautious
  // ~20% of NPCs are daring, rest are cautious to varying degrees
  const caution = Math.random() < 0.2 ? Math.random() * 0.2 : 0.4 + Math.random() * 0.6;

  const npc = {
    lat: 0, lon: 0, heading: 0, targetHeading: 0, speed, baseSpeed: speed,
    size: type.size, color: type.color, typeName: type.name, shipName,
    name: `${shipName} (${type.name})`,
    cargoType: type.cargoType,
    targetTerminal: terminal,
    state,
    caution,
    waitTimer: 0,
    safeAnchorage: null,
    loadTimer: 0, wanderTimer: 5 + Math.random() * 10, wanderOffset: 0, stuckCount: 0,
    coastEscapeTimer: 0, coastEscapeHeading: 0,
    trail: [],
  };

  // Place based on state
  if (npc.state === NPC_STATE.LOADING) {
    const lp = randomWaterPos(terminal.lat - 0.1, terminal.lat + 0.1, terminal.lon - 0.1, terminal.lon + 0.1);
    npc.lat = lp.lat; npc.lon = lp.lon; npc.speed = 0;
    npc.loadTimer = 10 + Math.random() * 20;
  } else if (npc.state === NPC_STATE.UNLOADING) {
    const dp = randomWaterPos(DROPOFF_POINT.lat - 0.2, DROPOFF_POINT.lat + 0.2, DROPOFF_POINT.lon - 0.2, DROPOFF_POINT.lon + 0.2);
    npc.lat = dp.lat; npc.lon = dp.lon; npc.speed = 0;
    npc.loadTimer = 8 + Math.random() * 12;
  } else if (npc.state === NPC_STATE.HEADING_TO_TERMINAL) {
    // Place somewhere in the gulf heading toward terminal
    const mp = randomWaterPos(25.0, 27.0, 53.0, 58.0);
    npc.lat = mp.lat; npc.lon = mp.lon;
    npc.heading = headingToTarget(npc.lat, npc.lon, terminal.lat, terminal.lon);
    npc.targetHeading = npc.heading;
  } else {
    // HEADING_TO_DROPOFF — place somewhere between terminal and dropoff
    const mp = randomWaterPos(25.0, 27.0, 53.0, 58.0);
    npc.lat = mp.lat; npc.lon = mp.lon;
    npc.heading = headingToTarget(npc.lat, npc.lon, DROPOFF_POINT.lat, DROPOFF_POINT.lon);
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
  return normalizeAngle(Math.atan2(toLon - fromLon, toLat - fromLat) * 180 / Math.PI);
}

function distanceDeg(lat1, lon1, lat2, lon2) {
  return Math.sqrt(Math.pow(lat1 - lat2, 2) + Math.pow(lon1 - lon2, 2));
}

// Autopilot route is simply the destination waypoint.
// Land avoidance is handled reactively (same as NPC ships) during movement.
function computeAutopilotRoute(fromLat, fromLon, toLat, toLon) {
  return [{ lat: toLat, lon: toLon }];
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
            if (npc.state === NPC_STATE.HEADING_TO_TERMINAL) {
              npc.targetHeading = headingToTarget(npc.lat, npc.lon, npc.targetTerminal.lat, npc.targetTerminal.lon);
            } else {
              npc.targetHeading = headingToTarget(npc.lat, npc.lon, DROPOFF_POINT.lat, DROPOFF_POINT.lon);
            }
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
          npc.targetHeading = headingToTarget(npc.lat, npc.lon, DROPOFF_POINT.lat, DROPOFF_POINT.lon);
        } else {
          // Pick new terminal matching cargo type
          const allT = Object.values(OIL_TERMINALS);
          const matching = allT.filter(t => (t.cargoType || 'oil') === npc.cargoType);
          npc.targetTerminal = matching[Math.floor(Math.random() * matching.length)];
          npc.state = NPC_STATE.HEADING_TO_TERMINAL;
          npc.targetHeading = headingToTarget(npc.lat, npc.lon, npc.targetTerminal.lat, npc.targetTerminal.lon);
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

    // Moving states — check arrival
    if (npc.state === NPC_STATE.HEADING_TO_TERMINAL) {
      const t = npc.targetTerminal;
      if (distanceDeg(npc.lat, npc.lon, t.lat, t.lon) < (t.loadRadius || 0.15)) {
        npc.state = NPC_STATE.LOADING; npc.loadTimer = 15 + Math.random() * 25; npc.speed = 0; continue;
      }
      npc.targetHeading = headingToTarget(npc.lat, npc.lon, t.lat, t.lon);
    } else if (npc.state === NPC_STATE.HEADING_TO_DROPOFF) {
      if (distanceDeg(npc.lat, npc.lon, DROPOFF_POINT.lat, DROPOFF_POINT.lon) < DROPOFF_POINT.radius) {
        npc.state = NPC_STATE.UNLOADING; npc.loadTimer = 8 + Math.random() * 12; npc.speed = 0; continue;
      }
      npc.targetHeading = headingToTarget(npc.lat, npc.lon, DROPOFF_POINT.lat, DROPOFF_POINT.lon);
    }

    // Coast escape mode: after hitting land, commit to escape heading
    // until safely away from coast before resuming normal navigation
    if (npc.coastEscapeTimer > 0) {
      npc.coastEscapeTimer -= dt;
      // Keep heading locked to escape direction, no wander
      const diff = angleDiff(npc.heading, npc.coastEscapeHeading);
      if (Math.abs(diff) > 0.5) npc.heading = normalizeAngle(npc.heading + Math.sign(diff) * Math.min(Math.abs(diff), 2.5 * dt * 60));
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

    // Land avoidance
    if (!isOnLand(newLat, newLon)) {
      npc.lon = newLon; npc.lat = newLat; npc.stuckCount = 0;
      // Proactive: check multiple distances ahead for early avoidance
      const lookAheads = [0.05, 0.1, 0.15];
      for (const la of lookAheads) {
        if (isOnLand(npc.lat + Math.cos(rad) * la, npc.lon + Math.sin(rad) * la)) {
          // Find a clear direction and enter coast escape mode
          for (const angle of [30, -30, 60, -60, 90, -90, 120, -120]) {
            const tryRad = normalizeAngle(npc.heading + angle) * Math.PI / 180;
            if (!isOnLand(npc.lat + Math.cos(tryRad) * 0.15, npc.lon + Math.sin(tryRad) * 0.15)) {
              npc.coastEscapeHeading = normalizeAngle(npc.heading + angle);
              npc.coastEscapeTimer = 3 + Math.random() * 2; // commit for 3-5 seconds
              npc.wanderOffset = 0;
              break;
            }
          }
          break;
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
          npc.coastEscapeTimer = 4 + Math.random() * 3; // commit for 4-7 seconds
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

    // Clamp to map
    npc.lat = Math.max(GULF_BOUNDS.south + 0.1, Math.min(GULF_BOUNDS.north - 0.1, npc.lat));
    npc.lon = Math.max(GULF_BOUNDS.west + 0.1, Math.min(GULF_BOUNDS.east - 0.1, npc.lon));

  }
}

function getNPCDestination(npc) {
  if (npc.state === NPC_STATE.HEADING_TO_TERMINAL) return npc.targetTerminal?.name || 'Terminal';
  if (npc.state === NPC_STATE.LOADING) return `Loading at ${npc.targetTerminal?.name || 'Terminal'}`;
  if (npc.state === NPC_STATE.HEADING_TO_DROPOFF) return DROPOFF_POINT.name;
  if (npc.state === NPC_STATE.UNLOADING) return `Unloading at ${DROPOFF_POINT.name}`;
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
      if (apActive && ap.terminal) {
        const cargo = shipCargo[ship.id];
        const curWps = shipWaypoints[ship.id] || [];
        if (curWps.length === 0 && state.speed === 0) {
          // Need new destination — compute routed waypoints
          let dest;
          if (cargo && cargo.loaded) {
            dest = { lat: DROPOFF_POINT.lat, lon: DROPOFF_POINT.lon };
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
        const dLon = wp.lon - state.lon;
        const dLat = wp.lat - state.lat;
        const distToWP = Math.sqrt(dLon * dLon + dLat * dLat);
        if (distToWP < 0.03) {
          wps.shift();
          if (ship.id === selectedShipId) updateClearWpButton();
          if (wps.length > 0) {
            const next = wps[0];
            state.targetHeading = normalizeAngle(Math.atan2(next.lon - state.lon, next.lat - state.lat) * 180 / Math.PI);
          } else { state.speed = 0; }
        } else {
          state.targetHeading = normalizeAngle(Math.atan2(dLon, dLat) * 180 / Math.PI);
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
        } else {
          // Proactive lookahead: check ahead for land
          const headRad = state.heading * Math.PI / 180;
          for (const la of [0.05, 0.1, 0.15]) {
            if (isOnLand(state.lat + Math.cos(headRad) * la, state.lon + Math.sin(headRad) * la)) {
              for (const angle of [30, -30, 60, -60, 90, -90, 120, -120]) {
                const tryRad = normalizeAngle(state.heading + angle) * Math.PI / 180;
                if (!isOnLand(state.lat + Math.cos(tryRad) * 0.15, state.lon + Math.sin(tryRad) * 0.15)) {
                  state.apCoastEscapeHeading = normalizeAngle(state.heading + angle);
                  state.apCoastEscapeTimer = 3 + Math.random() * 2;
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
      if (!isOnLand(newLat, newLon)) { state.lon = newLon; state.lat = newLat; }
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

      state.lat = Math.max(GULF_BOUNDS.south + 0.05, Math.min(GULF_BOUNDS.north - 0.05, state.lat));
      state.lon = Math.max(GULF_BOUNDS.west + 0.05, Math.min(GULF_BOUNDS.east - 0.05, state.lon));

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

      // Terminal cargo loading (cargo type must match)
      const cargo = shipCargo[ship.id];
      if (cargo && !cargo.loaded) {
        const shipCargoType = ship.cargoType || 'oil';
        for (const terminal of Object.values(OIL_TERMINALS)) {
          const terminalCargoType = terminal.cargoType || 'oil';
          if (shipCargoType !== terminalCargoType) continue;
          const dist = distanceDeg(state.lat, state.lon, terminal.lat, terminal.lon);
          if (dist < (terminal.loadRadius || SIM_CONFIG.LOAD_RADIUS)) {
            cargo.loaded = true; cargo.terminal = terminal; cargo.terminalId = terminal.id;
            const label = shipCargoType === 'lng' ? 'LNG LOADED' : 'CARGO LOADED';
            addTransitEvent(label, `${ship.name}: Loaded ${shipCargoType.toUpperCase()} at ${terminal.name}.`, 'success');
            updateFleetPanel(); break;
          }
        }
      }

      // Dropoff delivery check
      if (cargo && cargo.loaded && !cargo.delivered) {
        const dropDist = distanceDeg(state.lat, state.lon, DROPOFF_POINT.lat, DROPOFF_POINT.lon);
        if (dropDist < DROPOFF_POINT.radius) {
          const oilPrice = gameState.oilPrice || 80;
          const bonus = cargo.terminal?.loadingBonus || 1.0;
          const revenue = Math.round(ship.capacity * oilPrice * bonus * (1 - state.totalDamage));
          socket.emit('deliver_cargo', { shipId: ship.id, revenue }, (res) => {
            if (res?.success) {
              addTransitEvent('CARGO DELIVERED', `${ship.name}: Delivered for ${formatMoney(revenue)}!`, 'success');
            }
          });
          // Reset cargo so ship can pick up another load
          shipCargo[ship.id] = { loaded: false, terminal: null, terminalId: null };
          addTransitEvent('CARGO DELIVERED', `${ship.name}: Arrived at ${DROPOFF_POINT.name}. Revenue: ${formatMoney(revenue)}`, 'success');
          updateFleetPanel();
        }
      }

      // Destruction check
      if (state.totalDamage >= 0.9 && !state.destroyed) {
        state.destroyed = true;
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
  });

  if (selectedState) drawCompass(compassCanvas, selectedState.heading);

  requestAnimationFrame(transitLoop);
}

// ============================================
// HUD UPDATE
// ============================================
function updateHUD() {
  const gameHours = Math.floor(simGameTime / 3600);
  const gameMinutes = Math.floor((simGameTime % 3600) / 60);
  document.getElementById('hud-time').textContent = `${String(gameHours).padStart(2,'0')}:${String(gameMinutes).padStart(2,'0')}`;

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
    else if (cargo?.loaded) { cargoEl.textContent = `LOADED - Head to ${DROPOFF_POINT.name}`; cargoEl.className = 'hud-cargo loading'; }
    else { cargoEl.textContent = 'NAVIGATE TO TERMINAL'; cargoEl.className = 'hud-cargo loading'; }
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

  const alliedCountries = ['US', 'UAE', 'Oman', 'Qatar', 'Bahrain', 'Kuwait'];
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
      let prob = zone.baseProbability * risk.eventFrequency * ais.detectionMultiplier * (2 - (state.health - state.totalDamage)) * defReduction;
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
        // Spawn missile animation for missile events
        if (eventId === 'missile_alert' || eventId === 'drone_swarm') {
          const iranBases = MILITARY_BASES.filter(b => b.country === 'Iran');
          const alliedCountries = ['US', 'UAE', 'Oman', 'Qatar', 'Bahrain', 'Kuwait'];
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
  const oilPrice = gameState?.oilPrice || 80;
  const ratePerBbl = (oilPrice * terminal.loadingBonus).toFixed(2);
  const priceLabel = isLng ? 'LNG Price' : 'Oil Price';
  const unit = isLng ? 'MMBtu' : 'bbl';
  document.getElementById('terminal-popup-name').textContent = terminal.name;
  document.getElementById('terminal-popup-body').innerHTML = `
    <div class="terminal-popup-row"><span>Type:</span><span>${isLng ? 'LNG' : 'Oil'}</span></div>
    <div class="terminal-popup-row"><span>Capacity:</span><span>${terminal.capacity}</span></div>
    <div class="terminal-popup-row"><span>${priceLabel}:</span><span class="${terminal.loadingBonus > 1 ? 'stat-good' : terminal.loadingBonus < 1 ? 'stat-bad' : 'stat-warn'}">$${ratePerBbl}/${unit} (${Math.round(terminal.loadingBonus * 100)}%)</span></div>
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

  // Check terminal click
  for (const terminal of Object.values(OIL_TERMINALS)) {
    const tPos = latLonToCanvas(terminal.lat, terminal.lon, rect.width, rect.height);
    if (Math.sqrt(Math.pow(cx - tPos.x, 2) + Math.pow(cy - tPos.y, 2)) < 20) {
      if (selectedShipId && shipStates[selectedShipId]) {
        // Ship selected → set waypoint to terminal
        addWaypointForSelectedShip({ lat: terminal.lat, lon: terminal.lon });
      } else {
        // No ship selected → show terminal info
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
