import {
  SHIP_TYPES, AIS_OPTIONS, INSURANCE_OPTIONS,
  RISK_LEVELS, BASE_OIL_PRICE, TIME_OPTIONS,
  GAME_PHASES, STARTING_CASH
} from '../shared/constants.js';

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
    const levels = Object.keys(RISK_LEVELS);
    const currentIdx = levels.indexOf(this.riskLevel);
    const shift = Math.random() < 0.3 ? (Math.random() < 0.5 ? -1 : 1) : 0;
    const newIdx = Math.max(0, Math.min(levels.length - 1, currentIdx + shift));
    this.riskLevel = levels[newIdx];
    const risk = RISK_LEVELS[this.riskLevel];
    const volatility = 0.9 + Math.random() * 0.2;
    this.oilPrice = Math.round(BASE_OIL_PRICE * risk.oilPriceMultiplier * volatility * 100) / 100;
  }

  submitPlan(playerId, plan) {
    const player = this.players[playerId];
    if (!player) return null;

    const ais = AIS_OPTIONS[plan.aisId];
    const insurance = INSURANCE_OPTIONS[plan.insuranceId];
    const time = TIME_OPTIONS[plan.timeId];
    const ship = player.fleet.find(s => s.id === plan.shipId);

    if (!ais || !insurance || !time || !ship) return null;

    player.currentPlan = {
      ais, insurance, time, ship,
      aisId: plan.aisId,
      insuranceId: plan.insuranceId,
      timeId: plan.timeId,
      shipId: plan.shipId,
      playerNavigated: plan.routeId === 'PLAYER_NAVIGATED'
    };
    player.ready = true;
    return player.currentPlan;
  }

  allPlayersReady() {
    return Object.values(this.players).every(p => p.ready);
  }

  // Apply results from client-side transit simulation
  applyTransitResult(playerId, clientResult) {
    const player = this.players[playerId];
    if (!player || !player.currentPlan) return null;

    const { shipSurvived, totalDamage, profit } = clientResult;
    const ship = player.fleet.find(s => s.id === player.currentPlan.shipId);

    // Apply profit
    player.cash += profit;
    if (profit > 0) player.totalProfit += profit;
    else player.totalLosses += Math.abs(profit);

    if (shipSurvived) {
      player.successfulTransits++;
      // Apply damage to ship
      if (ship && totalDamage > 0) {
        ship.health = Math.max(0.1, ship.health - totalDamage);
      }
    } else {
      player.failedTransits++;
      // Remove destroyed/seized ship
      player.fleet = player.fleet.filter(s => s.id !== player.currentPlan.shipId);
    }

    this.phase = GAME_PHASES.REINVEST;
    return this.serialize();
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
