import express from 'express';
import jwt from 'jsonwebtoken';
import { z } from 'zod';
import db from '../database/db.js';
import HexUtils from '../utils/hexUtils.js';
import config from '../config/index.js';

const router = express.Router();

// Zod validation schemas
const createBattlefieldSchema = z.object({
  name: z.string().min(1, "战场名称必填").max(50, "战场名称不能超过 50 个字符"),
  width: z.number().int().positive().max(100, "宽度不能超过 100").default(20),
  height: z.number().int().positive().max(100, "高度不能超过 100").default(30),
  terrain: z.any().optional(),
  type: z.string().max(20).default('standard'),
  is_public: z.boolean().default(true)
});

const updateBattlefieldSchema = z.object({
  terrain_defs: z.any().optional(),
  name: z.string().min(1).max(50).optional(),
  terrain: z.any().optional(),
  type: z.string().max(20).optional(),
  is_public: z.boolean().optional()
});

const terrainSchema = z.object({
  q: z.number().int(),
  r: z.number().int(),
  terrain: z.string()
});

// 认证中间件
const authenticate = (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;
    
    // 生产环境：必须提供 token
    // 开发环境：允许无 token 访问测试用户（向后兼容）
    if (!authHeader) {
      if (process.env.NODE_ENV === 'production') {
        return res.status(401).json({ error: '未授权访问' });
      }
      // 开发环境保持 test 用户兼容
      req.user = { id: 1, username: 'test' };
      return next();
    }
    
    if (!authHeader.startsWith('Bearer ')) {
      return res.status(401).json({ error: '未授权' });
    }
    const token = authHeader.split(' ')[1];
    const decoded = jwt.verify(token, config.jwtSecret);
    req.user = decoded;
    // 统一处理 userId/id 字段名
    req.user.id = decoded.userId || decoded.id;
    next();
  } catch (error) {
    return res.status(401).json({ error: 'Token 无效' });
  }
};

// ========== 战场 CRUD ==========

// 获取战场列表
router.get('/', authenticate, (req, res) => {
  try {
    const userId = req.user?.id || 1;
    const battlefields = db.prepare(
      'SELECT * FROM battlefields WHERE user_id = ? ORDER BY created_at DESC'
    ).all([userId]);
    res.json({ battlefields });
  } catch (error) {
    console.error('[Battlefields] Get list error:', error);
    res.status(500).json({ error: '获取战场列表失败' });
  }
});

// 获取所有公共战场
router.get('/all', authenticate, (req, res) => {
  try {
    const battlefields = db.prepare(
      'SELECT * FROM battlefields WHERE is_public = 1 ORDER BY created_at DESC'
    ).all();
    res.json({ battlefields });
  } catch (error) {
    console.error('[Battlefields] Get all error:', error);
    res.status(500).json({ error: '获取战场列表失败' });
  }
});

// 获取战场详情
router.get('/:id', authenticate, (req, res) => {
  try {
    const battlefield = db.prepare(
      'SELECT * FROM battlefields WHERE id = ?'
    ).get(req.params.id);
    
    if (!battlefield) {
      return res.status(404).json({ error: '战场不存在' });
    }
    
    // 解析terrain JSON
    if (battlefield.terrain && typeof battlefield.terrain === 'string') {
      try {
        battlefield.terrain = JSON.parse(battlefield.terrain);
      } catch (e) {
        battlefield.terrain = {};
      }
    }
    
    // 解析出生点（从terrain中提取mothership和base地形）
    const spawn_points = [];
    if (battlefield.terrain) {
      for (const [key, terrainId] of Object.entries(battlefield.terrain)) {
        if (terrainId === 'mothership' || terrainId === 'base') {
          const [q, r] = key.split(',').map(Number);
          spawn_points.push({
            q, r,
            type: terrainId,
            faction: null  // 出生时未分配阵营
          });
        }
      }
    }
    
    res.json({ 
      id: battlefield.id,
      name: battlefield.name,
      width: battlefield.width,
      height: battlefield.height,
      type: battlefield.type,
      terrain: battlefield.terrain,
      is_public: battlefield.is_public,
      spawn_points
    });
  } catch (error) {
    console.error('[Battlefields] Get detail error:', error);
    res.status(500).json({ error: '获取战场详情失败' });
  }
});

