/**
 * Phase 29-X — 房间管理路由 (sql.js)
 *
 * 100% 由 3006 SQLite 持久化模块独裁接管。
 */

import { Router } from 'express';
import { v4 as uuidv4 } from 'uuid';
import bcrypt from 'bcryptjs';
import { authenticate, requireAuth, requireRole } from '../middleware/auth.js';
import { run, get, all, persistChanges } from '../db/sqlite.js';
import { ErrorCode, RoomStatus, UserRole } from '@mecha/shared-kernel';
import type { CreateRoomRequest, JoinRoomRequest } from '@mecha/shared-kernel';

const router = Router();

// Phase 29-P1: 统一认证 — GET/HEAD 放行游客观战，写操作需强制认证
router.use('/api/rooms', authenticate, (req, res, next) => {
  if (req.method === 'GET' || req.method === 'HEAD') return next();
  requireAuth(req, res, next);
});

router.get('/api/rooms', (req, res) => {
  const rooms = all(`
    SELECT id, name, status, host_id, map_id, max_players, turn_time_limit,
           is_private, battle_id, created_at, updated_at
    FROM rooms WHERE status != 'cancelled' ORDER BY created_at DESC
  `);

  const result = rooms.map((room: any) => {
    const players = all('SELECT user_id, username, faction, team, ready, joined_at FROM room_players WHERE room_id = ?', [room.id]);
    return { ...room, isPrivate: !!room.is_private, hostId: room.host_id, mapId: room.map_id, maxPlayers: room.max_players, turnTimeLimit: room.turn_time_limit, players };
  });

  res.json({ rooms: result });
});

router.post('/api/rooms', async (req, res) => {
  try {
    // Phase 29-P1: 创建房间硬性卡死 — 仅 referee/admin/dominator 级别
    const userRole = (req.auth!.role || UserRole.USER) as UserRole;
    if (![UserRole.REFEREE, UserRole.ADMIN, UserRole.DOMINATOR].includes(userRole)) {
      res.status(403).json({
        error: ErrorCode.ROLE_FORBIDDEN,
        message: '权限不足：仅限裁判及以上级别创建房间',
      });
      return;
    }

    const { name, maxPlayers = 4, mapId, turnTimeLimit = 60, isPrivate = false, password, rules = {} } = req.body as CreateRoomRequest;

    if (!name || !mapId) {
      res.status(400).json({ error: ErrorCode.VALIDATION_ERROR, message: '房间名称和地图 ID 为必填项' });
      return;
    }

    const roomId = uuidv4();
    const userId = req.auth!.userId;
    const username = req.auth!.username;

    let passwordHash: string | null = null;
    if (isPrivate && password) {
      passwordHash = await bcrypt.hash(password, 10);
    }

    run(`INSERT INTO rooms (id, name, status, host_id, map_id, max_players, turn_time_limit, is_private, password_hash, rules)
         VALUES (?, ?, '${RoomStatus.WAITING}', ?, ?, ?, ?, ?, ?, ?)`,
      [roomId, name, userId, mapId, maxPlayers, turnTimeLimit, isPrivate ? 1 : 0, passwordHash, JSON.stringify(rules)]);

    run('INSERT INTO room_players (room_id, user_id, username, faction, team, ready) VALUES (?, ?, ?, ?, ?, ?)',
      [roomId, userId, username, 'earth', 0, 0]);

    persistChanges();

    res.status(201).json({
      room: { id: roomId, name, status: RoomStatus.WAITING, hostId: userId, mapId, maxPlayers, turnTimeLimit, isPrivate, battleId: null, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(), players: [{ userId, username, faction: 'earth', team: 0, ready: false, joinedAt: new Date().toISOString() }] },
    });
  } catch (err) {
    console.error('[Room] 创建房间错误:', err);
    res.status(500).json({ error: ErrorCode.INTERNAL_ERROR, message: '创建房间失败' });
  }
});

router.get('/api/rooms/:roomId', (req, res) => {
  const room = get('SELECT * FROM rooms WHERE id = ?', [req.params.roomId]) as any;
  if (!room) {
    res.status(404).json({ error: ErrorCode.ROOM_NOT_FOUND, message: '房间不存在' });
    return;
  }

  const players = all('SELECT user_id, username, faction, team, ready, joined_at FROM room_players WHERE room_id = ?', [room.id]);

  res.json({
    room: {
      id: room.id, name: room.name, status: room.status,
      hostId: room.host_id, mapId: room.map_id, maxPlayers: room.max_players,
      turnTimeLimit: room.turn_time_limit, isPrivate: !!room.is_private,
      battleId: room.battle_id, rules: JSON.parse(room.rules || '{}'),
      createdAt: room.created_at, updatedAt: room.updated_at, players,
    },
  });
});

