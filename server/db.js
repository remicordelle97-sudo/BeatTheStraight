import Database from 'better-sqlite3';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const DB_PATH = join(__dirname, '..', 'data', 'beatthestrait.db');

// Ensure data directory exists
import { mkdirSync } from 'fs';
mkdirSync(join(__dirname, '..', 'data'), { recursive: true });

const db = new Database(DB_PATH);

// Enable WAL mode for better concurrent read/write performance
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

// Create tables
db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    username TEXT UNIQUE NOT NULL,
    password_hash TEXT NOT NULL,
    cash REAL NOT NULL DEFAULT 15000000,
    total_profit REAL NOT NULL DEFAULT 0,
    total_losses REAL NOT NULL DEFAULT 0,
    successful_transits INTEGER NOT NULL DEFAULT 0,
    failed_transits INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS ships (
    id TEXT PRIMARY KEY,
    user_id INTEGER NOT NULL,
    type_id TEXT NOT NULL,
    name TEXT NOT NULL,
    health REAL NOT NULL DEFAULT 1.0,
    ais_id TEXT NOT NULL DEFAULT 'FULL_BROADCAST',
    ais_name TEXT NOT NULL DEFAULT 'Full AIS Broadcast',
    insurance_id TEXT NOT NULL DEFAULT 'NONE',
    insurance_name TEXT NOT NULL DEFAULT 'No Insurance (Self-Insured)',
    auto_renew_insurance INTEGER NOT NULL DEFAULT 1,
    insurance_weeks_remaining INTEGER NOT NULL DEFAULT 0,
    insurance_premium REAL NOT NULL DEFAULT 0,
    total_invested REAL NOT NULL DEFAULT 0,
    engine_upgrade INTEGER NOT NULL DEFAULT 0,
    defense_upgrade INTEGER NOT NULL DEFAULT 0,
    has_autopilot INTEGER NOT NULL DEFAULT 0,
    speed REAL NOT NULL,
    capacity INTEGER NOT NULL,
    cost REAL NOT NULL,
    fuel_per_hour REAL NOT NULL,
    cargo_type TEXT NOT NULL DEFAULT 'oil',
    description TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
  );

  CREATE TABLE IF NOT EXISTS profit_log (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    profit REAL NOT NULL,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
  );
  CREATE INDEX IF NOT EXISTS idx_profit_log_user_date ON profit_log(user_id, created_at);
