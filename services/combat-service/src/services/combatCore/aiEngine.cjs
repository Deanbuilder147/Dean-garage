/**
 * AI决策引擎核心
 * 负责管理AI单位、回合调度和决策执行
 */

const AI_DIFFICULTY = {
  EASY: 'easy',         // 简单 - 随机决策
  NORMAL: 'normal',     // 普通 - 基础策略
  HARD: 'hard'          // 困难 - 最优策略
};

// AI决策延迟（毫秒）- 模拟人类思考
const AI_THINK_DELAY = {
  [AI_DIFFICULTY.EASY]: 500,
  [AI_DIFFICULTY.NORMAL]: 1000,
  [AI_DIFFICULTY.HARD]: 1500
};

class AIEngine {
  constructor(combatCore, options = {}) {
    this.combatCore = combatCore;
    this.difficulty = options.difficulty || AI_DIFFICULTY.NORMAL;
    this.enabled = options.enabled || false;
    this.aiUnits = new Map(); // unitId -> AI state
    this.listeners = new Map();
  }

  /**
   * 启用AI控制
   */
  enable() {
    this.enabled = true;
  }

  /**
   * 禁用AI控制
   */
  disable() {
    this.enabled = false;
  }

  /**
   * 注册AI单位
   */
  registerAIUnit(unitId, faction) {
    this.aiUnits.set(unitId, {
      unitId,
      faction,
      difficulty: this.difficulty,
      actionsTaken: [],
      lastDecision: null
    });
  }

  /**
   * 注销AI单位
   */
  unregisterAIUnit(unitId) {
    this.aiUnits.delete(unitId);
  }

  /**
   * 检查单位是否为AI控制
   */
  isAIUnit(unitId) {
    return this.aiUnits.has(unitId);
  }

  /**
   * 获取AI单位列表
   */
  getAIUnits() {
    return Array.from(this.aiUnits.values());
  }

  /**
   * 设置难度
   */
  setDifficulty(difficulty) {
    this.difficulty = difficulty;
    // 更新所有AI单位难度
    for (const ai of this.aiUnits.values()) {
      ai.difficulty = difficulty;
    }
  }

  /**
   * 触发事件
   */
  emit(event, data) {
    const callbacks = this.listeners.get(event) || [];
    callbacks.forEach(cb => cb(data));
  }

  /**
   * 监听事件
   */
  on(event, callback) {
    if (!this.listeners.has(event)) {
      this.listeners.set(event, []);
    }
    this.listeners.get(event).push(callback);
  }

  /**
   * AI回合开始
   */
  async onTurnStart(unitId, gameState) {
    if (!this.enabled || !this.isAIUnit(unitId)) {
      return null;
    }

    const ai = this.aiUnits.get(unitId);
    ai.actionsTaken = [];
    ai.lastDecision = null;

    // 模拟思考延迟
    await this.delay(AI_THINK_DELAY[this.difficulty]);

    // 决策
    const decision = await this.makeDecision(unitId, gameState);
    ai.lastDecision = decision;

    return decision;
  }

  /**
   * AI回合结束
   */
  async onTurnEnd(unitId, gameState) {
    if (!this.enabled || !this.isAIUnit(unitId)) {
      return;
    }

    const ai = this.aiUnits.get(unitId);
    this.emit('ai_turn_end', {
      unitId,
      actions: ai.actionsTaken,
      difficulty: ai.difficulty
    });
  }

  /**
   * 执行AI决策
   */
  async executeDecision(decision) {
    const { type, target, params } = decision;

    switch (type) {
      case 'move':
        return await this.executeMove(decision);
      case 'attack':
        return await this.executeAttack(decision);
      case 'skill':
        return await this.executeSkill(decision);
      case 'wait':
        return { type: 'wait', success: true };
      default:
        return { type: 'unknown', success: false, error: 'Unknown decision type' };
    }
  }

  /**
   * 执行移动
   */
  async executeMove(decision) {
    const { unitId, target } = decision;
    try {
      const result = await this.combatCore.executeMove(unitId, target);
      this.recordAction(unitId, 'move', target);
      return { type: 'move', success: true, result };
    } catch (error) {
      return { type: 'move', success: false, error: error.message };
    }
  }

  /**
   * 执行攻击
   */
  async executeAttack(decision) {
    const { unitId, target, weaponIndex } = decision;
    try {
      const result = await this.combatCore.executeAttack(unitId, target, weaponIndex);
      this.recordAction(unitId, 'attack', target);
      return { type: 'attack', success: true, result };
    } catch (error) {
      return { type: 'attack', success: false, error: error.message };
    }
  }

  /**
   * 执行技能
   */
  async executeSkill(decision) {
    const { unitId, skillId, target } = decision;
    try {
      const result = await this.combatCore.executeSkill(unitId, skillId, target);
      this.recordAction(unitId, 'skill', { skillId, target });
      return { type: 'skill', success: true, result };
    } catch (error) {
      return { type: 'skill', success: false, error: error.message };
    }
  }

  /**
   * 记录AI动作
   */
  recordAction(unitId, actionType, target) {
    const ai = this.aiUnits.get(unitId);
    if (ai) {
      ai.actionsTaken.push({
        type: actionType,
        target,
        timestamp: Date.now()
      });
    }
  }

  /**
   * 模拟延迟
   */
  delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * 获取状态摘要
   */
  getState() {
    return {
      enabled: this.enabled,
      difficulty: this.difficulty,
      aiUnitsCount: this.aiUnits.size,
      aiUnits: this.getAIUnits().map(ai => ({
        unitId: ai.unitId,
        faction: ai.faction,
        actionsTaken: ai.actionsTaken.length,
        lastDecision: ai.lastDecision?.type
      }))
    };
  }
}

module.exports = {
  AIEngine,
  AI_DIFFICULTY
};
