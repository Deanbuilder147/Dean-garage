/**
 * TerrainMovement - 地形移动系统
 * 
 * 从 Map Service 动态加载地形类型和属性
 * 如果 Map Service 不可用，回退到内置默认值
 */

'use strict';

// ★ 阶段 B：Even-R offset 邻居方向表（与前端 hexUtils.getHexNeighbors 一致，含奇偶行分支）
function evenROffsetDirs(q, r) {
  if (r % 2 === 0) {
    return [{ q: 1, r: 0 }, { q: 1, r: -1 }, { q: 0, r: -1 }, { q: -1, r: 0 }, { q: 0, r: 1 }, { q: 1, r: 1 }];
  }
  return [{ q: 1, r: 0 }, { q: 0, r: -1 }, { q: -1, r: -1 }, { q: -1, r: 0 }, { q: -1, r: 1 }, { q: 0, r: 1 }];
}

class TerrainMovement {
  // 模块级缓存：从 Map Service 加载的地形数据
  static _terrainData = null;
  static _isLoaded = false;
  static MAP_SERVICE_URL = process.env.MAP_SERVICE_URL || 'http://map-service:3003';

  // 硬编码回退默认值（与 Map Service 数据库初始化一致）
  // Phase9.5: 回退地形表 — 新增 is_destructible / max_hp / destroyed_transform_to 字段
  static FALLBACK_TERRAINS = {
    empty:     { name: '空地',     cost: 1,  defense: 0,  can_spawn: true,  color: '#88CC88', is_destructible: false, max_hp: 0, destroyed_transform_to: 'empty' },
    plain:     { name: '平原',     cost: 1,  defense: 0,  can_spawn: true,  color: '#AAFFAA', is_destructible: false, max_hp: 0, destroyed_transform_to: 'plain' },
    forest:    { name: '森林',     cost: 2,  defense: 10, can_spawn: true,  color: '#228822', is_destructible: true,  max_hp: 3, destroyed_transform_to: 'plain' },
    mountain:  { name: '山地',     cost: 3,  defense: 20, can_spawn: false, color: '#886644', is_destructible: false, max_hp: 0, destroyed_transform_to: 'mountain' },
    water:     { name: '水域',     cost: 2.5, defense: 0,  can_spawn: false, color: '#4488FF', is_destructible: false, max_hp: 0, destroyed_transform_to: 'water' },
    base:      { name: '基地',     cost: 1,  defense: 0,  can_spawn: true,  color: '#FF4444', is_destructible: true,  max_hp: 5, destroyed_transform_to: 'ruin' },
    mothership:{ name: '母舰',     cost: 1,  defense: 0,  can_spawn: true,  color: '#FFD700', is_destructible: true,  max_hp: 8, destroyed_transform_to: 'ruin' },
    ruin:      { name: '废墟',     cost: 2,  defense: 15, can_spawn: true,  color: '#998866', is_destructible: false, max_hp: 0, destroyed_transform_to: 'ruin' },
    lava:      { name: '岩浆',     cost: 3,  defense: 0,  can_spawn: false, color: '#FF6600', is_destructible: false, max_hp: 0, destroyed_transform_to: 'lava' },
    lunar:     { name: '月面',     cost: 1,  defense: 0,  can_spawn: true,  color: '#CCCCCC', is_destructible: false, max_hp: 0, destroyed_transform_to: 'lunar' },
    crater:    { name: '陨石坑',   cost: 2,  defense: 5,  can_spawn: true,  color: '#777766', is_destructible: false, max_hp: 0, destroyed_transform_to: 'crater' },
    city_building: { name: '城市建筑', cost: 1, defense: 25, can_spawn: false, color: '#b8860b', is_destructible: true,  max_hp: 4, destroyed_transform_to: 'ruin' },
    rubble:    { name: '残骸',     cost: 2,  defense: 10, can_spawn: true,  color: '#8b7d6b', is_destructible: false, max_hp: 0, destroyed_transform_to: 'rubble' },

    // ===== 阶段 B·对齐补丁：补齐网关/前端地形表缺失项（与 terrainCosts.ts 对齐）=====
    // 原 FALLBACK 缺这些键，getMoveCost 会兜底成 1（void 可被穿越、ruins/crystal 代价偏低）。
    space:          { name: '太空',      cost: 1,   defense: 0,  can_spawn: false, color: '#0a0a1a', is_destructible: false, max_hp: 0, destroyed_transform_to: 'space' },
    moon:           { name: '月面',      cost: 1,   defense: 0,  can_spawn: true,  color: '#CCCCCC', is_destructible: false, max_hp: 0, destroyed_transform_to: 'moon' },
    void:           { name: '留白',      cost: 999, defense: 0,  can_spawn: false, color: '#000000', is_destructible: false, max_hp: 0, destroyed_transform_to: 'void' },
    desert:         { name: '沙漠',      cost: 1.5, defense: 0,  can_spawn: true,  color: '#EDC9AF', is_destructible: false, max_hp: 0, destroyed_transform_to: 'desert' },
    crystal:        { name: '晶体',      cost: 2,   defense: 10, can_spawn: true,  color: '#88CCFF', is_destructible: true,  max_hp: 3, destroyed_transform_to: 'plain' },
    fortress:       { name: '堡垒',      cost: 5,   defense: 30, can_spawn: false, color: '#666666', is_destructible: false, max_hp: 0, destroyed_transform_to: 'fortress' },
    wall:           { name: '墙',        cost: 99,  defense: 0,  can_spawn: false, color: '#555555', is_destructible: false, max_hp: 0, destroyed_transform_to: 'wall' },
    repair_station: { name: '维修站',    cost: 1,   defense: 0,  can_spawn: true,  color: '#44FF44', is_destructible: true,  max_hp: 5, destroyed_transform_to: 'rubble' },
    spawn_earth:    { name: '地球出生点', cost: 0,  defense: 0,  can_spawn: true,  color: '#4488FF', is_destructible: false, max_hp: 0, destroyed_transform_to: 'spawn_earth' },
    spawn_maxion:   { name: '火星出生点', cost: 0,  defense: 0,  can_spawn: true,  color: '#FF4444', is_destructible: false, max_hp: 0, destroyed_transform_to: 'spawn_maxion' },
    spawn:          { name: '出生点',    cost: 0,  defense: 0,  can_spawn: true,  color: '#FFFFFF', is_destructible: false, max_hp: 0, destroyed_transform_to: 'spawn' },
    // 前端地图用 'ruins'，原 FALLBACK 仅 'ruin'；加别名避免被兜底成 1
    ruins:          { name: '废墟',      cost: 2,   defense: 15, can_spawn: true,  color: '#998866', is_destructible: false, max_hp: 0, destroyed_transform_to: 'ruin' },
  };

