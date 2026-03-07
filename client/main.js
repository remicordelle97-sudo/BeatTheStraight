import { io } from 'socket.io-client';
import { drawMap, drawCompass, latLonToCanvas, canvasToLatLon, setViewport, getViewport, isOnLand, drawWaypoints } from './map.js';
import {
  SIM_CONFIG, DANGER_ZONES, EVENTS, RISK_LEVELS, MAP_BOUNDS,
  FUEL_COST_PER_UNIT, DEFAULT_VIEWPORT, OIL_TERMINALS,
  NPC_SHIP_TYPES, MILITARY_SHIPS
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
let lastCollisionCheck = 0;

// Multi-ship state
let shipStates = {};
let shipWaypoints = {};
let shipTrails = {};
let shipCargo = {};
let selectedShipId = null;

let npcShips = [];
let militaryShips = [];

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
    if (newLonRange < 0.5 || newLonRange > 30 || newLatRange < 0.3 || newLatRange > 20) return;
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

function clampViewport(vp) {
  const lonRange = vp.east - vp.west;
  const latRange = vp.north - vp.south;
  let west = Math.max(MAP_BOUNDS.west, Math.min(MAP_BOUNDS.east - lonRange, vp.west));
  let south = Math.max(MAP_BOUNDS.south, Math.min(MAP_BOUNDS.north - latRange, vp.south));
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
  state.speed = Math.min(ship?.speed || 16, state.speed + 1);
  document.getElementById('scp-speed-value').textContent = `${state.speed} kts`;
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
  lastCollisionCheck = 0;

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
    seized: false, destroyed: false
  };
  shipWaypoints[ship.id] = [];
  shipTrails[ship.id] = [];
  shipCargo[ship.id] = { loaded: false, terminal: null, terminalId: null };
}

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
    const cargoText = destroyed ? 'LOST' : cargo?.loaded ? 'LOADED' : 'EMPTY';
    const cargoClass = destroyed ? 'stat-bad' : cargo?.loaded ? 'stat-good' : 'stat-warn';
    return `
      <div class="option-card ${isSelected ? 'selected' : ''} ${destroyed ? 'destroyed' : ''}" data-ship-id="${s.id}">
        <div class="option-name">${s.name}</div>
        <div class="option-stats">
          <span class="stat">${(s.capacity / 1000).toFixed(0)}K</span>
          <span class="stat ${hp > 70 ? 'stat-good' : hp > 40 ? 'stat-warn' : 'stat-bad'}">HP:${hp}%</span>
          <span class="stat ${cargoClass}">${cargoText}</span>
        </div>
      </div>`;
  }).join('');

  container.querySelectorAll('.option-card').forEach(card => {
    card.addEventListener('click', () => selectShip(card.dataset.shipId));
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
  if (wps.length >= 10) return;
  wps.push(target);
  shipWaypoints[selectedShipId] = wps;
  updateClearWpButton();
  const state = shipStates[selectedShipId];
  if (state.speed === 0) { const ship = getSelectedShipData(); state.speed = ship?.speed || 14; }
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
        <span class="stat">${(opt.costPercent * 100).toFixed(0)}% premium</span>
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
  ENTERING: 'entering',
  HEADING_TO_TERMINAL: 'heading_to_terminal',
  LOADING: 'loading',
  DEPARTING: 'departing',
};

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
  const terminals = Object.values(OIL_TERMINALS);
  const terminal = terminals[Math.floor(Math.random() * terminals.length)];
  const spawn = randomWaterPos(24.5, 26.5, 59.5, 60.5);
  const heading = 250 + Math.random() * 30;
  const speed = type.speed + (Math.random() - 0.5) * 2;

  const npc = {
    lat: spawn.lat, lon: spawn.lon, heading, targetHeading: heading, speed, baseSpeed: speed,
    size: type.size, color: type.color, name: type.name,
    targetTerminal: terminal,
    state: staggered ? (['entering','heading_to_terminal','loading','departing'])[Math.floor(Math.random()*4)] : NPC_STATE.ENTERING,
    loadTimer: 0, wanderTimer: 5 + Math.random() * 10, wanderOffset: 0, stuckCount: 0,
  };

  if (staggered && npc.state === NPC_STATE.LOADING) {
    const lp = randomWaterPos(terminal.lat - 0.05, terminal.lat + 0.05, terminal.lon - 0.05, terminal.lon + 0.05);
    npc.lat = lp.lat; npc.lon = lp.lon;
    npc.speed = 0;
    npc.loadTimer = 10 + Math.random() * 20;
  } else if (staggered && npc.state === NPC_STATE.HEADING_TO_TERMINAL) {
    // Place between spawn area and terminal, in water
    const midLat = (spawn.lat + terminal.lat) / 2;
    const midLon = (spawn.lon + terminal.lon) / 2;
    const hp = randomWaterPos(midLat - 1, midLat + 1, midLon - 1, midLon + 1);
    npc.lat = hp.lat; npc.lon = hp.lon;
    npc.heading = headingToTarget(npc.lat, npc.lon, terminal.lat, terminal.lon);
    npc.targetHeading = npc.heading;
  } else if (staggered && npc.state === NPC_STATE.DEPARTING) {
    const dp = randomWaterPos(25.0, 27.0, terminal.lon, 58.5);
    npc.lat = dp.lat; npc.lon = dp.lon;
    npc.heading = headingToTarget(npc.lat, npc.lon, 25.3, 59.5);
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
    const edge = Math.floor(Math.random() * 4);
    let spLat, spLon, heading;
    if (edge === 0) { spLon = pb.east + 0.5; spLat = pb.south + Math.random() * (pb.north - pb.south); heading = 270; }
    else if (edge === 1) { spLon = pb.west - 0.5; spLat = pb.south + Math.random() * (pb.north - pb.south); heading = 90; }
    else if (edge === 2) { spLon = pb.west + Math.random() * (pb.east - pb.west); spLat = pb.south - 0.5; heading = 0; }
    else { spLon = pb.west + Math.random() * (pb.east - pb.west); spLat = pb.north + 0.5; heading = 180; }
    militaryShips.push({
      lat: spLat, lon: spLon, heading, speed: type.speed * (0.5 + Math.random() * 0.3),
      size: type.size, color: type.color, name: type.name, country: type.country,
      dangerRadius: type.dangerRadius, friendlyFireChance: type.friendlyFireChance,
      patrolBounds: pb, targetHeading: heading, patrolTimer: 5 + Math.random() * 10, entered: false
    });
  }
}

