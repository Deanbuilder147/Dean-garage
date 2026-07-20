/**
 * Phase 29-X — 大一统后端网关 Express 应用
 *
 * 单入口多路复用：统一承载认证、房间、单位、战斗全链路。
 * 端口 3006 统一执政。
 */

import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import { config } from './config.js';
import authRoutes from './routes/auth.js';
import roomRoutes from './routes/rooms.js';
import unitRoutes from './routes/units.js';
import adminRoutes from './routes/admin.js';
import combatRoutes from './routes/combat.js';
import mapRoutes from './routes/maps.js';
import glossaryRoutes from './routes/glossary.js';
import { authenticate } from './middleware/auth.js';

export function createApp(): express.Application {
  const app = express();

  // ========================================
  // 安全中间件
  // ========================================
  app.use(helmet({
    contentSecurityPolicy: false, // CSP 由 Nginx 层统一注入
    crossOriginEmbedderPolicy: false,
  }));

  app.use(cors({
    origin: config.corsOrigins,
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization'],
  }));

  // 全局限流
  app.use(rateLimit({
    windowMs: config.rateLimit.windowMs,
    max: config.rateLimit.max,
    standardHeaders: true,
    legacyHeaders: false,
    message: { error: 'RATE_LIMIT', message: '请求过于频繁，请稍后重试' },
  }));

  // Body 解析
  app.use(express.json({ limit: '10mb' }));
  app.use(express.urlencoded({ extended: true, limit: '10mb' }));

  // 请求 ID
  app.use((req, _res, next) => {
    const requestId = req.headers['x-request-id'] || `req-${Date.now()}`;
    req.headers['x-request-id'] = requestId as string;
    next();
  });

  // ========================================
  // 健康检查（不限流）
  // ========================================
  app.get('/health', (_req, res) => {
    res.json({
      status: 'ok',
      service: 'mecha-universe-gateway',
      version: '29.0.0',
      timestamp: new Date().toISOString(),
    });
  });

  // ========================================
  // 路由挂载
  // ========================================

  // 认证路由（部分端点公开，部分需认证）
  app.use(authRoutes);

  // 房间路由（SQLite 持久化执政，GET 允许游客浏览）
  app.use(roomRoutes);

  // 单位路由（需认证，AI 生成带积分锁）
  app.use(unitRoutes);

  // 管理路由（admin/dominator 独享）
  app.use(adminRoutes);

  // Phase 29-P2: 战斗路由（大一统网关 3006 执政，动态行动点计数池）
  app.use(combatRoutes);

  // Phase 29-DataMigration: 地图路由（旧 mecha-map:3003 资产洗白迁入）
  app.use(mapRoutes);

  // Phase 29-Debug: 词条库独立路由（脱离 battleId 沙盒，GlossaryView 自由读写）
  app.use('/api/combat-glossary', glossaryRoutes);

  // Phase 29-P1: 试玩战役端点（游客可访问，无需 Token）
  app.get('/api/campaign/trial', (_req, res) => {
    res.json({
      status: 'ok',
      campaign: {
        id: 'trial',
        name: '教程战役：第一次出击',
        description: '使用预设机甲体验基础的移动和攻击操作。无需登录即可游玩。',
        maps: ['tutorial_01', 'tutorial_02'],
        presetUnits: [
          { name: '训练机甲 α', category: 'melee', tier: 1 },
          { name: '训练机甲 β', category: 'ranged', tier: 1 },
        ],
      },
    });
  });

  // 观战缓冲路由（游客可访问）
  app.use('/api/comm', authenticate);
  app.get('/api/comm/watch-buffer-status', (_req, res) => {
    res.json({ queueSize: 0, hasPendingFlush: false, maxSize: 200 });
  });
  app.post('/api/comm/watch-feed', (req, res) => {
    const { battleId, events } = req.body;
    if (!battleId || !events) {
      res.status(400).json({ error: 'battleId 和 events 为必填项' });
      return;
    }
    // 转发到 comm-service (3005) 的 Socket.io 广播
    res.json({ success: true, forwarded: true });
  });

  // Phase 29-P2: 技能执行器反查端点（调试用，生产环境应禁用）
  app.post('/api/debug/skill-test', (req, res) => {
    try {
      const { clause, caster, target } = req.body;
      if (!clause || !caster || !target) {
        res.status(400).json({ error: 'clause, caster, target are required' });
        return;
      }

      // Dynamic import to avoid startup dependency
      import('./damagePipe.js').then(({ computeDamage }) => {
        const result = computeDamage(
          [clause],
          caster as any,
          target as any,
          () => Math.floor(Math.random() * 6) + 1
        );
        res.json({ success: true, result });
      }).catch((err: Error) => {
        console.error('[CRITICAL FAILED] [SkillTest] 技能测试异常:', err.message);
        res.status(500).json({ success: false, error: err.message });
      });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error('[CRITICAL FAILED] [SkillTest] 外层异常:', msg);
      res.status(500).json({ success: false, error: msg });
    }
  });

  // 404 兜底
  app.use((_req, res) => {
    res.status(404).json({ error: 'NOT_FOUND', message: '端点不存在' });
  });

  // 全局错误处理
  app.use((err: Error, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
    console.error('[Gateway] 未捕获异常:', err);
    res.status(500).json({
      error: 'INTERNAL_ERROR',
      message: config.nodeEnv === 'development' ? err.message : '服务器内部错误',
    });
  });

  return app;
}
