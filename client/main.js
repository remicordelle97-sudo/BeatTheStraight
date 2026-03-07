import { io } from 'socket.io-client';
import { drawMap, drawCompass, latLonToCanvas, canvasToLatLon, setViewport, getViewport, isOnLand, drawWaypoints } from './map.js';
import {
  SIM_CONFIG, DANGER_ZONES, EVENTS, RISK_LEVELS, MAP_BOUNDS,
  FUEL_COST_PER_UNIT, DEFAULT_VIEWPORT, OIL_TERMINALS,
  NPC_SHIP_TYPES, MILITARY_SHIPS
} from '../shared/constants.js';

// Connect to server
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

// Planning selections
let selectedShipId = null;
let selectedTerminalId = null;

// Ship purchase modal state
let modalShipTypeId = null;
let modalAisId = null;
let modalInsuranceId = null;

// Game speed state
let gameSpeedMultiplier = 1; // 1x, 2x, 4x
const SPEED_OPTIONS = [1, 2, 4];

// Transit simulation state
let transitActive = false;
let simState = null;
let simTrail = [];
let simEvents = [];
let simStartTime = 0;
let simGameTime = 0;
let simTargetPoint = null;
let simWaypoints = [];
let zoneCooldowns = {};
let lastEventCheck = 0;
let transitPlan = null;
let cargoLoaded = false;

// NPC and military ship state
let npcShips = [];
let militaryShips = [];
let lastCollisionCheck = 0;

// Pan/zoom state
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
  planning: document.getElementById('screen-planning'),
  transit: document.getElementById('screen-transit'),
  results: document.getElementById('screen-results'),
  gameover: document.getElementById('screen-gameover')
};

function showScreen(name) {
  Object.values(screens).forEach(s => s.classList.remove('active'));
  screens[name].classList.add('active');
}

function formatMoney(n) {
  if (Math.abs(n) >= 1e9) return '$' + (n / 1e9).toFixed(1) + 'B';
  if (Math.abs(n) >= 1e6) return '$' + (n / 1e6).toFixed(1) + 'M';
  if (Math.abs(n) >= 1e3) return '$' + (n / 1e3).toFixed(0) + 'K';
  return '$' + n.toFixed(0);
}

function showError(msg) {
  const el = document.getElementById('error-msg');
  el.textContent = msg;
  el.classList.remove('hidden');
  setTimeout(() => el.classList.add('hidden'), 3000);
}

function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

// ============================================
// PAN / ZOOM CONTROLS
// ============================================
function initPanZoom() {
  mapCanvas.addEventListener('wheel', (e) => {
    if (!transitActive && !screens.planning.classList.contains('active')) return;
    e.preventDefault();
    const zoomFactor = e.deltaY > 0 ? 1.15 : 0.87;
    const vp = getViewport();
    const rect = mapCanvas.getBoundingClientRect();
    const mouseX = (e.clientX - rect.left) / rect.width;
    const mouseY = (e.clientY - rect.top) / rect.height;

    const lonRange = vp.east - vp.west;
    const latRange = vp.north - vp.south;
    const newLonRange = Math.min(MAP_BOUNDS.east - MAP_BOUNDS.west, Math.max(2, lonRange * zoomFactor));
    const newLatRange = Math.min(MAP_BOUNDS.north - MAP_BOUNDS.south, Math.max(1.5, latRange * zoomFactor));

    const mouseLon = vp.west + mouseX * lonRange;
    const mouseLat = vp.north - mouseY * latRange;

    const newWest = mouseLon - mouseX * newLonRange;
    const newNorth = mouseLat + mouseY * newLatRange;

    viewport = clampViewport({
      west: newWest,
      east: newWest + newLonRange,
      north: newNorth,
      south: newNorth - newLatRange
    });
    setViewport(viewport);
  }, { passive: false });

  mapCanvas.addEventListener('mousedown', (e) => {
    if (e.button === 2 || e.button === 1) { // right or middle click
      isPanning = true;
      panStart = { x: e.clientX, y: e.clientY };
      panViewportStart = { ...getViewport() };
      e.preventDefault();
    }
  });

  window.addEventListener('mousemove', (e) => {
    if (!isPanning) return;
    const rect = mapCanvas.getBoundingClientRect();
    const vp = panViewportStart;
    const lonRange = vp.east - vp.west;
    const latRange = vp.north - vp.south;

    const dx = (e.clientX - panStart.x) / rect.width * lonRange;
    const dy = (e.clientY - panStart.y) / rect.height * latRange;

    viewport = clampViewport({
      west: vp.west - dx,
      east: vp.east - dx,
      north: vp.north + dy,
      south: vp.south + dy
    });
    setViewport(viewport);
  });

  window.addEventListener('mouseup', (e) => {
    if (e.button === 2 || e.button === 1) {
      isPanning = false;
    }
  });

  mapCanvas.addEventListener('contextmenu', (e) => e.preventDefault());
}

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
    west: lon - lonRange / 2,
    east: lon + lonRange / 2,
    north: lat + latRange / 2,
    south: lat - latRange / 2
  });
  setViewport(viewport);
}

initPanZoom();

// ============================================
// GAME SPEED TOGGLE
// ============================================
document.querySelectorAll('.speed-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    const speed = parseInt(btn.dataset.speed);
    gameSpeedMultiplier = speed;
    document.querySelectorAll('.speed-btn').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
  });
});

// ============================================
// CLEAR WAYPOINTS BUTTON
// ============================================
const clearWpBtn = document.getElementById('btn-clear-waypoints');
clearWpBtn.addEventListener('click', () => {
  simWaypoints = [];
  simTargetPoint = null;
  simState.speed = 0;
  updateClearWpButton();
});

function updateClearWpButton() {
  if (simWaypoints.length > 0) {
    clearWpBtn.classList.remove('hidden');
  } else {
    clearWpBtn.classList.add('hidden');
  }
}

// ============================================
// SHIP CONTROL PANEL
// ============================================
let shipControlOpen = false;

function openShipControlPanel() {
  const panel = document.getElementById('ship-control-panel');
  panel.classList.remove('hidden');
  shipControlOpen = true;

  // Update speed display
  document.getElementById('scp-speed-value').textContent = `${simState.speed} kts`;

  // Update AIS button states
  const currentAisId = transitPlan.ais.id;
  document.querySelectorAll('.scp-ais-btn').forEach(btn => {
    const aisKey = btn.dataset.ais;
    const aisOpt = options.aisOptions[aisKey];
    btn.classList.toggle('active', aisOpt && aisOpt.id === currentAisId);
  });
}

function closeShipControlPanel() {
  document.getElementById('ship-control-panel').classList.add('hidden');
  shipControlOpen = false;
}

document.getElementById('scp-close').addEventListener('click', closeShipControlPanel);

document.getElementById('scp-speed-down').addEventListener('click', () => {
  if (!simState) return;
  simState.speed = Math.max(3, simState.speed - 1);
  document.getElementById('scp-speed-value').textContent = `${simState.speed} kts`;
});

document.getElementById('scp-speed-up').addEventListener('click', () => {
  if (!simState || !transitPlan) return;
  simState.speed = Math.min(transitPlan.ship.speed, simState.speed + 1);
  document.getElementById('scp-speed-value').textContent = `${simState.speed} kts`;
});

