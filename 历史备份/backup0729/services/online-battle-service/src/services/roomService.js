import db from '../database/db.js';
import config from '../config/index.js';

// In-memory room management
const activeRooms = new Map(); // roomId -> room data with players
const roomWebSockets = new Map(); // roomId -> Set of WebSocket connections

/**
 * Create a new battle room
 */
export function createRoom(roomData, creatorId) {
  const room = db.createBattleRoom({
    ...roomData,
    creatorId
  });
  
  // Add to in-memory cache
  activeRooms.set(room.id, {
    ...room,
    rules: JSON.parse(room.rules || '{}'),
    players: []
  });
  
  // Add creator to room
  addPlayerToRoom(room.id, creatorId, 0);
  
  return getRoom(room.id);
}

/**
 * Get room by ID
 */
export function getRoom(roomId) {
  const cached = activeRooms.get(roomId);
  if (cached) {
    return cached;
  }
  
  const room = db.getBattleRoom(roomId);
  if (!room) return null;
  
  const players = db.getBattleRoomPlayers(roomId);
  
  const roomData = {
    ...room,
    rules: JSON.parse(room.rules || '{}'),
    players
  };
  
  activeRooms.set(roomId, roomData);
  return roomData;
}

/**
 * Get all active rooms
 */
export function getActiveRooms() {
  const rooms = db.getActiveBattleRooms();
  return rooms.map(room => ({
    ...room,
    rules: JSON.parse(room.rules || '{}'),
    playerCount: db.getBattleRoomPlayers(room.id).length
  }));
}

/**
 * Add player to room
 */
export function addPlayerToRoom(roomId, playerId, team = 0) {
  const room = db.getBattleRoom(roomId);
  if (!room) {
    return { success: false, error: 'Room not found' };
  }
  
  // Check if room is full
  const currentPlayers = db.getBattleRoomPlayers(roomId).length;
  if (currentPlayers >= room.max_players) {
    return { success: false, error: 'Room is full' };
  }
  
  // Check if room has password
  if (room.password) {
    return { success: false, error: 'Room requires password' };
  }
  
  const result = db.addPlayerToRoom(roomId, playerId, team);
  if (!result) {
    return { success: false, error: 'Player already in room' };
  }
  
  // Update cache
  activeRooms.delete(roomId);
  
  // Notify via comm-service (would be done via WebSocket)
  notifyRoomUpdate(roomId);
  
  return { success: true };
}

/**
 * Remove player from room
 */
export function removePlayerFromRoom(roomId, playerId) {
  const room = db.getBattleRoom(roomId);
  if (!room) {
    return { success: false, error: 'Room not found' };
  }
  
  // Only creator can remove others, or player can remove themselves
  if (room.creator_id !== playerId) {
    const players = db.getBattleRoomPlayers(roomId);
    const isPlayer = players.some(p => p.player_id === playerId);
    if (!isPlayer) {
      return { success: false, error: 'Player not in room' };
    }
  }
  
  db.removePlayerFromRoom(roomId, playerId);
  
  // If creator leaves, delete room or transfer ownership
  if (room.creator_id === playerId) {
    const remainingPlayers = db.getBattleRoomPlayers(roomId);
    if (remainingPlayers.length === 0) {
      deleteRoom(roomId);
    } else {
      // Transfer ownership to first joined player
      const newCreator = remainingPlayers[0];
      db.updateBattleRoom(roomId, { creatorId: newCreator.player_id });
    }
  } else {
    // Update cache
    activeRooms.delete(roomId);
    notifyRoomUpdate(roomId);
  }
  
  return { success: true };
}

/**
 * Update player readiness
 */
export function setPlayerReady(roomId, playerId, isReady) {
  const room = db.getBattleRoom(roomId);
  if (!room) {
    return { success: false, error: 'Room not found' };
  }
  
  db.updatePlayerReadiness(roomId, playerId, isReady);
  
  // Update cache
  activeRooms.delete(roomId);
  notifyRoomUpdate(roomId);
  
  return { success: true };
}

/**
 * Check if all players are ready
 */
export function areAllPlayersReady(roomId) {
  const players = db.getBattleRoomPlayers(roomId);
  if (players.length === 0) return false;
  
  // Need at least 2 players
  if (players.length < 2) return false;
  
  return players.every(p => p.is_ready === 1);
}

/**
 * Start battle in room
 */
export function startRoomBattle(roomId) {
  const room = db.getBattleRoom(roomId);
  if (!room) {
    return { success: false, error: 'Room not found' };
  }
  
  // Check if all players are ready
  if (!areAllPlayersReady(roomId)) {
    return { success: false, error: 'Not all players are ready' };
  }
  
  // Check minimum players
  const players = db.getBattleRoomPlayers(roomId);
  if (players.length < 2) {
    return { success: false, error: 'Need at least 2 players' };
  }
  
  // Update room status
  db.updateBattleRoom(roomId, {
    status: 'starting',
    startedAt: new Date().toISOString()
  });
  
  // Create battle record
  const battle = db.createBattle({
    battleType: room.room_type,
    roomId: room.id,
    mapId: room.map_id
  });
  
  // Add participants to battle
  players.forEach(player => {
    db.addBattleParticipant(battle.id, player.player_id, player.faction, player.team);
  });
  
  // Update cache
  activeRooms.delete(roomId);
  
  return {
    success: true,
    battleId: battle.id,
    mapId: room.map_id,
    players
  };
}

