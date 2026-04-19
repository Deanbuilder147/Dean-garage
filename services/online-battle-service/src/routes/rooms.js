import express from 'express';
import db from '../database/db.js';
import { authenticate, checkRoomParticipant, checkRoomOwner, canActInRoom, canManageRoom } from '../middleware/auth.js';
import { validateRoomCreation } from '../middleware/validation.js';
import roomService from '../services/roomService.js';

const router = express.Router();

/**
 * GET /api/rooms
 * Get all active battle rooms
 */
router.get('/', authenticate, (req, res) => {
  try {
    const rooms = roomService.getActiveRooms();
    
    res.json({
      rooms: rooms.map(room => ({
        id: room.id,
        name: room.name,
        roomType: room.room_type,
        currentPlayers: room.playerCount,
        maxPlayers: room.max_players,
        mapId: room.map_id,
        isPrivate: room.is_private === 1,
        status: room.status,
        createdAt: room.created_at
      }))
    });
  } catch (error) {
    console.error('Get rooms error:', error);
    res.status(500).json({
      error: 'Failed to get rooms',
      message: error.message
    });
  }
});

/**
 * POST /api/rooms
 * Create a new battle room
 */
router.post('/', authenticate, validateRoomCreation, (req, res) => {
  try {
    const { userId, username } = req.user;
    const { name, roomType, maxPlayers, mapId, rules, teamSize, isPrivate, password } = req.body;
    
    // Get or create player
    const player = db.createOrGetPlayer(userId, username);
    
    // Create room
    const room = roomService.createRoom({
      name,
      roomType: roomType || 'custom',
      maxPlayers: maxPlayers || 4,
      mapId: mapId || 'default',
      rules: rules || {},
      teamSize: teamSize || 2,
      isPrivate: isPrivate || false,
      password: password || null
    }, player.id);
    
    res.status(201).json({
      message: 'Room created successfully',
      room: {
        id: room.id,
        name: room.name,
        roomType: room.room_type,
        maxPlayers: room.max_players,
        currentPlayers: 1,
        mapId: room.map_id,
        isPrivate: room.is_private === 1,
        status: room.status,
        creator: {
          id: player.id,
          username: player.username
        }
      }
    });
  } catch (error) {
    console.error('Create room error:', error);
    res.status(500).json({
      error: 'Failed to create room',
      message: error.message
    });
  }
});

/**
 * GET /api/rooms/:roomId
 * Get room details
 */
router.get('/:roomId', authenticate, checkRoomParticipant, (req, res) => {
  try {
    const room = roomService.getRoom(req.params.roomId);
    
    if (!room) {
      return res.status(404).json({ error: 'Room not found' });
    }
    
    res.json({
      room: {
        id: room.id,
        name: room.name,
        roomType: room.room_type,
        maxPlayers: room.max_players,
        currentPlayers: room.players?.length || 0,
        mapId: room.map_id,
        rules: room.rules,
        teamSize: room.team_size,
        isPrivate: room.is_private === 1,
        status: room.status,
        creatorId: room.creator_id,
        players: (room.players || []).map(p => ({
          id: p.player_id,
          username: p.username,
          faction: p.faction,
          elo: p.elo,
          team: p.team,
          isReady: p.is_ready === 1
        })),
        createdAt: room.created_at,
        startedAt: room.started_at
      }
    });
  } catch (error) {
    console.error('Get room error:', error);
    res.status(500).json({
      error: 'Failed to get room',
      message: error.message
    });
  }
});

/**
 * POST /api/rooms/:roomId/join
 * Join a room
 */
router.post('/:roomId/join', authenticate, (req, res) => {
  try {
    const { userId } = req.user;
    const { roomId } = req.params;
    const { password, team } = req.body;
    
    // Get or create player
    const player = db.createOrGetPlayer(userId, req.user.username);
    
    let result;
    
    if (password) {
      result = roomService.joinRoomWithPassword(roomId, player.id, password);
    } else {
      result = roomService.addPlayerToRoom(roomId, player.id, team || 0);
    }
    
    if (!result.success) {
      return res.status(400).json({
        error: 'Failed to join room',
        message: result.error
      });
    }
    
    res.json({
      message: 'Joined room successfully',
      roomId
    });
  } catch (error) {
    console.error('Join room error:', error);
    res.status(500).json({
      error: 'Failed to join room',
      message: error.message
    });
  }
});

/**
 * POST /api/rooms/:roomId/leave
 * Leave a room
 */
router.post('/:roomId/leave', authenticate, (req, res) => {
  try {
    const { userId } = req.user;
    const { roomId } = req.params;
    
    const player = db.getPlayerByUserId(userId);
    if (!player) {
      return res.status(404).json({ error: 'Player not found' });
    }
    
    const result = roomService.removePlayerFromRoom(roomId, player.id);
    
    if (!result.success) {
      return res.status(400).json({
        error: 'Failed to leave room',
        message: result.error
      });
    }
    
    res.json({
      message: 'Left room successfully',
      roomId
    });
  } catch (error) {
    console.error('Leave room error:', error);
    res.status(500).json({
      error: 'Failed to leave room',
      message: error.message
    });
  }
});

