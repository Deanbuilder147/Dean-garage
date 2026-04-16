import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import { WebSocketServer } from 'ws';
import battleRoutes from './routes/battles.js';
import { setupWebSocket } from './services/socketService.js';
import db from './database/db.js';

// 加载环境变量
dotenv.config();

const app = express();
const PORT = process.env.PORT || 3004;

// 中间件
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

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