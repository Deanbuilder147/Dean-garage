/**
 * TerrainMovement - 地形移动系统
 * 
 * 基于现有 Map Service 地形数据
 * 所有单位都可以在任何地形上移动，只是消耗不同
 * 
 * 现有地形 (Map Service):
 * - empty (空地)
 * - mountain (山地)
 * - forest (森林)
 * - water (水域)
 * - mothership (母舰 - 出生点)
 * - base (基地 - 出生点)
 */

class TerrainMovement {
  
  /**
   * 地形移动消耗表
   * 
   * 设计原则:
   * - 空地：1 (基准)
   * - 森林：2 (中等障碍)
   * - 山地：3 (高障碍)
   * - 水域：2 (需要特殊装备，但不是不能通过)
   * - 建筑类：1 (友好地形)
   */
  static TERRAIN_COSTS = {
    // 基础地形
    empty: 1,       // 空地 - 无消耗
    plain: 1,       // 平原 - 同空地
    
    // 障碍地形
    forest: 2,      // 森林 - 中等消耗
    mountain: 3,    // 山地 - 高消耗
    ruin: 2,        // 废墟 - 中等消耗
    
    // 水域 (所有单位都可以通过，只是消耗高)
    water: 2,       // 水域 - 需要两栖装备
    lava: 3,        // 岩浆 - 高危险
    
    // 建筑/基地
    base: 1,        // 基地 - 友好地形
    mothership: 1,  // 母舰 - 友好地形
    
    // 特殊地形
    lunar: 1,       // 月面 - 平坦
    crater: 2       // 陨石坑 - 中等消耗
  };
  
  /**
   * 地形防御加成
   * 单位在不同地形上的防御bonus
   */
  static TERRAIN_DEFENSE = {
    empty: 0,       // 空地 - 无加成
    plain: 0,       // 平原 - 无加成
    
    forest: 10,     // 森林 - +10% 防御
    mountain: 20,   // 山地 - +20% 防御
    ruin: 15,       // 废墟 - +15% 防御
    
    water: 0,       // 水域 - 无加成 (暴露)
    lava: 0,        // 岩浆 - 无加成
    
    base: 0,        // 基地 - 无加成
    mothership: 0,  // 母舰 - 无加成
    
    lunar: 0,       // 月面 - 无加成
    crater: 5       // 陨石坑 - +5% 防御 (轻微掩护)
  };
  
  /**
   * 获取地形移动消耗
   * @param {string} terrainId - Map Service 地形 ID
   * @returns {number} 移动消耗 (1-3)
   */
  static getMoveCost(terrainId) {
    return this.TERRAIN_COSTS[terrainId] || 1; // 默认 1
  }
  
  /**
   * 获取地形防御加成
   * @param {string} terrainId - Map Service 地形 ID
   * @returns {number} 防御加成百分比 (0-20)
   */
  static getDefenseBonus(terrainId) {
    return this.TERRAIN_DEFENSE[terrainId] || 0; // 默认 0
  }
  
  /**
   * 计算路径总消耗
   * @param {Array} path - 路径数组 [{q, r, terrain}, ...]
   * @returns {number} 总移动消耗
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
   * @param {number} movement - 单位移动力
   * @param {Array} path - 路径数组
   * @returns {Object} { canMove: boolean, remainingMovement: number, totalCost: number }
   */
  static canUnitMove(movement, path) {
    const totalCost = this.calculatePathCost(path);
    const canMove = totalCost <= movement;
    
    return {
      canMove,
      remainingMovement: movement - totalCost,
      totalCost
    };
  }
  
