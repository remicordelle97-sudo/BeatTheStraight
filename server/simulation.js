// Server-side game simulation engine
// Runs ship movement, events, cargo, and NPC logic on the server
// so the game continues even when players disconnect.

import {
  SIM_CONFIG, EXPORT_TERMINALS, IMPORT_TERMINALS, OIL_TERMINALS,
  DANGER_ZONES, EVENTS, RISK_LEVELS, AIS_OPTIONS,
  MAP_BOUNDS, NPC_SHIP_TYPES, MILITARY_SHIPS,
  getTerminalPrice
} from '../shared/constants.js';
import { isOnLand, distanceDeg, headingToTarget, angleDiff, normalizeAngle, wrapLon } from '../shared/geography.js';
import { computeOceanRoute, computeAutopilotRoute } from '../shared/ocean-routing.js';

const TICK_RATE = 10;
const TICK_INTERVAL = 1000 / TICK_RATE;
const BROADCAST_RATE = 5;
const BROADCAST_INTERVAL = 1000 / BROADCAST_RATE;

const NPC_SHIP_NAMES = [
  'Pacific Voyager', 'Nordic Spirit', 'Arabian Dawn', 'Coral Enterprise',
  'Golden Phoenix', 'Silver Arrow', 'Eastern Promise', 'Western Frontier',
  'Ocean Guardian', 'Star Navigator', 'Trade Wind', 'Gulf Pioneer',
  'Jade Fortune', 'Iron Resolve', 'Crystal Tide', 'Amber Horizon',
  'Emerald Star', 'Sapphire Wave', 'Thunder Bay', 'Blue Monarch',
  'Red Falcon', 'White Lotus', 'Black Pearl', 'Green Destiny',
  'Royal Fortune', 'Diamond Head', 'Crimson Dawn', 'Arctic Fox',
  'Polar Star', 'Storm Chaser', 'Wind Rider', 'Sun Dragon',
  'Moon Shadow', 'Fire Dancer', 'Ice Queen', 'Sky Runner',
  'Deep Explorer', 'Wild Spirit', 'Brave Heart', 'Iron Eagle'
];
let npcNameIndex = 0;

class GameSimulation {
  constructor(gameId, riskLevel) {
    this.gameId = gameId;
    this.riskLevel = riskLevel || 'CRITICAL';
    this.simTime = 0;
    this.realStartTime = Date.now();
    this.lastTickTime = Date.now();
    this.shipStates = {};
    this.shipWaypoints = {};
    this.shipCargo = {};
    this.shipAutopilot = {};
    this.npcShips = [];
    this.militaryShips = [];
    this.zoneCooldowns = {};
    this.lastEventCheck = 0;
    this.aisFineCooldowns = {};
    this.recentEvents = [];
    this.tickTimer = null;
    this.broadcastTimer = null;
    this.broadcastCallback = null;
    this.spawnNPCShips();
    this.spawnMilitaryShips();
  }

  start(broadcastCallback) {
    this.broadcastCallback = broadcastCallback;
    this.lastTickTime = Date.now();
    this.tickTimer = setInterval(() => this.tick(), TICK_INTERVAL);
    this.broadcastTimer = setInterval(() => this.broadcast(), BROADCAST_INTERVAL);
    console.log('Simulation started for game ' + this.gameId);
  }

  stop() {
    if (this.tickTimer) { clearInterval(this.tickTimer); this.tickTimer = null; }
    if (this.broadcastTimer) { clearInterval(this.broadcastTimer); this.broadcastTimer = null; }
  }

  tick() {
    const now = Date.now();
    const realDt = Math.min((now - this.lastTickTime) / 1000, 0.2);
    this.lastTickTime = now;
    const dt = realDt;
    const elapsed = (now - this.realStartTime) / 1000;
    this.simTime += realDt * SIM_CONFIG.TIME_SCALE;

    for (const shipId of Object.keys(this.shipStates)) {
      try { this.updatePlayerShip(shipId, dt, elapsed); } catch(e) { console.error('Ship tick error:', e.message); }
    }
    try { this.updateNPCShips(dt, elapsed); } catch(e) { console.error('NPC tick error:', e.message); }
    try { this.updateMilitaryShips(dt); } catch(e) {}

    if (elapsed - this.lastEventCheck > SIM_CONFIG.EVENT_CHECK_INTERVAL / 1000) {
      this.lastEventCheck = elapsed;
      try { this.checkDangerZones(elapsed); } catch(e) {}
      try { this.checkAisFines(elapsed); } catch(e) {}
    }

    // Process pending actions (deliveries, destructions, fines)
    const actions = this.getPendingActions();
    if (actions.length > 0 && this.actionCallback) {
      for (const action of actions) this.actionCallback(action);
    }

    const cutoff = elapsed - 30;
    this.recentEvents = this.recentEvents.filter(e => e.time > cutoff);
  }

