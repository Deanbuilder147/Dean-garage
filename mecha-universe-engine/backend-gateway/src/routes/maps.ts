/**
 * Phase 29-DataMigration — 地图管理路由 (sql.js)
 *
 * CRUD 执政 map.db 洗白资产，注入 3006 大一统库。
 * 承接旧 mecha-map:3003 微服务的 BattlefieldMap 查询职责。
 */

import { Router } from 'express';
import { v4 as uuidv4 } from 'uuid';
import { authenticate, requireAuth } from '../middleware/auth.js';
import { run, get, all, persistChanges } from '../db/sqlite.js';
import { ErrorCode, UserRole } from '@mecha/shared-kernel';

const router = Router();

// ========================================
// Phase 29-DataSecurity: 权限卡口 — 审核状态机
// ========================================
function computeMapVisibility(userRole: string, requestedPublic: boolean): { is_public: number; review_status: string } {
  const isAdminOrAbove = userRole === UserRole.ADMIN || userRole === UserRole.DOMINATOR;

  if (isAdminOrAbove) {
    return { is_public: requestedPublic ? 1 : 0, review_status: 'approved' };
  }

  // 普通用户/裁判：锁死 is_public=0，状态 pending
  return { is_public: 0, review_status: 'pending' };
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
        width: map.width,
        height: map.height,
        terrain: map.cells,
        cells: JSON.parse(map.cells || '[]'),
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
    console.error('[Maps] 地图列表查询失败:', err);
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
        cells: JSON.parse(m.cells || '[]'),
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
        cells: JSON.parse(m.cells || '[]'),
        spawn_points: JSON.parse(m.spawn_points || '[]'),
        attributes: JSON.parse(m.attributes || '{}'),
      }));
      res.json({ battlefields: parsed });
    }
  } catch (err) {
    console.error('[Maps] 获取战场列表失败:', err);
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
      cells: JSON.parse(map.cells || '[]'),
      spawn_points: JSON.parse(map.spawn_points || '[]'),
      attributes: JSON.parse(map.attributes || '{}'),
    };
    res.json(result);
  } catch (err) {
    console.error('[Maps] 获取战场详情失败:', err);
    res.status(500).json({ error: ErrorCode.INTERNAL_ERROR, message: '获取战场详情失败' });
  }
});

// ========================================
// 创建战场（需认证）
// ========================================
router.post('/api/map/battlefields', authenticate, requireAuth, (req, res) => {
  try {
    const {
      name, width = 20, height = 30, cells = [],
      spawn_points = [], is_public_copy = false, is_public = false, attributes = {},
    } = req.body;

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

    console.log(`[Maps] 创建: ${name} (is_public=${finalIsPublic}, review=${review_status})`);

    res.status(201).json({ id, name, width, height, is_public: finalIsPublic, review_status });
  } catch (err) {
    console.error('[Maps] 创建战场失败:', err);
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

    const { name, width, height, cells, spawn_points, is_public_copy, is_public, attributes } = req.body;

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
        width ?? map.width,
        height ?? map.height,
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

    console.log(`[Maps] 更新: ${name || map.name} (is_public=${finalIsPublic}, review=${review_status})`);

    res.json({ success: true, is_public: finalIsPublic, review_status });
  } catch (err) {
    console.error('[Maps] 更新战场失败:', err);
    res.status(500).json({ error: ErrorCode.INTERNAL_ERROR, message: '更新战场失败' });
  }
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
    console.error('[Maps] 删除战场失败:', err);
    res.status(500).json({ error: ErrorCode.INTERNAL_ERROR, message: '删除战场失败' });
  }
});

export default router;
