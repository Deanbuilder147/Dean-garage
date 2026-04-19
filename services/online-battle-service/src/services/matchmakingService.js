import db from '../database/db.js';
import config from '../config/index.js';

// In-memory queue storage for fast matchmaking
const matchmakingQueues = {
  ranked: new Map(), // playerId -> { playerId, elo, faction, joinedAt }
  casual: new Map()
};

// Queue timers for timeout handling
const queueTimers = new Map();

/**
 * Add player to matchmaking queue
 */
export function joinQueue(playerId, queueType, elo, faction, preferredMap = null) {
  // Remove from any existing queue first
  leaveQueue(playerId);
  
  const queueEntry = {
    playerId,
    elo,
    faction,
    preferredMap,
    joinedAt: Date.now()
  };
  
  // Add to in-memory queue
  if (queueType === 'ranked') {
    matchmakingQueues.ranked.set(playerId, queueEntry);
  } else {
    matchmakingQueues.casual.set(playerId, queueEntry);
  }
  
  // Add to database for persistence
  db.addToQueue(playerId, queueType, elo, faction, preferredMap, 1);
  
  // Set timeout for queue
  const timer = setTimeout(() => {
    if (isInQueue(playerId, queueType)) {
      leaveQueue(playerId);
      // Notify player of timeout (would be via WebSocket in real implementation)
    }
  }, config.matchmakingTimeout);
  
  queueTimers.set(`${playerId}:${queueType}`, timer);
  
  return queueEntry;
}

/**
 * Remove player from queue
 */
export function leaveQueue(playerId, queueType = null) {
  if (queueType) {
    matchmakingQueues[queueType]?.delete(playerId);
    db.removeFromQueue(playerId, queueType);
    
    const timerKey = `${playerId}:${queueType}`;
    if (queueTimers.has(timerKey)) {
      clearTimeout(queueTimers.get(timerKey));
      queueTimers.delete(timerKey);
    }
  } else {
    // Remove from all queues
    ['ranked', 'casual'].forEach(type => {
      matchmakingQueues[type]?.delete(playerId);
      db.removeFromQueue(playerId, type);
      
      const timerKey = `${playerId}:${type}`;
      if (queueTimers.has(timerKey)) {
        clearTimeout(queueTimers.get(timerKey));
        queueTimers.delete(timerKey);
      }
    });
  }
}

/**
 * Check if player is in queue
 */
export function isInQueue(playerId, queueType) {
  return matchmakingQueues[queueType]?.has(playerId) || false;
}

/**
 * Get queue status for player
 */
export function getQueueStatus(playerId) {
  const status = {};
  
  ['ranked', 'casual'].forEach(type => {
    if (matchmakingQueues[type]?.has(playerId)) {
      const entry = matchmakingQueues[type].get(playerId);
      status[type] = {
        position: getQueuePosition(playerId, type),
        waitTime: Date.now() - entry.joinedAt,
        elo: entry.elo
      };
    }
  });
  
  return status;
}

/**
 * Get player position in queue
 */
export function getQueuePosition(playerId, queueType) {
  const queue = matchmakingQueues[queueType];
  if (!queue) return -1;
  
  const sorted = Array.from(queue.values()).sort((a, b) => {
    // Sort by ELO difference for ranked (match similar ELO first)
    if (queueType === 'ranked') {
      return a.joinedAt - b.joinedAt;
    }
    return a.joinedAt - b.joinedAt;
  });
  
  const position = sorted.findIndex(p => p.playerId === playerId);
  return position >= 0 ? position + 1 : -1;
}

/**
 * Find match for player
 * Returns array of matched players or null if no match found
 */
export function findMatch(playerId, queueType) {
  const queue = matchmakingQueues[queueType];
  if (!queue) return null;
  
  const player = queue.get(playerId);
  if (!player) return null;
  
  const allPlayers = Array.from(queue.values());
  
  if (queueType === 'ranked') {
    // For ranked: find player with similar ELO (within 200 points)
    const eloRange = 200;
    const candidates = allPlayers.filter(p => 
      p.playerId !== playerId && 
      Math.abs(p.elo - player.elo) <= eloRange
    );
    
    if (candidates.length > 0) {
      // Pick the one who has been waiting longest
      candidates.sort((a, b) => a.joinedAt - b.joinedAt);
      const opponent = candidates[0];
      
      // Remove both from queue
      leaveQueue(playerId, queueType);
      leaveQueue(opponent.playerId, queueType);
      
      return [player, opponent];
    }
  } else {
    // For casual: just find any available player
    const opponent = allPlayers.find(p => p.playerId !== playerId);
    
    if (opponent) {
      leaveQueue(playerId, queueType);
      leaveQueue(opponent.playerId, queueType);
      
      return [player, opponent];
    }
  }
  
  return null;
}

/**
 * Run matchmaking cycle
 * Called periodically to match players
 */
export function runMatchmakingCycle() {
  const matches = [];
  
  ['ranked', 'casual'].forEach(queueType => {
    const queue = matchmakingQueues[queueType];
    if (!queue) return;
    
    const processed = new Set();
    
    for (const playerId of queue.keys()) {
      if (processed.has(playerId)) continue;
      
      const match = findMatch(playerId, queueType);
      if (match) {
        processed.add(playerId);
        processed.add(match[1].playerId);
        matches.push({
          queueType,
          players: match
        });
      }
    }
  });
  
  return matches;
}

/**
 * Get queue statistics
 */
export function getQueueStats() {
  return {
    ranked: {
      count: matchmakingQueues.ranked.size,
      averageWaitTime: calculateAverageWaitTime('ranked'),
      eloRange: getEloRange('ranked')
    },
    casual: {
      count: matchmakingQueues.casual.size,
      averageWaitTime: calculateAverageWaitTime('casual')
    }
  };
}

/**
 * Calculate average wait time for queue
 */
function calculateAverageWaitTime(queueType) {
  const queue = matchmakingQueues[queueType];
  if (!queue || queue.size === 0) return 0;
  
  const now = Date.now();
  const total = Array.from(queue.values()).reduce((sum, p) => sum + (now - p.joinedAt), 0);
  return Math.round(total / queue.size);
}

/**
 * Get ELO range in queue
 */
function getEloRange(queueType) {
  const queue = matchmakingQueues[queueType];
  if (!queue || queue.size === 0) return { min: 0, max: 0, avg: 0 };
  
  const elos = Array.from(queue.values()).map(p => p.elo);
  return {
    min: Math.min(...elos),
    max: Math.max(...elos),
    avg: Math.round(elos.reduce((a, b) => a + b, 0) / elos.length)
  };
}

/**
 * Clean up expired queue entries
 */
export function cleanupExpiredQueues() {
  const now = Date.now();
  const maxAge = config.matchmakingTimeout;
  
  ['ranked', 'casual'].forEach(queueType => {
    for (const [playerId, entry] of matchmakingQueues[queueType].entries()) {
      if (now - entry.joinedAt > maxAge) {
        leaveQueue(playerId, queueType);
      }
    }
  });
}

export default {
  joinQueue,
  leaveQueue,
  isInQueue,
  getQueueStatus,
  getQueuePosition,
  findMatch,
  runMatchmakingCycle,
  getQueueStats,
  cleanupExpiredQueues
};
