import express from 'express';
import { createServer } from 'http';
import { Server } from 'socket.io';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { GameState, generateGameId } from './game.js';
import {
  SHIP_TYPES, AIS_OPTIONS, INSURANCE_OPTIONS,
  TIME_OPTIONS, GAME_PHASES, OIL_TERMINALS
} from '../shared/constants.js';
import { register, login, getProfile, verifyToken, savePlayerState } from './auth.js';
import { stmts } from './db.js';
import { GameSimulation } from './simulation.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const app = express();
const httpServer = createServer(app);
const io = new Server(httpServer, {
  cors: { origin: '*' }
});

// JSON body parsing for REST auth endpoints
app.use(express.json());

// REST auth endpoints
app.post('/api/register', async (req, res) => {
  const { username, password } = req.body;
  const result = await register(username, password);
  res.json(result);
});

app.post('/api/login', async (req, res) => {
  const { username, password } = req.body;
  const result = await login(username, password);
  res.json(result);
});

app.get('/api/profile', (req, res) => {
  const auth = req.headers.authorization;
  if (!auth || !auth.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'No token' });
  }
  const decoded = verifyToken(auth.slice(7));
  if (!decoded) return res.status(401).json({ error: 'Invalid token' });
  const profile = getProfile(decoded.userId);
  if (!profile) return res.status(404).json({ error: 'User not found' });
  res.json(profile);
});

app.get('/api/leaderboard', (req, res) => {
  const period = req.query.period; // 'week', 'month', 'year', or omitted for all-time
  if (period === 'week' || period === 'month' || period === 'year') {
    const offsets = { week: '-7 days', month: '-1 month', year: '-1 year' };
    const since = new Date(Date.now());
    if (period === 'week') since.setDate(since.getDate() - 7);
    else if (period === 'month') since.setMonth(since.getMonth() - 1);
    else since.setFullYear(since.getFullYear() - 1);
    const rows = stmts.getLeaderboardSince.all(since.toISOString());
    res.json(rows);
  } else {
    const rows = stmts.getLeaderboard.all();
    res.json(rows);
  }
});

// Serve built static files
app.use(express.static(join(__dirname, '..', 'dist')));
app.get('*', (req, res, next) => {
  if (req.path.startsWith('/socket.io')) return next();
  res.sendFile(join(__dirname, '..', 'dist', 'index.html'));
});

const games = new Map();
const gameSims = new Map(); // gameId -> GameSimulation
const socketMap = new Map(); // socket.id -> { gameId, playerName, dbUserId }
const userSockets = new Map(); // dbUserId -> socket.id (enforces single active session per user)

