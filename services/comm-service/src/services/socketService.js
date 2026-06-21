/**
 * Socket.io 实时通讯服务
 * 处理多人对战的实时状态同步
 */

import dotenv from 'dotenv';
import jwt from 'jsonwebtoken';

// 加载环境变量（必须在读取 process.env 之前调用）
dotenv.config();

// 强制要求 JWT_SECRET
const JWT_SECRET=process.env.JWT_SECRET;
if (!JWT_SECRET) {
  throw new Error('[配置错误] JWT_SECRET 环境变量必须设置！');
}

// 内存中的房间状态管理
const roomStates = new Map();

/**
 * 获取或创建房间状态
 */
function getRoomState(roomId) {
  if (!roomStates.has(roomId)) {
    roomStates.set(roomId, {
      players: new Map(),
      battleState: null,
      createdAt: new Date().toISOString()
    });
  }
  return roomStates.get(roomId);
}

/**
 * 清理房间状态
 */
function cleanupRoomState(roomId) {
  roomStates.delete(roomId);
}

export function setupSocketHandlers(io) {
  
  // 认证中间件
  io.use((socket, next) => {
    const token = socket.handshake.auth.token || socket.handshake.query.token;
    if (!token) {
      return next(new Error('Authentication required'));
    }
    
    try {
      const decoded = jwt.verify(token, JWT_SECRET);
      socket.user = decoded;
      next();
    } catch (error) {
      next(new Error('Invalid token'));
    }
  });

  io.on('connection', (socket) => {
    console.log(`[Comm] User connected: ${socket.user.username} (${socket.user.userId})`);
    
    // ========== 房间管理 ==========
    
    // 加入房间
    socket.on('join-room', (data) => {
      const { roomId, roomType = 'battle' } = data;
      const roomName = `${roomType}-${roomId}`;
      
      socket.join(roomName);
      socket.currentRoom = roomName;
      
      const roomState = getRoomState(roomName);
      roomState.players.set(socket.user.userId, {
        userId: socket.user.userId,
        username: socket.user.username,
        socketId: socket.id,
        joinedAt: new Date().toISOString()
      });
      
      console.log(`[Comm] User ${socket.user.username} joined room ${roomName}`);
      
      // 通知房间内其他人
      socket.to(roomName).emit('player-joined', {
        username: socket.user.username,
        userId: socket.user.userId,
        timestamp: new Date().toISOString()
      });
      
      // 发送当前房间玩家列表给新加入的玩家
      const playersList = Array.from(roomState.players.values());
      socket.emit('room-players', {
        roomId: roomName,
        players: playersList
      });
    });
    
    // 离开房间
    socket.on('leave-room', (data) => {
      const { roomId, roomType = 'battle' } = data;
      const roomName = roomId || socket.currentRoom;
      
      if (roomName) {
        socket.leave(roomName);
        
        const roomState = roomStates.get(roomName);
        if (roomState) {
          roomState.players.delete(socket.user.userId);
          
          // 如果房间为空，清理状态
          if (roomState.players.size === 0) {
            cleanupRoomState(roomName);
          }
        }
        
        console.log(`[Comm] User ${socket.user.username} left room ${roomName}`);
        
        // 通知房间内其他人
        socket.to(roomName).emit('player-left', {
          username: socket.user.username,
          userId: socket.user.userId,
          timestamp: new Date().toISOString()
        });
        
        if (socket.currentRoom === roomName) {
          socket.currentRoom = null;
        }
      }
    });
    
    // ========== 战斗事件 ==========
    
    // 加入战斗房间
    socket.on('join-battle', (battleId) => {
      const roomName = `battle-${battleId}`;
      socket.join(roomName);
      socket.currentBattle = battleId;
      
      console.log(`[Comm] User ${socket.user.username} joined battle ${battleId}`);
      
      // 通知房间内其他人
      socket.to(roomName).emit('player-joined', {
        username: socket.user.username,
        userId: socket.user.userId,
        type: 'battle'
      });
    });
    
    // 离开战斗房间
    socket.on('leave-battle', (battleId) => {
      const roomName = `battle-${battleId}`;
      socket.leave(roomName);
      
      console.log(`[Comm] User ${socket.user.username} left battle ${battleId}`);
      
      socket.to(roomName).emit('player-left', {
        username: socket.user.username,
        userId: socket.user.userId,
        type: 'battle'
      });
      
      if (socket.currentBattle === battleId) {
        socket.currentBattle = null;
      }
    });
    
    // 移动单位
    socket.on('move-unit', (data) => {
      const { battleId, unitId, targetQ, targetR } = data;
      const roomName = `battle-${battleId}`;
      
      // 广播移动事件给房间内所有人（包括发送者用于确认）
      io.to(roomName).emit('unit-moved', {
        unitId,
        targetQ,
        targetR,
        movedBy: socket.user.username,
        userId: socket.user.userId,
        timestamp: new Date().toISOString()
      });
    });
    
    // 发起攻击
    socket.on('attack', (data) => {
      const { battleId, attackerId, targetId, attackType } = data;
      const roomName = `battle-${battleId}`;
      
      // 广播攻击事件
      io.to(roomName).emit('attack-started', {
        attackerId,
        targetId,
        attackType,
        attackedBy: socket.user.username,
        userId: socket.user.userId,
        timestamp: new Date().toISOString()
      });
    });
    
    // 攻击结果
    socket.on('attack-result', (data) => {
      const { battleId, result } = data;
      const roomName = `battle-${battleId}`;
      
      io.to(roomName).emit('attack-resolved', {
        ...result,
        timestamp: new Date().toISOString()
      });
    });
    
    // 奇袭请求
    socket.on('surprise-attack', (data) => {
      const { battleId, surpriseUnitId, targetId, type } = data;
      const roomName = `battle-${battleId}`;
      
      // 广播奇袭事件
      io.to(roomName).emit('surprise-attack-triggered', {
        surpriseUnitId,
        targetId,
        type,
        triggeredBy: socket.user.username,
        userId: socket.user.userId,
        timestamp: new Date().toISOString()
      });
      
      // 10秒倒计时
      io.to(roomName).emit('surprise-timer-start', {
        duration: 10,
        timestamp: new Date().toISOString()
      });
    });
    
    // 确认奇袭选择
    socket.on('surprise-choice', (data) => {
      const { battleId, choice } = data;
      const roomName = `battle-${battleId}`;
      
      // choice: 'replace' | 'counter' | 'giveup'
      io.to(roomName).emit('surprise-choice-made', {
        username: socket.user.username,
        userId: socket.user.userId,
        choice,
        timestamp: new Date().toISOString()
      });
    });
    
    // 回合结束
    socket.on('end-turn', (data) => {
      const { battleId, currentFaction } = data;
      const roomName = `battle-${battleId}`;
      
      // 获取下一个阵营
      const factions = ['earth', 'balon', 'maxion'];
      const currentIndex = factions.indexOf(currentFaction);
      const nextFaction = factions[(currentIndex + 1) % factions.length];
      
      io.to(roomName).emit('turn-ended', {
        endedBy: socket.user.username,
        userId: socket.user.userId,
        currentFaction,
        nextFaction,
        timestamp: new Date().toISOString()
      });
    });
    
    // 阶段变更
    socket.on('phase-change', (data) => {
      const { battleId, phase, metadata = {} } = data;
      const roomName = `battle-${battleId}`;
      
      io.to(roomName).emit('phase-changed', {
        phase,
        changedBy: socket.user.username,
        userId: socket.user.userId,
        ...metadata,
        timestamp: new Date().toISOString()
      });
    });
    
    // ========== 玩家状态同步 ==========
    
    // 玩家准备状态变更
    socket.on('player-ready', (data) => {
      const { roomId, isReady } = data;
      const roomName = socket.currentRoom || `room-${roomId}`;
      
      socket.to(roomName).emit('player-ready-changed', {
        username: socket.user.username,
        userId: socket.user.userId,
        isReady,
        timestamp: new Date().toISOString()
      });
    });
    
    // 玩家配置更新（出生点、棋子选择）
    socket.on('player-config', (data) => {
      const { roomId, config } = data;
      const roomName = socket.currentRoom || `room-${roomId}`;
      
      socket.to(roomName).emit('player-config-updated', {
        username: socket.user.username,
        userId: socket.user.userId,
        config,
        timestamp: new Date().toISOString()
      });
    });
    
    // ========== 聊天消息 ==========
    
    socket.on('chat-message', (data) => {
      const { roomId, message, roomType = 'battle' } = data;
      const roomName = roomId || socket.currentRoom || `${roomType}-${data.battleId}`;
      
      if (roomName) {
        io.to(roomName).emit('chat-message', {
          username: socket.user.username,
          userId: socket.user.userId,
          message,
          timestamp: new Date().toISOString()
        });
      }
    });
    
    // 系统消息广播
    socket.on('system-message', (data) => {
      const { roomId, message, type = 'info' } = data;
      const roomName = roomId || socket.currentRoom;
      
      if (roomName) {
        io.to(roomName).emit('system-message', {
          message,
          type,
          timestamp: new Date().toISOString()
        });
      }
    });
    
    // ========== 战斗状态同步 ==========
    
    // 同步战斗状态
    socket.on('sync-battle-state', (data) => {
      const { battleId, state } = data;
      const roomName = `battle-${battleId}`;
      
      // 更新内存中的战斗状态
      const roomState = getRoomState(roomName);
      roomState.battleState = state;
      
      // 广播给房间内其他玩家
      socket.to(roomName).emit('battle-state-synced', {
        state,
        syncedBy: socket.user.username,
        userId: socket.user.userId,
        timestamp: new Date().toISOString()
      });
    });
    
    // 请求同步战斗状态
    socket.on('request-battle-state', (data) => {
      const { battleId } = data;
      const roomName = `battle-${battleId}`;
      
      const roomState = roomStates.get(roomName);
      if (roomState && roomState.battleState) {
        socket.emit('battle-state-synced', {
          state: roomState.battleState,
          timestamp: new Date().toISOString()
        });
      }
    });
    
    // ========== 断开连接 ==========
    
    socket.on('disconnect', (reason) => {
      console.log(`[Comm] User disconnected: ${socket.user.username}, reason: ${reason}`);
      
      // 清理房间状态
      if (socket.currentRoom) {
        const roomState = roomStates.get(socket.currentRoom);
        if (roomState) {
          roomState.players.delete(socket.user.userId);
          
          // 通知房间内其他人
          socket.to(socket.currentRoom).emit('player-disconnected', {
            username: socket.user.username,
            userId: socket.user.userId,
            timestamp: new Date().toISOString()
          });
          
          // 如果房间为空，清理状态
          if (roomState.players.size === 0) {
            cleanupRoomState(socket.currentRoom);
          }
        }
      }
      
      if (socket.currentBattle) {
        const roomName = `battle-${socket.currentBattle}`;
        socket.to(roomName).emit('player-disconnected', {
          username: socket.user.username,
          userId: socket.user.userId,
          type: 'battle',
          timestamp: new Date().toISOString()
        });
      }
    });
  });
  
  console.log('[Comm] Socket.io handlers initialized');
}

export { roomStates };
