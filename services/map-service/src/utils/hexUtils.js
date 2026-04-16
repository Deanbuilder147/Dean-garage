/**
 * 六角格坐标计算工具
 * 使用轴坐标系统 (q, r)
 * 
 * 六角格布局:
 * - 平顶 (flat-top): 奇偶行对齐方式不同
 * - 尖顶 (pointy-top): 奇偶列对齐方式不同
 * 
 * 坐标系统:
 * - q: 列方向轴 (column)
 * - r: 行方向轴 (row, 斜向)
 * - s: 第三轴 (s = -q - r, 用于计算)
 */

export const HexUtils = {
  // 六角格类型
  FLAT_TOP: 'flat-top',
  POINTY_TOP: 'pointy-top',

  /**
   * 计算六角格中心像素坐标
   * @param {number} q - 列坐标
   * @param {number} r - 行坐标  
   * @param {number} size - 六角格大小 (中心到顶点距离)
   * @param {string} layout - 布局类型
   */
  hexToPixel(q, r, size, layout = 'flat-top') {
    const x = layout === 'flat-top'
      ? size * (3/2 * q)
      : size * (Math.sqrt(3)/2 * q + Math.sqrt(3)/2 * r);
    
    const y = layout === 'flat-top'
      ? size * (Math.sqrt(3)/2 * r + Math.sqrt(3) * (q % 2 === 0 ? 0 : 0.5))
      : size * (3/2 * r);
    
    return { x, y };
  },

  /**
   * 计算像素到六角格坐标
   * @param {number} x - 像素x
   * @param {number} y - 像素y
   * @param {number} size - 六角格大小
   * @param {string} layout - 布局类型
   */
  pixelToHex(x, y, size, layout = 'flat-top') {
    let q, r;
    
    if (layout === 'flat-top') {
      q = (2/3 * x) / size;
      r = (-1/3 * x + Math.sqrt(3)/3 * y) / size;
    } else {
      q = (Math.sqrt(3)/3 * x - 1/3 * y) / size;
      r = (2/3 * y) / size;
    }
    
    return this.axialRound(q, r);
  },

  /**
   * 轴坐标取整
   */
  axialRound(q, r) {
    const s = -q - r;
    let rq = Math.round(q);
    let rr = Math.round(r);
    let rs = Math.round(s);
    
    const qDiff = Math.abs(rq - q);
    const rDiff = Math.abs(rr - r);
    const sDiff = Math.abs(rs - s);
    
    if (qDiff > rDiff && qDiff > sDiff) {
      rq = -rr - rs;
    } else if (rDiff > sDiff) {
      rr = -rq - rs;
    }
    
    return { q: rq, r: rr };
  },

  /**
   * 计算两六角格距离
   */
  hexDistance(q1, r1, q2, r2) {
    return (Math.abs(q1 - q2) + Math.abs(q1 + r1 - q2 - r2) + Math.abs(r1 - r2)) / 2;
  },

  /**
   * 获取相邻六角格
   * @param {number} q - 列坐标
   * @param {number} r - 行坐标
   */
  getNeighbors(q, r) {
    const directions = [
      { q: 1, r: 0 }, { q: 1, r: -1 }, { q: 0, r: -1 },
      { q: -1, r: 0 }, { q: -1, r: 1 }, { q: 0, r: 1 }
    ];
    return directions.map(d => ({ q: q + d.q, r: r + d.r }));
  },

  /**
   * 获取范围内的所有六角格
   * @param {number} centerQ - 中心q
   * @param {number} centerR - 中心r
   * @param {number} range - 范围
   */
  getHexesInRange(centerQ, centerR, range) {
    const results = [];
    for (let q = -range; q <= range; q++) {
      for (let r = Math.max(-range, -q - range); r <= Math.min(range, -q + range); r++) {
        results.push({ q: centerQ + q, r: centerR + r });
      }
    }
    return results;
  },

  /**
   * 检查坐标是否在地图范围内
   * @param {number} q - 列坐标
   * @param {number} r - 行坐标
   * @param {number} width - 地图宽度
   * @param {number} height - 地图高度
   */
  isInBounds(q, r, width, height) {
    // 简化的矩形边界检查
    return q >= 0 && q < width && r >= 0 && r < height;
  },

  /**
   * 生成地图唯一键
   * @param {number} q - 列坐标
   * @param {number} r - 行坐标
   */
  hexKey(q, r) {
    return `${q},${r}`;
  },

  /**
   * 解析地图键
   * @param {string} key - 格式 "q,r"
   */
  parseHexKey(key) {
    const [q, r] = key.split(',').map(Number);
    return { q, r };
  },

  /**
   * A*寻路算法
   * @param {Object} start - 起点 {q, r}
   * @param {Object} goal - 终点 {q, r}
   * @param {Object} terrain - 地形数据 {"q,r": terrainId}
   * @param {number} maxIterations - 最大迭代次数
   */
  findPath(start, goal, terrain = {}, maxIterations = 1000) {
    const startKey = this.hexKey(start.q, start.r);
    const goalKey = this.hexKey(goal.q, goal.r);
    
    if (startKey === goalKey) {
      return [start];
    }
    
    // 地形通行代价
    const getMovementCost = (terrainId) => {
      if (!terrainId || terrainId === 'empty') return 1;
      if (terrainId === 'forest') return 2;
      if (terrainId === 'mountain') return 3;
      if (terrainId === 'water') return Infinity;
      return 1;
    };
    
    // 启发函数
    const heuristic = (a, b) => this.hexDistance(a.q, a.r, b.q, b.r);
    
    // 优先队列
    const openSet = [start];
    const cameFrom = {};
    const gScore = { [startKey]: 0 };
    const fScore = { [startKey]: heuristic(start, goal) };
    
    let iterations = 0;
    
    while (openSet.length > 0 && iterations < maxIterations) {
      iterations++;
      
      // 找最小fScore
      openSet.sort((a, b) => {
        const fA = fScore[this.hexKey(a.q, a.r)] || Infinity;
        const fB = fScore[this.hexKey(b.q, b.r)] || Infinity;
        return fA - fB;
      });
      
      const current = openSet.shift();
      const currentKey = this.hexKey(current.q, current.r);
      
      if (currentKey === goalKey) {
        // 重建路径
        const path = [current];
        let key = currentKey;
        while (cameFrom[key]) {
          const prev = cameFrom[key];
          path.unshift(prev);
          key = this.hexKey(prev.q, prev.r);
        }
        return path;
      }
      
      for (const neighbor of this.getNeighbors(current.q, current.r)) {
        const neighborKey = this.hexKey(neighbor.q, neighbor.r);
        const terrainId = terrain[neighborKey] || 'empty';
        const cost = getMovementCost(terrainId);
        
        if (cost === Infinity) continue;
        
        const tentativeG = gScore[currentKey] + cost;
        
        if (tentativeG < (gScore[neighborKey] || Infinity)) {
          cameFrom[neighborKey] = current;
          gScore[neighborKey] = tentativeG;
          fScore[neighborKey] = tentativeG + heuristic(neighbor, goal);
          
          if (!openSet.some(n => this.hexKey(n.q, n.r) === neighborKey)) {
            openSet.push(neighbor);
          }
        }
      }
    }
    
    return []; // 无路径
  }
};

export default HexUtils;
