/**
 * 通讯服务 (Comm Service)
 * 端口: 3005
 * 职责: WebSocket连接管理、实时消息广播、房间管理、玩家状态同步
 */

import express from 'express';
import cors from 'cors';
import { createServer } from 'http';
import { Server } from 'socket.io';
import jwt from 'jsonwebtoken';
import { setupSocketHandlers, roomStates } from './services/socketService.js';

const app = express();
const httpServer = createServer(app);

// JWT配置（与auth-service保持一致）
const JWT_SECRET = process.env.JWT_SECRET || 'mecha-battle-auth-secret-key';

// JWT验证中间件
function authenticate(req, res, next) {
  const authHeader = req.headers.authorization;
  
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: '未授权，请先登录' });
  }
  
  const token = authHeader.split(' ')[1];
  
  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    req.user = {
      userId: decoded.userId,
      username: decoded.username
    };
    next();
  } catch (error) {
    return res.status(401).json({ error: 'Token无效或已过期' });
  }
}

// Socket.io 配置
const io = new Server(httpServer, {
  cors: {
    origin: process.env.FRONTEND_URL || 'http://localhost:8081',
    methods: ['GET', 'POST'],
    credentials: true
  },
  transports: ['websocket', 'polling']
});

// 中间件
app.use(cors());
app.use(express.json());

// 健康检查（不需要认证）
app.get('/api/comm/health', (req, res) => {
  res.json({
    status: 'ok',
    service: 'comm-service',
    timestamp: new Date().toISOString(),
    connections: io.engine.clientsCount
  });
});

// 获取房间连接统计
app.get('/api/comm/stats/rooms', (req, res) => {
  const rooms = io.sockets.adapter.rooms;
  const roomStats = {};

  for (const [roomId, sockets] of rooms) {
    if (!roomId.startsWith('/')) { // 排除socket.io内部房间
      roomStats[roomId] = sockets.size;
    }
  }

  res.json({
    rooms: roomStats,
    totalConnections: io.engine.clientsCount
  });
});

// ============================================
// 房间路由 - 注意：子路由必须放在 :roomId 之前！
// ============================================

// 创建房间 (需要认证)
app.post('/api/comm/rooms', authenticate, (req, res) => {
  const { battlefield_id, max_players = 6 } = req.body;

  if (!battlefield_id) {
    return res.status(400).json({ error: 'battlefield_id 是必填项' });
  }

  // 生成房间ID
  const roomId = `room-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  const battleId = `battle-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;

  // 初始化房间状态
  const roomName = `room-${roomId}`;
  roomStates.set(roomName, {
    players: new Map(),
    battleId,
    battlefieldId: battlefield_id,
    maxPlayers: max_players,
    status: 'waiting',
    createdAt: new Date().toISOString(),
    createdBy: req.user.userId,
    host_user_id: req.user.userId
  });

  res.json({
    room: {
      id: roomId,
      battle_id: battleId,
      battlefield_id,
      max_players: max_players,
      status: 'waiting',
      created_at: new Date().toISOString(),
      host_user_id: req.user.userId
    },
    ws_room: roomName,
    ws_battle: `battle-${battleId}`
  });
});

// 加入房间 (必须在 /:roomId 之前定义，需要认证)
app.post('/api/comm/rooms/:roomId/join', authenticate, (req, res) => {
  const { roomId } = req.params;
  const { faction } = req.body;
  const roomName = `room-${roomId}`;
  const roomState = roomStates.get(roomName);

  if (!roomState) {
    return res.status(404).json({ error: '房间不存在' });
  }

  if (roomState.status === 'playing') {
    return res.status(400).json({ error: '游戏已开始，无法加入' });
  }

  // 阵营到座位号的映射
  const factionToSeat = { 'earth': 1, 'bylon': 2, 'maxion': 3 };
  const seatNumber = factionToSeat[faction];

  if (!seatNumber) {
    return res.status(400).json({ error: '无效的阵营' });
  }

  // 检查阵营是否已被占用
  const occupiedFactions = Array.from(roomState.players.values()).map(p => p.faction);
  if (occupiedFactions.includes(faction)) {
    return res.status(400).json({ error: '该阵营已被选择' });
  }

  // 创建玩家信息
  const player = {
    userId: req.user.userId,
    username: req.user.username,
    faction,
    seatNumber,
    isReady: false,
    joinedAt: new Date().toISOString()
  };

  // 添加玩家到房间
  roomState.players.set(player.userId, player);

  // 广播玩家加入事件
  io.to(roomName).emit('player-joined', {
    player,
    players: Array.from(roomState.players.values())
  });

  res.json({
    success: true,
    room: {
      id: roomId,
      battle_id: roomState.battleId,
      battlefield_id: roomState.battlefieldId,
      max_players: roomState.maxPlayers,
      status: roomState.status || 'waiting',
      players: Array.from(roomState.players.values())
    }
  });
});