// 获取战场出生点
router.get('/:id/spawn-points', authenticate, (req, res) => {
  try {
    const battlefield = db.prepare(
      'SELECT * FROM battlefields WHERE id = ?'
    ).get(req.params.id);
    
    if (!battlefield) {
      return res.status(404).json({ error: '战场不存在' });
    }
    
    // 解析地形数据
    let terrainMap = {};
    try {
      terrainMap = typeof battlefield.terrain === 'string' 
        ? JSON.parse(battlefield.terrain) 
        : battlefield.terrain;
    } catch (e) {}
    
    // 生成出生点
    const spawnPoints = [];
    for (const [key, terrainId] of Object.entries(terrainMap)) {
      if (terrainId === 'mothership' || terrainId === 'base') {
        const [q, r] = key.split(',').map(Number);
        spawnPoints.push({
          q, r,
          type: terrainId,
          faction: terrainId === 'mothership' ? 'earth' : 'bylon'
        });
      }
    }
    
    res.json({ spawnPoints });
  } catch (error) {
    console.error('[Battlefields] Get spawn points error:', error);
    res.status(500).json({ error: '获取出生点失败' });
  }
});

// 创建战场
router.post('/', authenticate, (req, res) => {
  try {
    // Validate input with Zod
    const validated = createBattlefieldSchema.parse(req.body);
    const { name, width, height, terrain, type, is_public } = validated;
    
    // 解析地形数据
    let terrainData = '{}';
    if (terrain) {
      if (typeof terrain === 'object') {
        terrainData = JSON.stringify(terrain);
      } else if (typeof terrain === 'string') {
        terrainData = terrain;
      }
    }
    
    const result = db.run(
      'INSERT INTO battlefields (name, width, height, terrain, type, is_public, user_id) VALUES (?, ?, ?, ?, ?, ?, ?)',
      [name, width, height, terrainData, type, is_public ? 1 : 0, req.user?.id || 1]
    );
    
    const battlefield = db.prepare('SELECT * FROM battlefields WHERE id = ?').get(result.lastInsertRowid);
    
    res.status(201).json({ 
      message: '战场创建成功',
      battlefield
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ 
        error: '验证失败',
        details: error.errors.map(e => ({ field: e.path[0], message: e.message }))
      });
    }
    console.error('[Battlefields] Create error:', error);
    res.status(500).json({ error: '创建战场失败：' + error.message });
  }
});

// 更新战场
router.put('/:id', authenticate, (req, res) => {
  try {
    const { id } = req.params;
    
    const battlefield = db.prepare(
      'SELECT * FROM battlefields WHERE id = ?'
    ).get(id);
    
    if (!battlefield) {
      return res.status(404).json({ error: '战场不存在' });
    }
    
    // Validate input with Zod
    const validated = updateBattlefieldSchema.parse(req.body);
    const { terrain, terrain_defs, name, type, is_public } = validated;
    
    if (terrain !== undefined) {
      const terrainStr = typeof terrain === 'object' ? JSON.stringify(terrain) : terrain;
      db.prepare('UPDATE battlefields SET terrain = ? WHERE id = ?').run(terrainStr, id);
    }

    if (terrain_defs !== undefined) {
      const defsStr = typeof terrain_defs === 'object' ? JSON.stringify(terrain_defs) : terrain_defs;
      db.prepare('UPDATE battlefields SET terrain_defs = ? WHERE id = ?').run(defsStr, id);
    }
    
    if (name !== undefined) {
      db.prepare('UPDATE battlefields SET name = ? WHERE id = ?').run(name, id);
    }
    
    if (type !== undefined) {
      db.prepare('UPDATE battlefields SET type = ? WHERE id = ?').run(type, id);
    }
    
    if (is_public !== undefined) {
      db.prepare('UPDATE battlefields SET is_public = ? WHERE id = ?').run(is_public ? 1 : 0, id);
    }
    
    const updated = db.prepare('SELECT * FROM battlefields WHERE id = ?').get(id);
    
    res.json({ 
      message: '战场更新成功',
      battlefield: updated
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ 
        error: '验证失败',
        details: error.errors.map(e => ({ field: e.path[0], message: e.message }))
      });
    }
    console.error('[Battlefields] Update error:', error);
    res.status(500).json({ error: '更新战场失败' });
  }
});

// 删除战场
router.delete('/:id', authenticate, (req, res) => {
  try {
    const result = db.prepare(
      'DELETE FROM battlefields WHERE id = ?'
    ).run(req.params.id);
    
    if (result.changes === 0) {
      return res.status(404).json({ error: '战场不存在' });
    }
    
    res.json({ message: '战场删除成功' });
  } catch (error) {
    console.error('[Battlefields] Delete error:', error);
    res.status(500).json({ error: '删除战场失败' });
  }
});