  // 地形描述回退
  static FALLBACK_DESCRIPTIONS = {
    empty:     '普通地形，无特殊效果',
    plain:     '开阔地形，移动无阻碍',
    forest:    '提供掩护，移动稍慢',
    mountain:  '高防御，但移动困难',
    water:     '不可通行',
    base:      '友方建筑，可修复',
    mothership:'移动基地，补给点',
    ruin:      '战场遗迹，提供掩护',
    lava:      '危险地形，避免通过',
    lunar:     '月球表面，平坦地形',
    crater:    '轻微掩护，移动稍慢',
  };

  /**
   * 从 Map Service 加载地形类型数据
   * 异步方法，应在服务启动时调用
   * @returns {Promise<void>}
   */
  static async loadTerrainTypes() {
    if (this._isLoaded) return;

    try {
      // 尝试从 Map Service 获取地形类型列表
      const url = `${this.MAP_SERVICE_URL}/api/map/battlefields/terrain/types`;
      const response = await fetch(url);

      if (!response.ok) {
        throw new Error(`Map Service 返回 ${response.status}`);
      }

      const data = await response.json();
      if (!data.terrainTypes || !Array.isArray(data.terrainTypes)) {
        throw new Error('无效的地形数据格式');
      }

      // 构建地形数据映射
      this._terrainData = {};
      for (const t of data.terrainTypes) {
        this._terrainData[t.terrain_id] = {
          name: t.name,
          cost: t.movement_cost,
          defense: t.defense_bonus,
          can_spawn: t.can_spawn === 1 || t.can_spawn === true,
          color: t.color,
          description: t.description || this.FALLBACK_DESCRIPTIONS[t.terrain_id] || '',
        };
      }

      console.log(`[TerrainMovement] 从 Map Service 加载了 ${Object.keys(this._terrainData).length} 种地形类型`);
      this._isLoaded = true;
    } catch (error) {
      console.warn(`[TerrainMovement] 无法连接 Map Service (${error.message})，使用回退默认值`);
      this._isLoaded = true; // 标记为已加载，使用回退数据
    }
  }

