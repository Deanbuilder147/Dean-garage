/**
 * Phase 29-P1 — 管理员路由 (sql.js)
 *
 * 积分赠送、角色提升等超管操作。
 * 所有端点需 admin/dominator 权限。
 */

import { logger } from '../utils/logger.js';
import { Router } from 'express';
import { authenticate, requireAuth, requireRole } from '../middleware/auth.js';
import { run, get, all, persistChanges } from '../db/sqlite.js';
import { ErrorCode, UserRole } from '@mecha/shared-kernel';

const router = Router();

// 所有管理端点需认证
router.use('/api/admin', authenticate, requireAuth);

// ========================================
// Phase 29-P1: 积分赠送 — admin/dominator 为人肉赠送积分
// POST /api/admin/gift-credits
// Body: { targetUserId: string, amount: number }
// ========================================
router.post('/api/admin/gift-credits', requireRole(UserRole.ADMIN, UserRole.DOMINATOR), (req, res) => {
  try {
    const { targetUserId, amount } = req.body;

    if (!targetUserId || !amount || typeof amount !== 'number' || amount <= 0) {
      res.status(400).json({ error: ErrorCode.VALIDATION_ERROR, message: '请提供有效的 targetUserId 和正整数 amount' });
      return;
    }

    const target = get('SELECT id, username, credits FROM users WHERE id = ?', [targetUserId]) as any;
    if (!target) {
      res.status(404).json({ error: 'USER_NOT_FOUND', message: '目标用户不存在' });
      return;
    }

    const currentCredits = typeof target.credits === 'number' ? target.credits : 0;
    const newCredits = currentCredits + amount;

    run('UPDATE users SET credits = ?, updated_at = datetime(\'now\') WHERE id = ?', [newCredits, targetUserId]);
    persistChanges();

    logger.info({ msg: `[Admin] ${req.auth!.username} 赠送给 ${target.username} ${amount} 积分，当前积分 ${newCredits}` });

    res.json({
      success: true,
      error: ErrorCode.CREDITS_GIFT_SUCCESS,
      message: `成功赠送给 ${target.username} ${amount} 积分`,
      targetUsername: target.username,
      previousCredits: currentCredits,
      newCredits,
    });
  } catch (err) {
    logger.error({ msg: `[Admin] 积分赠送错误: ${ err }` });
    res.status(500).json({ error: ErrorCode.INTERNAL_ERROR, message: '积分赠送失败' });
  }
});

// ========================================
// Phase 29-P1: 角色提升 — dominator 独享
// PUT /api/admin/set-role
// Body: { targetUserId: string, role: UserRole }
// ========================================
router.put('/api/admin/set-role', requireRole(UserRole.DOMINATOR), (req, res) => {
  try {
    const { targetUserId, role } = req.body;

    if (!targetUserId || !role) {
      res.status(400).json({ error: ErrorCode.VALIDATION_ERROR, message: '请提供 targetUserId 和 role' });
      return;
    }

    const validRoles = Object.values(UserRole);
    if (!validRoles.includes(role as UserRole)) {
      res.status(400).json({ error: ErrorCode.VALIDATION_ERROR, message: `无效角色，有效值: ${validRoles.join(', ')}` });
      return;
    }

    const target = get('SELECT id, username, role FROM users WHERE id = ?', [targetUserId]) as any;
    if (!target) {
      res.status(404).json({ error: 'USER_NOT_FOUND', message: '目标用户不存在' });
      return;
    }

    run('UPDATE users SET role = ?, updated_at = datetime(\'now\') WHERE id = ?', [role, targetUserId]);
    persistChanges();

    logger.info({ msg: `[Admin] ${req.auth!.username} 将 ${target.username} 角色从 ${target.role} 提升为 ${role}` });

    res.json({
      success: true,
      message: `成功将 ${target.username} 角色设置为 ${role}`,
      previousRole: target.role,
      newRole: role,
    });
  } catch (err) {
    logger.error({ msg: `[Admin] 角色设置错误: ${ err }` });
    res.status(500).json({ error: ErrorCode.INTERNAL_ERROR, message: '角色设置失败' });
  }
});

// ========================================
// 查询用户积分
// GET /api/admin/user-credits/:userId
// ========================================
router.get('/api/admin/user-credits/:userId', requireRole(UserRole.ADMIN, UserRole.DOMINATOR), (req, res) => {
  const user = get('SELECT id, username, credits, role FROM users WHERE id = ?', [req.params.userId]) as any;
  if (!user) {
    res.status(404).json({ error: 'USER_NOT_FOUND', message: '用户不存在' });
    return;
  }

  res.json({
    userId: user.id,
    username: user.username,
    credits: user.credits || 0,
    role: user.role || 'user',
  });
});

