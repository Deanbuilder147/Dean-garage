/**
 * 机甲战棋游戏 - 统一端口配置
 * 
 * 所有服务端口集中管理，确保前后端一致
 * 
 * @team 所有团队成员共享此配置
 */

// 服务端口配置 (后端服务)
export const SERVICE_PORTS = {
  AUTH: 3001,      // 认证服务
  HANGAR: 3002,    // 格纳库/棋子服务
  MAP: 3003,       // 地图服务
  COMBAT: 3004,    // 战斗服务 (含 WebSocket)
  COMM: 3005,      // 通信服务
};

// 前端端口
export const FRONTEND_PORT = 8081;

// API 基础路径 (前端使用，通过 Vite 代理转发)
export const API_BASE_URL = '/api';

// WebSocket 路径
export const WS_BASE_URL = '/';

// 服务健康检查端点
export const HEALTH_ENDPOINTS = {
  AUTH: '/api/auth/health',
  HANGAR: '/api/hangar/health',
  MAP: '/api/map/health',
  COMBAT: '/api/combat/health',
  COMM: '/api/comm/health',
};

// 服务描述 (用于调试和日志)
export const SERVICE_NAMES = {
  [SERVICE_PORTS.AUTH]: '认证服务 (auth-service)',
  [SERVICE_PORTS.HANGAR]: '格纳库服务 (hangar-service)',
  [SERVICE_PORTS.MAP]: '地图服务 (map-service)',
  [SERVICE_PORTS.COMBAT]: '战斗服务 (combat-service)',
  [SERVICE_PORTS.COMM]: '通信服务 (comm-service)',
};

// 导出完整配置对象
export default {
  ports: SERVICE_PORTS,
  frontend: FRONTEND_PORT,
  apiBase: API_BASE_URL,
  wsBase: WS_BASE_URL,
  health: HEALTH_ENDPOINTS,
  names: SERVICE_NAMES,
};
