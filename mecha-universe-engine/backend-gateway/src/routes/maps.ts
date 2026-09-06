/**
 * Phase 29-DataMigration — 地图管理路由 (sql.js)
 *
 * CRUD 执政 map.db 洗白资产，注入 3006 大一统库。
 * 承接旧 mecha-map:3003 微服务的 BattlefieldMap 查询职责。
 */

import { logger } from '../utils/logger.js';
import { Router } from 'express';
import { v4 as uuidv4 } from 'uuid';
import { authenticate, requireAuth, requireRole } from '../middleware/auth.js';
import { run, get, all, persistChanges } from '../db/sqlite.js';
import { resolveRoleFeatures } from '../services/featurePermissions.js';
import { ErrorCode, UserRole } from '@mecha/shared-kernel';

const router = Router();

// ========================================
// Phase 29-DataSecurity: 权限卡口 — 审核状态机
// ========================================
function computeMapVisibility(userRole: string, requestedPublic: boolean): { is_public: number; review_status: string } {
  // Phase 30-Perm：admin/dominator 可跳过审核直接 approved；勾选 maps.edit 的等级（如 referee，由 dominator 后台授权）亦可跳过
  const isAdminOrAbove = userRole === UserRole.ADMIN || userRole === UserRole.DOMINATOR || resolveRoleFeatures(userRole).includes('maps.edit');

  if (isAdminOrAbove) {
    return { is_public: requestedPublic ? 1 : 0, review_status: 'approved' };
  }

  // 普通用户/裁判：锁死 is_public=0，状态 pending
  return { is_public: 0, review_status: 'pending' };
}

// ============================================
// ★ 阶段 A·7：旧地图 cells 平滑迁移（固定画布 100×100）
// 旧地图可能 cells 为空数组但有 width/height，直接渲染会全空白。
// 这里按 100×100 自动补全 moon 地形 cells；所有地图 width/height 强制 100。
// 注意：cells 是 {q,r,terrain} 对象数组（combat.ts 用 `${c.q},${c.r}` 构建 cellSet），
//       严禁 dict / 下划线 key。
// ============================================
function migrateCells(cells: any, width = 100, height = 100): any[] {
  const arr = Array.isArray(cells) ? cells : [];
  if (arr.length === 0 && width && height) {
    const filled: any[] = [];
    for (let r = 0; r < height; r++) {
      for (let q = 0; q < width; q++) {
        filled.push({ q, r, terrain: 'void' });
      }
    }
    return filled;
  }
  return arr;
}

// ========================================
// 阶段 B·1：前端编辑器以 dict {"q,r": terrainId|object} 形式提交地形；
// 后端统一转换为 cells 数组 [{q,r,terrain}] 存储（combat.ts 按此结构消费）。
// 同时兼容直接提交 cells 数组的旧调用方。
// ========================================
function resolveTerrainId(val: any): string | null {
  if (!val) return null
  if (typeof val === 'string') return val
  if (val && typeof val === 'object') {
    if (val.terrain_id) return val.terrain_id
    if (val.terrain) return val.terrain
    if (val.id) return val.id
    if (val.type) return val.type
  }
  return null
}

function terrainDictToCells(dict: any): any[] {
  const cells: any[] = []
  if (!dict || typeof dict !== 'object') return cells
  for (const [key, val] of Object.entries(dict)) {
    const parts = String(key).split(',')
    const q = Number(parts[0])
    const r = Number(parts[1])
    if (Number.isNaN(q) || Number.isNaN(r)) continue
    const tid = resolveTerrainId(val)
    if (!tid) continue
    cells.push({ q, r, terrain: tid })
  }
  return cells
}

// 优先用 body.cells；否则用 body.terrain(dict) 转换；两者皆无则回退 fallback
function resolveCellsFromBody(body: any, fallback: any): any {
  if (body.cells !== undefined && body.cells !== null) return body.cells
  if (body.terrain !== undefined && body.terrain !== null) return terrainDictToCells(body.terrain)
  return fallback
}

