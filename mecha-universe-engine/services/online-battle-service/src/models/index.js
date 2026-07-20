/**
 * Data models for online-battle-service
 * 
 * These are simple data transformation utilities.
 * Actual database operations are in db.js
 */

// Player model
export const PlayerModel = {
  fromRow: (row) => ({
    id: row.id,
    userId: row.user_id,
    username: row.username,
    faction: row.faction,
    elo: row.elo,
    wins: row.wins,
    losses: row.losses,
    winRate: row.wins + row.losses > 0 
      ? (row.wins / (row.wins + row.losses)).toFixed(3) 
      : '0.000',
    createdAt: row.created_at,
    updatedAt: row.updated_at
  }),

  toInsert: (data) => ({
    user_id: data.userId,
    username: data.username,
    faction: data.faction || 'independents',
    elo: data.elo || 1500,
    wins: 0,
    losses: 0
  })
};

// Queue model
export const QueueModel = {
  fromRow: (row) => ({
    id: row.id,
    playerId: row.player_id,
    queueType: row.queue_type,
    faction: row.faction,
    teamSize: row.team_size,
    createdAt: row.created_at,
    waitTime: Date.now() - new Date(row.created_at).getTime()
  })
};

// Room model
export const RoomModel = {
  fromRow: (row) => ({
    id: row.id,
    name: row.name,
    hostId: row.host_id,
    mapId: row.map_id,
    maxPlayers: row.max_players,
    teamSize: row.team_size,
    battleType: row.battle_type,
    isPrivate: row.is_private,
    status: row.status,
    battleId: row.battle_id,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  }),

  toInsert: (data) => ({
    name: data.name,
    host_id: data.hostId,
    map_id: data.settings?.mapId,
    max_players: data.settings?.maxPlayers || 10,
    team_size: data.settings?.teamSize || 5,
    battle_type: data.settings?.battleType || 'casual',
    is_private: data.settings?.isPrivate || false,
    password_hash: data.settings?.password ? data.settings.password : null,
    status: 'waiting'
  })
};

// RoomPlayer model
export const RoomPlayerModel = {
  fromRow: (row) => ({
    roomId: row.room_id,
    playerId: row.player_id,
    username: row.username,
    faction: row.faction,
    elo: row.elo,
    team: row.team,
    isReady: row.is_ready,
    isHost: row.is_host,
    joinedAt: row.joined_at
  })
};

// Battle model
export const BattleModel = {
  fromRow: (row) => ({
    id: row.id,
    roomId: row.room_id,
    battleType: row.battle_type,
    mapId: row.map_id,
    status: row.status,
    winnerFaction: row.winner_faction,
    startedAt: row.started_at,
    endedAt: row.ended_at,
    duration: row.ended_at && row.started_at 
      ? Math.floor((new Date(row.ended_at) - new Date(row.started_at)) / 1000)
      : null,
    replayData: row.replay_data,
    createdAt: row.created_at
  })
};

// BattleParticipant model
export const BattleParticipantModel = {
  fromRow: (row) => ({
    id: row.id,
    battleId: row.battle_id,
    playerId: row.player_id,
    username: row.username,
    faction: row.faction,
    team: row.team,
    result: row.result,
    eloChange: row.elo_change,
    playerEloBefore: row.player_elo_before,
    playerEloAfter: row.player_elo_after,
    stats: row.stats || []
  })
};

// BattleStats model
export const BattleStatsModel = {
  fromRow: (row) => ({
    id: row.id,
    battleId: row.battle_id,
    participantId: row.participant_id,
    unitId: row.unit_id,
    kills: row.kills,
    deaths: row.deaths,
    damageDealt: row.damage_dealt,
    damageReceived: row.damage_received,
    turnsActive: row.turns_active
  })
};

// Season model
export const SeasonModel = {
  fromRow: (row) => ({
    id: row.id,
    seasonNumber: row.season_number,
    name: row.name,
    startDate: row.start_date,
    endDate: row.end_date,
    isActive: row.is_active
  })
};

// SeasonalRanking model
export const SeasonalRankingModel = {
  fromRow: (row) => ({
    id: row.id,
    seasonId: row.season_id,
    playerId: row.player_id,
    username: row.username,
    peakElo: row.peak_elo,
    gamesPlayed: row.games_played,
    wins: row.wins,
    losses: row.losses,
    finalRank: row.final_rank
  })
};

// Leaderboard entry model
export const LeaderboardEntryModel = {
  fromRow: (row, rank) => ({
    rank,
    playerId: row.id,
    username: row.username,
    faction: row.faction,
    elo: row.elo,
    wins: row.wins,
    losses: row.losses,
    winRate: row.wins + row.losses > 0 
      ? (row.wins / (row.wins + row.losses)).toFixed(3) 
      : '0.000',
    gamesPlayed: row.wins + row.losses
  })
};

// RoomMessage model
export const RoomMessageModel = {
  fromRow: (row) => ({
    id: row.id,
    roomId: row.room_id,
    playerId: row.player_id,
    username: row.username,
    message: row.message,
    createdAt: row.created_at
  })
};
