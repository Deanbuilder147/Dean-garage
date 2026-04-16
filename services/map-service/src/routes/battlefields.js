import express from 'express';
import jwt from 'jsonwebtoken';
import db from '../database/db.js';
import HexUtils from '../utils/hexUtils.js';
import config from '../config/index.js';

const router = express.Router();

// 认证中间件
const authenticate = (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;
    
    // 开发环境：如果没有token，使用测试用户ID=1
    if (!authHeader) {
      req.user = { userId: 1, username: 'test' };
      return next();
    }
    
    if (!authHeader.startsWith('Bearer ')) {
      return res.status(401).json({ error: '未授权' });
    }
    const token = authHeader.split(' ')[1];
    const decoded = jwt.verify(token, config.jwtSecret);
    req.user = decoded;
    next();
  } catch (error) {
    if (process.env.NODE_ENV !== 'production') {
      req.user = { userId: 1, username: 'test' };
      return next();
    }
    return res.status(401).json({ error: 'Token无效' });
  }
};

// ========== 战场 CRUD ==========

// 获取战场列表
router.get('/', authenticate, (req, res) => {
  try {
    const battlefields = db.prepare(
      'SELECT * FROM battlefields ORDER BY created_at DESC'
    ).all();
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
    const { name, width = 20, height = 30, terrain, type = 'standard', is_public = 1 } = req.body;
    
    if (width > 100 || height > 100) {
      return res.status(400).json({ error: '地图尺寸不能超过100×100' });
    }
    
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
      'INSERT INTO battlefields (name, width, height, terrain, type, is_public) VALUES (?, ?, ?, ?, ?, ?)',
      [name, width, height, terrainData, type, is_public ? 1 : 0]
    );
    
    const battlefield = db.prepare('SELECT * FROM battlefields WHERE id = ?').get(result.lastInsertRowid);
    
    res.status(201).json({ 
      message: '战场创建成功',
      battlefield
    });
  } catch (error) {
    console.error('[Battlefields] Create error:', error);
    res.status(500).json({ error: '创建战场失败: ' + error.message });
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
    
    const { terrain, name, type, is_public } = req.body;
    
    if (terrain !== undefined) {
      const terrainStr = typeof terrain === 'object' ? JSON.stringify(terrain) : terrain;
      db.prepare('UPDATE battlefields SET terrain = ? WHERE id = ?').run(terrainStr, id);
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

// 批量更新地形 (地形编辑器核心接口)
router.post('/:id/terrain', authenticate, (req, res) => {
  try {
    const { id } = req.params;
    const { terrain } = req.body; // { "q,r": terrainId, ... }
    
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