function headingToTarget(fromLat, fromLon, toLat, toLon) {
  return normalizeAngle(Math.atan2(toLon - fromLon, toLat - fromLat) * 180 / Math.PI);
}

function distanceDeg(lat1, lon1, lat2, lon2) {
  return Math.sqrt(Math.pow(lat1 - lat2, 2) + Math.pow(lon1 - lon2, 2));
}

function updateNPCShips(dt) {
  for (let i = 0; i < npcShips.length; i++) {
    const npc = npcShips[i];
    if (npc.state === NPC_STATE.LOADING) {
      npc.loadTimer -= dt; npc.speed = 0;
      if (npc.loadTimer <= 0) {
        npc.state = NPC_STATE.DEPARTING; npc.speed = npc.baseSpeed || 13;
        npc.targetHeading = headingToTarget(npc.lat, npc.lon, 25.5, 58.5);
      }
      continue;
    }
    if (npc.state === NPC_STATE.ENTERING || npc.state === NPC_STATE.HEADING_TO_TERMINAL) {
      const t = npc.targetTerminal;
      if (distanceDeg(npc.lat, npc.lon, t.lat, t.lon) < (t.loadRadius || 0.15)) {
        npc.state = NPC_STATE.LOADING; npc.loadTimer = 15 + Math.random() * 20; npc.speed = 0; continue;
      }
      npc.targetHeading = headingToTarget(npc.lat, npc.lon, t.lat, t.lon);
      if (npc.state === NPC_STATE.ENTERING && npc.lon < 57.0) npc.state = NPC_STATE.HEADING_TO_TERMINAL;
    } else if (npc.state === NPC_STATE.DEPARTING) {
      npc.targetHeading = headingToTarget(npc.lat, npc.lon, 25.3, 59.5);
    }

    npc.wanderTimer -= dt;
    if (npc.wanderTimer <= 0) { npc.wanderOffset = (Math.random() - 0.5) * 8; npc.wanderTimer = 5 + Math.random() * 10; }
    const adjustedTarget = normalizeAngle(npc.targetHeading + (npc.wanderOffset || 0));
    const diff = angleDiff(npc.heading, adjustedTarget);
    if (Math.abs(diff) > 0.5) npc.heading = normalizeAngle(npc.heading + Math.sign(diff) * Math.min(Math.abs(diff), 1.5 * dt * 60));

    const speedDeg = npc.speed * SIM_CONFIG.KNOTS_TO_DEG_PER_SEC;
    const rad = npc.heading * Math.PI / 180;
    const newLon = npc.lon + Math.sin(rad) * speedDeg * dt;
    const newLat = npc.lat + Math.cos(rad) * speedDeg * dt;

    const lookAhead = speedDeg * 3;
    const aheadLon = npc.lon + Math.sin(rad) * lookAhead;
    const aheadLat = npc.lat + Math.cos(rad) * lookAhead;

    if (!isOnLand(newLat, newLon)) {
      npc.lon = newLon; npc.lat = newLat; npc.stuckCount = 0;
      if (isOnLand(aheadLat, aheadLon)) {
        for (const angle of [45, -45, 90, -90]) {
          const tryRad = normalizeAngle(npc.heading + angle) * Math.PI / 180;
          if (!isOnLand(npc.lat + Math.cos(tryRad) * lookAhead, npc.lon + Math.sin(tryRad) * lookAhead)) {
            npc.targetHeading = normalizeAngle(npc.heading + angle); npc.wanderOffset = 0; break;
          }
        }
      }
    } else {
      npc.stuckCount = (npc.stuckCount || 0) + 1;
      let escaped = false;
      for (const angle of [90, -90, 120, -120, 150, -150, 180]) {
        const th = normalizeAngle(npc.heading + angle);
        const tr = th * Math.PI / 180;
        const tLon = npc.lon + Math.sin(tr) * speedDeg * dt * 2;
        const tLat = npc.lat + Math.cos(tr) * speedDeg * dt * 2;
        if (!isOnLand(tLat, tLon)) {
          npc.heading = th; npc.targetHeading = th; npc.wanderOffset = 0;
          npc.lon += Math.sin(tr) * speedDeg * dt; npc.lat += Math.cos(tr) * speedDeg * dt;
          escaped = true; break;
        }
      }
      if (!escaped) { npc.heading = normalizeAngle(npc.heading + 180); npc.targetHeading = npc.heading; }
      if (npc.stuckCount > 60) { npcShips[i] = createNPCTanker(false); continue; }
    }
    if (npc.lon > 60.5 || npc.lon < 46.5 || npc.lat > 31.0 || npc.lat < 23.0) npcShips[i] = createNPCTanker(false);
  }
}

