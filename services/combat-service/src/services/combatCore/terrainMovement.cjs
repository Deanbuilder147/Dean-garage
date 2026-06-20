/**
 * TerrainMovement - 地形移动系统
 * 
 * 从 Map Service 动态加载地形类型和属性
 * 如果 Map Service 不可用，回退到内置默认值
 */

'use strict';

class TerrainMovement {
  // 模块级缓存：从 Map Service 加载的地形数据
  static _terrainData = null;
  static _isLoaded = false;
  static MAP_SERVICE_URL = process.env.MAP_SERVICE_URL || 'http://map-service:3003';

  // 硬编码回退默认值（与 Map Service 数据库初始化一致）
  static FALLBACK_TERRAINS = {
    empty:     { name: '空地',     cost: 1,  defense: 0,  can_spawn: true,  color: '#88CC88' },
    plain:     { name: '平原',     cost: 1,  defense: 0,  can_spawn: true,  color: '#AAFFAA' },
    forest:    { name: '森林',     cost: 2,  defense: 10, can_spawn: true,  color: '#228822' },
    mountain:  { name: '山地',     cost: 3,  defense: 20, can_spawn: false, color: '#886644' },
    water:     { name: '水域',     cost: 99, defense: 0,  can_spawn: false, color: '#4488FF' },
    base:      { name: '基地',     cost: 1,  defense: 0,  can_spawn: true,  color: '#FF4444' },
    mothership:{ name: '母舰',     cost: 1,  defense: 0,  can_spawn: true,  color: '#FFD700' },
    ruin:      { name: '废墟',     cost: 2,  defense: 15, can_spawn: true,  color: '#998866' },
    lava:      { name: '岩浆',     cost: 3,  defense: 0,  can_spawn: false, color: '#FF6600' },
    lunar:     { name: '月面',     cost: 1,  defense: 0,  can_spawn: true,  color: '#CCCCCC' },
    crater:    { name: '陨石坑',   cost: 2,  defense: 5,  can_spawn: true,  color: '#777766' },
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

    const directions = [
      { q: 1, r: 0 }, { q: 1, r: -1 }, { q: 0, r: -1 },
      { q: -1, r: 0 }, { q: -1, r: 1 }, { q: 0, r: 1 },
    ];

    while (queue.length > 0) {
      queue.sort((a, b) => a.cost - b.cost);
      const current = queue.shift();
      const key = `${current.q},${current.r}`;

      if (visited.has(key)) continue;
      visited.add(key);

      if (current.cost <= movement) {
        reachable.push({ q: current.q, r: current.r, cost: current.cost });

        if (current.cost < movement) {
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
