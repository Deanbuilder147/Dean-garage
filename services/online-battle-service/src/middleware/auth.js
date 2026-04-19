import jwt from 'jsonwebtoken';
import config from '../config/index.js';

/**
 * Authentication middleware
 * Verifies JWT token and attaches user info to request object
 */
export const authenticate = (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;
    
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({ 
        error: 'Unauthorized',
        message: 'Missing or invalid authorization header'
      });
    }
    
    const token = authHeader.split(' ')[1];
    const decoded = jwt.verify(token, config.jwtSecret);
    
    // Attach user info to request object
    req.user = {
      userId: decoded.userId,
      username: decoded.username,
      role: decoded.role || 'player'
    };
    
    next();
  } catch (error) {
    console.error('Authentication failed:', error);
    
    if (error.name === 'JsonWebTokenError') {
      return res.status(401).json({ 
        error: 'Invalid token',
        message: 'Token format is invalid'
      });
    }
    
    if (error.name === 'TokenExpiredError') {
      return res.status(401).json({ 
        error: 'Token expired',
        message: 'Please login again'
      });
    }
    
    return res.status(401).json({ 
      error: 'Authentication failed',
      message: error.message
    });
  }
};

/**
 * Role check middleware
 * @param {Array} allowedRoles - List of allowed roles
 */
export const checkRole = (allowedRoles) => {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({ 
        error: 'Unauthorized',
        message: 'Please login first'
      });
    }
    
    if (!allowedRoles.includes(req.user.role)) {
      return res.status(403).json({ 
        error: 'Forbidden',
        message: `Required role: ${allowedRoles.join(', ')}`
      });
    }
    
    next();
  };
};

/**
 * Room participant check middleware
 * Ensures user is a participant of the specific room
 */
export const checkRoomParticipant = async (req, res, next) => {
  try {
    const roomId = req.params.roomId || req.params.id;
    const userId = req.user.userId;
    
    // Import db here to avoid circular dependency
    const db = (await import('../database/db.js')).default;
    
    const room = db.getBattleRoom(roomId);
    
    if (!room) {
      return res.status(404).json({ 
        error: 'Room not found',
        message: `Room ID ${roomId} does not exist`
      });
    }
    
    // Check if user is in the room
    const players = db.getBattleRoomPlayers(roomId);
    const isParticipant = players.some(p => p.player_id === userId);
    
    if (!isParticipant && req.user.role !== 'admin') {
      return res.status(403).json({ 
        error: 'Access denied',
        message: 'You are not in this room'
      });
    }
    
    next();
  } catch (error) {
    console.error('Room participant check failed:', error);
    return res.status(500).json({ 
      error: 'Internal server error',
      message: 'Unable to verify room access'
    });
  }
};

/**
 * Room owner check middleware
 * Ensures user is the room creator
 */
export const checkRoomOwner = async (req, res, next) => {
  try {
    const roomId = req.params.roomId || req.params.id;
    const userId = req.user.userId;
    
    const db = (await import('../database/db.js')).default;
    
    const room = db.getBattleRoom(roomId);
    
    if (!room) {
      return res.status(404).json({ 
        error: 'Room not found',
        message: `Room ID ${roomId} does not exist`
      });
    }
    
    // Check if user is the creator
    if (room.creator_id !== userId && req.user.role !== 'admin') {
      return res.status(403).json({ 
        error: 'Forbidden',
        message: 'Only room creator can perform this action'
      });
    }
    
    next();
  } catch (error) {
    console.error('Room owner check failed:', error);
    return res.status(500).json({ 
      error: 'Internal server error',
      message: 'Unable to verify room ownership'
    });
  }
};

/**
 * Combined middleware: Room participant + can act
 */
export const canActInRoom = [
  authenticate,
  checkRoomParticipant
];

/**
 * Combined middleware: Room owner + can manage
 */
export const canManageRoom = [
  authenticate,
  checkRoomOwner
];

export default {
  authenticate,
  checkRole,
  checkRoomParticipant,
  checkRoomOwner,
  canActInRoom,
  canManageRoom
};
