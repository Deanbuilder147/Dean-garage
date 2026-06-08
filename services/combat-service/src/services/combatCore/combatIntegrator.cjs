/**
 * CombatIntegrator - 战斗核心集成器
 *
 * 职责:
 * 1. 将HookChain与CombatCore深度集成
 * 2. 管理战斗生命周期中的词条触发
 * 3. 协调DamagePipe、BuffManager、EquipManager与词条系统
 * 4. 提供统一的战斗执行接口
 */

const hookChain = require('./hookChain.cjs');
const tagRegistry = require('./tagRegistry.cjs');
const tagChainManager = require('./tagChainManager.cjs');
const tagDatabaseManager = require('./tagDatabaseManager.cjs');
const damagePipe = require('./damagePipe.cjs');
const buffManager = require('./buffManager.cjs');
const equipManager = require('./equipManager.cjs');

class CombatIntegrator {
  constructor() {
    // 战斗状态
    this.battle = null;

    // 单位状态映射
    this.unitStates = new Map();

    // 执行历史
    this.history = [];

    // 初始化钩子链
    this.initialized = false;
  }

  /**
   * 初始化战斗系统
   */
  async initialize() {
    if (this.initialized) {
      return { status: 'already_initialized' };
    }

    // 加载词条注册表到钩子链
    hookChain.loadFromRegistry();

    // 加载数据库管理器
    tagDatabaseManager.load();

    this.initialized = true;

    return {
      status: 'initialized',
      hooksSummary: hookChain.getSummary(),
      tagsCount: tagRegistry.getAll().length
    };
  }

  /**
   * 创建战斗
   */
  createBattle(config) {
    this.battle = {
      id: config.id || `battle_${Date.now()}`,
      config,
      state: 'created',
      round: 0,
      turn: 0,
      phase: 'setup',
      units: new Map(),
      turnOrder: [],
      currentUnitIndex: 0,
      createdAt: Date.now()
    };

    // 初始化单位和单位状态
    for (const unit of config.units || []) {
      // 添加到战斗单位Map
      this.battle.units.set(unit.id, unit);

      // 初始化单位状态
      this.unitStates.set(unit.id, {
        unit,
        hp: unit.hp,
        buffs: [],
        equipment: unit.equipment || {},
        tags: unit.equipped_tags || [],
        extraTurns: 0,
        canAct: true,
        isDead: false
      });

      // 添加到回合顺序
      this.battle.turnOrder.push(unit.id);
    }

    return { battleId: this.battle.id };
  }

  /**
   * 开始战斗
   */
  async startBattle() {
    if (!this.battle) {
      throw new Error('No active battle');
    }

    this.battle.state = 'active';
    this.battle.round = 1;
    this.battle.phase = 'round_start';

    // 触发轮次开始钩子
    await this.triggerPhase('round_start', this.getBaseContext());

    // 开始回合
    await this.startTurn();

    return { battleId: this.battle.id, round: 1 };
  }

  /**
   * 开始回合
   */
  async startTurn() {
    if (!this.battle) return;

    this.battle.turn++;
    this.battle.phase = 'turn_start';

    // 获取当前单位
    const currentUnit = this.getCurrentUnit();
    if (!currentUnit) return;

    // 触发回合开始钩子
    const context = this.getBaseContext({
      currentUnit
    });

    await this.triggerPhase('turn_start', context);

    // 处理额外回合
    const unitState = this.unitStates.get(currentUnit.id);
    if (unitState?.extraTurns > 0) {
      unitState.extraTurns--;
      this.history.push({
        type: 'extra_turn',
        unit: currentUnit.id,
        remaining: unitState.extraTurns
      });
    }

    this.battle.phase = 'action';
    return { turn: this.battle.turn, currentUnit: currentUnit.id };
  }

  /**
   * 获取当前单位
   */
  getCurrentUnit() {
    if (this.battle.turnOrder.length === 0) return null;
    return this.battle.units.get(this.battle.turnOrder[this.battle.currentUnitIndex]);
  }

  /**
   * 获取基础上下文
   */
  getBaseContext(overrides = {}) {
    return {
      battle: this.battle,
      units: Object.fromEntries(this.battle?.units || new Map()),
      unitStates: this.unitStates,
      currentRound: this.battle?.round || 1,
      currentTurn: this.battle?.turn || 1,
      timestamp: Date.now(),
      ...overrides
    };
  }

  /**
   * 触发指定阶段
   */
  async triggerPhase(phase, context) {
    const result = await hookChain.executePhase(phase, context);

    this.history.push({
      type: 'phase_trigger',
      phase,
      result,
      timestamp: Date.now()
    });

    return result;
  }

