import db from '../database/db.js';
import config from '../config/index.js';

/**
 * Record battle result and update player stats
 */
export async function recordBattleResult(battleId, winnerFaction, battleStats = {}) {
  const battle = db.getBattle(battleId);
  if (!battle) {
    return { success: false, error: 'Battle not found' };
  }
  
  const participants = db.getBattleParticipants(battleId);
  
  // Calculate ELO changes
  const eloChanges = calculateEloChanges(participants, winnerFaction);
  
  // Update each participant
  for (const participant of participants) {
    const result = determineResult(participant.faction, winnerFaction);
    const eloChange = eloChanges[participant.player_id] || 0;
    
    // Update battle participant record
    db.updateBattleParticipantResult(battleId, participant.player_id, result, eloChange);
    
    // Update player stats
    db.updatePlayerStats(participant.player_id, result, eloChange);
    
    // Add battle stats if provided
    if (battleStats[participant.player_id]) {
      db.addBattleStats(battleId, participant.player_id, battleStats[participant.player_id]);
    }
  }
  
  // Update battle record
  const now = new Date().toISOString();
  const startTime = battle.started_at ? new Date(battle.started_at) : new Date();
  const duration = Math.floor((new Date(now) - startTime) / 1000);
  
  db.updateBattle(battleId, {
    status: 'completed',
    winnerFaction,
    endedAt: now,
    durationSeconds: duration,
    replayData: JSON.stringify(battleStats.replay || {})
  });
  
  // Update room status if applicable
  if (battle.room_id) {
    db.updateBattleRoom(battle.room_id, {
      status: 'completed'
    });
  }
  
  return {
    success: true,
    battleId,
    winnerFaction,
    eloChanges,
    participants: participants.map(p => ({
      ...p,
      result: determineResult(p.faction, winnerFaction),
      eloChange: eloChanges[p.player_id] || 0
    }))
  };
}

/**
 * Calculate ELO changes for all participants
 */
function calculateEloChanges(participants, winnerFaction) {
  const eloChanges = {};
  
  // Group by faction
  const factions = {};
  participants.forEach(p => {
    if (!factions[p.faction]) {
      factions[p.faction] = [];
    }
    factions[p.faction].push(p);
  });
  
  const factionList = Object.keys(factions);
  
  if (factionList.length === 2) {
    // 1v1 or team vs team
    const faction1 = factionList[0];
    const faction2 = factionList[1];
    
    // Calculate average ELO for each faction
    const avgElo1 = factions[faction1].reduce((sum, p) => sum + p.player_elo, 0) / factions[faction1].length;
    const avgElo2 = factions[faction2].reduce((sum, p) => sum + p.player_elo, 0) / factions[faction2].length;
    
    // Determine winner
    const faction1Won = faction1 === winnerFaction;
    
    // Calculate ELO changes
    factions[faction1].forEach(p => {
      eloChanges[p.player_id] = db.calculateEloChange(p.player_elo, avgElo2, faction1Won ? 'win' : 'loss');
    });
    
    factions[faction2].forEach(p => {
      eloChanges[p.player_id] = db.calculateEloChange(p.player_elo, avgElo1, faction1Won ? 'loss' : 'win');
    });
  } else if (factionList.length > 2) {
    // Free-for-all or multi-team
    const winnerAvgElo = factions[winnerFaction]?.reduce((sum, p) => sum + p.player_elo, 0) / 
                         (factions[winnerFaction]?.length || 1);
    
    factionList.forEach(faction => {
      const isWinner = faction === winnerFaction;
      const opponentAvgElo = faction === winnerFaction 
        ? factionList.filter(f => f !== faction).reduce((sum, f) => {
            return sum + factions[f].reduce((s, p) => s + p.player_elo, 0) / factions[f].length;
          }, 0) / (factionList.length - 1)
        : winnerAvgElo;
      
      factions[faction].forEach(p => {
        eloChanges[p.player_id] = db.calculateEloChange(
          p.player_elo, 
          opponentAvgElo, 
          isWinner ? 'win' : 'loss'
        );
      });
    });
  }
  
  return eloChanges;
}

/**
 * Determine result string for a faction
 */
function determineResult(playerFaction, winnerFaction) {
  if (playerFaction === winnerFaction) {
    return 'win';
  }
  if (winnerFaction === 'draw' || !winnerFaction) {
    return 'draw';
  }
  return 'loss';
}

/**
 * Get battle history for a player
 */
export function getPlayerBattleHistory(playerId, limit = 20, offset = 0) {
  return db.getPlayerBattleHistory(playerId, limit, offset);
}

