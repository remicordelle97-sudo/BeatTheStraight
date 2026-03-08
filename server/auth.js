import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { stmts, dbShipToGame, gameShipToDb } from './db.js';

const JWT_SECRET = process.env.JWT_SECRET || 'beat-the-strait-secret-change-in-prod';
const SALT_ROUNDS = 10;

function generateToken(userId) {
  return jwt.sign({ userId }, JWT_SECRET, { expiresIn: '30d' });
}

function verifyToken(token) {
  try {
    return jwt.verify(token, JWT_SECRET);
  } catch {
    return null;
  }
}

async function register(username, password) {
  if (!username || !password) {
    return { success: false, error: 'Username and password required' };
  }
  if (username.length < 3 || username.length > 20) {
    return { success: false, error: 'Username must be 3-20 characters' };
  }
  if (password.length < 4) {
    return { success: false, error: 'Password must be at least 4 characters' };
  }

  const existing = stmts.getUserByUsername.get(username);
  if (existing) {
    return { success: false, error: 'Username already taken' };
  }

  const hash = await bcrypt.hash(password, SALT_ROUNDS);
  const result = stmts.createUser.run(username, hash);
  const user = stmts.getUserById.get(result.lastInsertRowid);
  const token = generateToken(user.id);

  return {
    success: true,
    token,
    user: sanitizeUser(user, [])
  };
}

async function login(username, password) {
  if (!username || !password) {
    return { success: false, error: 'Username and password required' };
  }

  const user = stmts.getUserByUsername.get(username);
  if (!user) {
    return { success: false, error: 'Invalid username or password' };
  }

  const valid = await bcrypt.compare(password, user.password_hash);
  if (!valid) {
    return { success: false, error: 'Invalid username or password' };
  }

  const token = generateToken(user.id);
  const ships = stmts.getShipsByUser.all(user.id).map(dbShipToGame);

  return {
    success: true,
    token,
    user: sanitizeUser(user, ships)
  };
}

function getProfile(userId) {
  const user = stmts.getUserById.get(userId);
  if (!user) return null;
  const ships = stmts.getShipsByUser.all(userId).map(dbShipToGame);
  return sanitizeUser(user, ships);
}

function sanitizeUser(user, ships) {
  return {
    id: user.id,
    username: user.username,
    cash: user.cash,
    fleet: ships,
    totalProfit: user.total_profit,
    totalLosses: user.total_losses,
    successfulTransits: user.successful_transits,
    failedTransits: user.failed_transits,
  };
}

// Save player state back to DB (call after transit, ship purchase, etc.)
function savePlayerState(userId, player) {
  stmts.updateUserStats.run(
    player.cash,
    player.totalProfit,
    player.totalLosses,
    player.successfulTransits,
    player.failedTransits,
    userId
  );

  // Sync fleet: delete ships not in player.fleet, upsert the rest
  const dbShips = stmts.getShipsByUser.all(userId);
  const playerShipIds = new Set(player.fleet.map(s => s.id));

  // Delete ships no longer in fleet
  for (const dbShip of dbShips) {
    if (!playerShipIds.has(dbShip.id)) {
      stmts.deleteShip.run(dbShip.id, userId);
    }
  }

  // Upsert current fleet
  const existingIds = new Set(dbShips.map(s => s.id));
  for (const ship of player.fleet) {
    const dbParams = gameShipToDb(ship, userId);
    if (existingIds.has(ship.id)) {
      stmts.updateShip.run(dbParams);
    } else {
      stmts.insertShip.run(dbParams);
    }
  }
}

export {
  register, login, getProfile, verifyToken, savePlayerState, generateToken
};
