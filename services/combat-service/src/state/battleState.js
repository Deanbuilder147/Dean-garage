/**
 * battleState.js - 内存战场状态管理
 * 管理多个战场实例的单位、回合、阶段状态
 */

const battles = new Map();

// ===== Terrain cost map (must match frontend TERRAIN_MAP) =====
const TERRAIN_COST_MAP = {
  space: 1, moon: 1, lunar: 1, empty: 1, base: 1, mothership: 1,
  repair_station: 1, spawn_earth: 0, spawn_maxion: 0, spawn: 0,
  desert: 1.5, forest: 2, water: 2.5, mountain: 3, fortress: 5,
  wall: 99
};

function getTerrainCost(terrainId) {
  return TERRAIN_COST_MAP[terrainId] || 1;
}

/**
 * BFS pathfinding: returns true if target hex is reachable within movementRange
 */
function canMoveTo(state, unit, target_q, target_r, movementRange) {
  const cells = state.cells || [];
  const cellMap = {};
  cells.forEach(c => { cellMap[`${c.q},${c.r}`] = { terrain: c.terrain || 'moon' }; });

  const units = state.units || [];
  const unitMap = {};
  units.forEach(u => {
    if (u.q !== undefined && u.r !== undefined) unitMap[`${u.q},${u.r}`] = true;
  });

  const startKey = `${unit.q},${unit.r}`;
  const targetKey = `${target_q},${target_r}`;

  // Remove self from unit map so starting position is passable
  if (unitMap[startKey]) delete unitMap[startKey];

  // Target must not be occupied (unless it's the unit's own position)
  if (targetKey !== startKey && unitMap[targetKey]) return false;

  const dirs = [[1, 0], [1, -1], [0, -1], [-1, 0], [-1, 1], [0, 1]];
  const costMap = {};
  costMap[startKey] = 0;
  const queue = [{ q: unit.q, r: unit.r, cost: 0 }];

  while (queue.length > 0) {
    queue.sort((a, b) => a.cost - b.cost);
    const cur = queue.shift();

    for (const [dq, dr] of dirs) {
      const nq = cur.q + dq;
      const nr = cur.r + dr;
      const nkey = `${nq},${nr}`;

      // Check bounds
      if (nq < 0 || nq >= (state.width || 15) || nr < 0 || nr >= (state.height || 10)) continue;

      // Get terrain cost
      const cell = cellMap[nkey];
      if (!cell) continue;
      const terrainCost = getTerrainCost(cell.terrain);
      if (terrainCost >= 99) continue; // impassable

      // Cannot pass through occupied hexes (except start)
      if (unitMap[nkey] && nkey !== startKey) continue;

      const newCost = cur.cost + terrainCost;
      if (newCost > movementRange) continue;

      if (costMap[nkey] === undefined || newCost < costMap[nkey]) {
        costMap[nkey] = newCost;
        queue.push({ q: nq, r: nr, cost: newCost });
      }
    }
  }

  return costMap[targetKey] !== undefined;
}

/**
 * 六边形距离计算
 */
function hexDistance(q1, r1, q2, r2) {
  const dq = Math.abs(q1 - q2);
  const dr = Math.abs(r1 - r2);
  const ds = Math.abs((q1 - q2) + (r1 - r2));
  return Math.max(dq, dr, ds);
}

