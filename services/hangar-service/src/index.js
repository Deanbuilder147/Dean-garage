import express from 'express';
import cors from 'cors';
import path from 'path';
import { fileURLToPath } from 'url';
import unitRoutes from './routes/units.js';
import { initDatabase } from './database/db.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();

// CORS配置 - 只允许前端8081端口
app.use(cors({
  origin: ['http://localhost:8081', 'http://localhost:8080'],
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization']
}));
app.use(express.json());

// 静态文件 - 上传的图片
app.use('/api/hangar/units/uploads', express.static(path.join(__dirname, '../uploads')));

// API路由 - 前缀 /api/hangar
app.use('/api/hangar/units', unitRoutes);

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
