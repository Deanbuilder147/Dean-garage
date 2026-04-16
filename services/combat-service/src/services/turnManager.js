/**
 * 回合管理系统
 * 管理战斗回合、阶段切换、阵营轮次
 * 支持多人联机：出生点选择、部署、战术阶段
 */

import { CombatResolver } from './combatResolver.js';
import { BuffManager } from './combatCore/index.cjs';

export class TurnManager {
  
  // 阵营顺序
  static FACTION_ORDER = ['earth', 'balon', 'maxion'];
  
  // 有效阶段列表（新增多人联机阶段）
  static VALID_PHASES = [
    'spawn_selection',     // 出生点选择阶段
    'spawn_deployment',    // 出生点部署阶段
    'tactical',            // 战术阶段（部署Royroy）
    'move',                // 移动阶段
    'action',              // 行动阶段
    'end'                  // 结束阶段
  ];
  
  /**
   * 获取下一个阵营
   */
  static getNextFaction(currentFaction) {
    const currentIndex = this.FACTION_ORDER.indexOf(currentFaction);
    const nextIndex = (currentIndex + 1) % this.FACTION_ORDER.length;
    return this.FACTION_ORDER[nextIndex];
  }

  /**
   * 初始化出生点选择阶段
   * 根据房间玩家生成选择顺序
   */
  static initSpawnSelection(state, roomPlayers) {
    // 生成选择顺序（按座位索引排序）
    state.spawnOrder = roomPlayers
      .sort((a, b) => a.seat_index - b.seat_index)
      .map(p => ({
        playerId: p.user_id,
        faction: p.faction,
        hasSelected: false,
        spawnPoint: null
      }));
    
    state.currentSpawnIndex = 0;
    state.spawnPhaseDone = false;
    state.phase = 'spawn_selection';
    
    // 添加日志
    state.battle_log = state.battle_log || [];
    state.battle_log.push({
      type: 'phase_change',
      phase: 'spawn_selection',
      message: '进入出生点选择阶段',
      currentPlayer: state.spawnOrder[0]?.playerId,
      timestamp: new Date().toISOString()
    });
    
    return state;
  }

  /**
   * 玩家选择出生点
   */
  static selectSpawn(state, playerId, q, r, spawnPoints) {
    // 验证是当前选择玩家
    const currentSpawnPlayer = state.spawnOrder?.[state.currentSpawnIndex];
    if (!currentSpawnPlayer || currentSpawnPlayer.playerId !== playerId) {
      throw new Error('不是你的回合选择出生点');
    }
    
    // 验证是有效的出生点（母舰或基地）
    const isValidSpawn = spawnPoints.some(sp => 
      sp.q === q && sp.r === r && (sp.type === 'mothership' || sp.type === 'base')
    );
    if (!isValidSpawn) {
      throw new Error('只能选择母舰或基地作为出生点');
    }
    
    // 验证该出生点未被占用
    const isOccupied = state.spawnOrder.some((p, idx) => 
      idx !== state.currentSpawnIndex && 
      p.spawnPoint?.q === q && 
      p.spawnPoint?.r === r
    );
    if (isOccupied) {
      throw new Error('该出生点已被占用');
    }
    
    // 保存出生点
    currentSpawnPlayer.hasSelected = true;
    currentSpawnPlayer.spawnPoint = { q, r };
    
    // 添加日志
    state.battle_log.push({
      type: 'spawn_selected',
      playerId,
      position: { q, r },
      timestamp: new Date().toISOString()
    });
    
    // 下一个玩家
    state.currentSpawnIndex++;
    
    // 检查是否所有人都选完了
    if (state.currentSpawnIndex >= state.spawnOrder.length) {
      // 进入部署阶段
      state.phase = 'spawn_deployment';
      state.spawnPhaseDone = true;
      state.battle_log.push({
        type: 'phase_change',
        phase: 'spawn_deployment',
        message: '所有玩家已选择出生点，进入部署阶段',
        timestamp: new Date().toISOString()
      });
    }
    
    return state;
  }