  /**
   * 执行攻击
   */
  async executeAttack(config) {
    const { attackerId, targetId, attackType } = config;

    const attacker = this.battle.units.get(attackerId);
    const target = this.battle.units.get(targetId);

    if (!attacker || !target) {
      throw new Error('Invalid attacker or target');
    }

    const attackerState = this.unitStates.get(attackerId);
    const targetState = this.unitStates.get(targetId);

    // 构建攻击上下文
    const context = this.getBaseContext({
      attacker,
      target,
      attackerState,
      targetState,
      attackType,
      damageType: attackType === 'melee' ? 'kinetic' : 'energy'
    });

    // 1. 攻击前阶段 (pre_attack)
    await this.triggerPhase('pre_attack', context);

    // 2. 伤害计算前 (pre_damage)
    await this.triggerPhase('pre_damage', context);

    // 3. 计算伤害
    let damage = damagePipe.calculate({
      attacker,
      target,
      attackType,
      context
    });

    // 4. 伤害计算中 (on_damage)
    context.damage = damage;
    await this.triggerPhase('on_damage', context);
    damage = context.damage; // 可能被修改

    // 5. 应用伤害
    targetState.hp -= damage;

    // 6. 伤害结算后 (post_damage)
    context.damageDealt = damage;
    const postDamageResult = await this.triggerPhase('post_damage', context);

    // 7. 检查击杀
    if (targetState.hp <= 0) {
      targetState.hp = 0;
      targetState.isDead = true;

      // 触发击杀钩子
      context.killer = attacker;
      await this.triggerPhase('on_kill', context);

      // 触发死亡钩子
      await this.triggerPhase('on_death', context);
    }

    // 8. 触发受到伤害钩子
    await this.triggerPhase('on_damage_taken', context);

    // 9. 攻击后阶段 (post_attack)
    await this.triggerPhase('post_attack', context);

    return {
      attackerId,
      targetId,
      damage,
      targetHp: targetState.hp,
      killed: targetState.isDead,
      postDamageEffects: postDamageResult
    };
  }

  /**
   * 执行移动
   */
  async executeMove(config) {
    const { unitId, fromPosition, toPosition, path } = config;

    const unit = this.battle.units.get(unitId);
    if (!unit) {
      throw new Error('Invalid unit');
    }

    const moveContext = {
      movingUnit: unit,
      fromPosition,
      toPosition,
      path,
      blockingUnits: []
    };

    const context = this.getBaseContext({
      moveContext,
      currentUnit: unit
    });

    // 触发移动判定钩子
    const result = await this.triggerPhase('movement_check', context);

    // 检查是否被阻挡
    const blocked = result.results?.some(r => r.triggered && r.blocked);

    if (!blocked) {
      // 执行移动
      unit.position = toPosition;
    }

    return {
      unitId,
      from: fromPosition,
      to: toPosition,
      blocked,
      moveContext,
      result
    };
  }

  /**
   * 回合结束
   */
  async endTurn() {
    if (!this.battle) return;

    this.battle.phase = 'turn_end';

    const currentUnit = this.getCurrentUnit();

    // 触发回合结束钩子
    await this.triggerPhase('turn_end', this.getBaseContext({
      currentUnit
    }));

    // 清理过期buff
    await this.cleanupExpiredBuffs();

    // 移动到下一个单位
    this.battle.currentUnitIndex++;
    if (this.battle.currentUnitIndex >= this.battle.turnOrder.length) {
      // 回合结束，进入下一轮
      return await this.endRound();
    }

    return await this.startTurn();
  }

  /**
   * 回合结束
   */
  async endRound() {
    this.battle.round++;
    this.battle.currentUnitIndex = 0;
    this.battle.phase = 'round_start';

    // 触发轮次开始钩子
    await this.triggerPhase('round_start', this.getBaseContext());

    return {
      newRound: this.battle.round,
      phase: 'round_start'
    };
  }

  /**
   * 清理过期buff
   */
  async cleanupExpiredBuffs() {
    for (const [unitId, state] of this.unitStates) {
      const beforeCount = state.buffs.length;
      state.buffs = state.buffs.filter(buff => {
        if (buff.duration !== undefined && buff.duration <= 0) {
          return false;
        }
        if (buff.duration !== undefined) {
          buff.duration--;
        }
        return true;
      });

      if (state.buffs.length < beforeCount) {
        this.history.push({
          type: 'buff_cleanup',
          unitId,
          removed: beforeCount - state.buffs.length,
          remaining: state.buffs.length
        });
      }
    }
  }

  /**
   * 添加buff
   */
  addBuff(unitId, buff) {
    const state = this.unitStates.get(unitId);
    if (!state) return { success: false };

    state.buffs.push({
      ...buff,
      appliedAt: Date.now()
    });

    return { success: true };
  }

  /**
   * 获取单位状态
   */
  getUnitState(unitId) {
    return this.unitStates.get(unitId);
  }

  /**
   * 获取战斗状态
   */
  getBattleState() {
    if (!this.battle) return null;

    return {
      id: this.battle.id,
      round: this.battle.round,
      turn: this.battle.turn,
      phase: this.battle.phase,
      state: this.battle.state,
      units: Array.from(this.battle.units.entries()).map(([id, unit]) => ({
        id,
        ...unit,
        state: this.unitStates.get(id)
      })),
      turnOrder: this.battle.turnOrder
    };
  }

  /**
   * 获取执行历史
   */
  getHistory() {
    return this.history;
  }

  /**
   * 结束战斗
   */
  endBattle() {
    if (!this.battle) return;

    const survivors = Array.from(this.unitStates.entries())
      .filter(([, state]) => !state.isDead)
      .map(([id]) => id);

    const result = {
      battleId: this.battle.id,
      winner: survivors.length === 1 ? survivors[0] : null,
      survivors,
      totalRounds: this.battle.round,
      totalTurns: this.battle.turn,
      duration: Date.now() - this.battle.createdAt,
      history: this.history
    };

    this.battle.state = 'ended';
    return result;
  }

  /**
   * 重置
   */
  reset() {
    this.battle = null;
    this.unitStates.clear();
    this.history = [];
    hookChain.clear();
  }
}

// 单例导出
module.exports = new CombatIntegrator();
