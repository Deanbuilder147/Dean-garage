import express from 'express';
import db from '../database/db.js';
import { authenticate } from '../middleware/auth.js';
import { validatePagination } from '../middleware/validation.js';
import battleHistoryService from '../services/battleHistoryService.js';

const router = express.Router();

/**
 * GET /api/battles/history
 * Get current player's battle history
 */
router.get('/history', authenticate, validatePagination, (req, res) => {
  try {
    const { userId } = req.user;
    const { limit, offset } = req.pagination;
    
    const player = db.getPlayerByUserId(userId);
    if (!player) {
      return res.status(404).json({ error: 'Player not found' });
    }
    
    const history = battleHistoryService.getPlayerBattleHistory(player.id, limit, offset);
    
    res.json({
      history: history.map(battle => ({
        id: battle.id,
        battleType: battle.battle_type,
        mapName: battle.map_name || 'Unknown',
        result: battle.result,
        faction: battle.faction,
        eloChange: battle.elo_change,
        endedAt: battle.ended_at,
        duration: battle.duration_seconds
      })),
      pagination: {
        limit,
        offset,
        hasMore: history.length === limit
      }
    });
  } catch (error) {
    console.error('Get history error:', error);
    res.status(500).json({
      error: 'Failed to get battle history',
      message: error.message
    });
  }
});

/**
 * GET /api/battles/:battleId
 * Get battle details
 */
router.get('/:battleId', authenticate, (req, res) => {
  try {
    const { battleId } = req.params;
    
    const battle = battleHistoryService.getBattleDetails(battleId);
    
    if (!battle) {
      return res.status(404).json({ error: 'Battle not found' });
    }
    
    res.json({
      battle: {
        id: battle.id,
        battleType: battle.battle_type,
        mapId: battle.map_id,
        status: battle.status,
        winnerFaction: battle.winner_faction,
        startedAt: battle.started_at,
        endedAt: battle.ended_at,
        duration: battle.duration_seconds,
        replayData: battle.replayData,
        participants: battle.participants.map(p => ({
          id: p.player_id,
          username: p.username,
          faction: p.faction,
          team: p.team,
          result: p.result,
          eloChange: p.elo_change,
          playerElo: p.player_elo,
          stats: p.stats.map(s => ({
            unitId: s.unit_id,
            kills: s.kills,
            deaths: s.deaths,
            damageDealt: s.damage_dealt,
            damageReceived: s.damage_received,
            turnsActive: s.turns_active
          }))
        }))
      }
    });
  } catch (error) {
    console.error('Get battle error:', error);
    res.status(500).json({
      error: 'Failed to get battle details',
      message: error.message
    });
  }
});

/**
 * GET /api/battles/recent
 * Get recent completed battles
 */
router.get('/recent', validatePagination, (req, res) => {
  try {
    const { limit, offset } = req.pagination;
    
    const battles = battleHistoryService.getRecentBattles(limit, offset);
    
    res.json({
      battles: battles.map(battle => ({
        id: battle.id,
        battleType: battle.battle_type,
        roomName: battle.room_name,
        mapName: battle.map_name,
        winnerName: battle.winner_name,
        winnerFaction: battle.winner_faction,
        endedAt: battle.ended_at,
        duration: battle.duration_seconds
      })),
      pagination: {
        limit,
        offset,
        hasMore: battles.length === limit
      }
    });
  } catch (error) {
    console.error('Get recent battles error:', error);
    res.status(500).json({
      error: 'Failed to get recent battles',
      message: error.message
    });
  }
});

/**
 * GET /api/battles/stats
 * Get current player's statistics
 */
router.get('/stats', authenticate, (req, res) => {
  try {
    const { userId } = req.user;
    
    const player = db.getPlayerByUserId(userId);
    if (!player) {
      return res.status(404).json({ error: 'Player not found' });
    }
    
    const stats = battleHistoryService.getPlayerStats(player.id);
    
    if (!stats) {
      return res.status(404).json({ error: 'Stats not found' });
    }
    
    res.json({
      stats
    });
  } catch (error) {
    console.error('Get stats error:', error);
    res.status(500).json({
      error: 'Failed to get stats',
      message: error.message
    });
  }
});

/**
 * POST /api/battles/:battleId/complete
 * Record battle completion (internal service endpoint)
 */
router.post('/:battleId/complete', (req, res) => {
  try {
    const { battleId } = req.params;
    const { winnerFaction, battleStats } = req.body;
    
    // This endpoint would be called by combat-service when a battle ends
    
    const result = battleHistoryService.recordBattleResult(
      battleId,
      winnerFaction,
      battleStats
    );
    
    if (!result.success) {
      return res.status(400).json({
        error: 'Failed to record battle result',
        message: result.error
      });
    }
    
    res.json({
      message: 'Battle result recorded',
      battleId: result.battleId,
      winnerFaction: result.winnerFaction,
      eloChanges: result.eloChanges
    });
  } catch (error) {
    console.error('Record battle error:', error);
    res.status(500).json({
      error: 'Failed to record battle result',
      message: error.message
    });
  }
});

export default router;