  /**
   * 在出生点部署单位
   */
  static deployUnit(state, playerId, unitId, q, r) {
    // 验证处于部署阶段
    if (state.phase !== 'spawn_deployment') {
      throw new Error('当前不是部署阶段');
    }
    
    // 找到玩家的出生点
    const playerSpawn = state.spawnOrder?.find(p => p.playerId === playerId);
    if (!playerSpawn || !playerSpawn.spawnPoint) {
      throw new Error('玩家尚未选择出生点');
    }
    
    // 验证部署位置是玩家的出生点
    const spawnPoint = playerSpawn.spawnPoint;
    const isAtSpawn = (q === spawnPoint.q && r === spawnPoint.r);
    if (!isAtSpawn) {
      throw new Error('只能在已选择的出生点部署单位');
    }
    
    // 验证该位置未被占用
    const isOccupied = state.units.some(u => u.q === q && u.r === r);
    if (isOccupied) {
      throw new Error('该位置已有单位');
    }
    
    // 获取单位数据（简化处理：从unitId获取单位）
    // 实际实现中应该从数据库查询单位详情
    const newUnit = {
      id: unitId,
      playerId: playerId,
      faction: playerSpawn.faction,
      q: q,
      r: r,
      has_moved: false,
      has_acted: false,
      royroy_deployed: false
    };
    
    state.units.push(newUnit);
    
    // 添加日志
    state.battle_log.push({
      type: 'unit_deployed',
      unitId,
      playerId,
      position: { q, r },
      timestamp: new Date().toISOString()
    });
    
    return state;
  }

  /**
   * 结束部署阶段，进入战术阶段
   */
  static endDeploymentPhase(state) {
    if (state.phase !== 'spawn_deployment') {
      throw new Error('当前不是部署阶段');
    }
    
    state.phase = 'tactical';
    state.battle_log.push({
      type: 'phase_change',
      phase: 'tactical',
      message: '部署完成，进入战术阶段',
      timestamp: new Date().toISOString()
    });
    
    return state;
  }

  /**
   * 检查是否可以在战术阶段部署Royroy
   */
  static canDeployRoyroy(state, playerId) {
    return state.phase === 'tactical' && 
           state.currentPlayer === playerId;
  }

  /**
   * 部署Royroy
   */
  static deployRoyroy(state, unitId, q, r) {
    if (state.phase !== 'tactical') {
      throw new Error('只能在战术阶段部署Royroy');
    }
    
    const unit = state.units?.find(u => u.id === unitId);
    if (!unit) {
      throw new Error('单位不存在');
    }
    
    if (!unit.has_royroy) {
      throw new Error('该单位没有Royroy');
    }
    
    if (unit.royroy_deployed) {
      throw new Error('Royroy已部署');
    }
    
    // 检查是否在主机体周围1格内
    const distance = Math.abs(q - unit.q) + Math.abs(r - unit.r);
    if (distance > 1) {
      throw new Error('Royroy必须在主机体周围1格内');
    }
    
    // 部署Royroy
    unit.royroy_q = q;
    unit.royroy_r = r;
    unit.royroy_deployed = true;
    
    state.battle_log.push({
      type: 'royroy_deployed',
      unitId,
      position: { q, r },
      timestamp: new Date().toISOString()
    });
    
    return state;
  }

  /**
   * 结束战术阶段，进入移动阶段
   */
  static endTacticalPhase(state) {
    if (state.phase !== 'tactical') {
      throw new Error('当前不是战术阶段');
    }
    
    state.phase = 'move';
    state.battle_log.push({
      type: 'phase_change',
      phase: 'move',
      message: '战术阶段结束，进入移动阶段',
      timestamp: new Date().toISOString()
    });
    
    return state;
  }

