/**
 * Socket.io 实时通讯服务
 * 处理多人对战的实时状态同步
 */

import dotenv from 'dotenv';
import jwt from 'jsonwebtoken';
import { broadcastNative } from './wsNativeService.js';

// 加载环境变量（必须在读取 process.env 之前调用）
dotenv.config();

// 强制要求 JWT_SECRET
const JWT_SECRET=process.env.JWT_SECRET;
if (!JWT_SECRET) {
  throw new Error('[配置错误] JWT_SECRET 环境变量必须设置！');
}

// 内存中的房间状态管理
const roomStates = new Map();

// Batch A 任务1.0/1.1: 最新推送战斗态缓存 + 迷雾过滤（P1）
export const latestBattleState = new Map();

// ============================================================
// ★ I-6：视线阻挡（LoS）本地判定（服务端权威）
// 注：comm-service 当前未直接依赖 @mecha/shared-kernel，故在此内联等价实现，
// 必须与 shared-kernel/src/hexMath.ts 的 hexLineDraw/computeLoS 逐字节一致。
// 消费 terrain 的 elevation / blocks_sight（非 height）。
// ============================================================
const LOS_TOLERANCE = 1;

function offsetToAxial(q, r) {
  return { q: q - (r + (r & 1)) / 2, r };
}
function axialToOffset(q, r) {
  return { q: q + (r + (r & 1)) / 2, r };
}
function hexDistanceGH(q1, r1, q2, r2) {
  const a = offsetToAxial(q1, r1);
  const b = offsetToAxial(q2, r2);
  const dq = Math.abs(a.q - b.q);
  const dr = Math.abs(a.r - b.r);
  const ds = Math.abs(a.q + a.r - b.q - b.r);
  return Math.max(dq, dr, ds);
}
function cubeRound(x, y, z) {
  let rx = Math.round(x);
  let ry = Math.round(y);
  let rz = Math.round(z);
  const dx = Math.abs(rx - x);
  const dy = Math.abs(ry - y);
  const dz = Math.abs(rz - z);
  if (dx > dy && dx > dz) rx = -ry - rz;
  else if (dy > dz) ry = -rx - rz;
  else rz = -rx - ry;
  return { q: rx, r: ry, s: rz };
}
/** 六角格直线插值（cube lerp + cube round），含两端。须与 shared-kernel 逐字一致。 */
function hexLineDraw(fromQ, fromR, toQ, toR) {
  const a = offsetToAxial(fromQ, fromR);
  const b = offsetToAxial(toQ, toR);
  const aC = { q: a.q, r: a.r, s: -a.q - a.r };
  const bC = { q: b.q, r: b.r, s: -b.q - b.r };
  const n = hexDistanceGH(fromQ, fromR, toQ, toR);
  if (n === 0) return [{ q: fromQ, r: fromR }];
  const out = [];
  for (let i = 0; i <= n; i++) {
    const t = i / n;
    const c = cubeRound(
      aC.q + (bC.q - aC.q) * t,
      aC.r + (bC.r - aC.r) * t,
      aC.s + (bC.s - aC.s) * t,
    );
    out.push(axialToOffset(c.q, c.r));
  }
  return out;
}
/** 服务端权威视线判定。grid: Map<"q,r",{elevation,blocks_sight}> */
function computeLoS(fromQ, fromR, toQ, toR, grid, opts = {}) {
  const dist = hexDistanceGH(fromQ, fromR, toQ, toR);
  if (opts.sightRange != null && dist > opts.sightRange) return false;
  const line = hexLineDraw(fromQ, fromR, toQ, toR);
  const viewerEye = opts.viewerEye ?? (grid.get(fromQ + ',' + fromR)?.elevation || 0);
  for (let i = 1; i < line.length - 1; i++) {
    const cell = grid.get(line[i].q + ',' + line[i].r);
    if (!cell) continue;
    if (cell.blocks_sight) return false;
    if (cell.elevation - viewerEye > LOS_TOLERANCE) return false;
  }
  return true;
}

/**
 * ★ I-6 (K12)：可见性状态裁决（按 I6.3 优先级表）。
 * @returns 'visible' | 'stealth' | 'hidden' | 'scanned'
 */