// ========================================
// Phase: 清空所有对局（dominator 独享）— 用于清除测试房间
// POST /api/admin/reset-rooms
// ========================================
router.post('/api/admin/reset-rooms', requireRole(UserRole.DOMINATOR), (req, res) => {
  try {
    run('UPDATE rooms SET status = \'cancelled\', roster_locked = 0');
    run('DELETE FROM room_players');
    run('DELETE FROM room_chats');
    run('DELETE FROM battles');
    // 同时清空用户的续接房间指针
    run('UPDATE users SET last_room_id = NULL');
    persistChanges();
    res.json({ success: true, message: '所有对局已清空' });
  } catch (err) {
    logger.error({ msg: `[Admin] 清空对局错误: ${ err }` });
    res.status(500).json({ error: ErrorCode.INTERNAL_ERROR, message: '清空失败' });
  }
});

// ============================================================
// 等级-功能权限矩阵后台（仅 dominator 可见）
// 等级(levels) = 角色 user / referee / admin；功能(features) = 应用各能力模块
// ============================================================
interface FeatureDef { key: string; label: string; group: string }

const FEATURE_CATALOG: FeatureDef[] = [
  // 房间
  { key: 'room.create', label: '创建房间', group: '房间' },
  { key: 'room.private', label: '创建私人房间', group: '房间' },
  { key: 'room.host', label: '主持 / 裁判对战', group: '房间' },
  { key: 'room.spectate', label: '观战', group: '房间' },
  // 单位
  { key: 'unit.create', label: '创建单位', group: '单位' },
  { key: 'unit.review', label: '审核单位', group: '单位' },
  { key: 'unit.publish', label: '发布到公开库', group: '单位' },
  // 地图
  { key: 'map.create', label: '创建地图', group: '地图' },
  { key: 'map.review', label: '审核地图', group: '地图' },
  { key: 'map.publish', label: '发布到公开库', group: '地图' },
  // 词条库
  { key: 'glossary.edit', label: '编辑词条库', group: '词条库' },
  { key: 'glossary.excel', label: '上传 Excel 词库', group: '词条库' },
  { key: 'glossary.dice', label: '骰子工坊调参', group: '词条库' },
  // 积分 / 后台
  { key: 'credits.gift', label: '赠送积分', group: '积分/后台' },
  { key: 'admin.panel', label: '后台管理', group: '积分/后台' },
  // 其它
  { key: 'leaderboard.view', label: '查看天梯', group: '其它' },
  { key: 'campaign.create', label: '创建战役', group: '其它' },
];
const FEATURE_KEYS = FEATURE_CATALOG.map((f) => f.key);

const MANAGED_ROLES: UserRole[] = [UserRole.USER, UserRole.REFEREE, UserRole.ADMIN];
const ROLE_LABELS: Record<string, string> = {
  [UserRole.USER]: '普通用户',
  [UserRole.REFEREE]: '裁判',
  [UserRole.ADMIN]: '管理员',
  [UserRole.DOMINATOR]: '主宰',
};

const DEFAULT_FEATURE_PERMISSIONS: Record<string, string[]> = {
  [UserRole.USER]: ['room.create', 'room.spectate', 'unit.create', 'map.create', 'leaderboard.view'],
  [UserRole.REFEREE]: [
    'room.create', 'room.private', 'room.host', 'room.spectate',
    'unit.create', 'unit.review', 'unit.publish',
    'map.create', 'map.review', 'map.publish',
    'glossary.edit', 'glossary.excel', 'glossary.dice',
    'leaderboard.view', 'campaign.create',
  ],
  [UserRole.ADMIN]: [...FEATURE_KEYS],
};

// 解析某等级当前启用的功能（缺表行时回退默认并自动落库，幂等）
function resolveRoleFeatures(role: string): string[] {
  const row = get('SELECT enabled FROM feature_permissions WHERE role = ?', [role]) as any;
  if (row && row.enabled) {
    try {
      return JSON.parse(row.enabled);
    } catch {
      /* 落库脏数据 → 回退默认 */
    }
  }
  const def = DEFAULT_FEATURE_PERMISSIONS[role] || [];
  run('INSERT OR REPLACE INTO feature_permissions (role, enabled) VALUES (?, ?)', [role, JSON.stringify(def)]);
  return [...def];
}

// 功能目录 + 受管等级
router.get('/api/admin/features', requireRole(UserRole.DOMINATOR), (req, res) => {
  res.json({
    features: FEATURE_CATALOG,
    roles: MANAGED_ROLES.map((r) => ({ key: r, label: ROLE_LABELS[r] })),
  });
});

// 读取当前权限矩阵
router.get('/api/admin/permissions', requireRole(UserRole.DOMINATOR), (req, res) => {
  const matrix: Record<string, string[]> = {};
  for (const role of MANAGED_ROLES) matrix[role] = resolveRoleFeatures(role);
  res.json({
    matrix,
    roles: MANAGED_ROLES.map((r) => ({ key: r, label: ROLE_LABELS[r] })),
    features: FEATURE_CATALOG,
  });
});