/**
 * Delete room
 */
export function deleteRoom(roomId) {
  db.deleteBattleRoom(roomId);
  activeRooms.delete(roomId);
  roomWebSockets.delete(roomId);
  
  return { success: true };
}

/**
 * Add chat message to room
 */
export function addRoomChat(roomId, playerId, message) {
  const room = db.getBattleRoom(roomId);
  if (!room) {
    return { success: false, error: 'Room not found' };
  }
  
  const result = db.addRoomChat(roomId, playerId, message);
  
  // Notify via WebSocket (would broadcast to room)
  notifyRoomChat(roomId, {
    playerId,
    message,
    timestamp: new Date().toISOString()
  });
  
  return { success: true, id: result.lastInsertRowid };
}

/**
 * Get room chat history
 */
export function getRoomChat(roomId, limit = 50) {
  return db.getRoomChat(roomId, limit);
}

/**
 * Join room with password
 */
export function joinRoomWithPassword(roomId, playerId, password) {
  const room = db.getBattleRoom(roomId);
  if (!room) {
    return { success: false, error: 'Room not found' };
  }
  
  if (!room.password || room.password !== password) {
    return { success: false, error: 'Invalid password' };
  }
  
  return addPlayerToRoom(roomId, playerId);
}

/**
 * Update room settings (creator only)
 */
export function updateRoomSettings(roomId, playerId, settings) {
  const room = db.getBattleRoom(roomId);
  if (!room) {
    return { success: false, error: 'Room not found' };
  }
  
  if (room.creator_id !== playerId) {
    return { success: false, error: 'Only room creator can update settings' };
  }
  
  // Can only update certain fields
  const allowedUpdates = ['name', 'maxPlayers', 'mapId', 'rules', 'isPrivate'];
  const updates = {};
  
  for (const [key, value] of Object.entries(settings)) {
    if (allowedUpdates.includes(key)) {
      const dbKey = key === 'maxPlayers' ? 'maxPlayers' :
                    key === 'mapId' ? 'mapId' :
                    key === 'isPrivate' ? 'isPrivate' :
                    key === 'rules' ? 'rules' : 'name';
      updates[dbKey] = value;
    }
  }
  
  // Convert rules to JSON string if provided
  if (updates.rules && typeof updates.rules === 'object') {
    updates.rules = JSON.stringify(updates.rules);
  }
  
  db.updateBattleRoom(roomId, updates);
  activeRooms.delete(roomId);
  notifyRoomUpdate(roomId);
  
  return { success: true };
}

/**
 * WebSocket notification helpers
 */
function notifyRoomUpdate(roomId) {
  // In production, this would broadcast via WebSocket through comm-service
  // For now, just a placeholder
  const wsSet = roomWebSockets.get(roomId);
  if (wsSet && wsSet.size > 0) {
    const room = getRoom(roomId);
    wsSet.forEach(ws => {
      if (ws.readyState === 1) { // WebSocket.OPEN
        ws.send(JSON.stringify({
          type: 'room_update',
          roomId,
          data: room
        }));
      }
    });
  }
}

function notifyRoomChat(roomId, chatData) {
  const wsSet = roomWebSockets.get(roomId);
  if (wsSet && wsSet.size > 0) {
    wsSet.forEach(ws => {
      if (ws.readyState === 1) {
        ws.send(JSON.stringify({
          type: 'room_chat',
          roomId,
          data: chatData
        }));
      }
    });
  }
}

/**
 * Register WebSocket for room
 */
export function registerRoomWebSocket(roomId, ws) {
  if (!roomWebSockets.has(roomId)) {
    roomWebSockets.set(roomId, new Set());
  }
  roomWebSockets.get(roomId).add(ws);
}

/**
 * Unregister WebSocket for room
 */
export function unregisterRoomWebSocket(roomId, ws) {
  const wsSet = roomWebSockets.get(roomId);
  if (wsSet) {
    wsSet.delete(ws);
    if (wsSet.size === 0) {
      roomWebSockets.delete(roomId);
    }
  }
}

export default {
  createRoom,
  getRoom,
  getActiveRooms,
  addPlayerToRoom,
  removePlayerFromRoom,
  setPlayerReady,
  areAllPlayersReady,
  startRoomBattle,
  deleteRoom,
  addRoomChat,
  getRoomChat,
  joinRoomWithPassword,
  updateRoomSettings,
  registerRoomWebSocket,
  unregisterRoomWebSocket
};