// 准备/取消准备 (需要认证)
app.post('/api/comm/rooms/:roomId/ready', authenticate, (req, res) => {
  const { roomId } = req.params;
  const roomName = `room-${roomId}`;
  const roomState = roomStates.get(roomName);

  if (!roomState) {
    return res.status(404).json({ error: '房间不存在' });
  }

  const userId = req.user.userId;
  const player = roomState.players.get(userId);

  if (!player) {
    return res.status(400).json({ error: '你不在这个房间里' });
  }

  // 切换准备状态
  player.isReady = !player.isReady;
  roomState.players.set(userId, player);

  // 广播准备状态变化
  io.to(roomName).emit('player-ready', {
    userId,
    isReady: player.isReady,
    players: Array.from(roomState.players.values())
  });

  res.json({
    success: true,
    isReady: player.isReady,
    players: Array.from(roomState.players.values())
  });
});

// ============================================
// AI玩家设置路由
// ============================================

// 设置AI玩家 (房主，需要认证)
app.post('/api/comm/rooms/:roomId/ai', authenticate, (req, res) => {
  const { roomId } = req.params;
  const roomName = `room-${roomId}`;
  const roomState = roomStates.get(roomName);

  if (!roomState) {
    return res.status(404).json({ error: '房间不存在' });
  }

  const userId = req.user.userId;

  // 检查是否是房主
  if (roomState.createdBy !== userId) {
    return res.status(403).json({ error: '只有房主可以设置AI玩家' });
  }

  const { faction, difficulty, unit_ids, spawn_point } = req.body;

  // 验证阵营
  const validFactions = ['earth', 'bylon', 'maxion'];
  if (!faction || !validFactions.includes(faction)) {
    return res.status(400).json({ error: '无效的阵营' });
  }

  // 检查阵营是否已被占用（真人或AI）
  const factionTaken = Array.from(roomState.players.values()).some(
    p => p.faction === faction
  );
  if (factionTaken) {
    return res.status(400).json({ error: '该阵营已被占用' });
  }

  // 验证难度
  const validDifficulties = ['easy', 'normal', 'hard'];
  if (difficulty && !validDifficulties.includes(difficulty)) {
    return res.status(400).json({ error: '无效的难度等级' });
  }

  // 创建AI玩家（使用负数ID标识AI）
  const aiPlayerId = -Date.now();
  const aiPlayer = {
    userId: aiPlayerId,
    username: `AI-${faction.toUpperCase()}`,
    faction,
    seatNumber: validFactions.indexOf(faction) + 1,
    isReady: true,
    isAI: true,
    difficulty: difficulty || 'normal',
    unit_ids: unit_ids || [],
    spawn_point: spawn_point || null,
    joinedAt: new Date().toISOString()
  };

  // 添加AI玩家到房间
  roomState.players.set(aiPlayerId, aiPlayer);

  // 初始化AI棋子数据（从hangar-service获取）
  roomState.aiUnits = roomState.aiUnits || {};
  if (unit_ids && unit_ids.length > 0) {
    roomState.aiUnits[aiPlayerId] = unit_ids;
  }

  // 广播AI加入事件
  io.to(roomName).emit('ai-player-joined', {
    aiPlayer,
    players: Array.from(roomState.players.values())
  });

  res.json({
    success: true,
    aiPlayer
  });
});

// 移除AI玩家 (房主，需要认证)
app.delete('/api/comm/rooms/:roomId/ai/:aiPlayerId', authenticate, (req, res) => {
  const { roomId, aiPlayerId } = req.params;
  const roomName = `room-${roomId}`;
  const roomState = roomStates.get(roomName);

  if (!roomState) {
    return res.status(404).json({ error: '房间不存在' });
  }

  const userId = req.user.userId;

  // 检查是否是房主
  if (roomState.createdBy !== userId) {
    return res.status(403).json({ error: '只有房主可以移除AI玩家' });
  }

  const playerId = parseInt(aiPlayerId);
  const player = roomState.players.get(playerId);

  if (!player || !player.isAI) {
    return res.status(404).json({ error: 'AI玩家不存在' });
  }

  // 移除AI玩家
  roomState.players.delete(playerId);

  // 清理AI棋子数据
  if (roomState.aiUnits) {
    delete roomState.aiUnits[playerId];
  }

  // 广播AI离开事件
  io.to(roomName).emit('ai-player-left', {
    aiPlayerId: playerId,
    players: Array.from(roomState.players.values())
  });

  res.json({
    success: true
  });
});