// Process simulation actions (deliveries, destructions, fines) for a game
function processSimActions(gameId) {
  const sim = gameSims.get(gameId);
  const game = games.get(gameId);
  if (!sim || !game) return;

  const actions = sim.getPendingActions();
  for (const action of actions) {
    // Find which player owns this ship
    let ownerSocketId = null;
    let ownerPlayer = null;
    for (const [pid, p] of Object.entries(game.players)) {
      if (p.fleet.some(s => s.id === action.shipId)) {
        ownerSocketId = pid;
        ownerPlayer = p;
        break;
      }
    }
    if (!ownerPlayer) continue;
    const info = socketMap.get(ownerSocketId);

    if (action.type === 'delivery') {
      ownerPlayer.cash = (ownerPlayer.cash || 0) + (action.revenue || 0);
      if (action.revenue > 0) ownerPlayer.totalProfit = (ownerPlayer.totalProfit || 0) + action.revenue;
      ownerPlayer.successfulTransits = (ownerPlayer.successfulTransits || 0) + 1;
      if (info?.dbUserId) {
        try { savePlayerState(info.dbUserId, ownerPlayer); } catch {}
        if (action.revenue > 0) { try { stmts.logProfit.run(info.dbUserId, action.revenue); } catch {} }
      }
    } else if (action.type === 'destruction') {
      const ship = ownerPlayer.fleet.find(s => s.id === action.shipId);
      let insurancePayout = 0;
      if (ship) {
        const ins = INSURANCE_OPTIONS[ship.insuranceId];
        if (ins && ins.coveragePercent > 0 && ship.insuranceWeeksRemaining > 0) {
          insurancePayout = Math.round((ship.totalInvested || ship.cost) * ins.coveragePercent);
          ownerPlayer.cash += insurancePayout;
        }
        ownerPlayer.fleet = ownerPlayer.fleet.filter(s => s.id !== action.shipId);
      }
      ownerPlayer.failedTransits = (ownerPlayer.failedTransits || 0) + 1;
      sim.removePlayerShip(action.shipId);
      if (info?.dbUserId) { try { savePlayerState(info.dbUserId, ownerPlayer); } catch {} }
      // Notify connected client
      const sock = io.sockets.sockets.get(ownerSocketId);
      if (sock) sock.emit('ship_destroyed_notify', { shipId: action.shipId, insurancePayout });
    } else if (action.type === 'ais_fine') {
      ownerPlayer.cash = (ownerPlayer.cash || 0) - (action.amount || 0);
      ownerPlayer.totalLosses = (ownerPlayer.totalLosses || 0) + (action.amount || 0);
      if (info?.dbUserId) { try { savePlayerState(info.dbUserId, ownerPlayer); } catch {} }
    }
  }
}

// Force-logout any existing session for this user, returns true if an old session was kicked
function cleanupPlayerGame(socketId) {
  const info = socketMap.get(socketId);
  if (!info) return;
  const game = games.get(info.gameId);
  if (!game) return;
  game.removePlayer(socketId);
  if (game.getPlayerCount() === 0) {
    const sim = gameSims.get(info.gameId);
    if (sim) { sim.stop(); gameSims.delete(info.gameId); }
    games.delete(info.gameId);
    console.log(`Game ${info.gameId} deleted (player left)`);
  } else if (game.hostId === socketId) {
    game.hostId = Object.keys(game.players)[0];
  }
  socketMap.delete(socketId);
}

function enforceOneSession(userId, newSocket) {
  const oldSocketId = userSockets.get(userId);
  if (oldSocketId && oldSocketId !== newSocket.id) {
    const oldSocket = io.sockets.sockets.get(oldSocketId);
    if (oldSocket) {
      oldSocket.emit('force_logout', { reason: 'Logged in from another device' });
      persistPlayer(oldSocketId);
      oldSocket.disconnect(true);
    }
    // Immediately clean up the old game/sim — don't wait 60s
    cleanupPlayerGame(oldSocketId);
  }
  userSockets.set(userId, newSocket.id);
}

// Helper: persist player state to DB if they're logged in
function persistPlayer(socketId) {
  const info = socketMap.get(socketId);
  if (!info || !info.dbUserId) return;
  const game = games.get(info.gameId);
  if (!game) return;
  const player = game.players[socketId];
  if (!player) return;
  try {
    savePlayerState(info.dbUserId, player);
  } catch (e) {
    console.error('Failed to persist player state:', e.message);
  }
}

