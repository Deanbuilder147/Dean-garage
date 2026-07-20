/**
 * Phase 29-X — 通讯服务（纯净观战缓冲）
 *
 * 工序二.3：废弃原有 3005 容器内的房间写盘路由。
 * 改装为纯粹的内存 FIFO 队列，对战斗引擎快照强制挂载 5 秒 setTimeout 延迟阻尼，
 * 专职为未来的微信观战小程序提供安全的流式输入端。
 *
 * 端口 3005 — 仅保留 WebSocket (Socket.io) + 观战缓冲队列
 */

import { createServer } from 'node:http';
import express from 'express';
import cors from 'cors';
import { Server as SocketIOServer } from 'socket.io';

// 内联类型（避免 workspace 依赖）
interface WatchEvent {
  battleId: string;
  timestamp: number;
  events: unknown[];
}

// ============================================
// 配置
// ============================================
const PORT = parseInt(process.env.PORT || '3005', 10);
const MAX_BUFFER_SIZE = 200;
const FLUSH_DELAY_MS = 5000; // 5 秒延迟阻尼

// ============================================
// 观战缓冲队列（FIFO）
// ============================================
const watchBufferQueue: WatchEvent[] = [];
let watchFlushTimer: ReturnType<typeof setTimeout> | null = null;

// ============================================
// Express 应用
// ============================================
const app = express();
app.use(cors());
app.use(express.json());

// 健康检查
app.get('/api/comm/health', (_req, res) => {
  res.json({
    status: 'ok',
    service: 'mecha-universe-comm',
    role: 'watch-buffer-only',
    queueSize: watchBufferQueue.length,
  });
});

// 观战流馈入端点（3004 战斗引擎推送）
app.post('/api/comm/watch-feed', (req, res) => {
  const { battleId, events } = req.body;

  if (!battleId || !events) {
    res.status(400).json({ error: 'battleId 和 events 为必填项' });
    return;
  }

  // 推入 FIFO 队列
  watchBufferQueue.push({
    battleId,
    events,
    timestamp: Date.now(),
  });

  // FIFO 容量限制：淘汰旧数据
  while (watchBufferQueue.length > MAX_BUFFER_SIZE) {
    watchBufferQueue.shift();
  }

  // 5 秒阻尼延迟：累积批量广播，避免高频轰炸
  if (watchFlushTimer) clearTimeout(watchFlushTimer);
  watchFlushTimer = setTimeout(() => {
    flushWatchBuffer(io);
  }, FLUSH_DELAY_MS);

  res.json({ success: true, buffered: watchBufferQueue.length });
});

// 观战缓冲状态查询（微信小程序健康监控）
app.get('/api/comm/watch-buffer-status', (_req, res) => {
  res.json({
    queueSize: watchBufferQueue.length,
    hasPendingFlush: !!watchFlushTimer,
    maxSize: MAX_BUFFER_SIZE,
    flushDelayMs: FLUSH_DELAY_MS,
  });
});

// ============================================
// HTTP + Socket.io 服务器
// ============================================
const server = createServer(app);
const io = new SocketIOServer(server, {
  cors: {
    origin: '*',
    methods: ['GET', 'POST'],
  },
  transports: ['websocket', 'polling'],
  pingInterval: 10000,
  pingTimeout: 5000,
});

// Socket.io 连接管理
io.on('connection', (socket) => {
  console.log(`[WS] 客户端连接: ${socket.id}`);

  // 加入观战房间
  socket.on('watch-join', (battleId: string) => {
    socket.join(`battle-${battleId}`);
    console.log(`[WS] ${socket.id} 加入观战: battle-${battleId}`);
  });

  // 离开观战房间
  socket.on('watch-leave', (battleId: string) => {
    socket.leave(`battle-${battleId}`);
  });

  socket.on('disconnect', (reason) => {
    console.log(`[WS] 客户端断开: ${socket.id} (${reason})`);
  });
});

/**
 * 冲刷观战缓冲队列：批量广播到 Socket.io 房间
 */
function flushWatchBuffer(ioInstance: SocketIOServer): void {
  while (watchBufferQueue.length > 0) {
    const item = watchBufferQueue.shift();
    if (item) {
      ioInstance.to(`battle-${item.battleId}`).emit('watch-stream', {
        battleId: item.battleId,
        events: item.events,
        timestamp: item.timestamp,
      });
    }
  }
  console.log(`[Buffer] 观战队列冲刷完成，剩余: ${watchBufferQueue.length}`);
}

// ============================================
// 启动
// ============================================
server.listen(PORT, () => {
  console.log(`
╔══════════════════════════════════════════════╗
║  Mechaverse Comm Service (Watch Buffer Only)  ║
║  Phase 29-X 最高图腾令                        ║
╠══════════════════════════════════════════════╣
║  Port:      ${String(PORT).padEnd(35)}║
║  职责:      纯净观战缓冲队列                    ║
║  FIFO:      ${String(MAX_BUFFER_SIZE).padEnd(35)}║
║  阻尼:      ${String(FLUSH_DELAY_MS / 1000 + 's').padEnd(35)}║
╚══════════════════════════════════════════════╝
`);
  console.log('[Comm] ✅ 观战缓冲服务已就绪');
  console.log('[Comm]    观战馈入: POST /api/comm/watch-feed');
  console.log('[Comm]    状态查询: GET /api/comm/watch-buffer-status');
  console.log('[Comm]    WebSocket: /socket.io/');
});