  /**
   * 获取当前地形数据（优先加载数据，其次回退）
   */
  static getTerrainData() {
    return this._terrainData || this.FALLBACK_TERRAINS;
  }

  /**
   * 获取移动消耗
   * @param {string} terrainId - 地形 ID
   * @returns {number} 移动消耗
   */
  static getMoveCost(terrainId) {
    const data = this.getTerrainData();
    const terrain = data[terrainId];
    if (terrain) return terrain.cost;

    // 不在字典中的自定义地形，记录警告
    console.warn(`[TerrainMovement] 未知地形类型 '${terrainId}'，使用默认消耗 1`);
    return 1;
  }

  /**
   * 获取地形防御加成
   * @param {string} terrainId - 地形 ID
   * @returns {number} 防御加成百分比 (0-100)
   */
  static getDefenseBonus(terrainId) {
    const data = this.getTerrainData();
    const terrain = data[terrainId];
    if (terrain) return terrain.defense;

    return 0;
  }

  /**
   * 检查地形是否可以作为出生点
   */
  static canSpawn(terrainId) {
    const data = this.getTerrainData();
    const terrain = data[terrainId];
    return terrain ? terrain.can_spawn : false;
  }

  /**
   * 获取地形描述
   */
  static getTerrainDescription(terrainId) {
    const data = this.getTerrainData();
    const terrain = data[terrainId];
    if (terrain) {
      return {
        cn: terrain.name,
        en: terrainId,
        cost: terrain.cost,
        defense: terrain.defense,
        desc: terrain.description || this.FALLBACK_DESCRIPTIONS[terrainId] || '未知地形',
      };
    }

    // 未知自定义地形
    return {
      cn: terrainId,
      en: terrainId,
      cost: 1,
      defense: 0,
      desc: '自定义地形',
    };
  }

  /**
   * 获取所有已加载的地形类型列表
   */
  static getAllTerrainTypes() {
    const data = this.getTerrainData();
    return Object.entries(data).map(([id, t]) => ({
      terrain_id: id,
      name: t.name,
      cost: t.cost,
      defense: t.defense,
      can_spawn: t.can_spawn,
      color: t.color,
      description: t.description || this.FALLBACK_DESCRIPTIONS[id] || '',
    }));
  }


  // ============================================================
  //  Phase 9.5: 可破坏地形支持方法
  // ============================================================

  /**
   * 检查地形是否可破坏
   */
  static isDestructible(terrainId) {
    const data = this.getTerrainData()
    const t = data[terrainId]
    return t ? !!t.is_destructible : false
  }

  /**
   * 获取地形的最大 HP
   */
  static getTerrainMaxHp(terrainId) {
    const data = this.getTerrainData()
    const t = data[terrainId]
    return t ? (t.max_hp || 0) : 0
  }

