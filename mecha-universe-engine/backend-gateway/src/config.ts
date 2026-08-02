/**
 * Phase 29-X — 大一统后端网关配置
 *
 * 集中管理所有环境变量与系统常量。
 * 端口 3006 统一承载全部核心业务逻辑。
 */

import { logger } from './utils/logger.js';
import { randomBytes } from 'node:crypto';

export const config = {
  port: parseInt(process.env.PORT || '3006', 10),
  nodeEnv: process.env.NODE_ENV || 'production',

  // JWT 认证
  jwt: {
    secret: process.env.JWT_SECRET || randomBytes(64).toString('hex'),
    expiresIn: process.env.JWT_EXPIRES_IN || '7d',
  },

  // bcrypt 加密轮数
  bcryptRounds: parseInt(process.env.BCRYPT_ROUNDS || '10', 10),

  // SQLite 数据库路径
  dbPath: process.env.DB_PATH || '/data/mecha-universe.db',

  // CORS 允许的前端源
  corsOrigins: (process.env.CORS_ORIGINS || 'http://localhost:5173,http://localhost:8081')
    .split(',').map(s => s.trim()),

  // 限流配置（trust proxy 开启后按真实客户端 IP 分桶，可放宽单用户额度）
  rateLimit: {
    windowMs: 15 * 60 * 1000, // 15 分钟
    max: parseInt(process.env.RATE_LIMIT_MAX || '300', 10), // 300 次/窗口/IP（单页初始化+上传+轮询有余量）
    loginMax: 10,               // 登录特殊限流
  },

  // 外部服务 URL（兼容期，逐步废弃）
  services: {
    combat: process.env.COMBAT_SERVICE_URL || 'http://localhost:3004',
    hangar: process.env.HANGAR_SERVICE_URL || 'http://localhost:3002',
    map: process.env.MAP_SERVICE_URL || 'http://localhost:3003',
  },

  // 观战缓冲
  watchBuffer: {
    maxSize: 200,
    flushIntervalMs: 5000,
  },

  // Phase 29-DataSecurity: PostgreSQL 双源桥接（复活老账号）
  postgres: {
    host: process.env.PG_HOST || 'mecha-battle-db',
    port: parseInt(process.env.PG_PORT || '5432', 10),
    database: process.env.PG_DATABASE || 'mecha_battle',
    user: process.env.PG_USER || 'mecha_user',
    password: process.env.PG_PASSWORD || 'mecha_user_password',
  },
} as const;

// 启动时打印安全摘要（隐藏密钥）
export function logConfigSummary(): void {
  logger.info({ msg: `
╔══════════════════════════════════════════════╗
║   Mechaverse Unified Engine — Backend Gateway ║
║   Phase 29-X 最高图腾令                        ║
╠══════════════════════════════════════════════╣
║   Port:      ${String(config.port).padEnd(35)}║
║   ENV:       ${config.nodeEnv.padEnd(35)}║
║   JWT Exp:   ${config.jwt.expiresIn.padEnd(35)}║
║   DB:        ${config.dbPath.padEnd(35)}║
╚══════════════════════════════════════════════╝
` });
}
