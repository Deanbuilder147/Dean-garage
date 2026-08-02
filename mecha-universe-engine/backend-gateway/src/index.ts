/**
 * Phase 29-X 最高图腾令 — 大一统后端网关入口 (sql.js)
 *
 * 单入口多路复用：统一承载认证、房间（SQLite）、观战全链路。
 * 端口 3006 统一执政。
 */

import { logger } from './utils/logger.js';
import { createApp } from './app.js';
import { initDatabase } from './db/sqlite.js';
import { pgHealthCheck } from './db/postgres.js';
import { config, logConfigSummary } from './config.js';

async function main(): Promise<void> {
  logConfigSummary();

  // 1. 初始化数据库 (sql.js 异步加载 WASM)
  logger.info({ msg: `[Gateway] 正在初始化 SQLite (sql.js)...` });
  await initDatabase();

  // 1.5 Phase 29-DataSecurity: PostgreSQL 双源桥接连通性测试
  logger.info({ msg: `[Gateway] 正在测试 PostgreSQL 连通性 (${config.postgres.host}:${config.postgres.port})...` });
  try {
    const pgOk = await pgHealthCheck();
    if (pgOk) {
      logger.info({ msg: `[Gateway] [PostgreSQL] 5432 连通性测试：CONNECTED 🟢` });
    } else {
      logger.warn({ msg: `[Gateway] [PostgreSQL] 5432 连通性测试：UNREACHABLE 🔴 — 老账号复活功能暂时不可用` });
    }
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    logger.warn({ msg: `[Gateway] [PostgreSQL] 5432 连通性测试：FAILED 🔴 — ${msg}` });
  }

  // 2. 创建 Express 应用
  const app = createApp();

  // 3. 启动 HTTP 服务
  app.listen(config.port, () => {
    logger.info({ msg: `[Gateway] ✅ 大一统网关已就绪: http://0.0.0.0:${config.port}` });
    logger.info({ msg: `[Gateway]    认证端点: /api/auth/*` });
    logger.info({ msg: `[Gateway]    房间端点: /api/rooms/* (SQLite 执政)` });
    logger.info({ msg: `[Gateway]    观战缓冲: /api/comm/watch-*` });
    logger.info({ msg: `[Gateway]    健康检查: /health` });
  });

  const shutdown = (signal: string) => {
    logger.info({ msg: `\n[Gateway] 收到 ${signal}，正在优雅关闭...` });
    process.exit(0);
  };

  process.on('SIGINT', () => shutdown('SIGINT'));
  process.on('SIGTERM', () => shutdown('SIGTERM'));
}

main().catch((err) => {
  logger.error({ msg: `[Gateway] ❌ 启动失败: ${ err }` });
  process.exit(1);
});