  /**
   * 获取地形被破坏后的转化目标
   */
  static getDestroyedTransformTo(terrainId) {
    const data = this.getTerrainData()
    const t = data[terrainId]
    return t ? (t.destroyed_transform_to || terrainId) : terrainId
  }

  /**
   * 应用地形破坏转换：
   *   - 将 terrainMap 中指定格子的 terrain_id 替换为退化地形
   *   - 更新 move_cost 为退化地形的消耗
   *   - 返回更新后的 terrainCell 快照
   */
  static applyTerrainDestruction(terrainMap, q, r, terrainDefs = {}) {
    const key = `${q},${r}`
    const cell = terrainMap[key]
    if (!cell) return null

    const oldTerrainId = cell.terrain_id || cell.terrain || 'empty'
    const transformTo = this.getDestroyedTransformTo(oldTerrainId)

    // 获取退化地形的属性
    const newTerrain = terrainDefs[transformTo]
        || this.getTerrainData()[transformTo]
        || this.FALLBACK_TERRAINS[transformTo]
        || {}

    const oldMoveCost = cell.move_cost || this.getMoveCost(oldTerrainId)
    const newMoveCost = newTerrain.move_cost !== undefined
        ? newTerrain.move_cost
        : (newTerrain.cost || 1)

    // 更新 terrainMap 中的格子
    if (terrainMap[key]) {
        terrainMap[key].terrain_id = transformTo
        terrainMap[key].terrain = transformTo
        terrainMap[key].move_cost = newMoveCost
        terrainMap[key].terrain_hp = 0
        terrainMap[key].is_destructible = false
    }

    return {
        key,
        old_terrain_id: oldTerrainId,
        new_terrain_id: transformTo,
        old_move_cost: oldMoveCost,
        new_move_cost: newMoveCost,
        destroyed: true,
    }
  }


  /**
   * 计算路径总消耗
   */
  static calculatePathCost(path) {
    let totalCost = 0;
    for (const cell of path) {
      totalCost += this.getMoveCost(cell.terrain || 'empty');
    }
    return totalCost;
  }

  /**
   * 检查单位是否有足够移动力走完路径
   */
  static canUnitMove(movement, path) {
    const totalCost = this.calculatePathCost(path);
    return {
      canMove: totalCost <= movement,
      remainingMovement: movement - totalCost,
      totalCost,
    };
  }

  /**
   * 获取可达范围 (Dijkstra 风格，考虑地形消耗)
   */
  static getReachableHexes(start, movement, terrainMap = {}) {
    const reachable = [];
    const visited = new Set();
    const costMap = new Map();
    const queue = [{ q: start.q, r: start.r, cost: 0 }];
    costMap.set(`${start.q},${start.r}`, 0);

    while (queue.length > 0) {
      queue.sort((a, b) => a.cost - b.cost);
      const current = queue.shift();
      const key = `${current.q},${current.r}`;

      if (visited.has(key)) continue;
      visited.add(key);

      if (current.cost <= movement) {
        reachable.push({ q: current.q, r: current.r, cost: current.cost });

        if (current.cost < movement) {
          const directions = evenROffsetDirs(current.q, current.r);
          for (const dir of directions) {
            const nextQ = current.q + dir.q;
            const nextR = current.r + dir.r;
            const nextKey = `${nextQ},${nextR}`;

            const terrainId = terrainMap[nextKey] || 'empty';
            const moveCost = this.getMoveCost(terrainId);
            const newCost = current.cost + moveCost;

            if (!visited.has(nextKey) && newCost <= movement) {
              const existingCost = costMap.get(nextKey);
              if (existingCost === undefined || newCost < existingCost) {
                costMap.set(nextKey, newCost);
                queue.push({ q: nextQ, r: nextR, cost: newCost });
              }
            }
          }
        }
      }
    }

    return reachable;
  }
}

module.exports = TerrainMovement;