// ========================================
// Phase 29-DataSecurity 纠偏: /api/map/list — 地图文件列表 (兼容旧前端调用)
// 与 /battlefields 共用同一流水线，支持 ?id=xxx 单文件查询
// ========================================
router.get('/api/map/list', authenticate, (req, res) => {
  try {
    const userId = req.auth?.userId;
    const { id } = req.query;

    // 单文件查询 (getMapById)
    if (id && typeof id === 'string') {
      const map = get('SELECT * FROM maps WHERE id = ?', [id]) as any;
      if (!map) {
        res.status(404).json({ error: 'MAP_NOT_FOUND', message: '地图不存在' });
        return;
      }
      res.json({
        id: map.id,
        name: map.name,
        filename: map.id,
        terrainCount: JSON.parse(map.cells || '[]').length,
        width: 50,
        height: 50,
        terrain: map.cells,
        cells: migrateCells(JSON.parse(map.cells || '[]')),
        spawn_points: JSON.parse(map.spawn_points || '[]'),
        attributes: JSON.parse(map.attributes || '{}'),
        is_public: map.is_public,
        review_status: map.review_status,
      });
      return;
    }

    // 列表查询 (getMapList)
    if (userId) {
      const maps = all('SELECT id, name, width, height, cells, is_public, review_status FROM maps ORDER BY updated_at DESC');
      const parsed = maps.map(m => ({
        id: m.id,
        name: m.name,
        filename: m.id,
        terrainCount: JSON.parse(m.cells || '[]').length,
      }));
      res.json({ maps: parsed });
    } else {
      const maps = all(
        "SELECT id, name, width, height, cells, is_public, review_status FROM maps WHERE (is_public_copy = 1 OR is_public = 1) AND review_status = 'approved' ORDER BY updated_at DESC"
      );
      const parsed = maps.map(m => ({
        id: m.id,
        name: m.name,
        filename: m.id,
        terrainCount: JSON.parse(m.cells || '[]').length,
      }));
      res.json({ maps: parsed });
    }
  } catch (err) {
    logger.error({ msg: `[Maps] 地图列表查询失败: ${ err }` });
    res.status(500).json({ error: ErrorCode.INTERNAL_ERROR, message: '地图列表查询失败' });
  }
});

// ========================================
// 获取战场列表（GET 允许游客浏览公开地图）
// ========================================
router.get('/api/map/battlefields', authenticate, (req, res) => {
  try {
    // 游客只看到 is_public_copy=1 的地图，登录用户看到全部
    const userId = req.auth?.userId;
    if (userId) {
      const maps = all('SELECT * FROM maps ORDER BY updated_at DESC');
      const parsed = maps.map(m => ({
        ...m,
        width: 50, height: 50, cells: migrateCells(JSON.parse(m.cells || '[]')),
        spawn_points: JSON.parse(m.spawn_points || '[]'),
        attributes: JSON.parse(m.attributes || '{}'),
      }));
      res.json({ battlefields: parsed });
    } else {
      // Phase 29-DataSecurity: 游客仅见 approved 公开地图
      const maps = all(
        "SELECT * FROM maps WHERE (is_public_copy = 1 OR is_public = 1) AND review_status = 'approved' ORDER BY updated_at DESC"
      );
      const parsed = maps.map(m => ({
        ...m,
        width: 50, height: 50, cells: migrateCells(JSON.parse(m.cells || '[]')),
        spawn_points: JSON.parse(m.spawn_points || '[]'),
        attributes: JSON.parse(m.attributes || '{}'),
      }));
      res.json({ battlefields: parsed });
    }
  } catch (err) {
    logger.error({ msg: `[Maps] 获取战场列表失败: ${ err }` });
    res.status(500).json({ error: ErrorCode.INTERNAL_ERROR, message: '获取战场列表失败' });
  }
});

// ========================================
// 获取单个战场详情
// ========================================
router.get('/api/map/battlefields/:id', authenticate, (req, res) => {
  try {
    const map = get('SELECT * FROM maps WHERE id = ?', [req.params.id]) as any;
    if (!map) {
      res.status(404).json({ error: 'MAP_NOT_FOUND', message: '战场不存在' });
      return;
    }
    const result = {
      ...map,
      width: 50, height: 50, cells: migrateCells(JSON.parse(map.cells || '[]')),
      spawn_points: JSON.parse(map.spawn_points || '[]'),
      attributes: JSON.parse(map.attributes || '{}'),
    };
    res.json(result);
  } catch (err) {
    logger.error({ msg: `[Maps] 获取战场详情失败: ${ err }` });
    res.status(500).json({ error: ErrorCode.INTERNAL_ERROR, message: '获取战场详情失败' });
  }
});

