import Database from 'better-sqlite3';
import { existsSync, mkdirSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
import config from '../config/index.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Ensure data directory exists
const dataDir = join(__dirname, '..', 'data');
mkdirSync(dataDir, { recursive: true });

let db = null;

/**
 * Initialize the database connection and create tables if they don't exist
 */
export function initializeDatabase() {
  const dbPath = config.databasePath.startsWith('.') 
    ? join(__dirname, '..', config.databasePath) 
    : config.databasePath;
  
  db = new Database(dbPath);
  db.pragma('journal_mode = WAL');
  
  // Create tables
  createTables();
  
  console.log('✓ Battle database initialized:', dbPath);
  return db;
}

/**
 * Create all required tables
 */
function createTables() {
  // Players table - tracks player stats
  db.exec(`
    CREATE TABLE IF NOT EXISTS players (
      id INTEGER PRIMARY KEY,
      user_id INTEGER UNIQUE NOT NULL,
      username TEXT NOT NULL,
      faction TEXT DEFAULT 'independent',
      elo INTEGER DEFAULT 1000,
      elo_max INTEGER DEFAULT 1000,
      wins INTEGER DEFAULT 0,
      losses INTEGER DEFAULT 0,
      draws INTEGER DEFAULT 0,
      games_played INTEGER DEFAULT 0,
      current_season_wins INTEGER DEFAULT 0,
      current_season_losses INTEGER DEFAULT 0,
      current_season INTEGER DEFAULT 1,
      last_played_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);

  // Seasons table
  db.exec(`
    CREATE TABLE IF NOT EXISTS seasons (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      season_number INTEGER UNIQUE NOT NULL,
      name TEXT NOT NULL,
      start_date DATETIME NOT NULL,
      end_date DATETIME NOT NULL,
      is_active INTEGER DEFAULT 0,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);

  // Matchmaking queue
  db.exec(`
    CREATE TABLE IF NOT EXISTS matchmaking_queue (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      player_id INTEGER NOT NULL,
      queue_type TEXT NOT NULL,
      elo_at_queue INTEGER NOT NULL,
      faction TEXT,
      preferred_map TEXT,
      team_size INTEGER DEFAULT 1,
      joined_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (player_id) REFERENCES players(id)
    )
  `);

  // Battle rooms
  db.exec(`
    CREATE TABLE IF NOT EXISTS battle_rooms (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      creator_id INTEGER NOT NULL,
      room_type TEXT DEFAULT 'custom',
      max_players INTEGER DEFAULT 4,
      current_players INTEGER DEFAULT 0,
      map_id TEXT,
      rules TEXT,
      team_size INTEGER DEFAULT 2,
      is_private INTEGER DEFAULT 0,
      password TEXT,
      status TEXT DEFAULT 'waiting',
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      started_at DATETIME,
      FOREIGN KEY (creator_id) REFERENCES players(id)
    )
  `);

  // Battle room players
  db.exec(`
    CREATE TABLE IF NOT EXISTS battle_room_players (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      room_id TEXT NOT NULL,
      player_id INTEGER NOT NULL,
      team INTEGER DEFAULT 0,
      is_ready INTEGER DEFAULT 0,
      joined_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (room_id) REFERENCES battle_rooms(id),
      FOREIGN KEY (player_id) REFERENCES players(id),
      UNIQUE(room_id, player_id)
    )
  `);

  // Battle room chat messages
  db.exec(`
    CREATE TABLE IF NOT EXISTS battle_room_chat (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      room_id TEXT NOT NULL,
      player_id INTEGER NOT NULL,
      message TEXT NOT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (room_id) REFERENCES battle_rooms(id),
      FOREIGN KEY (player_id) REFERENCES players(id)
    )
  `);

  // Battles table
  db.exec(`
    CREATE TABLE IF NOT EXISTS battles (
      id TEXT PRIMARY KEY,
      battle_type TEXT NOT NULL,
      room_id TEXT,
      map_id TEXT NOT NULL,
      status TEXT DEFAULT 'pending',
      winner_faction TEXT,
      started_at DATETIME,
      ended_at DATETIME,
      duration_seconds INTEGER,
      replay_data TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (room_id) REFERENCES battle_rooms(id)
    )
  `);

  // Battle participants
  db.exec(`
    CREATE TABLE IF NOT EXISTS battle_participants (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      battle_id TEXT NOT NULL,
      player_id INTEGER NOT NULL,
      faction TEXT NOT NULL,
      team INTEGER DEFAULT 0,
      result TEXT,
      elo_change INTEGER DEFAULT 0,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (battle_id) REFERENCES battles(id),
      FOREIGN KEY (player_id) REFERENCES players(id)
    )
  `);

  // Battle statistics
  db.exec(`
    CREATE TABLE IF NOT EXISTS battle_stats (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      battle_id TEXT NOT NULL,
      player_id INTEGER NOT NULL,
      unit_id TEXT,
      kills INTEGER DEFAULT 0,
      deaths INTEGER DEFAULT 0,
      damage_dealt INTEGER DEFAULT 0,
      damage_received INTEGER DEFAULT 0,
      turns_active INTEGER DEFAULT 0,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (battle_id) REFERENCES battles(id),
      FOREIGN KEY (player_id) REFERENCES players(id)
    )
  `);

  // Leaderboard cache (for fast queries)
  db.exec(`
    CREATE TABLE IF NOT EXISTS leaderboard_cache (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      leaderboard_type TEXT NOT NULL,
      player_id INTEGER NOT NULL,
      rank INTEGER NOT NULL,
      value INTEGER NOT NULL,
      faction TEXT,
      season INTEGER DEFAULT 1,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (player_id) REFERENCES players(id)
    )
  `);

  // Create indexes
  db.exec(`CREATE INDEX IF NOT EXISTS idx_players_elo ON players(elo DESC)`);
  db.exec(`CREATE INDEX IF NOT EXISTS idx_players_faction ON players(faction)`);
  db.exec(`CREATE INDEX IF NOT EXISTS idx_players_user_id ON players(user_id)`);
  db.exec(`CREATE INDEX IF NOT EXISTS idx_matchmaking_queue_type ON matchmaking_queue(queue_type)`);
  db.exec(`CREATE INDEX IF NOT EXISTS idx_matchmaking_queue_joined ON matchmaking_queue(joined_at)`);
  db.exec(`CREATE INDEX IF NOT EXISTS idx_battle_rooms_status ON battle_rooms(status)`);
  db.exec(`CREATE INDEX IF NOT EXISTS idx_battles_status ON battles(status)`);
  db.exec(`CREATE INDEX IF NOT EXISTS idx_battles_created ON battles(created_at DESC)`);
  db.exec(`CREATE INDEX IF NOT EXISTS idx_battle_stats_battle ON battle_stats(battle_id)`);
  db.exec(`CREATE INDEX IF NOT EXISTS idx_leaderboard_cache_type ON leaderboard_cache(leaderboard_type, season, rank)`);

  // Create default season if not exists
  const seasonCount = db.prepare('SELECT COUNT(*) as count FROM seasons').get();
  if (seasonCount.count === 0) {
    const now = new Date();
    const endDate = new Date(now);
    endDate.setDate(endDate.getDate() + config.seasonDuration);
    
    db.prepare(`
      INSERT INTO seasons (season_number, name, start_date, end_date, is_active)
      VALUES (?, ?, ?, ?, 1)
    `).run(
      1,
      'Season 1',
      now.toISOString(),
      endDate.toISOString()
    );
    console.log('✓ Created default season');
  }
}

/**
 * Get player by user ID
 */
export function getPlayerByUserId(userId) {
  return db.prepare('SELECT * FROM players WHERE user_id = ?').get(userId);
}

/**
 * Get player by ID
 */
export function getPlayerById(id) {
  return db.prepare('SELECT * FROM players WHERE id = ?').get(id);
}

/**
 * Create or get player
 */
export function createOrGetPlayer(userId, username, faction = 'independent') {
  const existing = getPlayerByUserId(userId);
  if (existing) {
    return existing;
  }
  
  const result = db.prepare(`
    INSERT INTO players (user_id, username, faction)
    VALUES (?, ?, ?)
  `).run(userId, username, faction);
  
  return getPlayerById(result.lastInsertRowid);
}

/**
 * Update player stats after battle
 */
export function updatePlayerStats(playerId, result, eloChange) {
  const update = {
    wins: result === 'win' ? 1 : 0,
    losses: result === 'loss' ? 1 : 0,
    draws: result === 'draw' ? 1 : 0,
    games_played: 1,
    elo_change: eloChange
  };
  
  db.prepare(`
    UPDATE players SET
      wins = wins + ?,
      losses = losses + ?,
      draws = draws + ?,
      games_played = games_played + ?,
      elo = elo + ?,
      elo_max = MAX(elo_max, elo + ?),
      current_season_wins = current_season_wins + ?,
      current_season_losses = current_season_losses + ?,
      last_played_at = CURRENT_TIMESTAMP,
      updated_at = CURRENT_TIMESTAMP
    WHERE id = ?
  `).run(
    update.wins,
    update.losses,
    update.draws,
    update.games_played,
    update.elo_change,
    update.elo_change,
    update.wins,
    update.losses,
    playerId
  );
}

/**
 * Get queued players
 */
export function getQueuedPlayers(queueType) {
  return db.prepare(`
    SELECT mq.*, p.username, p.faction, p.elo
    FROM matchmaking_queue mq
    JOIN players p ON mq.player_id = p.id
    WHERE mq.queue_type = ?
    ORDER BY mq.joined_at
  `).all(queueType);
}

/**
 * Remove player from queue
 */
export function removeFromQueue(playerId, queueType) {
  return db.prepare(`
    DELETE FROM matchmaking_queue
    WHERE player_id = ? AND queue_type = ?
  `).run(playerId, queueType);
}

/**
 * Add player to queue
 */
export function addToQueue(playerId, queueType, elo, faction, preferredMap, teamSize) {
  return db.prepare(`
    INSERT INTO matchmaking_queue (player_id, queue_type, elo_at_queue, faction, preferred_map, team_size)
    VALUES (?, ?, ?, ?, ?, ?)
  `).run(playerId, queueType, elo, faction, preferredMap, teamSize);
}

/**
 * Create battle room
 */
export function createBattleRoom(roomData) {
  const id = roomData.id || `room_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  
  db.prepare(`
    INSERT INTO battle_rooms (id, name, creator_id, room_type, max_players, map_id, rules, team_size, is_private, password, status)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'waiting')
  `).run(
    id,
    roomData.name,
    roomData.creatorId,
    roomData.roomType || 'custom',
    roomData.maxPlayers || config.roomMaxPlayers,
    roomData.mapId,
    JSON.stringify(roomData.rules || {}),
    roomData.teamSize || 2,
    roomData.isPrivate ? 1 : 0,
    roomData.password || null
  );
  
  return getBattleRoom(id);
}

/**
 * Get battle room
 */
export function getBattleRoom(id) {
  return db.prepare('SELECT * FROM battle_rooms WHERE id = ?').get(id);
}

/**
 * Get all active battle rooms
 */
export function getActiveBattleRooms() {
  return db.prepare(`
    SELECT br.*, p.username as creator_name
    FROM battle_rooms br
    JOIN players p ON br.creator_id = p.id
    WHERE br.status = 'waiting'
    ORDER BY br.created_at DESC
  `).all();
}

/**
 * Update battle room
 */
export function updateBattleRoom(id, updates) {
  const fields = [];
  const values = [];
  
  if (updates.status !== undefined) {
    fields.push('status = ?');
    values.push(updates.status);
  }
  if (updates.currentPlayers !== undefined) {
    fields.push('current_players = ?');
    values.push(updates.currentPlayers);
  }
  if (updates.startedAt !== undefined) {
    fields.push('started_at = ?');
    values.push(updates.startedAt);
  }
  
  if (fields.length === 0) return;
  
  values.push(id);
  db.prepare(`
    UPDATE battle_rooms
    SET ${fields.join(', ')}
    WHERE id = ?
  `).run(...values);
}

/**
 * Delete battle room
 */
export function deleteBattleRoom(id) {
  return db.prepare('DELETE FROM battle_rooms WHERE id = ?').run(id);
}

/**
 * Add player to battle room
 */
export function addPlayerToRoom(roomId, playerId, team = 0) {
  try {
    db.prepare(`
      INSERT INTO battle_room_players (room_id, player_id, team, is_ready)
      VALUES (?, ?, ?, 0)
    `).run(roomId, playerId, team);
    
    db.prepare(`
      UPDATE battle_rooms
      SET current_players = current_players + 1
      WHERE id = ?
    `).run(roomId);
    
    return true;
  } catch (error) {
    if (error.code === 'SQLITE_CONSTRAINT_UNIQUE') {
      return false; // Player already in room
    }
    throw error;
  }
}

/**
 * Remove player from battle room
 */
export function removePlayerFromRoom(roomId, playerId) {
  db.prepare(`
    DELETE FROM battle_room_players
    WHERE room_id = ? AND player_id = ?
  `).run(roomId, playerId);
  
  db.prepare(`
    UPDATE battle_rooms
    SET current_players = MAX(0, current_players - 1)
    WHERE id = ?
  `).run(roomId);
}

/**
 * Get battle room players
 */
export function getBattleRoomPlayers(roomId) {
  return db.prepare(`
    SELECT brp.*, p.username, p.faction, p.elo
    FROM battle_room_players brp
    JOIN players p ON brp.player_id = p.id
    WHERE brp.room_id = ?
    ORDER BY brp.team, brp.joined_at
  `).all(roomId);
}

/**
 * Update player readiness in room
 */
export function updatePlayerReadiness(roomId, playerId, isReady) {
  db.prepare(`
    UPDATE battle_room_players
    SET is_ready = ?
    WHERE room_id = ? AND player_id = ?
  `).run(isReady ? 1 : 0, roomId, playerId);
}

/**
 * Add chat message to room
 */
export function addRoomChat(roomId, playerId, message) {
  return db.prepare(`
    INSERT INTO battle_room_chat (room_id, player_id, message)
    VALUES (?, ?, ?)
  `).run(roomId, playerId, message);
}

/**
 * Get room chat messages
 */
export function getRoomChat(roomId, limit = 50) {
  return db.prepare(`
    SELECT rc.*, p.username
    FROM battle_room_chat rc
    JOIN players p ON rc.player_id = p.id
    WHERE rc.room_id = ?
    ORDER BY rc.created_at DESC
    LIMIT ?
  `).all(roomId, limit).reverse();
}

/**
 * Create battle record
 */
export function createBattle(battleData) {
  const id = battleData.id || `battle_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  
  db.prepare(`
    INSERT INTO battles (id, battle_type, room_id, map_id, status)
    VALUES (?, ?, ?, ?, 'pending')
  `).run(
    id,
    battleData.battleType,
    battleData.roomId,
    battleData.mapId
  );
  
  return getBattle(id);
}

/**
 * Get battle
 */
export function getBattle(id) {
  return db.prepare('SELECT * FROM battles WHERE id = ?').get(id);
}

/**
 * Update battle
 */
export function updateBattle(id, updates) {
  const fields = [];
  const values = [];
  
  for (const [key, value] of Object.entries(updates)) {
    if (key === 'replayData') {
      fields.push('replay_data = ?');
    } else {
      fields.push(`${key} = ?`);
    }
    values.push(value);
  }
  
  if (fields.length === 0) return;
  
  values.push(id);
  db.prepare(`
    UPDATE battles
    SET ${fields.join(', ')}
    WHERE id = ?
  `).run(...values);
}

/**
 * Add battle participant
 */
export function addBattleParticipant(battleId, playerId, faction, team = 0) {
  db.prepare(`
    INSERT INTO battle_participants (battle_id, player_id, faction, team)
    VALUES (?, ?, ?, ?)
  `).run(battleId, playerId, faction, team);
}

/**
 * Update battle participant result
 */
export function updateBattleParticipantResult(battleId, playerId, result, eloChange) {
  db.prepare(`
    UPDATE battle_participants
    SET result = ?, elo_change = ?
    WHERE battle_id = ? AND player_id = ?
  `).run(result, eloChange, battleId, playerId);
}

/**
 * Add battle stats
 */
export function addBattleStats(battleId, playerId, stats) {
  db.prepare(`
    INSERT INTO battle_stats (battle_id, player_id, unit_id, kills, deaths, damage_dealt, damage_received, turns_active)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    battleId,
    playerId,
    stats.unitId || null,
    stats.kills || 0,
    stats.deaths || 0,
    stats.damageDealt || 0,
    stats.damageReceived || 0,
    stats.turnsActive || 0
  );
}

/**
 * Get battle participants
 */
export function getBattleParticipants(battleId) {
  return db.prepare(`
    SELECT bp.*, p.username, p.faction, p.elo as player_elo
    FROM battle_participants bp
    JOIN players p ON bp.player_id = p.id
    WHERE bp.battle_id = ?
  `).all(battleId);
}

/**
 * Get battle stats
 */
export function getBattleStats(battleId) {
  return db.prepare(`
    SELECT bs.*, p.username
    FROM battle_stats bs
    JOIN players p ON bs.player_id = p.id
    WHERE bs.battle_id = ?
  `).all(battleId);
}

/**
 * Get global leaderboard
 */
export function getGlobalLeaderboard(limit = 50, offset = 0) {
  return db.prepare(`
    SELECT 
      id, user_id, username, faction, elo, elo_max,
      wins, losses, draws, games_played,
      CASE WHEN games_played > 0 THEN ROUND(wins * 100.0 / games_played, 2) ELSE 0 END as win_rate
    FROM players
    ORDER BY elo DESC
    LIMIT ? OFFSET ?
  `).all(limit, offset);
}

/**
 * Get faction-specific leaderboard
 */
export function getFactionLeaderboard(faction, limit = 50, offset = 0) {
  return db.prepare(`
    SELECT 
      id, user_id, username, faction, elo, elo_max,
      wins, losses, draws, games_played,
      CASE WHEN games_played > 0 THEN ROUND(wins * 100.0 / games_played, 2) ELSE 0 END as win_rate
    FROM players
    WHERE faction = ?
    ORDER BY elo DESC
    LIMIT ? OFFSET ?
  `).all(faction, limit, offset);
}

/**
 * Get seasonal leaderboard
 */
export function getSeasonalLeaderboard(season = 1, limit = 50, offset = 0) {
  return db.prepare(`
    SELECT 
      id, user_id, username, faction,
      current_season_wins as wins,
      current_season_losses as losses,
      draws,
      games_played,
      elo,
      CASE WHEN games_played > 0 THEN ROUND(current_season_wins * 100.0 / games_played, 2) ELSE 0 END as win_rate
    FROM players
    WHERE current_season = ?
    ORDER BY current_season_wins DESC, current_season_losses ASC, elo DESC
    LIMIT ? OFFSET ?
  `).all(season, limit, offset);
}

/**
 * Get player battle history
 */
export function getPlayerBattleHistory(playerId, limit = 20, offset = 0) {
  return db.prepare(`
    SELECT 
      b.*,
      bp.result,
      bp.elo_change,
      bp.faction,
      m.name as map_name
    FROM battles b
    JOIN battle_participants bp ON b.id = bp.battle_id
    LEFT JOIN maps m ON b.map_id = m.id
    WHERE bp.player_id = ?
    ORDER BY b.ended_at DESC
    LIMIT ? OFFSET ?
  `).all(playerId, limit, offset);
}

/**
 * Get active season
 */
export function getActiveSeason() {
  return db.prepare('SELECT * FROM seasons WHERE is_active = 1').get();
}

/**
 * Get all seasons
 */
export function getAllSeasons() {
  return db.prepare('SELECT * FROM seasons ORDER BY season_number DESC').all();
}

/**
 * Calculate ELO change for a player
 */
export function calculateEloChange(playerElo, opponentElo, result) {
  const expectedScore = 1 / (1 + Math.pow(10, (opponentElo - playerElo) / 400));
  const actualScore = result === 'win' ? 1 : result === 'draw' ? 0.5 : 0;
  const eloChange = Math.round(config.eloKFactor * (actualScore - expectedScore));
  return eloChange;
}

/**
 * Get database instance
 */
export function getDb() {
  return db;
}

/**
 * Close database connection
 */
export function closeDatabase() {
  if (db) {
    db.close();
    db = null;
  }
}

export default {
  initializeDatabase,
  getPlayerByUserId,
  getPlayerById,
  createOrGetPlayer,
  updatePlayerStats,
  getQueuedPlayers,
  removeFromQueue,
  addToQueue,
  createBattleRoom,
  getBattleRoom,
  getActiveBattleRooms,
  updateBattleRoom,
  deleteBattleRoom,
  addPlayerToRoom,
  removePlayerFromRoom,
  getBattleRoomPlayers,
  updatePlayerReadiness,
  addRoomChat,
  getRoomChat,
  createBattle,
  getBattle,
  updateBattle,
  addBattleParticipant,
  updateBattleParticipantResult,
  addBattleStats,
  getBattleParticipants,
  getBattleStats,
  getGlobalLeaderboard,
  getFactionLeaderboard,
  getSeasonalLeaderboard,
  getPlayerBattleHistory,
  getActiveSeason,
  getAllSeasons,
  calculateEloChange,
  getDb,
  closeDatabase
};
