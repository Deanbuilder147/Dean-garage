/**
 * 机甲战棋游戏 - 统一端口配置
 * 
 * 所有服务端口集中管理，确保前后端一致
 * 
 * @team 所有团队成员共享此配置
 */

// 服务端口配置 (后端服务)
const SERVICE_PORTS = {
  AUTH: 3001,      // 认证服务
  HANGAR: 3002,    // 格纳库/棋子服务
  MAP: 3003,       // 地图服务
  COMBAT: 3004,    // 战斗服务 (含 WebSocket)
  COMM: 3005,      // 通信服务
};

// 前端端口
const FRONTEND_PORT = 8081;

// 数据库文件路径
const DB_PATHS = {
  AUTH: './data/auth.db',
  HANGAR: './data/hangar.db',
  MAP: './data/map.db',
  COMBAT: './data/combat.db',
  COMM: './data/comm.db',
};

// 服务名称映射
const SERVICE_NAMES = {
  [SERVICE_PORTS.AUTH]: 'auth-service',
  [SERVICE_PORTS.HANGAR]: 'hangar-service',
  [SERVICE_PORTS.MAP]: 'map-service',
  [SERVICE_PORTS.COMBAT]: 'combat-service',
  [SERVICE_PORTS.COMM]: 'comm-service',
};

// CORS 允许的前端地址
const ALLOWED_ORIGINS = [
  `http://localhost:${FRONTEND_PORT}`,
  'http://localhost:8080',
];

module.exports = {
  SERVICE_PORTS,
  FRONTEND_PORT,
  DB_PATHS,
  SERVICE_NAMES,
  ALLOWED_ORIGINS,
};
