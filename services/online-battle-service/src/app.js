import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import morgan from 'morgan';
import rateLimit from 'express-rate-limit';
import config from './config/index.js';

// Import routes
import matchmakingRoutes from './routes/matchmaking.js';
import roomsRoutes from './routes/rooms.js';
import leaderboardRoutes from './routes/leaderboard.js';
import battlesRoutes from './routes/battles.js';

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

// Security middleware
app.use(helmet());

// CORS 配置 - 生产环境限制特定域名，开发环境允许 localhost
app.use(cors({
  origin: process.env.ALLOWED_ORIGINS?.split(',') || ['http://localhost:8081', 'http://localhost:8080'],
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS']
}));

// Request logging
if (config.nodeEnv === 'development') {
  app.use(morgan('dev'));
} else {
  app.use(morgan('combined'));
}

// Body parsing
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// 应用速率限制
app.use('/api/', limiter);

// Request ID middleware
app.use((req, res, next) => {
  req.id = require('crypto').randomUUID();
  res.setHeader('X-Request-ID', req.id);
  next();
});

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({
    status: 'healthy',
    service: 'online-battle-service',
    timestamp: new Date().toISOString(),
    uptime: process.uptime()
  });
});

// API routes
app.use('/api/matchmaking', matchmakingRoutes);
app.use('/api/rooms', roomsRoutes);
app.use('/api/leaderboard', leaderboardRoutes);
app.use('/api/battles', battlesRoutes);

// 404 handler
app.use((req, res) => {
  res.status(404).json({
    error: 'Not Found',
    message: `Route ${req.method} ${req.path} not found`,
    requestId: req.id
  });
});

// Error handler
app.use((err, req, res, next) => {
  console.error(`Error [${req.id}]:`, err);
  
  const status = err.status || err.statusCode || 500;
  
  res.status(status).json({
    error: err.name || 'Internal Server Error',
    message: config.nodeEnv === 'development' ? err.message : 'An unexpected error occurred',
    requestId: req.id,
    ...(config.nodeEnv === 'development' && { stack: err.stack })
  });
});

export default app;