/**
 * Get battle details with stats
 */
export function getBattleDetails(battleId) {
  const battle = db.getBattle(battleId);
  if (!battle) {
    return null;
  }
  
  const participants = db.getBattleParticipants(battleId);
  const stats = db.getBattleStats(battleId);
  
  return {
    ...battle,
    replayData: battle.replay_data ? JSON.parse(battle.replay_data) : null,
    participants: participants.map(p => ({
      ...p,
      stats: stats.filter(s => s.player_id === p.player_id)
    }))
  };
}

/**
 * Get recent battles
 */
export function getRecentBattles(limit = 20, offset = 0) {
  const dbInstance = db.getDb();
  
  const battles = dbInstance.prepare(`
    SELECT 
      b.*,
      br.name as room_name,
      m.name as map_name,
      winner.username as winner_name
    FROM battles b
    LEFT JOIN battle_rooms br ON b.room_id = br.id
    LEFT JOIN maps m ON b.map_id = m.id
    LEFT JOIN players winner ON winner.faction = b.winner_faction
    WHERE b.status = 'completed'
    ORDER BY b.ended_at DESC
    LIMIT ? OFFSET ?
  `).all(limit, offset);
  
  return battles.map(battle => ({
    ...battle,
    replayData: battle.replay_data ? JSON.parse(battle.replay_data) : null
  }));
}

/**
 * Get player statistics summary
 */
export function getPlayerStats(playerId) {
  const dbInstance = db.getDb();
  
  const player = db.getPlayerById(playerId);
  if (!player) {
    return null;
  }
  
  // Total battles
  const totalBattles = dbInstance.prepare(`
    SELECT COUNT(*) as count FROM battle_participants WHERE player_id = ?
  `).get(playerId);
  
  // Recent performance (last 10 battles)
  const recentBattles = dbInstance.prepare(`
    SELECT result, elo_change
    FROM battle_participants
    WHERE player_id = ?
    ORDER BY created_at DESC
    LIMIT 10
  `).all(playerId);
  
  const recentWins = recentBattles.filter(b => b.result === 'win').length;
  const recentWinRate = recentBattles.length > 0 
    ? Math.round(recentWins / recentBattles.length * 100) 
    : 0;
  
  // Favorite faction
  const factionStats = dbInstance.prepare(`
    SELECT faction, COUNT(*) as games, 
           SUM(CASE WHEN result = 'win' THEN 1 ELSE 0 END) as wins
    FROM battle_participants
    WHERE player_id = ?
    GROUP BY faction
    ORDER BY games DESC
  `).all(playerId);
  
  // Average stats per battle
  const avgStats = dbInstance.prepare(`
    SELECT 
      AVG(kills) as avg_kills,
      AVG(deaths) as avg_deaths,
      AVG(damage_dealt) as avg_damage,
      AVG(turns_active) as avg_turns
    FROM battle_stats
    WHERE player_id = ?
  `).get(playerId);
  
  return {
    player: {
      id: player.id,
      username: player.username,
      faction: player.faction,
      elo: player.elo,
      eloMax: player.elo_max,
      rank: player.elo // Would need proper rank calculation
    },
    record: {
      wins: player.wins,
      losses: player.losses,
      draws: player.draws,
      gamesPlayed: player.games_played,
      winRate: player.games_played > 0 
        ? Math.round(player.wins / player.games_played * 100) 
        : 0
    },
    seasonal: {
      wins: player.current_season_wins,
      losses: player.current_season_losses,
      season: player.current_season
    },
    recent: {
      battles: recentBattles,
      winRate: recentWinRate
    },
    factions: factionStats,
    averages: {
      kills: Math.round(avgStats.avg_kills || 0),
      deaths: Math.round(avgStats.avg_deaths || 0),
      damageDealt: Math.round(avgStats.avg_damage || 0),
      turnsActive: Math.round(avgStats.avg_turns || 0)
    }
  };
}

/**
 * Initialize battle via combat-service
 */
export async function initializeBattle(battleId, mapId, participants) {
  // This would call the combat-service to initialize the actual battle
  // For now, just update the battle status
  db.updateBattle(battleId, {
    status: 'active',
    startedAt: new Date().toISOString()
  });
  
  return {
    success: true,
    battleId,
    status: 'active'
  };
}

export default {
  recordBattleResult,
  getPlayerBattleHistory,
  getBattleDetails,
  getRecentBattles,
  getPlayerStats,
  initializeBattle
};
