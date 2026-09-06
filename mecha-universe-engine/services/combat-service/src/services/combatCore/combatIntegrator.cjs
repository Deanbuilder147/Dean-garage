/**
 * ============================================================
 * DEPRECATED — 此文件已弃用
 * ============================================================
 * 战斗逻辑主线现已统一为:
 *   - combatResolver.js (攻击/技能解析)
 *   - turnManager.js    (回合/阶段管理)
 *   - damagePipe.cjs    (伤害计算管道)
 *   - terrainMovement.cjs (地形/移动系统)
 *
 * CombatIntegrator 保留仅供向后兼容，新功能请勿在此添加。
 * 计划在 v2.0 移除。
 * ============================================================
 */

/**
 * ============================================================
 * DEPRECATED — 此文件已弃用
 * ============================================================
 * 战斗逻辑主线现已统一为:
 *   - combatResolver.js (攻击/技能解析)
 *   - turnManager.js    (回合/阶段管理)
 *   - damagePipe.cjs    (伤害计算管道)
 *   - terrainMovement.cjs (地形/移动系统)
 *
 * CombatIntegrator 保留仅供向后兼容，新功能请勿在此添加。
 * 计划在 v2.0 移除。
 * ============================================================
 */

/**
 * ============================================================
 * DEPRECATED — 此文件已弃用
 * ============================================================
 * 战斗逻辑主线现已统一为:
 *   - combatResolver.js (攻击/技能解析)
 *   - turnManager.js    (回合/阶段管理)
 *   - damagePipe.cjs    (伤害计算管道)
 *   - terrainMovement.cjs (地形/移动系统)
 *
 * CombatIntegrator 保留仅供向后兼容，新功能请勿在此添加。
 * 计划在 v2.0 移除。
 * ============================================================
 */

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

        // ★ 项3：单位生成阶段注入技能寿命初始值到 unit._meta（charges/durability 按 skill_key 索引）
        this._initUnitSkillMeta(unit);

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
   * ★ 项3：单位生成阶段注入技能寿命初始值到 unit._meta
   * 遍历单位携带的技能（unit.skills / unit.equipped_skills），从全局技能配置读取
   * cost.charges / cost.durability 初始值，注入 unit._meta.charges[skill_key] / durability[skill_key]。
   * 注意：combatIntegrator 已弃用，真实战斗路径的懒初始化在 skillExecutor 内完成；
   * 此处钩子同时满足「统一初始化点」任务要求，且对未携带技能配置的单位零副作用。
   */
  _initUnitSkillMeta(unit) {
    if (!unit) return;
    const skillKeys = Array.isArray(unit.skills) ? unit.skills
      : (Array.isArray(unit.equipped_skills) ? unit.equipped_skills : []);
    if (!skillKeys.length) return;
    try {
      const configLoader = require('./configLoader.cjs');
      const getSkillConfig = configLoader.getSkillConfig || configLoader.default && configLoader.default.getSkillConfig;
      if (typeof getSkillConfig !== 'function') return;
      unit._meta = unit._meta || {};
      unit._meta.charges = unit._meta.charges || {};
      unit._meta.durability = unit._meta.durability || {};
      unit._meta.chargesMax = unit._meta.chargesMax || {};
      unit._meta.durabilityMax = unit._meta.durabilityMax || {};
      for (const key of skillKeys) {
        const cfg = getSkillConfig(key);
        if (!cfg || !cfg.cost) continue;
        const norm = (v) => (typeof v === 'object' && v != null) ? Number(v.initial) || 0 : Number(v) || 0;
        const cInit = norm(cfg.cost.charges);
        const dInit = norm(cfg.cost.durability);
        if (cInit > 0 && unit._meta.charges[key] == null) {
          unit._meta.charges[key] = cInit;
          unit._meta.chargesMax[key] = cInit;
        }
        if (dInit > 0 && unit._meta.durability[key] == null) {
          unit._meta.durability[key] = dInit;
          unit._meta.durabilityMax[key] = dInit;
        }
      }
    } catch (e) {
      // 配置不可用时静默跳过，交由 skillExecutor 懒初始化兜底
    }
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

    // ★ §8.9②：回合开始相位结算（递减 expiry_phase='turn_start' 的 status，避免被动 Buff 秒失效）
    try { buffManager.tickStatusStart(currentUnit); } catch (_e) { /* 防御 */ }

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
   * 合并方案 7.3（隐患2防御 · Week1 切断双结算）
   * 纯时机广播器：仅向 HookChain / 反应系统派发阶段事件，
   * 绝不调用 damagePipe 算伤、绝不修改 unitState.hp。
   * 真正的算伤与扣血唯一路径已收口到 _walkPhaseTree → DO 原子 → damagePipe（仅算值）→ 统一扣血。
   */
  async emitPipelineEvents(timing, payload) {
    try {
      await this.triggerPhase(timing, payload || {});
    } catch (e) {
      console.warn(`[CombatIntegrator] emitPipelineEvents(${timing}) 广播异常(已吞，不影响结算):`, e.message);
    }
    return { broadcast: true, timing };
  }

  /**
   * 执行攻击
   * @deprecated 合并方案 7.3：本方法已退位为纯广播，不再算伤/扣血。
   *   线上 /attack 路由已绕过本类，改走 SkillExecutor（_walkPhaseTree）。
   *   此处仅保留签名兼容，内部结算副作用已拔除，避免与 v2 树路径产生"双结算"数据错乱。
   */
  async executeAttack(config) {
    if (!this._executeAttackDeprecationWarned) {
      this._executeAttackDeprecationWarned = true;
      console.warn('[CombatIntegrator] executeAttack 已弃用：退位为纯广播，算伤/扣血由 SkillExecutor 的 v2 树路径负责。');
    }
    const { attackerId, targetId, attackType } = config || {};
    // 仅广播时机事件，不动任何状态（切断死代码结算）
    await this.emitPipelineEvents('pre_attack', config);
    await this.emitPipelineEvents('post_attack', config);
    return {
      attackerId,
      targetId,
      deprecated: true,
      note: 'executeAttack 已退位，结算改走 SkillExecutor v2 树路径',
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
    // ★ §8.9②：结构化 statusEffects 回合末结算（仅 expiry_phase='turn_end'，默认）
    if (this.battle && this.battle.units && typeof this.battle.units.values === 'function') {
      for (const unit of this.battle.units.values()) {
        try { buffManager.tickStatus(unit, 'turn_end'); } catch (_e) { /* 防御：statusEffects 结构异常不影响主流程 */ }
      }
    }
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