router.post('/api/rooms/:roomId/join', async (req, res) => {
  try {
    const { password, team = 0 } = req.body as JoinRoomRequest;
    const room = get('SELECT * FROM rooms WHERE id = ?', [req.params.roomId]) as any;
    if (!room) {
      res.status(404).json({ error: ErrorCode.ROOM_NOT_FOUND, message: '房间不存在' });
      return;
    }
    if (room.status !== RoomStatus.WAITING) {
      res.status(400).json({ error: 'ROOM_NOT_OPEN', message: '房间已开始或已关闭' });
      return;
    }

    const count = get('SELECT COUNT(*) as c FROM room_players WHERE room_id = ?', [room.id]) as any;
    if (count.c >= room.max_players) {
      res.status(400).json({ error: ErrorCode.ROOM_FULL, message: '房间已满' });
      return;
    }

    const existing = get('SELECT 1 FROM room_players WHERE room_id = ? AND user_id = ?', [room.id, req.auth!.userId]);
    if (existing) {
      res.status(400).json({ error: ErrorCode.ROOM_ALREADY_JOINED, message: '你已经在该房间中' });
      return;
    }

    if (room.is_private && room.password_hash) {
      if (!password) {
        res.status(403).json({ error: ErrorCode.ROOM_PASSWORD_REQUIRED, message: '请输入房间密码' });
        return;
      }
      const valid = await bcrypt.compare(password, room.password_hash);
      if (!valid) {
        res.status(403).json({ error: 'WRONG_PASSWORD', message: '密码错误' });
        return;
      }
    }

    run('INSERT INTO room_players (room_id, user_id, username, faction, team, ready) VALUES (?, ?, ?, ?, ?, ?)',
      [room.id, req.auth!.userId, req.auth!.username, 'earth', team, 0]);
    run('UPDATE rooms SET updated_at = datetime(\'now\') WHERE id = ?', [room.id]);
    persistChanges();

    res.json({ success: true, roomId: room.id });
  } catch (err) {
    console.error('[Room] 加入房间错误:', err);
    res.status(500).json({ error: ErrorCode.INTERNAL_ERROR, message: '加入房间失败' });
  }
});

router.post('/api/rooms/:roomId/leave', (req, res) => {
  const room = get('SELECT * FROM rooms WHERE id = ?', [req.params.roomId]) as any;
  if (!room) {
    res.status(404).json({ error: ErrorCode.ROOM_NOT_FOUND, message: '房间不存在' });
    return;
  }

  run('DELETE FROM room_players WHERE room_id = ? AND user_id = ?', [room.id, req.auth!.userId]);

  if (room.host_id === req.auth!.userId) {
    const nextHost = get('SELECT user_id FROM room_players WHERE room_id = ? LIMIT 1', [room.id]) as any;
    if (nextHost) {
      run('UPDATE rooms SET host_id = ?, updated_at = datetime(\'now\') WHERE id = ?', [nextHost.user_id, room.id]);
    } else {
      run(`UPDATE rooms SET status = '${RoomStatus.CANCELLED}', updated_at = datetime('now') WHERE id = ?`, [room.id]);
    }
  } else {
    run('UPDATE rooms SET updated_at = datetime(\'now\') WHERE id = ?', [room.id]);
  }
  persistChanges();

  res.json({ success: true });
});

router.post('/api/rooms/:roomId/ready', (req, res) => {
  const existing = get('SELECT ready FROM room_players WHERE room_id = ? AND user_id = ?', [req.params.roomId, req.auth!.userId]) as any;
  if (!existing) {
    res.status(404).json({ error: 'NOT_IN_ROOM', message: '你不在该房间中' });
    return;
  }

  const newReady = existing.ready ? 0 : 1;
  run('UPDATE room_players SET ready = ? WHERE room_id = ? AND user_id = ?', [newReady, req.params.roomId, req.auth!.userId]);
  persistChanges();

  res.json({ ready: !!newReady });
});

