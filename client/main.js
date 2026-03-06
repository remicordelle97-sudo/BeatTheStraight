import { io } from 'socket.io-client';
import { drawMap } from './map.js';

// Connect to server
const socket = io(window.location.hostname === 'localhost'
  ? 'http://localhost:3001'
  : window.location.origin
);

// Game state
let gameState = null;
let myId = null;
let isHost = false;
let options = null;
let joinMode = false; // true = joining, false = creating

// Selections for planning
let selectedShipId = null;
let selectedRouteId = null;
let selectedTimeId = null;
let selectedAisId = null;
let selectedInsuranceId = null;

// DOM elements
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

// ---- Title Screen ----
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

// Enter key support
['input-name', 'input-game-id'].forEach(id => {
  document.getElementById(id).addEventListener('keydown', (e) => {
    if (e.key === 'Enter') document.getElementById('btn-confirm').click();
  });
});

function fetchOptions() {
  socket.emit('get_options', null, (opts) => {
    options = opts;
  });
}

// ---- Lobby Screen ----
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

// ---- Planning Screen ----
function renderPlanning() {
  if (!gameState || !options) return;

  document.getElementById('plan-round').textContent = gameState.round;
  const riskBadge = document.getElementById('plan-risk');
  riskBadge.textContent = gameState.riskInfo.name.toUpperCase();
  riskBadge.className = `risk-badge risk-${gameState.riskLevel}`;
  document.getElementById('plan-oil-price').textContent = gameState.oilPrice.toFixed(2);

  const me = gameState.players.find(p => p.id === myId);
  document.getElementById('plan-cash').textContent = formatMoney(me?.cash || 0);

  // Reset selections
  selectedShipId = null;
  selectedRouteId = null;
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

    // Auto-select first
    if (me.fleet.length === 1) {
      selectedShipId = me.fleet[0].id;
      shipSelector.querySelector('.option-card')?.classList.add('selected');
    }
  } else {
    shipSelector.innerHTML = '<div class="muted">No ships available! You\'re out of the game.</div>';
  }

  // Route selector
  renderOptionSelector('route-selector', options.routes, 'routeId', (key, route) => {
    const riskClass = route.riskMultiplier <= 0.7 ? 'stat-good' : route.riskMultiplier >= 1.5 ? 'stat-bad' : 'stat-warn';
    return `
      <div class="option-name">${route.name}</div>
      <div class="option-desc">${route.description}</div>
      <div class="option-stats">
        <span class="stat ${riskClass}">Risk: ${route.riskMultiplier}x</span>
        <span class="stat">${route.timeHours}h</span>
        <span class="stat">Fuel: ${route.fuelMultiplier}x</span>
      </div>
    `;
  }, (key) => { selectedRouteId = key; updateMap(); updateCostPreview(); });

  // Time selector
  renderOptionSelector('time-selector', options.timeOptions, 'timeId', (key, opt) => `
    <div class="option-name">${opt.name}</div>
    <div class="option-desc">${opt.description}</div>
    <div class="option-stats">
      <span class="stat ${opt.visibilityMultiplier <= 0.4 ? 'stat-good' : opt.visibilityMultiplier >= 0.8 ? 'stat-bad' : 'stat-warn'}">
        Vis: ${Math.round(opt.visibilityMultiplier * 100)}%
      </span>
    </div>
  `, (key) => { selectedTimeId = key; updateCostPreview(); });

  // AIS selector
  renderOptionSelector('ais-selector', options.aisOptions, 'aisId', (key, opt) => {
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
  renderOptionSelector('insurance-selector', options.insuranceOptions, 'insId', (key, opt) => `
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

  updateMap();
  updateCostPreview();
}

function renderOptionSelector(containerId, optionsObj, dataAttr, renderFn, onSelect) {
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

function updateMap() {
  const canvas = document.getElementById('map-canvas');
  let waypoints = null;
  if (selectedRouteId && options?.routes[selectedRouteId]) {
    waypoints = options.routes[selectedRouteId].waypoints;
  }
  drawMap(canvas, waypoints);
}

function updateCostPreview() {
  const preview = document.getElementById('cost-preview');
  const me = gameState?.players.find(p => p.id === myId);
  if (!me || !selectedShipId || !selectedRouteId || !selectedInsuranceId) {
    preview.innerHTML = '<div class="muted">Select all options to see cost breakdown</div>';
    return;
  }

  const ship = me.fleet.find(s => s.id === selectedShipId);
  const route = options.routes[selectedRouteId];
  const insurance = options.insuranceOptions[selectedInsuranceId];
  const ais = selectedAisId ? options.aisOptions[selectedAisId] : null;

  if (!ship || !route || !insurance) return;

  const cargoBarrels = ship.capacity * 7.33;
  const cargoValue = cargoBarrels * gameState.oilPrice;
  const insuranceCost = cargoValue * insurance.costPercent;
  const fuelCost = ship.fuelPerHour * route.timeHours * route.fuelMultiplier * 600 / 1000;
  const legalPenalty = ais ? ais.legalPenalty : 0;
  const totalCost = insuranceCost + fuelCost + legalPenalty;
  const potentialRevenue = cargoValue;

  preview.innerHTML = `
    <div class="cost-line"><span>Cargo Value:</span><span>${formatMoney(cargoValue)}</span></div>
    <div class="cost-line"><span>Cargo (barrels):</span><span>${Math.round(cargoBarrels).toLocaleString()}</span></div>
    <div class="cost-line"><span>Insurance:</span><span>-${formatMoney(insuranceCost)}</span></div>
    <div class="cost-line"><span>Fuel:</span><span>-${formatMoney(fuelCost)}</span></div>
    ${legalPenalty > 0 ? `<div class="cost-line"><span>Legal Risk:</span><span class="stat-bad">-${formatMoney(legalPenalty)}</span></div>` : ''}
    <div class="cost-line cost-total">
      <span>Max Profit:</span>
      <span class="stat-good">${formatMoney(potentialRevenue - totalCost)}</span>
    </div>
  `;
}

// Submit plan
document.getElementById('btn-submit-plan').addEventListener('click', () => {
  if (!selectedShipId || !selectedRouteId || !selectedTimeId || !selectedAisId || !selectedInsuranceId) {
    showError('Select all options before launching');
    return;
  }

  socket.emit('submit_plan', {
    shipId: selectedShipId,
    routeId: selectedRouteId,
    timeId: selectedTimeId,
    aisId: selectedAisId,
    insuranceId: selectedInsuranceId
  }, (res) => {
    if (res.success) {
      document.getElementById('btn-submit-plan').classList.add('hidden');
      document.getElementById('plan-waiting').classList.remove('hidden');
    } else {
      showError(res.error || 'Failed to submit plan');
    }
  });
});

// ---- Transit Animation ----
function showTransitAnimation(result, routeWaypoints) {
  showScreen('transit');
  const shipName = result.shipName || 'Your Ship';
  document.getElementById('transit-ship-name').textContent = shipName + ' - ' + result.route;

  const canvas = document.getElementById('transit-canvas');
  const eventsContainer = document.getElementById('transit-events');
  eventsContainer.innerHTML = '';

  const events = result.events || [];
  let progress = 0;
  const duration = 4000; // 4 second animation
  const startTime = Date.now();

  function animate() {
    const elapsed = Date.now() - startTime;
    progress = Math.min(elapsed / duration, 1);

    drawMap(canvas, routeWaypoints, progress);

    // Show events as they happen along the route
    const eventsToShow = events.filter(e => {
      const eventProgress = (e.checkpoint + 0.5) / (routeWaypoints.length - 1);
      return progress >= eventProgress;
    });

    if (eventsContainer.children.length < eventsToShow.length) {
      const newEvent = eventsToShow[eventsContainer.children.length];
      const div = document.createElement('div');
      const isDanger = newEvent.damagePercent > 0 || newEvent.moneyLossPercent > 0;
      const isGood = newEvent.delayHours < 0;
      div.className = `event-item ${isDanger ? 'danger' : isGood ? 'success' : ''}`;
      div.innerHTML = `
        <div class="event-name">${newEvent.event}</div>
        <div class="event-outcome">${newEvent.outcome}</div>
      `;
      eventsContainer.appendChild(div);
      eventsContainer.scrollTop = eventsContainer.scrollHeight;
    }

    if (progress < 1) {
      requestAnimationFrame(animate);
    } else {
      // Add final result event
      setTimeout(() => {
        const finalDiv = document.createElement('div');
        finalDiv.className = `event-item ${result.success ? 'success' : 'danger'}`;
        finalDiv.innerHTML = `
          <div class="event-name">${result.success ? 'TRANSIT COMPLETE' : result.seized ? 'VESSEL SEIZED' : 'VESSEL LOST'}</div>
          <div class="event-outcome">Profit: ${formatMoney(result.profit)}</div>
        `;
        eventsContainer.appendChild(finalDiv);

        // Move to results after delay
        setTimeout(() => showResults(result), 2000);
      }, 500);
    }
  }

  requestAnimationFrame(animate);
}

// ---- Results Screen ----
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
        <div class="result-line"><span>Route:</span><span>${myResult.route}</span></div>
        <div class="result-line"><span>Ship:</span><span>${myResult.shipName}</span></div>
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

  // Current fleet
  const fleetDisplay = document.getElementById('fleet-display');
  fleetDisplay.innerHTML = me.fleet.map(s => {
    const healthClass = s.health > 0.7 ? 'health-good' : s.health > 0.4 ? 'health-warn' : 'health-bad';
    const repairCost = Math.round(s.cost * (1 - s.health) * 0.3);
    return `
      <div class="fleet-ship">
        <div class="ship-info">
          <div>${s.name}</div>
          <div class="ship-health">
            HP: ${Math.round(s.health * 100)}%
            <div class="health-bar"><div class="health-fill ${healthClass}" style="width:${s.health * 100}%"></div></div>
          </div>
        </div>
        ${s.health < 1.0 ? `<button class="btn btn-small btn-success" onclick="window.repairShip('${s.id}')">Repair ${formatMoney(repairCost)}</button>` : '<span class="stat-good">Ready</span>'}
      </div>
    `;
  }).join('') || '<div class="muted">No ships! Buy one below or you\'re out.</div>';

  // Shop
  const shop = document.getElementById('ship-shop');
  if (options) {
    shop.innerHTML = Object.entries(options.shipTypes).map(([key, s]) => `
      <div class="option-card" onclick="window.buyShip('${key}')">
        <div class="option-name">${s.name}</div>
        <div class="option-desc">${s.description}</div>
        <div class="option-stats">
          <span class="stat">${(s.capacity / 1000).toFixed(0)}K DWT</span>
          <span class="stat">${formatMoney(s.cost)}</span>
          <span class="stat ${(me?.cash || 0) >= s.cost ? 'stat-good' : 'stat-bad'}">
            ${(me?.cash || 0) >= s.cost ? 'Can Afford' : 'Too Expensive'}
          </span>
        </div>
      </div>
    `).join('');
  }
}

// Global handlers for fleet management buttons
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

// ---- Game Over ----
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

// ---- Socket Events ----
socket.on('connect', () => {
  myId = socket.id;
});

socket.on('game_update', (state) => {
  gameState = state;
  // Check if I'm the host (first player in list)
  if (state.players.length > 0 && state.players[0].id === myId) {
    isHost = true;
  }

  // Re-render current screen
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
  } else if (phase === 'reinvest') {
    // Transit results handler will show results screen
  }
});

socket.on('transit_results', ({ myResult, allResults, leaderboard }) => {
  gameState.leaderboard = leaderboard;

  // Get the route waypoints for animation
  let routeWaypoints = null;
  if (selectedRouteId && options?.routes[selectedRouteId]) {
    routeWaypoints = options.routes[selectedRouteId].waypoints;
  }

  if (myResult && !myResult.skipped && routeWaypoints) {
    showTransitAnimation(myResult, routeWaypoints);
  } else {
    showResults(myResult);
  }
});

socket.on('game_over', ({ leaderboard }) => {
  renderGameOver(leaderboard);
});

socket.on('disconnect', () => {
  showError('Disconnected from server');
});

// Utility
function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

// Initial map draw on planning screen visibility
const observer = new MutationObserver(() => {
  if (screens.planning.classList.contains('active')) {
    updateMap();
  }
});
observer.observe(screens.planning, { attributes: true, attributeFilter: ['class'] });
