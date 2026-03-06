import {
  ROUTES, SHIP_TYPES, AIS_OPTIONS, INSURANCE_OPTIONS,
  RISK_LEVELS, BASE_OIL_PRICE, EVENTS, TIME_OPTIONS,
  GAME_PHASES, STARTING_CASH, FUEL_COST_PER_UNIT, WAYPOINTS
} from '../shared/constants.js';

// Generate a unique game ID
function generateGameId() {
  return Math.random().toString(36).substring(2, 8).toUpperCase();
}

class GameState {
  constructor(id, hostId) {
    this.id = id;
    this.hostId = hostId;
    this.phase = GAME_PHASES.LOBBY;
    this.round = 1;
    this.maxRounds = 10;
    this.riskLevel = 'MODERATE';
    this.oilPrice = BASE_OIL_PRICE * RISK_LEVELS.MODERATE.oilPriceMultiplier;
    this.players = {};
    this.transitLog = [];
    this.createdAt = Date.now();
  }

  addPlayer(playerId, playerName) {
    if (this.players[playerId]) return this.players[playerId];
    this.players[playerId] = {
      id: playerId,
      name: playerName,
      cash: STARTING_CASH,
      fleet: [{ ...SHIP_TYPES.SMALL_TANKER, health: 1.0, id: 'ship_0' }],
      totalProfit: 0,
      totalLosses: 0,
      successfulTransits: 0,
      failedTransits: 0,
      currentPlan: null,
      transitResult: null,
      ready: false
    };
    return this.players[playerId];
  }

  removePlayer(playerId) {
    delete this.players[playerId];
  }

  getPlayerCount() {
    return Object.keys(this.players).length;
  }

  startPlanning() {
    this.phase = GAME_PHASES.PLANNING;
    this.updateMarketConditions();
    Object.values(this.players).forEach(p => {
      p.ready = false;
      p.currentPlan = null;
      p.transitResult = null;
    });
  }

  updateMarketConditions() {
    // Randomly shift risk level with some persistence
    const levels = Object.keys(RISK_LEVELS);
    const currentIdx = levels.indexOf(this.riskLevel);
    const shift = Math.random() < 0.3 ? (Math.random() < 0.5 ? -1 : 1) : 0;
    const newIdx = Math.max(0, Math.min(levels.length - 1, currentIdx + shift));
    this.riskLevel = levels[newIdx];
    const risk = RISK_LEVELS[this.riskLevel];
    // Add some price volatility
    const volatility = 0.9 + Math.random() * 0.2;
    this.oilPrice = Math.round(BASE_OIL_PRICE * risk.oilPriceMultiplier * volatility * 100) / 100;
  }

  submitPlan(playerId, plan) {
    const player = this.players[playerId];
    if (!player) return null;

    const route = ROUTES[plan.routeId];
    const ais = AIS_OPTIONS[plan.aisId];
    const insurance = INSURANCE_OPTIONS[plan.insuranceId];
    const time = TIME_OPTIONS[plan.timeId];
    const shipId = plan.shipId;
    const ship = player.fleet.find(s => s.id === shipId);

    if (!route || !ais || !insurance || !time || !ship) return null;

    player.currentPlan = {
      route, ais, insurance, time, ship,
      routeId: plan.routeId,
      aisId: plan.aisId,
      insuranceId: plan.insuranceId,
      timeId: plan.timeId,
      shipId: plan.shipId
    };
    player.ready = true;
    return player.currentPlan;
  }

  allPlayersReady() {
    return Object.values(this.players).every(p => p.ready);
  }

  simulateTransits() {
    this.phase = GAME_PHASES.TRANSIT;
    const results = {};
    const risk = RISK_LEVELS[this.riskLevel];

    for (const player of Object.values(this.players)) {
      if (!player.currentPlan) {
        results[player.id] = { skipped: true };
        continue;
      }

      const plan = player.currentPlan;
      const result = this.simulateSingleTransit(player, plan, risk);
      player.transitResult = result;
      results[player.id] = result;
    }

    this.transitLog.push({ round: this.round, results });
    return results;
  }

