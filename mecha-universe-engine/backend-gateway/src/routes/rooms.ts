/**
 * Phase 29-X — 房间管理路由 (sql.js)
 *
 * 100% 由 3006 SQLite 持久化模块独裁接管。
 */

import { logger } from '../utils/logger.js';
import { Router } from 'express';
import { v4 as uuidv4 } from 'uuid';
import bcrypt from 'bcryptjs';
import { authenticate, requireAuth, requireRole } from '../middleware/auth.js';
import { run, get, all, persistChanges } from '../db/sqlite.js';
import { ErrorCode, RoomStatus, UserRole } from '@mecha/shared-kernel';
import type { CreateRoomRequest, JoinRoomRequest } from '@mecha/shared-kernel';
import { pushRoomUpdate } from '../services/commPush.js';
import { seedRoomBattle, clearBattle } from './combat.js';
import { applySizeHp } from '../unitSize.js';
// ★ C5 防投毒：settings 接口的 Schema 强校验模块
import { validateRoomSettings } from './roomSettingsSchema.js';

const router = Router();

// Phase: 6 位房号生成 / GM+ 账号同时保存战局上限 / 观战标记
const MAX_ROOMS_PER_HOST = 5;
function genRoomCode(): string {
  let code = '';
  let tries = 0;
  do {
    code = String(Math.floor(100000 + Math.random() * 900000));
    tries++;
  } while (tries < 200 && get('SELECT 1 FROM rooms WHERE code = ?', [code]));
  return code;
}
function isGmRole(role: string): boolean {
  return role === UserRole.REFEREE || role === UserRole.ADMIN || role === UserRole.DOMINATOR;
}

// 阵营角色：攻击 / 防守 / 偷袭 / 观众（观众不参战）
export const COMBAT_ROLES = ['attack', 'defense', 'ambush'] as const;
export const ALL_ROLES = ['attack', 'defense', 'ambush', 'referee', 'visitor'] as const;
export const ROLE_LABELS: Record<string, string> = {
  attack: '攻击阵营', defense: '防守阵营', ambush: '偷袭阵营', visitor: '观众阵营',
};
// 角色 → 战局政治阵营(earth/maxion/balon) 默认映射；可被房间 rules.factionRoles 覆盖
const DEFAULT_ROLE_FACTIONS: Record<string, string> = { attack: 'earth', defense: 'maxion', ambush: 'balon' };
function resolveRoleFaction(role: string | null | undefined, rules: any): string {
  if (!role || role === 'visitor') return 'earth';
  const fr = (rules && rules.factionRoles) || {};
  const mapped = fr[role];
  if (Array.isArray(mapped) && mapped.length > 0) return mapped[0];
  return DEFAULT_ROLE_FACTIONS[role] || 'earth';
}

/**
 * 汇总“已加入战场的棋子”：所有非观战、非裁判的参战玩家勾选的出场棋子，
 * 解析为 {id,name,faction,category,tier,ownerId,ownerName,playerRole} 列表。
 * 供整备室房主面板把“已加入的棋子”作为阵营轮转的可选项，并随 room-update 实时推送。
 * 裁判(referee)不产出棋子（他们是代理者，不下场）。
 */
function buildJoinedUnits(roomId: string): any[] {
  const rows = all(
    'SELECT user_id as "userId", username, role, selected_units as "selectedUnits" FROM room_players WHERE room_id = ? AND is_spectator = 0 AND role != ?',
    [roomId, 'referee'],
  ) as any[];
  const out: any[] = [];
  for (const pr of rows) {
    let ids: string[] = [];
    if (pr.selectedUnits) {
      try { const a = JSON.parse(pr.selectedUnits); if (Array.isArray(a)) ids = a.filter((x: any) => typeof x === 'string'); } catch { /* ignore */ }
    }
    for (const uid of ids) {
      const u = get('SELECT id, name, faction, category, tier FROM units WHERE id = ?', [uid]) as any;
      if (!u) continue;
      out.push({
        id: u.id, name: u.name, faction: u.faction, category: u.category, tier: u.tier,
        ownerId: pr.userId, ownerName: pr.username, playerRole: pr.role,
      });
    }
  }
  return out;
}
// 校验各阵营密码：可选，若存在则必须为 4 位数字
function normalizeFactionPasswords(input: any): Record<string, string> {
  const out: Record<string, string> = {};
  if (input && typeof input === 'object') {
    for (const r of COMBAT_ROLES) {
      const v = input[r];
      if (v === undefined || v === null || v === '') continue;
      if (typeof v !== 'string' || !/^\d{4}$/.test(v)) {
        throw new Error(`「${ROLE_LABELS[r]}」密码必须是 4 位数字`);
      }
      out[r] = v;
    }
  }
  return out;
}