export function deriveVisibilityStatus(unit, observer, losOpts) {
  if (!observer) return 'visible';
  const sameFaction = unit.faction === observer.faction;
  if (sameFaction) return 'visible';
  // 被扫描（scanned 标记）穿透遮挡
  if (unit.scanned === true) return 'scanned';
  // 隐身单位：无 LoS 或未被侦测 → stealth（不可见）
  if (unit.stealth === true) {
    return losOpts && computeLoS(observer.q, observer.r, unit.q, unit.r, losOpts.grid, losOpts)
      ? 'stealth'
      : 'stealth';
  }
  // 普通敌方：LoS 不可达 → hidden（地形遮挡剔除）
  if (losOpts && !computeLoS(observer.q, observer.r, unit.q, unit.r, losOpts.grid, losOpts)) {
    return 'hidden';
  }
  return 'visible';
}

/**
 * 迷雾过滤（P1）：依据观察者角色/阵营裁剪可见单位。
 *  - REFEREE / DOMINATOR：全树可见
 *  - Visitor：仅见自己 faction，且剔除一切隐身单位（stealth===true）
 *  - Player ：敌方隐身单位（faction!==观察者 且 stealth===true）不可见
 */
export function applyFog(state, faction, role, isHost, losOptions) {
  if (!state) return state;
  const r = (role || '').toString().toUpperCase();
  // GM / 管理员 / 房主(isHost 代打) 豁免战争迷雾：直接下发全量快照（上帝视角）
  if (r === 'REFEREE' || r === 'DOMINATOR' || isHost) return state;
  // ★ I-6：LoS 选项可由调用方显式传入，或从 state._losOptions 读取（网关推送时挂载）
  const los = losOptions || state._losOptions || null;
  const observer = los ? { faction, q: los.viewerPos?.q, r: los.viewerPos?.r } : null;
  const units = Array.isArray(state.units) ? state.units : [];
  const filtered = units.filter((u) => {
    if (r === 'VISITOR') {
      if (u.stealth === true) return false;
      return u.faction === faction;
    }
    // 默认（Player / 未定义）按玩家规则
    if (u.faction !== faction && u.stealth === true) return false;
    // ★ I-6：地形遮挡剔除（hidden 状态不下发，杜绝抓包透视）
    if (los && observer && u.faction !== faction) {
      const status = deriveVisibilityStatus(u, observer, los);
      if (status === 'hidden') return false;
    }
    return true;
  });
  return { ...state, units: filtered };
}

/**
 * 逐客户端广播战斗态：每个 socket 按其阵营/角色拿到迷雾过滤后的视图。
 */
export async function emitBattleState(io, battleId, state) {
  latestBattleState.set(battleId, state);
  const room = `battle-${battleId}`;
  try {
    const sockets = await io.in(room).fetchSockets();
    for (const socket of sockets) {
      const { faction, role } = socket.data || {};
      // 房主(isHost)判定：服务端按 state.hostId 与 socket 登录用户比对，防客户端伪造
      const isHost = !!(socket.user && state.hostId && String(socket.user.userId) === String(state.hostId));
      const view = applyFog(state, faction, role, isHost);
      socket.emit('battle-state', { battleId, battleState: view, serverTime: Date.now() });
    }
    // 原生 WS（Godot）订阅者：下发上帝视角全量快照（与 REFEREE 视图一致）
    broadcastNative(battleId, state);
  } catch (err) {
    console.warn('[comm] emitBattleState 失败:', err?.message || err);
  }
}

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
    // P1 向后兼容：支持旧版 `emit('join-battle', battleId)` 字符串，
    // 也支持新版 `{ battleId, faction, role }` 对象（Batch C 前端迁移后启用迷雾）。
    socket.on('join-battle', (payload) => {
      let battleId = payload;
      let faction;
      let role;
      if (payload && typeof payload === 'object') {
        battleId = payload.battleId;
        faction = payload.faction;
        role = payload.role;
      }
      if (!battleId) return;

      // P1 服务端 Faction 鉴权（防越权）：白名单消毒，未知阵营回落 neutral。
      const ALLOWED = ['earth', 'bylon', 'maxion', 'neutral'];
      if (faction && ALLOWED.includes(faction)) socket.data.faction = faction;
      if (role === 'REFEREE' || role === 'DOMINATOR' || role === 'Visitor') {
        socket.data.role = role;
      } else {
        socket.data.role = socket.data.role || 'Player';
      }

      const roomName = `battle-${battleId}`;
      socket.join(roomName);
      socket.currentBattle = battleId;
      
      console.log(`[Comm] User ${socket.user.username} joined battle ${battleId} faction=${socket.data.faction} role=${socket.data.role}`);
      
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
