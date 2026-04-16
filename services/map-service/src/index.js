import express from 'express';
import cors from 'cors';
import { initDatabase } from './database/db.js';
import config from './config/index.js';
import battlefieldRoutes from './routes/battlefields.js';

const app = express();

// 中间件
app.use(cors());
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));

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