router.post('/api/rooms/:roomId/start', (req, res) => {
  const room = get('SELECT * FROM rooms WHERE id = ?', [req.params.roomId]) as any;
  if (!room) {
    res.status(404).json({ error: ErrorCode.ROOM_NOT_FOUND, message: '房间不存在' });
    return;
  }
  if (room.host_id !== req.auth!.userId) {
    res.status(403).json({ error: ErrorCode.ROOM_NOT_OWNER, message: '只有房主可以开始战斗' });
    return;
  }

  const notReady = get('SELECT COUNT(*) as c FROM room_players WHERE room_id = ? AND ready = 0', [room.id]) as any;
  if (notReady.c > 0) {
    res.status(400).json({ error: 'NOT_ALL_READY', message: '还有玩家未准备' });
    return;
  }

  const battleId = uuidv4();
  run(`UPDATE rooms SET status = '${RoomStatus.IN_BATTLE}', battle_id = ?, updated_at = datetime('now') WHERE id = ?`, [battleId, room.id]);
  run('INSERT INTO battles (id, room_id, map_id, status, started_at) VALUES (?, ?, ?, ?, datetime(\'now\'))', [battleId, room.id, room.map_id, 'in_progress']);
  persistChanges();

  res.json({ success: true, battleId });
});

router.put('/api/rooms/:roomId/settings', (req, res) => {
  const room = get('SELECT * FROM rooms WHERE id = ?', [req.params.roomId]) as any;
  if (!room) {
    res.status(404).json({ error: ErrorCode.ROOM_NOT_FOUND, message: '房间不存在' });
    return;
  }
  if (room.host_id !== req.auth!.userId) {
    res.status(403).json({ error: ErrorCode.ROOM_NOT_OWNER, message: '只有房主可以修改设置' });
    return;
  }

  const { name, maxPlayers, turnTimeLimit, rules } = req.body;
  const updates: string[] = [];
  const values: any[] = [];

  if (name) { updates.push('name = ?'); values.push(name); }
  if (maxPlayers) { updates.push('max_players = ?'); values.push(maxPlayers); }
  if (turnTimeLimit) { updates.push('turn_time_limit = ?'); values.push(turnTimeLimit); }
  if (rules) { updates.push('rules = ?'); values.push(JSON.stringify(rules)); }

  if (updates.length > 0) {
    updates.push('updated_at = datetime(\'now\')');
    values.push(room.id);
    run(`UPDATE rooms SET ${updates.join(', ')} WHERE id = ?`, values);
    persistChanges();
  }

  res.json({ success: true });
});

router.delete('/api/rooms/:roomId', (req, res) => {
  const room = get('SELECT * FROM rooms WHERE id = ?', [req.params.roomId]) as any;
  if (!room) {
    res.status(404).json({ error: ErrorCode.ROOM_NOT_FOUND, message: '房间不存在' });
    return;
  }
  if (room.host_id !== req.auth!.userId) {
    res.status(403).json({ error: ErrorCode.ROOM_NOT_OWNER, message: '只有房主可以删除房间' });
    return;
  }

  run(`UPDATE rooms SET status = '${RoomStatus.CANCELLED}', updated_at = datetime('now') WHERE id = ?`, [room.id]);
  persistChanges();
  res.json({ success: true });
});

router.get('/api/rooms/:roomId/chat', (req, res) => {
  const limit = parseInt(req.query.limit as string) || 50;
  const messages = all('SELECT id, user_id, username, message, created_at FROM room_chats WHERE room_id = ? ORDER BY created_at DESC LIMIT ?', [req.params.roomId, limit]);
  res.json({ messages: messages.reverse() });
});

router.post('/api/rooms/:roomId/chat', (req, res) => {
  const { message } = req.body;
  if (!message || message.length > 500) {
    res.status(400).json({ error: ErrorCode.VALIDATION_ERROR, message: '消息不能为空且不超过 500 字符' });
    return;
  }

  const inRoom = get('SELECT 1 FROM room_players WHERE room_id = ? AND user_id = ?', [req.params.roomId, req.auth!.userId]);
  if (!inRoom) {
    res.status(403).json({ error: 'NOT_IN_ROOM', message: '你不在该房间中' });
    return;
  }

  const id = uuidv4();
  run('INSERT INTO room_chats (id, room_id, user_id, username, message) VALUES (?, ?, ?, ?, ?)',
    [id, req.params.roomId, req.auth!.userId, req.auth!.username, message]);
  persistChanges();

  res.status(201).json({ id, username: req.auth!.username, message, createdAt: new Date().toISOString() });
});

export default router;