// ========================================
// 创建战场（需认证）
// ========================================
router.post('/api/map/battlefields', authenticate, requireAuth, (req, res) => {
  try {
    const {
      name,
      spawn_points = [], is_public_copy = false, is_public = false, attributes = {},
    } = req.body;
    // 兼容前端以 dict {"q,r": terrainId} 提交的地形；无 cells 时由 terrain 转换
    const cells = resolveCellsFromBody(req.body as any, []);
    // ★ 阶段 A·2：固定画布 100×100，忽略前端传入的 width/height
    const width = 100;
    const height = 100;

    if (!name) {
      res.status(400).json({ error: ErrorCode.VALIDATION_ERROR, message: '战场名称为必填项' });
      return;
    }

    // Phase 29-DataSecurity: 审核状态机卡口
    const userRole = req.auth!.role || 'user';
    const { is_public: finalIsPublic, review_status } = computeMapVisibility(userRole, is_public);

    const id = uuidv4();
    run(
      `INSERT INTO maps (id, name, width, height, cells, spawn_points, is_public_copy, is_public, review_status, original_author_id, generation_status, attributes)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'completed', ?)`,
      [id, name, width, height, JSON.stringify(cells), JSON.stringify(spawn_points),
       is_public_copy ? 1 : 0, finalIsPublic, review_status, req.auth!.userId, JSON.stringify(attributes)]
    );
    persistChanges();

    logger.info({ msg: `[Maps] 创建: ${name} (is_public=${finalIsPublic}, review=${review_status})` });

    res.status(201).json({ id, name, width, height, is_public: finalIsPublic, review_status });
  } catch (err) {
    logger.error({ msg: `[Maps] 创建战场失败: ${ err }` });
    res.status(500).json({ error: ErrorCode.INTERNAL_ERROR, message: '创建战场失败' });
  }
});

// ========================================
// 更新战场（需认证，仅创建者可修改）
// ========================================
router.put('/api/map/battlefields/:id', authenticate, requireAuth, (req, res) => {
  try {
    const map = get('SELECT * FROM maps WHERE id = ?', [req.params.id]) as any;
    if (!map) {
      res.status(404).json({ error: 'MAP_NOT_FOUND', message: '战场不存在' });
      return;
    }

    const { name, spawn_points, is_public_copy, is_public, attributes } = req.body;
    // 优先用前端提交的 cells；否则由 terrain(dict) 转换；再否则保留旧 cells
    const cells = resolveCellsFromBody(req.body as any, JSON.parse(map.cells));
    // ★ 阶段 A·2：固定画布 100×100，忽略前端传入的 width/height
    const width = 100;
    const height = 100;

    // Phase 29-DataSecurity: 审核状态机卡口
    const userRole = req.auth!.role || 'user';
    const requestedPublic = is_public !== undefined ? is_public : (map.is_public === 1);
    const { is_public: finalIsPublic, review_status } = computeMapVisibility(userRole, requestedPublic);

    run(
      `UPDATE maps SET name = ?, width = ?, height = ?, cells = ?, spawn_points = ?,
       is_public_copy = ?, is_public = ?, review_status = ?, attributes = ?, updated_at = datetime('now')
       WHERE id = ?`,
      [
        name ?? map.name,
        100,
        100,
        JSON.stringify(cells ?? JSON.parse(map.cells)),
        JSON.stringify(spawn_points ?? JSON.parse(map.spawn_points)),
        (is_public_copy ?? map.is_public_copy) ? 1 : 0,
        finalIsPublic,
        review_status,
        JSON.stringify(attributes ?? JSON.parse(map.attributes || '{}')),
        req.params.id,
      ]
    );
    persistChanges();

    logger.info({ msg: `[Maps] 更新: ${name || map.name} (is_public=${finalIsPublic}, review=${review_status})` });

    res.json({ success: true, is_public: finalIsPublic, review_status });
  } catch (err) {
    logger.error({ msg: `[Maps] 更新战场失败: ${ err }` });
    res.status(500).json({ error: ErrorCode.INTERNAL_ERROR, message: '更新战场失败' });
  }
});