// 整备室：把 room_players.selected_units(TEXT JSON) 解析为 selectedUnitIds 数组
function parsePlayerRow(p: any) {
  let selectedUnitIds: string[] = [];
  if (p && p.selectedUnits) {
    try {
      const arr = JSON.parse(p.selectedUnits);
      if (Array.isArray(arr)) selectedUnitIds = arr.filter((x: any) => typeof x === 'string');
    } catch { /* 损坏数据忽略 */ }
  }
  const role = p.role || (p.isSpectator ? 'visitor' : 'attack');
  // 双轨制（2026-07-30）：优先读 identity_role / tactical_slot，缺失时由兼容 role 推导
  const identityRole = (p.identityRole || (['referee', 'visitor'].includes(role) ? role : 'player')) as any;
  const tacticalSlot = ((p.tacticalSlot !== undefined && p.tacticalSlot !== null)
    ? p.tacticalSlot
    : (['attack', 'defense', 'ambush'].includes(role) ? role : null)) as any;
  return {
    ...p,
    selectedUnitIds,
    isSpectator: !!p.isSpectator,
    role,
    identityRole,
    tacticalSlot,
    faction: p.faction || resolveRoleFaction(role, {}),
  };
}

// 派生各阵营是否需要密码（不泄露明文密码，仅给前端决定是否显示密码框）
function deriveFactionPasswordRequired(room: any): Record<string, boolean> {
  let pw: any = {};
  try { pw = room.faction_passwords ? JSON.parse(room.faction_passwords) : {}; } catch { pw = {}; }
  return {
    attack: !!(pw.attack),
    defense: !!(pw.defense),
    ambush: !!(pw.ambush),
  };
}

// Phase 29-P1: 统一认证 — GET/HEAD 放行游客观战，写操作需强制认证
router.use('/api/rooms', authenticate, (req, res, next) => {
  if (req.method === 'GET' || req.method === 'HEAD') return next();
  requireAuth(req, res, next);
});

router.get('/api/rooms', (req, res) => {
  const rooms = all(`
    SELECT id, name, status, host_id, map_id, max_players, turn_time_limit,
           is_private, battle_id, created_at, updated_at, code, faction_passwords
    FROM rooms WHERE status != 'cancelled' ORDER BY created_at DESC
  `);

  const result = rooms.map((room: any) => {
    const players = all('SELECT user_id as "userId", username, faction, role, identity_role as "identityRole", tactical_slot as "tacticalSlot", team, ready, joined_at as "joinedAt", is_spectator as "isSpectator", selected_units as "selectedUnits" FROM room_players WHERE room_id = ?', [room.id]);
    return {
      ...room,
      code: room.code,
      isPrivate: !!room.is_private,
      hostId: room.host_id,
      mapId: room.map_id,
      maxPlayers: room.max_players,
      turnTimeLimit: room.turn_time_limit,
      rosterLocked: !!room.roster_locked,
      factionPasswordRequired: deriveFactionPasswordRequired(room),
      players: players.map(parsePlayerRow),
    };
  });

  res.json({ rooms: result });
});

