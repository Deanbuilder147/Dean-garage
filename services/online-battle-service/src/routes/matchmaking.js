import express from 'express';
import db from '../database/db.js';
import { authenticate } from '../middleware/auth.js';
import { validateRequired, validateQueueJoin } from '../middleware/validation.js';
import matchmakingService from '../services/matchmakingService.js';

const router = express.Router();

/**
 * POST /api/matchmaking/queue
 * Join matchmaking queue
 */
router.post('/queue', authenticate, validateQueueJoin, async (req, res) => {
  try {
    const { queueType, preferredMap } = req.body;
    const { userId, username } = req.user;
    
    // Get or create player
    const player = db.createOrGetPlayer(userId, username);
    
    // Join queue
    const queueEntry = matchmakingService.joinQueue(
      player.id,
      queueType,
      player.elo,
      player.faction,
      preferredMap
    );
    
    res.json({
      message: 'Joined queue successfully',
      queueType,
      estimatedWaitTime: queueType === 'ranked' ? '30-60 seconds' : '10-30 seconds',
      position: matchmakingService.getQueuePosition(player.id, queueType)
    });
  } catch (error) {
    console.error('Join queue error:', error);
    res.status(500).json({
      error: 'Failed to join queue',
      message: error.message
    });
  }
});

/**
 * DELETE /api/matchmaking/queue
 * Leave matchmaking queue
 */
router.delete('/queue', authenticate, (req, res) => {
  try {
    const { queueType } = req.query;
    const { userId } = req.user;
    
    const player = db.getPlayerByUserId(userId);
    if (!player) {
      return res.status(404).json({ error: 'Player not found' });
    }
    
    matchmakingService.leaveQueue(player.id, queueType);
    
    res.json({ message: 'Left queue successfully' });
  } catch (error) {
    console.error('Leave queue error:', error);
    res.status(500).json({
      error: 'Failed to leave queue',
      message: error.message
    });
  }
});

/**
 * GET /api/matchmaking/queue/status
 * Get queue status for current player
 */
router.get('/queue/status', authenticate, (req, res) => {
  try {
    const { userId } = req.user;
    
    const player = db.getPlayerByUserId(userId);
    if (!player) {
      return res.status(404).json({ error: 'Player not found' });
    }
    
    const status = matchmakingService.getQueueStatus(player.id);
    
    res.json({
      inQueue: Object.keys(status).length > 0,
      queues: status
    });
  } catch (error) {
    console.error('Queue status error:', error);
    res.status(500).json({
      error: 'Failed to get queue status',
      message: error.message
    });
  }
});

/**
 * GET /api/matchmaking/stats
 * Get matchmaking statistics
 */
router.get('/stats', (req, res) => {
  try {
    const stats = matchmakingService.getQueueStats();
    
    res.json({
      queues: {
        ranked: {
          playersWaiting: stats.ranked.count,
          averageWaitTimeMs: stats.ranked.averageWaitTime,
          averageWaitTime: formatWaitTime(stats.ranked.averageWaitTime),
          eloRange: stats.ranked.eloRange
        },
        casual: {
          playersWaiting: stats.casual.count,
          averageWaitTimeMs: stats.casual.averageWaitTime,
          averageWaitTime: formatWaitTime(stats.casual.averageWaitTime)
        }
      }
    });
  } catch (error) {
    console.error('Stats error:', error);
    res.status(500).json({
      error: 'Failed to get stats',
      message: error.message
    });
  }
});

/**
 * Helper: Format wait time in human readable format
 */
function formatWaitTime(ms) {
  if (ms < 60000) {
    return `${Math.round(ms / 1000)}s`;
  }
  return `${Math.round(ms / 60000)}m ${Math.round((ms % 60000) / 1000)}s`;
}

export default router;
