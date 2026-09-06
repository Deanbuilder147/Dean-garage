/**
 * Phase 29-P1 — 管理员路由 (sql.js)
 *
 * 积分赠送、角色提升等超管操作。
 * 所有端点需 admin/dominator 权限。
 */

import { Router } from 'express';
import { authenticate, requireAuth, requireRole } from '../middleware/auth.js';
import { run, get, persistChanges } from '../db/sqlite.js';
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

    console.log(`[Admin] ${req.auth!.username} 赠送给 ${target.username} ${amount} 积分，当前积分 ${newCredits}`);

    res.json({
      success: true,
      error: ErrorCode.CREDITS_GIFT_SUCCESS,
      message: `成功赠送给 ${target.username} ${amount} 积分`,
      targetUsername: target.username,
      previousCredits: currentCredits,
      newCredits,
    });
  } catch (err) {
    console.error('[Admin] 积分赠送错误:', err);
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

    console.log(`[Admin] ${req.auth!.username} 将 ${target.username} 角色从 ${target.role} 提升为 ${role}`);

    res.json({
      success: true,
      message: `成功将 ${target.username} 角色设置为 ${role}`,
      previousRole: target.role,
      newRole: role,
    });
  } catch (err) {
    console.error('[Admin] 角色设置错误:', err);
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

export default router;