const BattleState = {

  /**
   * 创建新战场
   */
  createBattle(id, config = {}) {
    const battle = {
      id,
      name: config.name || 'Untitled Battle',
      width: config.width || 15,
      height: config.height || 10,
      fogOfWar: config.fogOfWar || false,
      cells: config.cells || [],
      units: [],
      currentTurn: 1,
      phase: 'deploy', // 'deploy' | 'combat' | 'ended'
      turnOrder: config.turnOrder || [],
      currentPlayerIndex: 0,
      log: [],
      created: new Date().toISOString(),
      updated: new Date().toISOString()
    };

    // Initialize empty terrain cells
    if (config.terrain) {
      battle.cells = Object.entries(config.terrain).map(([key, terrain]) => {
        const [q, r] = key.split(',').map(Number);
        return { q, r, terrain };
      });
    }

    battles.set(id, battle);
    return battle;
  },

  /**
   * 获取战场状态
   */
  getBattle(id) {
    return battles.get(id) || null;
  },

  /**
   * 列出所有战场
   */
  listBattles() {
    return Array.from(battles.values()).map(b => ({
      id: b.id,
      name: b.name,
      phase: b.phase,
      turn: b.currentTurn,
      unitCount: b.units.length,
      created: b.created
    }));
  },

  /**
   * 删除战场
   */
  deleteBattle(id) {
    return battles.delete(id);
  },

  /**
   * 部署单位到战场
   * @param {string} battleId
   * @param {Object} unitData - 已转换的战斗单位对象
   * @returns {Object} 部署结果
   */
  deployUnit(battleId, unitData) {
    const state = battles.get(battleId);
    if (!state) throw new Error('战场不存在');
    if (state.phase !== 'deploy') throw new Error('当前不是部署阶段');

    const { q, r, unit_id } = unitData;

    // 检查坐标是否在边界内
    if (q < 0 || q >= state.width || r < 0 || r >= state.height) {
      throw new Error(`坐标 (${q},${r}) 超出战场范围`);
    }

    // 检查是否已经被占用
    const existingAtPos = state.units.find(u => u.q === q && u.r === r);
    if (existingAtPos) {
      throw new Error(`位置 (${q},${r}) 已被 ${existingAtPos.name} 占用`);
    }

    // 检查单位是否已部署
    const alreadyDeployed = state.units.find(u => u.id === unit_id);
    if (alreadyDeployed) {
      throw new Error(`单位 ${unitData.name} 已经部署`);
    }

    state.units.push(unitData);
    state.updated = new Date().toISOString();
    state.log.push(`[部署] ${unitData.name} → (${q},${r})`);

    return { success: true, unit: unitData, totalUnits: state.units.length };
  },

  /**
   * 移动单位（后端 BFS 地形代价校验）
   */
  moveUnit(battleId, unitId, targetQ, targetR) {
    const state = battles.get(battleId);
    if (!state) throw new Error('战场不存在');
    if (state.phase !== 'combat') throw new Error('当前不是战斗阶段');

    const unit = state.units.find(u => u.id === unitId || u.unit_id === unitId);
    if (!unit) throw new Error('找不到该单位');

    if (unit.hp <= 0) throw new Error('单位已阵亡，无法移动');
    if (unit.has_moved) throw new Error('本回合已移动过');

    // 计算移动力
    const mobility = unit.mobility || 3;
    const movementRange = Math.floor(mobility / 2) || 1;

    // BFS 地形代价校验
    if (!canMoveTo(state, unit, targetQ, targetR, movementRange)) {
      throw new Error('目标超出移动范围（考虑地形）');
    }

    // 检查目标位置是否被占用
    const occupied = state.units.find(u => u.q === targetQ && u.r === targetR && u.id !== unit.id);
    if (occupied) throw new Error(`位置 (${targetQ},${targetR}) 已被 ${occupied.name} 占用`);

    const fromQ = unit.q;
    const fromR = unit.r;

    unit.q = targetQ;
    unit.r = targetR;
    unit.has_moved = true;
    state.updated = new Date().toISOString();

    const dist = hexDistance(fromQ, fromR, targetQ, targetR);
    state.log.push(`[移动] ${unit.name}: (${fromQ},${fromR}) → (${targetQ},${targetR}) 距离=${dist}`);

    return {
      success: true,
      from: { q: fromQ, r: fromR },
      to: { q: targetQ, r: targetR },
      distance: dist,
      unit
    };
  },

  /**
   * 获取单位可移动范围（BFS 寻路返回所有可到达格子）
   */
  getMoveRange(battleId, unitId) {
    const state = battles.get(battleId);
    if (!state) throw new Error('战场不存在');

    const unit = state.units.find(u => u.id === unitId || u.unit_id === unitId);
    if (!unit) throw new Error('找不到该单位');
    if (unit.hp <= 0) return [];

    const mobility = unit.mobility || 3;
    const movementRange = Math.floor(mobility / 2) || 1;

    const cells = state.cells || [];
    const cellMap = {};
    cells.forEach(c => { cellMap[`${c.q},${c.r}`] = { terrain: c.terrain || 'moon' }; });

    const unitMap = {};
    state.units.forEach(u => {
      if (u.q !== undefined && u.r !== undefined) unitMap[`${u.q},${u.r}`] = true;
    });

    const startKey = `${unit.q},${unit.r}`;
    if (unitMap[startKey]) delete unitMap[startKey];

    const dirs = [[1, 0], [1, -1], [0, -1], [-1, 0], [-1, 1], [0, 1]];
    const costMap = {};
    costMap[startKey] = 0;
    const result = new Set();
    const queue = [{ q: unit.q, r: unit.r, cost: 0 }];

    while (queue.length > 0) {
      queue.sort((a, b) => a.cost - b.cost);
      const cur = queue.shift();

      for (const [dq, dr] of dirs) {
        const nq = cur.q + dq;
        const nr = cur.r + dr;
        const nkey = `${nq},${nr}`;

        if (nq < 0 || nq >= (state.width || 15) || nr < 0 || nr >= (state.height || 10)) continue;

        const cell = cellMap[nkey];
        if (!cell) continue;
        const terrainCost = getTerrainCost(cell.terrain);
        if (terrainCost >= 99) continue;
        if (unitMap[nkey] && nkey !== startKey) continue;

        const newCost = cur.cost + terrainCost;
        if (newCost > movementRange) continue;

        if (costMap[nkey] === undefined || newCost < costMap[nkey]) {
          costMap[nkey] = newCost;
          result.add({ q: nq, r: nr, cost: newCost });
          queue.push({ q: nq, r: nr, cost: newCost });
        }
      }
    }

    return Array.from(result);
  },

  /**
   * 结束当前回合
   */
  endTurn(battleId) {
    const state = battles.get(battleId);
    if (!state) throw new Error('战场不存在');

    // Start combat if still in deploy phase and at least 2 units
    if (state.phase === 'deploy') {
      if (state.units.length < 2) throw new Error('至少需要部署2个单位才能开始战斗');
      state.phase = 'combat';
      state.log.push(`[阶段] 部署结束，战斗开始！`);
    }

    // Reset all units' turn state
    state.units.forEach(u => {
      u.has_acted = false;
      u.has_moved = false;
    });

    state.currentTurn++;
    state.currentPlayerIndex = (state.currentPlayerIndex + 1) % (state.turnOrder.length || 2);
    state.updated = new Date().toISOString();
    state.log.push(`[回合] 第 ${state.currentTurn} 回合开始`);

    return { success: true, turn: state.currentTurn, phase: state.phase };
  },

  /**
   * 记录攻击
   */
  recordAttack(battleId, attackerId, defenderId, result) {
    const state = battles.get(battleId);
    if (!state) throw new Error('战场不存在');

    const attacker = state.units.find(u => u.id === attackerId || u.unit_id === attackerId);
    const defender = state.units.find(u => u.id === defenderId || u.unit_id === defenderId);

    if (attacker) attacker.has_acted = true;
    if (defender && result) {
      defender.hp = Math.max(0, (defender.hp || 0) - (result.final_damage || 0));
    }

    state.updated = new Date().toISOString();
    state.log.push(`[攻击] ${attacker?.name || attackerId} → ${defender?.name || defenderId}: ${result?.final_damage || 0} 伤害`);

    // Check win condition
    const aliveEarth = state.units.filter(u => u.faction === 'earth' && u.hp > 0).length;
    const aliveNonEarth = state.units.filter(u => u.faction !== 'earth' && u.hp > 0).length;

    if (aliveEarth === 0 || aliveNonEarth === 0) {
      state.phase = 'ended';
      state.log.push(`[结束] 战斗结束！${aliveEarth > 0 ? '地球联合' : '敌方'} 胜利`);
    }

    return { success: true, phase: state.phase };
  },

  /**
   * 添加日志
   */
  addLog(battleId, type, message) {
    const state = battles.get(battleId);
    if (state) {
      state.log.push(`[${type}] ${message}`);
      state.updated = new Date().toISOString();
    }
  }
};

export { BattleState, hexDistance, canMoveTo, getTerrainCost, TERRAIN_COST_MAP };
