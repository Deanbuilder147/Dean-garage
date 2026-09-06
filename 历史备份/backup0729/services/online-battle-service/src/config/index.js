import dotenv from 'dotenv';

dotenv.config();

const config = {
  port: parseInt(process.env.PORT) || 3006,
  jwtSecret: process.env.JWT_SECRET,
  authServiceUrl: process.env.AUTH_SERVICE_URL || 'http://localhost:3001',
  combatServiceUrl: process.env.COMBAT_SERVICE_URL || 'http://localhost:3003',
  mapServiceUrl: process.env.MAP_SERVICE_URL || 'http://localhost:3004',
  commServiceUrl: process.env.COMM_SERVICE_URL || 'http://localhost:3005',
  wsPort: parseInt(process.env.WS_PORT) || 3006,
  databasePath: process.env.DATABASE_PATH || './data/battle.db',
  eloKFactor: parseInt(process.env.ELO_K_FACTOR) || 32,
  matchmakingTimeout: parseInt(process.env.MATCHMAKING_TIMEOUT) || 120000,
  roomMaxPlayers: parseInt(process.env.ROOM_MAX_PLAYERS) || 8,
  seasonDuration: parseInt(process.env.SEASON_DURATION_DAYS) || 30
};

// 强制要求 JWT_SECRET
if (!config.jwtSecret) {
  throw new Error('[配置错误] JWT_SECRET 环境变量必须设置！');
}

export default config;
