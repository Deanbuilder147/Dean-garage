import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import rateLimit from 'express-rate-limit';
import { initDatabase } from './database/db.js';
import config from './config/index.js';
import battlefieldRoutes from './routes/battlefields.js';

// 加载环境变量（必须在读取 process.env 之前调用）
dotenv.config();

const app = express();

// 速率限制配置
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 分钟窗口
  max: 100, // 每个 IP 最多 100 次请求
  message: { error: '请求过多，请稍后重试', retryAfter: 900 },
  standardHeaders: true,
  legacyHeaders: false,
  skip: (req) => req.path === '/health' // 健康检查不限速
});

// CORS 配置 - 生产环境限制特定域名，开发环境允许 localhost
app.use(cors({
  origin: process.env.ALLOWED_ORIGINS?.split(',') || ['http://localhost:8081', 'http://localhost:8080'],
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS']
}));
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));
app.use('/api/', limiter); // 对所有 API 应用限流

// 请求日志
app.use((req, res, next) => {
  console.log(`[${new Date().toISOString()}] ${req.method} ${req.path}`);
  next();
});

// 路由 - 地图服务API前缀
app.use('/api/map/battlefields', battlefieldRoutes);

// 健康检查
app.get('/health', (req, res) => {
  res.json({ status: 'ok', service: 'map-service', port: config.port });
});

// API根路径
app.get('/api/map', (req, res) => {
  res.json({ 
    service: 'map-service',
    version: '1.0.0',
    endpoints: [
      'GET  /api/map/battlefields - 获取战场列表',
      'GET  /api/map/battlefields/all - 获取公共战场',
      'GET  /api/map/battlefields/:id - 获取战场详情',
      'POST /api/map/battlefields - 创建战场',
      'PUT  /api/map/battlefields/:id - 更新战场',
      'DELETE /api/map/battlefields/:id - 删除战场',
      'GET  /api/map/battlefields/:id/spawn-points - 获取出生点',
      'POST /api/map/battlefields/:id/terrain - 批量更新地形',
      'DELETE /api/map/battlefields/:id/terrain - 清除地形',
      'GET  /api/map/battlefields/terrain/types - 获取地形类型',
      'POST /api/map/battlefields/utils/path - A*寻路计算',
      'POST /api/map/battlefields/utils/range - 获取范围格子'
    ]
  });
});

// 错误处理
app.use((err, req, res, next) => {
  console.error('[Error]', err);
  res.status(500).json({ error: '服务器内部错误' });
});

// 启动
async function start() {
  try {
    await initDatabase();
    
    app.listen(config.port, () => {
      console.log(`\n========================================`);
      console.log(`  Map Service 启动成功`);
      console.log(`  端口: ${config.port}`);
      console.log(`  文档: http://localhost:${config.port}/api`);
      console.log(`========================================\n`);
    });
  } catch (error) {
    console.error('[Map-Service] 启动失败:', error);
    process.exit(1);
  }
}

start();
