import express from 'express';
import db from '../database/db.js';
import { authenticate } from '../middleware/auth.js';
import { validatePagination } from '../middleware/validation.js';
import leaderboardService from '../services/leaderboardService.js';

const router = express.Router();

/**
 * GET /api/leaderboard/global
 * Get global leaderboard
 */
router.get('/global', validatePagination, (req, res) => {
  try {
    const { limit, offset } = req.pagination;
    
    const leaderboard = leaderboardService.getGlobalLeaderboard(limit, offset);
    
    res.json({
      leaderboard,
      pagination: {
        limit,
        offset,
        hasMore: leaderboard.length === limit
      }
    });
  } catch (error) {
    console.error('Global leaderboard error:', error);
    res.status(500).json({
      error: 'Failed to get global leaderboard',
      message: error.message
    });
  }
});

/**
 * GET /api/leaderboard/faction/:faction
 * Get faction-specific leaderboard
 */
router.get('/faction/:faction', validatePagination, (req, res) => {
  try {
    const { faction } = req.params;
    const { limit, offset } = req.pagination;
    
    const leaderboard = leaderboardService.getFactionLeaderboard(faction, limit, offset);
    
    res.json({
      faction,
      leaderboard,
      pagination: {
        limit,
        offset,
        hasMore: leaderboard.length === limit
      }
    });
  } catch (error) {
    console.error('Faction leaderboard error:', error);
    res.status(500).json({
      error: 'Failed to get faction leaderboard',
      message: error.message
    });
  }
});

/**
 * GET /api/leaderboard/season
 * Get seasonal leaderboard
 */
router.get('/season', validatePagination, (req, res) => {
  try {
    const { season, limit, offset } = req.query;
    const targetSeason = season ? parseInt(season) : null;
    
    const leaderboard = leaderboardService.getSeasonalLeaderboard(
      targetSeason,
      parseInt(limit) || 50,
      parseInt(offset) || 0
    );
    
    const activeSeason = db.getActiveSeason();
    
    res.json({
      season: targetSeason || activeSeason?.season_number || 1,
      isActive: targetSeason === activeSeason?.season_number || !targetSeason,
      leaderboard,
      pagination: {
        limit: parseInt(limit) || 50,
        offset: parseInt(offset) || 0,
        hasMore: leaderboard.length === (parseInt(limit) || 50)
      }
    });
  } catch (error) {
    console.error('Seasonal leaderboard error:', error);
    res.status(500).json({
      error: 'Failed to get seasonal leaderboard',
      message: error.message
    });
  }
});

/**
 * GET /api/leaderboard/rank
 * Get current player's rank
 */
router.get('/rank', authenticate, (req, res) => {
  try {
    const { userId } = req.user;
    
    const player = db.getPlayerByUserId(userId);
    if (!player) {
      return res.status(404).json({ error: 'Player not found' });
    }
    
    const rankData = leaderboardService.getPlayerRank(player.id);
    
    if (!rankData) {
      return res.status(404).json({ error: 'Player not in leaderboard' });
    }
    
    res.json({
      rank: rankData.rank,
      totalPlayers: rankData.totalPlayers,
      percentile: rankData.percentile,
      player: {
        id: rankData.id,
        username: rankData.username,
        elo: rankData.elo,
        wins: rankData.wins,
        losses: rankData.losses,
        winRate: rankData.win_rate
      }
    });
  } catch (error) {
    console.error('Get rank error:', error);
    res.status(500).json({
      error: 'Failed to get rank',
      message: error.message
    });
  }
});

/**
 * GET /api/leaderboard/stats
 * Get leaderboard statistics
 */
router.get('/stats', (req, res) => {
  try {
    const stats = leaderboardService.getLeaderboardStats();
    
    res.json({
      totalPlayers: stats.totalPlayers,
      averageElo: stats.averageElo,
      topElo: stats.topElo,
      factionDistribution: stats.factionDistribution.map(f => ({
        faction: f.faction,
        count: f.count,
        averageElo: Math.round(f.avg_elo || 0)
      }))
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
 * GET /api/leaderboard/seasons
 * Get all seasons
 */
router.get('/seasons', (req, res) => {
  try {
    const seasons = db.getAllSeasons();
    const activeSeason = db.getActiveSeason();
    
    res.json({
      seasons: seasons.map(s => ({
        id: s.id,
        seasonNumber: s.season_number,
        name: s.name,
        startDate: s.start_date,
        endDate: s.end_date,
        isActive: s.is_active === 1
      })),
      activeSeason: activeSeason ? {
        id: activeSeason.id,
        seasonNumber: activeSeason.season_number,
        name: activeSeason.name,
        startDate: activeSeason.start_date,
        endDate: activeSeason.end_date
      } : null
    });
  } catch (error) {
    console.error('Get seasons error:', error);
    res.status(500).json({
      error: 'Failed to get seasons',
      message: error.message
    });
  }
});

export default router;
