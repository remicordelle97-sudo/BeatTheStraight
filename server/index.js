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

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const app = express();
const httpServer = createServer(app);
const io = new Server(httpServer, {
  cors: { origin: '*' }
});

// Serve built static files
app.use(express.static(join(__dirname, '..', 'dist')));
app.get('*', (req, res, next) => {
  if (req.path.startsWith('/socket.io')) return next();
  res.sendFile(join(__dirname, '..', 'dist', 'index.html'));
});

const games = new Map();
const socketMap = new Map();

io.on('connection', (socket) => {
  console.log(`Player connected: ${socket.id}`);

  socket.on('create_game', ({ playerName }, callback) => {
    const gameId = generateGameId();
    const game = new GameState(gameId, socket.id);
    game.addPlayer(socket.id, playerName);
    games.set(gameId, game);
    socketMap.set(socket.id, { gameId, playerName });
    socket.join(gameId);

    callback({ success: true, gameId, game: game.serialize() });
    console.log(`Game ${gameId} created by ${playerName}`);
  });

  socket.on('join_game', ({ gameId, playerName }, callback) => {
    const game = games.get(gameId.toUpperCase());
    if (!game) {
      callback({ success: false, error: 'Game not found' });
      return;
    }
    if (game.phase !== GAME_PHASES.LOBBY) {
      callback({ success: false, error: 'Game already in progress' });
      return;
    }

    game.addPlayer(socket.id, playerName);
    socketMap.set(socket.id, { gameId: game.id, playerName });
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
    io.to(game.id).emit('game_update', game.serialize());
    io.to(game.id).emit('phase_change', { phase: GAME_PHASES.PLANNING });
    callback?.({ success: true });
    console.log(`Game ${game.id} started`);
  });

  // Player submits their plan (ship, AIS, insurance, time selections)
  // In the new flow, the client runs the transit simulation locally
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

  // Client sends transit results after completing the live simulation
  socket.on('transit_complete', (data, callback) => {
    const info = socketMap.get(socket.id);
    if (!info) { callback?.({ success: false, error: 'Not in a game' }); return; }
    const game = games.get(info.gameId);
    if (!game) { callback?.({ success: false }); return; }

    const updatedGame = game.applyTransitResult(socket.id, data);
    if (updatedGame) {
      io.to(game.id).emit('game_update', updatedGame);
      callback?.({ success: true, game: updatedGame });
    } else {
      callback?.({ success: false, error: 'Could not apply results' });
    }
  });

  socket.on('buy_ship', ({ shipTypeId, aisId, insuranceId }, callback) => {
    const info = socketMap.get(socket.id);
    if (!info) { callback?.({ success: false, error: 'Not in a game' }); return; }
    const game = games.get(info.gameId);
    if (!game) { callback?.({ success: false }); return; }

    const ship = game.buyShip(socket.id, shipTypeId, aisId || 'FULL_BROADCAST', insuranceId || 'NONE');
    if (!ship) {
      callback?.({ success: false, error: 'Cannot afford ship' });
      return;
    }

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

    socket.emit('game_update', game.serialize());
    callback?.({ success: true, ...result });
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

  socket.on('disconnect', () => {
    const info = socketMap.get(socket.id);
    if (info) {
      const game = games.get(info.gameId);
      if (game) {
        game.removePlayer(socket.id);
        if (game.getPlayerCount() === 0) {
          games.delete(info.gameId);
          console.log(`Game ${info.gameId} deleted (empty)`);
        } else {
          if (game.hostId === socket.id) {
            game.hostId = Object.keys(game.players)[0];
          }
          io.to(game.id).emit('game_update', game.serialize());
        }
      }
      socketMap.delete(socket.id);
    }
    console.log(`Player disconnected: ${socket.id}`);
  });
});

const PORT = process.env.PORT || 3001;
httpServer.listen(PORT, () => {
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