router.post('/api/rooms', async (req, res) => {
  try {
    // 只有 GM（裁判/管理员/主宰）才能开房间；玩家与观众仅可加入
    if (!isGmRole(req.auth!.role)) {
      res.status(403).json({ error: 'ONLY_GM_CAN_CREATE', message: '只有 GM 才能创建房间，玩家/观众请通过「加入战场」进入' });
      return;
    }
    const { name, maxPlayers = 4, mapId, turnTimeLimit = 60, isPrivate = false, password, rules = {}, factionPasswords } = req.body as CreateRoomRequest & { factionPasswords?: any };
    const userId = req.auth!.userId;
    const username = req.auth!.username;

    if (!name || !mapId) {
      res.status(400).json({ error: ErrorCode.VALIDATION_ERROR, message: '房间名称和地图 ID 为必填项' });
      return;
    }

    // GM+ 账号最多同时保存 5 场战斗，防止囤积
    const activeCount = get('SELECT COUNT(*) as c FROM rooms WHERE host_id = ? AND status IN (\'waiting\',\'in_battle\',\'preparing\')', [userId]) as any;
    if (activeCount && activeCount.c >= MAX_ROOMS_PER_HOST) {
      res.status(409).json({ error: ErrorCode.ROOM_FULL, message: `你最多同时保存 ${MAX_ROOMS_PER_HOST} 场战斗，请先结束或删除旧的战局` });
      return;
    }

    // 校验各阵营密码（可选，4 位数字）
    let factionPwJson = '{}';
    try {
      factionPwJson = JSON.stringify(normalizeFactionPasswords(factionPasswords));
    } catch (e: any) {
      res.status(400).json({ error: ErrorCode.VALIDATION_ERROR, message: e.message || '阵营密码格式错误' });
      return;
    }

    const roomId = uuidv4();
    const code = genRoomCode();

    let passwordHash: string | null = null;
    if (isPrivate && password) {
      passwordHash = await bcrypt.hash(password, 10);
    }

    run(`INSERT INTO rooms (id, name, code, status, host_id, map_id, max_players, turn_time_limit, is_private, password_hash, rules, victory_conditions, faction_passwords)
         VALUES (?, ?, ?, '${RoomStatus.WAITING}', ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [roomId, name, code, userId, mapId, maxPlayers, turnTimeLimit, isPrivate ? 1 : 0, passwordHash, JSON.stringify(rules), '{}', factionPwJson]);

    // GM 房主默认归入攻击阵营（可在整备室调整为任意阵营）
    const hostRole = 'attack';
    const hostFaction = resolveRoleFaction(hostRole, rules);
    run('INSERT INTO room_players (room_id, user_id, username, faction, role, team, ready, is_spectator) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
      [roomId, userId, username, hostFaction, hostRole, 0, 0, 0]);

    run('UPDATE users SET last_room_id = ? WHERE id = ?', [roomId, userId]);

    persistChanges();

    res.status(201).json({
      room: { id: roomId, name, code, status: RoomStatus.WAITING, hostId: userId, mapId, maxPlayers, turnTimeLimit, isPrivate, battleId: null, factionPasswordRequired: deriveFactionPasswordRequired({ faction_passwords: factionPwJson }), createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(), players: [{ userId, username, faction: hostFaction, role: hostRole, team: 0, ready: false, isSpectator: false, joinedAt: new Date().toISOString() }] },
    });
  } catch (err) {
    logger.error({ msg: `[Room] 创建房间错误: ${ err }` });
    res.status(500).json({ error: ErrorCode.INTERNAL_ERROR, message: '创建房间失败' });
  }
});

// Phase: 通过 6 位房号解析房间（必须定义在 /:roomId 之前）
router.get('/api/rooms/by-code/:code', (req, res) => {
  const room = get(`
    SELECT id, name, code, status, host_id as "hostId", map_id as "mapId",
           max_players as "maxPlayers", is_private as "isPrivate",
           roster_locked as "rosterLocked", turn_time_limit as "turnTimeLimit",
           created_at as "createdAt", faction_passwords
    FROM rooms WHERE code = ?
  `, [req.params.code]) as any;
  if (!room) {
    res.status(404).json({ error: ErrorCode.ROOM_NOT_FOUND, message: '房间号不存在' });
    return;
  }
  const players = all('SELECT user_id as "userId", username, faction, role, identity_role as "identityRole", tactical_slot as "tacticalSlot", team, ready, is_spectator as "isSpectator", selected_units as "selectedUnits" FROM room_players WHERE room_id = ?', [room.id]) as any[];
  room.players = players.map(parsePlayerRow);
  room.factionPasswordRequired = deriveFactionPasswordRequired(room);
  room.currentPlayers = players.filter((p: any) => !p.isSpectator).length;
  res.json({ room });
});

router.get('/api/rooms/:roomId', (req, res) => {
  const room = get('SELECT * FROM rooms WHERE id = ?', [req.params.roomId]) as any;
  if (!room) {
    res.status(404).json({ error: ErrorCode.ROOM_NOT_FOUND, message: '房间不存在' });
    return;
  }

  const players = all('SELECT user_id as "userId", username, faction, role, identity_role as "identityRole", tactical_slot as "tacticalSlot", team, ready, joined_at as "joinedAt", is_spectator as "isSpectator", selected_units as "selectedUnits" FROM room_players WHERE room_id = ?', [room.id]);

  res.json({
    room: {
      id: room.id, name: room.name, code: room.code, status: room.status,
      hostId: room.host_id, mapId: room.map_id, maxPlayers: room.max_players,
      turnTimeLimit: room.turn_time_limit, isPrivate: !!room.is_private,
      battleId: room.battle_id, rules: JSON.parse(room.rules || '{}'),
      victoryConditions: (() => { try { return JSON.parse(room.victory_conditions || '{}'); } catch { return {}; } })(),
      rosterLocked: !!room.roster_locked,
      factionPasswordRequired: deriveFactionPasswordRequired(room),
      createdAt: room.created_at, updatedAt: room.updated_at,
      players: players.map(parsePlayerRow),
      joinedUnits: buildJoinedUnits(room.id),
    },
  });
});

router.post('/api/rooms/:roomId/join', async (req, res) => {
  try {
    const { role, password, team = 0, faction, spectator } = req.body as JoinRoomRequest & { role?: string; faction?: string; spectator?: boolean };
    const joinRole = (ALL_ROLES as readonly string[]).includes(role as string) ? (role as string) : (spectator ? 'visitor' : 'attack');
    const room = get('SELECT * FROM rooms WHERE id = ?', [req.params.roomId]) as any;
    if (!room) {
      res.status(404).json({ error: ErrorCode.ROOM_NOT_FOUND, message: '房间不存在' });
      return;
    }

    const myUserId = req.auth!.userId;

    // 重连放行：若访问者已在房间参与者名单中，直接放行并恢复其上次的权限范围
    // （阵营 / 队伍 / 观战 / 房主），不受「名册锁定」或「战斗已开始」限制。
    // 满足刷新 / 掉线后重新进入自己房间或正在进行的对局。
    const existing = get('SELECT * FROM room_players WHERE room_id = ? AND user_id = ?', [room.id, myUserId]) as any;
    if (existing) {
      run('UPDATE users SET last_room_id = ? WHERE id = ?', [room.id, myUserId]);
      run('UPDATE rooms SET updated_at = datetime(\'now\') WHERE id = ?', [room.id]);
      persistChanges();
      pushRoomUpdate(room.id);
      res.json({
        success: true,
        rejoined: true,
        roomId: room.id,
        code: room.code,
        permission: {
          faction: existing.faction,
          role: existing.role || (existing.is_spectator ? 'visitor' : 'attack'),
          team: existing.team,
          isSpectator: !!existing.is_spectator,
          isHost: room.host_id === myUserId,
        },
      });
      return;
    }

    // —— 以下为「新加入」的限制 ——
    // B-2.1 名册锁定：锁定后禁止再加入
    if (room.roster_locked) {
      res.status(403).json({ error: 'ROSTER_LOCKED', message: '名册已锁定，无法加入' });
      return;
    }
    if (room.status !== RoomStatus.WAITING) {
      res.status(400).json({ error: 'ROOM_NOT_OPEN', message: '房间已开始或已关闭' });
      return;
    }

    // 阵营角色解析（攻击/防守/偷袭/观众）；观众不参战
    const isVisitor = joinRole === 'visitor';
    const isSpectator = isVisitor || !!spectator;
    // 观战不占参赛名额
    const count = get('SELECT COUNT(*) as c FROM room_players WHERE room_id = ? AND is_spectator = 0', [room.id]) as any;
    if (!isSpectator && count.c >= room.max_players) {
      res.status(400).json({ error: ErrorCode.ROOM_FULL, message: '房间已满' });
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

    // GM / 房主免各阵营密码，可任选阵营（满足「GM 的棋子可加入任意阵营」）
    const isPrivileged = isGmRole(req.auth!.role) || room.host_id === myUserId;
    let factionPw: any = {};
    try { factionPw = room.faction_passwords ? JSON.parse(room.faction_passwords) : {}; } catch { factionPw = {}; }
    if (!isPrivileged && !isVisitor && factionPw[joinRole]) {
      if (!password) {
        res.status(403).json({ error: 'FACTION_PASSWORD_REQUIRED', message: `「${ROLE_LABELS[joinRole]}」需要密码` });
        return;
      }
      if (password !== factionPw[joinRole]) {
        res.status(403).json({ error: 'WRONG_FACTION_PASSWORD', message: '阵营密码错误' });
        return;
      }
    }
    const efaction = isVisitor ? (faction || 'earth') : resolveRoleFaction(joinRole, JSON.parse(room.rules || '{}'));
    // 双轨制（2026-07-30）：由混合 role 推导 identity_role / tactical_slot（role 仍作兼容镜像保留）
    const joinIdentity: string = (joinRole === 'referee' || joinRole === 'visitor') ? joinRole : 'player';
    const joinSlot: string | null = (joinRole === 'attack' || joinRole === 'defense' || joinRole === 'ambush') ? joinRole : null;
    run('INSERT INTO room_players (room_id, user_id, username, faction, role, identity_role, tactical_slot, team, ready, is_spectator) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
      [room.id, req.auth!.userId, req.auth!.username, efaction, joinRole, joinIdentity, joinSlot, team, 0, isSpectator ? 1 : 0]);
    run('UPDATE users SET last_room_id = ? WHERE id = ?', [room.id, req.auth!.userId]);
    run('UPDATE rooms SET updated_at = datetime(\'now\') WHERE id = ?', [room.id]);
    persistChanges();
    pushRoomUpdate(room.id);

    res.json({ success: true, roomId: room.id, code: room.code, role: joinRole });
  } catch (err) {
    logger.error({ msg: `[Room] 加入房间错误: ${ err }` });
    res.status(500).json({ error: ErrorCode.INTERNAL_ERROR, message: '加入房间失败' });
  }
});

router.post('/api/rooms/:roomId/leave', (req, res) => {
  const room = get('SELECT * FROM rooms WHERE id = ?', [req.params.roomId]) as any;
  if (!room) {
    res.status(404).json({ error: ErrorCode.ROOM_NOT_FOUND, message: '房间不存在' });
    return;
  }
  // B-2.1 名册锁定：锁定后禁止退出
  if (room.roster_locked) {
    res.status(403).json({ error: 'ROSTER_LOCKED', message: '名册已锁定，无法退出' });
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
  pushRoomUpdate(room.id);

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
  pushRoomUpdate(req.params.roomId);

  res.json({ ready: !!newReady });
});

router.post('/api/rooms/:roomId/start', (req, res) => {
  const room = get('SELECT * FROM rooms WHERE id = ?', [req.params.roomId]) as any;
  if (!room) {
    res.status(404).json({ error: ErrorCode.ROOM_NOT_FOUND, message: '房间不存在' });
    return;
  }
  // 仅房主可开始战斗（GM 不再具备开战权限）
  if (room.host_id !== req.auth!.userId) {
    res.status(403).json({ error: ErrorCode.ROOM_NOT_OWNER, message: '只有房主可以开始战斗' });
    return;
  }

  const participants = all('SELECT user_id as "userId" FROM room_players WHERE room_id = ? AND is_spectator = 0', [room.id]) as any[];
  if (participants.length === 0) {
    res.status(400).json({ error: 'NO_PARTICIPANTS', message: '房间内没有可参战玩家' });
    return;
  }
  // 非 GM 维持“全员准备”约束；GM 可强制开战（便于单人/测试）
  if (!isGmRole(req.auth!.role)) {
    const notReady = get('SELECT COUNT(*) as c FROM room_players WHERE room_id = ? AND ready = 0 AND is_spectator = 0 AND role != ?', [room.id, 'referee']) as any;
    if (notReady.c > 0) {
      res.status(400).json({ error: 'NOT_ALL_READY', message: '还有玩家未准备' });
      return;
    }
  }

  // 读取整备室房主配置的“棋子→轮转角色”映射（roleUnits：role->[unitId]），作为轮转权威源
  const roomRules = (() => { try { return JSON.parse(room.rules || '{}'); } catch { return {}; } })();
  const roleUnitsMap: Record<string, string> = {};
  const ru = (roomRules.roleUnits && typeof roomRules.roleUnits === 'object') ? roomRules.roleUnits : {};
  for (const [role, ids] of Object.entries(ru)) {
    if (!COMBAT_ROLES.includes(role as any)) continue;
    for (const id of (Array.isArray(ids) ? ids : [])) roleUnitsMap[String(id)] = role;
  }

  // 聚合整备室选中的出战棋子：读取每个参赛玩家的 selected_units，拼成部署池 pendingUnits
  // 裁判(referee)是代理者不下场，已从聚合中排除
  const playerRows = all('SELECT user_id as "userId", faction, role, identity_role as "identityRole", tactical_slot as "tacticalSlot", selected_units as "selectedUnits" FROM room_players WHERE room_id = ? AND is_spectator = 0 AND role != ?', [room.id, 'referee']) as any[];
  const pendingUnits: any[] = [];
  const factionRolesAcc: Record<string, string[]> = { attack: [], defense: [], ambush: [] };
  for (const pr of playerRows) {
    let ids: string[] = [];
    if (pr.selectedUnits) {
      try { const arr = JSON.parse(pr.selectedUnits); if (Array.isArray(arr)) ids = arr.filter((x: any) => typeof x === 'string'); } catch { /* ignore */ }
    }
    if (ids.length === 0) continue;
    for (const uid of ids) {
      const u = get('SELECT * FROM units WHERE id = ?', [uid]) as any;
      if (!u) continue; // 单位已删除则跳过
      // 轮转角色来源优先级：①房主③面板指定的 roleUnits（权威）②玩家战术席位 tacticalSlot ③兼容 role ④缺省 attack
      const assignedRole = roleUnitsMap[String(uid)]
        || (pr.tacticalSlot && COMBAT_ROLES.includes(pr.tacticalSlot as any) ? pr.tacticalSlot
          : (COMBAT_ROLES.includes(pr.role as any) ? pr.role : 'attack'));
      // 19.7.4 暗雷修复：阵营推导统一读取权威源 room.rules.factionRoles，绝不混用 DEFAULT_ROLE_FACTIONS
      const slotFR = (roomRules.factionRoles && roomRules.factionRoles[assignedRole]) || null;
      const assignedFaction = (Array.isArray(slotFR) && slotFR[0]) || DEFAULT_ROLE_FACTIONS[assignedRole] || 'earth';
      if (factionRolesAcc[assignedRole]) factionRolesAcc[assignedRole].push(assignedFaction);
      let stats: any = {};
      let skills: any[] = [];
      let equipment: any = {};
      let attributes: any = {};
      try { stats = JSON.parse(u.stats || '{}'); } catch { stats = {}; }
      try { skills = JSON.parse(u.skills || '[]'); } catch { skills = []; }
      try { equipment = JSON.parse(u.equipment || '{}'); } catch { equipment = {}; }
      try { attributes = JSON.parse(u.attributes || '{}'); } catch { attributes = {}; }
      // HP 真相源：优先取单位录入 stats.hp，缺省 100；再经体型系数修正（s -10%/m 0/l +5%/xl +10%）
      const baseHp = (stats && typeof stats.hp === 'number' && stats.hp > 0) ? stats.hp : 100;
      const sizedHp = applySizeHp(baseHp, u.size || 'm');
      pendingUnits.push({
        id: u.id,
        unitId: u.id,
        ownerId: pr.userId,
        owner_id: pr.userId,
        name: u.name,
        codename: u.codename || '',
        type: u.type || null,
        // 顶层 hp/maxHp 与 currentStats 同源（applySizeHp 修正），供前端直接读取。
        // 否则前端 dead 判定 (unit.hp ?? 0) <= 0 会把所有部署池单位误判为阵亡（标灰划掉无法部署）。
        hp: sizedHp,
        maxHp: sizedHp,
        // 轮转角色权威映射：房主③面板指定 > 玩家①角色；阵营随角色推导，保证战斗内 faction->role 一致
        faction: assignedFaction,
        role: assignedRole,
        category: u.category || 'melee',
        tier: u.tier || 1,
        size: u.size || 'm',
        sprite_key: u.sprite_key || null,
        // Phase 30-Cover + 机动拆解：补全七视图与部件(parts)权威源，确保战场渲染用上传图、移动力由真实 parts 计算
        view_urls: u.view_urls || null,
        attributes,
        main_image_url: u.sprite_key || null,
        stats,
        skills,
        equipment,
        matrixId: u.id,
      });
    }
  }

  // 19.7.4 暗雷修复：轮转权威源统一为 room.rules.factionRoles（GM 配置），缺失时退回实际部署推导
  const authoritativeFR = (roomRules.factionRoles && typeof roomRules.factionRoles === 'object' && Object.keys(roomRules.factionRoles).length)
    ? roomRules.factionRoles
    : null;
  const factionRolesConfig: Record<string, string[]> = {};
  for (const role of COMBAT_ROLES) {
    const fs = (authoritativeFR && Array.isArray(authoritativeFR[role]))
      ? Array.from(new Set(authoritativeFR[role]))
      : Array.from(new Set(factionRolesAcc[role]));
    if (fs.length) factionRolesConfig[role] = fs;
  }

  const battleId = uuidv4();
  // B-2.1 开战即锁定名册，禁止中途加入/退出
  run(`UPDATE rooms SET status = '${RoomStatus.IN_BATTLE}', battle_id = ?, roster_locked = 1, updated_at = datetime('now') WHERE id = ?`, [battleId, room.id]);
  run('INSERT INTO battles (id, room_id, map_id, status, started_at) VALUES (?, ?, ?, ?, datetime(\'now\'))', [battleId, room.id, room.map_id, 'in_progress']);
  persistChanges();
  // 预置部署池：确保进入战斗时 getBattleState 命中已有战局，pendingUnits 不被兜底 createBattle 清空
  // factionRolesConfig 已在上方依据房主 roleUnits 实际部署推导，作为战斗内轮转权威源透传
  seedRoomBattle(battleId, room.map_id, pendingUnits, factionRolesConfig, room.host_id);
  pushRoomUpdate(room.id);

  res.json({ success: true, battleId, pendingUnitCount: pendingUnits.length });
});

// B-2.1 名册锁定/解锁（仅房主）
router.post('/api/rooms/:roomId/lock-roster', (req, res) => {
  const room = get('SELECT * FROM rooms WHERE id = ?', [req.params.roomId]) as any;
  if (!room) {
    res.status(404).json({ error: ErrorCode.ROOM_NOT_FOUND, message: '房间不存在' });
    return;
  }
  if (room.host_id !== req.auth!.userId) {
    res.status(403).json({ error: ErrorCode.ROOM_NOT_OWNER, message: '只有房主可以锁定/解锁名册' });
    return;
  }
  const { locked } = req.body as { locked?: boolean };
  const target = locked === undefined ? (room.roster_locked ? 0 : 1) : (locked ? 1 : 0);
  run('UPDATE rooms SET roster_locked = ?, updated_at = datetime(\'now\') WHERE id = ?', [target, room.id]);
  persistChanges();
  pushRoomUpdate(room.id);
  res.json({ success: true, rosterLocked: !!target });
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

  // ★ C5 防投毒：Schema 白名单 + 类型/边界强校验 + 未知键拒绝 + 系统字段隔离
  let validated: { updates: string[]; values: any[] };
  try {
    validated = validateRoomSettings(req.body);
  } catch (e: any) {
    const status = e?.error === 'FORBIDDEN_FIELD' || e?.error === 'UNKNOWN_FIELD' ? 400 : 400;
    res.status(status).json({ error: e?.error || 'VALIDATION_ERROR', field: e?.field, message: e?.message || '参数校验失败' });
    return;
  }

  const { updates, values } = validated;

  // factionPasswords：子键白名单 + 4 位数字规则由 normalizeFactionPasswords 落地
  // （结构防御已由 validateRoomSettings 完成）
  if ('factionPasswords' in (req.body || {})) {
    let pwJson = '{}';
    try { pwJson = JSON.stringify(normalizeFactionPasswords((req.body as any).factionPasswords)); }
    catch (e: any) { res.status(400).json({ error: ErrorCode.VALIDATION_ERROR, message: e.message || '阵营密码格式错误' }); return; }
    updates.push('faction_passwords = ?'); values.push(pwJson);
  }

  if (updates.length > 0) {
    updates.push('updated_at = datetime(\'now\')');
    values.push(room.id);
    run(`UPDATE rooms SET ${updates.join(', ')} WHERE id = ?`, values);
    persistChanges();
    pushRoomUpdate(room.id);
  }

  res.json({ success: true });
});

// 整备室：玩家保存自己在房间内选中的出战棋子（unitId 数组）。本人或房主/GM 可写。
router.put('/api/rooms/:roomId/players/:userId/units', (req, res) => {
  const room = get('SELECT * FROM rooms WHERE id = ?', [req.params.roomId]) as any;
  if (!room) {
    res.status(404).json({ error: ErrorCode.ROOM_NOT_FOUND, message: '房间不存在' });
    return;
  }
  const { userId } = req.params;
  // 仅本人，或房主/GM 可设置
  if (userId !== req.auth!.userId && room.host_id !== req.auth!.userId && !isGmRole(req.auth!.role)) {
    res.status(403).json({ error: ErrorCode.ROOM_NOT_OWNER, message: '只能设置自己或本房间玩家的出战棋子' });
    return;
  }
  const target = get('SELECT 1 FROM room_players WHERE room_id = ? AND user_id = ?', [room.id, userId]);
  if (!target) {
    res.status(404).json({ error: ErrorCode.ROOM_NOT_FOUND, message: '目标玩家不在房间中' });
    return;
  }
  const { unitIds } = req.body as { unitIds?: any };
  let ids: string[] = [];
  if (Array.isArray(unitIds)) {
    ids = unitIds.filter((x: any) => typeof x === 'string');
  }
  run('UPDATE room_players SET selected_units = ? WHERE room_id = ? AND user_id = ?', [JSON.stringify(ids), room.id, userId]);
  persistChanges();
  pushRoomUpdate(room.id);
  res.json({ success: true, selectedUnitIds: ids });
});

// Phase: 房主/GM 调整某玩家的阵营或观战状态
router.put('/api/rooms/:roomId/players/:userId', (req, res) => {
  const room = get('SELECT * FROM rooms WHERE id = ?', [req.params.roomId]) as any;
  if (!room) {
    res.status(404).json({ error: ErrorCode.ROOM_NOT_FOUND, message: '房间不存在' });
    return;
  }
  if (room.host_id !== req.auth!.userId && !isGmRole(req.auth!.role)) {
    res.status(403).json({ error: ErrorCode.ROOM_NOT_OWNER, message: '只有房主或 GM 可以调整玩家阵营' });
    return;
  }
  const target = get('SELECT 1 FROM room_players WHERE room_id = ? AND user_id = ?', [room.id, req.params.userId]);
  if (!target) {
    res.status(404).json({ error: ErrorCode.ROOM_NOT_FOUND, message: '目标玩家不在房间中' });
    return;
  }
  const { role, faction, spectator, identityRole: reqIdentity, tacticalSlot: reqSlot } = req.body as { role?: string; faction?: string; spectator?: boolean; identityRole?: string; tacticalSlot?: string | null };
  // 双轨制（2026-07-30）：优先用 identityRole/tacticalSlot，缺失时由兼容 role 推导
  const IDENTITIES = ['player', 'referee', 'visitor'];
  const SLOTS = ['attack', 'defense', 'ambush'];
  let identityRole = (reqIdentity && IDENTITIES.includes(reqIdentity)) ? reqIdentity
    : (role && IDENTITIES.includes(role)) ? role
    : (spectator ? 'visitor' : 'player');
  let tacticalSlot: string | null = (reqSlot && SLOTS.includes(reqSlot)) ? reqSlot
    : (role && SLOTS.includes(role)) ? role
    : null;
  // 裁判/观战不下场：席位强制清空
  if (identityRole === 'referee' || identityRole === 'visitor') tacticalSlot = null;
  // 兼容旧参数：spectator=true 视为观战
  if (spectator) identityRole = 'visitor';
  // 房主恒为裁判（代打）：强制 identity=referee、slot=null（代打权仅绑定 isHost，见 combat.ts canIssueCommand）
  if (req.params.userId === room.host_id) {
    identityRole = 'referee';
    tacticalSlot = null;
  }
  const roleMirror = identityRole === 'player' ? (tacticalSlot || 'attack') : identityRole;
  const isSpec = identityRole === 'visitor';
  const resolvedFaction = (identityRole === 'player' && tacticalSlot)
    ? (resolveRoleFaction(tacticalSlot, JSON.parse(room.rules || '{}')) || DEFAULT_ROLE_FACTIONS[tacticalSlot] || 'earth')
    : 'earth';
  run('UPDATE room_players SET faction = ?, role = ?, identity_role = ?, tactical_slot = ?, is_spectator = ? WHERE room_id = ? AND user_id = ?',
    [resolvedFaction, roleMirror, identityRole, tacticalSlot, isSpec ? 1 : 0, room.id, req.params.userId]);
  persistChanges();
  pushRoomUpdate(room.id);
  res.json({ success: true });
});

router.delete('/api/rooms/:roomId', (req, res) => {
  const room = get('SELECT * FROM rooms WHERE id = ?', [req.params.roomId]) as any;
  if (!room) {
    res.status(404).json({ error: ErrorCode.ROOM_NOT_FOUND, message: '房间不存在' });
    return;
  }
  // 仅房主或主宰(dominator)可删除；dominator 可清理任意房间（含进行中的对局）
  if (room.host_id !== req.auth!.userId && req.auth!.role !== UserRole.DOMINATOR) {
    res.status(403).json({ error: ErrorCode.ROOM_NOT_OWNER, message: '只有房主或主宰(dominator)可以删除房间' });
    return;
  }

  // 若房间关联了进行中的对局，先清除内存中的战局
  if (room.battle_id) {
    try { clearBattle(room.battle_id); } catch (e) { logger.error({ msg: `[rooms] clearBattle 失败: ${ e }` }); }
  }

  run(`UPDATE rooms SET status = '${RoomStatus.CANCELLED}', updated_at = datetime('now') WHERE id = ?`, [room.id]);
  persistChanges();
  pushRoomUpdate(room.id);
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
