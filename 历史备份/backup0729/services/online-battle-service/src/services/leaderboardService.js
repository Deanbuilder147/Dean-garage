import db from '../database/db.js';
import config from '../config/index.js';

/**
 * Get global leaderboard
 */
export function getGlobalLeaderboard(limit = 50, offset = 0) {
  const players = db.getGlobalLeaderboard(limit, offset);
  
  return players.map((player, index) => ({
    rank: offset + index + 1,
    ...player
  }));
}

/**
 * Get faction-specific leaderboard
 */
export function getFactionLeaderboard(faction, limit = 50, offset = 0) {
  const players = db.getFactionLeaderboard(faction, limit, offset);
  
  return players.map((player, index) => ({
    rank: offset + index + 1,
    ...player
  }));
}

/**
 * Get seasonal leaderboard
 */
export function getSeasonalLeaderboard(season = null, limit = 50, offset = 0) {
  const targetSeason = season || db.getActiveSeason()?.id || 1;
  const players = db.getSeasonalLeaderboard(targetSeason, limit, offset);
  
  return players.map((player, index) => ({
    rank: offset + index + 1,
    season: targetSeason,
    ...player
  }));
}

/**
 * Get player rank
 */
export function getPlayerRank(playerId) {
  const allPlayers = db.getGlobalLeaderboard(10000, 0);
  const playerIndex = allPlayers.findIndex(p => p.id === playerId);
  
  if (playerIndex === -1) {
    return null;
  }
  
  const player = allPlayers[playerIndex];
  const totalPlayers = allPlayers.length;
  
  // Calculate percentile
  const percentile = totalPlayers > 0 
    ? Math.round((1 - playerIndex / totalPlayers) * 100) 
    : 0;
  
  return {
    rank: playerIndex + 1,
    totalPlayers,
    percentile,
    ...player
  };
}

/**
 * Get leaderboard statistics
 */
export function getLeaderboardStats() {
  const dbInstance = db.getDb();
  
  const totalPlayers = dbInstance.prepare('SELECT COUNT(*) as count FROM players').get();
  const avgElo = dbInstance.prepare('SELECT AVG(elo) as avg FROM players').get();
  const topElo = dbInstance.prepare('SELECT MAX(elo) as max FROM players').get();
  
  // Faction distribution
  const factionDist = dbInstance.prepare(`
    SELECT faction, COUNT(*) as count, AVG(elo) as avg_elo
    FROM players
    GROUP BY faction
  `).all();
  
  return {
    totalPlayers: totalPlayers.count,
    averageElo: Math.round(avgElo.avg || 0),
    topElo: topElo.max || 1000,
    factionDistribution: factionDist
  };
}

/**
 * Refresh leaderboard cache
 */
export function refreshLeaderboardCache() {
  const dbInstance = db.getDb();
  
  // Clear existing cache
  dbInstance.exec('DELETE FROM leaderboard_cache');
  
  // Cache global leaderboard
  const globalPlayers = dbInstance.prepare(`
    SELECT id, elo FROM players ORDER BY elo DESC
  `).all();
  
  const insertStmt = dbInstance.prepare(`
    INSERT INTO leaderboard_cache (leaderboard_type, player_id, rank, value, season)
    VALUES (?, ?, ?, ?, ?)
  `);
  
  globalPlayers.forEach((player, index) => {
    insertStmt.run('global', player.id, index + 1, player.elo, 1);
  });
  
  return { success: true, cached: globalPlayers.length };
}

export default {
  getGlobalLeaderboard,
  getFactionLeaderboard,
  getSeasonalLeaderboard,
  getPlayerRank,
  getLeaderboardStats,
  refreshLeaderboardCache
};