// ========== 地形编辑器接口 ==========

// 获取所有地形类型
router.get('/terrain/types', authenticate, (req, res) => {
  try {
    const types = db.prepare('SELECT * FROM terrain_types ORDER BY id').all();
    res.json({ terrainTypes: types });
  } catch (error) {
    console.error('[Terrain] Get types error:', error);
    res.status(500).json({ error: '获取地形类型失败' });
  }
});

// 创建自定义地形类型
router.post('/terrain/types', authenticate, (req, res) => {
  try {
    const { terrain_id, name, movement_cost, defense_bonus, can_spawn, color, description } = req.body;

    if (!terrain_id || !name) {
      return res.status(400).json({ error: 'terrain_id 和 name 是必填字段' });
    }
    if (!/^[a-z_]+$/.test(terrain_id)) {
      return res.status(400).json({ error: 'terrain_id 只能包含小写字母和下划线' });
    }

    const existing = db.prepare('SELECT terrain_id FROM terrain_types WHERE terrain_id = ?').get(terrain_id);
    if (existing) {
      return res.status(409).json({ error: '地形类型已存在' });
    }

    db.prepare(
      'INSERT INTO terrain_types (terrain_id, name, movement_cost, defense_bonus, can_spawn, color, description) VALUES (?, ?, ?, ?, ?, ?, ?)'
    ).run([
      terrain_id,
      name,
      movement_cost ?? 1,
      defense_bonus ?? 0,
      can_spawn !== false ? 1 : 0,
      color || '#888888',
      description || null
    ]);

    const created = db.prepare('SELECT * FROM terrain_types WHERE terrain_id = ?').get(terrain_id);
    res.status(201).json({ message: '地形类型创建成功', terrainType: created });
  } catch (error) {
    console.error('[Terrain] Create type error:', error);
    res.status(500).json({ error: '创建地形类型失败' });
  }
});

// 更新地形类型
router.put('/terrain/types/:terrainId', authenticate, (req, res) => {
  try {
    const { terrainId } = req.params;
    const existing = db.prepare('SELECT * FROM terrain_types WHERE terrain_id = ?').get(terrainId);
    if (!existing) {
      return res.status(404).json({ error: '地形类型不存在' });
    }

    const { name, movement_cost, defense_bonus, can_spawn, color, description } = req.body;
    const fields = [];
    const values = [];

    if (name !== undefined) { fields.push('name = ?'); values.push(name); }
    if (movement_cost !== undefined) { fields.push('movement_cost = ?'); values.push(movement_cost); }
    if (defense_bonus !== undefined) { fields.push('defense_bonus = ?'); values.push(defense_bonus); }
    if (can_spawn !== undefined) { fields.push('can_spawn = ?'); values.push(can_spawn ? 1 : 0); }
    if (color !== undefined) { fields.push('color = ?'); values.push(color); }
    if (description !== undefined) { fields.push('description = ?'); values.push(description); }

    if (fields.length === 0) {
      return res.status(400).json({ error: '没有需要更新的字段' });
    }

    values.push(terrainId);
    db.prepare('UPDATE terrain_types SET ' + fields.join(', ') + ' WHERE terrain_id = ?').run(values);

    const updated = db.prepare('SELECT * FROM terrain_types WHERE terrain_id = ?').get(terrainId);
    res.json({ message: '地形类型更新成功', terrainType: updated });
  } catch (error) {
    console.error('[Terrain] Update type error:', error);
    res.status(500).json({ error: '更新地形类型失败' });
  }
});

// 删除自定义地形类型（不允许删除系统内置地形）
router.delete('/terrain/types/:terrainId', authenticate, (req, res) => {
  try {
    const { terrainId } = req.params;
    const BUILTIN = ['empty', 'forest', 'mountain', 'water', 'mothership', 'base', 'plain', 'ruin', 'lava', 'lunar', 'crater'];

    if (BUILTIN.includes(terrainId)) {
      return res.status(403).json({ error: '系统内置地形不可删除' });
    }

    const existing = db.prepare('SELECT * FROM terrain_types WHERE terrain_id = ?').get(terrainId);
    if (!existing) {
      return res.status(404).json({ error: '地形类型不存在' });
    }

    db.prepare('DELETE FROM terrain_types WHERE terrain_id = ?').run(terrainId);
    res.json({ message: '地形类型已删除' });
  } catch (error) {
    console.error('[Terrain] Delete type error:', error);
    res.status(500).json({ error: '删除地形类型失败' });
  }
});