  broadcast() {
    if (this.broadcastCallback) this.broadcastCallback(this.getState());
  }

  spawnPlayerShip(ship, spawnLat, spawnLon) {
    const baseLat = spawnLat != null ? spawnLat : SIM_CONFIG.SPAWN_LAT;
    const baseLon = spawnLon != null ? spawnLon : SIM_CONFIG.SPAWN_LON;
    let lat = baseLat + (Math.random() - 0.5) * 0.3;
    let lon = baseLon + (Math.random() - 0.5) * 0.3;
    for (let i = 0; i < 50; i++) {
      if (!isOnLand(lat, lon)) break;
      lat = baseLat + (Math.random() - 0.5) * 0.3;
      lon = baseLon + (Math.random() - 0.5) * 0.3;
    }
    this.shipStates[ship.id] = {
      lat, lon, heading: 270, targetHeading: 270, speed: 0,
      health: ship.health || 1.0, totalDamage: 0, totalMoneyLoss: 0, totalDelay: 0,
      seized: false, destroyed: false,
      apCoastEscapeTimer: 0, apCoastEscapeHeading: 0,
      progressTimer: 0, progressLat: lat, progressLon: lon,
      shipSpeed: ship.speed, shipCapacity: ship.capacity,
      shipName: ship.name, shipCargoType: ship.cargoType || 'oil',
      aisId: ship.aisId || 'FULL_BROADCAST',
      defenseUpgrade: ship.defenseUpgrade || 0,
      hasAutopilot: ship.hasAutopilot || false
    };
    this.shipWaypoints[ship.id] = [];
    this.shipCargo[ship.id] = { loaded: false, terminal: null, terminalId: null };
    this.shipAutopilot[ship.id] = { active: false, terminal: null, dropoff: null };
  }

  // Restore a ship's simulation state (for reconnection)
  restoreShipState(shipId, savedState) {
    if (savedState) {
      this.shipStates[shipId] = savedState.state;
      this.shipWaypoints[shipId] = savedState.waypoints || [];
      this.shipCargo[shipId] = savedState.cargo || { loaded: false, terminal: null, terminalId: null };
      this.shipAutopilot[shipId] = savedState.autopilot || { active: false, terminal: null, dropoff: null };
    }
  }

  removePlayerShip(shipId) {
    delete this.shipStates[shipId];
    delete this.shipWaypoints[shipId];
    delete this.shipCargo[shipId];
    delete this.shipAutopilot[shipId];
  }

  hasShip(shipId) { return !!this.shipStates[shipId]; }