// 更新某等级的功能权限
router.put('/api/admin/permissions', requireRole(UserRole.DOMINATOR), (req, res) => {
  try {
    const { role, features } = req.body as { role: string; features: string[] };

    if (!MANAGED_ROLES.includes(role as UserRole)) {
      res.status(400).json({ error: ErrorCode.VALIDATION_ERROR, message: `无效等级，可管理: ${MANAGED_ROLES.join(', ')}` });
      return;
    }
    if (!Array.isArray(features)) {
      res.status(400).json({ error: ErrorCode.VALIDATION_ERROR, message: 'features 必须是数组' });
      return;
    }
    const invalid = features.filter((f) => !FEATURE_KEYS.includes(f));
    if (invalid.length) {
      res.status(400).json({ error: ErrorCode.VALIDATION_ERROR, message: `未知功能: ${invalid.join(', ')}` });
      return;
    }
    const unique = Array.from(new Set(features));
    run('INSERT OR REPLACE INTO feature_permissions (role, enabled) VALUES (?, ?)', [role, JSON.stringify(unique)]);
    persistChanges();
    logger.info({ msg: `[Admin] ${req.auth!.username} 更新等级 ${role} 功能权限: ${unique.join(', ')}` });
    res.json({ success: true, role, features: unique });
  } catch (err) {
    logger.error({ msg: `[Admin] 更新权限矩阵错误: ${ err }` });
    res.status(500).json({ error: ErrorCode.INTERNAL_ERROR, message: '更新失败' });
  }
});

// 搜索账号（按用户名 / 邮箱）
router.get('/api/admin/search-users', requireRole(UserRole.DOMINATOR), (req, res) => {
  const q = ((req.query.q as string) || '').trim();
  if (!q) {
    res.json({ users: [] });
    return;
  }
  const like = `%${q}%`;
  const rows = all(
    'SELECT id, username, email, role, permission, credits FROM users WHERE username LIKE ? OR email LIKE ? ORDER BY username LIMIT 50',
    [like, like]
  ) as any[];
  res.json({
    users: rows.map((r: any) => ({
      id: r.id,
      username: r.username,
      email: r.email,
      role: r.role || 'user',
      permission: typeof r.permission === 'number' ? r.permission : 1,
      credits: typeof r.credits === 'number' ? r.credits : 10,
    })),
  });
});

// 修改账号权限：role / permission / credits
router.put('/api/admin/users/:userId', requireRole(UserRole.DOMINATOR), (req, res) => {
  try {
    const { role, permission, credits } = req.body as { role?: string; permission?: number; credits?: number };
    const target = get('SELECT id, username, role, permission, credits FROM users WHERE id = ?', [req.params.userId]) as any;
    if (!target) {
      res.status(404).json({ error: 'USER_NOT_FOUND', message: '账号不存在' });
      return;
    }

    const updates: string[] = [];
    const params: any[] = [];
    if (role !== undefined) {
      const validRoles = Object.values(UserRole);
      if (!validRoles.includes(role as UserRole)) {
        res.status(400).json({ error: ErrorCode.VALIDATION_ERROR, message: `无效角色: ${validRoles.join(', ')}` });
        return;
      }
      updates.push('role = ?');
      params.push(role);
    }
    if (permission !== undefined) {
      const p = Number(permission);
      if (!Number.isFinite(p) || p < 0) {
        res.status(400).json({ error: ErrorCode.VALIDATION_ERROR, message: 'permission 必须为非负整数' });
        return;
      }
      updates.push('permission = ?');
      params.push(Math.floor(p));
    }
    if (credits !== undefined) {
      const c = Number(credits);
      if (!Number.isFinite(c) || c < 0) {
        res.status(400).json({ error: ErrorCode.VALIDATION_ERROR, message: 'credits 必须为非负整数' });
        return;
      }
      updates.push('credits = ?');
      params.push(Math.floor(c));
    }
    if (updates.length === 0) {
      res.status(400).json({ error: ErrorCode.VALIDATION_ERROR, message: '未提供可修改的字段' });
      return;
    }
    updates.push("updated_at = datetime('now')");
    params.push(req.params.userId);
    run(`UPDATE users SET ${updates.join(', ')} WHERE id = ?`, params);
    persistChanges();

    const updated = get('SELECT id, username, role, permission, credits FROM users WHERE id = ?', [req.params.userId]) as any;
    logger.info({ msg: `[Admin] ${req.auth!.username} 修改账号 ${updated.username} 权限: role=${updated.role}, permission=${updated.permission}, credits=${updated.credits}` });
    res.json({
      success: true,
      user: {
        id: updated.id,
        username: updated.username,
        role: updated.role,
        permission: updated.permission,
        credits: updated.credits,
      },
    });
  } catch (err) {
    logger.error({ msg: `[Admin] 修改账号权限错误: ${ err }` });
    res.status(500).json({ error: ErrorCode.INTERNAL_ERROR, message: '修改失败' });
  }
});

export default router;
