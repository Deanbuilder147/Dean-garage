import express from 'express';
import cors from 'cors';
import { initDatabase } from './database/db.js';
import authRoutes from './routes/auth.js';
import config from './config/index.js';

const app = express();

// 中间件
app.use(cors());
app.use(express.json());

// 健康检查
app.get('/health', (req, res) => {
  res.json({ status: 'ok', service: 'auth-service', timestamp: new Date().toISOString() });
});

// 认证路由
app.use('/api/auth', authRoutes);

// 启动服务
async function start() {
  try {
    // 初始化数据库
    await initDatabase();
    
    app.listen(config.port, () => {
      console.log(`✓ 认证服务启动成功`);
      console.log(`  端口: ${config.port}`);
      console.log(`  健康检查: http://localhost:${config.port}/health`);
      console.log(`  注册接口: POST http://localhost:${config.port}/api/auth/register`);
      console.log(`  登录接口: POST http://localhost:${config.port}/api/auth/login`);
      console.log(`  用户信息: GET  http://localhost:${config.port}/api/auth/me`);
      console.log(`  Token验证: GET  http://localhost:${config.port}/api/auth/verify`);
    });
  } catch (error) {
    console.error('启动失败:', error);
    process.exit(1);
  }
}

start();