// ========================================
// 我的投稿：当前用户全部地图（含审核状态回显），供「我的地图投稿」页面使用
// ========================================
router.get('/api/map/my-submissions', authenticate, requireAuth, (req, res) => {
  try {
    const rows = all(
      `SELECT id, name, is_public, review_status, updated_at
       FROM maps WHERE original_author_id = ?
       ORDER BY CASE review_status WHEN 'pending' THEN 0 WHEN 'rejected' THEN 1 ELSE 2 END, updated_at DESC`,
      [req.auth!.userId]
    ) as any[];
    res.json({ maps: rows });
  } catch (err) {
    logger.error({ msg: `[Maps] 我的投稿查询失败: ${err}` });
    res.status(500).json({ error: ErrorCode.INTERNAL_ERROR, message: '我的投稿查询失败' });
  }
});

// ========================================
// 审核队列：待审核(pending)地图，仅管理员(admin)/主宰(dominator)可见
// ========================================
router.get('/api/map/review-queue', authenticate, requireRole(UserRole.ADMIN, UserRole.DOMINATOR), (req, res) => {
  try {
    const rows = all(
      `SELECT id, original_author_id, name, spawn_points, cells, attributes, is_public, review_status, created_at, updated_at
       FROM maps WHERE review_status = 'pending' ORDER BY created_at ASC`
    ) as any[];
    const maps = rows.map((m) => ({
      ...m,
      width: 100,
      height: 100,
      cells: migrateCells(JSON.parse(m.cells || '[]')),
      spawn_points: JSON.parse(m.spawn_points || '[]'),
      attributes: JSON.parse(m.attributes || '{}'),
    }));
    res.json({ maps });
  } catch (err) {
    logger.error({ msg: `[Maps] 审核队列查询失败: ${err}` });
    res.status(500).json({ error: ErrorCode.INTERNAL_ERROR, message: '审核队列查询失败' });
  }
});

// ========================================
// 审核操作：管理员(admin/dominator)对 pending 地图通过/驳回
// approve 时 isPublic 默认 true（公开给全员使用）；reject 驳回
// ========================================
router.post('/api/map/:mapId/review', authenticate, requireRole(UserRole.ADMIN, UserRole.DOMINATOR), (req, res) => {
  const map = get('SELECT * FROM maps WHERE id = ?', [req.params.mapId]) as any;
  if (!map) {
    res.status(404).json({ error: 'MAP_NOT_FOUND', message: '地图不存在' });
    return;
  }
  const { action, isPublic } = req.body || {};
  if (action !== 'approve' && action !== 'reject') {
    res.status(400).json({ error: 'INVALID_ACTION', message: 'action 必须为 approve 或 reject' });
    return;
  }

  if (action === 'reject') {
    run(`UPDATE maps SET review_status = 'rejected', is_public = 0, is_public_copy = 0, updated_at = datetime('now') WHERE id = ?`, [req.params.mapId]);
    persistChanges();
    logger.info({ msg: `[Maps] 审核驳回: ${map.name}` });
    res.json({ success: true, review_status: 'rejected' });
    return;
  }

  // approve：默认公开（is_public=1），全员可用
  const finalIsPublic = isPublic === false ? 0 : 1;
  run(`UPDATE maps SET review_status = 'approved', is_public = ?, is_public_copy = ?, updated_at = datetime('now') WHERE id = ?`,
    [finalIsPublic, finalIsPublic, req.params.mapId]);
  persistChanges();
  logger.info({ msg: `[Maps] 审核通过: ${map.name} (is_public=${finalIsPublic})` });
  res.json({ success: true, is_public: finalIsPublic, review_status: 'approved' });
});

// ========================================
// 删除战场（需认证）
// ========================================
router.delete('/api/map/battlefields/:id', authenticate, requireAuth, (req, res) => {
  try {
    const map = get('SELECT * FROM maps WHERE id = ?', [req.params.id]) as any;
    if (!map) {
      res.status(404).json({ error: 'MAP_NOT_FOUND', message: '战场不存在' });
      return;
    }
    run('DELETE FROM maps WHERE id = ?', [req.params.id]);
    persistChanges();
    res.json({ success: true });
  } catch (err) {
    logger.error({ msg: `[Maps] 删除战场失败: ${ err }` });
    res.status(500).json({ error: ErrorCode.INTERNAL_ERROR, message: '删除战场失败' });
  }
});

export default router;
