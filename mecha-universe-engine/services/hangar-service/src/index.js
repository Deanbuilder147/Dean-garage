import dotenv from 'dotenv';
dotenv.config();

import express from 'express';
import cors from 'cors';
import path from 'path';
import { fileURLToPath } from 'url';
import rateLimit from 'express-rate-limit';
import unitRoutes from './routes/units.js';
import factionRoutes from './routes/factions.js';
import { initDatabase } from './database/db.js';

// 加载环境变量（必须在读取 process.env 之前调用）

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();

// 速率限制配置
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 分钟窗口
  max: 100, // 每个 IP 最多 100 次请求
  message: { error: '请求过多，请稍后重试', retryAfter: 900 },
  standardHeaders: true,
  legacyHeaders: false,
  skip: (req) => req.path === '/api/health' // 健康检查不限速
});

// CORS 配置 - 生产环境限制特定域名，开发环境允许 localhost
app.use(cors({
  origin: process.env.ALLOWED_ORIGINS?.split(',') || ['http://localhost:8081', 'http://localhost:8080'],
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS']
}));
app.use(express.json());
app.use('/api/', limiter); // 对所有 API 应用限流

// 静态文件 - 上传的图片
app.use('/api/hangar/units/uploads', express.static(path.join(__dirname, '../uploads')));

// Phase 28: 阵营 Logo 静态挂载
app.use('/api/hangar/factions/logo', express.static(path.join(__dirname, '../uploads/factions')));

// Phase 28-D: 七视图精灵图静态挂载
app.use('/api/hangar/units/sprites', express.static(path.join(__dirname, '../uploads/sprites')));

// API路由 - 前缀 /api/hangar
app.use('/api/hangar/units', unitRoutes);
app.use('/api/hangar/factions', factionRoutes);

// 健康检查
app.get('/api/health', (req, res) => {
  res.json({
    service: 'hangar-service',
    status: 'ok',
    timestamp: new Date().toISOString()
  });
});

// 错误处理
app.use((err, req, res, next) => {
  console.error('Error:', err);
  res.status(500).json({ error: err.message || 'Internal server error' });
});

const PORT = process.env.PORT || 3002;

// 初始化数据库并启动服务器
async function start() {
  try {
    await initDatabase();
    console.log('Database initialized');

    app.listen(PORT, () => {
      console.log(`🤖 Hangar Service running on http://localhost:${PORT}`);
    });
  } catch (error) {
    console.error('Failed to start server:', error);
    process.exit(1);
  }
}

start();
