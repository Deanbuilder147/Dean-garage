/**
 * index.js - 机甲战棋战斗服务入口
 * 
 * Express 服务，挂载：
 * - /api/combat 战场路由（部署/移动/攻击/回合管理）
 * - /api/health 健康检查
 */
import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import battlesRouter from './routes/battles.js';

const app = express();
const PORT = process.env.PORT || 3001;

// 中间件
app.use(cors());
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));

// 请求日志
app.use((req, res, next) => {
  const start = Date.now();
  const { method, url } = req;
  res.on('finish', () => {
    const duration = Date.now() - start;
    if (url !== '/api/health') {
      console.log(`[${method}] ${url} → ${res.statusCode} (${duration}ms)`);
    }
  });
  next();
});

// 健康检查（兼容 Docker healthcheck 探测路径 /health 和标准路径 /api/health）
app.get('/health', (req, res) => {
  res.json({
    status: 'ok',
    service: 'combat-service',
    uptime: process.uptime(),
    timestamp: new Date().toISOString()
  });
});

app.get('/api/health', (req, res) => {
  res.json({
    status: 'ok',
    service: 'combat-service',
    uptime: process.uptime(),
    timestamp: new Date().toISOString()
  });
});

// 战场路由
app.use('/api/combat', battlesRouter);



// 404 处理
app.use((req, res) => {
  res.status(404).json({ error: 'Not Found', path: req.url });
});

// 全局错误处理
app.use((err, req, res, next) => {
  console.error('[Unhandled Error]', err);
  res.status(500).json({ error: '服务器内部错误', message: err.message });
});

app.listen(PORT, () => {
  console.log(`[combat-service] 战斗服务启动于端口 ${PORT}`);
  console.log(`[combat-service] 健康检查: http://localhost:${PORT}/api/health`);
});

export default app;