io.on('connection', (socket) => {
  console.log(`Player connected: ${socket.id}`);

  // Authenticate socket with JWT token
  socket.on('auth', ({ token }, callback) => {
    const decoded = verifyToken(token);
    if (!decoded) {
      callback?.({ success: false, error: 'Invalid token' });
      return;
    }
    const profile = getProfile(decoded.userId);
    if (!profile) {
      callback?.({ success: false, error: 'User not found' });
      return;
    }
    // Enforce single active session per user
    enforceOneSession(decoded.userId, socket);
    // Store dbUserId on the socket's info
    const existing = socketMap.get(socket.id);
    if (existing) {
      existing.dbUserId = decoded.userId;
    }
    socket.dbUserId = decoded.userId;
    callback?.({ success: true, user: profile });
  });

  socket.on('create_game', ({ playerName, token }, callback) => {
    const gameId = generateGameId();
    const game = new GameState(gameId, socket.id);

    // If authenticated, load persistent fleet/cash
    let dbUserId = null;
    if (token) {
      const decoded = verifyToken(token);
      if (decoded) {
        dbUserId = decoded.userId;
        enforceOneSession(dbUserId, socket);
        const profile = getProfile(decoded.userId);
        if (profile) {
          playerName = profile.username;
          const player = game.addPlayer(socket.id, playerName);
          player.cash = profile.cash;
          player.fleet = profile.fleet;
          player.totalProfit = profile.totalProfit;
          player.totalLosses = profile.totalLosses;
          player.successfulTransits = profile.successfulTransits;
          player.failedTransits = profile.failedTransits;
        } else {
          game.addPlayer(socket.id, playerName);
        }
      } else {
        game.addPlayer(socket.id, playerName);
      }
    } else {
      game.addPlayer(socket.id, playerName);
    }

    games.set(gameId, game);
    socketMap.set(socket.id, { gameId, playerName, dbUserId });
    socket.join(gameId);

    callback({ success: true, gameId, game: game.serialize() });
    console.log(`Game ${gameId} created by ${playerName}`);
  });

  socket.on('join_game', ({ gameId, playerName, token }, callback) => {
    const game = games.get(gameId.toUpperCase());
    if (!game) {
      callback({ success: false, error: 'Game not found' });
      return;
    }
    if (game.phase !== GAME_PHASES.LOBBY) {
      callback({ success: false, error: 'Game already in progress' });
      return;
    }

    let dbUserId = null;
    if (token) {
      const decoded = verifyToken(token);
      if (decoded) {
        dbUserId = decoded.userId;
        enforceOneSession(dbUserId, socket);
        const profile = getProfile(decoded.userId);
        if (profile) {
          playerName = profile.username;
          const player = game.addPlayer(socket.id, playerName);
          player.cash = profile.cash;
          player.fleet = profile.fleet;
          player.totalProfit = profile.totalProfit;
          player.totalLosses = profile.totalLosses;
          player.successfulTransits = profile.successfulTransits;
          player.failedTransits = profile.failedTransits;
        } else {
          game.addPlayer(socket.id, playerName);
        }
      } else {
        game.addPlayer(socket.id, playerName);
      }
    } else {
      game.addPlayer(socket.id, playerName);
    }

    socketMap.set(socket.id, { gameId: game.id, playerName, dbUserId });
    socket.join(game.id);

    io.to(game.id).emit('game_update', game.serialize());
    callback({ success: true, gameId: game.id, game: game.serialize() });
    console.log(`${playerName} joined game ${game.id}`);
  });

  socket.on('start_game', (_, callback) => {
    const info = socketMap.get(socket.id);
    if (!info) { callback?.({ success: false, error: 'Not in a game' }); return; }
    const game = games.get(info.gameId);
    if (!game || game.hostId !== socket.id) {
      callback?.({ success: false, error: 'Only host can start' });
      return;
    }

    game.startPlanning();

    // Create and start server-side simulation
    const sim = new GameSimulation(game.id, game.riskLevel);
    gameSims.set(game.id, sim);

    // Spawn all players' fleet ships into the simulation
    for (const [pid, player] of Object.entries(game.players)) {
      for (const ship of player.fleet) {
        sim.spawnPlayerShip(ship);
      }
    }

    // Set action callback to process deliveries/destructions/fines
    sim.actionCallback = () => processSimActions(game.id);

    // Start simulation with broadcast callback
    sim.start((simState) => {
      processSimActions(game.id);
      io.to(game.id).emit('sim_state', simState);
    });

    io.to(game.id).emit('game_update', game.serialize());
    io.to(game.id).emit('phase_change', { phase: GAME_PHASES.PLANNING });
    callback?.({ success: true });
    console.log(`Game ${game.id} started with server simulation`);
  });

  socket.on('submit_plan', (plan, callback) => {
    const info = socketMap.get(socket.id);
    if (!info) { callback?.({ success: false, error: 'Not in a game' }); return; }
    const game = games.get(info.gameId);
    if (!game || game.phase !== GAME_PHASES.PLANNING) {
      callback?.({ success: false, error: 'Not in planning phase' });
      return;
    }

    const result = game.submitPlan(socket.id, plan);
    if (!result) {
      callback?.({ success: false, error: 'Invalid plan' });
      return;
    }

    game.phase = GAME_PHASES.TRANSIT;
    io.to(game.id).emit('game_update', game.serialize());
    callback?.({ success: true });
  });

  socket.on('transit_complete', (data, callback) => {
    const info = socketMap.get(socket.id);
    if (!info) { callback?.({ success: false, error: 'Not in a game' }); return; }
    const game = games.get(info.gameId);
    if (!game) { callback?.({ success: false }); return; }

    const updatedGame = game.applyTransitResult(socket.id, data);
    if (updatedGame) {
      persistPlayer(socket.id);
      io.to(game.id).emit('game_update', updatedGame);
      callback?.({ success: true, game: updatedGame });
    } else {
      callback?.({ success: false, error: 'Could not apply results' });
    }
  });

  socket.on('buy_ship', ({ shipTypeId, aisId, insuranceId, spawnLat, spawnLon }, callback) => {
    const info = socketMap.get(socket.id);
    if (!info) { callback?.({ success: false, error: 'Not in a game' }); return; }
    const game = games.get(info.gameId);
    if (!game) { callback?.({ success: false }); return; }

    const ship = game.buyShip(socket.id, shipTypeId, aisId || 'FULL_BROADCAST', insuranceId || 'NONE');
    if (!ship) {
      callback?.({ success: false, error: 'Cannot afford ship' });
      return;
    }

    // Spawn in server simulation at the selected terminal location
    const sim = gameSims.get(info.gameId);
    if (sim) sim.spawnPlayerShip(ship, spawnLat, spawnLon);

    persistPlayer(socket.id);
    socket.emit('game_update', game.serialize());
    callback?.({ success: true, ship });
  });

  socket.on('repair_ship', ({ shipId }, callback) => {
    const info = socketMap.get(socket.id);
    if (!info) { callback?.({ success: false, error: 'Not in a game' }); return; }
    const game = games.get(info.gameId);
    if (!game) { callback?.({ success: false }); return; }

    const result = game.repairShip(socket.id, shipId);
    if (!result) {
      callback?.({ success: false, error: 'Cannot repair' });
      return;
    }

    persistPlayer(socket.id);
    socket.emit('game_update', game.serialize());
    callback?.({ success: true, ...result });
  });

  socket.on('deliver_cargo', ({ shipId, revenue }, callback) => {
    const info = socketMap.get(socket.id);
    if (!info) { callback?.({ success: false }); return; }
    const game = games.get(info.gameId);
    if (!game) { callback?.({ success: false }); return; }
    const player = game.players[socket.id];
    if (!player) { callback?.({ success: false }); return; }
    player.cash = (player.cash || 0) + (revenue || 0);
    if (revenue > 0) player.totalProfit = (player.totalProfit || 0) + revenue;
    persistPlayer(socket.id);
    // Log profit for time-based leaderboard
    if (revenue > 0 && info.dbUserId) {
      try { stmts.logProfit.run(info.dbUserId, revenue); } catch {}
    }
    io.to(game.id).emit('game_update', game.serialize());
    callback?.({ success: true });
  });

  socket.on('ais_fine', ({ shipId, amount }, callback) => {
    const info = socketMap.get(socket.id);
    if (!info) { callback?.({ success: false }); return; }
    const game = games.get(info.gameId);
    if (!game) { callback?.({ success: false }); return; }
    const player = game.players[socket.id];
    if (!player) { callback?.({ success: false }); return; }
    player.cash = (player.cash || 0) - (amount || 0);
    player.totalLosses = (player.totalLosses || 0) + (amount || 0);
    persistPlayer(socket.id);
    io.to(game.id).emit('game_update', game.serialize());
    callback?.({ success: true });
  });

  socket.on('ship_destroyed', ({ shipId }, callback) => {
    const info = socketMap.get(socket.id);
    if (!info) { callback?.({ success: false }); return; }
    const game = games.get(info.gameId);
    if (!game) { callback?.({ success: false }); return; }
    const player = game.players[socket.id];
    if (!player) { callback?.({ success: false }); return; }
    const ship = player.fleet.find(s => s.id === shipId);
    let insurancePayout = 0;
    if (ship) {
      const ins = INSURANCE_OPTIONS[ship.insuranceId];
      if (ins && ins.coveragePercent > 0 && ship.insuranceWeeksRemaining > 0) {
        insurancePayout = Math.round((ship.totalInvested || ship.cost) * ins.coveragePercent);
        player.cash += insurancePayout;
      }
      player.fleet = player.fleet.filter(s => s.id !== shipId);
    }
    player.failedTransits = (player.failedTransits || 0) + 1;
    persistPlayer(socket.id);
    io.to(game.id).emit('game_update', game.serialize());
    callback?.({ success: true, insurancePayout });
  });

  socket.on('upgrade_ship', ({ shipId, type, health }, callback) => {
    try {
      const info = socketMap.get(socket.id);
      if (!info) { callback?.({ success: false }); return; }
      const game = games.get(info.gameId);
      if (!game) { callback?.({ success: false }); return; }
      // Sync client-side damage for repair (damage is tracked client-side)
      if (type === 'repair' && health != null) {
        const ship = game.players[socket.id]?.fleet.find(s => s.id === shipId);
        if (ship) ship.health = Math.max(0.01, Math.min(1.0, health));
      }
      const result = game.upgradeShip(socket.id, shipId, type);
      if (!result) { callback?.({ success: false, error: 'Upgrade failed' }); return; }
      persistPlayer(socket.id);
      io.to(game.id).emit('game_update', game.serialize());
      callback?.({ success: true });
    } catch (e) {
      console.error('upgrade_ship error:', e);
      callback?.({ success: false, error: 'Server error' });
    }
  });

  // Server-side simulation commands
  socket.on('set_waypoints', ({ shipId, waypoints }, callback) => {
    const info = socketMap.get(socket.id);
    if (!info) { callback?.({ success: false }); return; }
    const sim = gameSims.get(info.gameId);
    if (!sim) { callback?.({ success: false }); return; }
    const result = sim.setWaypoints(shipId, waypoints);
    callback?.({ success: result });
  });

  socket.on('set_speed', ({ shipId, speed }, callback) => {
    const info = socketMap.get(socket.id);
    if (!info) { callback?.({ success: false }); return; }
    const sim = gameSims.get(info.gameId);
    if (!sim) { callback?.({ success: false }); return; }
    const result = sim.setSpeed(shipId, speed);
    callback?.({ success: result });
  });

  socket.on('set_autopilot', ({ shipId, active, terminal, dropoff }, callback) => {
    const info = socketMap.get(socket.id);
    if (!info) { callback?.({ success: false }); return; }
    const sim = gameSims.get(info.gameId);
    if (!sim) { callback?.({ success: false }); return; }
    const result = sim.setAutopilot(shipId, active, terminal, dropoff);
    callback?.({ success: result });
  });

  // Get current simulation state on demand (for reconnection)
  socket.on('get_sim_state', (_, callback) => {
    const info = socketMap.get(socket.id);
    if (!info) { callback?.({ success: false }); return; }
    const sim = gameSims.get(info.gameId);
    if (!sim) { callback?.({ success: false }); return; }
    callback?.({ success: true, simState: sim.getState() });
  });

  socket.on('get_options', (_, callback) => {
    callback?.({
      shipTypes: SHIP_TYPES,
      aisOptions: AIS_OPTIONS,
      insuranceOptions: INSURANCE_OPTIONS,
      timeOptions: TIME_OPTIONS,
      oilTerminals: OIL_TERMINALS
    });
  });

  // Rejoin game after reconnection
  socket.on('rejoin_game', ({ gameId, playerName, token }, callback) => {
    const game = games.get(gameId);
    if (!game) { callback?.({ success: false, error: 'Game not found' }); return; }

    let dbUserId = null;
    if (token) {
      const decoded = verifyToken(token);
      if (decoded) {
        dbUserId = decoded.userId;
        const profile = getProfile(decoded.userId);
        if (profile) playerName = profile.username;
      }
    }

    // Check if player already exists under a stale socket ID (from before disconnect)
    let existingPlayer = null;
    let oldSocketId = null;
    for (const [pid, p] of Object.entries(game.players)) {
      if (p.name === playerName) { existingPlayer = p; oldSocketId = pid; break; }
    }

    if (existingPlayer && oldSocketId !== socket.id) {
      // Migrate player data to new socket ID
      game.players[socket.id] = existingPlayer;
      game.players[socket.id].id = socket.id;
      delete game.players[oldSocketId];
      if (game.hostId === oldSocketId) game.hostId = socket.id;
      // Clean up old socket mapping
      socketMap.delete(oldSocketId);
    } else if (!existingPlayer) {
      // Player was fully removed — re-add with defaults or profile
      if (dbUserId) {
        const profile = getProfile(dbUserId);
        if (profile) {
          const player = game.addPlayer(socket.id, playerName);
          player.cash = profile.cash;
          player.fleet = profile.fleet;
          player.totalProfit = profile.totalProfit;
          player.totalLosses = profile.totalLosses;
          player.successfulTransits = profile.successfulTransits;
          player.failedTransits = profile.failedTransits;
        } else {
          game.addPlayer(socket.id, playerName);
        }
      } else {
        game.addPlayer(socket.id, playerName);
      }
    }

    socketMap.set(socket.id, { gameId, playerName, dbUserId });
    socket.join(gameId);

    io.to(game.id).emit('game_update', game.serialize());
    callback?.({ success: true, game: game.serialize() });
    console.log(`${playerName} rejoined game ${gameId}`);
  });

  socket.on('disconnect', () => {
    const info = socketMap.get(socket.id);
    if (info) {
      // Clean up userSockets if this is still the active session
      if (info.dbUserId && userSockets.get(info.dbUserId) === socket.id) {
        userSockets.delete(info.dbUserId);
      }
      // Persist before cleanup
      persistPlayer(socket.id);
      // Clean up game/sim immediately — no 60s delay
      cleanupPlayerGame(socket.id);
    }
    console.log(`Player disconnected: ${socket.id}`);
  });
});

// Prevent server crashes from unhandled errors
process.on('uncaughtException', (err) => {
  console.error('Uncaught exception:', err);
});
process.on('unhandledRejection', (err) => {
  console.error('Unhandled rejection:', err);
});

const PORT = process.env.PORT || 3001;
httpServer.listen(PORT, '0.0.0.0', () => {
  console.log(`Beat The Strait server running on port ${PORT}`);
});
httpServer.on('error', (err) => {
  if (err.code === 'EADDRINUSE') {
    console.error(`Port ${PORT} is already in use. Kill the old process first:`);
    console.error(`  lsof -ti :${PORT} | xargs kill -9`);
    process.exit(1);
  }
  throw err;
});