  /**
   * 获取可达范围 (考虑地形消耗)
   * @param {Object} start - 起始坐标 {q, r}
   * @param {number} movement - 单位移动力
   * @param {Object} terrainMap - 地形图 {"q,r": terrainId}
   * @returns {Array} 可达坐标数组 [{q, r, cost}, ...]
   */
  static getReachableHexes(start, movement, terrainMap = {}) {
    const reachable = [];
    const visited = new Set();
    const costMap = new Map(); // Track minimum cost to reach each hex
    const queue = [{ q: start.q, r: start.r, cost: 0 }];
    costMap.set(`${start.q},${start.r}`, 0);
    
    // 六角格方向向量
    const directions = [
      { q: 1, r: 0 }, { q: 1, r: -1 }, { q: 0, r: -1 },
      { q: -1, r: 0 }, { q: -1, r: 1 }, { q: 0, r: 1 }
    ];
    
    while (queue.length > 0) {
      // Sort by cost to process cheapest paths first (Dijkstra-like)
      queue.sort((a, b) => a.cost - b.cost);
      const current = queue.shift();
      const key = `${current.q},${current.r}`;
      
      if (visited.has(key)) continue;
      visited.add(key);
      
      // 记录可达格子
      if (current.cost <= movement) {
        reachable.push({
          q: current.q,
          r: current.r,
          cost: current.cost
        });
        
        // 如果还有移动力，继续扩展
        if (current.cost < movement) {
          for (const dir of directions) {
            const nextQ = current.q + dir.q;
            const nextR = current.r + dir.r;
            const nextKey = `${nextQ},${nextR}`;
            
            const terrainId = terrainMap[nextKey] || 'empty';
            const moveCost = this.getMoveCost(terrainId);
            const newCost = current.cost + moveCost;
            
            // Only add if we found a cheaper path or haven't visited
            if (!visited.has(nextKey) && newCost <= movement) {
              const existingCost = costMap.get(nextKey);
              if (existingCost === undefined || newCost < existingCost) {
                costMap.set(nextKey, newCost);
                queue.push({
                  q: nextQ,
                  r: nextR,
                  cost: newCost
                });
              }
            }
          }
        }
      }
    }
    
    return reachable;
  }
  
  /**
   * 获取地形描述
   * @param {string} terrainId
   * @returns {Object} { cn: string, en: string, cost: number, defense: number }
   */
  static getTerrainDescription(terrainId) {
    const descriptions = {
      empty: {
        cn: '空地',
        en: 'Empty Land',
        cost: 1,
        defense: 0,
        desc: '普通地形，无特殊效果'
      },
      plain: {
        cn: '平原',
        en: 'Plain',
        cost: 1,
        defense: 0,
        desc: '开阔地形，移动无阻碍'
      },
      forest: {
        cn: '森林',
        en: 'Forest',
        cost: 2,
        defense: 10,
        desc: '提供掩护，移动稍慢'
      },
      mountain: {
        cn: '山地',
        en: 'Mountain',
        cost: 3,
        defense: 20,
        desc: '高防御，但移动困难'
      },
      water: {
        cn: '水域',
        en: 'Water',
        cost: 2,
        defense: 0,
        desc: '需要两栖装备，无掩护'
      },
      base: {
        cn: '基地',
        en: 'Base',
        cost: 1,
        defense: 0,
        desc: '友方建筑，可修复'
      },
      mothership: {
        cn: '母舰',
        en: 'Mothership',
        cost: 1,
        defense: 0,
        desc: '移动基地，补给点'
      },
      ruin: {
        cn: '废墟',
        en: 'Ruin',
        cost: 2,
        defense: 15,
        desc: '战场遗迹，提供掩护'
      },
      lava: {
        cn: '岩浆',
        en: 'Lava',
        cost: 3,
        defense: 0,
        desc: '危险地形，避免通过'
      },
      lunar: {
        cn: '月面',
        en: 'Lunar Surface',
        cost: 1,
        defense: 0,
        desc: '月球表面，平坦地形'
      },
      crater: {
        cn: '陨石坑',
        en: 'Crater',
        cost: 2,
        defense: 5,
        desc: '轻微掩护，移动稍慢'
      }
    };
    
    return descriptions[terrainId] || descriptions.empty;
  }
}

module.exports = TerrainMovement;
