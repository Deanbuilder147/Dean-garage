import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import rateLimit from 'express-rate-limit';
import { initDatabase } from './database/db.js';
import authRoutes from './routes/auth.js';

// 加载环境变量（必须在读取 process.env 之前调用）
dotenv.config();

// 直接在 index.js 中验证 JWT_SECRET（避免 import hoisting 问题）
const JWT_SECRET = process.env.JWT_SECRET;
if (!JWT_SECRET) {
  throw new Error('[配置错误] JWT_SECRET 环境变量必须设置！');
}

const config = {
  port: process.env.PORT || 3001,
  jwtSecret: JWT_SECRET,
  jwtExpiresIn: '7d',
  bcryptRounds: 10
};

const app = express();

// Rate limiting
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100, // limit each IP to 100 requests per windowMs
  message: { error: 'Too many requests, please try again later' },
  standardHeaders: true,
  legacyHeaders: false,
  skip: (req) => req.path === '/api/auth/health' // Health check exempt
});

// 登录接口更严格的限流
const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 分钟窗口
  max: 10, // 每个 IP 最多 10 次登录尝试
  message: { error: '登录尝试次数过多，请 15 分钟后再试' },
  standardHeaders: true,
  legacyHeaders: false
});

// CORS configuration - restrict to specific origins in production
app.use(cors({
  origin: process.env.ALLOWED_ORIGINS?.split(',') || ['http://localhost:8081', 'http://localhost:8080'],
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS']
}));
app.use(express.json());
app.use('/api/', limiter); // 对所有 API 应用限流
app.use('/api/auth/login', loginLimiter); // 登录接口额外限流

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
      console.log(`  端口：${config.port}`);
      console.log(`  健康检查：http://localhost:${config.port}/health`);
      console.log(`  注册接口：POST http://localhost:${config.port}/api/auth/register`);
      console.log(`  登录接口：POST http://localhost:${config.port}/api/auth/login`);
      console.log(`  用户信息：GET  http://localhost:${config.port}/api/auth/me`);
      console.log(`  Token 验证：GET  http://localhost:${config.port}/api/auth/verify`);
    });
  } catch (error) {
    console.error('启动失败:', error);
    process.exit(1);
  }
}

start();
