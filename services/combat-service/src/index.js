import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import rateLimit from 'express-rate-limit';
import { WebSocketServer } from 'ws';
import battleRoutes from './routes/battles.js';
import { setupWebSocket } from './services/socketService.js';
import db from './database/db.js';

// 加载环境变量
dotenv.config();

const app = express();
const PORT = process.env.PORT || 3004;

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
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use('/api/', limiter); // 对所有 API 应用限流

// 健康检查路由
app.get('/health', (req, res) => {
  res.json({ 
    status: 'healthy',
    service: 'combat-service',
    port: PORT,
    timestamp: new Date().toISOString()
  });
});

// API路由
app.use('/api/combat', battleRoutes);

// 错误处理中间件
app.use((err, req, res, next) => {
  console.error('Combat service error:', err);
  res.status(500).json({ 
    error: '战斗服务内部错误',
    message: err.message,
    timestamp: new Date().toISOString()
  });
});

// 初始化数据库并启动服务器
async function startServer() {
  try {
    await db.initializeDatabase();
    console.log('战斗数据库初始化完成');
    
    // 启动HTTP服务器
    const server = app.listen(PORT, () => {
      console.log(`🚀 Combat service running on port ${PORT}`);
      console.log(`📡 Health check: http://localhost:${PORT}/health`);
      console.log(`📊 API endpoints: http://localhost:${PORT}/api/combat`);
    });
    
    // 设置WebSocket
    const wss = new WebSocketServer({ server });
    setupWebSocket(wss);
    
    // 优雅关闭
    process.on('SIGTERM', () => {
      console.log('SIGTERM received, shutting down combat service gracefully...');
      server.close(() => {
        console.log('Combat service shut down');
        process.exit(0);
      });
    });
    
    return server;
  } catch (error) {
    console.error('启动失败:', error);
    process.exit(1);
  }
}

startServer();