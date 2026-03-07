import { io } from 'socket.io-client';
import { drawMap, drawCompass, canvasToLatLon } from './map.js';
import {
  SIM_CONFIG, DANGER_ZONES, EVENTS, RISK_LEVELS, MAP_BOUNDS,
  FUEL_COST_PER_UNIT
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
let selectedTimeId = null;
let selectedAisId = null;
let selectedInsuranceId = null;

// Transit simulation state
let transitActive = false;
let simState = null; // { lat, lon, heading, targetHeading, speed, health, ... }
let simTrail = [];
let simEvents = [];
let simStartTime = 0;
let simGameTime = 0; // game seconds elapsed
let simTargetPoint = null;
let zoneCooldowns = {}; // zone_id -> last event timestamp
let lastEventCheck = 0;
let transitPlan = null; // { ship, ais, insurance, time }

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

  document.getElementById('plan-round').textContent = gameState.round;
  const riskBadge = document.getElementById('plan-risk');
  riskBadge.textContent = gameState.riskInfo.name.toUpperCase();
  riskBadge.className = `risk-badge risk-${gameState.riskLevel}`;
  document.getElementById('plan-oil-price').textContent = gameState.oilPrice.toFixed(2);

  const me = gameState.players.find(p => p.id === myId);
  document.getElementById('plan-cash').textContent = formatMoney(me?.cash || 0);

  selectedShipId = null;
  selectedTimeId = null;
  selectedAisId = null;
  selectedInsuranceId = null;

  // Ship selector
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
      </div>
    `).join('');

    shipSelector.querySelectorAll('.option-card').forEach(card => {
      card.addEventListener('click', () => {
        shipSelector.querySelectorAll('.option-card').forEach(c => c.classList.remove('selected'));
        card.classList.add('selected');
        selectedShipId = card.dataset.shipId;
        updateCostPreview();
      });
    });

    if (me.fleet.length === 1) {
      selectedShipId = me.fleet[0].id;
      shipSelector.querySelector('.option-card')?.classList.add('selected');
    }
  } else {
    shipSelector.innerHTML = '<div class="muted">No ships! You\'re out.</div>';
  }

  // Time selector
  renderOptionSelector('time-selector', options.timeOptions, (key, opt) => `
    <div class="option-name">${opt.name}</div>
    <div class="option-stats">
      <span class="stat ${opt.visibilityMultiplier <= 0.4 ? 'stat-good' : opt.visibilityMultiplier >= 0.8 ? 'stat-bad' : 'stat-warn'}">
        Vis: ${Math.round(opt.visibilityMultiplier * 100)}%
      </span>
    </div>
  `, (key) => { selectedTimeId = key; updateCostPreview(); });

  // AIS selector
  renderOptionSelector('ais-selector', options.aisOptions, (key, opt) => {
    const detClass = opt.detectionMultiplier <= 0.5 ? 'stat-good' : opt.detectionMultiplier >= 1.2 ? 'stat-bad' : 'stat-warn';
    return `
      <div class="option-name">${opt.name}</div>
      <div class="option-desc">${opt.description}</div>
      <div class="option-stats">
        <span class="stat ${detClass}">Detection: ${opt.detectionMultiplier}x</span>
        ${opt.legalPenalty > 0 ? `<span class="stat stat-bad">Fine: ${formatMoney(opt.legalPenalty)}</span>` : ''}
      </div>
    `;
  }, (key) => { selectedAisId = key; updateCostPreview(); });

  // Insurance selector
  renderOptionSelector('insurance-selector', options.insuranceOptions, (key, opt) => `
    <div class="option-name">${opt.name}</div>
    <div class="option-desc">${opt.description}</div>
    <div class="option-stats">
      <span class="stat">${(opt.costPercent * 100).toFixed(0)}% premium</span>
      <span class="stat ${opt.coveragePercent >= 0.8 ? 'stat-good' : opt.coveragePercent > 0 ? 'stat-warn' : 'stat-bad'}">
        ${Math.round(opt.coveragePercent * 100)}% coverage
      </span>
    </div>
  `, (key) => { selectedInsuranceId = key; updateCostPreview(); });

  document.getElementById('btn-submit-plan').classList.remove('hidden');
  document.getElementById('plan-waiting').classList.add('hidden');
  updateCostPreview();
}

function renderOptionSelector(containerId, optionsObj, renderFn, onSelect) {
  const container = document.getElementById(containerId);
  container.innerHTML = Object.entries(optionsObj).map(([key, opt]) => `
    <div class="option-card" data-key="${key}">
      ${renderFn(key, opt)}
    </div>
  `).join('');

  container.querySelectorAll('.option-card').forEach(card => {
    card.addEventListener('click', () => {
      container.querySelectorAll('.option-card').forEach(c => c.classList.remove('selected'));
      card.classList.add('selected');
      onSelect(card.dataset.key);
    });
  });
}

function updateCostPreview() {
  const preview = document.getElementById('cost-preview');
  const me = gameState?.players.find(p => p.id === myId);
  if (!me || !selectedShipId || !selectedInsuranceId) {
    preview.innerHTML = '<div class="muted">Select all options to see costs</div>';
    return;
  }

  const ship = me.fleet.find(s => s.id === selectedShipId);
  const insurance = options.insuranceOptions[selectedInsuranceId];
  const ais = selectedAisId ? options.aisOptions[selectedAisId] : null;
  if (!ship || !insurance) return;

  const cargoBarrels = ship.capacity * 7.33;
  const cargoValue = cargoBarrels * gameState.oilPrice;
  const insuranceCost = cargoValue * insurance.costPercent;
  // Estimate ~10 hours transit at average
  const fuelCost = ship.fuelPerHour * 10 * FUEL_COST_PER_UNIT / 1000;
  const legalPenalty = ais ? ais.legalPenalty : 0;
  const totalCost = insuranceCost + fuelCost + legalPenalty;

  preview.innerHTML = `
    <div class="cost-line"><span>Cargo Value:</span><span>${formatMoney(cargoValue)}</span></div>
    <div class="cost-line"><span>Insurance:</span><span>-${formatMoney(insuranceCost)}</span></div>
    <div class="cost-line"><span>Est. Fuel:</span><span>-${formatMoney(fuelCost)}</span></div>
    ${legalPenalty > 0 ? `<div class="cost-line"><span>Legal Risk:</span><span class="stat-bad">-${formatMoney(legalPenalty)}</span></div>` : ''}
    <div class="cost-line cost-total">
      <span>Est. Max Profit:</span>
      <span class="stat-good">${formatMoney(cargoValue - totalCost)}</span>
    </div>
  `;
}

// Submit plan and start transit
document.getElementById('btn-submit-plan').addEventListener('click', () => {
  if (!selectedShipId || !selectedTimeId || !selectedAisId || !selectedInsuranceId) {
    showError('Select all options before launching');
    return;
  }

  const me = gameState.players.find(p => p.id === myId);
  const ship = me.fleet.find(s => s.id === selectedShipId);
  const ais = options.aisOptions[selectedAisId];
  const insurance = options.insuranceOptions[selectedInsuranceId];
  const time = options.timeOptions[selectedTimeId];

  transitPlan = { ship, ais, insurance, time };

  // Tell server we're ready (server won't simulate - client does it)
  socket.emit('submit_plan', {
    shipId: selectedShipId,
    routeId: 'PLAYER_NAVIGATED', // special: player navigates manually
    timeId: selectedTimeId,
    aisId: selectedAisId,
    insuranceId: selectedInsuranceId
  }, (res) => {
    if (res.success) {
      startTransit();
    } else {
      showError(res.error || 'Failed to submit plan');
    }
  });
});

// ============================================
// TRANSIT SIMULATION
// ============================================
function startTransit() {
  showScreen('transit');
  transitActive = true;
  simStartTime = performance.now();
  simGameTime = 0;
  simTrail = [];
  simEvents = [];
  zoneCooldowns = {};
  lastEventCheck = 0;
  simTargetPoint = null;

  const ship = transitPlan.ship;
  simState = {
    lat: SIM_CONFIG.START_LAT,
    lon: SIM_CONFIG.START_LON,
    heading: 90, // east
    targetHeading: 90,
    speed: ship.speed,
    health: ship.health,
    totalDamage: 0,
    totalMoneyLoss: 0,
    totalDelay: 0,
    seized: false,
    destroyed: false
  };

  // HUD setup
  document.getElementById('hud-ship-name').textContent =
    `${ship.name} - ${transitPlan.time.name}`;
  document.getElementById('hud-events').innerHTML = '';

  // Start click-to-steer
  mapCanvas.style.pointerEvents = 'auto';
  mapCanvas.style.cursor = 'crosshair';

  addTransitEvent('DEPARTURE', `${ship.name} departing Persian Gulf`, 'success');

  requestAnimationFrame(transitLoop);
}

function transitLoop(timestamp) {
  if (!transitActive) return;

  const elapsed = (timestamp - simStartTime) / 1000; // real seconds elapsed
  const dt = 1 / 60; // ~16ms frame

  // Game time: 1 real second = TIME_SCALE game seconds
  simGameTime = elapsed * SIM_CONFIG.TIME_SCALE;

  // Update ship heading (smooth turn)
  const headingDiff = angleDiff(simState.heading, simState.targetHeading);
  if (Math.abs(headingDiff) > 0.5) {
    const turnAmount = Math.sign(headingDiff) * Math.min(Math.abs(headingDiff), SIM_CONFIG.TURN_RATE * dt * 60);
    simState.heading = normalizeAngle(simState.heading + turnAmount);
  }

  // Move ship
  const speedDegPerSec = simState.speed * SIM_CONFIG.KNOTS_TO_DEG_PER_SEC;
  const headingRad = simState.heading * Math.PI / 180;
  simState.lon += Math.cos(headingRad) * speedDegPerSec * dt;
  // Latitude correction (cos of latitude for mercator)
  simState.lat += Math.sin(headingRad) * speedDegPerSec * dt * -1;

  // Clamp to map bounds
  simState.lat = Math.max(MAP_BOUNDS.south + 0.05, Math.min(MAP_BOUNDS.north - 0.05, simState.lat));
  simState.lon = Math.max(MAP_BOUNDS.west + 0.05, Math.min(MAP_BOUNDS.east - 0.05, simState.lon));

  // Record trail
  if (simTrail.length === 0 || elapsed - simTrail[simTrail.length - 1].t > 0.5) {
    simTrail.push({ lat: simState.lat, lon: simState.lon, t: elapsed });
  }

  // Check events
  if (elapsed - lastEventCheck > SIM_CONFIG.EVENT_CHECK_INTERVAL / 1000) {
    lastEventCheck = elapsed;
    checkDangerZones(elapsed);
  }

  // Check if transit complete
  if (simState.lon >= SIM_CONFIG.END_LON) {
    finishTransit();
    return;
  }

  // Check for ship destruction
  if (simState.totalDamage >= 0.9 || simState.seized) {
    finishTransit();
    return;
  }

  // Update HUD
  updateHUD(elapsed);

  // Render
  const progress = (simState.lon - SIM_CONFIG.START_LON) / (SIM_CONFIG.END_LON - SIM_CONFIG.START_LON);
  drawMap(mapCanvas, {
    showZones: true,
    showStartEnd: true,
    ship: simState,
    trail: simTrail,
    targetPoint: simTargetPoint,
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

  const progress = Math.min(100, Math.round(
    ((simState.lon - SIM_CONFIG.START_LON) / (SIM_CONFIG.END_LON - SIM_CONFIG.START_LON)) * 100
  ));
  document.getElementById('hud-progress').textContent = `${progress}%`;

  // Color health based on level
  const healthEl = document.getElementById('hud-health');
  const hp = simState.health - simState.totalDamage;
  healthEl.style.color = hp > 0.7 ? '#40c070' : hp > 0.4 ? '#f0a030' : '#e04040';
}

function checkDangerZones(elapsed) {
  const risk = RISK_LEVELS[gameState.riskLevel];
  const ais = transitPlan.ais;
  const time = transitPlan.time;

  for (const zone of DANGER_ZONES) {
    // Is ship in this zone?
    if (simState.lat < zone.bounds.south || simState.lat > zone.bounds.north) continue;
    if (simState.lon < zone.bounds.west || simState.lon > zone.bounds.east) continue;

    // Cooldown check
    const lastEvent = zoneCooldowns[zone.id] || 0;
    if (elapsed - lastEvent < SIM_CONFIG.EVENT_COOLDOWN / 1000) continue;

    // Roll for event
    let prob = zone.baseProbability * risk.eventFrequency;
    prob *= ais.detectionMultiplier;
    prob *= time.visibilityMultiplier;
    prob *= (2 - (simState.health - simState.totalDamage));

    if (Math.random() < prob) {
      // Pick a random event from this zone's event types
      const eventId = zone.events[Math.floor(Math.random() * zone.events.length)];
      const eventTemplate = EVENTS.find(e => e.id === eventId);
      if (!eventTemplate) continue;

      // Pick outcome (weighted)
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

      // Apply effects
      simState.totalDamage += outcome.damagePercent;
      simState.totalDelay += Math.max(0, outcome.delayHours);
      simState.totalMoneyLoss += outcome.moneyLoss;

      if (outcome.delayHours >= 720) {
        simState.seized = true;
      }

      // Slow ship temporarily on damage
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

  // Remove old events to keep list manageable
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

  // Calculate results (same logic as server)
  const cargoBarrels = ship.capacity * 7.33;
  const cargoValue = cargoBarrels * gameState.oilPrice;
  const insuranceCost = cargoValue * insurance.costPercent;

  // Fuel: based on actual transit time
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
    shipName: ship.name
  };

  // Send results to server for scoring
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

  // Show final event
  addTransitEvent(
    shipSurvived ? 'TRANSIT COMPLETE' : simState.seized ? 'VESSEL SEIZED' : 'VESSEL DESTROYED',
    `Profit: ${formatMoney(profit)}`,
    shipSurvived ? 'success' : 'danger'
  );

  // Transition to results after a short delay
  setTimeout(() => {
    showResults(result);
  }, 2500);
}

// ============================================
// MAP CLICK HANDLER (steering)
// ============================================
mapCanvas.addEventListener('click', (e) => {
  if (!transitActive) return;

  const rect = mapCanvas.getBoundingClientRect();
  const cx = e.clientX - rect.left;
  const cy = e.clientY - rect.top;

  const target = canvasToLatLon(cx, cy, rect.width, rect.height);
  simTargetPoint = target;

  // Calculate heading from ship to click point
  const dLon = target.lon - simState.lon;
  const dLat = target.lat - simState.lat;
  // Convert to heading (0=north, 90=east)
  const angle = Math.atan2(dLon, -dLat) * 180 / Math.PI;
  simState.targetHeading = normalizeAngle(angle);
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

  const btnNext = document.getElementById('btn-next-round');
  const resultsWaiting = document.getElementById('results-waiting');
  if (isHost) {
    btnNext.classList.remove('hidden');
    resultsWaiting.classList.add('hidden');
  } else {
    btnNext.classList.add('hidden');
    resultsWaiting.classList.remove('hidden');
  }
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
  socket.emit('buy_ship', { shipTypeId: typeId }, (res) => {
    if (res.success) {
      renderFleetManagement();
    } else {
      showError(res.error || 'Cannot buy ship');
    }
  });
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

// Next round
document.getElementById('btn-next-round').addEventListener('click', () => {
  socket.emit('next_round', null, (res) => {
    if (!res.success) showError(res.error);
  });
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

socket.on('phase_change', ({ phase, round }) => {
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
  if (transitActive) return; // Transit has its own render loop
  drawMap(mapCanvas, {
    showZones: screens.planning.classList.contains('active'),
    showStartEnd: screens.planning.classList.contains('active')
  });
}

// Redraw on resize
window.addEventListener('resize', () => {
  drawBackgroundMap();
});

// Initial draw
drawBackgroundMap();

// Periodic redraw for non-transit screens
setInterval(() => {
  if (!transitActive) drawBackgroundMap();
}, 2000);