/**
 * POST /api/rooms/:roomId/ready
 * Set player readiness status
 */
router.post('/:roomId/ready', authenticate, checkRoomParticipant, (req, res) => {
  try {
    const { userId } = req.user;
    const { roomId } = req.params;
    const { isReady } = req.body;
    
    const player = db.getPlayerByUserId(userId);
    if (!player) {
      return res.status(404).json({ error: 'Player not found' });
    }
    
    const result = roomService.setPlayerReady(roomId, player.id, isReady !== false);
    
    if (!result.success) {
      return res.status(400).json({
        error: 'Failed to set ready status',
        message: result.error
      });
    }
    
    res.json({
      message: 'Ready status updated',
      isReady: isReady !== false
    });
  } catch (error) {
    console.error('Ready status error:', error);
    res.status(500).json({
      error: 'Failed to set ready status',
      message: error.message
    });
  }
});

/**
 * POST /api/rooms/:roomId/start
 * Start the battle (creator only)
 */
router.post('/:roomId/start', authenticate, canManageRoom, (req, res) => {
  try {
    const { roomId } = req.params;
    
    const result = roomService.startRoomBattle(roomId);
    
    if (!result.success) {
      return res.status(400).json({
        error: 'Failed to start battle',
        message: result.error
      });
    }
    
    // Here we would notify combat-service to initialize the battle
    // For now, just return the battle info
    
    res.json({
      message: 'Battle starting',
      battleId: result.battleId,
      mapId: result.mapId,
      players: result.players.map(p => ({
        id: p.player_id,
        username: p.username,
        faction: p.faction,
        team: p.team
      }))
    });
  } catch (error) {
    console.error('Start battle error:', error);
    res.status(500).json({
      error: 'Failed to start battle',
      message: error.message
    });
  }
});

/**
 * PUT /api/rooms/:roomId/settings
 * Update room settings (creator only)
 */
router.put('/:roomId/settings', authenticate, canManageRoom, (req, res) => {
  try {
    const { userId } = req.user;
    const { roomId } = req.params;
    
    const player = db.getPlayerByUserId(userId);
    if (!player) {
      return res.status(404).json({ error: 'Player not found' });
    }
    
    const result = roomService.updateRoomSettings(roomId, player.id, req.body);
    
    if (!result.success) {
      return res.status(400).json({
        error: 'Failed to update settings',
        message: result.error
      });
    }
    
    res.json({
      message: 'Settings updated successfully'
    });
  } catch (error) {
    console.error('Update settings error:', error);
    res.status(500).json({
      error: 'Failed to update settings',
      message: error.message
    });
  }
});

/**
 * DELETE /api/rooms/:roomId
 * Delete a room (creator only)
 */
router.delete('/:roomId', authenticate, canManageRoom, (req, res) => {
  try {
    const { roomId } = req.params;
    
    roomService.deleteRoom(roomId);
    
    res.json({
      message: 'Room deleted successfully'
    });
  } catch (error) {
    console.error('Delete room error:', error);
    res.status(500).json({
      error: 'Failed to delete room',
      message: error.message
    });
  }
});

/**
 * GET /api/rooms/:roomId/chat
 * Get room chat history
 */
router.get('/:roomId/chat', authenticate, checkRoomParticipant, (req, res) => {
  try {
    const { roomId } = req.params;
    const { limit } = req.query;
    
    const messages = roomService.getRoomChat(roomId, parseInt(limit) || 50);
    
    res.json({
      messages: messages.map(msg => ({
        id: msg.id,
        playerId: msg.player_id,
        username: msg.username,
        message: msg.message,
        createdAt: msg.created_at
      }))
    });
  } catch (error) {
    console.error('Get chat error:', error);
    res.status(500).json({
      error: 'Failed to get chat',
      message: error.message
    });
  }
});

/**
 * POST /api/rooms/:roomId/chat
 * Send chat message to room
 */
router.post('/:roomId/chat', authenticate, checkRoomParticipant, (req, res) => {
  try {
    const { roomId } = req.params;
    const { message } = req.body;
    const { userId } = req.user;
    
    if (!message || message.trim().length === 0) {
      return res.status(400).json({
        error: 'Message required'
      });
    }
    
    if (message.length > 500) {
      return res.status(400).json({
        error: 'Message too long (max 500 characters)'
      });
    }
    
    const player = db.getPlayerByUserId(userId);
    if (!player) {
      return res.status(404).json({ error: 'Player not found' });
    }
    
    const result = roomService.addRoomChat(roomId, player.id, message);
    
    if (!result.success) {
      return res.status(400).json({
        error: 'Failed to send message',
        message: result.error
      });
    }
    
    res.json({
      message: 'Message sent',
      id: result.id
    });
  } catch (error) {
    console.error('Send chat error:', error);
    res.status(500).json({
      error: 'Failed to send message',
      message: error.message
    });
  }
});

export default router;