  simulateSingleTransit(player, plan, risk) {
    const { route, ais, insurance, time, ship } = plan;
    const events = [];
    let totalDamage = 0;
    let totalDelay = 0;
    let totalMoneyLoss = 0;
    let seized = false;

    // Calculate cargo value
    const cargoBarrels = ship.capacity * 7.33; // DWT to barrels approximation
    const cargoValue = cargoBarrels * this.oilPrice;

    // Insurance cost
    const insuranceCost = cargoValue * insurance.costPercent;

    // Fuel cost
    const fuelCost = ship.fuelPerHour * route.timeHours * route.fuelMultiplier * FUEL_COST_PER_UNIT / 1000;

    // Simulate events along the route
    const numCheckpoints = route.waypoints.length - 1;
    for (let i = 0; i < numCheckpoints; i++) {
      for (const eventTemplate of EVENTS) {
        // Base probability modified by risk level, route, AIS, time
        let prob = eventTemplate.probability * risk.eventFrequency;
        prob *= route.riskMultiplier;
        prob *= ais.detectionMultiplier;
        prob *= time.visibilityMultiplier;

        // Ship health affects vulnerability
        prob *= (2 - ship.health);

        if (Math.random() < prob) {
          // Pick a weighted random outcome (first is most likely)
          const weights = [0.5, 0.25, 0.25];
          const roll = Math.random();
          let outcomeIdx = 0;
          let cumWeight = 0;
          for (let w = 0; w < weights.length; w++) {
            cumWeight += weights[w];
            if (roll < cumWeight) { outcomeIdx = w; break; }
          }

          const outcome = eventTemplate.outcomes[outcomeIdx];
          events.push({
            event: eventTemplate.name,
            description: eventTemplate.description,
            outcome: outcome.text,
            damagePercent: outcome.damagePercent,
            delayHours: outcome.delayHours,
            moneyLossPercent: outcome.moneyLoss,
            checkpoint: i
          });

          totalDamage += outcome.damagePercent;
          totalDelay += Math.max(0, outcome.delayHours);
          totalMoneyLoss += outcome.moneyLoss;

          // Check for seizure
          if (outcome.delayHours >= 720) {
            seized = true;
            break;
          }
        }
      }
      if (seized) break;
    }

    // Calculate final results
    totalDamage = Math.min(totalDamage, 1.0);
    totalMoneyLoss = Math.min(totalMoneyLoss, 1.0);
    const shipDestroyed = totalDamage >= 0.9;
    const shipSurvived = !shipDestroyed && !seized;

    let revenue = 0;
    let totalCost = insuranceCost + fuelCost + ais.legalPenalty;
    let insurancePayout = 0;

    if (shipSurvived) {
      // Revenue from delivering cargo (reduced by cargo loss from damage)
      revenue = cargoValue * (1 - totalMoneyLoss) * (1 - totalDamage * 0.5);
      player.successfulTransits++;
    } else {
      // Ship lost or seized
      const loss = cargoValue + ship.cost;
      insurancePayout = loss * insurance.coveragePercent;
      totalCost += loss - insurancePayout;
      player.failedTransits++;

      // Remove ship from fleet
      player.fleet = player.fleet.filter(s => s.id !== ship.id);
    }

    // Apply ship damage
    if (shipSurvived && totalDamage > 0) {
      const fleetShip = player.fleet.find(s => s.id === ship.id);
      if (fleetShip) {
        fleetShip.health = Math.max(0.1, fleetShip.health - totalDamage);
      }
    }

    const profit = revenue - totalCost;
    player.cash += profit;
    if (profit > 0) player.totalProfit += profit;
    else player.totalLosses += Math.abs(profit);

    return {
      success: shipSurvived,
      seized,
      shipDestroyed,
      events,
      cargoValue: Math.round(cargoValue),
      revenue: Math.round(revenue),
      insuranceCost: Math.round(insuranceCost),
      fuelCost: Math.round(fuelCost),
      legalPenalty: ais.legalPenalty,
      insurancePayout: Math.round(insurancePayout),
      totalCost: Math.round(totalCost),
      profit: Math.round(profit),
      totalDamage: Math.round(totalDamage * 100),
      totalDelay: Math.round(totalDelay * 10) / 10,
      route: route.name,
      shipName: ship.name
    };
  }

  buyShip(playerId, shipTypeId) {
    const player = this.players[playerId];
    const shipType = SHIP_TYPES[shipTypeId];
    if (!player || !shipType) return null;
    if (player.cash < shipType.cost) return null;

    const newShip = {
      ...shipType,
      health: 1.0,
      id: `ship_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`
    };
    player.cash -= shipType.cost;
    player.fleet.push(newShip);
    return newShip;
  }

  repairShip(playerId, shipId) {
    const player = this.players[playerId];
    if (!player) return null;
    const ship = player.fleet.find(s => s.id === shipId);
    if (!ship || ship.health >= 1.0) return null;

    const repairCost = Math.round(ship.cost * (1 - ship.health) * 0.3);
    if (player.cash < repairCost) return null;

    player.cash -= repairCost;
    ship.health = 1.0;
    return { repairCost, ship };
  }

  nextRound() {
    this.round++;
    if (this.round > this.maxRounds) {
      this.phase = GAME_PHASES.RESULTS;
      return false;
    }
    this.startPlanning();
    return true;
  }

  getLeaderboard() {
    return Object.values(this.players)
      .map(p => ({
        id: p.id,
        name: p.name,
        cash: Math.round(p.cash),
        fleetSize: p.fleet.length,
        fleetValue: p.fleet.reduce((sum, s) => sum + s.cost * s.health, 0),
        totalProfit: Math.round(p.totalProfit),
        totalLosses: Math.round(p.totalLosses),
        successfulTransits: p.successfulTransits,
        failedTransits: p.failedTransits,
        netWorth: Math.round(p.cash + p.fleet.reduce((sum, s) => sum + s.cost * s.health, 0))
      }))
      .sort((a, b) => b.netWorth - a.netWorth);
  }

  serialize() {
    return {
      id: this.id,
      phase: this.phase,
      round: this.round,
      maxRounds: this.maxRounds,
      riskLevel: this.riskLevel,
      riskInfo: RISK_LEVELS[this.riskLevel],
      oilPrice: this.oilPrice,
      players: Object.values(this.players).map(p => ({
        id: p.id,
        name: p.name,
        cash: Math.round(p.cash),
        fleet: p.fleet,
        ready: p.ready,
        successfulTransits: p.successfulTransits,
        failedTransits: p.failedTransits
      })),
      leaderboard: this.getLeaderboard()
    };
  }
}

export { GameState, generateGameId };