function updateMilitaryShips(dt) {
  for (const mil of militaryShips) {
    const pb = mil.patrolBounds;
    if (!mil.entered && mil.lat >= pb.south && mil.lat <= pb.north && mil.lon >= pb.west && mil.lon <= pb.east) mil.entered = true;
    if (mil.entered) {
      mil.patrolTimer -= dt;
      if (mil.patrolTimer <= 0) {
        mil.targetHeading = headingToTarget(mil.lat, mil.lon,
          pb.south + Math.random() * (pb.north - pb.south),
          pb.west + Math.random() * (pb.east - pb.west));
        mil.patrolTimer = 10 + Math.random() * 20;
      }
    }
    const diff = angleDiff(mil.heading, mil.targetHeading);
    if (Math.abs(diff) > 0.5) mil.heading = normalizeAngle(mil.heading + Math.sign(diff) * Math.min(Math.abs(diff), 2.0 * dt * 60));

    const speedDeg = mil.speed * SIM_CONFIG.KNOTS_TO_DEG_PER_SEC;
    const rad = mil.heading * Math.PI / 180;
    const newLon = mil.lon + Math.sin(rad) * speedDeg * dt;
    const newLat = mil.lat + Math.cos(rad) * speedDeg * dt;
    if (!isOnLand(newLat, newLon)) { mil.lon = newLon; mil.lat = newLat; }
    else { mil.targetHeading = normalizeAngle(mil.heading + 90 + Math.random() * 90); }

    if (mil.entered && (mil.lat < pb.south - 0.5 || mil.lat > pb.north + 0.5 || mil.lon < pb.west - 0.5 || mil.lon > pb.east + 0.5)) {
      mil.targetHeading = headingToTarget(mil.lat, mil.lon, (pb.south + pb.north) / 2, (pb.west + pb.east) / 2);
    }
  }
}