`);

// Prepared statements
const stmts = {
  createUser: db.prepare(`
    INSERT INTO users (username, password_hash) VALUES (?, ?)
  `),

  getUserByUsername: db.prepare(`
    SELECT * FROM users WHERE username = ?
  `),

  getUserById: db.prepare(`
    SELECT * FROM users WHERE id = ?
  `),

  updateUserCash: db.prepare(`
    UPDATE users SET cash = ?, updated_at = datetime('now') WHERE id = ?
  `),

  updateUserStats: db.prepare(`
    UPDATE users SET cash = ?, total_profit = ?, total_losses = ?,
    successful_transits = ?, failed_transits = ?, updated_at = datetime('now')
    WHERE id = ?
  `),

  getShipsByUser: db.prepare(`
    SELECT * FROM ships WHERE user_id = ?
  `),

  insertShip: db.prepare(`
    INSERT INTO ships (id, user_id, type_id, name, health, ais_id, ais_name,
      insurance_id, insurance_name, auto_renew_insurance, insurance_weeks_remaining,
      insurance_premium, total_invested, engine_upgrade, defense_upgrade,
      has_autopilot, speed, capacity, cost, fuel_per_hour, cargo_type, description)
    VALUES (@id, @user_id, @type_id, @name, @health, @ais_id, @ais_name,
      @insurance_id, @insurance_name, @auto_renew_insurance, @insurance_weeks_remaining,
      @insurance_premium, @total_invested, @engine_upgrade, @defense_upgrade,
      @has_autopilot, @speed, @capacity, @cost, @fuel_per_hour, @cargo_type, @description)
  `),

  updateShip: db.prepare(`
    UPDATE ships SET health = @health, ais_id = @ais_id, ais_name = @ais_name,
      insurance_id = @insurance_id, insurance_name = @insurance_name,
      auto_renew_insurance = @auto_renew_insurance,
      insurance_weeks_remaining = @insurance_weeks_remaining,
      insurance_premium = @insurance_premium, total_invested = @total_invested,
      engine_upgrade = @engine_upgrade, defense_upgrade = @defense_upgrade,
      has_autopilot = @has_autopilot, speed = @speed
    WHERE id = @id AND user_id = @user_id
  `),

  deleteShip: db.prepare(`
    DELETE FROM ships WHERE id = ? AND user_id = ?
  `),

  getLeaderboard: db.prepare(`
    SELECT id, username, cash, total_profit, total_losses,
      successful_transits, failed_transits
    FROM users ORDER BY total_profit DESC LIMIT 20
  `),

  logProfit: db.prepare(`
    INSERT INTO profit_log (user_id, profit) VALUES (?, ?)
  `),

  getLeaderboardSince: db.prepare(`
    SELECT u.id, u.username, u.cash, COALESCE(SUM(pl.profit), 0) AS period_profit,
      u.successful_transits, u.failed_transits
    FROM users u
    LEFT JOIN profit_log pl ON pl.user_id = u.id AND pl.created_at >= ?
    GROUP BY u.id
    ORDER BY period_profit DESC
    LIMIT 20
  `),
};

// Helper: convert a DB ship row to the in-memory ship format used by the game
function dbShipToGame(row) {
  return {
    id: row.id,
    typeId: row.type_id,
    name: row.name,
    health: row.health,
    aisId: row.ais_id,
    aisName: row.ais_name,
    insuranceId: row.insurance_id,
    insuranceName: row.insurance_name,
    autoRenewInsurance: !!row.auto_renew_insurance,
    insuranceWeeksRemaining: row.insurance_weeks_remaining,
    insurancePremium: row.insurance_premium,
    totalInvested: row.total_invested,
    engineUpgrade: row.engine_upgrade,
    defenseUpgrade: row.defense_upgrade,
    hasAutopilot: !!row.has_autopilot,
    speed: row.speed,
    capacity: row.capacity,
    cost: row.cost,
    fuelPerHour: row.fuel_per_hour,
    cargoType: row.cargo_type,
    description: row.description,
  };
}

// Helper: convert in-memory ship to DB params
function gameShipToDb(ship, userId) {
  return {
    id: ship.id,
    user_id: userId,
    type_id: ship.typeId || ship.id.split('_')[0] || 'unknown',
    name: ship.name,
    health: ship.health,
    ais_id: ship.aisId || 'FULL_BROADCAST',
    ais_name: ship.aisName || 'Full AIS Broadcast',
    insurance_id: ship.insuranceId || 'NONE',
    insurance_name: ship.insuranceName || 'No Insurance (Self-Insured)',
    auto_renew_insurance: ship.autoRenewInsurance ? 1 : 0,
    insurance_weeks_remaining: ship.insuranceWeeksRemaining || 0,
    insurance_premium: ship.insurancePremium || 0,
    total_invested: ship.totalInvested || ship.cost,
    engine_upgrade: ship.engineUpgrade || 0,
    defense_upgrade: ship.defenseUpgrade || 0,
    has_autopilot: ship.hasAutopilot ? 1 : 0,
    speed: ship.speed,
    capacity: ship.capacity,
    cost: ship.cost,
    fuel_per_hour: ship.fuelPerHour,
    cargo_type: ship.cargoType || 'oil',
    description: ship.description || '',
  };
}

export {
  db, stmts, dbShipToGame, gameShipToDb
};