// 批量更新地形 (地形编辑器核心接口)
router.post('/:id/terrain', authenticate, (req, res) => {
  try {
    const { id } = req.params;
    const { terrain } = req.body; // { "q,r": terrainId, ... }
    
    // Validate battlefield ID
    if (!id) {
      return res.status(400).json({ error: '战场 ID 必填' });
    }
    
    // Validate terrain data
    if (!terrain || typeof terrain !== 'object') {
      return res.status(400).json({ error: '地形数据必须是对象' });
    }
    
    const battlefield = db.prepare('SELECT * FROM battlefields WHERE id = ?').get(id);
    if (!battlefield) {
      return res.status(404).json({ error: '战场不存在' });
    }
    
    // 合并更新地形
    let currentTerrain = {};
    try {
      currentTerrain = typeof battlefield.terrain === 'string' 
        ? JSON.parse(battlefield.terrain) 
        : battlefield.terrain;
    } catch (e) {}
    
    // 合并新地形
    const mergedTerrain = { ...currentTerrain, ...terrain };
    
    db.prepare('UPDATE battlefields SET terrain = ? WHERE id = ?')
      .run(JSON.stringify(mergedTerrain), id);
    
    const updated = db.prepare('SELECT * FROM battlefields WHERE id = ?').get(id);
    
    res.json({ 
      message: '地形更新成功',
      battlefield: updated
    });
  } catch (error) {
    console.error('[Terrain] Update error:', error);
    res.status(500).json({ error: '更新地形失败' });
  }
});

// 清除指定地形
router.delete('/:id/terrain', authenticate, (req, res) => {
  try {
    const { id } = req.params;
    const { keys } = req.body; // ["q,r", "q,r", ...]
    
    if (!keys || !Array.isArray(keys)) {
      return res.status(400).json({ error: '需要提供要清除的地形坐标列表' });
    }
    
    const battlefield = db.prepare('SELECT * FROM battlefields WHERE id = ?').get(id);
    if (!battlefield) {
      return res.status(404).json({ error: '战场不存在' });
    }
    
    let currentTerrain = {};
    try {
      currentTerrain = typeof battlefield.terrain === 'string' 
        ? JSON.parse(battlefield.terrain) 
        : battlefield.terrain;
    } catch (e) {}
    
    // 删除指定键
    for (const key of keys) {
      delete currentTerrain[key];
    }
    
    db.prepare('UPDATE battlefields SET terrain = ? WHERE id = ?')
      .run(JSON.stringify(currentTerrain), id);
    
    res.json({ message: '地形清除成功' });
  } catch (error) {
    console.error('[Terrain] Clear error:', error);
    res.status(500).json({ error: '清除地形失败' });
  }
});

// ========== 六角格工具接口 ==========

// 计算路径
router.post('/utils/path', authenticate, (req, res) => {
  try {
    const { from, to, battlefieldId, terrain } = req.body;
    
    if (!from || !to) {
      return res.status(400).json({ error: '缺少起点或终点坐标' });
    }
    
    // A*寻路简化实现
    const path = HexUtils.findPath(
      { q: from.q, r: from.r },
      { q: to.q, r: to.r },
      terrain || {},
      100 // maxIterations
    );
    
    res.json({ path });
  } catch (error) {
    console.error('[HexUtils] Path error:', error);
    res.status(500).json({ error: '计算路径失败' });
  }
});

// 获取范围内格子
router.post('/utils/range', authenticate, (req, res) => {
  try {
    const { center, range, battlefieldId, terrain } = req.body;
    
    if (!center || range === undefined) {
      return res.status(400).json({ error: '缺少中心坐标或范围' });
    }
    
    const hexes = HexUtils.getHexesInRange(center.q, center.r, range);
    
    // 可选：过滤不可通行格子
    let filteredHexes = hexes;
    if (terrain) {
      filteredHexes = hexes.filter(h => {
        const key = HexUtils.hexKey(h.q, h.r);
        return terrain[key] !== 'water'; // 示例：过滤水域
      });
    }
    
    res.json({ hexes: filteredHexes });
  } catch (error) {
    console.error('[HexUtils] Range error:', error);
    res.status(500).json({ error: '计算范围失败' });
  }
});

export default router;