// ============================================
// COLLISION DETECTION
// ============================================
function checkCollisions(elapsed) {
  if (elapsed - lastCollisionCheck < 2) return;
  lastCollisionCheck = elapsed;
  const me = gameState?.players.find(p => p.id === myId);
  if (!me) return;
  for (const ship of me.fleet) {
    const state = shipStates[ship.id];
    if (!state || state.destroyed || state.seized) continue;
    for (const npc of npcShips) {
      const dist = distanceDeg(state.lat, state.lon, npc.lat, npc.lon);
      if (dist < SIM_CONFIG.COLLISION_RADIUS) {
        if (dist < SIM_CONFIG.COLLISION_RADIUS * 0.5) {
          state.totalDamage += 0.15;
          addTransitEvent('COLLISION', `${ship.name}: Major collision with ${npc.name}!`, 'danger');
        } else {
          state.totalDamage += 0.03;
          addTransitEvent('NEAR MISS', `${ship.name}: Glancing blow with ${npc.name}.`, 'danger');
        }
        updateFleetPanel();
      }
    }
    for (const mil of militaryShips) {
      const dist = distanceDeg(state.lat, state.lon, mil.lat, mil.lon);
      if (dist < mil.dangerRadius && Math.random() < mil.friendlyFireChance) {
        state.totalDamage += 0.05; state.totalMoneyLoss += 0.02;
        addTransitEvent('MILITARY INCIDENT', `${ship.name}: Incident near ${mil.name}.`, 'danger');
        updateFleetPanel();
      }
    }
  }
}

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
      const wps = shipWaypoints[ship.id] || [];

      // Waypoint navigation
      if (wps.length > 0) {
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
      else { state.speed = Math.max(0, state.speed * 0.5); shipWaypoints[ship.id] = []; if (ship.id === selectedShipId) updateClearWpButton(); }

      state.lat = Math.max(MAP_BOUNDS.south + 0.05, Math.min(MAP_BOUNDS.north - 0.05, state.lat));
      state.lon = Math.max(MAP_BOUNDS.west + 0.05, Math.min(MAP_BOUNDS.east - 0.05, state.lon));

      // Trail - expire points older than 60 seconds
      const trail = shipTrails[ship.id];
      if (trail) {
        if (trail.length === 0 || elapsed - trail[trail.length - 1].t > 0.5) {
          trail.push({ lat: state.lat, lon: state.lon, t: elapsed });
        }
        while (trail.length > 0 && elapsed - trail[0].t > 3) trail.shift();
      }

      // Terminal cargo loading
      const cargo = shipCargo[ship.id];
      if (cargo && !cargo.loaded) {
        for (const terminal of Object.values(OIL_TERMINALS)) {
          const dist = distanceDeg(state.lat, state.lon, terminal.lat, terminal.lon);
          if (dist < (terminal.loadRadius || SIM_CONFIG.LOAD_RADIUS)) {
            cargo.loaded = true; cargo.terminal = terminal; cargo.terminalId = terminal.id;
            addTransitEvent('CARGO LOADED', `${ship.name}: Loaded at ${terminal.name}.`, 'success');
            updateFleetPanel(); break;
          }
        }
      }

      // Destruction check
      if (state.totalDamage >= 0.9 && !state.destroyed) {
        state.destroyed = true;
        addTransitEvent('VESSEL DESTROYED', `${ship.name} has been destroyed!`, 'danger');
        updateFleetPanel();
      }
    }
  }

  updateNPCShips(dt);
  updateMilitaryShips(dt);
  checkCollisions(elapsed);

  if (elapsed - lastEventCheck > SIM_CONFIG.EVENT_CHECK_INTERVAL / 1000) {
    lastEventCheck = elapsed;
    checkDangerZonesAllShips(elapsed);
  }

  updateHUD();

  // Render
  const selectedState = selectedShipId ? shipStates[selectedShipId] : null;
  const selectedTrail = selectedShipId ? (shipTrails[selectedShipId] || []) : [];
  const selectedWps = selectedShipId ? (shipWaypoints[selectedShipId] || []) : [];

  const playerShips = [];
  if (me) {
    for (const ship of me.fleet) {
      const st = shipStates[ship.id];
      if (st && !st.destroyed && !st.seized) {
        playerShips.push({ lat: st.lat, lon: st.lon, heading: st.heading, isSelected: ship.id === selectedShipId });
      }
    }
  }

  drawMap(mapCanvas, {
    showZones: false, showFinish: false, showTerminals: true, showSpawn: false,
    selectedTerminalId: null,
    ship: selectedState, trail: selectedTrail,
    targetPoint: selectedWps.length > 0 ? selectedWps[0] : null,
    waypoints: selectedWps,
    npcShips, militaryShips, showMinimap: true, playerShips,
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
    document.getElementById('hud-speed').textContent = `${state.speed} kts`;
    document.getElementById('hud-heading').innerHTML = `${Math.round(state.heading)}&deg;`;
    const hp = state.health - state.totalDamage;
    document.getElementById('hud-health').textContent = `${Math.round(hp * 100)}%`;
    document.getElementById('hud-health').style.color = hp > 0.7 ? '#40c070' : hp > 0.4 ? '#f0a030' : '#e04040';
    document.getElementById('hud-ship-name').textContent = ship.name;
    const cargo = shipCargo[selectedShipId];
    const cargoEl = document.getElementById('hud-cargo-status');
    if (cargo?.loaded) { cargoEl.textContent = `LOADED - ${cargo.terminal?.name || ''}`; cargoEl.className = 'hud-cargo loaded'; }
    else { cargoEl.textContent = 'NAVIGATE TO TERMINAL'; cargoEl.className = 'hud-cargo loading'; }
    document.getElementById('hud-progress').textContent = cargo?.loaded ? 'LOADED' : 'EMPTY';
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

      let prob = zone.baseProbability * risk.eventFrequency * ais.detectionMultiplier * (2 - (state.health - state.totalDamage));
      if (Math.random() < prob) {
        const eventId = zone.events[Math.floor(Math.random() * zone.events.length)];
        const evt = EVENTS.find(e => e.id === eventId);
        if (!evt) continue;
        const roll = Math.random();
        let oi = 0, cw = 0;
        for (let w = 0; w < 3; w++) { cw += [0.5, 0.25, 0.25][w]; if (roll < cw) { oi = w; break; } }
        const outcome = evt.outcomes[oi];
        zoneCooldowns[cooldownKey] = elapsed;
        state.totalDamage += outcome.damagePercent;
        state.totalDelay += Math.max(0, outcome.delayHours);
        state.totalMoneyLoss += outcome.moneyLoss;
        if (outcome.delayHours >= 720) state.seized = true;
        if (outcome.damagePercent > 0.1) state.speed = Math.max(5, ship.speed * (1 - state.totalDamage * 0.5));
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
  div.innerHTML = `<div class="event-name">${name}</div><div class="event-outcome">${text}</div>`;
  container.appendChild(div);
  container.scrollTop = container.scrollHeight;
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
  const oilPrice = gameState?.oilPrice || 80;
  const ratePerBbl = (oilPrice * terminal.loadingBonus).toFixed(2);
  document.getElementById('terminal-popup-name').textContent = terminal.name;
  document.getElementById('terminal-popup-body').innerHTML = `
    <div class="terminal-popup-row"><span>Country:</span><span>${terminal.country}</span></div>
    <div class="terminal-popup-row"><span>Capacity:</span><span>${terminal.capacity}</span></div>
    <div class="terminal-popup-row"><span>Oil Price:</span><span class="${terminal.loadingBonus > 1 ? 'stat-good' : terminal.loadingBonus < 1 ? 'stat-bad' : 'stat-warn'}">$${ratePerBbl}/bbl (${Math.round(terminal.loadingBonus * 100)}%)</span></div>
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