  /**
   * 处理回合结束，进入下一回合
   */
  static nextTurn(state) {
    const nextFaction = this.getNextFaction(state.currentFaction);
    
    // 如果回到地联，说明完成了一轮
    if (nextFaction === 'earth') {
      state.turnNumber = (state.turnNumber || 1) + 1;
      // 重置迷雾系统的每回合标志
      state.earthFogRolledThisTurn = false;
      // 重置阵营技能使用标志
      state.earthArtilleryUsed = false;
      state.fogSystemUsed = false;
    }
    
    state.currentFaction = nextFaction;
    state.phase = 'move';
    
    // 重置单位状态
    state.units.forEach(unit => {
      unit.has_moved = false;
      unit.has_acted = false;
      unit.skip_turn = false;
      // 重置造成伤害标记（用于隐匿判断）
      unit.dealtDamageLastTurn = unit.dealtDamageThisTurn || false;
      unit.dealtDamageThisTurn = false;
    });
    
    // 【Phase 2.3】回合开始时减少所有单位的Buff持续时间
    this.processBuffTicks(state);
    
    // 应用回合开始效果
    this.applyTurnStartEffects(state);
    
    // 添加日志
    state.battle_log = state.battle_log || [];
    state.battle_log.push({
      type: 'turn_change',
      faction: nextFaction,
      turn_number: state.turnNumber,
      timestamp: new Date().toISOString()
    });
    
    return state;
  }
  
  /**
   * 【Phase 2.3】处理所有单位的Buff回合减少
   * @param {Object} state - 战场状态
   * @returns {Object} 过期Buff汇总
   */
  static processBuffTicks(state) {
    const allExpiredBuffs = [];
    
    state.units.forEach(unit => {
      if (unit.hp <= 0) return; // 跳过死亡单位
      
      const expired = BuffManager.tickBuffs(unit);
      if (expired.length > 0) {
        allExpiredBuffs.push({
          unit_id: unit.id,
          unit_name: unit.name || unit.id,
          buffs: expired
        });
        
        // 添加Buff过期日志
        expired.forEach(buff => {
          state.battle_log.push({
            type: 'buff_expired',
            unit_id: unit.id,
            unit_name: unit.name || unit.id,
            buff_type: buff.type,
            buff_value: buff.value,
            timestamp: new Date().toISOString()
          });
        });
      }
    });
    
    return {
      total_expired: allExpiredBuffs.reduce((sum, u) => sum + u.buffs.length, 0),
      units_affected: allExpiredBuffs
    };
  }

  /**
   * 应用回合开始效果
   */
  static applyTurnStartEffects(state) {
    const faction = state.currentFaction;
    
    // 地球联合：迷雾系统
    if (faction === 'earth' && !state.earthFogRolledThisTurn) {
      const fogResult = CombatResolver.resolveFogSystem(state.units, state.battlefield_state);
      state.fogEffect = fogResult.effect;
      state.fogRoll = fogResult.roll;
      state.earthFogRolledThisTurn = true;
      
      state.battle_log.push({
        type: 'fog_system',
        roll: fogResult.roll,
        effect: fogResult.effect,
        message: fogResult.message
      });
    }
    
    // 地形回复：拜隆月面回复 + 地球联合母舰回复
    const healingResult = CombatResolver.resolveTerrainHealing ?
      CombatResolver.resolveTerrainHealing(state.units, state.battlefield_state) :
      { logs: [] };
    
    // 添加回复日志
    healingResult.logs.forEach(log => {
      state.battle_log.push(log);
    });
  }

  /**
   * 设置阶段
   */
  static setPhase(state, newPhase) {
    if (!this.VALID_PHASES.includes(newPhase)) {
      throw new Error(`无效阶段: ${newPhase}`);
    }
    
    state.phase = newPhase;
    
    // 添加阶段变更日志
    state.battle_log = state.battle_log || [];
    state.battle_log.push({
      type: 'phase_change',
      phase: newPhase,
      timestamp: new Date().toISOString()
    });
    
    return state;
  }