// ============================================
// 获取AI设置选项 (必须放在 /rooms/:roomId 之前)
app.get('/api/comm/ai-options', (req, res) => {
  res.json({
    factions: [
      { id: 'earth', name: '地球联合', icon: '🌍' },
      { id: 'bylon', name: '拜隆帝国', icon: '🌙' },
      { id: 'maxion', name: '马克西翁', icon: '⭐' }
    ],
    difficulties: [
      { id: 'easy', name: '简单', description: 'AI伤害-20%，承受伤害+20%' },
      { id: 'normal', name: '普通', description: '标准AI行为' },
      { id: 'hard', name: '困难', description: 'AI伤害+10%，承受伤害-10%' }
    ]
  });
});

// ============================================
// 以下路由会匹配 /rooms/:roomId，所以必须放在后面
// ============================================

// 开始游戏 (房主，需要认证)
app.post('/api/comm/rooms/:roomId/start', authenticate, (req, res) => {
  const { roomId } = req.params;
  const roomName = `room-${roomId}`;
  const roomState = roomStates.get(roomName);

  if (!roomState) {
    return res.status(404).json({ error: '房间不存在' });
  }

  const userId = req.user.userId;

  // 检查是否是房主
  if (roomState.createdBy !== userId) {
    return res.status(403).json({ error: '只有房主可以开始游戏' });
  }

  // 检查是否所有玩家都准备了
  const players = Array.from(roomState.players.values());
  const allReady = players.length >= 2 && players.every(p => p.isReady);

  if (!allReady) {
    return res.status(400).json({ error: '需要至少2名玩家且全部准备' });
  }

  // 更新房间状态
  roomState.status = 'playing';

  // 广播开始游戏
  io.to(roomName).emit('game-start', {
    battle_id: roomState.battleId,
    battlefield_id: roomState.battlefieldId,
    players
  });

  res.json({
    success: true,
    battle_id: roomState.battleId,
    redirect_url: `/battle/${roomState.battleId}`
  });
});

// 离开房间 (需要认证)
app.post('/api/comm/rooms/:roomId/leave', authenticate, (req, res) => {
  const { roomId } = req.params;
  const roomName = `room-${roomId}`;
  const roomState = roomStates.get(roomName);

  if (!roomState) {
    return res.status(404).json({ error: '房间不存在' });
  }

  const userId = req.user.userId;

  if (roomState.players.has(userId)) {
    const player = roomState.players.get(userId);
    roomState.players.delete(userId);

    // 广播离开事件
    io.to(roomName).emit('player-left', {
      userId,
      username: player.username,
      players: Array.from(roomState.players.values())
    });
  }

  res.json({ success: true });
});

// 获取房间信息 (必须放在最后，需要认证)
app.get('/api/comm/rooms/:roomId', authenticate, async (req, res) => {
  const { roomId } = req.params;
  const roomName = `room-${roomId}`;
  const roomState = roomStates.get(roomName);

  if (!roomState) {
    return res.status(404).json({ error: '房间不存在' });
  }

  // 从 map-service 获取战场详情和出生点
  let battlefield = null;
  let spawn_points = [];

  try {
    // 获取战场详情
    const mapRes = await fetch(`http://localhost:3003/api/map/battlefields/${roomState.battlefieldId}`);
    if (mapRes.ok) {
      const mapData = await mapRes.json();
      battlefield = {
        id: mapData.id,
        name: mapData.name,
        width: mapData.width,
        height: mapData.height
      };
      spawn_points = mapData.spawn_points || [];
    }
  } catch (err) {
    console.warn('获取战场详情失败:', err.message);
  }

  res.json({
    room: {
      id: roomId,
      battle_id: roomState.battleId,
      battlefield_id: roomState.battlefieldId,
      max_players: roomState.maxPlayers,
      status: roomState.status || 'waiting',
      host_user_id: roomState.createdBy,
      created_at: roomState.createdAt
    },
    battlefield,
    spawn_points,
    players: Array.from(roomState.players.values())
  });
});

// Socket.io 实时通讯
setupSocketHandlers(io);

// 错误处理
app.use((err, req, res, next) => {
  console.error('Error:', err);
  res.status(500).json({ error: err.message || 'Internal server error' });
});

const PORT = 3005;  // 固定端口，符合规范

// 启动服务器
httpServer.listen(PORT, () => {
  console.log(`🚀 Comm Service running on http://localhost:${PORT}`);
  console.log(`📡 WebSocket endpoint: ws://localhost:${PORT}`);
});

export { io };