  updatePlayerShip(shipId, dt, elapsed) {
    const state = this.shipStates[shipId];
    if (!state || state.destroyed || state.seized) return;
    const ap = this.shipAutopilot[shipId];
    const apActive = ap && ap.active && state.hasAutopilot;

    // Autopilot: auto-manage waypoints
    if (apActive && ap.terminal && ap.dropoff) {
      const cargo = this.shipCargo[shipId];
      const curWps = this.shipWaypoints[shipId] || [];
      if (curWps.length === 0 && state.speed === 0) {
        const destT = (cargo && cargo.loaded) ? ap.dropoff : ap.terminal;
        if (destT && destT.lat != null) {
          const route = computeAutopilotRoute(state.lat, state.lon, destT.lat, destT.lon, destT.loadRadius || 0.15);
          this.shipWaypoints[shipId] = route;
          state.speed = Math.round(state.shipSpeed || 14);
          if (route.length > 0) state.targetHeading = headingToTarget(state.lat, state.lon, route[0].lat, route[0].lon);
        }
      }
    }

    const wps = this.shipWaypoints[shipId] || [];
    const apEscaping = apActive && state.apCoastEscapeTimer > 0;

    // Waypoint navigation
    if (wps.length > 0 && !apEscaping) {
      const wp = wps[0];
      const distToWP = distanceDeg(state.lat, state.lon, wp.lat, wp.lon);
      if (distToWP < 0.03) {
        wps.shift();
        if (wps.length > 0) state.targetHeading = headingToTarget(state.lat, state.lon, wps[0].lat, wps[0].lon);
        else state.speed = 0;
      } else {
        state.targetHeading = headingToTarget(state.lat, state.lon, wp.lat, wp.lon);
      }
    }

    // Autopilot stuck detection
    if (apActive && state.speed > 0) {
      state.progressTimer = (state.progressTimer || 0) + dt;
      if (state.progressTimer > 15) {
        const moved = distanceDeg(state.lat, state.lon, state.progressLat || state.lat, state.progressLon || state.lon);
        if (moved < 0.3) {
          const cargo = this.shipCargo[shipId];
          const destT = (cargo && cargo.loaded) ? ap.dropoff : ap.terminal;
          if (destT && destT.lat != null) {
            const route = computeAutopilotRoute(state.lat, state.lon, destT.lat, destT.lon, destT.loadRadius || 0.15);
            this.shipWaypoints[shipId] = route;
            state.apCoastEscapeTimer = 0;
            if (route.length > 0) state.targetHeading = headingToTarget(state.lat, state.lon, route[0].lat, route[0].lon);
          }
        }
        state.progressTimer = 0; state.progressLat = state.lat; state.progressLon = state.lon;
      }
    }

    // Autopilot land avoidance
    if (apActive && state.speed > 0) {
      const hasRouteWps = (this.shipWaypoints[shipId] || []).length > 0;
      if (state.apCoastEscapeTimer > 0) {
        state.apCoastEscapeTimer -= dt;
        const diff = angleDiff(state.heading, state.apCoastEscapeHeading);
        if (Math.abs(diff) > 0.5) state.heading = normalizeAngle(state.heading + Math.sign(diff) * Math.min(Math.abs(diff), 2.5 * dt * 60));
        state.targetHeading = state.apCoastEscapeHeading;
        if (state.apCoastEscapeTimer <= 0) {
          const wps2 = this.shipWaypoints[shipId] || [];
          const resumeHeading = wps2.length > 0 ? headingToTarget(state.lat, state.lon, wps2[0].lat, wps2[0].lon) : state.targetHeading;
          const resumeRad = resumeHeading * Math.PI / 180;
          const recheckDist = hasRouteWps ? 0.2 : 0.5;
          if (isOnLand(state.lat + Math.cos(resumeRad) * recheckDist, state.lon + Math.sin(resumeRad) * recheckDist)) {
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
    const nextWpDest = (this.shipWaypoints[shipId] || [])[0];
    const wpDestR = (nextWpDest && nextWpDest.loadRadius) ? Math.max(0.5, nextWpDest.loadRadius * 4) : 0.5;
    const nearWpDest = nextWpDest && distanceDeg(state.lat, state.lon, nextWpDest.lat, nextWpDest.lon) < wpDestR;

    if (!isOnLand(newLat, newLon) || nearWpDest) {
      state.lon = newLon; state.lat = newLat;
    } else if (apActive) {
      const probeDist = 0.08;
      let escaped = false;
      for (const angle of [90, -90, 120, -120, 150, -150, 180]) {
        const th = normalizeAngle(state.heading + angle);
        const tr = th * Math.PI / 180;
        if (!isOnLand(state.lat + Math.cos(tr) * probeDist, state.lon + Math.sin(tr) * probeDist)) {
          state.heading = th; state.lon += Math.sin(tr) * probeDist * 0.6; state.lat += Math.cos(tr) * probeDist * 0.6;
          state.apCoastEscapeHeading = th; state.apCoastEscapeTimer = 4 + Math.random() * 3; state.targetHeading = th;
          escaped = true; break;
        }
      }
      if (!escaped) {
        state.heading = normalizeAngle(state.heading + 180);
        const rr = state.heading * Math.PI / 180;
        state.lon += Math.sin(rr) * probeDist * 0.6; state.lat += Math.cos(rr) * probeDist * 0.6;
        state.apCoastEscapeHeading = state.heading; state.apCoastEscapeTimer = 5;
      }
    } else {
      state.speed = Math.max(0, Math.round(state.speed * 0.5));
      this.shipWaypoints[shipId] = [];
    }

    state.lat = Math.max(MAP_BOUNDS.south + 0.5, Math.min(MAP_BOUNDS.north - 0.5, state.lat));
    state.lon = wrapLon(state.lon);

    // Overspeed malfunction
    const ratedSpeed = state.shipSpeed || 16;
    if (state.speed > ratedSpeed && !state.destroyed && !state.seized) {
      const overRatio = (state.speed - ratedSpeed) / (20 - ratedSpeed || 1);
      const malfunctionProb = 0.0005 + overRatio * 0.003;
      if (Math.random() < malfunctionProb * dt * 60) {
        const roll = Math.random();
        if (roll < 0.4) { state.speed = Math.round(ratedSpeed * 0.5); this.addEvent(elapsed, 'ENGINE MALFUNCTION', state.shipName + ': Engine stall!', 'danger'); }
        else if (roll < 0.75) { const dmg = 0.03 + overRatio * 0.07; state.totalDamage = Math.min(0.89, state.totalDamage + dmg); state.speed = Math.round(Math.min(state.speed, ratedSpeed)); this.addEvent(elapsed, 'MECHANICAL FAILURE', state.shipName + ': Hull stress!', 'danger'); }
        else { state.speed = 0; this.addEvent(elapsed, 'FUEL SYSTEM FAILURE', state.shipName + ': Engines offline!', 'danger'); }
      }
    }

    // Cargo loading at EXPORT terminals
    const cargo = this.shipCargo[shipId];
    if (cargo && !cargo.loaded) {
      for (const terminal of Object.values(EXPORT_TERMINALS)) {
        if ((terminal.cargoType || 'oil') !== state.shipCargoType) continue;
        const dist = distanceDeg(state.lat, state.lon, terminal.lat, terminal.lon);
        if (dist < (terminal.loadRadius || SIM_CONFIG.LOAD_RADIUS)) {
          const npcTraffic = this.computeNpcTraffic();
          const buyPrice = getTerminalPrice(terminal, this.riskLevel, npcTraffic);
          cargo.loaded = true; cargo.terminal = terminal; cargo.terminalId = terminal.id;
          cargo.buyCost = Math.round(state.shipCapacity * buyPrice);
          this.addEvent(elapsed, 'CARGO LOADED', state.shipName + ': Loaded at ' + terminal.name, 'success');
          break;
        }
      }
    }

    // Cargo delivery at IMPORT terminals
    if (cargo && cargo.loaded && !cargo.delivered) {
      for (const dp of Object.values(IMPORT_TERMINALS)) {
        const dropDist = distanceDeg(state.lat, state.lon, dp.lat, dp.lon);
        if (dropDist < (dp.loadRadius || 0.3)) {
          const isLng = state.shipCargoType === 'lng';
          const npcTraffic = this.computeNpcTraffic();
          const sellPrice = isLng ? (dp.lngSellPrice || dp.sellPrice || 85) : getTerminalPrice(dp, this.riskLevel, npcTraffic);
          const grossRevenue = Math.round(state.shipCapacity * sellPrice * (1 - state.totalDamage));
          const profit = grossRevenue - (cargo.buyCost || 0);
          state._pendingDelivery = { shipId, revenue: profit, terminalName: dp.name, grossRevenue };
          this.shipCargo[shipId] = { loaded: false, terminal: null, terminalId: null };
          this.addEvent(elapsed, 'CARGO DELIVERED', state.shipName + ': Profit at ' + dp.name, 'success');
          break;
        }
      }
    }

    // Destruction check
    if (state.totalDamage >= 0.9 && !state.destroyed) {
      state.destroyed = true;
      state._pendingDestruction = { shipId };
      this.addEvent(elapsed, 'VESSEL DESTROYED', state.shipName + ' destroyed!', 'danger');
    }
  }

  computeNpcTraffic() {
    const traffic = {};
    for (const t of Object.values(OIL_TERMINALS)) traffic[t.id] = 0;
    for (const npc of this.npcShips) {
      if (npc.targetTerminal) traffic[npc.targetTerminal.id] = (traffic[npc.targetTerminal.id] || 0) + 1;
      if (npc.dropoff) traffic[npc.dropoff.id] = (traffic[npc.dropoff.id] || 0) + 1;
    }
    return traffic;
  }

  checkDangerZones(elapsed) {
    const risk = RISK_LEVELS[this.riskLevel] || RISK_LEVELS.LOW;
    for (const shipId of Object.keys(this.shipStates)) {
      const state = this.shipStates[shipId];
      if (!state || state.destroyed || state.seized) continue;
      const ais = AIS_OPTIONS[state.aisId] || { detectionMultiplier: 1.0 };
      const defLevel = state.defenseUpgrade || 0;
      for (const zone of DANGER_ZONES) {
        if (state.lat < zone.bounds.south || state.lat > zone.bounds.north) continue;
        if (state.lon < zone.bounds.west || state.lon > zone.bounds.east) continue;
        const cooldownKey = shipId + '_' + zone.id;
        if ((this.zoneCooldowns[cooldownKey] || 0) > elapsed - SIM_CONFIG.EVENT_COOLDOWN / 1000) continue;
        const defReduction = 1 - defLevel * 0.2;
        const nightMult = this.getNightMult(state.lon);
        let prob = zone.baseProbability * risk.eventFrequency * ais.detectionMultiplier * (2 - (state.health - state.totalDamage)) * defReduction * nightMult;
        if (Math.random() < prob) {
          const eventId = zone.events[Math.floor(Math.random() * zone.events.length)];
          const evt = EVENTS.find(e => e.id === eventId);
          if (!evt) continue;
          const roll = Math.random();
          let oi = 0, cw = 0;
          for (let w = 0; w < 3; w++) { cw += [0.5, 0.25, 0.25][w]; if (roll < cw) { oi = w; break; } }
          const outcome = evt.outcomes[oi];
          this.zoneCooldowns[cooldownKey] = elapsed;
          const isMissile = ['houthi_missile', 'houthi_drone', 'missile_alert', 'drone_swarm'].includes(eventId);
          const damageReduction = 1 - defLevel * 0.15;
          if (!isMissile) {
            state.totalDamage += outcome.damagePercent * damageReduction;
            state.totalDelay += Math.max(0, outcome.delayHours);
            state.totalMoneyLoss += outcome.moneyLoss;
            if (outcome.delayHours >= 720) state.seized = true;
            if (outcome.damagePercent > 0.1) state.speed = Math.round(Math.max(5, state.shipSpeed * (1 - state.totalDamage * 0.5)));
          } else {
            if (Math.random() < 0.6) {
              const intensity = 0.3 + Math.random() * 0.7;
              const dmg = outcome.damagePercent * intensity * damageReduction;
              state.totalDamage = Math.min(0.95, state.totalDamage + dmg);
              if (dmg > 0.05) state.speed = Math.round(Math.max(5, state.shipSpeed * (1 - state.totalDamage * 0.5)));
            }
          }
          let extra = '';
          if (outcome.damagePercent > 0) extra += ' [Dmg: ' + Math.round(outcome.damagePercent * 100) + '%]';
          this.addEvent(elapsed, state.shipName + ': ' + evt.name, outcome.text + extra, outcome.damagePercent > 0 ? 'danger' : '');
        }
      }
    }
  }

  checkAisFines(elapsed) {
    for (const shipId of Object.keys(this.shipStates)) {
      const state = this.shipStates[shipId];
      if (!state || state.destroyed || state.seized) continue;
      if (state.aisId === 'FULL_BROADCAST') continue;
      const lastCheck = this.aisFineCooldowns[shipId] || 0;
      if (elapsed - lastCheck < 60) continue;
      this.aisFineCooldowns[shipId] = elapsed;
      if (Math.random() < 0.05) {
        const ais = AIS_OPTIONS[state.aisId];
        const fine = ais?.legalPenalty || 50000;
        state._pendingFine = { shipId, amount: fine };
        this.addEvent(elapsed, 'AIS VIOLATION', state.shipName + ': Fined for AIS violation', 'danger');
      }
    }
  }

  getNightMult(lon) {
    const h = (this.simTime % (24 * 3600)) / 3600;
    let sunLon = 180 - h * 15;
    while (sunLon > 180) sunLon -= 360;
    while (sunLon < -180) sunLon += 360;
    let diff = lon - sunLon;
    if (diff > 180) diff -= 360;
    if (diff < -180) diff += 360;
    const absDiff = Math.abs(diff);
    let daylight;
    if (absDiff <= 75) daylight = 1.0;
    else if (absDiff >= 105) daylight = 0.0;
    else daylight = 1.0 - (absDiff - 75) / 30;
    return 0.4 + 0.6 * daylight;
  }

  // NPC Ships
  spawnNPCShips() {
    this.npcShips = [];
    for (let i = 0; i < SIM_CONFIG.NPC_COUNT; i++) this.npcShips.push(this.createNPC(true));
  }

  createNPC(staggered) {
    const type = NPC_SHIP_TYPES[Math.floor(Math.random() * NPC_SHIP_TYPES.length)];
    const speed = type.speed + (Math.random() - 0.5) * 2;
    const shipName = NPC_SHIP_NAMES[npcNameIndex++ % NPC_SHIP_NAMES.length];
    const exportTerminals = Object.values(EXPORT_TERMINALS);
    const importTerminals = Object.values(IMPORT_TERMINALS);
    const terminal = exportTerminals[Math.floor(Math.random() * exportTerminals.length)];
    const dropoff = importTerminals[Math.floor(Math.random() * importTerminals.length)];
    let lat, lon;
    if (staggered) {
      const allT = [...exportTerminals, ...importTerminals];
      const t = allT[Math.floor(Math.random() * allT.length)];
      lat = t.lat + (Math.random() - 0.5) * 10; lon = t.lon + (Math.random() - 0.5) * 10;
      for (let i = 0; i < 20; i++) { if (!isOnLand(lat, lon)) break; lat = t.lat + (Math.random() - 0.5) * 10; lon = t.lon + (Math.random() - 0.5) * 10; }
    } else {
      lat = terminal.lat + (Math.random() - 0.5) * 2; lon = terminal.lon + (Math.random() - 0.5) * 2;
      for (let i = 0; i < 20; i++) { if (!isOnLand(lat, lon)) break; lat = terminal.lat + (Math.random() - 0.5) * 2; lon = terminal.lon + (Math.random() - 0.5) * 2; }
    }
    const route = computeOceanRoute(lat, lon, terminal.lat, terminal.lon);
    return {
      lat, lon, heading: Math.random() * 360, targetHeading: Math.random() * 360,
      speed, baseSpeed: speed, typeName: type.name, shipName, cargoType: type.cargoType || 'oil',
      targetTerminal: terminal, dropoff, state: 'heading_to_terminal',
      caution: Math.random(), loadTimer: 0, route, routeIdx: 0,
      totalDamage: 0, stuckCount: 0, progressTimer: 0, progressLat: lat, progressLon: lon,
      coastEscapeTimer: 0, coastEscapeHeading: 0
    };
  }

  updateNPCShips(dt, elapsed) {
    for (let i = 0; i < this.npcShips.length; i++) {
      const npc = this.npcShips[i];
      if (npc.state === 'loading' || npc.state === 'unloading') {
        npc.loadTimer -= dt; npc.speed = 0;
        if (npc.loadTimer <= 0) {
          if (npc.state === 'loading') {
            const imp = Object.values(IMPORT_TERMINALS);
            npc.dropoff = imp[Math.floor(Math.random() * imp.length)];
            npc.state = 'heading_to_dropoff';
            npc.route = computeOceanRoute(npc.lat, npc.lon, npc.dropoff.lat, npc.dropoff.lon);
          } else {
            const exp = Object.values(EXPORT_TERMINALS);
            npc.targetTerminal = exp[Math.floor(Math.random() * exp.length)];
            npc.state = 'heading_to_terminal';
            npc.route = computeOceanRoute(npc.lat, npc.lon, npc.targetTerminal.lat, npc.targetTerminal.lon);
          }
          npc.routeIdx = 0; npc.speed = npc.baseSpeed;
        }
        continue;
      }
      if (npc.state === 'waiting_safe') {
        npc.loadTimer = (npc.loadTimer || 0) - dt;
        if (npc.loadTimer <= 0) {
          npc.state = 'heading_to_terminal';
          npc.route = computeOceanRoute(npc.lat, npc.lon, npc.targetTerminal.lat, npc.targetTerminal.lon);
          npc.routeIdx = 0; npc.speed = npc.baseSpeed;
        }
      }
      if (npc.state === 'heading_to_terminal' || npc.state === 'heading_to_dropoff') {
        const dest = npc.state === 'heading_to_terminal' ? npc.targetTerminal : npc.dropoff;
        if (!dest) continue;
        const distToDest = distanceDeg(npc.lat, npc.lon, dest.lat, dest.lon);
        if (distToDest < (dest.loadRadius || 0.3)) {
          npc.state = npc.state === 'heading_to_terminal' ? 'loading' : 'unloading';
          npc.loadTimer = npc.state === 'loading' ? 15 + Math.random() * 25 : 8 + Math.random() * 12;
          npc.speed = 0; continue;
        }
        if (npc.route && npc.routeIdx < npc.route.length) {
          const wp = npc.route[npc.routeIdx];
          if (distanceDeg(npc.lat, npc.lon, wp.lat, wp.lon) < 1.5) npc.routeIdx++;
          if (npc.routeIdx < npc.route.length) npc.targetHeading = headingToTarget(npc.lat, npc.lon, npc.route[npc.routeIdx].lat, npc.route[npc.routeIdx].lon);
          else npc.targetHeading = headingToTarget(npc.lat, npc.lon, dest.lat, dest.lon);
        } else {
          npc.targetHeading = headingToTarget(npc.lat, npc.lon, dest.lat, dest.lon);
        }
        npc.progressTimer = (npc.progressTimer || 0) + dt;
        if (npc.progressTimer > 15) {
          const moved = distanceDeg(npc.lat, npc.lon, npc.progressLat || npc.lat, npc.progressLon || npc.lon);
          if (moved < 0.3 && npc.speed > 0) { npc.route = computeOceanRoute(npc.lat, npc.lon, dest.lat, dest.lon); npc.routeIdx = 0; npc.coastEscapeTimer = 0; }
          npc.progressTimer = 0; npc.progressLat = npc.lat; npc.progressLon = npc.lon;
        }
      }
      if (npc.coastEscapeTimer > 0) {
        npc.coastEscapeTimer -= dt;
        const diff = angleDiff(npc.heading, npc.coastEscapeHeading);
        if (Math.abs(diff) > 0.5) npc.heading = normalizeAngle(npc.heading + Math.sign(diff) * Math.min(Math.abs(diff), 2.5 * dt * 60));
        npc.targetHeading = npc.coastEscapeHeading;
      }
      const hd = angleDiff(npc.heading, npc.targetHeading);
      if (Math.abs(hd) > 0.5) npc.heading = normalizeAngle(npc.heading + Math.sign(hd) * Math.min(Math.abs(hd), SIM_CONFIG.TURN_RATE * dt * 60));
      const spd = (npc.speed || 0) * SIM_CONFIG.KNOTS_TO_DEG_PER_SEC;
      const hr = npc.heading * Math.PI / 180;
      const newLon = npc.lon + Math.sin(hr) * spd * dt;
      const newLat = npc.lat + Math.cos(hr) * spd * dt;
      const dest = npc.state === 'heading_to_terminal' ? npc.targetTerminal : npc.dropoff;
      const nearDest = dest && distanceDeg(npc.lat, npc.lon, dest.lat, dest.lon) < (dest.loadRadius || 0.3) * 3;
      if (!isOnLand(newLat, newLon) || nearDest) {
        npc.lon = newLon; npc.lat = newLat; npc.stuckCount = 0;
        if (!nearDest && npc.coastEscapeTimer <= 0) {
          for (const la of [0.1, 0.2, 0.35, 0.5]) {
            if (isOnLand(npc.lat + Math.cos(hr) * la, npc.lon + Math.sin(hr) * la)) {
              for (const angle of [45, -45, 70, -70, 90, -90, 120, -120]) {
                const tryRad = normalizeAngle(npc.heading + angle) * Math.PI / 180;
                if (!isOnLand(npc.lat + Math.cos(tryRad) * 0.5, npc.lon + Math.sin(tryRad) * 0.5)) {
                  npc.coastEscapeHeading = normalizeAngle(npc.heading + angle);
                  npc.coastEscapeTimer = 5 + Math.random() * 4; break;
                }
              }
              break;
            }
          }
        }
      } else {
        npc.stuckCount = (npc.stuckCount || 0) + 1;
        for (const angle of [90, -90, 120, -120, 150, -150, 180]) {
          const tryRad = normalizeAngle(npc.heading + angle) * Math.PI / 180;
          if (!isOnLand(npc.lat + Math.cos(tryRad) * 0.06, npc.lon + Math.sin(tryRad) * 0.06)) {
            npc.heading = normalizeAngle(npc.heading + angle);
            npc.lon += Math.sin(tryRad) * 0.06; npc.lat += Math.cos(tryRad) * 0.06;
            npc.coastEscapeHeading = npc.heading; npc.coastEscapeTimer = 6 + Math.random() * 4; break;
          }
        }
        if (npc.stuckCount > 30) this.npcShips[i] = this.createNPC(false);
      }
      npc.lat = Math.max(MAP_BOUNDS.south + 0.5, Math.min(MAP_BOUNDS.north - 0.5, npc.lat));
      npc.lon = wrapLon(npc.lon);
    }
  }

  spawnMilitaryShips() {
    this.militaryShips = [];
    if (!MILITARY_SHIPS) return;
    for (const ms of Object.values(MILITARY_SHIPS)) {
      this.militaryShips.push({
        ...ms, lat: ms.patrolCenter?.lat || 26.5, lon: ms.patrolCenter?.lon || 56.0,
        heading: Math.random() * 360, targetHeading: Math.random() * 360,
        speed: 0, state: 'idle', idleTimer: 60 + Math.random() * 60, moveDest: null, baseSpeed: ms.speed || 20
      });
    }
  }

  updateMilitaryShips(dt) {
    for (const mil of this.militaryShips) {
      if (mil.state === 'idle') {
        mil.speed = 0; mil.idleTimer -= dt;
        if (mil.idleTimer <= 0) {
          const b = mil.patrolBounds || { north: 27, south: 26, east: 57, west: 55 };
          mil.moveDest = { lat: mil.lat + (Math.random() - 0.5) * (b.north - b.south) * 0.6, lon: mil.lon + (Math.random() - 0.5) * (b.east - b.west) * 0.6 };
          mil.state = 'moving'; mil.speed = mil.baseSpeed * (0.3 + Math.random() * 0.3);
        }
      } else if (mil.state === 'moving') {
        if (!mil.moveDest) { mil.state = 'idle'; mil.idleTimer = 60; continue; }
        if (distanceDeg(mil.lat, mil.lon, mil.moveDest.lat, mil.moveDest.lon) < 0.02) { mil.state = 'idle'; mil.idleTimer = 150 + Math.random() * 60; mil.speed = 0; continue; }
        mil.targetHeading = headingToTarget(mil.lat, mil.lon, mil.moveDest.lat, mil.moveDest.lon);
      }
      const hd = angleDiff(mil.heading, mil.targetHeading);
      if (Math.abs(hd) > 0.5) mil.heading = normalizeAngle(mil.heading + Math.sign(hd) * Math.min(Math.abs(hd), SIM_CONFIG.TURN_RATE * dt * 60));
      const spd = (mil.speed || 0) * SIM_CONFIG.KNOTS_TO_DEG_PER_SEC;
      const hr = mil.heading * Math.PI / 180;
      const nl = mil.lon + Math.sin(hr) * spd * dt;
      const na = mil.lat + Math.cos(hr) * spd * dt;
      if (!isOnLand(na, nl)) { mil.lon = nl; mil.lat = na; }
    }
  }

  addEvent(time, name, text, type) {
    this.recentEvents.push({ time, name, text, type: type || '' });
  }

  // Player commands
  setWaypoints(shipId, waypoints) {
    if (!this.shipStates[shipId]) return false;
    this.shipWaypoints[shipId] = waypoints || [];
    if (waypoints && waypoints.length > 0) {
      const state = this.shipStates[shipId];
      state.targetHeading = headingToTarget(state.lat, state.lon, waypoints[0].lat, waypoints[0].lon);
    }
    return true;
  }

  setSpeed(shipId, speed) {
    if (!this.shipStates[shipId]) return false;
    this.shipStates[shipId].speed = Math.max(0, Math.min(25, speed));
    return true;
  }

  setAutopilot(shipId, active, terminal, dropoff) {
    if (!this.shipStates[shipId]) return false;
    this.shipAutopilot[shipId] = { active, terminal: terminal || null, dropoff: dropoff || null };
    return true;
  }

  getState() {
    return {
      simTime: this.simTime,
      shipStates: this.shipStates,
      shipWaypoints: this.shipWaypoints,
      shipCargo: this.shipCargo,
      shipAutopilot: this.shipAutopilot,
      npcShips: this.npcShips.map(n => ({
        lat: n.lat, lon: n.lon, heading: n.heading, speed: n.speed,
        typeName: n.typeName, shipName: n.shipName, state: n.state,
        totalDamage: n.totalDamage, cargoType: n.cargoType
      })),
      militaryShips: this.militaryShips.map(m => ({
        lat: m.lat, lon: m.lon, heading: m.heading, speed: m.speed,
        name: m.name, type: m.type, country: m.country,
        dangerRadius: m.dangerRadius, state: m.state
      })),
      recentEvents: this.recentEvents
    };
  }

  getPendingActions() {
    const actions = [];
    for (const [shipId, state] of Object.entries(this.shipStates)) {
      if (state._pendingDelivery) { actions.push({ type: 'delivery', ...state._pendingDelivery }); delete state._pendingDelivery; }
      if (state._pendingDestruction) { actions.push({ type: 'destruction', ...state._pendingDestruction }); delete state._pendingDestruction; }
      if (state._pendingFine) { actions.push({ type: 'ais_fine', ...state._pendingFine }); delete state._pendingFine; }
    }
    return actions;
  }
}

export { GameSimulation, TICK_RATE, BROADCAST_RATE };