document.querySelectorAll('.scp-ais-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    if (!transitPlan || !options) return;
    const aisKey = btn.dataset.ais;
    const aisOpt = options.aisOptions[aisKey];
    if (aisOpt) {
      transitPlan.ais = aisOpt;
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

  if (!socket.connected) {
    showError('Not connected to server. Is the server running?');
    return;
  }

  if (joinMode) {
    const code = document.getElementById('input-game-id').value.trim().toUpperCase();
    if (!code) { showError('Enter a game code'); return; }
    socket.emit('join_game', { gameId: code, playerName: name }, (res) => {
      if (res.success) {
        myId = socket.id;
        gameState = res.game;
        isHost = false;
        fetchOptions();
        renderLobby();
        showScreen('lobby');
      } else {
        showError(res.error || 'Failed to join');
      }
    });
  } else {
    socket.emit('create_game', { playerName: name }, (res) => {
      if (res.success) {
        myId = socket.id;
        gameState = res.game;
        isHost = true;
        fetchOptions();
        renderLobby();
        showScreen('lobby');
      } else {
        showError('Failed to create game');
      }
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
  if (isHost) {
    btnStart.classList.remove('hidden');
    waiting.classList.add('hidden');
  } else {
    btnStart.classList.add('hidden');
    waiting.classList.remove('hidden');
  }
}

document.getElementById('btn-start').addEventListener('click', () => {
  socket.emit('start_game', null, (res) => {
    if (!res.success) showError(res.error);
  });
});

// ============================================
// PLANNING
// ============================================
function renderPlanning() {
  if (!gameState || !options) return;

  const riskBadge = document.getElementById('plan-risk');
  riskBadge.textContent = gameState.riskInfo.name.toUpperCase();
  riskBadge.className = `risk-badge risk-${gameState.riskLevel}`;
  document.getElementById('plan-oil-price').textContent = gameState.oilPrice.toFixed(2);

  const me = gameState.players.find(p => p.id === myId);
  document.getElementById('plan-cash').textContent = formatMoney(me?.cash || 0);

  selectedShipId = null;
  selectedTerminalId = null;

  // Terminal selector
  const terminalSelector = document.getElementById('terminal-selector');
  terminalSelector.innerHTML = Object.entries(OIL_TERMINALS).map(([key, t]) => `
    <div class="option-card" data-key="${t.id}">
      <div class="option-name">${t.name}</div>
      <div class="option-desc">${t.country} - ${t.description}</div>
      <div class="option-stats">
        <span class="stat ${t.loadingBonus > 1 ? 'stat-good' : t.loadingBonus < 1 ? 'stat-bad' : 'stat-warn'}">
          Value: ${Math.round(t.loadingBonus * 100)}%
        </span>
        <span class="stat">${t.capacity}</span>
      </div>
    </div>
  `).join('');

  terminalSelector.querySelectorAll('.option-card').forEach(card => {
    card.addEventListener('click', () => {
      terminalSelector.querySelectorAll('.option-card').forEach(c => c.classList.remove('selected'));
      card.classList.add('selected');
      selectedTerminalId = card.dataset.key;
      const terminal = Object.values(OIL_TERMINALS).find(t => t.id === selectedTerminalId);
      if (terminal) centerViewportOn(terminal.lat, terminal.lon);
    });
  });

  // Ship selector - shows fleet with AIS/insurance info
  const shipSelector = document.getElementById('ship-selector');
  if (me && me.fleet.length > 0) {
    shipSelector.innerHTML = me.fleet.map(s => `
      <div class="option-card" data-ship-id="${s.id}">
        <div class="option-name">${s.name}</div>
        <div class="option-stats">
          <span class="stat">${(s.capacity / 1000).toFixed(0)}K DWT</span>
          <span class="stat">${s.speed} kts</span>
          <span class="stat ${s.health > 0.7 ? 'stat-good' : s.health > 0.4 ? 'stat-warn' : 'stat-bad'}">
            HP: ${Math.round(s.health * 100)}%
          </span>
        </div>
        <div class="option-desc">${s.aisName || 'Full AIS'} | ${s.insuranceName || 'No Insurance'}</div>
      </div>
    `).join('');

    shipSelector.querySelectorAll('.option-card').forEach(card => {
      card.addEventListener('click', () => {
        shipSelector.querySelectorAll('.option-card').forEach(c => c.classList.remove('selected'));
        card.classList.add('selected');
        selectedShipId = card.dataset.shipId;
      });
    });

    if (me.fleet.length === 1) {
      selectedShipId = me.fleet[0].id;
      shipSelector.querySelector('.option-card')?.classList.add('selected');
    }
  } else {
    shipSelector.innerHTML = '<div class="muted">No ships! Buy one to get started.</div>';
  }

  document.getElementById('btn-submit-plan').classList.remove('hidden');
  document.getElementById('plan-waiting').classList.add('hidden');

  // Buy ship button opens modal
  document.getElementById('btn-buy-ship').onclick = () => openShipPurchaseModal();

  // Section toggle (collapse/expand)
  document.querySelectorAll('.dash-section-title[data-toggle]').forEach(title => {
    title.onclick = () => {
      const body = title.nextElementSibling;
      if (body) {
        body.classList.toggle('collapsed');
        const icon = title.querySelector('.dash-toggle-icon');
        if (icon) {
          icon.innerHTML = body.classList.contains('collapsed') ? '&#9654;' : '&#9660;';
        }
      }
    };
  });

  // Show map with terminals during planning (zoom out to show gulf + spawn area)
  viewport = { north: 30.0, south: 23.0, west: 47.5, east: 60.0 };
  setViewport(viewport);
}

// ============================================
// SHIP PURCHASE MODAL
// ============================================
function openShipPurchaseModal() {
  if (!options) return;
  const modal = document.getElementById('ship-purchase-modal');
  modal.classList.remove('hidden');

  modalShipTypeId = null;
  modalAisId = null;
  modalInsuranceId = null;

  // Reset to step 1
  document.getElementById('modal-step-ship').classList.remove('hidden');
  document.getElementById('modal-step-config').classList.add('hidden');

  const me = gameState.players.find(p => p.id === myId);

  // Render ship type list
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
    </div>
  `).join('');

  shipList.querySelectorAll('.option-card').forEach(card => {
    card.addEventListener('click', () => {
      const key = card.dataset.typeKey;
      const shipType = options.shipTypes[key];
      const meCash = me?.cash || 0;
      if (meCash < shipType.cost) {
        showError('Cannot afford this ship');
        return;
      }
      modalShipTypeId = key;
      showModalConfigStep(shipType);
    });
  });
}

function showModalConfigStep(shipType) {
  document.getElementById('modal-step-ship').classList.add('hidden');
  document.getElementById('modal-step-config').classList.remove('hidden');
  document.getElementById('modal-ship-name').textContent = shipType.name;

  modalAisId = null;
  modalInsuranceId = null;

  // Render AIS options
  const aisList = document.getElementById('modal-ais-list');
  aisList.innerHTML = Object.entries(options.aisOptions).map(([key, opt]) => {
    const detClass = opt.detectionMultiplier <= 0.5 ? 'stat-good' : opt.detectionMultiplier >= 1.2 ? 'stat-bad' : 'stat-warn';
    return `
      <div class="option-card" data-ais-key="${key}">
        <div class="option-name">${opt.name}</div>
        <div class="option-desc">${opt.description}</div>
        <div class="option-stats">
          <span class="stat ${detClass}">Detection: ${opt.detectionMultiplier}x</span>
          ${opt.legalPenalty > 0 ? `<span class="stat stat-bad">Fine: ${formatMoney(opt.legalPenalty)}</span>` : ''}
        </div>
      </div>
    `;
  }).join('');

  aisList.querySelectorAll('.option-card').forEach(card => {
    card.addEventListener('click', () => {
      aisList.querySelectorAll('.option-card').forEach(c => c.classList.remove('selected'));
      card.classList.add('selected');
      modalAisId = card.dataset.aisKey;
    });
  });

  // Render insurance options
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
    </div>
  `).join('');

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
    showError('Select AIS and insurance before confirming');
    return;
  }

  socket.emit('buy_ship', {
    shipTypeId: modalShipTypeId,
    aisId: modalAisId,
    insuranceId: modalInsuranceId
  }, (res) => {
    if (res.success) {
      closeShipPurchaseModal();
      setTimeout(() => renderPlanning(), 100);
    } else {
      showError(res.error || 'Cannot buy ship');
    }
  });
});

// Submit plan and start transit
document.getElementById('btn-submit-plan').addEventListener('click', () => {
  if (!selectedShipId || !selectedTerminalId) {
    showError('Select a ship and terminal before launching');
    return;
  }

  const me = gameState.players.find(p => p.id === myId);
  const ship = me.fleet.find(s => s.id === selectedShipId);
  if (!ship) { showError('Ship not found'); return; }

  // Use ship's stored AIS/insurance
  const aisId = ship.aisId || 'FULL_BROADCAST';
  const insuranceId = ship.insuranceId || 'NONE';
  const ais = options.aisOptions[aisId];
  const insurance = options.insuranceOptions[insuranceId];
  const time = { id: 'day', name: 'Daytime', visibilityMultiplier: 1.0 };
  const terminal = Object.values(OIL_TERMINALS).find(t => t.id === selectedTerminalId);

  transitPlan = { ship, ais, insurance, time, terminal };

  socket.emit('submit_plan', {
    shipId: selectedShipId,
    routeId: 'PLAYER_NAVIGATED',
    aisId: aisId,
    insuranceId: insuranceId,
    terminalId: selectedTerminalId
  }, (res) => {
    if (res.success) {
      startTransit();
    } else {
      showError(res.error || 'Failed to submit plan');
    }
  });
});

// ============================================
// NPC & MILITARY SHIP SPAWNING
// ============================================
// NPC tanker states
const NPC_STATE = {
  ENTERING: 'entering',        // Sailing in from off-screen
  HEADING_TO_TERMINAL: 'heading_to_terminal',
  LOADING: 'loading',          // Docked at terminal
  DEPARTING: 'departing',      // Heading out through strait
};

function createNPCTanker(staggered) {
  const type = NPC_SHIP_TYPES[Math.floor(Math.random() * NPC_SHIP_TYPES.length)];
  const terminals = Object.values(OIL_TERMINALS);
  const terminal = terminals[Math.floor(Math.random() * terminals.length)];

  // Spawn from east edge (Gulf of Oman) - off-screen
  const lon = 59.5 + Math.random() * 1.0;
  const lat = 24.5 + Math.random() * 2.0;
  // Head west toward the strait/gulf
  const heading = 250 + Math.random() * 30;

  const speed = type.speed + (Math.random() - 0.5) * 2;
  return {
    lat, lon, heading,
    speed,
    baseSpeed: speed,
    size: type.size,
    color: type.color,
    name: type.name + ' ' + Math.floor(Math.random() * 900 + 100),
    targetHeading: heading,
    wanderTimer: Math.random() * 10,
    wanderOffset: 0,
    state: NPC_STATE.ENTERING,
    targetTerminal: terminal,
    loadTimer: 0,
    stuckCount: 0
  };
}

function spawnNPCShips() {
  npcShips = [];
  const count = SIM_CONFIG.NPC_COUNT;
  for (let i = 0; i < count; i++) {
    const npc = createNPCTanker(true);
    // Stagger initial positions: some already in transit at various stages
    if (i < count / 3) {
      // Some already heading to terminal (mid-strait)
      let lon, lat;
      do {
        lon = 54.0 + Math.random() * 3.0;
        lat = 25.5 + Math.random() * 2.0;
      } while (isOnLand(lat, lon));
      npc.lat = lat;
      npc.lon = lon;
      npc.state = NPC_STATE.HEADING_TO_TERMINAL;
    } else if (i < (count * 2) / 3) {
      // Some already departing (heading east through strait)
      let lon, lat;
      do {
        lon = 55.0 + Math.random() * 2.5;
        lat = 25.5 + Math.random() * 1.5;
      } while (isOnLand(lat, lon));
      npc.lat = lat;
      npc.lon = lon;
      npc.state = NPC_STATE.DEPARTING;
      npc.heading = 80 + Math.random() * 20;
      npc.targetHeading = 90;
    }
    npcShips.push(npc);
  }
}

function spawnMilitaryShips() {
  militaryShips = [];
  const types = Object.values(MILITARY_SHIPS);
  for (const type of types) {
    const pb = type.patrolBounds;
    // Spawn from edge of patrol bounds (entering from off-screen direction)
    const edge = Math.floor(Math.random() * 4);
    let spLat, spLon, heading;
    if (edge === 0) { // from east
      spLon = pb.east + 0.5;
      spLat = pb.south + Math.random() * (pb.north - pb.south);
      heading = 270;
    } else if (edge === 1) { // from west
      spLon = pb.west - 0.5;
      spLat = pb.south + Math.random() * (pb.north - pb.south);
      heading = 90;
    } else if (edge === 2) { // from south
      spLon = pb.west + Math.random() * (pb.east - pb.west);
      spLat = pb.south - 0.5;
      heading = 0;
    } else { // from north
      spLon = pb.west + Math.random() * (pb.east - pb.west);
      spLat = pb.north + 0.5;
      heading = 180;
    }
    militaryShips.push({
      lat: spLat,
      lon: spLon,
      heading,
      speed: type.speed * (0.5 + Math.random() * 0.3),
      size: type.size,
      color: type.color,
      name: type.name,
      country: type.country,
      dangerRadius: type.dangerRadius,
      friendlyFireChance: type.friendlyFireChance,
      patrolBounds: pb,
      targetHeading: heading,
      patrolTimer: 5 + Math.random() * 10,
      entered: false // hasn't reached patrol zone yet
    });
  }
}

function headingToTarget(fromLat, fromLon, toLat, toLon) {
  const dLon = toLon - fromLon;
  const dLat = toLat - fromLat;
  return normalizeAngle(Math.atan2(dLon, dLat) * 180 / Math.PI);
}

function distanceDeg(lat1, lon1, lat2, lon2) {
  return Math.sqrt(Math.pow(lat1 - lat2, 2) + Math.pow(lon1 - lon2, 2));
}

function updateNPCShips(dt) {
  for (let i = 0; i < npcShips.length; i++) {
    const npc = npcShips[i];

    // State machine for NPC tanker behavior
    if (npc.state === NPC_STATE.LOADING) {
      npc.loadTimer -= dt;
      npc.speed = 0;
      if (npc.loadTimer <= 0) {
        // Done loading, depart eastward
        npc.state = NPC_STATE.DEPARTING;
        npc.speed = npc.baseSpeed || 13;
        npc.targetHeading = headingToTarget(npc.lat, npc.lon, 25.5, 58.5);
      }
      continue;
    }

    // Calculate target heading based on state
    if (npc.state === NPC_STATE.ENTERING || npc.state === NPC_STATE.HEADING_TO_TERMINAL) {
      const t = npc.targetTerminal;
      const dist = distanceDeg(npc.lat, npc.lon, t.lat, t.lon);
      if (dist < (t.loadRadius || 0.15)) {
        // Arrived at terminal
        npc.state = NPC_STATE.LOADING;
        npc.loadTimer = 15 + Math.random() * 20; // 15-35 seconds loading
        npc.speed = 0;
        continue;
      }
      // Steer toward terminal
      npc.targetHeading = headingToTarget(npc.lat, npc.lon, t.lat, t.lon);
      // Once past the strait entrance, switch to heading_to_terminal
      if (npc.state === NPC_STATE.ENTERING && npc.lon < 57.0) {
        npc.state = NPC_STATE.HEADING_TO_TERMINAL;
      }
    } else if (npc.state === NPC_STATE.DEPARTING) {
      // Head toward Gulf of Oman exit
      npc.targetHeading = headingToTarget(npc.lat, npc.lon, 25.3, 59.5);
    }

    // Add slight wander so movement looks natural
    npc.wanderTimer -= dt;
    if (npc.wanderTimer <= 0) {
      npc.wanderOffset = (Math.random() - 0.5) * 8;
      npc.wanderTimer = 5 + Math.random() * 10;
    }

    const adjustedTarget = normalizeAngle(npc.targetHeading + (npc.wanderOffset || 0));

    // Turn toward target heading
    const diff = angleDiff(npc.heading, adjustedTarget);
    if (Math.abs(diff) > 0.5) {
      npc.heading = normalizeAngle(npc.heading + Math.sign(diff) * Math.min(Math.abs(diff), 1.5 * dt * 60));
    }

    // Move (nautical: 0°=North, 90°=East)
    const speedDeg = npc.speed * SIM_CONFIG.KNOTS_TO_DEG_PER_SEC;
    const rad = npc.heading * Math.PI / 180;
    const newLon = npc.lon + Math.sin(rad) * speedDeg * dt;
    const newLat = npc.lat + Math.cos(rad) * speedDeg * dt;

    // Only move if not on land
    if (!isOnLand(newLat, newLon)) {
      npc.lon = newLon;
      npc.lat = newLat;
      npc.stuckCount = 0;
    } else {
      npc.stuckCount = (npc.stuckCount || 0) + 1;
      npc.targetHeading = normalizeAngle(npc.heading + 90 + Math.random() * 180);
      npc.heading = normalizeAngle(npc.heading + (Math.random() > 0.5 ? 30 : -30));
      npc.wanderTimer = 3;
      if (npc.stuckCount > 120) {
        // Respawn from edge
        const replacement = createNPCTanker(false);
        npcShips[i] = replacement;
        continue;
      }
    }

    // If exited the map, respawn as a new ship entering from off-screen
    if (npc.lon > 60.5 || npc.lon < 46.5 || npc.lat > 31.0 || npc.lat < 23.0) {
      const replacement = createNPCTanker(false);
      npcShips[i] = replacement;
    }
  }
}

function updateMilitaryShips(dt) {
  for (const mil of militaryShips) {
    const pb = mil.patrolBounds;

    // Check if ship has entered patrol zone
    if (!mil.entered) {
      if (mil.lat >= pb.south && mil.lat <= pb.north &&
          mil.lon >= pb.west && mil.lon <= pb.east) {
        mil.entered = true;
        mil.patrolTimer = 0; // trigger new patrol waypoint
      }
    }

    // Once entered, use patrol waypoint logic
    if (mil.entered) {
      mil.patrolTimer -= dt;
      if (mil.patrolTimer <= 0) {
        let targetLat, targetLon;
        let attempts = 0;
        do {
          targetLat = pb.south + Math.random() * (pb.north - pb.south);
          targetLon = pb.west + Math.random() * (pb.east - pb.west);
          attempts++;
        } while (isOnLand(targetLat, targetLon) && attempts < 20);
        mil.targetHeading = headingToTarget(mil.lat, mil.lon, targetLat, targetLon);
        mil.patrolTimer = 8 + Math.random() * 12;
      }
    }
    // If not entered yet, keep heading toward patrol zone center

    // Turn
    const diff = angleDiff(mil.heading, mil.targetHeading);
    if (Math.abs(diff) > 0.5) {
      mil.heading = normalizeAngle(mil.heading + Math.sign(diff) * Math.min(Math.abs(diff), 2.0 * dt * 60));
    }

    // Move (nautical: 0°=North, 90°=East)
    const speedDeg = mil.speed * SIM_CONFIG.KNOTS_TO_DEG_PER_SEC;
    const rad = mil.heading * Math.PI / 180;
    const newMilLon = mil.lon + Math.sin(rad) * speedDeg * dt;
    const newMilLat = mil.lat + Math.cos(rad) * speedDeg * dt;

    // Only move if not on land
    if (!isOnLand(newMilLat, newMilLon)) {
      mil.lon = newMilLon;
      mil.lat = newMilLat;
      mil.stuckCount = 0;
    } else {
      mil.stuckCount = (mil.stuckCount || 0) + 1;
      mil.targetHeading = normalizeAngle(mil.heading + 90 + Math.random() * 180);
      mil.heading = normalizeAngle(mil.heading + (Math.random() > 0.5 ? 30 : -30));
      mil.patrolTimer = 3;
      if (mil.stuckCount > 120) {
        do {
          mil.lat = pb.south + Math.random() * (pb.north - pb.south);
          mil.lon = pb.west + Math.random() * (pb.east - pb.west);
        } while (isOnLand(mil.lat, mil.lon));
        mil.heading = Math.random() * 360;
        mil.targetHeading = mil.heading;
        mil.stuckCount = 0;
        mil.entered = true;
      }
    }

    // Clamp to patrol bounds (only after entered)
    if (mil.entered) {
      mil.lat = Math.max(pb.south, Math.min(pb.north, mil.lat));
      mil.lon = Math.max(pb.west, Math.min(pb.east, mil.lon));
    }
  }
}

// ============================================
// COLLISION DETECTION
// ============================================
function checkCollisions(elapsed) {
  if (elapsed - lastCollisionCheck < 2) return; // check every 2 seconds
  lastCollisionCheck = elapsed;

  const shipLat = simState.lat;
  const shipLon = simState.lon;
  const collisionR = SIM_CONFIG.COLLISION_RADIUS;

  // Check NPC collisions
  for (const npc of npcShips) {
    const dist = Math.sqrt(
      Math.pow(npc.lat - shipLat, 2) + Math.pow(npc.lon - shipLon, 2)
    );
    if (dist < collisionR) {
      // Collision event
      const severity = Math.random();
      if (severity < 0.3) {
        // Near miss
        addTransitEvent('NEAR MISS', `Close call with ${npc.name}! Evasive action taken.`, '');
      } else if (severity < 0.7) {
        // Glancing blow
        simState.totalDamage += 0.1;
        simState.speed = Math.max(5, simState.speed * 0.8);
        addTransitEvent('COLLISION', `Sideswipe with ${npc.name}! Minor hull damage.`, 'danger');
        simEvents.push({
          event: 'Ship Collision',
          outcome: `Collided with ${npc.name}`,
          damagePercent: 0.1,
          delayHours: 2,
          moneyLossPercent: 0.05,
          zone: 'Strait Traffic'
        });
      } else {
        // Major collision
        simState.totalDamage += 0.25;
        simState.totalMoneyLoss += 0.1;
        simState.speed = Math.max(5, simState.speed * 0.6);
        addTransitEvent('MAJOR COLLISION', `Head-on collision with ${npc.name}! Severe damage!`, 'danger');
        simEvents.push({
          event: 'Major Collision',
          outcome: `Major collision with ${npc.name}`,
          damagePercent: 0.25,
          delayHours: 8,
          moneyLossPercent: 0.1,
          zone: 'Strait Traffic'
        });
      }

      // Push NPC away
      npc.lat += (npc.lat - shipLat) * 2;
      npc.lon += (npc.lon - shipLon) * 2;
    }
  }

  // Check military ship proximity
  for (const mil of militaryShips) {
    const dist = Math.sqrt(
      Math.pow(mil.lat - shipLat, 2) + Math.pow(mil.lon - shipLon, 2)
    );

    if (dist < mil.dangerRadius) {
      // In danger zone of military ship
      const risk = RISK_LEVELS[gameState.riskLevel];
      const fireChance = mil.friendlyFireChance * risk.eventFrequency * 3;

      if (Math.random() < fireChance) {
        // Friendly fire incident!
        const severity = Math.random();
        if (severity < 0.5) {
          simState.totalDamage += 0.15;
          addTransitEvent('MILITARY INCIDENT',
            `${mil.name} (${mil.country}) fired warning shots! Hull grazed.`, 'danger');
          simEvents.push({
            event: 'Military Incident',
            outcome: `${mil.name} warning shots`,
            damagePercent: 0.15,
            delayHours: 4,
            moneyLossPercent: 0,
            zone: 'Military Zone'
          });
        } else {
          simState.totalDamage += 0.5;
          simState.totalMoneyLoss += 0.3;
          addTransitEvent('FRIENDLY FIRE',
            `${mil.name} (${mil.country}) mistook your tanker for a threat! Missile strike!`, 'danger');
          simEvents.push({
            event: 'Friendly Fire',
            outcome: `${mil.name} missile strike`,
            damagePercent: 0.5,
            delayHours: 48,
            moneyLossPercent: 0.3,
            zone: 'Military Zone'
          });
        }
      } else if (dist < mil.dangerRadius * 0.6 && Math.random() < 0.1) {
        addTransitEvent('MILITARY WARNING',
          `${mil.name} (${mil.country}) orders you to alter course immediately!`, '');
      }
    }
  }
}

// ============================================
// TRANSIT SIMULATION
// ============================================
function startTransit() {
  showScreen('transit');
  transitActive = true;
  cargoLoaded = false;
  simStartTime = performance.now();
  simGameTime = 0;
  simTrail = [];
  simEvents = [];
  zoneCooldowns = {};
  lastEventCheck = 0;
  lastCollisionCheck = 0;
  simTargetPoint = null;
  simWaypoints = [];

  const terminal = transitPlan.terminal;
  const ship = transitPlan.ship;

  // Start in the Gulf of Oman (outside the strait)
  simState = {
    lat: SIM_CONFIG.SPAWN_LAT,
    lon: SIM_CONFIG.SPAWN_LON,
    heading: 270,       // Facing west toward the strait
    targetHeading: 270,
    speed: ship.speed,
    health: ship.health,
    totalDamage: 0,
    totalMoneyLoss: 0,
    totalDelay: 0,
    seized: false,
    destroyed: false
  };

  // Center viewport on spawn point
  viewport = {
    north: SIM_CONFIG.SPAWN_LAT + 1.5,
    south: SIM_CONFIG.SPAWN_LAT - 1.5,
    west: SIM_CONFIG.SPAWN_LON - 2.0,
    east: SIM_CONFIG.SPAWN_LON + 2.0
  };
  setViewport(viewport);

  // Spawn NPC and military ships
  spawnNPCShips();
  spawnMilitaryShips();

  // HUD setup
  document.getElementById('hud-ship-name').textContent =
    `${ship.name} - En route to ${terminal.name}`;
  document.getElementById('hud-events').innerHTML = '';
  document.getElementById('hud-cargo-status').textContent = 'NAVIGATE TO TERMINAL';
  document.getElementById('hud-cargo-status').className = 'hud-cargo loading';

  mapCanvas.style.pointerEvents = 'auto';
  mapCanvas.style.cursor = 'crosshair';

  addTransitEvent('DEPARTURE',
    `${ship.name} departing Gulf of Oman. Navigate west to ${terminal.name} to load cargo.`,
    'success');

  requestAnimationFrame(transitLoop);
}

function transitLoop(timestamp) {
  if (!transitActive) return;

  const elapsed = (timestamp - simStartTime) / 1000;
  const dt = (1 / 60) * gameSpeedMultiplier;

  simGameTime = elapsed * SIM_CONFIG.TIME_SCALE * gameSpeedMultiplier;

  // Waypoint navigation: continuously re-aim at current waypoint
  if (simWaypoints.length > 0) {
    const wp = simWaypoints[0];
    const dLon = wp.lon - simState.lon;
    const dLat = wp.lat - simState.lat;
    const distToWP = Math.sqrt(dLon * dLon + dLat * dLat);

    if (distToWP < 0.03) {
      // Arrived at waypoint
      simWaypoints.shift();
      updateClearWpButton();
      if (simWaypoints.length > 0) {
        // Aim at next waypoint
        const next = simWaypoints[0];
        const nLon = next.lon - simState.lon;
        const nLat = next.lat - simState.lat;
        simState.targetHeading = normalizeAngle(Math.atan2(nLon, nLat) * 180 / Math.PI);
      } else {
        // Last waypoint reached - stop the ship
        simState.speed = 0;
        simTargetPoint = null;
      }
    } else {
      // Continuously correct heading toward current waypoint
      simState.targetHeading = normalizeAngle(Math.atan2(dLon, dLat) * 180 / Math.PI);
    }
  }

  // Update ship heading toward target
  const headingDiff = angleDiff(simState.heading, simState.targetHeading);
  if (Math.abs(headingDiff) > 0.5) {
    const turnAmount = Math.sign(headingDiff) * Math.min(Math.abs(headingDiff), SIM_CONFIG.TURN_RATE * dt * 60);
    simState.heading = normalizeAngle(simState.heading + turnAmount);
  }

  // Move ship (nautical: 0°=North, 90°=East)
  const speedDegPerSec = simState.speed * SIM_CONFIG.KNOTS_TO_DEG_PER_SEC;
  const headingRad = simState.heading * Math.PI / 180;
  const newLon = simState.lon + Math.sin(headingRad) * speedDegPerSec * dt;
  const newLat = simState.lat + Math.cos(headingRad) * speedDegPerSec * dt;

  // Coastline collision: only move if new position is not on land
  if (!isOnLand(newLat, newLon)) {
    simState.lon = newLon;
    simState.lat = newLat;
  } else {
    // Blocked by land — stop and clear waypoints
    simState.speed = Math.max(3, simState.speed * 0.5);
    simWaypoints = [];
    simTargetPoint = null;
  }

  // Clamp to full map bounds
  simState.lat = Math.max(MAP_BOUNDS.south + 0.05, Math.min(MAP_BOUNDS.north - 0.05, simState.lat));
  simState.lon = Math.max(MAP_BOUNDS.west + 0.05, Math.min(MAP_BOUNDS.east - 0.05, simState.lon));

  // Record trail
  if (simTrail.length === 0 || elapsed - simTrail[simTrail.length - 1].t > 0.5) {
    simTrail.push({ lat: simState.lat, lon: simState.lon, t: elapsed });
  }

  // Update NPC and military ships
  updateNPCShips(dt);
  updateMilitaryShips(dt);

  // Check proximity to terminal for cargo loading
  if (!cargoLoaded) {
    const terminal = transitPlan.terminal;
    const dLon = simState.lon - terminal.lon;
    const dLat = simState.lat - terminal.lat;
    const distToTerminal = Math.sqrt(dLon * dLon + dLat * dLat);
    if (distToTerminal < (terminal.loadRadius || SIM_CONFIG.LOAD_RADIUS)) {
      cargoLoaded = true;
      document.getElementById('hud-cargo-status').textContent = 'CARGO LOADED - CROSS THE STRAIT';
      document.getElementById('hud-cargo-status').className = 'hud-cargo loaded';
      document.getElementById('hud-ship-name').textContent =
        `${transitPlan.ship.name} - Loaded at ${terminal.name}`;
      addTransitEvent('CARGO LOADED',
        `Full load from ${terminal.name}. Navigate east through the Strait of Hormuz to the finish line.`,
        'success');
    }
  }

  // Check collisions
  checkCollisions(elapsed);

  // Check danger zone events
  if (elapsed - lastEventCheck > SIM_CONFIG.EVENT_CHECK_INTERVAL / 1000) {
    lastEventCheck = elapsed;
    checkDangerZones(elapsed);
  }

  // Check if transit complete (past finish line WITH cargo)
  if (cargoLoaded && simState.lon >= SIM_CONFIG.END_LON) {
    finishTransit();
    return;
  }

  // Check for destruction
  if (simState.totalDamage >= 0.9 || simState.seized) {
    finishTransit();
    return;
  }

  // Update HUD
  updateHUD(elapsed);

  // Render
  drawMap(mapCanvas, {
    showZones: true,
    showFinish: cargoLoaded,
    showTerminals: true,
    showSpawn: !cargoLoaded,
    selectedTerminalId: transitPlan.terminal.id,
    ship: simState,
    trail: simTrail,
    targetPoint: simWaypoints.length > 0 ? simWaypoints[0] : simTargetPoint,
    waypoints: simWaypoints,
    npcShips: npcShips,
    militaryShips: militaryShips,
    showMinimap: true,
    riskMultiplier: RISK_LEVELS[gameState.riskLevel]?.eventFrequency || 0.15
  });
  drawCompass(compassCanvas, simState.heading);

  requestAnimationFrame(transitLoop);
}


function updateHUD(elapsed) {
  const gameHours = Math.floor(simGameTime / 3600);
  const gameMinutes = Math.floor((simGameTime % 3600) / 60);
  document.getElementById('hud-time').textContent =
    `${String(gameHours).padStart(2, '0')}:${String(gameMinutes).padStart(2, '0')}`;
  document.getElementById('hud-speed').textContent = `${simState.speed} kts`;
  document.getElementById('hud-heading').innerHTML = `${Math.round(simState.heading)}&deg;`;
  document.getElementById('hud-health').textContent =
    `${Math.round((simState.health - simState.totalDamage) * 100)}%`;

  // Progress: two-leg journey
  // Leg 1: spawn → terminal, Leg 2: terminal → finish line
  const terminal = transitPlan.terminal;
  const spawnLon = SIM_CONFIG.SPAWN_LON;
  const terminalLon = terminal.lon;
  const finishLon = SIM_CONFIG.END_LON;
  let progress;
  if (!cargoLoaded) {
    // Leg 1: heading west to terminal (50% of total)
    const leg1Total = spawnLon - terminalLon;
    const leg1Done = spawnLon - simState.lon;
    progress = Math.min(50, Math.max(0, Math.round((leg1Done / leg1Total) * 50)));
  } else {
    // Leg 2: heading east to finish (50-100%)
    const leg2Total = finishLon - terminalLon;
    const leg2Done = simState.lon - terminalLon;
    progress = 50 + Math.min(50, Math.max(0, Math.round((leg2Done / leg2Total) * 50)));
  }
  document.getElementById('hud-progress').textContent = `${progress}%`;

  const healthEl = document.getElementById('hud-health');
  const hp = simState.health - simState.totalDamage;
  healthEl.style.color = hp > 0.7 ? '#40c070' : hp > 0.4 ? '#f0a030' : '#e04040';
}

function checkDangerZones(elapsed) {
  const risk = RISK_LEVELS[gameState.riskLevel];
  const ais = transitPlan.ais;
  const time = transitPlan.time;

  for (const zone of DANGER_ZONES) {
    if (simState.lat < zone.bounds.south || simState.lat > zone.bounds.north) continue;
    if (simState.lon < zone.bounds.west || simState.lon > zone.bounds.east) continue;

    const lastEvent = zoneCooldowns[zone.id] || 0;
    if (elapsed - lastEvent < SIM_CONFIG.EVENT_COOLDOWN / 1000) continue;

    let prob = zone.baseProbability * risk.eventFrequency;
    prob *= ais.detectionMultiplier;
    prob *= time.visibilityMultiplier;
    prob *= (2 - (simState.health - simState.totalDamage));

    if (Math.random() < prob) {
      const eventId = zone.events[Math.floor(Math.random() * zone.events.length)];
      const eventTemplate = EVENTS.find(e => e.id === eventId);
      if (!eventTemplate) continue;

      const weights = [0.5, 0.25, 0.25];
      const roll = Math.random();
      let outcomeIdx = 0;
      let cumWeight = 0;
      for (let w = 0; w < weights.length; w++) {
        cumWeight += weights[w];
        if (roll < cumWeight) { outcomeIdx = w; break; }
      }

      const outcome = eventTemplate.outcomes[outcomeIdx];
      zoneCooldowns[zone.id] = elapsed;

      simState.totalDamage += outcome.damagePercent;
      simState.totalDelay += Math.max(0, outcome.delayHours);
      simState.totalMoneyLoss += outcome.moneyLoss;

      if (outcome.delayHours >= 720) {
        simState.seized = true;
      }

      if (outcome.damagePercent > 0.1) {
        simState.speed = Math.max(5, transitPlan.ship.speed * (1 - simState.totalDamage * 0.5));
      }

      const isDanger = outcome.damagePercent > 0 || outcome.moneyLoss > 0;
      const isGood = outcome.delayHours < 0;
      let extraInfo = '';
      if (outcome.damagePercent > 0) extraInfo += ` [Damage: ${Math.round(outcome.damagePercent * 100)}%]`;
      if (outcome.moneyLoss > 0) extraInfo += ` [Cargo Loss: ${Math.round(outcome.moneyLoss * 100)}%]`;

      addTransitEvent(
        eventTemplate.name,
        outcome.text + extraInfo,
        isDanger ? 'danger' : isGood ? 'success' : ''
      );

      simEvents.push({
        event: eventTemplate.name,
        outcome: outcome.text,
        damagePercent: outcome.damagePercent,
        delayHours: outcome.delayHours,
        moneyLossPercent: outcome.moneyLoss,
        zone: zone.name
      });
    }
  }
}

function addTransitEvent(name, text, type) {
  const container = document.getElementById('hud-events');
  const div = document.createElement('div');
  div.className = `event-item ${type || ''}`;
  div.innerHTML = `
    <div class="event-name">${name}</div>
    <div class="event-outcome">${text}</div>
  `;
  container.appendChild(div);
  container.scrollTop = container.scrollHeight;

  while (container.children.length > 8) {
    container.firstChild.style.opacity = '0';
    setTimeout(() => container.firstChild?.remove(), 300);
  }
}

function finishTransit() {
  transitActive = false;
  mapCanvas.style.pointerEvents = 'none';
  mapCanvas.style.cursor = 'default';

  const ship = transitPlan.ship;
  const ais = transitPlan.ais;
  const insurance = transitPlan.insurance;
  const terminal = transitPlan.terminal;

  const cargoBarrels = ship.capacity * 7.33;
  const cargoValue = cargoBarrels * gameState.oilPrice * terminal.loadingBonus;
  const insuranceCost = cargoValue * insurance.costPercent;

  const transitHours = simGameTime / 3600;
  const fuelCost = ship.fuelPerHour * transitHours * FUEL_COST_PER_UNIT / 1000;

  const totalDamage = Math.min(simState.totalDamage, 1.0);
  const totalMoneyLoss = Math.min(simState.totalMoneyLoss, 1.0);
  const shipDestroyed = totalDamage >= 0.9;
  const shipSurvived = !shipDestroyed && !simState.seized;

  let revenue = 0;
  let totalCost = insuranceCost + fuelCost + ais.legalPenalty;
  let insurancePayout = 0;

  if (shipSurvived) {
    revenue = cargoValue * (1 - totalMoneyLoss) * (1 - totalDamage * 0.5);
  } else {
    const loss = cargoValue + ship.cost;
    insurancePayout = loss * insurance.coveragePercent;
    totalCost += loss - insurancePayout;
  }

  const profit = revenue - totalCost;

  const result = {
    success: shipSurvived,
    seized: simState.seized,
    shipDestroyed,
    events: simEvents,
    cargoValue: Math.round(cargoValue),
    revenue: Math.round(revenue),
    insuranceCost: Math.round(insuranceCost),
    fuelCost: Math.round(fuelCost),
    legalPenalty: ais.legalPenalty,
    insurancePayout: Math.round(insurancePayout),
    totalCost: Math.round(totalCost),
    profit: Math.round(profit),
    totalDamage: Math.round(totalDamage * 100),
    totalDelay: Math.round(simState.totalDelay * 10) / 10,
    transitHours: Math.round(transitHours * 10) / 10,
    shipName: ship.name,
    terminalName: terminal.name
  };

  socket.emit('transit_complete', {
    shipId: selectedShipId,
    result: result,
    shipSurvived,
    totalDamage,
    profit
  }, (res) => {
    if (res.success) {
      gameState = res.game;
    }
  });

  addTransitEvent(
    shipSurvived ? 'TRANSIT COMPLETE' : simState.seized ? 'VESSEL SEIZED' : 'VESSEL DESTROYED',
    `Profit: ${formatMoney(profit)}`,
    shipSurvived ? 'success' : 'danger'
  );

  setTimeout(() => {
    showResults(result);
  }, 2500);
}

// ============================================
// MAP CLICK HANDLER (waypoint navigation)
// ============================================
mapCanvas.addEventListener('click', (e) => {
  if (!transitActive) return;
  if (isPanning) return;

  const rect = mapCanvas.getBoundingClientRect();
  const cx = e.clientX - rect.left;
  const cy = e.clientY - rect.top;

  const target = canvasToLatLon(cx, cy, rect.width, rect.height);

  // Check if clicking on own ship (within ~20px)
  if (simState) {
    const shipPos = latLonToCanvas(simState.lat, simState.lon, rect.width, rect.height);
    const dx = cx - shipPos.x;
    const dy = cy - shipPos.y;
    if (Math.sqrt(dx * dx + dy * dy) < 20) {
      if (shipControlOpen) {
        closeShipControlPanel();
      } else {
        openShipControlPanel();
      }
      return;
    }
  }

  // Close ship control panel if clicking elsewhere
  if (shipControlOpen) {
    closeShipControlPanel();
  }

  // Don't allow waypoints on land
  if (isOnLand(target.lat, target.lon)) return;

  // Add waypoint to queue (max 10)
  if (simWaypoints.length < 10) {
    simWaypoints.push(target);
    updateClearWpButton();
  }

  // If ship is stopped (was at last waypoint), resume at full speed
  if (simState.speed === 0 && transitPlan) {
    simState.speed = transitPlan.ship.speed;
  }

  // Set bearing toward first waypoint if this is the only one
  if (simWaypoints.length === 1) {
    const dLon = target.lon - simState.lon;
    const dLat = target.lat - simState.lat;
    simState.targetHeading = normalizeAngle(Math.atan2(dLon, dLat) * 180 / Math.PI);
    simTargetPoint = target;
  }
});

// Right-click clears all waypoints
mapCanvas.addEventListener('contextmenu', (e) => {
  if (transitActive && simWaypoints.length > 0) {
    simWaypoints = [];
    simTargetPoint = null;
    simState.speed = 0;
    updateClearWpButton();
  }
});

// ============================================
// ANGLE UTILITIES
// ============================================
function normalizeAngle(a) {
  a = a % 360;
  if (a < 0) a += 360;
  return a;
}

function angleDiff(from, to) {
  let diff = to - from;
  while (diff > 180) diff -= 360;
  while (diff < -180) diff += 360;
  return diff;
}

// ============================================
// RESULTS SCREEN
// ============================================
function showResults(myResult) {
  showScreen('results');
  renderResults(myResult);
}

function renderResults(myResult) {
  const detail = document.getElementById('result-detail');

  if (!myResult || myResult.skipped) {
    detail.innerHTML = '<div class="result-header">NO TRANSIT</div><div class="muted">You skipped this round.</div>';
    detail.className = 'result-detail';
  } else {
    detail.className = `result-detail ${myResult.success ? 'result-success' : 'result-fail'}`;
    detail.innerHTML = `
      <div class="result-header">${myResult.success ? 'TRANSIT SUCCESSFUL' : myResult.seized ? 'VESSEL SEIZED!' : 'VESSEL DESTROYED!'}</div>
      <div class="result-lines">
        <div class="result-line"><span>Ship:</span><span>${myResult.shipName}</span></div>
        <div class="result-line"><span>Terminal:</span><span>${myResult.terminalName || 'N/A'}</span></div>
        <div class="result-line"><span>Transit Time:</span><span>${myResult.transitHours || '?'}h</span></div>
        <div class="result-line"><span>Cargo Value:</span><span>${formatMoney(myResult.cargoValue)}</span></div>
        <div class="result-line"><span>Revenue:</span><span>${formatMoney(myResult.revenue)}</span></div>
        <div class="result-line"><span>Insurance:</span><span>-${formatMoney(myResult.insuranceCost)}</span></div>
        <div class="result-line"><span>Fuel:</span><span>-${formatMoney(myResult.fuelCost)}</span></div>
        ${myResult.legalPenalty > 0 ? `<div class="result-line"><span>Legal Fines:</span><span>-${formatMoney(myResult.legalPenalty)}</span></div>` : ''}
        ${myResult.insurancePayout > 0 ? `<div class="result-line"><span>Insurance Payout:</span><span>+${formatMoney(myResult.insurancePayout)}</span></div>` : ''}
        ${myResult.totalDamage > 0 ? `<div class="result-line"><span>Ship Damage:</span><span class="stat-bad">${myResult.totalDamage}%</span></div>` : ''}
        ${myResult.events.length > 0 ? `<div class="result-line"><span>Events:</span><span>${myResult.events.length} encounters</span></div>` : ''}
      </div>
      <div class="result-profit ${myResult.profit >= 0 ? 'profit-positive' : 'profit-negative'}">
        ${myResult.profit >= 0 ? '+' : ''}${formatMoney(myResult.profit)}
      </div>
    `;
  }

  renderLeaderboard();
  renderFleetManagement();
}

function renderLeaderboard() {
  if (!gameState) return;
  const container = document.getElementById('leaderboard');
  container.innerHTML = `
    <h3>LEADERBOARD</h3>
    ${gameState.leaderboard.map((p, i) => `
      <div class="lb-row ${p.id === myId ? 'highlight' : ''}">
        <span class="lb-rank">#${i + 1}</span>
        <span class="lb-name">${escapeHtml(p.name)}${p.id === myId ? ' (you)' : ''}</span>
        <span class="lb-worth">${formatMoney(p.netWorth)}</span>
      </div>
    `).join('')}
  `;
}

function renderFleetManagement() {
  const me = gameState?.players.find(p => p.id === myId);
  if (!me) return;

  const fleetDisplay = document.getElementById('fleet-display');
  fleetDisplay.innerHTML = me.fleet.map(s => {
    const healthClass = s.health > 0.7 ? 'health-good' : s.health > 0.4 ? 'health-warn' : 'health-bad';
    const repairCost = Math.round(s.cost * (1 - s.health) * 0.3);
    return `
      <div class="fleet-ship">
        <div class="ship-info">
          <div>${s.name}</div>
          <div>
            HP: ${Math.round(s.health * 100)}%
            <div class="health-bar"><div class="health-fill ${healthClass}" style="width:${s.health * 100}%"></div></div>
          </div>
        </div>
        ${s.health < 1.0 ? `<button class="btn btn-small btn-success" onclick="window.repairShip('${s.id}')">Repair ${formatMoney(repairCost)}</button>` : '<span class="stat-good">Ready</span>'}
      </div>
    `;
  }).join('') || '<div class="muted">No ships! Buy one below or you\'re out.</div>';

  const shop = document.getElementById('ship-shop');
  if (options) {
    const me2 = gameState.players.find(p => p.id === myId);
    shop.innerHTML = Object.entries(options.shipTypes).map(([key, s]) => `
      <div class="option-card" onclick="window.buyShip('${key}')">
        <div class="option-name">${s.name}</div>
        <div class="option-desc">${s.description}</div>
        <div class="option-stats">
          <span class="stat">${(s.capacity / 1000).toFixed(0)}K DWT</span>
          <span class="stat">${formatMoney(s.cost)}</span>
          <span class="stat ${(me2?.cash || 0) >= s.cost ? 'stat-good' : 'stat-bad'}">
            ${(me2?.cash || 0) >= s.cost ? 'Can Afford' : 'Too Expensive'}
          </span>
        </div>
      </div>
    `).join('');
  }
}

// Global handlers
window.buyShip = (typeId) => {
  // Open modal for AIS/insurance selection
  openShipPurchaseModal();
  // Pre-select the ship type
  if (options?.shipTypes[typeId]) {
    const cards = document.querySelectorAll('#modal-ship-list .option-card');
    cards.forEach(c => {
      if (c.dataset.id === typeId) c.classList.add('selected');
    });
    modalShipTypeId = typeId;
    showModalConfigStep(options.shipTypes[typeId]);
  }
};

window.repairShip = (shipId) => {
  socket.emit('repair_ship', { shipId }, (res) => {
    if (res.success) {
      renderFleetManagement();
    } else {
      showError(res.error || 'Cannot repair ship');
    }
  });
};

// Continue to next transit (return to planning)
document.getElementById('btn-continue').addEventListener('click', () => {
  showScreen('planning');
  renderPlanning();
});

// ============================================
// GAME OVER
// ============================================
function renderGameOver(leaderboard) {
  showScreen('gameover');
  const container = document.getElementById('final-leaderboard');
  container.innerHTML = `
    <h3>FINAL STANDINGS</h3>
    ${leaderboard.map((p, i) => `
      <div class="lb-row">
        <span class="lb-rank">#${i + 1}</span>
        <span class="lb-name">${escapeHtml(p.name)} ${p.id === myId ? '(you)' : ''}</span>
        <span class="lb-worth">${formatMoney(p.netWorth)}</span>
      </div>
    `).join('')}
  `;
}

document.getElementById('btn-new-game').addEventListener('click', () => {
  window.location.reload();
});

// ============================================
// SOCKET EVENTS
// ============================================
socket.on('connect', () => {
  myId = socket.id;
});

socket.on('game_update', (state) => {
  gameState = state;
  if (state.players.length > 0 && state.players[0].id === myId) {
    isHost = true;
  }

  const activeScreen = document.querySelector('.screen.active');
  if (activeScreen === screens.lobby) renderLobby();
  if (activeScreen === screens.results) {
    renderLeaderboard();
    renderFleetManagement();
  }
});

socket.on('phase_change', ({ phase }) => {
  if (phase === 'planning') {
    showScreen('planning');
    renderPlanning();
  }
});

socket.on('game_over', ({ leaderboard }) => {
  renderGameOver(leaderboard);
});

socket.on('disconnect', () => {
  showError('Disconnected from server');
});

// ============================================
// BACKGROUND MAP RENDERING
// ============================================
function drawBackgroundMap() {
  if (transitActive) return;
  try {
    const isPlanning = screens.planning.classList.contains('active');
    drawMap(mapCanvas, {
      showZones: isPlanning,
      showFinish: isPlanning,
      showTerminals: isPlanning,
      showSpawn: isPlanning,
      selectedTerminalId: selectedTerminalId
    });
  } catch (e) {
    console.error('Map draw error:', e);
  }
}

window.addEventListener('resize', () => {
  drawBackgroundMap();
});

drawBackgroundMap();

setInterval(() => {
  if (!transitActive) drawBackgroundMap();
}, 2000);