  /**
   * 获取当前出生点选择玩家
   */
  static getCurrentSpawnPlayer(state) {
    if (state.phase !== 'spawn_selection' || !state.spawnOrder) {
      return null;
    }
    return state.spawnOrder[state.currentSpawnIndex] || null;
  }

  /**
   * 检查所有玩家是否已完成出生点选择
   */
  static isSpawnSelectionComplete(state) {
    if (!state.spawnOrder) return false;
    return state.spawnOrder.every(p => p.hasSelected);
  }

  /**
   * 获取玩家的出生点
   */
  static getPlayerSpawnPoint(state, playerId) {
    const playerSpawn = state.spawnOrder?.find(p => p.playerId === playerId);
    return playerSpawn?.spawnPoint || null;
  }

  /**
   * 检查单位是否可以行动
   */
  static canUnitAct(unit) {
    if (unit.hp <= 0) return false;
    if (unit.skip_turn) return false;
    if (unit.has_acted && unit.has_moved) return false;
    return true;
  }

  /**
   * 获取当前阵营的可行动单位
   */
  static getActiveUnits(state) {
    return state.units.filter(unit => 
      unit.faction === state.currentFaction && 
      this.canUnitAct(unit)
    );
  }

  /**
   * 检查单位是否在地图上可见（用于隐匿系统）
   */
  static isUnitVisible(unit, viewerUnit, state) {
    // 单位死亡不可见
    if (unit.hp <= 0) return false;
    
    // 同阵营可见
    if (unit.faction === viewerUnit.faction) return true;
    
    // 检查距离
    const distance = this.calculateDistance(unit, viewerUnit);
    
    // 检查地形遮挡
    const lineOfSight = this.checkLineOfSight(unit, viewerUnit, state);
    
    // 检查隐匿状态
    const isHidden = unit.hidden && unit.hiddenTurns > 0;
    
    return distance <= viewerUnit.sensor_range && lineOfSight && !isHidden;
  }

  /**
   * 检查视线通路
   */
  static checkLineOfSight(unit1, unit2, state) {
    // 简化的视线检查：检查两点连线上的地形
    const cells = this.getCellsBetween(unit1, unit2);
    
    for (const cell of cells) {
      const terrain = CombatResolver.getTerrainAt(cell.q, cell.r, state.battlefield_state);
      if (terrain === 'mountain' || terrain === 'building') {
        return false; // 被地形阻挡
      }
    }
    
    return true;
  }

  /**
   * 获取两点之间的格子
   */
  static getCellsBetween(unit1, unit2) {
    const cells = [];
    const steps = Math.max(Math.abs(unit1.q - unit2.q), Math.abs(unit1.r - unit2.r));
    
    for (let i = 0; i <= steps; i++) {
      const t = i / steps;
      const q = Math.round(unit1.q + (unit2.q - unit1.q) * t);
      const r = Math.round(unit1.r + (unit2.r - unit1.r) * t);
      cells.push({ q, r });
    }
    
    return cells;
  }

  /**
   * 获取战斗胜利者
   */
  static checkVictory(state) {
    const factions = {};
    
    state.units.forEach(unit => {
      factions[unit.faction] = true;
    });
    
    const remainingFactions = Object.keys(factions);
    
    // 只有一方存活
    if (remainingFactions.length === 1) {
      return {
        victory: true,
        winner: remainingFactions[0]
      };
    }
    
    // 无人存活
    if (remainingFactions.length === 0) {
      return {
        victory: true,
        winner: 'draw'
      };
    }
    
    return { victory: false };
  }

  /**
   * 计算六角格距离
   */
  static calculateDistance(unit1, unit2) {
    return Math.abs(unit1.q - unit2.q) + Math.abs(unit1.r - unit2.r);
  }

  /**
   * 掷骰子
   */
  static rollDice(sides = 6) {
    return Math.floor(Math.random() * sides) + 1;
  }
}

export default TurnManager;