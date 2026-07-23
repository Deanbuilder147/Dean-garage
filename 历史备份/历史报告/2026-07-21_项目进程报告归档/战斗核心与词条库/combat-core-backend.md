# 战斗核心后端 (combat-service) 代码快照

> 生成时间：2026-07-20 ｜ 范围：combat-service/src/services（combatResolver.js + combatCore/* 全部 .cjs/.js）

## combatCore/DiceEngine.cjs

```js
/**
 * DiceEngine - 海豹骰子 dicescript 适配层
 * 封装 dicescript VM，提供简化的骰子掷骰和判定 API
 * 默认骰子面数为 6（1d6），与机甲战棋游戏机制一致
 */

const dicescript = require('../../../vendor/dicescript.cjs').ds;

class DiceEngine {
    constructor() {
        this._initVM();
    }

    _initVM() {
        this._vm = dicescript.newVM();
        this._config = dicescript.newConfig();
        this._config.EnableDice = true;
        this._vm.SetConfig(this._config);
    }

    /**
     * 掷骰：执行骰子表达式并直接返回数值
     * @param {string} formula - 骰子表达式，如 "1d6", "2d6", "1d6+3"
     * @returns {number} 掷骰结果
     */
    roll(formula = '1d6') {
        this._vm.Run(formula);
        return this._vm.Ret.Value;
    }

    /**
     * 逐个掷骰：返回每个骰子的具体点数（用于显示）
     * @param {string} formula - 基础骰子表达式，如 "1d6", "2d6"
     * @returns {number[]} 各骰子点数数组
     */
    rollDetails(formula = '1d6') {
        const match = formula.match(/^(\d*)d(\d+)/);
        if (!match) {
            return [this.roll(formula)];
        }

        const count = parseInt(match[1] || '1', 10);
        const faces = parseInt(match[2], 10);
        const rolls = [];

        for (let i = 0; i < count; i++) {
            this._vm.Run(`1d${faces}`);
            rolls.push(this._vm.Ret.Value);
        }
        return rolls;
    }

    /**
     * 判定：掷骰并判断是否满足条件
     * @param {string} formula - 骰子表达式
     * @param {string} operator - 比较运算符: '>=', '<=', '>', '<', '=='
     * @param {number} threshold - 判定阈值
     * @returns {boolean} 判定结果
     */
    check(formula, operator, threshold) {
        const value = this.roll(formula);
        switch (operator) {
            case '>=': return value >= threshold;
            case '<=': return value <= threshold;
            case '>':  return value > threshold;
            case '<':  return value < threshold;
            case '==': return value === threshold;
            default:   return value >= threshold;
        }
    }

    /**
     * 批量掷骰：多次掷同一表达式
     * @param {string} formula - 骰子表达式
     * @param {number} count - 掷骰次数
     * @returns {number[]} 每次掷骰的结果
     */
    rollMultiple(formula, count) {
        const results = [];
        for (let i = 0; i < count; i++) {
            results.push(this.roll(formula));
        }
        return results;
    }

    /**
     * 重置 VM 状态（用于新一回合，换种子等）
     */
    reset() {
        this._initVM();
    }
}

// 导出类和默认单例
const defaultEngine = new DiceEngine();

module.exports = {
    DiceEngine,
    defaultEngine
};
```

## combatCore/aiDifficulty.cjs

```js
/**
 * AI难度分级系统
 * 定义不同难度的AI行为特征
 */

const { AI_DIFFICULTY } = require('./aiEngine.cjs');

/**
 * 难度配置
 */
const DIFFICULTY_CONFIG = {
  [AI_DIFFICULTY.EASY]: {
    name: '简单',
    description: '适合新手，AI行为可预测',
    // 决策延迟（毫秒）
    thinkDelay: 500,
    // 是否使用随机行动
    useRandomness: true,
    // 随机行动概率
    randomChance: 0.3,
    // 是否考虑敌人威胁
    considerThreats: false,
    // 攻击准确率
    accuracy: 0.7,
    // 是否使用技能
    useSkills: false,
    // 移动优化程度（0-1，越高越优）
    moveOptimization: 0.3,
    // 视野范围加成
    visionBonus: 0,
    // 伤害修正（AI造成的伤害倍率）
    damageMultiplier: 0.8,
    // 承受伤害修正（AI受到的伤害倍率）
    receivedDamageMultiplier: 1.2
  },
  [AI_DIFFICULTY.NORMAL]: {
    name: '普通',
    description: '标准难度，AI会做出合理决策',
    thinkDelay: 1000,
    useRandomness: true,
    randomChance: 0.15,
    considerThreats: true,
    accuracy: 0.85,
    useSkills: true,
    moveOptimization: 0.6,
    visionBonus: 1,
    damageMultiplier: 1.0,
    receivedDamageMultiplier: 1.0
  },
  [AI_DIFFICULTY.HARD]: {
    name: '困难',
    description: '高难度挑战，AI会做出最优决策',
    thinkDelay: 1500,
    useRandomness: false,
    randomChance: 0,
    considerThreats: true,
    accuracy: 0.95,
    useSkills: true,
    moveOptimization: 1.0,
    visionBonus: 2,
    damageMultiplier: 1.1,
    receivedDamageMultiplier: 0.9
  }
};

/**
 * 获取难度配置
 */
function getDifficultyConfig(difficulty) {
  return DIFFICULTY_CONFIG[difficulty] || DIFFICULTY_CONFIG[AI_DIFFICULTY.NORMAL];
}

/**
 * 获取所有难度列表
 */
function getAllDifficulties() {
  return Object.entries(DIFFICULTY_CONFIG).map(([key, config]) => ({
    id: key,
    name: config.name,
    description: config.description
  }));
}

/**
 * AI难度代理
 * 根据难度修改AI行为
 */
class AIDifficultyProxy {
  constructor(baseAI, difficulty) {
    this.baseAI = baseAI;
    this.config = getDifficultyConfig(difficulty);
    this.difficulty = difficulty;
  }

  /**
   * 应用随机性
   */
  applyRandomness(originalDecision) {
    if (!this.config.useRandomness) {
      return originalDecision;
    }

    if (Math.random() < this.config.randomChance) {
      // 随机决定是否随机行动
      const randomActions = ['move', 'attack', 'wait'];
      const randomAction = randomActions[Math.floor(Math.random() * randomActions.length)];
      
      return {
        ...originalDecision,
        type: randomAction,
        isRandom: true
      };
    }

    return originalDecision;
  }

  /**
   * 应用攻击准确率
   */
  applyAccuracy(target, gameState) {
    if (Math.random() > this.config.accuracy) {
      // 未命中，选择其他目标
      const unit = gameState.units?.find(u => u.id === target.id);
      if (unit) {
        // 随机偏移
        return {
          ...target,
          missed: true
        };
      }
    }
    return target;
  }

  /**
   * 应用伤害修正
   */
  applyDamage(damage, isReceiving) {
    const multiplier = isReceiving 
      ? this.config.receivedDamageMultiplier 
      : this.config.damageMultiplier;
    return Math.round(damage * multiplier);
  }

  /**
   * 获取视野加成
   */
  getVisionBonus() {
    return this.config.visionBonus;
  }

  /**
   * 获取移动优化程度
   */
  getMoveOptimization() {
    return this.config.moveOptimization;
  }

  /**
   * 是否应使用技能
   */
  shouldUseSkills() {
    return this.config.useSkills;
  }

  /**
   * 获取思考延迟
   */
  getThinkDelay() {
    return this.config.thinkDelay;
  }
}

/**
 * 难度比较
 */
function compareDifficulty(d1, d2) {
  const order = [AI_DIFFICULTY.EASY, AI_DIFFICULTY.NORMAL, AI_DIFFICULTY.HARD];
  return order.indexOf(d1) - order.indexOf(d2);
}

/**
 * 获取下一个难度
 */
function getNextDifficulty(current) {
  const order = [AI_DIFFICULTY.EASY, AI_DIFFICULTY.NORMAL, AI_DIFFICULTY.HARD];
  const idx = order.indexOf(current);
  return order[Math.min(idx + 1, order.length - 1)];
}

module.exports = {
  DIFFICULTY_CONFIG,
  getDifficultyConfig,
  getAllDifficulties,
  AIDifficultyProxy,
  compareDifficulty,
  getNextDifficulty
};
```

## combatCore/aiEngine.cjs

```js
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
```

## combatCore/aiIntegration.cjs

```js
/**
 * AI系统集成模块
 * 将AI引擎、行为树、策略与战斗核心集成
 */

const { AIEngine, AI_DIFFICULTY } = require('./aiEngine.cjs');
const { bt } = require('./behaviorTree.cjs');
const { createStrategy } = require('./aiStrategies.cjs');
const { getDifficultyConfig, AIDifficultyProxy, getAllDifficulties } = require('./aiDifficulty.cjs');

/**
 * AI战斗控制器
 * 管理AI在战斗中的完整生命周期
 */
class AICombatController {
  constructor(combatIntegrator, options = {}) {
    this.combatIntegrator = combatIntegrator;
    this.aiEngine = new AIEngine(combatIntegrator, {
      difficulty: options.difficulty || AI_DIFFICULTY.NORMAL,
      enabled: options.enabled !== false
    });
    this.strategies = new Map();
    this.behaviorTrees = new Map();
    this.difficultyProxy = null;
    this.eventHandlers = new Map();
    this.isRunning = false;
    this.turnQueue = [];
    
    // 初始化难度代理
    this.difficultyProxy = new AIDifficultyProxy(
      this.aiEngine,
      this.aiEngine.difficulty
    );

    // 初始化行为树
    this.initializeBehaviorTrees();

    // 绑定事件
    this.bindEvents();
  }

  /**
   * 初始化行为树
   */
  initializeBehaviorTrees() {
    // 通用AI行为树
    const aiTree = bt.sequence('AI_Turn')
      .addChild(bt.condition('is_ai_unit', async (ctx) => {
        return this.aiEngine.isAIUnit(ctx.unitId);
      }))
      .addChild(bt.sequence('AI_Decision')
        .addChild(bt.action('check_health', async (ctx) => {
          const unit = this.getUnit(ctx.unitId);
          return unit && unit.hp > 0;
        }))
        .addChild(bt.action('make_decision', async (ctx) => {
          const gameState = this.getGameState();
          const strategy = this.getStrategy(ctx.unitId);
          return await strategy.decide(ctx.unitId, gameState);
        }))
        .addChild(bt.action('execute_decision', async (ctx) => {
          const decision = ctx.lastDecision;
          if (!decision) return false;
          
          const result = await this.aiEngine.executeDecision(decision);
          ctx.lastResult = result;
          return result.success;
        }))
      );

    this.behaviorTrees.set('default', bt.tree(aiTree, 'DefaultAI'));

    // 攻击优先行为树
    const aggressiveTree = bt.selector('Aggressive')
      .addChild(bt.sequence('Attack_Target')
        .addChild(bt.condition('has_enemy_in_range', async (ctx) => {
          const gameState = this.getGameState();
          const unit = this.getUnit(ctx.unitId);
          if (!unit) return false;
          const enemies = this.findEnemies(unit, gameState);
          return enemies.some(e => this.isInRange(unit, e, gameState));
        }))
        .addChild(bt.action('attack_nearest', async (ctx) => {
          const decision = await this.aggressiveAttackDecision(ctx.unitId);
          if (decision) {
            ctx.lastDecision = decision;
            return await this.aiEngine.executeDecision(decision);
          }
          return false;
        }))
      )
      .addChild(bt.action('move_to_enemy', async (ctx) => {
        const decision = await this.aggressiveMoveDecision(ctx.unitId);
        if (decision) {
          ctx.lastDecision = decision;
          return await this.aiEngine.executeDecision(decision);
        }
        return false;
      }));

    this.behaviorTrees.set('aggressive', bt.tree(aggressiveTree, 'AggressiveAI'));
  }

  /**
   * 绑定事件
   */
  bindEvents() {
    // AI回合开始事件
    this.aiEngine.on('ai_turn_start', (data) => {
      this.emit('ai_turn_start', data);
    });

    // AI回合结束事件
    this.aiEngine.on('ai_turn_end', (data) => {
      this.emit('ai_turn_end', data);
    });

    // AI决策事件
    this.aiEngine.on('ai_decision', (data) => {
      this.emit('ai_decision', data);
    });
  }

  /**
   * 发射事件
   */
  emit(event, data) {
    const handlers = this.eventHandlers.get(event) || [];
    handlers.forEach(h => h(data));
  }

  /**
   * 监听事件
   */
  on(event, handler) {
    if (!this.eventHandlers.has(event)) {
      this.eventHandlers.set(event, []);
    }
    this.eventHandlers.get(event).push(handler);
  }

  /**
   * 获取单元
   */
  getUnit(unitId) {
    return this.combatIntegrator.getUnitStatus?.(unitId);
  }

  /**
   * 获取游戏状态
   */
  getGameState() {
    const battle = this.combatIntegrator.getBattle?.();
    if (!battle) return { units: [] };

    return {
      units: battle.units || [],
      battlefield: battle.battlefield,
      round: battle.round,
      turn: battle.turn
    };
  }

  /**
   * 查找敌人
   */
  findEnemies(unit, gameState) {
    return (gameState.units || []).filter(u => 
      u.faction !== unit.faction && u.hp > 0
    );
  }

  /**
   * 检查是否在攻击范围内
   */
  isInRange(attacker, defender, gameState) {
    const range = attacker.attack_range || 1;
    const dist = this.getDistance(attacker.position, defender.position);
    return dist <= range;
  }

  /**
   * 计算距离
   */
  getDistance(posA, posB) {
    return Math.abs(posA.q - posB.q) + Math.abs(posA.r - posB.r);
  }

  /**
   * 获取策略
   */
  getStrategy(unitId) {
    if (!this.strategies.has(unitId)) {
      this.strategies.set(unitId, createStrategy(this.aiEngine, this.aiEngine.difficulty));
    }
    return this.strategies.get(unitId);
  }

  /**
   * 攻击优先决策
   */
  async aggressiveAttackDecision(unitId) {
    const gameState = this.getGameState();
    const unit = this.getUnit(unitId);
    if (!unit) return null;

    const enemies = this.findEnemies(unit, gameState);
    const inRange = enemies.filter(e => this.isInRange(unit, e, gameState));

    if (inRange.length > 0) {
      // 选择HP最低的目标
      const target = inRange.reduce((min, e) => e.hp < min.hp ? e : min, inRange[0]);
      return {
        type: 'attack',
        unitId,
        target,
        weaponIndex: 0
      };
    }
    return null;
  }

  /**
   * 攻击优先移动决策
   */
  async aggressiveMoveDecision(unitId) {
    const gameState = this.getGameState();
    const unit = this.getUnit(unitId);
    if (!unit) return null;

    const enemies = this.findEnemies(unit, gameState);
    if (enemies.length === 0) return null;

    const nearest = enemies.reduce((min, e) => 
      this.getDistance(unit.position, e.position) < this.getDistance(unit.position, min.position) ? e : min
    , enemies[0]);

    const moveRange = unit.mobility || 3;
    const dist = this.getDistance(unit.position, nearest.position);

    if (dist <= moveRange) {
      // 可以到达
      const dq = nearest.position.q - unit.position.q;
      const dr = nearest.position.r - unit.position.r;
      return {
        type: 'move',
        unitId,
        target: {
          q: unit.position.q + Math.sign(dq) * Math.min(moveRange, dist),
          r: unit.position.r + Math.sign(dr) * Math.min(moveRange, dist)
        }
      };
    }
    return null;
  }

  /**
   * 注册AI单位
   */
  registerAIUnit(unitId, faction) {
    this.aiEngine.registerAIUnit(unitId, faction);
    this.emit('ai_unit_registered', { unitId, faction });
  }

  /**
   * 注销AI单位
   */
  unregisterAIUnit(unitId) {
    this.aiEngine.unregisterAIUnit(unitId);
    this.strategies.delete(unitId);
    this.emit('ai_unit_unregistered', { unitId });
  }

  /**
   * 设置难度
   */
  setDifficulty(difficulty) {
    this.aiEngine.setDifficulty(difficulty);
    this.difficultyProxy = new AIDifficultyProxy(this.aiEngine, difficulty);
    this.emit('difficulty_changed', { difficulty });
  }

  /**
   * 启用AI
   */
  enable() {
    this.aiEngine.enable();
    this.isRunning = true;
    this.emit('ai_enabled', {});
  }

  /**
   * 禁用AI
   */
  disable() {
    this.aiEngine.disable();
    this.isRunning = false;
    this.emit('ai_disabled', {});
  }

  /**
   * 执行AI回合
   */
  async executeAITurn(unitId) {
    if (!this.aiEngine.enabled || !this.aiEngine.isAIUnit(unitId)) {
      return null;
    }

    this.emit('ai_turn_start', { unitId });

    // 思考延迟
    await this.delay(this.difficultyProxy.getThinkDelay());

    // 获取行为树
    const tree = this.behaviorTrees.get('aggressive') || this.behaviorTrees.get('default');
    
    // 执行行为树
    const context = { unitId, lastDecision: null, lastResult: null };
    await tree.tick(context);

    this.emit('ai_turn_end', { unitId, decision: context.lastDecision, result: context.lastResult });

    return context.lastDecision;
  }

  /**
   * 延迟
   */
  delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * 获取状态
   */
  getState() {
    return {
      enabled: this.aiEngine.enabled,
      difficulty: this.aiEngine.difficulty,
      difficultyConfig: getDifficultyConfig(this.aiEngine.difficulty),
      isRunning: this.isRunning,
      aiUnitsCount: this.aiEngine.aiUnits.size,
      aiUnits: this.aiEngine.getAIUnits().map(u => ({
        unitId: u.unitId,
        faction: u.faction,
        actionsTaken: u.actionsTaken.length
      }))
    };
  }

  /**
   * 获取所有难度列表
   */
  getAvailableDifficulties() {
    return getAllDifficulties();
  }
}

module.exports = {
  AICombatController,
  AIEngine,
  AI_DIFFICULTY
};
```

## combatCore/aiStrategies.cjs

```js
/**
 * AI策略系统
 * 实现各种AI决策算法
 */

const { AI_DIFFICULTY } = require('./aiEngine.cjs');

// 六边形网格距离计算
function hexDistance(a, b) {
  return (Math.abs(a.q - b.q) + Math.abs(a.r - b.r) + Math.abs((a.q + a.r) - (b.q + b.r))) / 2;
}

// 计算两点的曼哈顿距离（简化版）
function manhattanDistance(a, b) {
  return Math.abs(a.q - b.q) + Math.abs(a.r - b.r);
}

/**
 * AI策略基类
 */
class AIStrategy {
  constructor(aiEngine, difficulty) {
    this.aiEngine = aiEngine;
    this.difficulty = difficulty;
  }

  async decide(unitId, gameState) {
    throw new Error('Must be implemented by subclass');
  }
}

/**
 * 攻击型AI策略
 * 优先攻击敌人
 */
class AggressiveStrategy extends AIStrategy {
  async decide(unitId, gameState) {
    const unit = this.getUnit(unitId, gameState);
    if (!unit) return { type: 'wait' };

    const enemies = this.findEnemies(unit, gameState);
    const inRange = this.findEnemiesInRange(unit, enemies, gameState);

    // 如果有敌人可攻击
    if (inRange.length > 0) {
      const target = this.selectBestTarget(inRange, unit);
      return {
        type: 'attack',
        unitId,
        target,
        weaponIndex: 0
      };
    }

    // 寻找最近敌人并移动
    if (enemies.length > 0) {
      const nearest = this.findNearestEnemy(unit, enemies);
      const path = this.findPathToTarget(unit, nearest, gameState);
      if (path.length > 0) {
        return {
          type: 'move',
          unitId,
          target: path[0]
        };
      }
    }

    return { type: 'wait' };
  }

  getUnit(unitId, gameState) {
    return gameState.units?.find(u => u.id === unitId);
  }

  findEnemies(unit, gameState) {
    return (gameState.units || []).filter(u => u.faction !== unit.faction && u.hp > 0);
  }

  findEnemiesInRange(unit, enemies, gameState) {
    const range = unit.attack_range || 1;
    return enemies.filter(enemy => {
      const dist = manhattanDistance(unit.position, enemy.position);
      return dist <= range;
    });
  }

  selectBestTarget(enemies, attacker) {
    // 选择HP最低的目标（更容易击杀）
    return enemies.reduce((best, enemy) => {
      if (!best || enemy.hp < best.hp) return enemy;
      return best;
    }, null);
  }

  findNearestEnemy(unit, enemies) {
    return enemies.reduce((nearest, enemy) => {
      if (!nearest) return enemy;
      const distCurrent = manhattanDistance(unit.position, enemy.position);
      const distNearest = manhattanDistance(unit.position, nearest.position);
      return distCurrent < distNearest ? enemy : nearest;
    }, null);
  }

  findPathToTarget(unit, target, gameState) {
    // 简化的A*寻路
    const start = unit.position;
    const moveRange = unit.mobility || 3;
    const dist = manhattanDistance(start, target.position);
    
    if (dist <= moveRange) {
      // 直接移动到目标附近
      const dq = target.position.q - start.q;
      const dr = target.position.r - start.r;
      const stepQ = dq !== 0 ? Math.sign(dq) : 0;
      const stepR = dr !== 0 ? Math.sign(dr) : 0;
      return [{ q: start.q + stepQ, r: start.r + stepR }];
    }
    
    // 移动一定步数
    const dq = target.position.q - start.q;
    const dr = target.position.r - start.r;
    const stepQ = dq !== 0 ? Math.sign(dq) : 0;
    const stepR = dr !== 0 ? Math.sign(dr) : 0;
    const steps = Math.min(moveRange, Math.max(Math.abs(dq), Math.abs(dr)));
    return [{ q: start.q + stepQ * steps, r: start.r + stepR * steps }];
  }
}

/**
 * 防守型AI策略
 * 优先保护自己
 */
class DefensiveStrategy extends AIStrategy {
  async decide(unitId, gameState) {
    const unit = this.getUnit(unitId, gameState);
    if (!unit) return { type: 'wait' };

    // 如果HP低，优先撤退
    if (unit.hp < (unit.max_hp || 100) * 0.3) {
      const safeSpot = this.findSafeSpot(unit, gameState);
      if (safeSpot) {
        return { type: 'move', unitId, target: safeSpot };
      }
    }

    const enemies = this.findEnemies(unit, gameState);
    const inRange = this.findEnemiesInRange(unit, enemies, gameState);

    // 只有安全时才攻击
    if (inRange.length > 0 && unit.hp > (unit.max_hp || 100) * 0.5) {
      const target = this.selectLowestHP(inRange);
      return { type: 'attack', unitId, target, weaponIndex: 0 };
    }

    // 保持距离
    const tooClose = enemies.filter(e => manhattanDistance(unit.position, e.position) < 2);
    if (tooClose.length > 0) {
      const away = this.moveAwayFrom(unit, tooClose);
      if (away) {
        return { type: 'move', unitId, target: away };
      }
    }

    return { type: 'wait' };
  }

  getUnit(unitId, gameState) {
    return gameState.units?.find(u => u.id === unitId);
  }

  findEnemies(unit, gameState) {
    return (gameState.units || []).filter(u => u.faction !== unit.faction && u.hp > 0);
  }

  findEnemiesInRange(unit, enemies, gameState) {
    const range = unit.attack_range || 1;
    return enemies.filter(e => manhattanDistance(unit.position, e.position) <= range);
  }

  selectLowestHP(enemies) {
    return enemies.reduce((min, e) => e.hp < min.hp ? e : min, enemies[0]);
  }

  findSafeSpot(unit, gameState) {
    const allies = (gameState.units || []).filter(u => u.faction === unit.faction && u.id !== unit.id);
    
    // 移动到友军附近
    for (const ally of allies) {
      const dist = manhattanDistance(unit.position, ally.position);
      const moveRange = unit.mobility || 3;
      if (dist <= moveRange) {
        return { q: ally.position.q, r: ally.position.r };
      }
    }
    return null;
  }

  moveAwayFrom(unit, threats) {
    const threat = threats[0];
    const dq = unit.position.q - threat.position.q;
    const dr = unit.position.r - threat.position.r;
    const stepQ = dq !== 0 ? Math.sign(dq) : 0;
    const stepR = dr !== 0 ? Math.sign(dr) : 0;
    return { q: unit.position.q + stepQ, r: unit.position.r + stepR };
  }
}

/**
 * 平衡型AI策略
 * 攻防兼备
 */
class BalancedStrategy extends AIStrategy {
  async decide(unitId, gameState) {
    const unit = this.getUnit(unitId, gameState);
    if (!unit) return { type: 'wait' };

    const enemies = this.findEnemies(unit, gameState);
    const inRange = this.findEnemiesInRange(unit, enemies, gameState);

    // 优先攻击
    if (inRange.length > 0) {
      const target = this.selectBalancedTarget(inRange, unit);
      return { type: 'attack', unitId, target, weaponIndex: 0 };
    }

    // 寻找有价值的移动
    const target = this.findBestMoveTarget(unit, enemies, gameState);
    if (target) {
      return { type: 'move', unitId, target };
    }

    return { type: 'wait' };
  }

  getUnit(unitId, gameState) {
    return gameState.units?.find(u => u.id === unitId);
  }

  findEnemies(unit, gameState) {
    return (gameState.units || []).filter(u => u.faction !== unit.faction && u.hp > 0);
  }

  findEnemiesInRange(unit, enemies, gameState) {
    const range = unit.attack_range || 1;
    return enemies.filter(e => manhattanDistance(unit.position, e.position) <= range);
  }

  selectBalancedTarget(enemies, attacker) {
    // 优先攻击低HP目标，但也考虑自己的伤害
    return enemies.reduce((best, enemy) => {
      if (!best) return enemy;
      const scoreBest = best.hp / (attacker.attack || 10);
      const scoreEnemy = enemy.hp / (attacker.attack || 10);
      return scoreEnemy < scoreBest ? enemy : best;
    }, null);
  }

  findBestMoveTarget(unit, enemies, gameState) {
    const moveRange = unit.mobility || 3;
    const attackRange = unit.attack_range || 1;
    
    // 找到可以攻击到敌人的最近位置
    let bestTarget = null;
    let bestScore = Infinity;

    for (const enemy of enemies) {
      const dist = manhattanDistance(unit.position, enemy.position);
      if (dist <= moveRange + attackRange) {
        const movesNeeded = dist - attackRange;
        if (movesNeeded >= 0 && movesNeeded < bestScore) {
          bestScore = movesNeeded;
          const stepQ = enemy.position.q - unit.position.q;
          const stepR = enemy.position.r - unit.position.r;
          const sQ = stepQ !== 0 ? Math.sign(stepQ) : 0;
          const sR = stepR !== 0 ? Math.sign(stepR) : 0;
          bestTarget = { 
            q: unit.position.q + sQ * Math.min(moveRange, dist),
            r: unit.position.r + sR * Math.min(moveRange, dist)
          };
        }
      }
    }

    return bestTarget;
  }
}

/**
 * 策略工厂
 */
const STRATEGIES = {
  [AI_DIFFICULTY.EASY]: AggressiveStrategy,
  [AI_DIFFICULTY.NORMAL]: BalancedStrategy,
  [AI_DIFFICULTY.HARD]: BalancedStrategy
};

function createStrategy(aiEngine, difficulty) {
  const StrategyClass = STRATEGIES[difficulty] || BalancedStrategy;
  return new StrategyClass(aiEngine, difficulty);
}

module.exports = {
  AIStrategy,
  AggressiveStrategy,
  DefensiveStrategy,
  BalancedStrategy,
  createStrategy,
  hexDistance,
  manhattanDistance
};
```

## combatCore/behaviorTree.cjs

```js
/**
 * 行为树系统
 * 定义AI决策逻辑的树形结构
 */

// 节点类型
const NODE_TYPE = {
  SELECTOR: 'selector',      // 选择器（返回成功或运行中）
  SEQUENCE: 'sequence',      // 序列器（全部成功才成功）
  PARALLEL: 'parallel',      // 并行（同时执行多个）
  CONDITION: 'condition',    // 条件检查
  ACTION: 'action'           // 动作执行
};

// 节点状态
const NODE_STATUS = {
  SUCCESS: 'success',
  FAILURE: 'failure',
  RUNNING: 'running'
};

/**
 * 基础节点类
 */
class BTNode {
  constructor(name, type) {
    this.name = name;
    this.type = type;
    this.status = null;
    this.children = [];
  }

  addChild(node) {
    this.children.push(node);
    return this;
  }

  async execute(context) {
    throw new Error('Must be implemented by subclass');
  }

  reset() {
    this.status = null;
    for (const child of this.children) {
      child.reset();
    }
  }
}

/**
 * 选择器节点
 * 按顺序执行子节点，直到某个成功
 */
class Selector extends BTNode {
  constructor(name) {
    super(name, NODE_TYPE.SELECTOR);
  }

  async execute(context) {
    for (const child of this.children) {
      const result = await child.execute(context);
      if (result === NODE_STATUS.SUCCESS) {
        this.status = NODE_STATUS.SUCCESS;
        return NODE_STATUS.SUCCESS;
      }
      if (result === NODE_STATUS.RUNNING) {
        this.status = NODE_STATUS.RUNNING;
        return NODE_STATUS.RUNNING;
      }
    }
    this.status = NODE_STATUS.FAILURE;
    return NODE_STATUS.FAILURE;
  }
}

/**
 * 序列器节点
 * 按顺序执行子节点，必须全部成功
 */
class Sequence extends BTNode {
  constructor(name) {
    super(name, NODE_TYPE.SEQUENCE);
  }

  async execute(context) {
    for (const child of this.children) {
      const result = await child.execute(context);
      if (result === NODE_STATUS.FAILURE) {
        this.status = NODE_STATUS.FAILURE;
        return NODE_STATUS.FAILURE;
      }
      if (result === NODE_STATUS.RUNNING) {
        this.status = NODE_STATUS.RUNNING;
        return NODE_STATUS.RUNNING;
      }
    }
    this.status = NODE_STATUS.SUCCESS;
    return NODE_STATUS.SUCCESS;
  }
}

/**
 * 条件节点
 * 检查条件是否满足
 */
class Condition extends BTNode {
  constructor(name, conditionFn) {
    super(name, NODE_TYPE.CONDITION);
    this.conditionFn = conditionFn;
  }

  async execute(context) {
    try {
      const result = await this.conditionFn(context);
      this.status = result ? NODE_STATUS.SUCCESS : NODE_STATUS.FAILURE;
      return this.status;
    } catch (error) {
      console.error(`Condition ${this.name} error:`, error);
      this.status = NODE_STATUS.FAILURE;
      return NODE_STATUS.FAILURE;
    }
  }
}

/**
 * 动作节点
 * 执行具体动作
 */
class Action extends BTNode {
  constructor(name, actionFn) {
    super(name, NODE_TYPE.ACTION);
    this.actionFn = actionFn;
  }

  async execute(context) {
    try {
      const result = await this.actionFn(context);
      this.status = result ? NODE_STATUS.SUCCESS : NODE_STATUS.FAILURE;
      return this.status;
    } catch (error) {
      console.error(`Action ${this.name} error:`, error);
      this.status = NODE_STATUS.FAILURE;
      return NODE_STATUS.FAILURE;
    }
  }
}

/**
 * 优先选择器
 * 根据优先级选择子节点执行
 */
class PrioritySelector extends BTNode {
  constructor(name, options = {}) {
    super(name, NODE_TYPE.SELECTOR);
    this.priorities = options.priorities || [];
  }

  async execute(context) {
    const sortedChildren = [...this.children].sort((a, b) => {
      const pA = this.priorities[this.children.indexOf(a)] || 0;
      const pB = this.priorities[this.children.indexOf(b)] || 0;
      return pB - pA;
    });

    for (const child of sortedChildren) {
      const result = await child.execute(context);
      if (result === NODE_STATUS.SUCCESS) {
        this.status = NODE_STATUS.SUCCESS;
        return NODE_STATUS.SUCCESS;
      }
      if (result === NODE_STATUS.RUNNING) {
        this.status = NODE_STATUS.RUNNING;
        return NODE_STATUS.RUNNING;
      }
    }
    this.status = NODE_STATUS.FAILURE;
    return NODE_STATUS.FAILURE;
  }
}

/**
 * 行为树
 */
class BehaviorTree {
  constructor(root, name = 'Root') {
    this.root = root;
    this.name = name;
  }

  async tick(context) {
    return await this.root.execute(context);
  }

  reset() {
    this.root.reset();
  }
}

// 工厂函数
const bt = {
  selector: (name) => new Selector(name),
  sequence: (name) => new Sequence(name),
  condition: (name, fn) => new Condition(name, fn),
  action: (name, fn) => new Action(name, fn),
  prioritySelector: (name, priorities) => new PrioritySelector(name, { priorities }),
  tree: (root, name) => new BehaviorTree(root, name)
};

module.exports = {
  bt,
  NODE_TYPE,
  NODE_STATUS,
  Selector,
  Sequence,
  Condition,
  Action,
  PrioritySelector,
  BehaviorTree
};
```

## combatCore/branchEvaluator.cjs

```js
'use strict';
/**
 * branchEvaluator.cjs — 通用投骰多分支解析器（方案 Step 4 核心）
 *
 * 设计目标：彻底废弃硬编码分支判断（如历史 sniper/counter 写死常量），
 * 由配置中的 dice_branches 驱动：
 *   - 词条 has_dice=true 时，按 dice_type 掷出 roll；
 *   - 遍历所有 dice_branches，命中「点数集合 points」的判定分支全部收集；
 *   - 按 6 项核心动作词（damage/damage_bonus/heal/apply_status/mobility_mod/accuracy_mod）
 *     严格顺序执行每个命中分支下的全部《判定效果》。
 *
 * points 支持：离散点数 number（如 2）、区间 [min,max]、或二者数组并存。
 * 命中规则：roll 命中任一 points 条目即视为该分支命中（多分支可同时命中）。
 */

function rollDice(diceType = 6) {
  const faces = Number(diceType) > 0 ? Number(diceType) : 6;
  return Math.floor(Math.random() * faces) + 1;
}

// 单个点数条目是否命中 roll：number 精确 / [min,max] 区间
function pointMatches(point, roll) {
  if (point == null) return false;
  if (typeof point === 'number') return point === roll;
  if (Array.isArray(point)) {
    const min = Math.min(point[0], point[1]);
    const max = Math.max(point[0], point[1]);
    return roll >= min && roll <= max;
  }
  if (typeof point === 'object') {
    if (point.kind === 'range') {
      const min = Math.min(point.min, point.max);
      const max = Math.max(point.min, point.max);
      return roll >= min && roll <= max;
    }
    if (point.kind === 'exact') return point.value === roll;
  }
  return false;
}

// 分支是否命中（points 任一命中即命中）
function branchMatches(branch, roll) {
  const points = Array.isArray(branch.points) ? branch.points : [];
  return points.some((p) => pointMatches(p, roll));
}

/**
 * 遍历 dice_branches，返回所有命中分支（保持顺序）。
 * @returns Array<{ branchIndex, points, effects }>
 */
function evaluateBranches(diceBranches, roll) {
  if (!Array.isArray(diceBranches)) return [];
  const hits = [];
  diceBranches.forEach((b, i) => {
    if (b && branchMatches(b, roll)) {
      hits.push({
        branchIndex: i,
        points: b.points,
        effects: Array.isArray(b.effects) ? b.effects : []
      });
    }
  });
  return hits;
}

// 创建效果累加上下文
function newEffectContext(base = {}) {
  return Object.assign(
    {
      damage: 0, // 直伤（设定，覆盖）
      bonus: 0, // 追加伤害（累加）
      heal: 0, // 治疗
      accuracyMod: 0, // 命中修正
      mobilityMod: 0, // 机动修正
      statuses: [], // 收集 { status, target }
      log: []
    },
    base
  );
}

/**
 * 按 6 项动作词顺序执行 effects，累加进 ctx。
 * effect: { action, value, status?, target? }
 */
function applyBranchEffects(effects, ctx) {
  if (!Array.isArray(effects) || !ctx) return ctx;
  for (const e of effects) {
    if (!e) continue;
    const v = Number(e.value) || 0;
    switch (e.action) {
      case 'damage':
        ctx.damage = v; // 设定（覆盖）
        ctx.log.push(`直伤=${v}`);
        break;
      case 'damage_bonus':
        ctx.bonus += v;
        ctx.log.push(`追加伤害+${v}`);
        break;
      case 'heal':
        ctx.heal += v;
        ctx.log.push(`治疗+${v}`);
        break;
      case 'apply_status':
        ctx.statuses.push({ status: e.status || e.value, target: e.target || 'enemy' });
        ctx.log.push(`施加状态=${e.status || e.value}`);
        break;
      case 'mobility_mod':
        ctx.mobilityMod += v;
        ctx.log.push(`机动修正${v >= 0 ? '+' : ''}${v}`);
        break;
      case 'accuracy_mod':
        ctx.accuracyMod += v;
        ctx.log.push(`命中修正${v >= 0 ? '+' : ''}${v}`);
        break;
      default:
        ctx.log.push(`未知动作=${e.action}`);
    }
  }
  return ctx;
}

module.exports = {
  rollDice,
  pointMatches,
  branchMatches,
  evaluateBranches,
  newEffectContext,
  applyBranchEffects
};
```

## combatCore/buffManager.cjs

```js
/**
 * Buff管理器 - BuffManager
 * 负责处理战斗中的临时增益效果
 */

class BuffManager {
  
  /**
   * Buff类型枚举
   */
  static BUFF_TYPES = {
    ATTACK: 'attack_buff',
    DEFENSE: 'defense_buff',
    MOBILITY: 'mobility_buff'
  };

  /**
   * 获取单位的攻击加成
   * @param {Object} unit - 单位
   * @returns {number} 攻击加成值
   */
  static getAttackBonus(unit) {
    return unit.attack_buff || 0;
  }

  /**
   * 获取单位的防御加成
   * @param {Object} unit - 单位
   * @returns {number} 防御加成值
   */
  static getDefenseBonus(unit) {
    return unit.defense_buff || 0;
  }

  /**
   * 获取单位的机动加成
   * @param {Object} unit - 单位
   * @returns {number} 机动加成值
   */
  static getMobilityBonus(unit) {
    return unit.mobility_buff || 0;
  }

  /**
   * 获取单位的所有有效Buff
   * @param {Object} unit - 单位
   * @returns {Object[]} Buff列表
   */
  static getActiveBuffs(unit) {
    const buffs = [];

    if (unit.attack_buff) {
      buffs.push({
        type: this.BUFF_TYPES.ATTACK,
        value: unit.attack_buff,
        duration: unit.attack_buff_turns || 0
      });
    }

    if (unit.defense_buff) {
      buffs.push({
        type: this.BUFF_TYPES.DEFENSE,
        value: unit.defense_buff,
        duration: unit.defense_buff_turns || 0
      });
    }

    if (unit.mobility_buff) {
      buffs.push({
        type: this.BUFF_TYPES.MOBILITY,
        value: unit.mobility_buff,
        duration: unit.mobility_buff_turns || 0
      });
    }

    return buffs;
  }

  /**
   * 应用Buff到单位
   * @param {Object} unit - 单位
   * @param {string} buffType - Buff类型
   * @param {number} value - Buff值
   * @param {number} duration - 持续回合
   * @returns {Object} 应用结果
   */
  static applyBuff(unit, buffType, value, duration) {
    const result = {
      type: buffType,
      value: value,
      duration: duration,
      previousValue: 0
    };

    switch (buffType) {
      case this.BUFF_TYPES.ATTACK:
        result.previousValue = unit.attack_buff || 0;
        unit.attack_buff = value;
        unit.attack_buff_turns = duration;
        break;

      case this.BUFF_TYPES.DEFENSE:
        result.previousValue = unit.defense_buff || 0;
        unit.defense_buff = value;
        unit.defense_buff_turns = duration;
        break;

      case this.BUFF_TYPES.MOBILITY:
        result.previousValue = unit.mobility_buff || 0;
        unit.mobility_buff = value;
        unit.mobility_buff_turns = duration;
        break;

      default:
        throw new Error(`未知的Buff类型: ${buffType}`);
    }

    return result;
  }

  /**
   * 移除Buff
   * @param {Object} unit - 单位
   * @param {string} buffType - Buff类型
   * @returns {Object} 移除结果
   */
  static removeBuff(unit, buffType) {
    const result = { type: buffType, removed: false };

    switch (buffType) {
      case this.BUFF_TYPES.ATTACK:
        if (unit.attack_buff) {
          result.removed = true;
          result.value = unit.attack_buff;
          unit.attack_buff = 0;
          unit.attack_buff_turns = 0;
        }
        break;

      case this.BUFF_TYPES.DEFENSE:
        if (unit.defense_buff) {
          result.removed = true;
          result.value = unit.defense_buff;
          unit.defense_buff = 0;
          unit.defense_buff_turns = 0;
        }
        break;

      case this.BUFF_TYPES.MOBILITY:
        if (unit.mobility_buff) {
          result.removed = true;
          result.value = unit.mobility_buff;
          unit.mobility_buff = 0;
          unit.mobility_buff_turns = 0;
        }
        break;
    }

    return result;
  }

  /**
   * 回合开始时减少Buff持续时间
   * @param {Object} unit - 单位
   * @returns {Object[]} 过期移除的Buff列表
   */
  static tickBuffs(unit) {
    const expired = [];

    // 攻击Buff
    if (unit.attack_buff_turns > 0) {
      unit.attack_buff_turns--;
      if (unit.attack_buff_turns <= 0) {
        expired.push({ type: this.BUFF_TYPES.ATTACK, value: unit.attack_buff });
        unit.attack_buff = 0;
      }
    }

    // 防御Buff
    if (unit.defense_buff_turns > 0) {
      unit.defense_buff_turns--;
      if (unit.defense_buff_turns <= 0) {
        expired.push({ type: this.BUFF_TYPES.DEFENSE, value: unit.defense_buff });
        unit.defense_buff = 0;
      }
    }

    // 机动Buff
    if (unit.mobility_buff_turns > 0) {
      unit.mobility_buff_turns--;
      if (unit.mobility_buff_turns <= 0) {
        expired.push({ type: this.BUFF_TYPES.MOBILITY, value: unit.mobility_buff });
        unit.mobility_buff = 0;
      }
    }

    return expired;
  }

  /**
   * 应用阵营特有Buff效果
   * @param {Object} unit - 单位
   * @param {string} faction - 阵营
   * @param {string} effect - 效果名称
   * @param {number} value - 效果值
   * @param {number} duration - 持续回合
   * @returns {Object} 应用结果
   */
  static applyFactionBuff(unit, faction, effect, value, duration) {
    const result = {
      faction: faction,
      effect: effect,
      value: value,
      duration: duration
    };

    switch (effect) {
      case 'defense':
        result.applied = this.applyBuff(unit, this.BUFF_TYPES.DEFENSE, value, duration);
        break;
      case 'attack':
        result.applied = this.applyBuff(unit, this.BUFF_TYPES.ATTACK, value, duration);
        break;
      case 'mobility':
        result.applied = this.applyBuff(unit, this.BUFF_TYPES.MOBILITY, value, duration);
        break;
      default:
        result.error = `未知效果: ${effect}`;
    }

    return result;
  }

  /**
   * 检查单位是否有有效Buff
   * @param {Object} unit - 单位
   * @returns {boolean}
   */
  static hasActiveBuffs(unit) {
    return (unit.attack_buff || 0) > 0 ||
           (unit.defense_buff || 0) > 0 ||
           (unit.mobility_buff || 0) > 0;
  }

  /**
   * 清除单位所有Buff
   * @param {Object} unit - 单位
   * @returns {Object[]} 清除的Buff列表
   */
  static clearAllBuffs(unit) {
    const cleared = [];

    if (unit.attack_buff) {
      cleared.push({ type: this.BUFF_TYPES.ATTACK, value: unit.attack_buff });
      unit.attack_buff = 0;
      unit.attack_buff_turns = 0;
    }

    if (unit.defense_buff) {
      cleared.push({ type: this.BUFF_TYPES.DEFENSE, value: unit.defense_buff });
      unit.defense_buff = 0;
      unit.defense_buff_turns = 0;
    }

    if (unit.mobility_buff) {
      cleared.push({ type: this.BUFF_TYPES.MOBILITY, value: unit.mobility_buff });
      unit.mobility_buff = 0;
      unit.mobility_buff_turns = 0;
    }

    return cleared;
  }
}

module.exports = BuffManager;
```

## combatCore/combatIntegrator.cjs

```js
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
```

## combatCore/conditionEvaluator.cjs

```js
/**
 * ConditionEvaluator - 条件评估器 (Phase 14 复合条件链激活)
 * 
 * 职责:
 * 1. 评估词条触发条件（支持 structured {required/any/not} 与 flat 平铺两种格式）
 * 2. 支持复杂条件组合 (AND/OR/NOT)
 * 3. 提供预置条件检查器（含 requires_hp_below / requires_unmoved / target_on_terrain）
 */

class ConditionEvaluator {
  constructor() {
    // 预置条件检查器
    this.checkers = {
      // 攻击相关
      attack_type: (ctx, value) => ctx.attackType === value,
      damage_dealt: (ctx, value, op = '>=') => this.compare(ctx.damageDealt, value, op),
      target_hp: (ctx, value, op = '<=') => this.compare(ctx.target?.hp, value, op),
      target_weapon_attack: (ctx, value, op = '>') => {
        const weaponAtk = ctx.target?.left_hand_melee || ctx.target?.left_hand_shooting || 0;
        return this.compare(weaponAtk, value, op);
      },
      
      // 行动相关
      move_action_used: (ctx, value) => ctx.moveActionUsed === value,
      
      // 阵营相关
      target_faction: (ctx, value) => {
        if (value === 'enemy') return ctx.target?.faction !== ctx.attacker?.faction;
        if (value === 'ally') return ctx.target?.faction === ctx.attacker?.faction;
        return ctx.target?.faction === value;
      },
      moving_unit_faction: (ctx, value) => ctx.movingUnit?.faction === value,
      defending_units_faction: (ctx, value) => ctx.defendingUnits?.[0]?.faction === value,
      
      // 状态相关
      has_armor: (ctx, value) => {
        const hasArmor = ctx.defender?.right_hand_type === 'armor' && 
                        (ctx.defender?.right_hand_durability || 0) > 0;
        return hasArmor === value;
      },
      armor_resistance_type: (ctx, value) => ctx.defender?.right_hand_resistance === value,
      attack_damage_type: (ctx, value) => ctx.damageType === value,
      
      // 位置相关
      ally_in_line_of_sight: (ctx, value) => {
        if (!ctx.allyUnits) return false;
        return ctx.allyUnits.some(u => u.inLineOfSight === value);
      },
      blocking_units_count: (ctx, value, op = '>=') => {
        const count = ctx.blockingUnits?.length || 0;
        return this.compare(count, value, op);
      },
      blocking_units_aligned: (ctx, value) => ctx.blockingFormation === value,
      
      // Buff相关
      has_buff: (ctx, value) => {
        const buffs = ctx.unit?.buffs || [];
        return buffs.some(b => b.type === value && b.remaining > 0);
      },
      
      // HP相关
      hp_percentage: (ctx, value, op = '<=') => {
        const maxHp = ctx.unit?.maxHp || 100;
        const percentage = (ctx.unit?.hp / maxHp) * 100;
        return this.compare(percentage, value, op);
      },
      
      // ========== Phase 14: 新增复合条件检查器 ==========

      /**
       * requires_hp_below: 单位 HP 低于指定值
       * 用途: 残血技能触发条件
       * 示例: { requires_hp_below: 50 } → unit.hp < 50 才触发
       */
      requires_hp_below: (ctx, value) => {
        if (!value || value <= 0) return true; // 0/负数/未设置 → 不限
        const hp = ctx.unit?.hp ?? ctx.unit?.current_hp;
        if (hp === undefined || hp === null) return false;
        return hp < value;
      },

      /**
       * requires_unmoved: 单位本回合未移动
       * 用途: 需要停驻蓄力的技能
       * 示例: { requires_unmoved: true } → unit.has_moved !== true
       */
      requires_unmoved: (ctx, value) => {
        if (!value) return true; // false → 不要求，自动通过
        return ctx.unit?.has_moved !== true;
      },

      /**
       * target_on_terrain: 目标格子地形校验
       * 用途: 地形限定技能（如水战专属）
       * 示例: { target_on_terrain: "water" } → 目标必须在水中
       */
      target_on_terrain: (ctx, value) => {
        if (!value) return true; // 空值 → 不限
        const terrain = ctx.target?.terrain || ctx.targetTerrain;
        return terrain === value;
      },

      /**
       * requires_stealth: 单位处于隐身/潜行状态
       * 用途: 潜行专属技能
       * 示例: { requires_stealth: true } → unit.stealth === true
       */
      requires_stealth: (ctx, value) => {
        if (!value) return true;
        return ctx.unit?.stealth === true;
      },

      // ========== 原有隐身系列 checkers (保持向后兼容) ==========
      
      // 姿态相关
      defense_stance: (ctx, value) => ctx.defender?.stance === 'defense',
      
      // 检查目标HP (斩杀)
      target_hp: (ctx, value, op = '<=') => {
        const hp = ctx.target?.hp ?? ctx.targetHp;
        return this.compare(hp, value, op);
      },
      
      // 检查是否有防具 (抗性)
      has_armor: (ctx, value) => {
        const hasArmor = ctx.defender?.right_hand_type === 'armor' && 
                        (ctx.defender?.right_hand_durability || 0) > 0;
        return hasArmor === value;
      },
      
      // 护甲抗性类型
      armor_resistance_type: (ctx, value, op = '==') => {
        const armorType = ctx.defender?.right_hand_resistance;
        return this.compare(armorType, value, op);
      },
      
      // 攻击伤害类型
      attack_damage_type: (ctx, value, op = '==') => {
        const damageType = ctx.damageType;
        return this.compare(damageType, value, op);
      },
      
      // 自定义检查器占位
      custom: (ctx, value, config) => {
        if (typeof config === 'function') {
          return config(ctx, value);
        }
        return false;
      },

      // ========== 隐身相关检查器 ==========
      // 单位是否处于隐身状态
      is_stealth: (ctx, value) => {
        const unit = ctx.unit || ctx.attacker || ctx.defender || ctx.movingUnit;
        return (unit?.stealth === true) === value;
      },
      // 攻击者是否隐身
      attacker_is_stealth: (ctx, value) => {
        return (ctx.attacker?.stealth === true) === value;
      },
      // 防御者是否隐身
      defender_is_stealth: (ctx, value) => {
        return (ctx.defender?.stealth === true) === value;
      },
      // 移动单位是否隐身
      moving_unit_is_stealth: (ctx, value) => {
        return (ctx.movingUnit?.stealth === true) === value;
      },
      // 单位阵营检查
      unit_faction: (ctx, value) => {
        const unit = ctx.unit || ctx.attacker || ctx.defender;
        return unit?.faction === value;
      }
    };

    // Phase 14: 可识别的 flat 条件键白名单
    // 只有在此列表中的 key 才会被作为条件评估
    this.flatConditionKeys = new Set([
      'requires_hp_below',
      'requires_unmoved',
      'requires_stealth',
      'target_on_terrain',
    ]);
  }

  /**
   * 评估条件组
   * Phase 14: 支持两种格式 —
   *   A) 词条结构化: { required: [...], any: [...], not: {...} }
   *   B) 技能平铺式: { requires_unmoved: true, requires_hp_below: 50 }
   * 
   * @param {object} conditions - 条件定义
   * @param {object} context - 执行上下文
   * @returns {boolean}
   */
  evaluate(conditions, context) {
    if (!conditions) return true;
    
    // Phase 14: 检测是否为平铺 (flat) 格式
    // 平铺格式: 没有 required/any/not/check 字段，直接是键值对
    if (!conditions.required && !conditions.any && !conditions.not && !conditions.check) {
      return this.evaluateFlat(conditions, context);
    }
    
    // 处理 required (AND)
    if (conditions.required) {
      return this.evaluateAnd(conditions.required, context);
    }
    
    // 处理 any (OR)
    if (conditions.any) {
      return this.evaluateOr(conditions.any, context);
    }
    
    // 处理 not (NOT)
    if (conditions.not) {
      return !this.evaluate(conditions.not, context);
    }
    
    // 单一条件
    if (conditions.check) {
      return this.evaluateSingle(conditions, context);
    }
    
    return true;
  }

  /**
   * Phase 14: 平铺条件格式评估
   * 将技能配置中的扁平字段自动转换为 AND 条件链
   * 
   * @param {object} conditions - 平铺条件 { requires_unmoved: true, requires_hp_below: 50 }
   * @param {object} context - 执行上下文
   * @returns {boolean}
   */
  evaluateFlat(conditions, context) {
    // 遍历所有条件键
    for (const [key, value] of Object.entries(conditions)) {
      // 只处理已知的条件键
      if (!this.flatConditionKeys.has(key)) continue;
      
      // 跳过未设置的值 (0, false, null, undefined, '')
      if (!value && value !== true) continue;
      
      const checker = this.checkers[key];
      if (!checker) {
        console.warn(`[ConditionEvaluator] 平铺条件缺少检查器: ${key}`);
        continue;
      }
      
      if (!checker(context, value)) {
        return false;
      }
    }
    return true;
  }

  /**
   * AND 条件评估
   */
  evaluateAnd(conditions, context) {
    for (const condition of conditions) {
      if (!this.evaluateSingle(condition, context)) {
        return false;
      }
    }
    return true;
  }

  /**
   * OR 条件评估
   */
  evaluateOr(conditions, context) {
    for (const condition of conditions) {
      if (this.evaluateSingle(condition, context)) {
        return true;
      }
    }
    return false;
  }

  /**
   * 评估单个条件
   */
  evaluateSingle(condition, context) {
    const { check, value, ref, operator = '==' } = condition;
    
    // 获取检查器
    const checker = this.checkers[check];
    
    if (ref) {
      const checkValue = this.getValueFromContext(context, check);
      const refValue = this.getValueFromContext(context, ref);
      return this.compare(checkValue, refValue, operator);
    }
    
    if (!checker) {
      console.warn(`[ConditionEvaluator] 未知检查项: ${check}`);
      const actualValue = this.getValueFromContext(context, check);
      return this.compare(actualValue, value, operator);
    }
    
    return checker(context, value, operator);
  }

  /**
   * 数值比较
   */
  compare(a, b, operator) {
    if (a === undefined || b === undefined) {
      return operator === '!=' ? a !== b : false;
    }
    
    switch (operator) {
      case '==': return a == b;
      case '!=': return a != b;
      case '>': return a > b;
      case '<': return a < b;
      case '>=': return a >= b;
      case '<=': return a <= b;
      default: return false;
    }
  }

  /**
   * 从上下文获取值
   */
  getValueFromContext(context, path) {
    if (!path) return undefined;
    
    const fieldMapping = {
      'attack_damage_type': 'damageType',
      'target_hp': 'target.hp',
      'armor_resistance_type': 'defender.right_hand_resistance'
    };
    
    const mappedPath = fieldMapping[path] || path;
    const keys = mappedPath.split('.');
    let value = context;
    
    for (const key of keys) {
      if (value === null || value === undefined) {
        return undefined;
      }
      value = value[key];
    }
    
    return value;
  }

  /**
   * 注册自定义检查器
   */
  registerChecker(name, fn) {
    this.checkers[name] = fn;
    this.flatConditionKeys.add(name);
  }

  /**
   * 获取可用的检查器列表
   */
  getAvailableCheckers() {
    return Object.keys(this.checkers);
  }
}

// 单例导出
module.exports = new ConditionEvaluator();
```

## combatCore/configLoader.cjs

```js
/**
 * configLoader.cjs — 词条库配置热加载器 (Phase 10)
 *
 * 提供运行时重新加载词条库中枢配置的能力。
 * 调用 getGlossaryConfig() 总是返回最新的 JSON 数据。
 * 配合 API 写入端点，实现编辑后无需重启容器即可生效。
 *
 * saveGlossaryConfig 采用深度合并策略：
 *   - 将传入数据与磁盘现有配置深度合并后写入
 *   - 确保部分更新不会丢失其他字段
 */

const path = require('path');
const fs = require('fs');

const CONFIG_PATH = path.resolve(__dirname, '../../config/glossary-skill-config.json');

/**
 * 深度合并两个对象
 * - 对于普通值，新值覆盖旧值
 * - 对于对象，递归合并
 * - 对于数组，新数组替换旧数组
 */
function deepMerge(target, source) {
    if (!source || typeof source !== 'object') return source;
    if (!target || typeof target !== 'object') return source;

    const result = { ...target };
    for (const key of Object.keys(source)) {
        if (source[key] && typeof source[key] === 'object' && !Array.isArray(source[key])) {
            result[key] = deepMerge(result[key] || {}, source[key]);
        } else {
            result[key] = source[key];
        }
    }
    return result;
}

function getGlossaryConfig() {
    try {
        const raw = fs.readFileSync(CONFIG_PATH, 'utf-8');
        return JSON.parse(raw);
    } catch (e) {
        console.error('[ConfigLoader] 读取配置文件失败:', e.message);
        return null;
    }
}

function saveGlossaryConfig(incomingConfig) {
    try {
        // 原子删除: 处理 _delete_skills 指令
        const deleteKeys = incomingConfig._delete_skills || [];
        if (deleteKeys.length > 0) {
            deleteSkills(deleteKeys);
            // 从 incomingConfig 中移除 _delete_skills，避免写入 JSON
            delete incomingConfig._delete_skills;
        }

        // 读取现有配置进行深度合并
        let existing = {};
        try {
            const raw = fs.readFileSync(CONFIG_PATH, 'utf-8');
            existing = JSON.parse(raw);
        } catch (e) {
            console.warn('[ConfigLoader] 读取现有配置失败，将创建新文件:', e.message);
        }

        // 深度合并：确保部分更新不丢失数据
        const merged = deepMerge(existing, incomingConfig);

        // 更新 meta
        merged._meta = merged._meta || {};
        merged._meta.date = new Date().toISOString().replace('T', ' ').substring(0, 19);
        if (!merged._meta.generated_from) {
            merged._meta.generated_from = 'API 写入';
        }

        const json = JSON.stringify(merged, null, 2);
        fs.writeFileSync(CONFIG_PATH, json, 'utf-8');
        console.log('[ConfigLoader] 配置已深度合并写入磁盘');
        return true;
    } catch (e) {
        console.error('[ConfigLoader] 写入配置文件失败:', e.message);
        return false;
    }
}

function getSkillConfig(skillType) {
    const config = getGlossaryConfig();
    if (config && config.skills && config.skills[skillType]) {
        return config.skills[skillType];
    }
    return null;
}

function getSystemConfig(systemKey) {
    const config = getGlossaryConfig();
    if (config && config.systems && config.systems[systemKey]) {
        return config.systems[systemKey];
    }
    return null;
}


function deleteSkills(skillKeys) {
    if (!skillKeys || !Array.isArray(skillKeys) || skillKeys.length === 0) {
        console.warn('[ConfigLoader] deleteSkills: 无效的 keys 参数');
        return false;
    }
    try {
        const config = getGlossaryConfig();
        if (!config || !config.skills) return false;
        let deleted = 0;
        for (const key of skillKeys) {
            if (config.skills[key] !== undefined) {
                delete config.skills[key];
                deleted++;
            }
        }
        if (deleted > 0) {
            const json = JSON.stringify(config, null, 2);
            fs.writeFileSync(CONFIG_PATH, json, 'utf-8');
            console.log(`[ConfigLoader] 已删除 ${deleted} 个技能: [${skillKeys.join(', ')}]`);
        }
        return deleted > 0;
    } catch (e) {
        console.error('[ConfigLoader] deleteSkills 失败:', e.message);
        return false;
    }
}

module.exports = {
    getGlossaryConfig,
    saveGlossaryConfig,
    deleteSkills,
    getSkillConfig,
    getSystemConfig,
};
```

## combatCore/damagePipe.cjs

```js
/**
 * damagePipe.cjs - 机甲战棋伤害计算管道 (Phase 10 泛化语法战斗中枢)
 * 
 * 12 阶段泛化伤害管道：
 *   1. base_attack            - 基础攻击力
 *   2. mobility_diff          - 双方机动值差
 *   3. temp_attack            - 临时攻击力
 *   4. extras                 - 泛化额外值累加器
 *   5. attack_after_extras    - 追加额外值后的攻击力
 *   6. height_bonus           - 高地优势加成
 *   7. terrain_kind_modifiers - 地形伤害类型修正
 *   8. defense                - 防御减免（泛化）
 *   9. weapon_penalty         - 武器克制惩罚（泛化）
 *  10. armor_reduction        - 装备/技能伤害减免（泛化）
 *  11. manual_roll_bonus      - 手动摇骰追加伤害
 *  12. final_damage           - 最终伤害计算
 *  13. crit                   - 暴击判定
 *
 * 使用海豹骰子 dicescript 引擎统一所有骰子判定。
 */

// DiceEngine.cjs 已于 Phase 4 废除，直接使用 Math.random()

// ============================================================
// 常量配置
// ============================================================

const CRIT_THRESHOLD = 5;       // 暴击阈值 (1d6 >= 5, 即 1/3 概率)
const CRIT_MIN = 0.8;           // 暴击倍率下限
const CRIT_MAX = 1.5;           // 暴击倍率上限
const GUARANTEED_DAMAGE = 1;    // 保底伤害

// 默认地形伤害类型修正（运行时由 terrainDefs 覆盖）
const DEFAULT_TERRAIN_KIND_MODIFIERS = {
    beam: 1.0,
    kinetic: 1.0,
    explosive: 1.0,
    corrosive: 1.0,
    thermal: 1.0
};

// 迷雾精度惩罚
const FOG_ACCURACY = 0.7;

// 泛化武器克制惩罚
const WEAPON_COUNTER_PENALTY = -2;

// ============================================================
// 伤害计算管道（静态方法）
// ============================================================

class DamagePipe {

    /**
     * 掷骰（Math.random，DiceEngine 已于 Phase 4 废除）
     */
    static rollDice(faces = 6) {
        return Math.floor(Math.random() * faces) + 1;
    }

    /**
     * 暴击判定：1d6 >= 5 → 33.3% 概率
     */
    static checkCrit() {
        return this.rollDice(6) >= CRIT_THRESHOLD;
    }

    /**
     * 主计算入口：完整 12+1 阶段泛化伤害管道
     *
     * @param {Object} config
     * @param {Object} config.attacker - { melee, ranged, attack(fallback), mobility, weaponType, buffs[], skills[], extraBonuses, z, height, equipment }
     * @param {Object} config.defender - { defense, armorType, shield, resistance, buffs[], equipment, skills[], mobility, terrain, z, height }
     * @param {string} config.attack_type - 'melee' | 'ranged'
     * @param {number} config.sniper_mobility_reduction - 狙击技能：目标机动值减免（0 表示无狙击）
     * @param {Object} config.terrainDefs - 地形定义字典（可选，默认 {}）
     * @param {boolean} config.is_manual_roll - 是否启用手动摇骰阶段
     * @param {string} config.dice_type - 手动摇骰的骰子类型，如 '1d6'
     * @param {number} config.success_line - 手动摇骰的成功线
     * @param {number} config.success_bonus_damage - 手动摇骰成功追加伤害
     * @param {number} config.height_bonus_per_diff - 每高度差的伤害加成
     * @returns {Object} { stages, final_damage, is_crit, crit_multiplier }
     */
    static calculate(config) {
        const result = {
            stages: {},
            final_damage: 0,
            is_crit: false,
            crit_multiplier: 1.0
        };

        const attackType = config.attack_type || 'melee';
        const attacker = config.attacker || {};
        const defender = config.defender || {};
        const terrainDefs = config.terrainDefs || {};
        // Step 5: 权威伤害种类——优先 config.damage_kind（词条贡献），缺失回退 weaponType
        const damageKind = config.damage_kind || attacker.weaponType || 'kinetic';

        // ---- 阶段 1: 基础攻击力（近战=格斗 / 远程=射击） ----
        const baseAttack = attackType === 'melee'
            ? (attacker.melee || attacker.attack || 10)
            : (attacker.ranged || attacker.attack || 10);
        result.stages.base_attack = baseAttack;

        // ---- 阶段 2: 双方机动值差 ----
        const attMobility = attacker.mobility || 0;
        const defMobility = defender.mobility || 0;
        // 狙击技能：目标机动值 -2（Excel: 舍弃移动，机动值差计算中目标机动值-2）
        const sniperReduction = config.sniper_mobility_reduction || 0;
        const effectiveDefMobility = Math.max(0, defMobility - sniperReduction);
        const mobilityDiff = attMobility - effectiveDefMobility;
        result.stages.mobility_diff = mobilityDiff;
        if (sniperReduction > 0) {
            result.stages.sniper_mobility_reduction = sniperReduction;
        }

        // ---- 阶段 3: 临时攻击力 ----
        const tempAttack = baseAttack + mobilityDiff;
        result.stages.temp_attack = tempAttack;

        // ---- 阶段 4: 额外值（泛化累加器） ----
        const extraValues = this._calcExtraValues(attacker);
        result.stages.extras = extraValues;

        // ---- 阶段 5: 追加额外值后的攻击力 ----
        const attackAfterExtras = tempAttack + extraValues.total;
        result.stages.attack_after_extras = attackAfterExtras;

        // ---- 阶段 6: 高地优势加成 ----
        const heightBonus = this._calcHeightBonus(attacker, defender, config);
        result.stages.height_bonus = heightBonus;

        // ---- 阶段 7: 地形伤害类型修正 ----
        const terrainKindMods = this._applyTerrainKindModifiers(defender, damageKind, terrainDefs);
        result.stages.terrain_kind_modifiers = terrainKindMods;

        // ---- 阶段 8: 防御减免（泛化） ----
        const defense = this._calcDefense(defender, attacker, terrainDefs, damageKind);
        result.stages.defense = defense;

        // ---- 阶段 9: 武器克制惩罚（泛化） ----
        const weaponPenalty = this._calcWeaponPenalty(attacker, defender, damageKind);
        result.stages.weapon_penalty = weaponPenalty;

        // ---- 阶段 10: 装备/技能伤害减免（泛化） ----
        const armorReduction = this._calcArmorReduction(attacker, defender, damageKind);
        result.stages.armor_reduction = armorReduction;

        // ---- 阶段 11: 手动摇骰追加伤害 ----
        const manualRollResult = this._applyManualRollBonus(config);
        result.stages.manual_roll = manualRollResult;

        // ---- 阶段 12: 最终伤害计算 ----
        let finalDamage = Math.max(0, attackAfterExtras - defense.total)
            + heightBonus.bonus
            + weaponPenalty
            - armorReduction
            + manualRollResult.bonus;
        finalDamage = Math.max(GUARANTEED_DAMAGE, finalDamage);

        // 应用地形伤害类型修正
        finalDamage = Math.floor(finalDamage * terrainKindMods.modifier);
        finalDamage = Math.max(GUARANTEED_DAMAGE, finalDamage);
        result.stages.final_damage_pre_crit = finalDamage;

        // ---- 阶段 13: 暴击判定（伤害计算完成后） ----
        const isCrit = this.checkCrit();
        result.is_crit = isCrit;
        result.stages.is_crit = isCrit;

        if (isCrit) {
            const critMult = CRIT_MIN + Math.random() * (CRIT_MAX - CRIT_MIN);
            result.crit_multiplier = parseFloat(critMult.toFixed(2));
            finalDamage = Math.floor(finalDamage * critMult);
        }

        result.final_damage = Math.max(GUARANTEED_DAMAGE, finalDamage);
        result.stages.final_damage = result.final_damage;

        return result;
    }

    // ---- 内部计算方法 ----

    /**
     * 泛化额外值累加器
     * 遍历 bonuses 数组，对任意 bonus_value !== undefined 的条目累加，
     * 不做类型名判断（不区分 assist/counter/focused_fire/sweep_precise/guard/blockade）
     *
     * @param {Object} attacker - 攻击方对象
     * @returns {{ total: number, details: Object }}
     */
    static _calcExtraValues(attacker) {
        let total = 0;
        const details = {};
        const bonuses = attacker.extraBonuses?.bonuses || attacker.bonuses || [];
        for (const bonus of bonuses) {
            if (!bonus) continue;
            const val = bonus.bonus_value ?? bonus.value ?? 0;
            if (val !== 0) {
                total += val;
                details[bonus.type || 'generic'] = val;
            }
        }
        return { total, details };
    }

    /**
     * 高地优势加成
     * 计算攻击方与防御方的高度差，每差1点给予 bonusPerDiff 伤害加成
     *
     * @param {Object} attacker - 攻击方
     * @param {Object} defender - 防御方
     * @param {Object} config - 管道配置
     * @returns {{ height_diff: number, bonus: number, message?: string }}
     */
    static _calcHeightBonus(attacker, defender, config) {
        const attZ = attacker.z ?? attacker.height ?? 0;
        const defZ = defender.z ?? defender.height ?? 0;
        const heightDiff = attZ - defZ;
        const bonusPerDiff = config.height_bonus_per_diff ?? 0;
        if (heightDiff > 0 && bonusPerDiff > 0) {
            const bonus = Math.floor(heightDiff * bonusPerDiff);
            return {
                height_diff: heightDiff,
                bonus,
                message: `高地优势 z+${heightDiff}, 伤害+${bonus}`
            };
        }
        return { height_diff: heightDiff, bonus: 0 };
    }

    /**
     * 地形伤害类型修正
     * 根据防御方所在地形的 damage_kind_modifiers 字典，对特定伤害种类施加倍率修正
     *
     * @param {Object} defender - 防御方
     * @param {string} damageKind - 攻击者实际伤害种类（权威来源，非 weaponType）
     * @param {Object} terrainDefs - 地形定义字典
     * @returns {{ terrain_id: string, damage_kind: string, modifier: number, defense_bonus: number }}
     */
    static _applyTerrainKindModifiers(defender, damageKind, terrainDefs) {
        const terrainId = defender.terrain || 'moon';
        const terrainDef = terrainDefs[terrainId] || {};
        const kindMods = terrainDef.damage_kind_modifiers || DEFAULT_TERRAIN_KIND_MODIFIERS;
        const modifier = kindMods[damageKind] || 1.0;
        const defenseBonus = terrainDef.defense_bonus ?? 0;
        return {
            terrain_id: terrainId,
            damage_kind: damageKind,
            modifier,
            defense_bonus: defenseBonus
        };
    }

    /**
     * 防御减免（泛化）
     * 基础防御 + 护盾 + Buff + 地形防御 + 装备防御修正
     *
     * @param {Object} defender - 防御方
     * @param {Object} attacker - 攻击方
     * @param {Object} terrainDefs - 地形定义字典
     * @param {string} damageKind - 攻击者实际伤害种类（权威来源，非 weaponType）
     * @returns {{ base: number, shield: number, buffs: number, terrain: number, equipment_reduction: number, total: number }}
     */
    static _calcDefense(defender, attacker, terrainDefs, damageKind) {
        const baseDefense = defender.defense || 5;
        const shieldValue = defender.shield || 0;
        const defenseBuffs = this._sumBuffs(defender.buffs || [], 'defense');

        // 泛化地形防御
        const terrainId = defender.terrain || 'moon';
        const terrainDef = terrainDefs[terrainId] || {};
        const terrainBonus = terrainDef.defense_bonus ?? 0;

        // 泛化装备防御修正（以权威伤害种类匹配 damage_kind_modifiers）
        let eqReduction = 0;
        const eq = defender.equipment || {};
        if (eq.defense_modifiers) {
            const weaponType = damageKind || attacker.weaponType || 'kinetic';
            eqReduction = eq.defense_modifiers[weaponType] || 0;
        }

        return {
            base: baseDefense,
            shield: shieldValue,
            buffs: defenseBuffs,
            terrain: terrainBonus,
            equipment_reduction: eqReduction,
            total: baseDefense + shieldValue + defenseBuffs + terrainBonus + eqReduction
        };
    }

    /**
     * 武器克制惩罚（泛化）
     * 攻击方实际伤害种类 == 防御方 resistance → 惩罚值
     *
     * @param {Object} attacker - 攻击方
     * @param {Object} defender - 防御方
     * @param {string} damageKind - 攻击者实际伤害种类（权威来源，非 weaponType）
     * @returns {number} 惩罚值
     */
    static _calcWeaponPenalty(attacker, defender, damageKind) {
        const attackerWeaponType = damageKind || null;
        const defenderResistance = defender.resistance || null;
        if (!attackerWeaponType || !defenderResistance) return 0;
        if (attackerWeaponType === defenderResistance) return WEAPON_COUNTER_PENALTY;
        return 0;
    }

    /**
     * 装备/技能伤害减免（泛化）
     * 遍历防御方所有装备槽位和技能，查找 damage_kind_modifiers 字典，
     * 根据攻击方实际伤害种类累加减免值
     *
     * @param {Object} attacker - 攻击方
     * @param {Object} defender - 防御方
     * @param {string} damageKind - 攻击者实际伤害种类（权威来源，非 weaponType）
     * @returns {number} 总减免值
     */
    static _calcArmorReduction(attacker, defender, damageKind) {
        let reduction = 0;
        const weaponType = damageKind || attacker.weaponType || 'kinetic';
        const eq = defender.equipment || {};

        // 遍历所有装备槽位
        for (const slot of ['full_armor', 'coating', 'shield_gen', 'reactive_armor']) {
            if (eq[slot]) {
                const slotMods = eq[slot].damage_kind_modifiers || {};
                reduction += slotMods[weaponType] || 0;
            }
        }

        // 遍历防御方技能，查找提供装备式保护的技能
        const skills = defender.skills || [];
        for (const skill of skills) {
            if (!skill || !skill.active) continue;
            const skillMods = skill.damage_kind_modifiers || {};
            reduction += skillMods[weaponType] || 0;
        }

        return reduction;
    }

    /**
     * 手动摇骰追加伤害
     * 如果 config.is_manual_roll 为 true，模拟玩家手动摇骰判定
     * TODO: Phase 10 - 状态机钩子，等待玩家实际输入
     *
     * @param {Object} config - 管道配置
     * @returns {{ manual: boolean, bonus: number, roll?: number, diceType?: string, successLine?: number, isSuccess?: boolean, message?: string }}
     */
    static _applyManualRollBonus(config) {
        if (!config.is_manual_roll) return { manual: false, bonus: 0 };

        // TODO: Phase 10 - state machine hook for manual roll input
        // 当前自动掷骰模拟
        const diceType = config.dice_type || '1d6';
        const successLine = config.success_line ?? 4;
        const bonusDamage = config.success_bonus_damage ?? 0;

        // 解析骰子字符串
        const m = String(diceType).match(/^(\d+)d(\d+)$/i);
        const count = m ? parseInt(m[1]) : 1;
        const sides = m ? parseInt(m[2]) : 6;
        let roll = 0;
        for (let i = 0; i < count; i++) roll += Math.floor(Math.random() * sides) + 1;

        const isSuccess = roll >= successLine;
        const bonus = isSuccess ? bonusDamage : 0;
        return {
            manual: true,
            roll,
            diceType,
            successLine,
            isSuccess,
            bonus,
            message: `[手动摇骰] 掷${diceType}=${roll} ${isSuccess ? '>=' : '<'} ${successLine}, 追加伤害+${bonus}`
        };
    }

    /**
     * Buff 求和
     */
    static _sumBuffs(buffs, type) {
        if (!buffs || !buffs.length) return 0;
        return buffs
            .filter(b => b && b.type === type)
            .reduce((sum, b) => sum + (b.value || 0), 0);
    }

    /**
     * 计算对地形的伤害
     */
    static calculateTerrainDamage(attacker, terrainDef, config) {
        const weaponType = config.damage_kind || attacker.weaponType || 'kinetic';
        const baseDamage = attacker.attack || 10;
        const terrainResistance = terrainDef.resistance || {};
        const resistance = terrainResistance[weaponType] || 1.0;
        return Math.floor(baseDamage * resistance);
    }

    /**
     * 应用地形伤害效果
     */
    static applyTerrainDamage(terrain, damage, terrainDefs) {
        const terrainDef = terrainDefs[terrain] || {};
        const hp = terrainDef.hp || 100;
        const remaining = Math.max(0, hp - damage);
        return {
            terrain,
            damage,
            hp_before: hp,
            hp_after: remaining,
            destroyed: remaining <= 0
        };
    }

    /**
     * 快速计算：简化接口兼容旧调用
     * 自动从 attacker.attack 推断 melee/ranged（取 attack 为两者共用值）
     *
     * @param {Object} attacker - 攻击方
     * @param {Object} defender - 防御方
     * @param {string} attackType - 'melee' | 'ranged'
     * @param {Object} terrainDefs - 地形定义（可选）
     * @returns {Object} 管道计算结果
     */
    static calculateQuick(attacker, defender, attackType = 'melee', terrainDefs = {}) {
        return this.calculate({
            attacker: {
                melee: attacker.melee || attacker.attack || 10,
                ranged: attacker.ranged || attacker.attack || 10,
                attack: attacker.attack || 10,
                mobility: attacker.mobility || 0,
                weaponType: attacker.weaponType || 'kinetic',
                buffs: attacker.buffs || [],
                skills: attacker.skills || [],
                extraBonuses: attacker.extraBonuses || null,
                z: attacker.z ?? attacker.height ?? 0,
                height: attacker.height ?? attacker.z ?? 0
            },
            defender: {
                defense: defender.defense || 5,
                armorType: defender.armorType || 'normal',
                shield: defender.shield || 0,
                resistance: defender.resistance || null,
                buffs: defender.buffs || [],
                equipment: defender.equipment || {},
                skills: defender.skills || [],
                mobility: defender.mobility || 0,
                terrain: defender.terrain || 'moon',
                z: defender.z ?? defender.height ?? 0,
                height: defender.height ?? defender.z ?? 0
            },
            attack_type: attackType,
            terrainDefs: terrainDefs || {}
        });
    }
}

module.exports = DamagePipe;
```

## combatCore/effectExecutor.cjs

```js
/**
 * EffectExecutor v3.0 — 效果执行器 (Phase 10 万能语法中枢)
 *
 * 职责:
 * 1. 根据 effects[].type 映射到具体效果处理器
 * 2. 执行词条效果（确定性公式 + 骰子驱动）
 * 3. 支持效果组合和链式执行
 * 4. Phase 10: 新增 damage_kind 分流 / 高地优势 / 手动摇骰处理器
 */

const damagePipe = require('./damagePipe.cjs');
const buffManager = require('./buffManager.cjs');
const { getGlossaryConfig } = require('./configLoader.cjs');

class EffectExecutor {
  constructor() {
    this.handlers = {
      // 伤害相关
      instant_kill: this.handleInstantKill.bind(this),
      damage_bonus_dice: this.handleDamageBonusFixed.bind(this),
      damage_reduction: this.handleDamageReduction.bind(this),

      // 判定相关 — 去骰化
      duel_resolution: this.handleDuelResolution.bind(this),
      luck_resolution: this.handleLuckResolution.bind(this),
      plunder_attempt: this.handlePlunderAttempt.bind(this),

      // 行动相关
      grant_extra_turn: this.handleGrantExtraTurn.bind(this),
      block_movement: this.handleBlockMovement.bind(this),

      // 支援相关
      assist_choice: this.handleAssistChoice.bind(this),

      // 生成相关
      spawn_items: this.handleSpawnItems.bind(this),

      // Buff相关
      apply_buff: this.handleApplyBuff.bind(this),
      remove_buff: this.handleRemoveBuff.bind(this),

      // 属性修改
      modify_stat: this.handleModifyStat.bind(this),

      // 特殊
      custom: this.handleCustomEffect.bind(this),

      // 隐身效果
      enter_stealth: this.handleEnterStealth.bind(this),
      exit_stealth: this.handleExitStealth.bind(this),
      stealth_attack_bonus: this.handleStealthAttackBonus.bind(this),
      stealth_evasion: this.handleStealthEvasion.bind(this),

      // Phase 10: 万能语法中枢新增
      height_advantage: this.handleHeightAdvantage.bind(this),
      terrain_kind_modifier: this.handleTerrainKindModifier.bind(this),
      manual_roll: this.handleManualRoll.bind(this),
    };
  }

  async execute(effects, context) {
    if (!effects || effects.length === 0) {
      return [{ success: true, reason: 'no_effects' }];
    }

    const results = [];
    for (const effect of effects) {
      const result = await this.executeSingle(effect, context);
      results.push(result);
      if (result.interrupt) break;
    }
    return results;
  }

  async executeSingle(effect, context) {
    const { type, ...params } = effect;
    const handler = this.handlers[type];
    if (!handler) {
      console.warn(`[EffectExecutor] 未知效果类型: ${type}`);
      return { type, success: false, reason: 'unknown_effect_type' };
    }
    try {
      return await handler(params, context);
    } catch (error) {
      console.error(`[EffectExecutor] 执行效果失败: ${type}`, error);
      return { type, success: false, reason: 'execution_error', error: error.message };
    }
  }

  /**
   * 立即斩杀 — 去骰化：根据 HP 阈值判定
   */
  async handleInstantKill(params, context) {
    const targetHp = context.target?.hp || 0;
    const maxHp = context.target?.max_hp || 1;
    const threshold = params.threshold_percent
      ? Math.max(1, Math.floor(maxHp * params.threshold_percent / 100))
      : params.threshold_fixed || 5;

    if (targetHp > 0 && targetHp <= threshold) {
      return {
        type: 'instant_kill',
        success: true,
        targetHp,
        threshold,
        result: 'target_eliminated',
        interrupt: true
      };
    }

    return {
      type: 'instant_kill',
      success: false,
      targetHp,
      threshold,
      result: 'execution_failed'
    };
  }

  /**
   * 伤害加成 — 去骰化：固定值加成
   */
  async handleDamageBonusFixed(params, context) {
    const bonus = params.fixed || params.bonus?.fixed || 4;

    if (context.damageContext) {
      context.damageContext.addStep({
        source: 'effect',
        type: 'tag_bonus',
        value: bonus,
        description: `专注射击: +${bonus}伤害`
      });
    }

    return {
      type: 'damage_bonus_dice',
      success: true,
      bonus
    };
  }

  /**
   * 伤害减免（抗性）
   */
  async handleDamageReduction(params, context) {
    const { amount = 2, conditions, damage_kind } = params;

    if (conditions) {
      const meetsCondition = await this.checkConditions(conditions, context);
      if (!meetsCondition) {
        return { type: 'damage_reduction', success: false, reason: 'conditions_not_met' };
      }
    }

    // Phase 10: damage_kind 感知
    const attackerWeaponType = context.attacker?.weaponType || 'kinetic';
    if (damage_kind && damage_kind !== attackerWeaponType) {
      return { type: 'damage_reduction', success: true, reduction: 0, reason: 'damage_kind_mismatch' };
    }

    if (context.damageContext) {
      context.damageContext.addStep({
        source: 'effect',
        type: 'damage_reduction',
        value: -amount,
        description: `抗性: -${amount}伤害`
      });
    }

    return { type: 'damage_reduction', success: true, reduction: amount };
  }

  /**
   * 决斗判定 — 去骰化：比较 max_attack 值
   */
  async handleDuelResolution(params, context) {
    const attacker = context.attacker || {};
    const defender = context.defender || context.target || {};

    const maxA = Math.max(attacker.melee || attacker.attack || 10, attacker.ranged || 0);
    const maxB = Math.max(defender.melee || defender.attack || 10, defender.ranged || 0);

    let winner;
    if (maxA > maxB) winner = 'attacker';
    else if (maxB > maxA) winner = 'defender';
    else winner = 'tie';

    return {
      type: 'duel_resolution',
      success: true,
      statA: maxA,
      statB: maxB,
      winner,
      result: winner === 'attacker' ? 'attacker_wins' :
              winner === 'defender' ? 'defender_wins' : 'draw'
    };
  }

  /**
   * 幸运判定 — 去骰化：始终成功
   */
  async handleLuckResolution(params, context) {
    return {
      type: 'luck_resolution',
      success: true,
      lucky: true,
      result: 'gain_extra_action'
    };
  }

  /**
   * 抢夺判定 — 去骰化：确定性条件
   */
  async handlePlunderAttempt(params, context) {
    const targetWeaponAtk = context.target?.left_hand_melee ||
                            context.target?.left_hand_shooting || 0;

    if (targetWeaponAtk <= 0) {
      return { type: 'plunder_attempt', success: false, result: 'no_weapon_to_seize' };
    }

    return {
      type: 'plunder_attempt',
      success: true,
      result: 'weapon_seized',
      weapon: {
        name: context.target?.left_hand_name,
        attack: targetWeaponAtk
      }
    };
  }

  async handleGrantExtraTurn(params, context) {
    const { unitId } = params;
    const targetUnit = unitId ? context.getUnit(unitId) : context.attacker;
    if (!targetUnit) {
      return { type: 'grant_extra_turn', success: false, reason: 'unit_not_found' };
    }
    targetUnit.extraTurn = true;
    return { type: 'grant_extra_turn', success: true, unitId: targetUnit.id };
  }

  async handleBlockMovement(params, context) {
    return { type: 'block_movement', success: true };
  }

  async handleAssistChoice(params, context) {
    return { type: 'assist_choice', success: true };
  }

  async handleSpawnItems(params, context) {
    return { type: 'spawn_items', success: true, items: params.items || [] };
  }

  async handleApplyBuff(params, context) {
    return { type: 'apply_buff', success: true };
  }

  async handleRemoveBuff(params, context) {
    return { type: 'remove_buff', success: true };
  }

  async handleModifyStat(params, context) {
    return { type: 'modify_stat', success: true };
  }

  async handleCustomEffect(params, context) {
    const { execute } = params;
    if (typeof execute === 'function') {
      return await execute(params, context);
    }
    return { type: 'custom', success: false, reason: 'no_execute_function' };
  }

  // ============================================================
  // 隐身系统 — 去骰化
  // ============================================================

  async handleEnterStealth(params, context) {
    const unit = context.unit || context.attacker;
    if (!unit) return { type: 'enter_stealth', success: false, reason: 'no_unit' };

    const stealthType = params.type || 'conceal';
    const duration = params.duration || 2;

    unit.stealth = true;
    unit.stealthData = { type: stealthType, duration, appliedAt: Date.now() };

    return {
      type: 'enter_stealth',
      success: true,
      unitId: unit.id,
      stealthType,
      duration
    };
  }

  async handleExitStealth(params, context) {
    const unit = context.unit || context.attacker;
    if (!unit) return { type: 'exit_stealth', success: false, reason: 'no_unit' };
    const { reason } = params;
    const previousState = { stealth: unit.stealth, stealthData: unit.stealthData };

    unit.stealth = false;
    unit.stealthData = null;

    return {
      type: 'exit_stealth',
      success: true,
      result: 'stealth_broken',
      unitId: unit.id,
      reason: reason || 'unknown',
      previousState
    };
  }

  /**
   * 隐身攻击加成 — 去骰化：仅基础乘算
   */
  async handleStealthAttackBonus(params, context) {
    const { multiplier = 1.5 } = params;

    if (!context.damageContext) {
      return { type: 'stealth_attack_bonus', success: false, reason: 'no_damage_context' };
    }

    let bonus = 0;
    if (multiplier && multiplier > 1) {
      const baseDamage = context.damageContext.getTotal() || 0;
      bonus = Math.floor(baseDamage * (multiplier - 1));
    }

    if (bonus > 0) {
      context.damageContext.addStep({
        source: 'tag',
        type: 'stealth_bonus',
        value: bonus,
        description: `奇袭: +${bonus}伤害 (${multiplier}x)`
      });
    }

    return {
      type: 'stealth_attack_bonus',
      success: true,
      bonus,
      multiplier,
      description: `奇袭: 伤害${multiplier}x`
    };
  }

  /**
   * 隐身闪避 — 去骰化：固定概率匹配
   */
  async handleStealthEvasion(params, context) {
    const { evasionChance = 0.5 } = params;
    const evaded = Math.random() < evasionChance;

    return {
      type: 'stealth_evasion',
      success: true,
      evasionChance,
      evaded,
      result: evaded ? 'attack_evaded' : 'attack_hits',
      description: evaded ? '伪装生效: 闪避攻击' : '伪装失效: 攻击命中'
    };
  }

  // ============================================================
  // Phase 10: 万能语法中枢新增处理器
  // ============================================================

  /**
   * 高地优势加成
   * 攻击方比防御方每高1格，给予 per_diff 伤害加成
   */
  async handleHeightAdvantage(params, context) {
    const attacker = context.attacker || {};
    const defender = context.defender || context.target || {};
    const attZ = attacker.z ?? attacker.height ?? 0;
    const defZ = defender.z ?? defender.height ?? 0;
    const diff = attZ - defZ;
    const perDiff = params.per_diff ?? 0;

    if (diff <= 0 || perDiff <= 0) {
      return { type: 'height_advantage', success: true, bonus: 0, height_diff: diff };
    }

    const bonus = Math.floor(diff * perDiff);
    return {
      type: 'height_advantage',
      success: true,
      height_diff: diff,
      bonus,
      message: `高地优势 z+${diff}格, 伤害+${bonus}`
    };
  }

  /**
   * 地形伤害类型修正
   * 根据防御方所在地形的 damage_kind_modifiers 字典，对武器类型施加倍率
   */
  async handleTerrainKindModifier(params, context) {
    const weaponType = context.attacker?.weaponType || 'kinetic';
    const terrainId = context.defender?.terrain || context.target?.terrain || 'moon';

    const config = getGlossaryConfig();
    const terrains = config?.terrains || {};
    const terrainDef = terrains[terrainId] || {};
    const kindMods = terrainDef.damage_kind_modifiers || {};
    const modifier = kindMods[weaponType] || 1.0;

    return {
      type: 'terrain_kind_modifier',
      success: true,
      terrain_id: terrainId,
      damage_kind: weaponType,
      modifier,
      message: modifier !== 1.0
        ? `地形修正: ${terrainDef.name || terrainId} 对 ${weaponType} 倍率 ${modifier}`
        : ''
    };
  }

  /**
   * 手动摇骰处理器 (Phase 10 状态机接入点)
   * 当前为自动模拟，实际使用时挂起等待玩家输入
   */
  async handleManualRoll(params, context) {
    const isManual = params.is_manual_roll || false;
    if (!isManual) {
      return { type: 'manual_roll', success: true, is_manual: false, message: '自动掷骰' };
    }

    // TODO: Phase 10 - state machine hook, currently auto-roll
    const diceType = params.dice_type || '1d6';
    const successLine = params.success_line ?? 4;
    const bonusDamage = params.success_bonus_damage ?? 0;

    // Parse and roll
    const m = String(diceType).match(/^(\d+)d(\d+)$/i);
    const count = m ? parseInt(m[1]) : 1;
    const sides = m ? parseInt(m[2]) : 6;
    let roll = 0;
    for (let i = 0; i < count; i++) roll += Math.floor(Math.random() * sides) + 1;

    const isSuccess = roll >= successLine;

    return {
      type: 'manual_roll',
      success: true,
      is_manual: true,
      roll,
      diceType,
      successLine,
      isSuccess,
      bonus: isSuccess ? bonusDamage : 0,
      message: isSuccess
        ? `[手动摇骰 SUCCESS] 掷${diceType}=${roll} >= ${successLine}, 追加+${bonusDamage}`
        : `[手动摇骰 FAIL] 掷${diceType}=${roll} < ${successLine}`
    };
  }

  /**
   * 条件检查（简化版）
   */
  async checkConditions(conditions, context) {
    if (!conditions) return true;
    return true;
  }
}

module.exports = new EffectExecutor();
```

## combatCore/equipManager.cjs

```js
/**
 * EquipmentManager - 装备管理器
 * 负责计算单位装备提供的属性加成
 * 
 * 装备数据结构:
 * - left_hand_type: 'weapon' | 'armor' | 'system' | null
 * - left_hand_melee: 近战加成 (武器)
 * - left_hand_ranged: 远程加成 (武器)
 * - left_hand_defense: 防御加成 (防具)
 * - left_hand_durability: 耐久度
 * - left_hand_resistance: 抗性类型 ('kinetic' | 'energy' | 'explosive' | null)
 * - right_hand_*: 同上
 * - extra_*: 额外装备槽
 */

class EquipmentManager {
  
  /**
   * 获取单位的武器加成
   * @param {Object} unit - 单位对象
   * @param {string} attackType - 攻击类型：'melee' | 'ranged'
   * @returns {Object} { bonus: number, sources: Array }
   */
  static getWeaponBonus(unit, attackType) {
    const sources = [];
    let totalBonus = 0;
    
    // 检查左手装备
    if (unit.left_hand_type === 'weapon') {
      const bonus = attackType === 'melee' 
        ? (unit.left_hand_melee || 0)
        : (unit.left_hand_ranged || 0);
      
      if (bonus > 0) {
        totalBonus += bonus;
        sources.push({
          slot: 'left_hand',
          type: 'weapon',
          bonus: bonus,
          name: unit.left_hand_name || '左手武器'
        });
      }
    }
    
    // 检查右手装备
    if (unit.right_hand_type === 'weapon') {
      const bonus = attackType === 'melee'
        ? (unit.right_hand_melee || 0)
        : (unit.right_hand_ranged || 0);
      
      if (bonus > 0) {
        totalBonus += bonus;
        sources.push({
          slot: 'right_hand',
          type: 'weapon',
          bonus: bonus,
          name: unit.right_hand_name || '右手武器'
        });
      }
    }
    
    // 检查额外装备 (如果有武器)
    if (unit.extra_type === 'weapon') {
      const bonus = attackType === 'melee'
        ? (unit.extra_melee || 0)
        : (unit.extra_ranged || 0);
      
      if (bonus > 0) {
        totalBonus += bonus;
        sources.push({
          slot: 'extra',
          type: 'weapon',
          bonus: bonus,
          name: unit.extra_name || '额外武器'
        });
      }
    }
    
    return {
      bonus: totalBonus,
      sources: sources
    };
  }
  
  /**
   * 获取单位的防具防御加成
   * @param {Object} unit - 单位对象
   * @returns {Object} { reduction: number, sources: Array }
   */
  static getArmorDefense(unit) {
    const sources = [];
    let totalReduction = 0;
    
    // 检查左手装备
    if (unit.left_hand_type === 'armor') {
      const defense = unit.left_hand_defense || 0;
      const durability = unit.left_hand_durability || 0;
      
      if (defense > 0 && durability > 0) {
        totalReduction += defense;
        sources.push({
          slot: 'left_hand',
          type: 'armor',
          reduction: defense,
          durability: durability,
          resistance: unit.left_hand_resistance || null,
          name: unit.left_hand_name || '左手防具'
        });
      }
    }
    
    // 检查右手装备
    if (unit.right_hand_type === 'armor') {
      const defense = unit.right_hand_defense || 0;
      const durability = unit.right_hand_durability || 0;
      
      if (defense > 0 && durability > 0) {
        totalReduction += defense;
        sources.push({
          slot: 'right_hand',
          type: 'armor',
          reduction: defense,
          durability: durability,
          resistance: unit.right_hand_resistance || null,
          name: unit.right_hand_name || '右手防具'
        });
      }
    }
    
    // 检查额外装备 (如果有防具)
    if (unit.extra_type === 'armor') {
      const defense = unit.extra_defense || 0;
      const durability = unit.extra_durability || 0;
      
      if (defense > 0 && durability > 0) {
        totalReduction += defense;
        sources.push({
          slot: 'extra',
          type: 'armor',
          reduction: defense,
          durability: durability,
          resistance: unit.extra_resistance || null,
          name: unit.extra_name || '额外防具'
        });
      }
    }
    
    return {
      reduction: totalReduction,
      sources: sources
    };
  }
  
  /**
   * 消耗防具耐久度
   * @param {Object} unit - 单位对象
   * @returns {Object} { consumed: Array, destroyed: Array }
   */
  static consumeArmorDurability(unit) {
    const consumed = [];
    const destroyed = [];
    
    // 检查所有装备槽的防具
    const armorSlots = ['left_hand', 'right_hand', 'extra'];
    
    armorSlots.forEach(slot => {
      const typeKey = `${slot}_type`;
      const durabilityKey = `${slot}_durability`;
      const nameKey = `${slot}_name`;
      
      if (unit[typeKey] === 'armor' && unit[durabilityKey] > 0) {
        // 消耗 1 点耐久
        unit[durabilityKey] -= 1;
        
        consumed.push({
          slot: slot,
          durability_before: unit[durabilityKey] + 1,
          durability_after: unit[durabilityKey],
          name: unit[nameKey] || slot
        });
        
        // 检查是否摧毁
        if (unit[durabilityKey] <= 0) {
          destroyed.push({
            slot: slot,
            name: unit[nameKey] || slot,
            final_durability: 0
          });
          
          // 摧毁后移除装备
          unit[typeKey] = null;
          unit[durabilityKey] = 0;
          if (unit[`${slot}_defense`]) unit[`${slot}_defense`] = 0;
          if (unit[`${slot}_resistance`]) unit[`${slot}_resistance`] = null;
        }
      }
    });
    
    return {
      consumed: consumed,
      destroyed: destroyed
    };
  }
  
  /**
   * 获取单位的抗性类型列表
   * @param {Object} unit - 单位对象
   * @returns {Array<string>} 抗性类型数组
   */
  static getResistances(unit) {
    const resistances = [];
    
    const armorSlots = ['left_hand', 'right_hand', 'extra'];
    
    armorSlots.forEach(slot => {
      const typeKey = `${slot}_type`;
      const resistanceKey = `${slot}_resistance`;
      
      if (unit[typeKey] === 'armor' && unit[resistanceKey]) {
        if (!resistances.includes(unit[resistanceKey])) {
          resistances.push(unit[resistanceKey]);
        }
      }
    });
    
    return resistances;
  }
  
  /**
   * 检查单位是否有特定抗性
   * @param {Object} unit - 单位对象
   * @param {string} damageType - 伤害类型：'kinetic' | 'energy' | 'explosive'
   * @returns {boolean}
   */
  static hasResistance(unit, damageType) {
    const resistances = this.getResistances(unit);
    return resistances.includes(damageType);
  }
  
  /**
   * 获取单位所有装备的完整列表
   * @param {Object} unit - 单位对象
   * @returns {Array<Object>} 装备数组
   */
  static getAllEquipment(unit) {
    const equipment = [];
    
    const slots = ['left_hand', 'right_hand', 'extra'];
    
    slots.forEach(slot => {
      const typeKey = `${slot}_type`;
      
      if (unit[typeKey]) {
        const equip = {
          slot: slot,
          type: unit[typeKey],
          name: unit[`${slot}_name`] || slot
        };
        
        // 添加所有相关属性
        if (unit[`${slot}_melee`]) equip.melee = unit[`${slot}_melee`];
        if (unit[`${slot}_ranged`]) equip.ranged = unit[`${slot}_ranged`];
        if (unit[`${slot}_defense`]) equip.defense = unit[`${slot}_defense`];
        if (unit[`${slot}_durability`] !== undefined) equip.durability = unit[`${slot}_durability`];
        if (unit[`${slot}_resistance`]) equip.resistance = unit[`${slot}_resistance`];
        
        equipment.push(equip);
      }
    });
    
    return equipment;
  }
}

module.exports = EquipmentManager;
```

## combatCore/equipmentDurability.cjs

```js
/**
 * equipmentDurability.cjs - 装备耐久度管理模块
 * 
 * 管理战斗中装备耐久度的消耗、归零和加成移除。
 * 
 * 耐久度规则（按 Excel 设定器 + 战斗规则表）：
 *   武器：        结构 × 1，每次攻击消耗 1
 *   防具（装甲/盾牌）：固定 5，每次抵消伤害消耗 1
 *   载具（推进器）：结构 × 1 = 可被攻击次数
 *   背包（辅助）：  固定 5，被击中消耗
 *   全覆式装甲：  固定 5，对实体武器 -3 减免，消耗后失效
 *   抗性涂层：    固定 5，对光束武器 -3 减免，消耗后失效
 * 
 * 防具抵消规则：
 *   每次承受攻击时，若防具耐久 > 0：
 *     防具抵消 3 点伤害 → 耐久度 -1
 *     溢出伤害由单位 HP 承伤
 *   若装备了全覆式装甲 + 抗性涂层：
 *     对 kinetic(实体) 武器额外 -3，全覆式装甲耐久 -1
 *     对 beam(光束，含 energy/laser/em 别名) 武器额外 -3，抗性涂层耐久 -1
 */

const { normalizeDamageKind } = require('./skillContract.cjs');

class EquipmentDurability {
    constructor() {
        // 存储各单位装备耐久度快照 { unit_id: { equipment_slots } }
        this._state = {};
    }

    /**
     * 注册单位的装备耐久度
     * @param {Object} unit - 战斗单位
     */
    register(unit) {
        if (!unit || !unit.id && !unit.unit_id) return;
        const uid = unit.id || unit.unit_id;

        this._state[uid] = {
            // 装备槽位耐久度
            left_hand: {
                type: unit.left_hand_type,
                durability: unit.left_hand_durability || 0,
                melee: unit.left_hand_melee || 0,
                ranged: unit.left_hand_ranged || 0,
                defense: unit.left_hand_defense || 0,
                resistance: unit.left_hand_resistance || null
            },
            right_hand: {
                type: unit.right_hand_type,
                durability: unit.right_hand_durability || 0,
                melee: unit.right_hand_melee || 0,
                ranged: unit.right_hand_ranged || 0,
                defense: unit.right_hand_defense || 0,
                resistance: unit.right_hand_resistance || null
            },
            extra: {
                type: unit.extra_type,
                durability: unit.extra_durability || 0,
                melee: unit.extra_melee || 0,
                ranged: unit.extra_ranged || 0,
                defense: unit.extra_defense || 0,
                resistance: unit.extra_resistance || null
            },
            // 特殊装备耐久度
            special_full_armor: (unit.equipment && unit.equipment.full_armor) ? 5 : 0,
            special_coating: (unit.equipment && unit.equipment.coating) ? 5 : 0
        };
    }

    /**
     * 应用伤害到防具/特殊装备（在 DamagePipe 计算完成后调用）
     * 防具每次抵消 3 点伤害，消耗 1 耐久
     * 全覆式装甲对 kinetic(实体) 额外 -3，抗性涂层对 beam(光束) 额外 -3
     *
     * @param {Object} unit - 防御方单位
     * @param {number} incomingDamage - 原始伤害
     * @param {string} weaponType - 攻击方伤害种类（经别名归一：energy/laser/em→beam）
     * @returns {Object} { remaining_damage, absorbed, changes[] }
     */
    applyDamage(unit, incomingDamage, weaponType = 'kinetic') {
        if (!unit || incomingDamage <= 0) {
            return { remaining_damage: incomingDamage || 0, absorbed: 0, changes: [] };
        }

        // P0-2: 武器类型归一为权威伤害种类（energy/laser/em 等别名统一映射为 beam）
        const dk = normalizeDamageKind(weaponType);

        const uid = unit.id || unit.unit_id;
        if (!this._state[uid]) {
            return { remaining_damage: incomingDamage, absorbed: 0, changes: [] };
        }

        const state = this._state[uid];
        let remaining = incomingDamage;
        let absorbed = 0;
        const changes = [];

        // 1. 防具抵消伤害（装甲/盾牌）
        const armorSlots = ['left_hand', 'right_hand', 'extra'].filter(
            slot => state[slot].type === 'armor' && state[slot].durability > 0
        );

        for (const slot of armorSlots) {
            if (remaining <= 0) break;
            const armor = state[slot];
            const absorbAmount = Math.min(remaining, 3);
            remaining -= absorbAmount;
            absorbed += absorbAmount;
            armor.durability -= 1;

            changes.push({
                type: 'armor_absorb',
                slot,
                absorbed: absorbAmount,
                durability_after: armor.durability,
                broken: armor.durability <= 0
            });

            // 耐久归零 → 移除加成
            if (armor.durability <= 0) {
                this._onEquipmentBroken(unit, slot, armor);
            }
        }

        // 2. 全覆式装甲抵消（kinetic 实体武器）
        if (remaining > 0 && state.special_full_armor > 0 && dk === 'kinetic') {
            const absorbAmount = Math.min(remaining, 3);
            remaining -= absorbAmount;
            absorbed += absorbAmount;
            state.special_full_armor -= 1;

            changes.push({
                type: 'full_armor_absorb',
                absorbed: absorbAmount,
                durability_after: state.special_full_armor,
                broken: state.special_full_armor <= 0
            });

            if (state.special_full_armor <= 0 && unit.equipment) {
                unit.equipment.full_armor = false;
            }
        }

        // 3. 抗性涂层抵消（beam 光束武器，含 energy/laser/em 别名）
        if (remaining > 0 && state.special_coating > 0 && dk === 'beam') {
            const absorbAmount = Math.min(remaining, 3);
            remaining -= absorbAmount;
            absorbed += absorbAmount;
            state.special_coating -= 1;

            changes.push({
                type: 'coating_absorb',
                absorbed: absorbAmount,
                durability_after: state.special_coating,
                broken: state.special_coating <= 0
            });

            if (state.special_coating <= 0 && unit.equipment) {
                unit.equipment.coating = false;
            }
        }

        return {
            remaining_damage: remaining,
            absorbed,
            changes,
            message: `耐久度结算：吸收 ${absorbed} 点伤害，${remaining} 点由 HP 承受`
        };
    }

    /**
     * 消耗武器耐久度（攻击方每次攻击 -1）
     */
    consumeWeaponDurability(unit) {
        if (!unit) return;
        const uid = unit.id || unit.unit_id;
        if (!this._state[uid]) return;

        const weaponSlots = ['left_hand', 'right_hand', 'extra'].filter(
            slot => this._state[uid][slot].type === 'weapon' && this._state[uid][slot].durability > 0
        );

        for (const slot of weaponSlots) {
            const weapon = this._state[uid][slot];
            weapon.durability -= 1;

            if (weapon.durability <= 0) {
                this._onEquipmentBroken(unit, slot, weapon);
            }
            break; // 每次攻击最多消耗一个武器槽
        }
    }

    /**
     * 装备耐久度归零 → 移除加成
     * @private
     */
    _onEquipmentBroken(unit, slot, equipData) {
        equipData.broken = true;

        switch (equipData.type) {
            case 'weapon':
                // 武器损坏：移除攻击加成
                unit[`${slot}_hand_melee`] = 0;
                unit[`${slot}_hand_ranged`] = 0;
                break;
            case 'armor':
                // 防具损坏：移除防御加成和护盾
                unit[`${slot}_hand_defense`] = 0;
                unit.shield = Math.max(0, (unit.shield || 0) - equipData.defense);
                break;
            case 'thruster':
                // 载具损坏：移除机动加成
                unit.mobility = Math.max(0, (unit.mobility || 0) - Math.floor((equipData.durability || 0) * 0.5));
                break;
            case 'support':
                // 背包损坏：移除辅助加成
                unit[`${slot}_hand_defense`] = 0;
                break;
        }
    }

    /**
     * 获取装备耐久度
     */
    getDurability(unit, slot) {
        if (!unit) return 0;
        const uid = unit.id || unit.unit_id;
        if (!this._state[uid]) return 0;
        if (slot.startsWith('special_')) {
            return this._state[uid][slot] || 0;
        }
        return this._state[uid][slot] ? this._state[uid][slot].durability : 0;
    }

    /**
     * 重置所有状态
     */
    reset() {
        this._state = {};
    }
}

module.exports = EquipmentDurability;
```

## combatCore/factionSkillRegistry.cjs

```js
/**
 * 阵营技能注册表
 * 定义三大阵营的核心技能及触发条件
 * 
 * 阵营风格:
 * - 地球联合 (earth): 防御型 - 火力覆盖、阵地战
 * - 拜隆 (balon): 均衡型 - 增援系统、协同作战
 * - 马克西翁 (maxion): 机动型 - 迷雾系统、机动游击
 * 
 * 奇袭系统 (surprise) 单独处理，涉及隐身机制
 */

const DamagePipe = require('./damagePipe.cjs');
const BuffManager = require('./buffManager.cjs');

/**
 * 阵营ID枚举
 */
const FACTION_IDS = {
  EARTH: 'earth',      // 地球联合
  BALON: 'balon',      // 拜隆
  MAXION: 'maxion'     // 马克西翁
};

/**
 * 阵营技能注册表
 */
const FactionSkillRegistry = {
  /**
   * 地球联合技能
   */
  [FACTION_IDS.EARTH]: {
    id: FACTION_IDS.EARTH,
    name: '地球联合',
    style: 'defensive',  // 防御型
    description: '以火力优势和坚固防线著称',
    
    skills: {
      /**
       * 技能1: 火力覆盖
       * 回合开始时可使用，对指定区域进行AOE打击
       */
      artillery: {
        id: 'artillery',
        name: '火力覆盖',
        description: '对目标区域发射弹幕，造成范围伤害',
        type: 'area_damage',
        
        // 触发条件
        trigger: {
          phase: 'turn_start',
          type: 'action_available'  // 可选行动
        },
        
        // 技能参数
        params: {
          damage: 15,           // 基础伤害
          radius: 2,             // 范围半径
          cooldown: 3,           // 冷却回合
          terrain_interaction: true  // 受地形影响
        },
        
        /**
         * 执行技能
         */
        execute({ caster, centerQ, centerR, units, battlefieldState }) {
          const result = {
            skill_id: 'artillery',
            skill_name: '火力覆盖',
            caster_id: caster.id,
            caster_name: caster.name,
            center: { q: centerQ, r: centerR },
            params: this.params,
            damage: this.params.damage,
            radius: this.params.radius,
            units_affected: [],
            logs: []
          };

          // 遍历所有单位，计算范围伤害
          units.forEach(unit => {
            const distance = DamagePipe.calculateHexDistance(
              { q: centerQ, r: centerR },
              { q: unit.q, r: unit.r }
            );
            
            if (distance <= result.radius) {
              // 计算地形减伤
              const terrain = DamagePipe.getTerrainAt(unit.q, unit.r, battlefieldState);
              const terrainReduction = terrain === 'mountain' ? 5 : 
                                       terrain === 'crater' ? 3 : 0;
              
              const finalDamage = Math.max(0, result.damage - terrainReduction);
              unit.hp = Math.max(0, unit.hp - finalDamage);
              
              result.units_affected.push({
                unit_id: unit.id,
                unit_name: unit.name,
                faction: unit.faction,
                distance: distance,
                damage_taken: finalDamage,
                hp_remaining: unit.hp,
                terrain_effect: terrainReduction > 0 ? `地形减伤${terrainReduction}` : '无'
              });
              
              result.logs.push({
                type: 'artillery_hit',
                unit_name: unit.name,
                faction: unit.faction,
                damage: finalDamage,
                hp_remaining: unit.hp,
                terrain: terrain
              });
              
              // 检查是否摧毁
              if (unit.hp <= 0) {
                result.logs.push({
                  type: 'artillery_destroyed',
                  unit_name: unit.name
                });
              }
            }
          });

          result.logs.push({
            type: 'artillery_fired',
            center: { q: centerQ, r: centerR },
            units_hit: result.units_affected.length
          });

          return result;
        }
      },

      /**
       * 技能2: 坚固阵地 (被动)
       * 当地球联合单位处于防御姿态时获得额外减伤
       */
      fortified_position: {
        id: 'fortified_position',
        name: '坚固阵地',
        description: '处于防御姿态时获得额外减伤',
        type: 'passive',
        
        trigger: {
          phase: 'on_damage_taken',
          type: 'passive'
        },
        
        params: {
          damage_reduction: 3,   // 额外减伤
          condition: 'defensive_stance'  // 需要防御姿态
        },
        
        /**
         * 检查被动效果
         */
        checkCondition(unit) {
          return unit.stance === 'defensive' || (unit.faction_buff && unit.faction_buff.includes('defensive_stance'));
        },
        
        /**
         * 执行被动效果
         */
        execute({ unit, damage }) {
          if (this.checkCondition(unit)) {
            return {
              skill_id: 'fortified_position',
              triggered: true,
              damage_reduction: this.params.damage_reduction,
              final_damage: Math.max(0, damage - this.params.damage_reduction)
            };
          }
          return { triggered: false };
        }
      }
    }
  },

  /**
   * 拜隆技能
   */
  [FACTION_IDS.BALON]: {
    id: FACTION_IDS.BALON,
    name: '拜隆',
    style: 'balanced',  // 均衡型
    description: '擅长协同作战和战场支援',
    
    skills: {
      /**
       * 技能1: 增援系统
       * 当拜隆单位被攻击时，附近友军可分担伤害
       */
      reinforcement: {
        id: 'reinforcement',
        name: '增援',
        description: '被攻击时，附近友军可分担伤害',
        type: 'reactive_support',
        
        trigger: {
          phase: 'on_ally_attacked',
          type: 'reactive'
        },
        
        params: {
          range: 2,                // 增援范围
          damage_share: 0.5,        // 分担50%伤害
          max_supporters: 1        // 最多1个增援单位
        },
        
        /**
         * 获取可增援的单位
         */
        getSupportUnits(target, units) {
          return units.filter(unit => {
            if (unit.faction !== FACTION_IDS.BALON) return false;
            if (unit.id === target.id) return false;
            if (unit.hp <= 0) return false;
            
            const distance = DamagePipe.calculateHexDistance(unit, target);
            return distance <= this.params.range;
          });
        },
        
        /**
         * 执行增援
         */
        execute({ target, damage, availableSupportUnits }) {
          const result = {
            skill_id: 'reinforcement',
            skill_name: '增援',
            target_id: target.id,
            target_name: target.name,
            original_damage: damage,
            logs: []
          };

          if (!availableSupportUnits || availableSupportUnits.length === 0) {
            result.logs.push({
              type: 'reinforcement_no_units',
              note: '范围内无增援单位'
            });
            return result;
          }

          // 选择最近的增援单位
          const supporter = availableSupportUnits[0];
          const damageShare = Math.floor(damage * this.params.damage_share);
          
          // 增援单位承受部分伤害
          supporter.hp = Math.max(0, supporter.hp - damageShare);
          
          // 目标减少伤害
          target.hp += damageShare;
          
          result.support_unit = {
            id: supporter.id,
            name: supporter.name,
            damage_taken: damageShare,
            hp_remaining: supporter.hp
          };
          
          result.damage_reduced = damageShare;
          result.final_damage = damage - damageShare;
          
          result.logs.push({
            type: 'reinforcement_activated',
            support_unit: supporter.name,
            damage_shared: damageShare,
            support_unit_hp: supporter.hp,
            target_hp: target.hp
          });

          // 检查增援单位是否被摧毁
          if (supporter.hp <= 0) {
            result.logs.push({
              type: 'reinforcement_supporter_destroyed',
              unit_name: supporter.name
            });
          }

          return result;
        }
      },

      /**
       * 技能2: 协同攻击 (被动)
       * 当友军在攻击范围内时获得攻击加成
       */
      coordinated_attack: {
        id: 'coordinated_attack',
        name: '协同攻击',
        description: '友军在攻击范围内时获得攻击加成',
        type: 'passive',
        
        trigger: {
          phase: 'pre_attack',
          type: 'passive'
        },
        
        params: {
          attack_bonus: 2,
          range: 2
        },
        
        /**
         * 检查是否有友军在范围内
         */
        checkCondition(attacker, units) {
          const alliesInRange = units.filter(unit => {
            if (unit.faction !== attacker.faction) return false;
            if (unit.id === attacker.id) return false;
            if (unit.hp <= 0) return false;
            
            const distance = DamagePipe.calculateHexDistance(unit, attacker);
            return distance <= this.params.range;
          });
          
          return {
            has_allies: alliesInRange.length > 0,
            allies: alliesInRange
          };
        },
        
        execute({ attacker, units }) {
          const check = this.checkCondition(attacker, units);
          if (check.has_allies) {
            return {
              skill_id: 'coordinated_attack',
              triggered: true,
              attack_bonus: this.params.attack_bonus,
              allies_count: check.allies.length
            };
          }
          return { triggered: false };
        }
      }
    }
  },

  /**
   * 马克西翁技能
   */
  [FACTION_IDS.MAXION]: {
    id: FACTION_IDS.MAXION,
    name: '马克西翁',
    style: 'mobile',  // 机动型
    description: '擅长机动游击战和战场控制',
    
    skills: {
      /**
       * 技能1: 迷雾系统
       * 回合开始时，根据骰子结果给所有马克西翁单位施加Buff
       */
      fog_system: {
        id: 'fog_system',
        name: '迷雾',
        description: '释放迷雾，根据骰子结果获得不同Buff',
        type: 'area_buff',
        
        trigger: {
          phase: 'turn_start',
          type: 'auto_trigger'  // 自动触发
        },
        
        params: {
          duration: 2,
          dice_sides: 6,
          effects: {
            1: { buff_type: 'defense', value: 2, name: '防御强化' },
            2: { buff_type: 'defense', value: 2, name: '防御强化' },
            3: { buff_type: 'mobility', value: 1, name: '机动强化' },
            4: { buff_type: 'mobility', value: 1, name: '机动强化' },
            5: { buff_type: 'attack', value: 1, name: '攻击强化' },
            6: { buff_type: 'attack', value: 1, name: '攻击强化' }
          }
        },
        
        /**
         * 执行迷雾系统
         */
        execute({ units, battlefieldState }) {
          const result = {
            skill_id: 'fog_system',
            skill_name: '迷雾',
            params: this.params,
            units_affected: [],
            logs: []
          };

          // 掷骰子决定效果
          const roll = DamagePipe.rollDice(this.params.dice_sides);
          const effect = this.params.effects[roll];
          
          result.roll = roll;
          result.effect = effect;
          
          // 获取所有马克西翁单位
          const maxionUnits = units.filter(u => u.faction === FACTION_IDS.MAXION && u.hp > 0);
          
          maxionUnits.forEach(unit => {
            const buffType = effect.buff_type === 'defense' ? BuffManager.BUFF_TYPES.DEFENSE :
                            effect.buff_type === 'mobility' ? BuffManager.BUFF_TYPES.MOBILITY :
                            BuffManager.BUFF_TYPES.ATTACK;
            
            const applied = BuffManager.applyBuff(unit, buffType, effect.value, this.params.duration);
            
            result.units_affected.push({
              unit_id: unit.id,
              unit_name: unit.name,
              buff: `+${effect.value}${effect.buff_type === 'defense' ? '防御' : effect.buff_type === 'mobility' ? '机动' : '攻击'}`,
              duration: this.params.duration,
              previousValue: applied.previousValue
            });
          });

          result.logs.push({
            type: 'fog_system_activated',
            roll: roll,
            effect: effect.name,
            units_affected: maxionUnits.length,
            duration: this.params.duration
          });

          return result;
        }
      },

      /**
       * 技能2: 机动打击 (被动)
       * 攻击后有几率获得额外机动
       */
      mobile_strike: {
        id: 'mobile_strike',
        name: '机动打击',
        description: '攻击后有几率获得额外机动',
        type: 'passive',
        
        trigger: {
          phase: 'post_attack',
          type: 'passive'
        },
        
        params: {
          trigger_chance: 0.5,  // 50%几率
          mobility_bonus: 1,
          duration: 1
        },
        
        execute({ attacker, roll }) {
          // 需要掷骰超过阈值才触发
          const triggerRoll = DamagePipe.rollDice(10);
          
          if (triggerRoll > 5) {  // >5 触发
            const applied = BuffManager.applyBuff(
              attacker,
              BuffManager.BUFF_TYPES.MOBILITY,
              this.params.mobility_bonus,
              this.params.duration
            );
            
            return {
              skill_id: 'mobile_strike',
              triggered: true,
              roll: triggerRoll,
              mobility_bonus: this.params.mobility_bonus,
              previousValue: applied.previousValue,
              duration: this.params.duration
            };
          }
          
          return { triggered: false };
        }
      },

      /**
       * 技能3: 战术撤退 (被动)
       * 当HP低于30%时，机动性提升
       */
      tactical_retreat: {
        id: 'tactical_retreat',
        name: '战术撤退',
        description: 'HP低于30%时获得机动加成',
        type: 'passive',
        
        trigger: {
          phase: 'turn_start',
          type: 'conditional_passive'
        },
        
        params: {
          hp_threshold: 0.3,  // 30%HP
          mobility_bonus: 2
        },
        
        checkCondition(unit) {
          const maxHp = unit.max_hp || unit.hp;
          return unit.hp / maxHp <= this.params.hp_threshold;
        },
        
        execute({ unit }) {
          if (this.checkCondition(unit)) {
            const applied = BuffManager.applyBuff(
              unit,
              BuffManager.BUFF_TYPES.MOBILITY,
              this.params.mobility_bonus,
              1  // 持续1回合
            );
            
            return {
              skill_id: 'tactical_retreat',
              triggered: true,
              hp_percent: Math.round((unit.hp / (unit.max_hp || unit.hp)) * 100),
              mobility_bonus: this.params.mobility_bonus
            };
          }
          return { triggered: false };
        }
      }
    }
  }
};

/**
 * 获取阵营技能
 */
function getFactionSkill(faction, skillId) {
  const factionData = FactionSkillRegistry[faction];
  if (!factionData) return null;
  return factionData.skills[skillId] || null;
}

/**
 * 获取阵营所有技能
 */
function getFactionSkills(faction) {
  const factionData = FactionSkillRegistry[faction];
  if (!factionData) return [];
  return Object.values(factionData.skills);
}

/**
 * 获取阵营信息
 */
function getFactionInfo(faction) {
  return FactionSkillRegistry[faction] || null;
}

/**
 * 检查单位是否拥有某技能
 */
function unitHasSkill(unit, skillId) {
  const skill = getFactionSkill(unit.faction, skillId);
  return skill !== null;
}

/**
 * 获取单位所有可用技能
 */
function getUnitSkills(unit) {
  return getFactionSkills(unit.faction);
}

module.exports = {
  FactionSkillRegistry,
  FACTION_IDS,
  getFactionSkill,
  getFactionSkills,
  getFactionInfo,
  unitHasSkill,
  getUnitSkills
};
```

## combatCore/hookChain.cjs

```js
/**
 * HookChain - 钩子链系统
 * 
 * 职责:
 * 1. 管理战斗中的钩子点（对应 trigger.phase 枚举值）
 * 2. 按优先级排序执行注册的词条处理器
 * 3. 实现条件检查与效果执行流水线
 * 4. 支持中断机制（interrupt）
 */

const tagRegistry = require('./tagRegistry.cjs');
const ConditionEvaluator = require('./conditionEvaluator.cjs');
const EffectExecutor = require('./effectExecutor.cjs');

class HookChain {
  constructor() {
    // 定义所有钩子点（对应 trigger.phase）
    this.hooks = {
      // 轮次/回合钩子
      round_start: [],      // 轮次开始
      turn_start: [],       // 回合开始
      turn_end: [],         // 回合结束
      
      // 攻击阶段钩子
      pre_attack: [],       // 攻击前
      on_attack: [],        // 攻击时
      post_attack: [],      // 攻击后
      
      // 伤害阶段钩子
      pre_damage: [],       // 伤害计算前
      on_damage: [],        // 伤害计算时
      post_damage: [],      // 伤害结算后
      
      // 击杀/死亡钩子
      on_kill: [],          // 击杀时
      on_death: [],         // 死亡时
      
      // 受击/防御钩子
      on_defended: [],      // 被攻击时
      on_damage_taken: [],  // 受到伤害时
      on_ally_attacked: [], // 友军被攻击时
      
      // 移动钩子
      movement_check: [],   // 移动判定
      movement_end: [],      // 移动结束
      
      // 特殊钩子
      on_airdrop_receive: [], // 获得空投
      on_buff_expire: [],   // Buff过期
    };
    
    // 执行上下文缓存
    this.context = null;
  }

  /**
   * 注册词条到指定钩子
   * @param {string} phase - 钩子阶段
   * @param {object} tag - 词条定义
   * @param {function} handler - 处理函数
   */
  register(phase, tag, handler) {
    if (!this.hooks[phase]) {
      console.warn(`[HookChain] 未知钩子阶段: ${phase}`);
      return;
    }
    
    this.hooks[phase].push({
      tag,
      handler,
      priority: tag.params?.priority || 0
    });
    
    // 按优先级排序（高优先级在前）
    this.hooks[phase].sort((a, b) => b.priority - a.priority);
  }

  /**
   * 从注册表自动加载词条到对应钩子
   */
  loadFromRegistry() {
    const phases = Object.keys(this.hooks);
    
    phases.forEach(phase => {
      const tags = tagRegistry.getTagsForPhase(phase);
      tags.forEach(tag => {
        this.register(phase, tag, this.createTagHandler(tag));
      });
    });
    
    console.log('[HookChain] 已从注册表加载词条');
    return this.getSummary();
  }

  /**
   * 创建词条处理器
   * @param {object} tag - 词条定义
   * @returns {function} 处理函数
   */
  createTagHandler(tag) {
    return async (context) => {
      // 1. 检查条件
      const canTrigger = await this.checkConditions(tag, context);
      if (!canTrigger) {
        return { triggered: false, reason: 'conditions_not_met' };
      }
      
      // 2. 检查是否是可选触发
      if (tag.params?.optional && !context.userConfirmed) {
        return { 
          triggered: false, 
          reason: 'waiting_user_confirm',
          tag: tag.id,
          name: tag.name
        };
      }
      
      // 3. 执行效果
      const result = await this.executeEffects(tag, context);
      
      // 4. 处理消耗性词条
      if (tag.params?.consumable) {
        result.consumed = true;
      }
      
      // 5. 处理中断
      if (tag.params?.interrupt && result.success) {
        result.interrupt = true;
      }
      
      return {
        triggered: true,
        tag: tag.id,
        name: tag.name,
        ...result
      };
    };
  }

  /**
   * 检查词条触发条件 - 使用 ConditionEvaluator
   * @param {object} tag - 词条定义
   * @param {object} context - 执行上下文
   * @returns {boolean} 是否满足条件
   */
  async checkConditions(tag, context) {
    return ConditionEvaluator.evaluate(tag.conditions, context);
  }

  /**
   * 执行词条效果 - 使用 EffectExecutor
   * @param {object} tag - 词条定义
   * @param {object} context - 执行上下文
   * @returns {object} 执行结果汇总
   */
  async executeEffects(tag, context) {
    const results = await EffectExecutor.execute(tag.effects, context);
    return {
      success: results.every(r => r.success !== false),
      results
    };
  }

  /**
   * 掷骰
   * @param {number} sides - 骰子面数
   * @returns {number}
   */
  rollDice(sides = 6) {
    return Math.floor(Math.random() * sides) + 1;
  }

  /**
   * 执行钩子链
   * @param {string} phase - 钩子阶段
   * @param {object} context - 执行上下文
   * @returns {object} 执行结果汇总
   */
  async execute(phase, context) {
    if (!this.hooks[phase]) {
      return { phase, executed: [], errors: [`未知阶段: ${phase}`] };
    }
    
    const hooks = this.hooks[phase];
    const results = [];
    const errors = [];
    
    // 设置当前上下文
    this.context = context;
    
    for (const hook of hooks) {
      try {
        const result = await hook.handler(context);
        results.push(result);
        
        // 处理中断
        if (result.interrupt) {
          results.push({ interrupted: true, by: hook.tag.id });
          break;
        }
      } catch (error) {
        console.error(`[HookChain] 执行词条失败: ${hook.tag.id}`, error);
        errors.push({ tag: hook.tag.id, error: error.message });
      }
    }
    
    // 清理上下文
    this.context = null;
    
    return {
      phase,
      executed: results.length,
      results,
      errors: errors.length > 0 ? errors : undefined
    };
  }

  /**
   * 快速执行指定阶段的词条（不注册，直接执行）
   * @param {string} phase - 钩子阶段
   * @param {object} context - 执行上下文
   * @returns {object}
   */
  async executePhase(phase, context) {
    // 获取该阶段的所有词条
    const tags = tagRegistry.getTagsForPhase(phase);
    const results = [];
    
    for (const tag of tags) {
      const handler = this.createTagHandler(tag);
      const result = await handler(context);
      results.push(result);
      
      // 处理中断
      if (result.interrupt) {
        break;
      }
    }
    
    return {
      phase,
      total: tags.length,
      triggered: results.filter(r => r.triggered).length,
      results
    };
  }

  /**
   * 获取钩子链摘要
   */
  getSummary() {
    return Object.entries(this.hooks).map(([phase, hooks]) => ({
      phase,
      count: hooks.length,
      tags: hooks.map(h => ({ id: h.tag.id, priority: h.priority }))
    }));
  }

  /**
   * 清空所有钩子
   */
  clear() {
    Object.keys(this.hooks).forEach(phase => {
      this.hooks[phase] = [];
    });
    this.context = null;
  }
}

// 单例导出
module.exports = new HookChain();
```

## combatCore/index.cjs

```js
/**
 * CombatCore 模块导出
 * 战斗核心模块化组件
 */

const DamagePipe = require('./damagePipe.cjs');
const BuffManager = require('./buffManager.cjs');
const EquipManager = require('./equipManager.cjs');
const TagRegistry = require('./tagRegistry.cjs');
const TagProcessor = require('./tagProcessor.cjs');
const FactionSkillRegistry = require('./factionSkillRegistry.cjs');
const HookChain = require('./hookChain.cjs');
const ConditionEvaluator = require('./conditionEvaluator.cjs');
const EffectExecutor = require('./effectExecutor.cjs');
const TagDatabaseManager = require('./tagDatabaseManager.cjs');
const { PriorityQueue, TagQueue, ActionQueue } = require('./priorityQueue.cjs');
const TagChainManager = require('./tagChainManager.cjs');
const CombatIntegrator = require('./combatIntegrator.cjs');
const UnitTypeManager = require('./unitTypeManager.cjs');
const TerrainMovement = require('./terrainMovement.cjs');

module.exports = {
  // 核心组件
  DamagePipe,
  BuffManager,
  EquipManager,
  EquipmentManager: EquipManager, // 别名兼容
  UnitTypeManager,
  TerrainMovement,

  // 词条系统
  TagRegistry,
  TagProcessor,
  TagDatabaseManager,
  TagChainManager,
  HookChain,
  ConditionEvaluator,
  EffectExecutor,

  // 阵营技能
  FactionSkillRegistry,

  // 队列系统
  PriorityQueue,
  TagQueue,
  ActionQueue,

  // 集成器
  CombatIntegrator
};
```

## combatCore/phase8-ai-system.test.cjs

```js
/**
 * Phase 8: 人机AI系统测试
 */

const assert = require('assert');

console.log('═══════════════════════════════════════════════════════════════');
console.log('【Phase 8: 人机AI系统测试】');
console.log('═══════════════════════════════════════════════════════════════\n');

let testsPassed = 0;
let testsFailed = 0;

function test(name, fn) {
  try {
    fn();
    console.log(`  ✅ ${name}`);
    testsPassed++;
  } catch (error) {
    console.log(`  ❌ ${name}`);
    console.log(`     Error: ${error.message}`);
    testsFailed++;
  }
}

// 导入模块
const { AIEngine, AI_DIFFICULTY } = require('./aiEngine.cjs');
const { bt, NODE_STATUS } = require('./behaviorTree.cjs');
const { createStrategy, AggressiveStrategy, DefensiveStrategy, BalancedStrategy, manhattanDistance } = require('./aiStrategies.cjs');
const { getDifficultyConfig, AIDifficultyProxy, getAllDifficulties, compareDifficulty } = require('./aiDifficulty.cjs');
const { AICombatController } = require('./aiIntegration.cjs');

console.log('【AIEngine 引擎测试】\n');

test('AI引擎应该能正确初始化', () => {
  const mockCombatCore = {};
  const engine = new AIEngine(mockCombatCore, { difficulty: AI_DIFFICULTY.NORMAL });
  assert.strictEqual(engine.difficulty, AI_DIFFICULTY.NORMAL);
  assert.strictEqual(engine.enabled, false);
});

test('AI引擎应该能注册和注销AI单位', () => {
  const engine = new AIEngine({});
  engine.registerAIUnit('unit_001', 'earth');
  assert.strictEqual(engine.isAIUnit('unit_001'), true);
  assert.strictEqual(engine.isAIUnit('unit_002'), false);
  
  engine.unregisterAIUnit('unit_001');
  assert.strictEqual(engine.isAIUnit('unit_001'), false);
});

test('AI引擎应该能获取AI单位列表', () => {
  const engine = new AIEngine({});
  engine.registerAIUnit('unit_001', 'earth');
  engine.registerAIUnit('unit_002', 'bailun');
  
  const units = engine.getAIUnits();
  assert.strictEqual(units.length, 2);
});

test('AI引擎应该能设置难度', () => {
  const engine = new AIEngine({});
  engine.setDifficulty(AI_DIFFICULTY.HARD);
  assert.strictEqual(engine.difficulty, AI_DIFFICULTY.HARD);
});

test('AI引擎应该能启用和禁用', () => {
  const engine = new AIEngine({});
  engine.enable();
  assert.strictEqual(engine.enabled, true);
  engine.disable();
  assert.strictEqual(engine.enabled, false);
});

console.log('\n【行为树测试】\n');

test('选择器节点应该按顺序执行直到成功', async () => {
  let counter = 0;
  const selector = bt.selector('TestSelector')
    .addChild(bt.action('fail', async () => { counter++; return false; }))
    .addChild(bt.action('success', async () => { counter++; return true; }))
    .addChild(bt.action('never', async () => { counter++; return true; }));
  
  const result = await selector.execute({});
  assert.strictEqual(result, NODE_STATUS.SUCCESS);
  assert.strictEqual(counter, 2); // 应该停在第二个
});

test('序列器节点应该执行全部子节点', async () => {
  let counter = 0;
  const sequence = bt.sequence('TestSequence')
    .addChild(bt.action('first', async () => { counter++; return true; }))
    .addChild(bt.action('second', async () => { counter++; return true; }));
  
  const result = await sequence.execute({});
  assert.strictEqual(result, NODE_STATUS.SUCCESS);
  assert.strictEqual(counter, 2);
});

test('序列器节点遇到失败应该停止', async () => {
  let counter = 0;
  const sequence = bt.sequence('TestSequence')
    .addChild(bt.action('first', async () => { counter++; return true; }))
    .addChild(bt.action('fail', async () => { counter++; return false; }))
    .addChild(bt.action('never', async () => { counter++; return true; }));
  
  const result = await sequence.execute({});
  assert.strictEqual(result, NODE_STATUS.FAILURE);
  assert.strictEqual(counter, 2);
});

test('条件节点应该正确检查条件', async () => {
  const condition = bt.condition('test', async (ctx) => ctx.value > 5);
  
  const successResult = await condition.execute({ value: 10 });
  assert.strictEqual(successResult, NODE_STATUS.SUCCESS);
  
  condition.reset();
  const failResult = await condition.execute({ value: 3 });
  assert.strictEqual(failResult, NODE_STATUS.FAILURE);
});

console.log('\n【AI策略测试】\n');

test('应该能创建攻击型策略', () => {
  const engine = new AIEngine({});
  const strategy = createStrategy(engine, AI_DIFFICULTY.EASY);
  assert.ok(strategy instanceof AggressiveStrategy);
});

test('应该能创建平衡型策略', () => {
  const engine = new AIEngine({});
  const strategy = createStrategy(engine, AI_DIFFICULTY.NORMAL);
  assert.ok(strategy instanceof BalancedStrategy);
});

test('应该能创建防守型策略', () => {
  const engine = new AIEngine({});
  const strategy = new DefensiveStrategy(engine, AI_DIFFICULTY.NORMAL);
  assert.ok(strategy instanceof DefensiveStrategy);
});

test('攻击型策略应该优先攻击可攻击目标', async () => {
  const engine = new AIEngine({});
  const strategy = new AggressiveStrategy(engine, AI_DIFFICULTY.EASY);
  
  const gameState = {
    units: [
      { id: 'unit_1', faction: 'earth', position: { q: 0, r: 0 }, hp: 50, attack_range: 2 },
      { id: 'unit_2', faction: 'bailun', position: { q: 1, r: 0 }, hp: 30, attack_range: 1 },
      { id: 'unit_3', faction: 'bailun', position: { q: 0, r: 0 }, hp: 20, attack_range: 1 }
    ]
  };
  
  const decision = await strategy.decide('unit_1', gameState);
  assert.strictEqual(decision.type, 'attack');
  assert.strictEqual(decision.target.id, 'unit_3'); // 应该选择HP最低的
});

test('攻击型策略在无目标时应移动向敌人', async () => {
  const engine = new AIEngine({});
  const strategy = new AggressiveStrategy(engine, AI_DIFFICULTY.EASY);
  
  const gameState = {
    units: [
      { id: 'unit_1', faction: 'earth', position: { q: 0, r: 0 }, hp: 50, attack_range: 1, mobility: 3 },
      { id: 'unit_2', faction: 'bailun', position: { q: 5, r: 0 }, hp: 30, attack_range: 1 }
    ]
  };
  
  const decision = await strategy.decide('unit_1', gameState);
  assert.strictEqual(decision.type, 'move');
});

test('距离计算应该正确', () => {
  const a = { q: 0, r: 0 };
  const b = { q: 3, r: 0 };
  assert.strictEqual(manhattanDistance(a, b), 3);
  
  const c = { q: 2, r: 3 };
  assert.strictEqual(manhattanDistance(a, c), 5);
});

console.log('\n【难度分级测试】\n');

test('应该能获取所有难度列表', () => {
  const difficulties = getAllDifficulties();
  assert.strictEqual(difficulties.length, 3);
  assert.strictEqual(difficulties[0].name, '简单');
  assert.strictEqual(difficulties[1].name, '普通');
  assert.strictEqual(difficulties[2].name, '困难');
});

test('应该能获取难度配置', () => {
  const config = getDifficultyConfig(AI_DIFFICULTY.HARD);
  assert.strictEqual(config.name, '困难');
  assert.strictEqual(config.useRandomness, false);
  assert.strictEqual(config.accuracy, 0.95);
});

test('难度代理应该应用随机性', () => {
  const baseAI = { enabled: true };
  const proxy = new AIDifficultyProxy(baseAI, AI_DIFFICULTY.EASY);
  
  const original = { type: 'attack', unitId: 'u1', target: {} };
  // 简单难度有30%概率随机行动
  const result = proxy.applyRandomness(original);
  assert.ok(result.hasOwnProperty('isRandom'));
});

test('难度比较应该正确', () => {
  assert.strictEqual(compareDifficulty(AI_DIFFICULTY.EASY, AI_DIFFICULTY.HARD), -2);
  assert.strictEqual(compareDifficulty(AI_DIFFICULTY.NORMAL, AI_DIFFICULTY.NORMAL), 0);
  assert.strictEqual(compareDifficulty(AI_DIFFICULTY.HARD, AI_DIFFICULTY.EASY), 2);
});

test('难度代理应该返回正确的思考延迟', () => {
  const proxyEasy = new AIDifficultyProxy({}, AI_DIFFICULTY.EASY);
  assert.strictEqual(proxyEasy.getThinkDelay(), 500);
  
  const proxyHard = new AIDifficultyProxy({}, AI_DIFFICULTY.HARD);
  assert.strictEqual(proxyHard.getThinkDelay(), 1500);
});

console.log('\n【AI战斗控制器测试】\n');

test('AI战斗控制器应该能正确初始化', () => {
  const mockIntegrator = {
    getBattle: () => ({ units: [] }),
    getUnitStatus: (id) => null
  };
  const controller = new AICombatController(mockIntegrator, { difficulty: AI_DIFFICULTY.NORMAL });
  assert.strictEqual(controller.aiEngine.difficulty, AI_DIFFICULTY.NORMAL);
});

test('AI战斗控制器应该能注册和注销AI单位', () => {
  const mockIntegrator = {
    getBattle: () => ({ units: [] }),
    getUnitStatus: (id) => null
  };
  const controller = new AICombatController(mockIntegrator);
  
  controller.registerAIUnit('ai_1', 'earth');
  assert.strictEqual(controller.aiEngine.isAIUnit('ai_1'), true);
  
  controller.unregisterAIUnit('ai_1');
  assert.strictEqual(controller.aiEngine.isAIUnit('ai_1'), false);
});

test('AI战斗控制器应该能设置难度', () => {
  const mockIntegrator = {
    getBattle: () => ({ units: [] }),
    getUnitStatus: (id) => null
  };
  const controller = new AICombatController(mockIntegrator);
  
  controller.setDifficulty(AI_DIFFICULTY.HARD);
  assert.strictEqual(controller.aiEngine.difficulty, AI_DIFFICULTY.HARD);
});

test('AI战斗控制器应该能启用和禁用', () => {
  const mockIntegrator = {
    getBattle: () => ({ units: [] }),
    getUnitStatus: (id) => null
  };
  const controller = new AICombatController(mockIntegrator);
  
  controller.enable();
  assert.strictEqual(controller.isRunning, true);
  
  controller.disable();
  assert.strictEqual(controller.isRunning, false);
});

test('AI战斗控制器应该能获取状态', () => {
  const mockIntegrator = {
    getBattle: () => ({ units: [] }),
    getUnitStatus: (id) => null
  };
  const controller = new AICombatController(mockIntegrator, { difficulty: AI_DIFFICULTY.NORMAL });
  
  const state = controller.getState();
  assert.strictEqual(state.enabled, true);
  assert.strictEqual(state.difficulty, AI_DIFFICULTY.NORMAL);
  assert.strictEqual(state.difficultyConfig.name, '普通');
});

test('AI战斗控制器应该能获取可用难度列表', () => {
  const mockIntegrator = {
    getBattle: () => ({ units: [] }),
    getUnitStatus: (id) => null
  };
  const controller = new AICombatController(mockIntegrator);
  
  const difficulties = controller.getAvailableDifficulties();
  assert.strictEqual(difficulties.length, 3);
});

test('AI战斗控制器应该能监听事件', () => {
  const mockIntegrator = {
    getBattle: () => ({ units: [] }),
    getUnitStatus: (id) => null
  };
  const controller = new AICombatController(mockIntegrator);
  
  let eventFired = false;
  controller.on('difficulty_changed', () => { eventFired = true; });
  
  controller.setDifficulty(AI_DIFFICULTY.HARD);
  assert.strictEqual(eventFired, true);
});

console.log('\n【伤害修正测试】\n');

test('困难难度应该增加AI伤害', () => {
  const proxy = new AIDifficultyProxy({}, AI_DIFFICULTY.HARD);
  const damage = proxy.applyDamage(100, false);
  assert.strictEqual(damage, 110); // 1.1x
});

test('简单难度应该减少AI伤害', () => {
  const proxy = new AIDifficultyProxy({}, AI_DIFFICULTY.EASY);
  const damage = proxy.applyDamage(100, false);
  assert.strictEqual(damage, 80); // 0.8x
});

test('简单难度应该增加AI承受伤害', () => {
  const proxy = new AIDifficultyProxy({}, AI_DIFFICULTY.EASY);
  const damage = proxy.applyDamage(100, true);
  assert.strictEqual(damage, 120); // 1.2x
});

test('困难难度应该减少AI承受伤害', () => {
  const proxy = new AIDifficultyProxy({}, AI_DIFFICULTY.HARD);
  const damage = proxy.applyDamage(100, true);
  assert.strictEqual(damage, 90); // 0.9x
});

console.log('\n═══════════════════════════════════════════════════════════════');
console.log('测试结果汇总');
console.log('═══════════════════════════════════════════════════════════════');
console.log(`总计: ${testsPassed + testsFailed} 个测试`);
console.log(`✅ 通过: ${testsPassed}`);
console.log(`❌ 失败: ${testsFailed}`);
console.log('═══════════════════════════════════════════════════════════════\n');

if (testsFailed > 0) {
  process.exit(1);
} else {
  console.log('所有测试通过！✅\n');
}
```

## combatCore/phase9-ai-combat-demo.cjs

```js
/**
 * AI战斗流程示例
 * 展示如何在实际战斗中使用AI系统
 * 
 * 使用方法:
 *   node phase9-ai-combat-demo.cjs
 */

const path = require('path');

// 加载必要的模块
const { CombatIntegrator } = require('./combatIntegrator.cjs');
const { AICombatController, AI_DIFFICULTY } = require('./aiIntegration.cjs');
const { TagDatabaseManager } = require('./tagDatabaseManager.cjs');
const { HookChain } = require('./hookChain.cjs');
const { TagRegistry } = require('./tagRegistry.cjs');
const { createTagSystem } = require('./tagSystem.cjs');

// 简单的六角格距离计算
function hexDistance(a, b) {
  return (Math.abs(a.q - b.q) + Math.abs(a.q + a.r - b.q - b.r) + Math.abs(a.r - b.r)) / 2;
}

// 创建战斗环境
async function createAIBattle() {
  console.log('═══════════════════════════════════════════════════════════════');
  console.log('【AI战斗流程演示】');
  console.log('═══════════════════════════════════════════════════════════════\n');

  // 1. 初始化词条系统
  console.log('📦 步骤1: 初始化词条系统');
  const tagDb = new TagDatabaseManager();
  const tagRegistry = new TagRegistry();
  const hookChain = new HookChain();
  const tagSystem = createTagSystem(tagRegistry, hookChain);

  // 加载基础词条
  const { registerBasicTags } = require('./tagRegistry.cjs');
  registerBasicTags(tagRegistry);

  console.log('   ✅ 词条系统就绪\n');

  // 2. 创建战斗集成器
  console.log('⚔️  步骤2: 创建战斗集成器');
  const combatIntegrator = new CombatIntegrator({
    tagSystem,
    onEvent: (event, data) => {
      console.log(`   📢 事件: ${event}`, data);
    }
  });
  console.log('   ✅ 战斗集成器就绪\n');

  // 3. 创建AI控制器
  console.log('🤖 步骤3: 创建AI控制器');
  const aiController = new AICombatController(combatIntegrator, {
    difficulty: AI_DIFFICULTY.NORMAL,  // 可选: EASY, NORMAL, HARD
    enabled: true
  });
  console.log('   ✅ AI控制器就绪');
  console.log(`   📊 难度: ${aiController.getDifficulty()}`);
  console.log(`   ⏱️  思考延迟: ${aiController.difficultyProxy?.getThinkDelay() || 1000}ms\n`);

  // 4. 创建战斗
  console.log('🎮 步骤4: 创建战斗');
  const battle = combatIntegrator.createBattle({
    id: 'battle-vs-ai-001',
    battlefield: {
      width: 10,
      height: 10
    },
    onTurnStart: (data) => {
      console.log(`\n   ═══ 回合 ${data.round} - ${data.currentUnitId} 的回合 ═══`);
    },
    onTurnEnd: (data) => {
      console.log(`   ${data.currentUnitId} 回合结束`);
    }
  });
  console.log('   ✅ 战斗已创建\n');

  // 5. 添加玩家单位
  console.log('👤 步骤5: 添加玩家单位 (地球联合)');
  const playerUnit = combatIntegrator.addUnit({
    id: 'player-01',
    name: '玩家机甲-α',
    class: 'assault',
    faction: 'earth',
    position: { q: 2, r: 2 },
    stats: {
      hp: 100,
      maxHp: 100,
      attack: 25,
      defense: 15,
      mobility: 4,
      range: 1
    },
    faction_skill: ['artillery'],
    equipped_tags: ['counter', 'lucky']
  });
  console.log(`   ✅ 玩家单位: ${playerUnit.name}`);
  console.log(`   📍 位置: (${playerUnit.position.q}, ${playerUnit.position.r})`);
  console.log(`   ❤️ HP: ${playerUnit.stats.hp}/${playerUnit.stats.maxHp}\n`);

  // 6. 添加AI单位
  console.log('🤖 步骤6: 添加AI单位 (马克西翁)');
  const aiUnit = combatIntegrator.addUnit({
    id: 'ai-01',
    name: 'AI机甲-Ω',
    class: 'stealth',
    faction: 'maxion',
    position: { q: 7, r: 7 },
    stats: {
      hp: 90,
      maxHp: 90,
      attack: 28,
      defense: 12,
      mobility: 5,
      range: 2
    },
    faction_skill: ['fog_system'],
    equipped_tags: ['stealth_initiate', 'stealth_ambush']
  });
  console.log(`   ✅ AI单位: ${aiUnit.name}`);
  console.log(`   📍 位置: (${aiUnit.position.q}, ${aiUnit.position.r})`);
  console.log(`   ❤️ HP: ${aiUnit.stats.hp}/${aiUnit.stats.maxHp}`);
  console.log(`   🌫️ 隐身词条: ${aiUnit.equipped_tags.filter(t => t.startsWith('stealth')).join(', ')}\n`);

  // 7. 注册AI单位
  console.log('🔗 步骤7: 注册AI单位');
  aiController.registerAIUnit('ai-01', {
    strategy: 'aggressive',
    personality: 'aggressive'
  });
  console.log('   ✅ AI单位已注册到AI控制器\n');

  // 8. 开始战斗
  console.log('🚀 步骤8: 开始战斗\n');
  combatIntegrator.startBattle();

  // 9. 执行回合
  console.log('═══════════════════════════════════════════════════════════════');
  console.log('【战斗执行】');
  console.log('═══════════════════════════════════════════════════════════════\n');

  // 获取战斗状态
  const state = combatIntegrator.getBattleState();
  console.log(`📊 当前轮次: ${state.currentRound}`);
  console.log(`📊 当前单位: ${state.currentUnitId}`);
  console.log(`📊 存活单位: ${state.units.filter(u => u.stats.hp > 0).map(u => u.id).join(', ')}\n`);

  // 模拟玩家回合
  console.log('═══════════════════════════════════════════════════════════════');
  console.log('【玩家回合】');
  console.log('═══════════════════════════════════════════════════════════════\n');

  const distance = hexDistance(
    combatIntegrator.getUnit('player-01').position,
    combatIntegrator.getUnit('ai-01').position
  );
  console.log(`📏 距离AI单位: ${distance} 格`);

  if (distance <= 1) {
    console.log('⚔️  执行近战攻击!\n');
    const attackResult = combatIntegrator.executeAttack({
      attackerId: 'player-01',
      defenderId: 'ai-01',
      attackType: 'melee'
    });
    console.log(`   攻击结果: ${attackResult.success ? '命中' : '未命中'}`);
    if (attackResult.damage) {
      console.log(`   伤害: ${attackResult.damage}`);
      console.log(`   AI剩余HP: ${attackResult.targetHp}`);
    }
  } else {
    console.log('🏃 移动向敌人...\n');
    // 简单移动逻辑
    const moveResult = combatIntegrator.executeMove({
      unitId: 'player-01',
      target: { q: 5, r: 5 }
    });
    console.log(`   移动结果: ${moveResult.success ? '成功' : '失败'}`);
  }

  // 模拟AI回合
  console.log('\n═══════════════════════════════════════════════════════════════');
  console.log('【AI回合】');
  console.log('═══════════════════════════════════════════════════════════════\n');

  // 获取AI决策
  const aiDecision = await aiController.aiEngine.makeDecision('ai-01');
  console.log(`🤖 AI决策: ${aiDecision.action}`);
  console.log(`   目标: ${aiDecision.target || '无'}`);
  console.log(`   移动到: (${aiDecision.position?.q || 'N/A'}, ${aiDecision.position?.r || 'N/A'})`);
  console.log(`   理由: ${aiDecision.reason}\n`);

  // 执行AI决策
  const aiThinkDelay = aiController.difficultyProxy.getThinkDelay();
  console.log(`⏱️  AI思考中... (${aiThinkDelay}ms延迟)`);
  await new Promise(resolve => setTimeout(resolve, Math.min(aiThinkDelay, 500))); // 实际使用时用完整延迟

  // 根据AI决策执行
  if (aiDecision.action === 'attack' && aiDecision.target) {
    const aiAttackResult = combatIntegrator.executeAttack({
      attackerId: 'ai-01',
      defenderId: aiDecision.target,
      attackType: 'ranged',
      damageModifier: aiController.difficultyProxy.applyDamageModifier(1.0)
    });
    console.log(`\n⚔️  AI执行攻击!`);
    console.log(`   攻击结果: ${aiAttackResult.success ? '命中' : '未命中'}`);
    if (aiAttackResult.damage) {
      console.log(`   伤害: ${aiAttackResult.damage}`);
      console.log(`   玩家剩余HP: ${aiAttackResult.targetHp}`);
    }
  } else if (aiDecision.action === 'move') {
    const aiMoveResult = combatIntegrator.executeMove({
      unitId: 'ai-01',
      target: aiDecision.position
    });
    console.log(`\n🏃 AI执行移动!`);
    console.log(`   移动结果: ${aiMoveResult.success ? '成功' : '失败'}`);
  } else if (aiDecision.action === 'stealth') {
    console.log('\n🌫️ AI执行隐身!');
    combatIntegrator.getUnit('ai-01').isStealth = true;
    console.log('   AI单位进入隐身状态');
  }

  // 10. 结束战斗
  console.log('\n═══════════════════════════════════════════════════════════════');
  console.log('【战斗结果】');
  console.log('═══════════════════════════════════════════════════════════════\n');

  const finalState = combatIntegrator.getBattleState();
  console.log(`📊 最终状态:`);
  finalState.units.forEach(unit => {
    console.log(`   ${unit.name}: ${unit.stats.hp}/${unit.stats.maxHp} HP`);
  });

  const winner = finalState.units.find(u => u.stats.hp > 0);
  console.log(`\n🏆 获胜者: ${winner ? winner.name : '无 (平局)'}`);

  // 结束战斗
  const battleResult = combatIntegrator.endBattle();
  console.log(`\n📋 战斗统计:`);
  console.log(`   总回合数: ${battleResult.rounds}`);
  console.log(`   玩家造成伤害: ${battleResult.playerDamage}`);
  console.log(`   AI造成伤害: ${battleResult.aiDamage}`);

  console.log('\n═══════════════════════════════════════════════════════════════');
  console.log('【演示完成】');
  console.log('═══════════════════════════════════════════════════════════════\n');

  return {
    battle,
    aiController,
    combatIntegrator,
    result: battleResult
  };
}

// 运行演示
createAIBattle().catch(console.error);

// 导出模块供外部使用
module.exports = { createAIBattle };
```

## combatCore/priorityQueue.cjs

```js
/**
 * PriorityQueue - 优先级队列
 *
 * 职责:
 * 1. 按优先级自动排序元素
 * 2. 支持相同优先级的FIFO顺序
 * 3. 支持队列操作（入队、出队、查看、删除）
 * 4. 支持优先级更新
 */

class PriorityQueue {
  constructor(options = {}) {
    this.maxSize = options.maxSize || Infinity;
    this.compareFn = options.compareFn || ((a, b) => b.priority - a.priority);
    this.items = [];
  }

  /**
   * 获取队列大小
   */
  get size() {
    return this.items.length;
  }

  /**
   * 检查队列是否为空
   */
  get isEmpty() {
    return this.items.length === 0;
  }

  /**
   * 检查队列是否已满
   */
  get isFull() {
    return this.items.length >= this.maxSize;
  }

  /**
   * 入队
   */
  enqueue(item, priority = 0) {
    if (this.isFull) {
      return { success: false, reason: 'queue_full' };
    }

    const element = {
      data: item,
      priority,
      id: item.id || `item_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      enqueuedAt: Date.now()
    };

    // 二分查找插入位置
    let low = 0;
    let high = this.items.length;

    while (low < high) {
      const mid = Math.floor((low + high) / 2);
      if (this.compareFn(this.items[mid], element) <= 0) {
        low = mid + 1;
      } else {
        high = mid;
      }
    }

    this.items.splice(low, 0, element);

    return { success: true, element };
  }

  /**
   * 出队（最高优先级）
   */
  dequeue() {
    if (this.isEmpty) {
      return { success: false, reason: 'queue_empty' };
    }

    const element = this.items.shift();
    return { success: true, element };
  }

  /**
   * 查看队首（不移除）
   */
  peek() {
    if (this.isEmpty) {
      return { success: false, reason: 'queue_empty' };
    }

    return { success: true, element: this.items[0] };
  }

  /**
   * 查看队尾
   */
  peekLast() {
    if (this.isEmpty) {
      return { success: false, reason: 'queue_empty' };
    }

    return { success: true, element: this.items[this.items.length - 1] };
  }

  /**
   * 按ID移除元素
   */
  remove(id) {
    const index = this.items.findIndex(item => item.id === id);
    if (index === -1) {
      return { success: false, reason: 'not_found' };
    }

    const removed = this.items.splice(index, 1)[0];
    return { success: true, removed };
  }

  /**
   * 更新元素优先级
   */
  updatePriority(id, newPriority) {
    const index = this.items.findIndex(item => item.id === id);
    if (index === -1) {
      return { success: false, reason: 'not_found' };
    }

    // 移除旧位置
    const element = this.items.splice(index, 1)[0];
    element.priority = newPriority;

    // 重新插入正确位置
    let low = 0;
    let high = this.items.length;

    while (low < high) {
      const mid = Math.floor((low + high) / 2);
      if (this.compareFn(this.items[mid], element) <= 0) {
        low = mid + 1;
      } else {
        high = mid;
      }
    }

    this.items.splice(low, 0, element);

    return { success: true, element };
  }

  /**
   * 清空队列
   */
  clear() {
    this.items = [];
    return true;
  }

  /**
   * 获取所有元素（按优先级排序）
   */
  toArray() {
    return this.items.map(item => item.data);
  }

  /**
   * 批量入队
   */
  enqueueBatch(items, defaultPriority = 0) {
    const results = [];
    for (const item of items) {
      results.push(this.enqueue(item, defaultPriority));
    }
    return results;
  }

  /**
   * 获取指定优先级的所有元素
   */
  getByPriority(priority) {
    return this.items
      .filter(item => item.priority === priority)
      .map(item => item.data);
  }

  /**
   * 获取优先级范围
   */
  getPriorityRange(min, max) {
    return this.items
      .filter(item => item.priority >= min && item.priority <= max)
      .map(item => item.data);
  }

  /**
   * 获取队列摘要
   */
  getSummary() {
    return {
      size: this.size,
      isFull: this.isFull,
      isEmpty: this.isEmpty,
      maxSize: this.maxSize,
      priorities: [...new Set(this.items.map(item => item.priority))].sort((a, b) => b - a)
    };
  }

  /**
   * 过滤队列
   */
  filter(fn) {
    const filtered = this.items.filter(item => fn(item.data, item));
    return filtered.map(item => item.data);
  }

  /**
   * 查找元素
   */
  find(fn) {
    const found = this.items.find(item => fn(item.data, item));
    return found ? found.data : null;
  }

  /**
   * 检查是否存在
   */
  contains(id) {
    return this.items.some(item => item.id === id);
  }

  /**
   * 迭代器
   */
  *[Symbol.iterator]() {
    for (const item of this.items) {
      yield item.data;
    }
  }
}

/**
 * TagQueue - 词条专用优先级队列
 */
class TagQueue extends PriorityQueue {
  constructor() {
    super({
      compareFn: (a, b) => {
        // 先按优先级降序
        if (b.priority !== a.priority) {
          return b.priority - a.priority;
        }
        // 同优先级按时间升序（先触发的先执行）
        return a.enqueuedAt - b.enqueuedAt;
      }
    });
  }

  /**
   * 入队词条
   */
  enqueueTag(tag, context = {}) {
    return this.enqueue({
      ...tag,
      context
    }, tag.params?.priority || 0);
  }

  /**
   * 获取所有待触发词条
   */
  getPendingTags() {
    return this.toArray();
  }

  /**
   * 按阶段获取词条
   */
  getByPhase(phase) {
    return this.filter(tag => tag.trigger?.phase === phase);
  }
}

/**
 * ActionQueue - 战斗行动队列
 */
class ActionQueue extends PriorityQueue {
  constructor() {
    super({
      compareFn: (a, b) => {
        // 高优先级行动先执行
        if (b.priority !== a.priority) {
          return b.priority - a.priority;
        }
        // 同优先级按时间戳
        return a.timestamp - b.timestamp;
      }
    });
  }

  /**
   * 入队行动
   */
  enqueueAction(action) {
    return this.enqueue({
      ...action,
      timestamp: Date.now()
    }, action.priority || 0);
  }

  /**
   * 获取所有待执行行动
   */
  getPendingActions() {
    return this.toArray();
  }
}

module.exports = {
  PriorityQueue,
  TagQueue,
  ActionQueue
};
```

## combatCore/skillContract.cjs

```js
'use strict';
/**
 * skillContract.cjs — 词条/技能统一数据契约（唯一真相源）
 *
 * 本模块是《Mecha Universe 词条规范与核心解析对齐方案》的契约层。
 * 设计目标（渐进式迁移）：
 *   1. 同时接受「新契约」(key/name/dice_branches…) 与「旧内部字段」
 *      (id/label/target_filter/cast_range 数字…)，统一规整为内部结构，
 *      使旧 9 技能零改动即可继续运行（兼容层）。
 *   2. 为动态注册表 / Branch Evaluator / damage_kind 修复提供
 *      常量与规整/校验/序列化工具。
 *
 * 注意：本文件为纯新增模块，不修改任何现有消费者。旧字段（bonus /
 * hp_threshold_percent / stat_comparison 等技能专属键）通过展开拷贝保留，
 * 确保具名 EXECUTORS 在过渡期仍可读取其专属字段。
 *
 * 契约规范（三大板块）：
 *   名称分类：key / name / category(melee|ranged|automation|support)
 *   基础属性：target_scope / cast_range(数值或{min,max}) / skill_shape
 *   投骰多判定：has_dice / dice_type / dice_branches[]
 *     每个分支：points（离散点数 number 或 区间 [min,max] 的数组，可并存）
 *              effects（核心6项动作词：damage/damage_bonus/heal/apply_status/mobility_mod/accuracy_mod）
 */

// ───────────────────────── 枚举常量 ─────────────────────────
const SKILL_CATEGORIES = ['melee', 'ranged', 'automation', 'support'];
const CATEGORY_LABELS = {
  melee: '近战',
  ranged: '远程',
  automation: '自动化',
  support: '辅助'
};

const TARGET_SCOPES = ['enemy', 'ally', 'enemy_equipment', 'ally_equipment'];
const TARGET_SCOPE_LABELS = {
  enemy: '敌方单位',
  ally: '友方单位',
  enemy_equipment: '敌方装备',
  ally_equipment: '友方装备'
};

const SKILL_SHAPES = ['single', 'fan', 'linear', 'concentric'];
const SKILL_SHAPE_LABELS = {
  single: '单点',
  fan: '扇形',
  linear: '条形',
  concentric: '同心圆'
};

// 核心 6 项动作词（dice_branches[].effects[].action）
const BRANCH_ACTIONS = ['damage', 'damage_bonus', 'heal', 'apply_status', 'mobility_mod', 'accuracy_mod'];
const BRANCH_ACTION_LABELS = {
  damage: '直接伤害',
  damage_bonus: '追加伤害',
  heal: '治疗',
  apply_status: '施加状态',
  mobility_mod: '机动修正',
  accuracy_mod: '命中修正'
};

const DAMAGE_KINDS = ['kinetic', 'beam', 'explosive', 'corrosive', 'thermal'];
const DAMAGE_KIND_LABELS = {
  kinetic: '动能',
  beam: '光束',
  explosive: '爆炸',
  corrosive: '腐蚀',
  thermal: '热熔'
};

const DICE_TYPES = [4, 6, 8, 10, 12, 20];

// ───────────────────── 兼容映射（旧↔新） ─────────────────────
const LEGACY_FILTER_TO_SCOPE = {
  enemy: 'enemy',
  ally: 'ally',
  self: 'ally',
  all: 'enemy'
};
const SCOPE_TO_LEGACY_FILTER = {
  enemy: 'enemy',
  ally: 'ally',
  enemy_equipment: 'enemy',
  ally_equipment: 'ally'
};
const LEGACY_RANGE_TO_SHAPE = {
  radial: 'concentric',
  directional_beam: 'linear',
  cone: 'fan',
  single: 'single'
};
const SHAPE_TO_LEGACY_RANGE = {
  single: 'single',
  fan: 'cone',
  linear: 'directional_beam',
  concentric: 'radial'
};

// 伤害种类别名归一（修复 beam↔energy 历史错配：energy 统一视作 beam）
const DAMAGE_KIND_ALIASES = {
  energy: 'beam',
  laser: 'beam',
  em: 'beam'
};

// ─────────────────────── 工具函数 ───────────────────────
function num(v, def) {
  const n = Number(v);
  return Number.isFinite(n) ? n : def;
}

function normalizeDamageKind(dk) {
  if (!dk) return 'kinetic';
  const k = String(dk).toLowerCase();
  if (DAMAGE_KINDS.includes(k)) return k;
  return DAMAGE_KIND_ALIASES[k] || 'kinetic';
}

/**
 * 解析词条/攻击的伤害种类（配置驱动权威来源）。
 * 优先读取 skillData.damage_kind（经别名归一），缺失时回退 fallbackWeaponType，
 * 再缺失默认 'kinetic'。彻底切断 "weaponType 即 damage_kind" 的历史误用。
 *
 * @param {Object} skillData - 词条通用字段（含 damage_kind），如 skillUf
 * @param {string} [fallbackWeaponType] - 兜底武器类型（attacker.weaponType）
 * @returns {string} 归一后的伤害种类
 */
function getDamageType(skillData = {}, fallbackWeaponType) {
  const dk = skillData && skillData.damage_kind;
  if (dk) return normalizeDamageKind(dk);
  if (fallbackWeaponType) return normalizeDamageKind(fallbackWeaponType);
  return 'kinetic';
}

function normalizeEffect(e = {}) {
  return {
    action: BRANCH_ACTIONS.includes(e.action) ? e.action : 'damage',
    value: num(e.value, 0),
    status: e.status || null, // 供 apply_status 使用
    target: e.target || 'enemy' // 供 heal/mobility_mod 定向
  };
}

/**
 * 将一个点数条目规整为 {kind:'exact'|'range', ...}。
 * 支持：number（离散点数）、[min,max]（区间）、{kind,value|min,max}（显式）。
 * 非法返回 null。
 */
function normalizePoint(p) {
  if (p == null) return null;
  if (typeof p === 'number') return { kind: 'exact', value: p };
  if (Array.isArray(p) && p.length >= 2) {
    const min = Math.min(num(p[0], 0), num(p[1], 0));
    const max = Math.max(num(p[0], 0), num(p[1], 0));
    return { kind: 'range', min, max };
  }
  if (typeof p === 'object') {
    if (p.kind === 'range') {
      const min = Math.min(num(p.min, 0), num(p.max, 0));
      const max = Math.max(num(p.min, 0), num(p.max, 0));
      return { kind: 'range', min, max };
    }
    if (p.kind === 'exact') return { kind: 'exact', value: num(p.value, 0) };
  }
  return null;
}

function normalizeBranch(b = {}) {
  let points = [];
  if (Array.isArray(b.points)) {
    points = b.points.map(normalizePoint).filter(Boolean);
  }
  // 旧契约兼容：condition_range:[min,max] → points:[区间]
  if (points.length === 0 && Array.isArray(b.condition_range) && b.condition_range.length >= 2) {
    const pp = normalizePoint(b.condition_range);
    if (pp) points = [pp];
  }
  return {
    points,
    effects: Array.isArray(b.effects) ? b.effects.map(normalizeEffect) : []
  };
}

/**
 * 从输入抽取新投骰模型（顶层 has_dice/dice_type/dice_branches 或旧 dice_mechanics）。
 * 返回 { has_dice, dice_type, dice_branches }。
 */
function normalizeDiceBlocks(src = {}) {
  const fromLegacy = src.dice_mechanics && typeof src.dice_mechanics === 'object' ? src.dice_mechanics : null;
  const has_dice = Boolean(src.has_dice) || Boolean(fromLegacy && fromLegacy.has_dice);
  const diceTypeRaw = src.dice_type != null ? src.dice_type : fromLegacy ? fromLegacy.dice_type : 6;
  const dice_type = DICE_TYPES.includes(num(diceTypeRaw, 6)) ? num(diceTypeRaw, 6) : 6;
  let branches = [];
  if (Array.isArray(src.dice_branches)) branches = src.dice_branches.map(normalizeBranch);
  else if (fromLegacy && Array.isArray(fromLegacy.branches)) branches = fromLegacy.branches.map(normalizeBranch);
  return { has_dice, dice_type, dice_branches: branches };
}

/**
 * 将任意输入（新契约 / 旧内部字段）规整为内部统一结构。
 * 保留所有旧专属字段，并补齐新契约字段，使两端消费者在过渡期均可读取。
 */
function normalizeSkill(raw = {}) {
  const src = Object.assign({}, raw);
  if (!src || typeof src !== 'object') src = {};

  const key = src.key || src.id || '';
  const name = src.name || src.label || '';

  let category = src.category;
  if (!SKILL_CATEGORIES.includes(category)) category = 'melee';

  let target_scope = src.target_scope;
  let target_filter = src.target_filter;
  if (!TARGET_SCOPES.includes(target_scope)) {
    target_scope = LEGACY_FILTER_TO_SCOPE[target_filter] || 'enemy';
  }
  if (!target_filter) target_filter = SCOPE_TO_LEGACY_FILTER[target_scope] || 'enemy';

  // cast_range 支持数值或 {min,max}
  let castRange = { min: 0, max: 0 };
  if (src.cast_range && typeof src.cast_range === 'object') {
    castRange = { min: num(src.cast_range.min, 0), max: num(src.cast_range.max, 0) };
  } else if (typeof src.cast_range === 'number') {
    castRange = { min: 0, max: src.cast_range };
  } else if (typeof src.min_cast_range === 'number' || typeof src.cast_range === 'number') {
    castRange = { min: num(src.min_cast_range, 0), max: num(src.cast_range, 0) };
  }
  if (castRange.min > castRange.max) {
    castRange = { min: castRange.max, max: castRange.min };
  }

  let skill_shape = src.skill_shape;
  let range_type = src.range_type;
  if (!SKILL_SHAPES.includes(skill_shape)) skill_shape = LEGACY_RANGE_TO_SHAPE[range_type] || 'single';
  if (!range_type) range_type = SHAPE_TO_LEGACY_RANGE[skill_shape] || 'radial';

  const dice = normalizeDiceBlocks(src);

  const out = Object.assign({}, src, {
    key,
    name,
    category,
    target_scope,
    target_filter,
    cast_range: castRange,
    min_cast_range: castRange.min,
    skill_shape,
    range_type,
    damage_kind: normalizeDamageKind(src.damage_kind),
    base_damage: num(src.base_damage, 0),
    status_effects: Array.isArray(src.status_effects) ? src.status_effects : [],
    action_type: src.action_type || 'attack',
    attack_stat: src.attack_stat || 'melee',
    accuracy_mod: num(src.accuracy_mod, 0),
    evasion_mod: num(src.evasion_mod, 0),
    height_bonus_per_diff: num(src.height_bonus_per_diff, 0),
    requires_unmoved: Boolean(src.requires_unmoved),
    requires_stealth: Boolean(src.requires_stealth),
    type: src.type || 'active',
    deterministic: src.deterministic !== false,
    trigger: src.trigger || null,
    // 新投骰模型命名空间（供 Branch Evaluator 读取）
    dice
  });
  // 顶层镜像（仅在新模型启用时覆盖，避免污染旧 dice_type 字符串）
  if (dice.has_dice) {
    out.has_dice = dice.has_dice;
    out.dice_type = dice.dice_type;
    out.dice_branches = dice.dice_branches;
  }
  return out;
}

/**
 * Schema 校验。返回 { valid, errors, normalized }。
 * 缺字段不报错（由 normalizeSkill 补默认），仅对非法枚举 / 分支结构报错。
 */
function validateSkill(raw = {}) {
  const errors = [];
  const key = raw.key || raw.id;
  if (!key || typeof key !== 'string' || !key.trim()) {
    errors.push('缺少唯一标识 key（或旧字段 id）');
  }
  if (!raw.name && !raw.label) errors.push('缺少展示名 name（或旧字段 label）');
  if (raw.category && !SKILL_CATEGORIES.includes(raw.category)) {
    errors.push(`category 非法: ${raw.category}`);
  }
  if (raw.target_scope && !TARGET_SCOPES.includes(raw.target_scope)) {
    errors.push(`target_scope 非法: ${raw.target_scope}`);
  }
  if (raw.skill_shape && !SKILL_SHAPES.includes(raw.skill_shape)) {
    errors.push(`skill_shape 非法: ${raw.skill_shape}`);
  }

  const srcDice = raw.dice_branches != null
    ? { has_dice: raw.has_dice, dice_type: raw.dice_type, dice_branches: raw.dice_branches }
    : (raw.dice_mechanics && typeof raw.dice_mechanics === 'object'
        ? { has_dice: raw.dice_mechanics.has_dice, dice_type: raw.dice_mechanics.dice_type, dice_branches: raw.dice_mechanics.branches }
        : null);
  const hasDice = srcDice ? Boolean(srcDice.has_dice) : false;
  if (hasDice) {
    const diceType = num(srcDice.dice_type, 6);
    if (!DICE_TYPES.includes(diceType)) {
      errors.push(`dice_type 非法: ${diceType}（允许 ${DICE_TYPES.join('/')}）`);
    }
    const branches = Array.isArray(srcDice.dice_branches) ? srcDice.dice_branches : [];
    if (branches.length === 0) {
      errors.push('has_dice 为 true 时至少需要一个判定分支 (dice_branches)');
    }
    branches.forEach((b, i) => {
      const points = (b && Array.isArray(b.points) ? b.points : [])
        .concat(b && Array.isArray(b.condition_range) ? [b.condition_range] : []);
      if (points.length === 0) {
        errors.push(`dice_branches[${i}] 未配置任何生效点数（points）`);
      }
      const effects = (b && Array.isArray(b.effects)) ? b.effects : [];
      if (effects.length === 0) {
        errors.push(`dice_branches[${i}] 未配置任何《判定效果》`);
      }
      effects.forEach((e, j) => {
        const act = e && e.action;
        if (!BRANCH_ACTIONS.includes(act)) {
          errors.push(`dice_branches[${i}].effects[${j}].action 非法: ${act}`);
        }
      });
    });
  }

  return { valid: errors.length === 0, errors, normalized: normalizeSkill(raw) };
}

/**
 * 序列化为纯「新契约」JSON（供前端回显 / 存储），剥离旧专属过渡字段。
 */
function toContract(skill = {}) {
  const n = normalizeSkill(skill);
  return {
    key: n.key,
    name: n.name,
    category: n.category,
    target_scope: n.target_scope,
    cast_range: { min: n.cast_range.min, max: n.cast_range.max },
    skill_shape: n.skill_shape,
    damage_kind: n.damage_kind,
    base_damage: n.base_damage,
    status_effects: n.status_effects,
    action_type: n.action_type,
    has_dice: n.dice.has_dice,
    dice_type: n.dice.dice_type,
    dice_branches: n.dice.dice_branches.map((b) => ({
      points: b.points.map((p) => (p.kind === 'range'
        ? { kind: 'range', min: p.min, max: p.max }
        : { kind: 'exact', value: p.value })),
      effects: b.effects.map((e) => ({
        action: e.action,
        value: e.value,
        ...(e.status ? { status: e.status } : {}),
        ...(e.target && e.target !== 'enemy' ? { target: e.target } : {})
      }))
    }))
  };
}

module.exports = {
  SKILL_CATEGORIES,
  CATEGORY_LABELS,
  TARGET_SCOPES,
  TARGET_SCOPE_LABELS,
  SKILL_SHAPES,
  SKILL_SHAPE_LABELS,
  BRANCH_ACTIONS,
  BRANCH_ACTION_LABELS,
  DAMAGE_KINDS,
  DAMAGE_KIND_LABELS,
  DICE_TYPES,
  DAMAGE_KIND_ALIASES,
  LEGACY_FILTER_TO_SCOPE,
  SCOPE_TO_LEGACY_FILTER,
  LEGACY_RANGE_TO_SHAPE,
  SHAPE_TO_LEGACY_RANGE,
  normalizeDamageKind,
  getDamageType,
  normalizeSkill,
  validateSkill,
  toContract
};
```

## combatCore/skillExecutor.cjs

```js
/**
 * skillExecutor.cjs — 技能执行器 v5.0 (Phase 10 万能语法战斗中枢)
 *
 * 核心设计原则:
 *   - 废除所有技能名称硬编码分支，改为 "只认通用句式、不认特定技能名"
 *   - 引入【主谓宾定状补】语法插槽：subject/predicate/object/attribute/adverbial/complement
 *   - 所有技能通过 glossary-skill-config.json 的通用字段驱动
 *   - 泛化累加器: 不判断类型名，凡有 bonus_value 即无条件累加
 *   - 100% 向后兼容：9 大技能数据反填即可完美跑通
 *
 * 语法插槽:
 *   Subject    (主语·状态):  requires_unmoved, requires_stealth, requires_hp_above_percent
 *   Predicate  (谓语·动作):  action_type (attack/heal/buff/debuff/passive)
 *   Object     (宾语·范围):  target_filter, cast_range, min_cast_range, aoe_radius, sector_angle
 *   Attribute  (定语·属性):  damage_kind, attack_stat, accuracy_mod, evasion_mod
 *   Adverbial  (状语·干预):  height_bonus_per_diff, dice_type, success_line, success_bonus_damage, is_manual_roll
 *   Complement (补语·结果):  base_damage, reduction, bonus, bonus_value, status_effects, post_effects
 */

const { getSkillConfig, getSystemConfig, getGlossaryConfig } = require('./configLoader.cjs');
const ConditionEvaluator = require('./conditionEvaluator.cjs');
const BranchEvaluator = require('./branchEvaluator.cjs');


class SkillExecutor {
    constructor() {
        // 稳定技能每局使用状态追踪：key = unit.id
        this.stableUsedInBattle = new Map();
        this.config = getGlossaryConfig();
        // Phase 10: 万能语法模式（始终启用）
        this.universalMode = true;
    }

    // ============================================================
    // Phase 10: 万能语法字段获取
    // ============================================================

    /**
     * 获取技能的全部通用结构化属性 (v5.0 主谓宾定状补)
     * @param {string} skillType - 技能KEY 或 skillCfg 对象
     * @returns {Object} 完整的语法插槽字典
     */
    _getUniversalFields(skillType) {
        const cfg = typeof skillType === 'string' ? getSkillConfig(skillType) : skillType;
        if (!cfg) return this._defaultUniversalFields();

        return {
            // Phase 5: 基础通用字段
            type: cfg.type || 'active',
            label: cfg.label || skillType,
            category: cfg.category || 'melee',
            description: cfg.description || '',
            deterministic: cfg.deterministic !== false,
            trigger: cfg.trigger || '',
            mode: cfg.mode || '',

            // 宾语 Object（范围）
            target_filter: cfg.target_filter ?? 'enemy',
            cast_range: cfg.cast_range ?? 1,
            min_cast_range: cfg.min_cast_range ?? (cfg.min_range ?? 0),
            aoe_radius: cfg.aoe_radius ?? 0,
            sector_angle: cfg.sector_angle ?? 60,
            max_range: cfg.max_range ?? cfg.cast_range ?? 1,
            min_range: cfg.min_range ?? 0,
            aoe_range: cfg.aoe_range ?? 0,

            // 属性 Attribute（分流）
            damage_kind: cfg.damage_kind ?? 'kinetic',
            attack_stat: cfg.attack_stat ?? 'melee',
            accuracy_mod: cfg.accuracy_mod ?? 0,
            evasion_mod: cfg.evasion_mod ?? 0,

            // 状语 Adverbial（环境与随机干预）
            height_bonus_per_diff: cfg.height_bonus_per_diff ?? 0,
            dice_type: cfg.dice_type || '1d6',
            success_line: cfg.success_line ?? 4,
            success_bonus_damage: cfg.success_bonus_damage ?? 0,
            dice_ranges: Array.isArray(cfg.dice_ranges) ? cfg.dice_ranges : null,  // Phase 19: 分段骰
            is_manual_roll: cfg.is_manual_roll || false,

            // 谓语 Predicate（动作类型）
            action_type: cfg.action_type ?? 'attack',
            effect: cfg.effect ?? '',
            requires: cfg.requires ?? '',

            // 主语 Subject（施放条件）
            requires_unmoved: cfg.requires_unmoved ?? false,
            requires_stealth: cfg.requires_stealth ?? false,
            requires_hp_below: cfg.requires_hp_below ?? 0,      // Phase 18-A: HP阈值条件
            target_on_terrain: cfg.target_on_terrain || '',     // Phase 18-A: 地形限定条件
            hp_threshold_percent: cfg.hp_threshold_percent ?? 0,
            condition: cfg.condition ?? '',
            stat_comparison: cfg.stat_comparison ?? '',
            no_consecutive: cfg.no_consecutive ?? false,

            // 补语 Complement（结果值）
            base_damage: cfg.base_damage ?? 0,
            reduction: cfg.reduction ?? 0,
            bonus: cfg.bonus ?? 0,
            value: cfg.value ?? 0,
            damage_modifier_precise: cfg.damage_modifier_precise ?? 0,
            damage_multiplier: cfg.damage_multiplier ?? 1.0,
            status_effects: cfg.status_effects || [],
            action: cfg.action ?? '',
        };
    }

    _defaultUniversalFields() {
        return {
            type: 'active', label: 'unknown', category: 'melee', description: '',
            deterministic: true, trigger: '', mode: '',
            target_filter: 'enemy', cast_range: 1, min_cast_range: 0,
            aoe_radius: 0, sector_angle: 60, max_range: 1, min_range: 0, aoe_range: 0,
            damage_kind: 'kinetic', attack_stat: 'melee', accuracy_mod: 0, evasion_mod: 0,
            height_bonus_per_diff: 0,
            dice_type: '1d6', success_line: 4, success_bonus_damage: 0, is_manual_roll: false,
            action_type: 'attack', effect: '', requires: '',
            requires_unmoved: false, requires_stealth: false,
            hp_threshold_percent: 0, condition: '', stat_comparison: '',
            no_consecutive: false,
            base_damage: 0, reduction: 0, bonus: 0, value: 0,
            damage_modifier_precise: 0, damage_multiplier: 1.0,
            status_effects: [], action: '',
        };
    }

    // ============================================================
    // Phase 10: 万能语法调度器 — 核心入口
    // ============================================================

    /**
     * 万能技能执行入口
     * 根据词条配置的 action_type 自动路由到对应处理器
     *
     * @param {string} skillType - 技能KEY
     * @param {Object} unit - 施放单位
     * @param {Object} target - 目标单位/格子
     * @param {Object} context - 额外上下文 { allUnits, battleState, skillRange }
     * @returns {Object} 统一执行结果
     */
    executeUniversalSkill(skillType, unit, target, context = {}) {
        const cfg = getSkillConfig(skillType);
        const uf = this._getUniversalFields(skillType);

        if (!cfg) {
            return { triggered: false, message: `技能 ${skillType} 未在词条库中定义` };
        }

        // === 主语检查 (Subject Checks - 直接字段) ===
        if (uf.requires_unmoved && unit.has_moved) {
            return { triggered: false, message: `${uf.label} 需要本回合未移动` };
        }
        if (uf.requires_stealth && !unit.stealth) {
            return { triggered: false, message: `${uf.label} 需要隐身状态` };
        }

        // === Phase 18-A: 平铺条件评估 (ConditionEvaluator 泛化拦截) ===
        // 将技能平面条件字段 { requires_hp_below, target_on_terrain } 交给条件评估器 AND 链判定
        if (uf.requires_hp_below > 0 || uf.target_on_terrain) {
            const flatCtx = {
                unit: {
                    hp: unit.hp,
                    maxHp: unit.max_hp || unit.maxHp || 100,
                    current_hp: unit.current_hp ?? unit.hp,
                    has_moved: unit.has_moved,
                    stealth: unit.stealth,
                },
                target: target ? {
                    terrain: target.terrain,
                } : null,
                targetTerrain: target?.terrain,
            };
            const flatConditions = {};
            if (uf.requires_hp_below > 0) flatConditions.requires_hp_below = uf.requires_hp_below;
            if (uf.target_on_terrain) flatConditions.target_on_terrain = uf.target_on_terrain;
            if (!ConditionEvaluator.evaluateFlat(flatConditions, flatCtx)) {
                // 定位原因
                if (uf.requires_hp_below > 0 && (unit.hp ?? unit.current_hp) >= uf.requires_hp_below) {
                    return { triggered: false, message: `${uf.label} 需要HP低于${uf.requires_hp_below}（当前HP=${unit.hp ?? unit.current_hp}）` };
                }
                if (uf.target_on_terrain && target?.terrain !== uf.target_on_terrain) {
                    return { triggered: false, message: `${uf.label} 目标必须站在${uf.target_on_terrain}地形（当前=${target?.terrain || '未知'}）` };
                }
                return { triggered: false, message: `${uf.label} 平铺条件未满足` };
            }
        }

        // === 宾语距离检查 (Object Range Check) ===
        if (target && uf.target_filter !== 'self') {
            const dist = this._hexDistance(unit, target);
            const minR = uf.min_cast_range || uf.min_range || 1; // 默认最小距离1（排除自身）
            const maxR = uf.cast_range || uf.max_range || 1;
            if (dist < minR || dist > maxR) {
                return {
                    triggered: false, out_of_range: true,
                    min: minR, max: maxR, actual: dist,
                    message: `${uf.label} 需要 ${minR}~${maxR} 格距离（当前 ${dist} 格）`
                };
            }
        }

        // === 定语·高地差 (Attribute - Height Bonus) ===
        let heightBonus = 0;
        let heightDiff = 0;
        if (target && uf.height_bonus_per_diff > 0) {
            const attZ = unit.z ?? unit.height ?? 0;
            const defZ = target.z ?? target.height ?? 0;
            heightDiff = attZ - defZ;
            if (heightDiff > 0) {
                heightBonus = Math.floor(heightDiff * uf.height_bonus_per_diff);
            }
        }

        // === 状语·骰子判定 (Adverbial - Dice) ===
        // 新投骰多分支模型（方案 Step 4）：has_dice + dice_branches 由配置驱动，零硬编码分支
        const newDiceModel =
          uf.dice && uf.dice.has_dice &&
          Array.isArray(uf.dice.dice_branches) && uf.dice.dice_branches.length > 0;
        if (newDiceModel) {
          return this._executeBranchModelSkill(skillType, unit, target, uf, cfg, heightBonus, heightDiff, context);
        }
        const dice = this._evaluateDice(cfg);
        const diceBonus = dice.isSuccess ? uf.success_bonus_damage : 0;

        // === 谓语路由 (Predicate Routing) ===
        switch (uf.action_type) {
            case 'attack':
                return this._executeAttackSkill(skillType, unit, target, uf, cfg, dice, heightBonus, heightDiff, context);
            case 'heal':
                return this._executeHealSkill(skillType, unit, target, uf, cfg, dice, context);
            case 'buff':
                return this._executeBuffSkill(skillType, unit, target, uf, cfg, dice, context);
            case 'debuff':
                return this._executeDebuffSkill(skillType, unit, target, uf, cfg, dice, context);
            case 'passive':
                return this._executePassiveSkill(skillType, unit, target, uf, cfg, dice, context);
            default:
                return {
                    triggered: true, type: skillType,
                    action_type: uf.action_type,
                    damage_kind: uf.damage_kind,
                    bonus_value: uf.base_damage + diceBonus + heightBonus,
                    dice, height_bonus: heightBonus,
                    message: `${uf.label}: 基础${uf.base_damage} + 骰子${diceBonus} + 高地${heightBonus}`
                };
        }
    }

    // ============================================================
    // 谓语处理器 (Predicate Handlers)
    // ============================================================

    _executeAttackSkill(skillType, unit, target, uf, cfg, dice, heightBonus, heightDiff, context) {
        const baseDamage = uf.base_damage || uf.damage_modifier_precise || 0;
        const diceBonus = dice.isSuccess ? uf.success_bonus_damage : 0;
        const finalDamage = baseDamage + diceBonus + heightBonus;
        const attackType = uf.attack_stat === 'ranged' ? 'ranged' : 'melee';

        const result = {
            triggered: true,
            type: skillType,
            action_type: 'attack',
            attack_type: attackType,
            attack_stat: uf.attack_stat,
            damage_kind: uf.damage_kind,
            active: true,
            base_damage: baseDamage,
            dice,
            height_bonus: heightBonus,
            height_diff: heightDiff,
            final_damage: finalDamage,
            bonus_value: finalDamage,
            accuracy_mod: uf.accuracy_mod,
            evasion_mod: uf.evasion_mod,
            status_effects: uf.status_effects,
        };

        // 构建消息
        let msgParts = [`${uf.label}`];
        if (dice.roll > 0) {
            // Phase 19: dice_ranges 分段模式下显示区间标签，否则显示传统 successLine
            if (dice.rangeLabel) {
                const rangeTag = dice.isSuccess ? `[${dice.rangeLabel}]` : `[未命中]`;
                msgParts.push(`掷${dice.diceType}=${dice.roll} ${rangeTag}`);
            } else {
                msgParts.push(`掷${dice.diceType}=${dice.roll}${dice.isSuccess ? '>=' + dice.successLine : '<' + dice.successLine}`);
            }
        }
        if (heightBonus > 0) msgParts.push(`高地+${heightBonus}`);
        msgParts.push(`伤害${finalDamage}`);
        result.message = msgParts.join(', ');

        // 定语修正注入 context
        if (context) {
            if (uf.accuracy_mod) context.accuracy_mod = (context.accuracy_mod || 0) + uf.accuracy_mod;
            if (uf.evasion_mod) context.evasion_mod = (context.evasion_mod || 0) + uf.evasion_mod;
        }

        return result;
    }

    _executeHealSkill(skillType, unit, target, uf, cfg, dice, context) {
        const healStat = uf.attack_stat === 'ranged'
            ? (unit.ranged || unit.attack || 10)
            : (unit.melee || unit.attack || 10);
        const diceBonus = dice.isSuccess ? uf.success_bonus_damage : 0;
        const healAmount = (uf.base_damage || healStat) + diceBonus;

        if (target) {
            const dist = this._hexDistance(unit, target);
            if (dist > uf.cast_range || dist === 0) {
                return {
                    heal_amount: 0, out_of_range: true,
                    min: 1, max: uf.cast_range, actual: dist,
                    message: `${uf.label} 仅对范围 ${uf.cast_range} 内友军有效`
                };
            }
        }

        return {
            triggered: true,
            type: skillType,
            action_type: 'heal',
            active: true,
            heal_amount: healAmount,
            bonus_value: healAmount,
            dice,
            message: dice.roll > 0
                ? `${uf.label}: 回复 ${healAmount} HP [掷${dice.diceType}=${dice.roll}]`
                : `${uf.label}: 回复 ${healAmount} 点 HP`
        };
    }

    _executeBuffSkill(skillType, unit, target, uf, cfg, dice, context) {
        const buffValue = uf.base_damage || uf.bonus || uf.value || 0;
        const diceBonus = dice.isSuccess ? uf.success_bonus_damage : 0;
        const finalValue = buffValue + diceBonus;

        return {
            triggered: true,
            type: skillType,
            action_type: 'buff',
            active: true,
            buff_value: finalValue,
            bonus_value: finalValue,
            dice,
            message: dice.roll > 0
                ? `${uf.label}: +${finalValue} [掷${dice.diceType}=${dice.roll}]`
                : `${uf.label}: +${finalValue}`
        };
    }

    _executeDebuffSkill(skillType, unit, target, uf, cfg, dice, context) {
        const debuffValue = uf.base_damage || uf.value || 0;
        const diceBonus = dice.isSuccess ? uf.success_bonus_damage : 0;
        const finalValue = debuffValue + diceBonus;
        const statusEffects = uf.status_effects || [];

        return {
            triggered: true,
            type: skillType,
            action_type: 'debuff',
            active: true,
            debuff_value: finalValue,
            bonus_value: finalValue,
            aoe_radius: uf.aoe_radius || uf.aoe_range || 0,
            status_effects: statusEffects,
            dice,
            message: dice.roll > 0
                ? `${uf.label}: 增伤+${finalValue} [掷${dice.diceType}=${dice.roll}]`
                : `${uf.label}: 目标周围 ${uf.aoe_range || uf.aoe_radius} 格内所有目标下次伤害 +${finalValue}`
        };
    }

    _executePassiveSkill(skillType, unit, target, uf, cfg, dice, context) {
        const result = {
            triggered: true,
            type: skillType,
            action_type: 'passive',
            active: true,
            damage_kind: uf.damage_kind,
            bonus_value: (uf.reduction || uf.base_damage || uf.bonus || 0) + (dice.isSuccess ? 1 : 0),
            dice,
            message: `${uf.label} 触发`
        };

        // 特殊被动效果：斩杀 / 决斗 / 抢夺 / 幸运 / 再动
        if (uf.condition === 'damage_greater_than_target_weapon_attack' || cfg.condition === 'damage_greater_than_target_weapon_attack') {
            return {
                ...result,
                snatch_mode: true,
                damage_multiplier: uf.damage_multiplier || 0.5,
                message: '抢夺判定待触发'
            };
        }

        if (uf.stat_comparison === 'max_attack' || cfg.stat_comparison === 'max_attack') {
            return {
                ...result,
                duel_mode: true,
                message: '决斗判定待触发'
            };
        }

        return result;
    }

    // ============================================================
    // 新投骰多分支模型 (Phase 对齐方案 Step 4)
    // 由 dice_branches 配置驱动：投骰 → 命中分支 → 顺序执行其下全部效果
    // ============================================================
    _executeBranchModelSkill(skillType, unit, target, uf, cfg, heightBonus, heightDiff, context) {
        const roll = BranchEvaluator.rollDice(uf.dice.dice_type);
        const hits = BranchEvaluator.evaluateBranches(uf.dice.dice_branches, roll);
        const ectx = BranchEvaluator.newEffectContext();
        BranchEvaluator.applyBranchEffects(hits.flatMap((h) => h.effects), ectx);

        const result = {
            triggered: true,
            type: skillType,
            action_type: uf.action_type || 'attack',
            damage_kind: uf.damage_kind,
            active: true,
            roll,
            dice_type: uf.dice.dice_type,
            hit: hits.length > 0,
            outcome: hits.length > 0 ? 'success' : 'failure',
            height_bonus: heightBonus,
            height_diff: heightDiff,
            status_effects: [],
            log: [`投骰=${roll} 命中分支 ${hits.length} 个`].concat(ectx.log)
        };

        if (hits.length === 0) {
            result.bonus_value = 0;
            result.damage = 0;
            result.message = `${uf.name || uf.label}: 投骰=${roll} 未命中任何判定分支，技能未生效`;
            return result;
        }

        const bonus = ectx.bonus + (Number(uf.success_bonus_damage) || 0);
        if (uf.action_type === 'attack' || (ectx.damage > 0 && uf.action_type !== 'heal')) {
            const base = ectx.damage > 0 ? ectx.damage : Number(uf.base_damage) || 0;
            const finalDamage = base + bonus + heightBonus;
            result.damage = finalDamage;
            result.final_damage = finalDamage;
            result.base_damage = Number(uf.base_damage) || 0;
            result.bonus_value = finalDamage;
        } else {
            result.bonus_value = bonus;
        }

        if (ectx.heal > 0) {
            result.heal = ectx.heal;
            result.heal_amount = ectx.heal;
        }

        for (const s of ectx.statuses) {
            result.status_effects.push({ status: s.status, target: s.target });
        }

        // 命中/机动修正：回写 context 供结算管线使用
        result.accuracy_mod = (Number(uf.accuracy_mod) || 0) + ectx.accuracyMod;
        result.mobility_mod = ectx.mobilityMod;
        if (context) {
            if (result.accuracy_mod) context.accuracy_mod = (context.accuracy_mod || 0) + result.accuracy_mod;
            if (result.mobility_mod) context.mobility_mod = (context.mobility_mod || 0) + result.mobility_mod;
        }

        result.message = `${uf.name || uf.label}: 投骰=${roll} 命中 ${hits.length} 分支 → ${ectx.log.join('; ')}`;
        return result;
    }

    // ============================================================
    // 骰子系统 (Phase 8)
    // ============================================================

    _parseDice(diceStr) {
        const m = String(diceStr || '1d6').match(/^(\d+)d(\d+)$/i);
        if (!m) return { count: 1, sides: 6 };
        return { count: parseInt(m[1]), sides: parseInt(m[2]) };
    }

    _rollDice(diceStr) {
        const { count, sides } = this._parseDice(diceStr);
        let total = 0;
        for (let i = 0; i < count; i++) {
            total += Math.floor(Math.random() * sides) + 1;
        }
        return total;
    }

    _evaluateDice(skillCfg) {
        if (!skillCfg) return { roll: 0, diceType: '1d6', successLine: 4, isSuccess: false, bonusDamage: 0 };

        const diceType = skillCfg.dice_type || '1d6';
        const roll = this._rollDice(diceType);

        // ============================================================
        //  Phase 19: 多档位分段骰系统 (dice_ranges)
        //  优先级高于旧版 success_line 单一阈值
        //  配置格式: dice_ranges: [{ min:1, max:X, action:"...", bonus_damage:N }, ...]
        // ============================================================
        if (Array.isArray(skillCfg.dice_ranges) && skillCfg.dice_ranges.length > 0) {
            const range = skillCfg.dice_ranges.find(r => roll >= r.min && roll <= r.max);
            if (range) {
                return {
                    roll,
                    diceType,
                    successLine: null,
                    range_min: range.min,
                    range_max: range.max,
                    range_action: range.action || '',
                    isSuccess: range.action !== 'miss',
                    bonusDamage: range.bonus_damage || (range.action === 'critical' ? (skillCfg.success_bonus_damage ?? 0) : 0),
                    rangeLabel: range.label || range.action || '',
                    rangeDamageMultiplier: range.damage_multiplier ?? 1.0,
                    // 透传 range 原始配置供后续判决使用
                    _range: range
                };
            }
            // 掷骰结果落空（不在任何区间内），视为失败
            return {
                roll, diceType, successLine: null,
                isSuccess: false, bonusDamage: 0,
                range_min: 0, range_max: 0, range_action: 'miss',
                rangeLabel: 'miss', rangeDamageMultiplier: 1.0,
                _range: null
            };
        }

        // 降级：传统 success_line 单一阈值（向后兼容）
        const successLine = skillCfg.success_line ?? 4;
        const bonusDamage = skillCfg.success_bonus_damage ?? 0;
        const isSuccess = roll >= successLine;
        return {
            roll,
            diceType,
            successLine,
            isSuccess,
            bonusDamage: isSuccess ? bonusDamage : 0
        };
    }

    _applyDiceToDamage(skillCfg, baseDamageOverride) {
        const cfg = typeof skillCfg === 'string' ? getSkillConfig(skillCfg) : skillCfg;
        const baseDamage = baseDamageOverride ?? (cfg?.base_damage ?? 0);
        if (!cfg || !cfg.dice_type || cfg.dice_type === 'none') {
            return { damage: baseDamage, dice: null };
        }
        const dice = this._evaluateDice(cfg);
        // Phase 19: dice_ranges 分段模式下，use rangeDamageMultiplier
        const mult = (dice.rangeDamageMultiplier != null) ? dice.rangeDamageMultiplier : 1.0;
        const finalDamage = Math.round((baseDamage + (dice.bonusDamage || 0)) * mult);
        return { damage: finalDamage, dice };
    }

    // ============================================================
    // Phase 10: 手动摇骰状态机钩子
    // ============================================================

    /**
     * 手动摇骰判定 (Phase 10 状态机接入点)
     * 当前为自动模拟，实际使用时挂起状态机等待玩家前台拍空格
     */
    evaluateManualRoll(skillCfg) {
        if (!skillCfg || !skillCfg.is_manual_roll) {
            return { manual: false, bonus: 0 };
        }
        const dice = this._evaluateDice(skillCfg);
        const bonus = dice.isSuccess ? (skillCfg.success_bonus_damage ?? 0) : 0;
        return {
            manual: true,
            roll: dice.roll,
            diceType: dice.diceType,
            successLine: dice.successLine,
            isSuccess: dice.isSuccess,
            bonus,
            message: dice.isSuccess
                ? `[手动摇骰 SUCCESS] 掷${dice.diceType}=${dice.roll} >= ${dice.successLine}, 追加+${bonus}`
                : `[手动摇骰 FAIL] 掷${dice.diceType}=${dice.roll} < ${dice.successLine}`
        };
    }

    // ============================================================
    // 向后兼容：保留原有技能方法（内部调用万能调度器）
    // ============================================================

    getSkillRange(skillType) {
        const uf = this._getUniversalFields(skillType);
        const cr = uf.cast_range;
        return { min: uf.min_cast_range, max: cr };
    }

    getAoeRadius(skillType) {
        const uf = this._getUniversalFields(skillType);
        return uf.aoe_radius;
    }

    resetStableForBattle() {
        this.stableUsedInBattle.clear();
    }

    // ---- 近战技能 ----

    executeCounter(unit, attacker, skillRange) {
        const cfg = getSkillConfig('counter');
        const uf = this._getUniversalFields('counter');
        const range = skillRange ?? uf.cast_range;
        const dist = this._hexDistance(unit, attacker);
        if (dist > range) return { triggered: false };

        const dice = this._evaluateDice(cfg);
        const baseBonus = uf.bonus || uf.base_damage || 2;
        const bonus = baseBonus + (dice.isSuccess ? uf.success_bonus_damage : 0);
        return {
            triggered: true, type: 'counter', attack_type: 'melee', active: true,
            bonus, bonus_value: bonus, damage_kind: uf.damage_kind, dice,
            message: dice.roll > 0
                ? `反击！掷${dice.diceType}=${dice.roll}, 伤害+${bonus}`
                : `反击触发！伤害 +${bonus}`
        };
    }

    executeBlock() {
        const cfg = getSkillConfig('block');
        const uf = this._getUniversalFields('block');
        const reduction = uf.reduction || 2;
        const dice = this._evaluateDice(cfg);
        const effReduction = reduction + (dice.isSuccess ? 1 : 0);
        return {
            triggered: true, blocked: true,
            reduction: effReduction, bonus_value: effReduction, dice,
            message: dice.roll > 0
                ? `格挡！伤害 -${effReduction} [掷${cfg.dice_type}=${dice.roll}${dice.isSuccess ? '>=success' : '<success'}]`
                : `格挡成功！伤害 -${effReduction}`
        };
    }

    getPolearmExtraRange(unit, target) {
        const sameQ = (unit.q || 0) === (target.q || 0);
        const sameR = (unit.r || 0) === (target.r || 0);
        if (sameQ || sameR) return 1;
        return 0;
    }

    executeSupply(unit, target) {
        const uf = this._getUniversalFields('supply');
        if (target) {
            const dist = this._hexDistance(unit, target);
            if (dist > uf.cast_range || dist === 0) {
                return {
                    heal_amount: 0, out_of_range: true,
                    min: 1, max: uf.cast_range, actual: dist,
                    message: `补给仅对范围 ${uf.cast_range} 内友军有效（当前距离 ${dist} 格）`
                };
            }
        }
        const melee = unit.melee || unit.attack || 10;
        const cfg = getSkillConfig('supply');
        const dice = this._evaluateDice(cfg);
        const healAmount = melee + (dice.isSuccess ? (uf.success_bonus_damage) : 0);
        return {
            heal_amount: healAmount, bonus_value: healAmount, dice,
            message: dice.roll > 0
                ? `补给：回复 ${healAmount} HP [掷${dice.diceType}=${dice.roll}]`
                : `补给：回复 ${healAmount} 点 HP`
        };
    }

    // ---- 远程技能 ----

    executeSweep(unit, target, allUnits) {
        const cfg = getSkillConfig('sweep');
        const uf = this._getUniversalFields('sweep');
        const sectorAngle = uf.sector_angle;
        const maxRange = uf.cast_range || uf.max_range;

        if (target && !this._isInSector(unit, target, maxRange, sectorAngle)) {
            return { mode: 'out_of_range', message: `扫射需要目标在扇形${maxRange}格范围内（当前超出范围）` };
        }

        const { damage: finalDmg, dice } = this._applyDiceToDamage(cfg);
        return {
            mode: 'precise', attack_type: 'ranged', active: true,
            targets: [target],
            base_damage: uf.base_damage || uf.damage_modifier_precise || -2,
            final_damage: finalDmg, damage_kind: uf.damage_kind,
            bonus_value: finalDmg, dice,
            message: dice?.roll > 0
                ? `扫射！掷${dice.diceType}=${dice.roll}${dice.isSuccess ? '>=success' : '<success'}, 伤害${finalDmg}`
                : `扫射精准命中！伤害 ${finalDmg}`
        };
    }

    executeThrow(unit, target) {
        const cfg = getSkillConfig('throw');
        const uf = this._getUniversalFields('throw');
        const minRange = uf.min_cast_range || uf.min_range || 1;
        const maxRange = uf.cast_range || uf.max_range;

        if (target) {
            const dist = this._hexDistance(unit, target);
            if (dist < minRange || dist > maxRange) {
                return {
                    mode: 'out_of_range',
                    min: minRange, max: maxRange, actual: dist,
                    message: `投掷需要 ${minRange}~${maxRange} 格距离（当前 ${dist} 格）`
                };
            }
        }

        const dice = this._evaluateDice(cfg);
        const baseAmp = uf.value || uf.base_damage || 5;
        const ampValue = baseAmp + (dice.isSuccess ? uf.success_bonus_damage : 0);
        return {
            mode: 'debuff', effect: 'damage_amp',
            value: ampValue, bonus_value: ampValue,
            aoe_radius: uf.aoe_radius || uf.aoe_range || 2,
            dice,
            message: dice.roll > 0
                ? `投掷！增伤+${ampValue} [掷${dice.diceType}=${dice.roll}]`
                : `投掷：目标周围 2 格内所有目标下次伤害 +${ampValue}`
        };
    }

    executeStable(unit, target) {
        const uf = this._getUniversalFields('stable');
        const unitKey = unit.id || unit.unit_id;
        if (this.stableUsedInBattle.get(unitKey)) {
            return { triggered: false, message: '稳定已在本次战斗中使用过' };
        }

        if (target) {
            const dist = this._hexDistance(unit, target);
            if (dist < 1 || dist > 4) {
                return {
                    triggered: false, out_of_range: true,
                    min: 1, max: 4, actual: dist,
                    message: `稳定需要 1~4 格距离（当前 ${dist} 格）`
                };
            }
        }

        this.stableUsedInBattle.set(unitKey, true);
        const ff = this.executeFocusedFire();

        return {
            triggered: true, type: 'stable', active: true,
            focused_fire: ff, bonus: ff.bonus, bonus_value: ff.bonus,
            message: `稳定触发！${ff.message}`
        };
    }

    canSniper(unit, target) {
        const cfg = getSkillConfig('sniper');
        const uf = this._getUniversalFields('sniper');
        if (unit.has_moved) {
            return { triggered: false, message: '狙击需要舍弃本回合移动' };
        }
        if (!target) {
            return { triggered: false, message: '狙击需要目标' };
        }
        const minRange = uf.min_cast_range || uf.min_range || 4;
        const maxRange = uf.cast_range || uf.max_range || 6;
        const dist = this._hexDistance(unit, target);
        if (dist < minRange || dist > maxRange) {
            return {
                triggered: false, out_of_range: true,
                min: minRange, max: maxRange, actual: dist,
                message: `狙击需要 ${minRange}~${maxRange} 格距离（当前 ${dist} 格）`
            };
        }
        const dice = this._evaluateDice(cfg);
        const mobReduce = 2 + (dice.isSuccess ? uf.success_bonus_damage : 0);
        return {
            triggered: true, type: 'sniper', attack_type: 'ranged', active: true,
            mobility_reduction: mobReduce, bonus_value: mobReduce, dice,
            damage_kind: uf.damage_kind,
            message: dice.roll > 0
                ? `狙击！掷${dice.diceType}=${dice.roll}, 目标机动值-${mobReduce}`
                : `狙击：舍弃移动，目标机动值 -${mobReduce}`
        };
    }

    // ---- 自动化技能 ----

    executeAssist(unit, increment = true) {
        const uf = this._getUniversalFields('assist');
        if (!unit || !unit.skills) return { triggered: false };
        const hasAssist = unit.skills.some(s => s && s.type === 'assist' && s.active);
        if (!hasAssist) return { triggered: false };

        if (increment) unit.assist_counter = (unit.assist_counter || 0) - 1;
        if ((unit.assist_counter || 0) <= 0) {
            unit.assist_counter = 0;
            return { triggered: false, message: '助攻效果已耗尽' };
        }

        const bonus = uf.bonus || uf.base_damage || 3;
        return {
            triggered: true, type: 'assist', active: true,
            bonus, bonus_value: bonus,
            remaining: unit.assist_counter,
            message: `助攻：伤害 +${bonus}（剩余 ${unit.assist_counter} 次）`
        };
    }

    executeGuard(unit, increment = true) {
        const uf = this._getUniversalFields('guard');
        if (!unit || !unit.skills) return { triggered: false };
        const hasGuard = unit.skills.some(s => s && s.type === 'guard' && s.active);
        if (!hasGuard) return { triggered: false };

        if (increment) unit.guard_counter = (unit.guard_counter || 0) - 1;
        if ((unit.guard_counter || 0) <= 0) {
            unit.guard_counter = 0;
            return { triggered: false, message: '守护效果已耗尽' };
        }

        const reduction = uf.reduction || 5;
        return {
            triggered: true, type: 'guard', active: true,
            reduction, bonus_value: reduction,
            remaining: unit.guard_counter,
            message: `守护：伤害 -${reduction}（剩余 ${unit.guard_counter} 次）`
        };
    }

    executeBlockade(unit, target, increment = true) {
        const uf = this._getUniversalFields('blockade');
        if (!unit || !unit.skills) return { triggered: false };
        const hasBlockade = unit.skills.some(s => s && s.type === 'blockade' && s.active);
        if (!hasBlockade) return { triggered: false };

        if (increment) unit.blockade_counter = (unit.blockade_counter || 0) - 1;
        if ((unit.blockade_counter || 0) <= 0) {
            unit.blockade_counter = 0;
            return { triggered: false, message: '阻碍效果已耗尽' };
        }

        const mobReduce = uf.value || uf.reduction || 5;
        return {
            triggered: true, type: 'blockade', active: true,
            mobility_reduction: mobReduce, bonus_value: mobReduce,
            remaining: unit.blockade_counter,
            message: `阻碍：对方机动值 -${mobReduce}（剩余 ${unit.blockade_counter} 次）`
        };
    }

    initAssistCounter(unit) { unit.assist_counter = 5; }
    initGuardCounter(unit) { unit.guard_counter = 3; }
    initBlockadeCounter(unit) { unit.blockade_counter = 3; }

    executeScout(unit, ally) {
        const uf = this._getUniversalFields('scout');
        const scoutRange = unit.ranged || unit.attack || 10;
        if (!ally) return { triggered: false };
        const dist = this._hexDistance(unit, ally);
        if (dist > scoutRange || unit.faction !== ally.faction) return { triggered: false };
        return {
            triggered: true, type: 'scout', active: true,
            evasion_bonus: uf.evasion_mod || 2,
            bonus_value: uf.evasion_mod || 2,
            scout_range: scoutRange,
            message: `侦察：友军闪避值 +${uf.evasion_mod || 2}（侦察范围 ${scoutRange} 格）`
        };
    }

    // ---- 特殊词条 ----

    executeExecute(target) {
        const uf = this._getUniversalFields('execute');
        const hp = target.hp || 0;
        const maxHp = target.max_hp || target.hp || 1;
        const thresholdPercent = uf.hp_threshold_percent || 10;
        const threshold = Math.max(1, Math.floor(maxHp * thresholdPercent / 100));

        if (hp <= 0 || hp > threshold) {
            return { executed: false, message: `HP=${hp} > 斩杀阈值 ${threshold}` };
        }
        return {
            executed: true, threshold,
            message: `斩杀！HP=${hp} ≤ 阈值${threshold} (${thresholdPercent}% maxHP)，目标直接阵亡`
        };
    }

    executeDuel(unitA, unitB) {
        const uf = this._getUniversalFields('duel');
        const maxA = Math.max(unitA.melee || unitA.attack || 10, unitA.ranged || 0);
        const maxB = Math.max(unitB.melee || unitB.attack || 10, unitB.ranged || 0);

        if (unitA.hp >= maxB || unitB.hp >= maxA) return { triggered: false };
        const dist = this._hexDistance(unitA, unitB);
        if (dist > 1) return { triggered: false };

        if (maxA === maxB) {
            return {
                triggered: true, draw: true,
                statA: maxA, statB: maxB,
                message: `决斗同归于尽！双方 max_attack=${maxA}`
            };
        }

        const winner = maxA > maxB ? 'attacker' : 'defender';
        return {
            triggered: true, draw: false, winner,
            statA: maxA, statB: maxB,
            message: `决斗！${winner === 'attacker' ? '攻击方' : '防御方'} 获胜 (max_attack: ${maxA} vs ${maxB})`
        };
    }

    executeSnatch(damageDealt, defenderWeaponAttack) {
        const uf = this._getUniversalFields('snatch');
        if (damageDealt <= defenderWeaponAttack) return { triggered: false };
        return {
            triggered: true, success: true,
            damage_reduced: Math.floor(damageDealt * (uf.damage_multiplier || 0.5)),
            message: `抢夺成功！获得武器，伤害减半为 ${Math.floor(damageDealt * (uf.damage_multiplier || 0.5))}`
        };
    }

    executeFocusedFire() {
        const cfg = getSkillConfig('focused_fire');
        const uf = this._getUniversalFields('focused_fire');
        const baseBonus = uf.base_damage || uf.bonus || 4;
        const dice = this._evaluateDice(cfg);
        const bonus = baseBonus + (dice.isSuccess ? uf.success_bonus_damage : 0);
        return {
            bonus, bonus_value: bonus, dice,
            message: dice.roll > 0
                ? `专注射击：掷${dice.diceType}=${dice.roll}, 伤害+${bonus}`
                : `专注射击：伤害 +${bonus}`
        };
    }

    executeLucky() {
        const cfg = getSkillConfig('lucky');
        const uf = this._getUniversalFields('lucky');
        const action = uf.action || 'remove_and_attack';
        return {
            action, bonus_value: 0,
            message: '幸运触发：再次移动并攻击'
        };
    }

    canReactivate(killConfirmed, lastReactivation) {
        return killConfirmed && !lastReactivation;
    }

    // ============================================================
    // 工具方法
    // ============================================================

    _hexDistance(a, b) {
        if (!a || !b) return 999;
        const dq = Math.abs((a.q || 0) - (b.q || 0));
        const dr = Math.abs((a.r || 0) - (b.r || 0));
        const ds = Math.abs(((a.q || 0) - (b.q || 0)) + ((a.r || 0) - (b.r || 0)));
        return Math.max(dq, dr, ds);
    }

    _isInSector(unit, target, maxDist = 2, sectorAngle = 60) {
        if (!unit || !target) return false;
        const dist = this._hexDistance(unit, target);
        if (dist > maxDist || dist === 0) return false;

        const dq = (target.q || 0) - (unit.q || 0);
        const dr = (target.r || 0) - (unit.r || 0);

        const x = dq + dr * 0.5;
        const y = dr * 0.866;

        const angle = Math.atan2(y, x) * 180 / Math.PI;
        const facing = unit.facing || 0;

        let diff = Math.abs(angle - facing);
        if (diff > 180) diff = 360 - diff;
        return diff <= sectorAngle;
    }

    // ============================================================
    // Phase9: 可破坏地形管道
    // ============================================================

    _getTerrainConfig() {
        try {
            const cfg = getGlossaryConfig();
            return cfg?.terrains || {};
        } catch (e) { return {}; }
    }

    _applyTerrainDamage(unit, targetCell, damage, battleState) {
        if (!targetCell || !battleState) return { terrainDestroyed: false, newTerrain: null, message: '' };
        const terrains = this._getTerrainConfig();
        const key = targetCell.q + ',' + targetCell.r;
        const currentTerrainId = (battleState.terrain && battleState.terrain[key]) || 'moon';
        const terrainDef = terrains[currentTerrainId];
        if (!terrainDef || !terrainDef.is_destructible) {
            return { terrainDestroyed: false, newTerrain: null, message: '' };
        }
        if (!battleState.terrain_hp) battleState.terrain_hp = {};
        if (battleState.terrain_hp[key] === undefined) {
            battleState.terrain_hp[key] = terrainDef.max_hp;
        }
        battleState.terrain_hp[key] -= damage;
        if (battleState.terrain_hp[key] <= 0) {
            const transformTo = terrainDef.destroyed_transform_to || 'moon';
            battleState.terrain[key] = transformTo;
            delete battleState.terrain_hp[key];
            return {
                terrainDestroyed: true,
                newTerrain: transformTo,
                message: terrainDef.name + ' 被摧毁！'
            };
        }
        return {
            terrainDestroyed: false,
            newTerrain: null,
            message: terrainDef.name + ' 受损: ' + battleState.terrain_hp[key] + '/' + terrainDef.max_hp
        };
    }

    _getTerrainDefenseBonus(cellQ, cellR, terrainMap) {
        if (!terrainMap) return 0;
        const terrains = this._getTerrainConfig();
        const tid = terrainMap[cellQ + ',' + cellR] || 'moon';
        const def = terrains[tid];
        return def?.defense_bonus ?? 0;
    }

    _getTerrainMoveCost(cellQ, cellR, terrainMap) {
        if (!terrainMap) return 1;
        const terrains = this._getTerrainConfig();
        const tid = terrainMap[cellQ + ',' + cellR] || 'moon';
        const def = terrains[tid];
        return def?.move_cost ?? 1;
    }
}


/**
 * Phase9: 全局地形实用函数 (无状态, 可外部调用)
 */
function getTerrainConfig() {
    try { return getGlossaryConfig()?.terrains || {}; }
    catch (e) { return {}; }
}

function evaluateTerrainDestruction(cellQ, cellR, damage, battleState) {
    const exec = new SkillExecutor();
    return exec._applyTerrainDamage(null, { q: cellQ, r: cellR }, damage, battleState);
}

module.exports = SkillExecutor;
```

## combatCore/skillRegistry.cjs

```js
'use strict';
/**
 * skillRegistry.cjs - 基于 key/type 的技能动态注册表
 *
 * 目的（方案 Step 3）：消除 combatResolver.js 中按技能名写死的
 * if/else 分发（_extractSkillBonuses），改为「注册即生效」的动态查找。
 *
 * 注册表键 = skill.type（即词条 key）。
 * 提取器签名：(ctx) => bonusObject | null
 *   ctx = { executor, unit, skill, resolvedSkill }
 *   - 仅在技能激活且触发时返回加成对象，否则返回 null（调用方 Skip）。
 *   - 行为与旧 _extractSkillBonuses 逐条 if 完全一致（零行为变更）。
 *
 * 新增机制只需 registerSkill(type, extractor)，无需改动 combatResolver 分发体。
 */

const REGISTRY = {};

function registerSkill(type, extractor) {
  if (!type || typeof extractor !== 'function') {
    throw new Error('registerSkill 需要 type 与 extractor 函数');
  }
  REGISTRY[type] = extractor;
}

function getBonusExtractor(type) {
  return REGISTRY[type] || null;
}

function hasSkill(type) {
  return Object.prototype.hasOwnProperty.call(REGISTRY, type);
}

// 内置注册（与旧分发逻辑 1:1 对齐）
registerSkill('assist', ({ executor, unit }) => {
  const r = executor.executeAssist(unit, false);
  return r.triggered ? { type: 'assist', value: r.bonus, bonus_value: r.bonus } : null;
});

registerSkill('blockade', ({ executor, unit }) => {
  const r = executor.executeBlockade(unit, undefined, false);
  return r.triggered
    ? { type: 'blockade', value: r.mobility_reduction, bonus_value: r.mobility_reduction }
    : null;
});

// 注：counter 在旧 _extractSkillBonuses 中写死 value:2（已知 P4 双份真相问题，
// 后续 Step 统一修复）；此处保留原值以保证零行为变更。
registerSkill('counter', () => ({ type: 'counter', value: 2, bonus_value: 2 }));

registerSkill('focused_fire', ({ executor, resolvedSkill }) => {
  // 旧逻辑：仅当当前结算技能正是 focused_fire 时才注入加成
  if (!(resolvedSkill && resolvedSkill.type === 'focused_fire')) return null;
  const ff = executor.executeFocusedFire();
  return { type: 'focused_fire', value: ff.bonus, bonus_value: ff.bonus };
});

registerSkill('guard', ({ executor, unit }) => {
  const r = executor.executeGuard(unit, false);
  return r.triggered ? { type: 'guard', value: r.reduction, bonus_value: r.reduction } : null;
});

module.exports = { registerSkill, getBonusExtractor, hasSkill, REGISTRY };
```

## combatCore/skillToTagConverter.cjs

```js
/**
 * 技能到词条转换器
 * 
 * 将阵营技能（FactionSkillRegistry）转换为词条格式（v2规范）
 * 实现向后兼容：新系统使用词条，旧系统保持 faction_skill 接口
 */

const FactionSkillRegistry = require('./factionSkillRegistry.cjs');
const { FACTION_IDS } = FactionSkillRegistry;

/**
 * 阵营技能转换配置
 * 定义每个技能如何映射到词条格式
 */
const SKILL_TO_TAG_MAPPINGS = {
  // ========== 地球联合 ==========
  'earth:artillery': {
    // 技能ID -> 词条配置
    targetPhase: 'turn_start',
    priority: 85,
    conditions: {
      type: 'action_available',
      params: { cooldown_ready: true }
    },
    effects: {
      type: 'area_damage',
      params: { damage: 15, radius: 2 }
    }
  },
  'earth:fortified_position': {
    targetPhase: 'on_damage_taken',
    priority: 75,
    conditions: {
      type: 'stance_check',
      params: { stance: 'defensive' }
    },
    effects: {
      type: 'damage_reduction',
      params: { amount: 3 }
    }
  },

  // ========== 拜隆 ==========
  'balon:reinforcement': {
    targetPhase: 'on_ally_attacked',
    priority: 80,
    conditions: {
      type: 'ally_in_range',
      params: { range: 2, faction: 'balon' }
    },
    effects: {
      type: 'damage_share',
      params: { share_ratio: 0.5 }
    }
  },
  'balon:coordinated_attack': {
    targetPhase: 'pre_attack',
    priority: 60,
    conditions: {
      type: 'ally_in_range',
      params: { range: 2 }
    },
    effects: {
      type: 'attack_bonus',
      params: { amount: 2 }
    }
  },

  // ========== 马克西翁 ==========
  'maxion:fog_system': {
    targetPhase: 'turn_start',
    priority: 50,
    conditions: {
      type: 'auto_trigger',
      params: { faction: 'maxion' }
    },
    effects: {
      type: 'buff_random',
      params: {
        dice_sides: 6,
        effects: {
          1: { buff_type: 'defense', value: 2 },
          2: { buff_type: 'defense', value: 2 },
          3: { buff_type: 'mobility', value: 1 },
          4: { buff_type: 'mobility', value: 1 },
          5: { buff_type: 'attack', value: 1 },
          6: { buff_type: 'attack', value: 1 }
        }
      }
    }
  },
  'maxion:mobile_strike': {
    targetPhase: 'post_attack',
    priority: 55,
    conditions: {
      type: 'dice_check',
      params: { sides: 10, threshold: 5, comparison: '>' }
    },
    effects: {
      type: 'grant_buff',
      params: { buff_type: 'mobility', value: 1, duration: 1 }
    }
  },
  'maxion:tactical_retreat': {
    targetPhase: 'turn_start',
    priority: 45,
    conditions: {
      type: 'hp_threshold',
      params: { threshold: 0.3 }
    },
    effects: {
      type: 'grant_buff',
      params: { buff_type: 'mobility', value: 2, duration: 1 }
    }
  }
};

/**
 * 效果类型枚举
 */
const EFFECT_TYPES = {
  AREA_DAMAGE: 'area_damage',
  DAMAGE_REDUCTION: 'damage_reduction',
  DAMAGE_SHARE: 'damage_share',
  ATTACK_BONUS: 'attack_bonus',
  BUFF_RANDOM: 'buff_random',
  GRANT_BUFF: 'grant_buff'
};

/**
 * 技能到词条转换器
 */
class SkillToTagConverter {
  constructor() {
    this.mappings = SKILL_TO_TAG_MAPPINGS;
    this.convertedTags = new Map();
  }

  /**
   * 获取技能的唯一键
   * @param {string} faction - 阵营ID
   * @param {string} skillId - 技能ID
   * @returns {string}
   */
  getSkillKey(faction, skillId) {
    return `${faction}:${skillId}`;
  }

  /**
   * 转换单个技能为词条格式
   * @param {string} faction - 阵营ID
   * @param {string} skillId - 技能ID
   * @param {object} skill - 技能定义
   * @returns {object} 词条格式
   */
  convertSkill(faction, skillId, skill) {
    const key = this.getSkillKey(faction, skillId);
    const mapping = this.mappings[key];

    if (!mapping) {
      console.warn(`[Converter] 未找到映射配置: ${key}`);
      return null;
    }

    const tag = {
      id: `faction_${faction}_${skillId}`,
      name: skill.name,
      source: 'faction_skill',
      source_faction: faction,
      source_skill_id: skillId,

      trigger: {
        phase: mapping.targetPhase,
        type: skill.type
      },

      conditions: this.buildConditions(mapping, skill, faction),

      effects: this.buildEffects(mapping, skill),

      params: {
        priority: mapping.priority,
        optional: skill.type === 'action_available',
        passive: skill.type === 'passive' || skill.type === 'conditional_passive',
        cooldown: skill.params?.cooldown || null
      },

      // 保留原始技能信息用于向后兼容
      _original_skill: {
        id: skill.id,
        name: skill.name,
        description: skill.description,
        type: skill.type
      }
    };

    this.convertedTags.set(key, tag);
    return tag;
  }

  /**
   * 构建条件
   */
  buildConditions(mapping, skill, faction) {
    const conditions = {
      required: []
    };

    switch (mapping.conditions.type) {
      case 'action_available':
        conditions.required.push({
          check: 'cooldown_ready',
          value: true
        });
        break;

      case 'stance_check':
        conditions.required.push({
          check: 'unit_stance',
          value: mapping.conditions.params.stance
        });
        break;

      case 'ally_in_range':
        conditions.required.push({
          check: 'ally_in_line_of_sight',
          value: mapping.conditions.params.range
        });
        if (mapping.conditions.params.faction) {
          conditions.required.push({
            check: 'target_faction',
            value: mapping.conditions.params.faction,
            operator: '=='
          });
        }
        break;

      case 'dice_check':
        conditions.required.push({
          check: 'dice_roll',
          value: mapping.conditions.params.threshold,
          operator: mapping.conditions.params.comparison
        });
        break;

      case 'hp_threshold':
        conditions.required.push({
          check: 'target_hp_percent',
          value: mapping.conditions.params.threshold,
          operator: '<='
        });
        break;

      case 'auto_trigger':
        // 自动触发无需额外条件
        break;
    }

    return conditions;
  }

  /**
   * 构建效果
   */
  buildEffects(mapping, skill) {
    const effects = [];

    switch (mapping.effects.type) {
      case EFFECT_TYPES.AREA_DAMAGE:
        effects.push({
          type: 'area_damage',
          dice: false,
          params: {
            damage: mapping.effects.params.damage,
            radius: mapping.effects.params.radius
          }
        });
        break;

      case EFFECT_TYPES.DAMAGE_REDUCTION:
        effects.push({
          type: 'damage_reduction',
          dice: false,
          params: {
            amount: mapping.effects.params.amount
          }
        });
        break;

      case EFFECT_TYPES.DAMAGE_SHARE:
        effects.push({
          type: 'damage_share',
          dice: false,
          params: {
            share_ratio: mapping.effects.params.share_ratio
          }
        });
        break;

      case EFFECT_TYPES.ATTACK_BONUS:
        effects.push({
          type: 'damage_bonus',
          dice: false,
          params: {
            amount: mapping.effects.params.amount
          }
        });
        break;

      case EFFECT_TYPES.BUFF_RANDOM:
        effects.push({
          type: 'buff_random',
          dice: true,
          params: mapping.effects.params
        });
        break;

      case EFFECT_TYPES.GRANT_BUFF:
        effects.push({
          type: 'grant_buff',
          dice: false,
          params: mapping.effects.params
        });
        break;
    }

    return effects;
  }

  /**
   * 转换所有阵营技能
   * @returns {Map<string, object>} 转换后的词条
   */
  convertAll() {
    // 地球联合
    const earthData = FactionSkillRegistry.FactionSkillRegistry?.earth || FactionSkillRegistry['earth'];
    if (earthData) {
      Object.entries(earthData.skills).forEach(([skillId, skill]) => {
        this.convertSkill(FACTION_IDS.EARTH, skillId, skill);
      });
    }

    // 拜隆
    const balonData = FactionSkillRegistry.FactionSkillRegistry?.balon || FactionSkillRegistry['balon'];
    if (balonData) {
      Object.entries(balonData.skills).forEach(([skillId, skill]) => {
        this.convertSkill(FACTION_IDS.BALON, skillId, skill);
      });
    }

    // 马克西翁
    const maxionData = FactionSkillRegistry.FactionSkillRegistry?.maxion || FactionSkillRegistry['maxion'];
    if (maxionData) {
      Object.entries(maxionData.skills).forEach(([skillId, skill]) => {
        this.convertSkill(FACTION_IDS.MAXION, skillId, skill);
      });
    }

    return this.convertedTags;
  }

  /**
   * 获取阵营的词条
   * @param {string} faction - 阵营ID
   * @returns {object[]} 词条数组
   */
  getTagsForFaction(faction) {
    const tags = [];
    this.convertedTags.forEach((tag, key) => {
      if (key.startsWith(`${faction}:`)) {
        tags.push(tag);
      }
    });
    return tags;
  }

  /**
   * 获取所有已转换的词条
   * @returns {object[]}
   */
  getAllTags() {
    return Array.from(this.convertedTags.values());
  }

  /**
   * 导出为注册表格式
   * @returns {object} 可用于注册到 TagRegistry 的格式
   */
  exportAsRegistry() {
    const registry = {};
    this.convertedTags.forEach((tag, key) => {
      registry[tag.id] = tag;
    });
    return registry;
  }
}

// 单例导出
module.exports = new SkillToTagConverter();
module.exports.SkillToTagConverter = SkillToTagConverter;
module.exports.EFFECT_TYPES = EFFECT_TYPES;
```

## combatCore/tagChainManager.cjs

```js
/**
 * TagChainManager - 词条链管理器
 *
 * 职责:
 * 1. 管理词条链（多个词条组合）
 * 2. 词条链的执行顺序控制
 * 3. 词条链的条件与冲突处理
 * 4. 词条链与战斗流程的集成
 */

const hookChain = require('./hookChain.cjs');
const { TagQueue } = require('./priorityQueue.cjs');

class TagChainManager {
  constructor() {
    // 活跃的词条链
    this.activeChains = new Map();

    // 词条链定义
    this.chains = new Map();

    // 冲突词条映射
    this.conflicts = new Map();

    // 组合词条映射
    this.combinations = new Map();

    // 执行统计
    this.stats = {
      triggered: 0,
      skipped: 0,
      conflicts: 0,
      byChain: {}
    };
  }

  /**
   * 定义词条链
   */
  defineChain(chainId, config) {
    this.chains.set(chainId, {
      id: chainId,
      name: config.name || chainId,
      tags: config.tags || [],  // 词条ID列表
      conditions: config.conditions || null,  // 链激活条件
      exclusive: config.exclusive || false,   // 是否独占（互斥）
      priority: config.priority || 0,
      description: config.description || ''
    });

    // 如果是独占链，建立冲突映射
    if (config.exclusive) {
      for (const tagId of config.tags) {
        if (!this.conflicts.has(tagId)) {
          this.conflicts.set(tagId, new Set());
        }
        for (const otherTagId of config.tags) {
          if (tagId !== otherTagId) {
            this.conflicts.get(tagId).add(otherTagId);
          }
        }
      }
    }

    return { success: true, chainId };
  }

  /**
   * 定义组合词条
   */
  defineCombination(comboId, config) {
    this.combinations.set(comboId, {
      id: comboId,
      name: config.name,
      requiredTags: config.requiredTags || [],
      bonusEffects: config.bonusEffects || [],
      bonusPriority: config.bonusPriority || 10,
      description: config.description
    });

    return { success: true, comboId };
  }

  /**
   * 激活词条链
   */
  activateChain(chainId, context) {
    const chain = this.chains.get(chainId);
    if (!chain) {
      return { success: false, reason: 'chain_not_found' };
    }

    // 检查链激活条件
    if (chain.conditions) {
      const conditionsMet = this.checkChainConditions(chain.conditions, context);
      if (!conditionsMet) {
        return { success: false, reason: 'conditions_not_met' };
      }
    }

    // 检查是否已激活
    if (this.activeChains.has(chainId)) {
      return { success: true, action: 'already_active', chainId };
    }

    // 检查独占冲突
    if (chain.exclusive) {
      const conflictingChain = this.findConflictingChain(chainId);
      if (conflictingChain) {
        return {
          success: false,
          reason: 'conflict',
          conflictingChain
        };
      }
    }

    // 激活链
    this.activeChains.set(chainId, {
      chain,
      activatedAt: Date.now(),
      context
    });

    // 更新统计
    if (!this.stats.byChain[chainId]) {
      this.stats.byChain[chainId] = { triggered: 0, skipped: 0 };
    }

    return { success: true, action: 'activated', chainId };
  }

  /**
   * 停用词条链
   */
  deactivateChain(chainId) {
    if (this.activeChains.has(chainId)) {
      this.activeChains.delete(chainId);
      return { success: true, chainId };
    }
    return { success: false, reason: 'not_active' };
  }

  /**
   * 检查链条件
   */
  checkChainConditions(conditions, context) {
    // 简化的条件检查
    if (conditions.phase && context.phase !== conditions.phase) {
      return false;
    }

    if (conditions.faction && context.unit?.faction !== conditions.faction) {
      return false;
    }

    if (conditions.minTags && context.tags?.length < conditions.minTags) {
      return false;
    }

    return true;
  }

  /**
   * 查找冲突链
   */
  findConflictingChain(chainId) {
    const chain = this.chains.get(chainId);
    if (!chain) return null;

    for (const [activeChainId] of this.activeChains) {
      const activeChain = this.chains.get(activeChainId);
      if (activeChain?.exclusive) {
        // 检查是否有共同的词条
        const hasCommonTag = chain.tags.some(tag => activeChain.tags.includes(tag));
        if (hasCommonTag) {
          return activeChainId;
        }
      }
    }

    return null;
  }

  /**
   * 检查词条冲突
   */
  checkConflicts(tagId) {
    const conflictingTags = this.conflicts.get(tagId);
    if (!conflictingTags) return [];

    return Array.from(conflictingTags).filter(conflictTagId => {
      // 检查是否有活跃链包含冲突词条
      for (const [, activeChain] of this.activeChains) {
        if (activeChain.chain.tags.includes(conflictTagId)) {
          return true;
        }
      }
      return false;
    });
  }

  /**
   * 检查组合词条
   */
  checkCombinations(unitTags) {
    const activeCombos = [];

    for (const [, combo] of this.combinations) {
      const hasAllTags = combo.requiredTags.every(tagId => unitTags.includes(tagId));
      if (hasAllTags) {
        activeCombos.push(combo);
      }
    }

    return activeCombos;
  }

  /**
   * 执行活跃词条链
   */
  async executeActiveChains(phase, context) {
    const results = [];

    for (const [chainId, activeChain] of this.activeChains) {
      // 获取链中的词条
      const chainTags = activeChain.chain.tags
        .map(tagId => hookChain.hooks[phase]?.find(h => h.tag.id === tagId))
        .filter(Boolean);

      if (chainTags.length === 0) continue;

      // 更新统计
      this.stats.byChain[chainId].triggered++;

      // 执行每个词条
      for (const chainTag of chainTags) {
        try {
          const result = await chainTag.handler(context);
          results.push({
            chainId,
            tagId: chainTag.tag.id,
            ...result
          });

          if (result.triggered) {
            this.stats.triggered++;
          } else {
            this.stats.skipped++;
          }
        } catch (error) {
          console.error(`[TagChain] 执行失败: ${chainTag.tag.id}`, error);
          results.push({
            chainId,
            tagId: chainTag.tag.id,
            triggered: false,
            error: error.message
          });
        }
      }
    }

    return results;
  }

  /**
   * 获取活跃链的词条队列
   */
  getActiveTagQueue(phase) {
    const queue = new TagQueue();

    for (const [chainId, activeChain] of this.activeChains) {
      for (const tagId of activeChain.chain.tags) {
        const tag = hookChain.hooks[phase]?.find(h => h.tag.id === tagId);
        if (tag) {
          queue.enqueueTag(tag.tag, { chainId });
        }
      }
    }

    return queue;
  }

  /**
   * 获取链摘要
   */
  getChainSummary(chainId) {
    const chain = this.chains.get(chainId);
    if (!chain) return null;

    const isActive = this.activeChains.has(chainId);
    const activeInfo = isActive ? this.activeChains.get(chainId) : null;

    return {
      ...chain,
      isActive,
      activatedAt: activeInfo?.activatedAt,
      stats: this.stats.byChain[chainId] || { triggered: 0, skipped: 0 }
    };
  }

  /**
   * 获取所有链摘要
   */
  getAllChainSummaries() {
    return Array.from(this.chains.keys()).map(chainId =>
      this.getChainSummary(chainId)
    );
  }

  /**
   * 获取活跃链列表
   */
  getActiveChains() {
    return Array.from(this.activeChains.entries()).map(([id, info]) => ({
      id,
      ...info.chain,
      activatedAt: info.activatedAt
    }));
  }

  /**
   * 获取执行统计
   */
  getStats() {
    return {
      ...this.stats,
      activeChains: this.activeChains.size,
      totalChains: this.chains.size
    };
  }

  /**
   * 重置统计
   */
  resetStats() {
    this.stats = {
      triggered: 0,
      skipped: 0,
      conflicts: 0,
      byChain: {}
    };
    return true;
  }

  /**
   * 停用所有链
   */
  deactivateAll() {
    const count = this.activeChains.size;
    this.activeChains.clear();
    return { deactivated: count };
  }

  /**
   * 清理链定义
   */
  clear() {
    this.chains.clear();
    this.activeChains.clear();
    this.conflicts.clear();
    this.combinations.clear();
    return true;
  }
}

// 单例导出
module.exports = new TagChainManager();
```

## combatCore/tagCompatibilityAdapter.cjs

```js
/**
 * 词条兼容适配器 (TagCompatibilityAdapter)
 * 
 * 职责:
 * 1. 确保 faction_skill 字段与词条系统双向兼容
 * 2. 提供统一的技能查询接口
 * 3. 在战斗流程中自动同步新旧系统
 */

const FactionSkillRegistry = require('./factionSkillRegistry.cjs');
const tagRegistry = require('./tagRegistry.cjs');
const skillConverter = require('./skillToTagConverter.cjs');

class TagCompatibilityAdapter {
  constructor() {
    this.initialized = false;
    this.factionTagMap = new Map(); // 阵营技能ID -> 转换后词条ID
  }

  /**
   * 初始化适配器
   * 自动将所有阵营技能转换为词条并注册
   */
  initialize() {
    if (this.initialized) {
      return { status: 'already_initialized', tagsRegistered: this.factionTagMap.size };
    }

    // 1. 转换所有阵营技能为词条
    skillConverter.convertAll();
    const convertedTags = skillConverter.getAllTags();

    // 2. 注册到词条注册表
    convertedTags.forEach(tag => {
      // 使用带前缀的ID避免冲突
      const registryId = tag.id;
      
      // 保存映射关系
      const originalKey = `${tag.source_faction}:${tag.source_skill_id}`;
      this.factionTagMap.set(originalKey, registryId);

      // 注册到词条注册表（带标记表明来源）
      try {
        tagRegistry.register(registryId, tag);
      } catch (e) {
        // 词条已存在，跳过
      }
    });

    this.initialized = true;

    return {
      status: 'initialized',
      tagsRegistered: convertedTags.length,
      factions: ['earth', 'balon', 'maxion']
    };
  }

  /**
   * 获取单位的有效技能列表
   * 同时支持 faction_skill 和 equipped_tags
   * 
   * @param {object} unit - 单位对象
   * @returns {object[]} 技能列表
   */
  getUnitSkills(unit) {
    const skills = [];

    // 1. 获取阵营技能（从 faction_skill 字段）
    if (unit.faction_skill) {
      const factionSkills = Array.isArray(unit.faction_skill) 
        ? unit.faction_skill 
        : [unit.faction_skill];
      
      factionSkills.forEach(skillId => {
        const skill = FactionSkillRegistry.getFactionSkill(unit.faction, skillId);
        if (skill) {
          skills.push({
            ...skill,
            source: 'faction_skill',
            source_type: 'faction'
          });
        }
      });
    }

    // 2. 获取装备词条（从 equipped_tags 字段）
    if (unit.equipped_tags) {
      const tags = Array.isArray(unit.equipped_tags) 
        ? unit.equipped_tags 
        : [unit.equipped_tags];
      
      tags.forEach(tagId => {
        const tag = tagRegistry.getById(tagId);
        if (tag) {
          skills.push({
            ...tag,
            source: 'equipped_tag',
            source_type: 'item'
          });
        }
      });
    }

    return skills;
  }

  /**
   * 获取技能执行的触发钩子
   * 
   * @param {object} skill - 技能/词条对象
   * @returns {string|null} 触发阶段
   */
  getTriggerPhase(skill) {
    // 来自阵营技能
    if (skill.source === 'faction_skill' || skill.trigger?.phase) {
      return skill.trigger?.phase || skill.trigger?.phase;
    }
    
    // 来自词条
    if (skill.source === 'equipped_tag' || skill.conditions?.required) {
      return skill.trigger?.phase;
    }

    return null;
  }

  /**
   * 检查技能是否可以触发
   * 
   * @param {object} unit - 单位
   * @param {string} skillId - 技能ID（支持 faction:skillId 或直接 tagId）
   * @param {object} context - 执行上下文
   * @returns {boolean}
   */
  canTrigger(unit, skillId, context) {
    // 解析技能ID
    let faction, skillIdPart;
    
    if (skillId.includes(':')) {
      [faction, skillIdPart] = skillId.split(':');
    } else {
      faction = unit.faction;
      skillIdPart = skillId;
    }

    // 尝试从阵营技能获取
    const factionSkill = FactionSkillRegistry.getFactionSkill(faction, skillIdPart);
    if (factionSkill) {
      return this.checkFactionSkillCondition(factionSkill, unit, context);
    }

    // 尝试从词条获取
    const tag = tagRegistry.getById(skillId);
    if (tag) {
      return this.checkTagCondition(tag, unit, context);
    }

    return false;
  }

  /**
   * 检查阵营技能触发条件
   */
  checkFactionSkillCondition(skill, unit, context) {
    // 检查冷却
    if (skill.params?.cooldown && context.cooldowns?.[skill.id] > 0) {
      return false;
    }

    // 检查姿态
    if (skill.checkCondition && typeof skill.checkCondition === 'function') {
      return skill.checkCondition(unit);
    }

    return true;
  }

  /**
   * 检查词条触发条件
   */
  checkTagCondition(tag, unit, context) {
    const ConditionEvaluator = require('./conditionEvaluator.cjs');
    return ConditionEvaluator.evaluate(tag.conditions, context);
  }

  /**
   * 执行技能/词条
   * 统一接口，屏蔽来源差异
   * 
   * @param {string} skillId - 技能ID
   * @param {string} source - 来源类型 'faction_skill' | 'equipped_tag'
   * @param {object} context - 执行上下文
   * @returns {object} 执行结果
   */
  async execute(skillId, source, context) {
    if (source === 'faction_skill') {
      return this.executeFactionSkill(skillId, context);
    } else {
      return this.executeTag(skillId, context);
    }
  }

  /**
   * 执行阵营技能
   */
  async executeFactionSkill(skillId, context) {
    const [faction, sid] = skillId.includes(':') 
      ? skillId.split(':') 
      : [context.unit?.faction, skillId];

    const skill = FactionSkillRegistry.getFactionSkill(faction, sid);
    if (!skill || !skill.execute) {
      return { success: false, error: 'skill_not_found' };
    }

    return await skill.execute(context);
  }

  /**
   * 执行词条
   */
  async executeTag(tagId, context) {
    const EffectExecutor = require('./effectExecutor.cjs');
    const tag = tagRegistry.getById(tagId);
    
    if (!tag) {
      return { success: false, error: 'tag_not_found' };
    }

    return await EffectExecutor.execute(tag.effects, context);
  }

  /**
   * 获取兼容的技能信息摘要
   * 用于UI展示
   * 
   * @param {object} unit - 单位
   * @returns {object} 技能摘要
   */
  getSkillsSummary(unit) {
    const skills = this.getUnitSkills(unit);
    
    return {
      unit_id: unit.id,
      unit_name: unit.name,
      faction: unit.faction,
      skills: skills.map(s => ({
        id: s.id,
        name: s.name,
        description: s.description,
        source: s.source,
        trigger_phase: this.getTriggerPhase(s),
        type: s.type
      })),
      total_count: skills.length
    };
  }

  /**
   * 验证单位数据结构兼容性
   * 
   * @param {object} unit - 单位对象
   * @returns {object} 验证结果
   */
  validateUnitCompatibility(unit) {
    const issues = [];

    // 检查必要字段
    if (!unit.id) issues.push('缺少 id 字段');
    if (!unit.faction) issues.push('缺少 faction 字段');

    // 检查阵营有效性
    if (unit.faction && !['earth', 'balon', 'maxion'].includes(unit.faction)) {
      issues.push(`无效阵营: ${unit.faction}`);
    }

    // 检查技能字段（可选）
    const hasFactionSkill = unit.faction_skill !== undefined;
    const hasEquippedTags = unit.equipped_tags !== undefined;

    if (!hasFactionSkill && !hasEquippedTags) {
      issues.push('建议添加 faction_skill 或 equipped_tags 字段以获得完整技能');
    }

    return {
      valid: issues.length === 0,
      issues,
      warnings: issues.filter(i => i.includes('建议'))
    };
  }
}

// 单例导出
module.exports = new TagCompatibilityAdapter();
module.exports.TagCompatibilityAdapter = TagCompatibilityAdapter;
```

## combatCore/tagDatabaseManager.cjs

```js
/**
 * TagDatabaseManager - 词条数据库管理器
 *
 * 职责:
 * 1. 词条的持久化存储（JSON文件）
 * 2. 词条的导入/导出功能
 * 3. 词条的增删改查（CRUD）
 * 4. 词条的版本管理
 */

const fs = require('fs');
const path = require('path');

class TagDatabaseManager {
  constructor(dbPath = null) {
    // 默认数据库路径
    this.dbPath = dbPath || path.join(__dirname, '../../data/tags.json');
    this.tags = new Map(); // 内存缓存
    this.versions = []; // 版本历史
    this.loaded = false;
  }

  /**
   * 初始化数据库目录
   */
  init() {
    const dir = path.dirname(this.dbPath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    return this;
  }

  /**
   * 加载词条数据库
   */
  load() {
    try {
      if (fs.existsSync(this.dbPath)) {
        const data = JSON.parse(fs.readFileSync(this.dbPath, 'utf8'));
        this.tags = new Map(Object.entries(data.tags || {}));
        this.versions = data.versions || [];
        this.loaded = true;
        console.log(`[TagDB] 加载了 ${this.tags.size} 个词条`);
        return true;
      }
    } catch (error) {
      console.error('[TagDB] 加载失败:', error.message);
    }
    this.loaded = true;
    return false;
  }

  /**
   * 保存词条数据库
   */
  save() {
    try {
      this.init();
      const data = {
        tags: Object.fromEntries(this.tags),
        versions: this.versions,
        lastUpdated: new Date().toISOString()
      };
      fs.writeFileSync(this.dbPath, JSON.stringify(data, null, 2), 'utf8');
      console.log(`[TagDB] 保存了 ${this.tags.size} 个词条`);
      return true;
    } catch (error) {
      console.error('[TagDB] 保存失败:', error.message);
      return false;
    }
  }

  /**
   * 注册新词条
   * @param {object} tag - 词条定义
   */
  register(tag) {
    if (!tag.id) {
      throw new Error('词条必须包含 id 字段');
    }

    // 验证词条结构
    this.validateTag(tag);

    const oldTag = this.tags.get(tag.id);
    this.tags.set(tag.id, {
      ...tag,
      createdAt: oldTag?.createdAt || new Date().toISOString(),
      updatedAt: new Date().toISOString()
    });

    return { success: true, action: oldTag ? 'updated' : 'created' };
  }

  /**
   * 验证词条结构
   */
  validateTag(tag) {
    const required = ['id', 'name', 'trigger', 'effects'];
    for (const field of required) {
      if (!tag[field]) {
        throw new Error(`词条缺少必需字段: ${field}`);
      }
    }

    // 验证 trigger.phase
    const validPhases = [
      'round_start', 'turn_start', 'turn_end',
      'pre_attack', 'on_attack', 'post_attack',
      'pre_damage', 'on_damage', 'post_damage',
      'on_kill', 'on_death', 'on_defended',
      'on_damage_taken', 'on_ally_attacked',
      'movement_check', 'on_airdrop_receive', 'on_buff_expire'
    ];

    if (!validPhases.includes(tag.trigger.phase)) {
      throw new Error(`无效的 trigger.phase: ${tag.trigger.phase}`);
    }

    // 验证 effects 数组
    if (!Array.isArray(tag.effects) || tag.effects.length === 0) {
      throw new Error('effects 必须是包含至少一个效果的数组');
    }

    return true;
  }

  /**
   * 获取词条
   */
  get(id) {
    return this.tags.get(id) || null;
  }

  /**
   * 获取所有词条
   */
  getAll() {
    return Array.from(this.tags.values());
  }

  /**
   * 按阶段获取词条
   */
  getByPhase(phase) {
    return this.getAll().filter(tag => tag.trigger.phase === phase);
  }

  /**
   * 按阵营获取词条
   */
  getByFaction(faction) {
    return this.getAll().filter(tag => tag.faction === faction);
  }

  /**
   * 删除词条
   */
  delete(id) {
    if (this.tags.has(id)) {
      this.tags.delete(id);
      return true;
    }
    return false;
  }

  /**
   * 批量导入词条
   */
  importBatch(tags) {
    const results = { success: 0, failed: 0, errors: [] };

    for (const tag of tags) {
      try {
        this.register(tag);
        results.success++;
      } catch (error) {
        results.failed++;
        results.errors.push({ id: tag.id, error: error.message });
      }
    }

    if (results.success > 0) {
      this.save();
    }

    return results;
  }

  /**
   * 导出所有词条
   */
  export() {
    return {
      version: '1.0',
      exportedAt: new Date().toISOString(),
      count: this.tags.size,
      tags: this.getAll()
    };
  }

  /**
   * 导出为指定格式
   */
  exportAs(format) {
    const data = this.export();

    switch (format) {
      case 'csv':
        return this.toCSV(data.tags);
      case 'markdown':
        return this.toMarkdown(data.tags);
      case 'json':
      default:
        return JSON.stringify(data, null, 2);
    }
  }

  /**
   * 转换为CSV格式
   */
  toCSV(tags) {
    const headers = ['id', 'name', 'phase', 'priority', 'optional', 'consumable'];
    const rows = tags.map(tag => [
      tag.id,
      tag.name,
      tag.trigger.phase,
      tag.params?.priority || 0,
      tag.params?.optional || false,
      tag.params?.consumable || false
    ].join(','));

    return [headers.join(','), ...rows].join('\n');
  }

  /**
   * 转换为Markdown格式
   */
  toMarkdown(tags) {
    let md = '# 词条数据库\n\n';
    md += `> 导出时间: ${new Date().toISOString()}\n\n`;

    // 按阶段分组
    const byPhase = {};
    for (const tag of tags) {
      const phase = tag.trigger.phase;
      if (!byPhase[phase]) byPhase[phase] = [];
      byPhase[phase].push(tag);
    }

    for (const [phase, phaseTags] of Object.entries(byPhase)) {
      md += `## ${phase}\n\n`;
      md += '| 名称 | ID | 优先级 | 可选 | 消耗 |\n';
      md += '|------|-----|--------|------|------|\n';

      for (const tag of phaseTags) {
        md += `| ${tag.name} | \`${tag.id}\` | ${tag.params?.priority || 0} | ${tag.params?.optional ? '✓' : '-'} | ${tag.params?.consumable ? '✓' : '-'} |\n`;
      }
      md += '\n';
    }

    return md;
  }

  /**
   * 创建版本快照
   */
  createSnapshot(name) {
    const snapshot = {
      name,
      timestamp: new Date().toISOString(),
      tags: this.export()
    };

    this.versions.push(snapshot);
    return snapshot;
  }

  /**
   * 恢复版本
   */
  restore(versionIndex) {
    if (versionIndex >= this.versions.length) {
      throw new Error('版本索引无效');
    }

    const version = this.versions[versionIndex];
    this.tags.clear();

    for (const tag of version.tags.tags) {
      this.tags.set(tag.id, tag);
    }

    this.save();
    return { restored: version.name, count: this.tags.size };
  }

  /**
   * 获取数据库统计
   */
  getStats() {
    const byPhase = {};
    for (const tag of this.tags.values()) {
      const phase = tag.trigger.phase;
      byPhase[phase] = (byPhase[phase] || 0) + 1;
    }

    return {
      total: this.tags.size,
      byPhase,
      versions: this.versions.length
    };
  }

  /**
   * 搜索词条
   */
  search(query) {
    const q = query.toLowerCase();
    return this.getAll().filter(tag =>
      tag.id.toLowerCase().includes(q) ||
      tag.name.toLowerCase().includes(q) ||
      (tag.description && tag.description.toLowerCase().includes(q))
    );
  }

  /**
   * 清除所有词条
   */
  clear() {
    this.tags.clear();
    this.save();
    return true;
  }

  /**
   * 重新加载
   */
  reload() {
    this.tags.clear();
    return this.load();
  }
}

// 单例导出
module.exports = new TagDatabaseManager();
```

## combatCore/tagProcessor.cjs

```js
/**
 * TagProcessor - 词条处理器
 * 负责词条触发判定和效果执行
 */

const tagRegistry = require('./tagRegistry.cjs');

class TagProcessor {
  constructor() {
    this.registry = tagRegistry;
  }

  /**
   * 掷骰子
   * @param {number} sides - 骰子面数
   * @returns {number} 掷骰结果
   */
  rollDice(sides = 6) {
    return Math.floor(Math.random() * sides) + 1;
  }

  /**
   * 获取检查项的值
   * @param {string} check - 检查项名称
   * @param {object} context - 上下文数据
   * @returns {*} 检查结果
   */
  resolveCheck(check, context) {
    const {
      attacker, target, battle,
      attackType, damageDealt, moveContext,
      currentRound, currentTurn
    } = context;

    const checkMap = {
      // 攻击类型
      attack_type: () => attackType,

      // HP相关
      target_hp: () => target?.hp || 0,
      self_hp: () => attacker?.hp || 0,

      // 射程相关
      target_in_range: () => context.targetInRange ?? false,
      self_in_target_range: () => context.selfInTargetRange ?? false,

      // 攻击值相关
      target_attack_max: () => this.getMaxAttack(target),
      self_attack_max: () => this.getMaxAttack(attacker),

      // 抢夺相关
      damage_dealt: () => damageDealt || 0,
      target_weapon_attack: () => this.getWeaponAttack(target),
      target_has_weapon: () => this.hasWeapon(target),

      // 移动相关
      move_action_used: () => context.moveActionUsed ?? false,
      moving_unit_faction: () => moveContext?.movingUnit?.faction || null,
      blocking_units_count: () => moveContext?.blockingUnits?.length || 0,
      blocking_units_aligned: () => this.checkAlignment(moveContext),

      // 援助相关
      ally_in_line_of_sight: () => context.allyInLineOfSight ?? false,
      ally_faction: () => context.allyFaction || null,
      ally_is_being_attacked: () => context.allyIsBeingAttacked ?? false,

      // 抗性相关
      has_armor: () => this.hasArmor(target),
      armor_resistance_type: () => this.getArmorResistanceType(target),
      attack_damage_type: () => context.attackDamageType || 'kinetic',

      // 空投相关
      current_round: () => currentRound || 1,

      // 阵营相关
      target_faction: () => target?.faction || null
    };

    const resolver = checkMap[check];
    return resolver ? resolver() : null;
  }

  /**
   * 获取单位最大攻击值
   */
  getMaxAttack(unit) {
    if (!unit) return 0;
    const melee = unit.melee_attack || 0;
    const ranged = unit.ranged_attack || 0;
    return Math.max(melee, ranged);
  }

  /**
   * 获取单位武器攻击值
   */
  getWeaponAttack(unit) {
    if (!unit?.equipment?.left_hand?.attack) return 0;
    return unit.equipment.left_hand.attack;
  }

  /**
   * 检查单位是否有武器
   */
  hasWeapon(unit) {
    return unit?.equipment?.left_hand?.attack > 0;
  }

  /**
   * 检查单位是否有防具
   */
  hasArmor(unit) {
    return unit?.equipment?.left_arm?.defense > 0 || 
           unit?.equipment?.right_arm?.defense > 0;
  }

  /**
   * 获取防具抗性类型
   */
  getArmorResistanceType(unit) {
    // 默认返回实体伤害抗性
    return unit?.equipment?.left_arm?.resistance_type || 
           unit?.equipment?.right_arm?.resistance_type || 
           'kinetic';
  }

  /**
   * 检查阻挡单位排列方式
   */
  checkAlignment(moveContext) {
    if (!moveContext?.blockingUnits) return null;
    // 简化：假设横向排列
    if (moveContext.blockingUnits.length >= 3) {
      return 'horizontal';
    }
    return null;
  }

  /**
   * 评估条件
   * @param {array} conditions - 条件数组
   * @param {object} context - 上下文
   * @returns {boolean} 是否满足条件
   */
  evaluateConditions(conditions, context) {
    if (!conditions.required || conditions.required.length === 0) {
      return true;
    }

    return conditions.required.every(cond => {
      const actualValue = this.resolveCheck(cond.check, context);
      const compareValue = cond.value ?? cond.ref;

      switch (cond.operator) {
        case '==': return actualValue === compareValue;
        case '!=': return actualValue !== compareValue;
        case '>': return actualValue > compareValue;
        case '<': return actualValue < compareValue;
        case '>=': return actualValue >= compareValue;
        case '<=': return actualValue <= compareValue;
        default: return false;
      }
    });
  }

  /**
   * 执行掷骰效果
   * @param {object} diceConfig - 骰子配置
   * @returns {object} 掷骰结果
   */
  executeDice(diceConfig) {
    const result = this.rollDice(diceConfig.sides || 6);
    
    // 查找命中的选项
    if (diceConfig.choices) {
      for (const choice of diceConfig.choices) {
        if (result >= choice.range[0] && result <= choice.range[1]) {
          return { roll: result, choice, ...choice };
        }
      }
    }

    // outcomes 模式
    if (diceConfig.outcomes) {
      return { roll: result, outcomes: diceConfig.outcomes };
    }

    return { roll: result };
  }

  /**
   * 执行词条效果
   * @param {object} tag - 词条定义
   * @param {object} context - 上下文
   * @returns {object} 执行结果
   */
  executeEffects(tag, context) {
    const results = [];

    for (const effect of tag.effects) {
      let result = { type: effect.type };

      switch (effect.type) {
        case 'instant_kill':
          // 斩杀：掷骰≥目标HP
          const killRoll = this.executeDice(effect.dice);
          result = {
            ...result,
            roll: killRoll.roll,
            success: killRoll.roll >= context.target?.hp,
            message: killRoll.roll >= context.target?.hp 
              ? `${tag.name}成功！目标被斩杀` 
              : `${tag.name}失败！目标存活`
          };
          break;

        case 'duel_resolution':
          // 决斗：双方掷骰比大小
          const attackerRoll = this.executeDice(effect.dice);
          const defenderRoll = this.executeDice(effect.dice);
          result = {
            ...result,
            attackerRoll: attackerRoll.roll,
            defenderRoll: defenderRoll.roll,
            winner: attackerRoll.roll > defenderRoll.roll ? 'attacker' : 
                   attackerRoll.roll < defenderRoll.roll ? 'defender' : 'tie',
            message: attackerRoll.roll > defenderRoll.roll 
              ? '攻击方决斗胜利' 
              : attackerRoll.roll < defenderRoll.roll 
              ? '防御方决斗胜利' 
              : '决斗平局，同归于尽'
          };
          break;

        case 'plunder_attempt':
          // 抢夺
          const plunderRoll = this.executeDice(effect.dice);
          result = {
            ...result,
            roll: plunderRoll.roll,
            success: plunderRoll.result === 'success',
            message: plunderRoll.result === 'success'
              ? `${tag.name}成功！获得武器，伤害-10`
              : `${tag.name}失败`
          };
          break;

        case 'damage_bonus_dice':
          // 专注射击
          const focusRoll = this.executeDice(effect.dice);
          result = {
            ...result,
            roll: focusRoll.roll,
            damageBonus: focusRoll.damage_bonus,
            message: `专注射击：伤害+${focusRoll.damage_bonus}`
          };
          break;

        case 'luck_resolution':
          // 幸运
          const luckRoll = this.executeDice(effect.dice);
          result = {
            ...result,
            roll: luckRoll.roll,
            effects: luckRoll.effects,
            message: luckRoll.roll <= 2 ? '跳过本次攻击' :
                    luckRoll.roll <= 4 ? '正常攻击' : '额外移动+攻击'
          };
          break;

        case 'grant_extra_turn':
          // 再动
          result = {
            ...result,
            message: `${tag.name}触发！获得额外回合`,
            extraTurn: true
          };
          break;

        case 'assist_choice':
          // 援助：返回选项列表让玩家选择
          result = {
            ...result,
            choices: effect.choices,
            message: '选择援助方式'
          };
          break;

        case 'spawn_items':
          // 空投：生成物品
          const airdropRoll = this.executeDice(effect.dice);
          result = {
            ...result,
            roll: airdropRoll.roll,
            itemCount: airdropRoll.roll,
            itemTypes: effect.item_types,
            message: `空投：生成${airdropRoll.roll}个物品`
          };
          break;

        case 'block_movement':
          // 联防
          result = {
            ...result,
            message: `${tag.name}触发！移动被阻挡，需绕行`,
            blocked: true
          };
          break;

        case 'damage_reduction':
          // 抗性
          result = {
            ...result,
            reduction: effect.value,
            message: `${tag.name}：伤害-${effect.value}`
          };
          break;

        default:
          result.message = `未知效果类型: ${effect.type}`;
      }

      results.push(result);
    }

    return results;
  }

  /**
   * 处理词条触发
   * @param {string} phase - 触发阶段
   * @param {object} context - 上下文
   * @returns {array} 触发结果列表
   */
  processPhase(phase, context) {
    const tags = this.registry.getTagsForPhase(phase);
    const results = [];

    for (const tag of tags) {
      // 检查条件
      if (this.evaluateConditions(tag.conditions, context)) {
        // 执行效果
        const effects = this.executeEffects(tag, context);
        results.push({
          tagId: tag.id,
          tagName: tag.name,
          priority: tag.params.priority,
          effects
        });
      }
    }

    return results;
  }

  /**
   * 尝试触发特定词条
   * @param {string} tagId - 词条ID
   * @param {object} context - 上下文
   * @returns {object|null} 触发结果
   */
  tryTrigger(tagId, context) {
    const tag = this.registry.getById(tagId);
    if (!tag) return null;

    if (this.evaluateConditions(tag.conditions, context)) {
      return {
        tagId: tag.id,
        tagName: tag.name,
        effects: this.executeEffects(tag, context)
      };
    }

    return null;
  }
}

// 单例导出
module.exports = new TagProcessor();
```

## combatCore/tagRegistry.cjs

```js
/**
 * TagRegistry - 词条注册表
 * 管理所有词条定义，提供按阶段、优先级、效果类型查询
 */

const execute = require('./tags/execute.cjs');
const duel = require('./tags/duel.cjs');
const plunder = require('./tags/plunder.cjs');
const focusedShot = require('./tags/focused_shot.cjs');
const luck = require('./tags/luck.cjs');
const reattack = require('./tags/reattack.cjs');
const assist = require('./tags/assist.cjs');
const airdrop = require('./tags/airdrop.cjs');
const formationDefense = require('./tags/formation_defense.cjs');
const resistance = require('./tags/resistance.cjs');

class TagRegistry {
  constructor() {
    // 注册所有词条
    this.tags = {
      execute,
      duel,
      plunder,
      focused_shot: focusedShot,
      luck,
      reattack,
      assist,
      airdrop,
      formation_defense: formationDefense,
      resistance
    };

    // 按触发阶段索引
    this.byPhase = {
      round_start: ['airdrop'],
      turn_start: ['luck'],
      pre_attack: ['duel', 'focused_shot'],
      post_damage: ['execute', 'plunder'],
      on_kill: ['reattack'],
      on_ally_attacked: ['assist'],
      on_damage_taken: ['resistance'],
      on_airdrop_receive: ['luck'],
      movement_check: ['formation_defense']
    };

    // 按优先级排序
    this.byPriority = [
      { id: 'formation_defense', name: '联防', priority: 95 },
      { id: 'reattack', name: '再动', priority: 90 },
      { id: 'luck', name: '幸运', priority: 80 },
      { id: 'assist', name: '援助', priority: 70 },
      { id: 'execute', name: '斩杀', priority: 60 },
      { id: 'plunder', name: '抢夺', priority: 50 },
      { id: 'focused_shot', name: '专注射击', priority: 40 },
      { id: 'resistance', name: '抗性', priority: 30 },
      { id: 'duel', name: '决斗', priority: 10 },
      { id: 'airdrop', name: '空投', priority: 5 }
    ];

    // 按效果类型索引
    this.byEffect = {
      instant_kill: ['execute'],
      duel_resolution: ['duel'],
      plunder_attempt: ['plunder'],
      damage_bonus_dice: ['focused_shot'],
      luck_resolution: ['luck'],
      grant_extra_turn: ['reattack'],
      assist_choice: ['assist'],
      spawn_items: ['airdrop'],
      trigger_if_occupied: ['airdrop'],
      block_movement: ['formation_defense'],
      damage_reduction: ['resistance']
    };
  }

  /**
   * 获取所有词条
   */
  getAll() {
    return Object.values(this.tags);
  }

  /**
   * 根据ID获取词条
   */
  getById(id) {
    return this.tags[id];
  }

  /**
   * 获取指定阶段的词条ID列表
   */
  getTagsByPhase(phase) {
    return this.byPhase[phase] || [];
  }

  /**
   * 获取指定阶段的完整词条
   */
  getFullTagsByPhase(phase) {
    const tagIds = this.getTagsByPhase(phase);
    return tagIds.map(id => this.tags[id]).filter(Boolean);
  }

  /**
   * 按优先级获取词条（从高到低）
   */
  getTagsByPriority(phase = null) {
    if (phase) {
      const tagIds = this.getTagsByPhase(phase);
      return this.byPriority.filter(t => tagIds.includes(t.id));
    }
    return [...this.byPriority];
  }

  /**
   * 获取指定效果类型的词条
   */
  getTagsByEffect(effectType) {
    const tagIds = this.byEffect[effectType] || [];
    return tagIds.map(id => this.tags[id]).filter(Boolean);
  }

  /**
   * 获取词条列表（按优先级排序）
   */
  getTagsForPhase(phase) {
    const tagIds = this.getTagsByPhase(phase);
    return this.byPriority
      .filter(t => tagIds.includes(t.id))
      .map(t => this.tags[t.id])
      .filter(Boolean);
  }

  /**
   * 获取词条中文名称
   */
  getTagName(id) {
    const tag = this.tags[id];
    return tag ? tag.name : id;
  }

  /**
   * 获取词条信息摘要
   */
  getSummary() {
    return {
      total: Object.keys(this.tags).length,
      byPhase: Object.fromEntries(
        Object.entries(this.byPhase).map(([k, v]) => [k, v.length])
      ),
      tags: Object.entries(this.tags).map(([id, tag]) => ({
        id,
        name: tag.name,
        phase: tag.trigger.phase,
        priority: tag.params.priority
      }))
    };
  }
}

// 单例导出
module.exports = new TagRegistry();
```

## combatCore/tags/airdrop.cjs

```js
/**
 * 空投 (airdrop)
 * 触发阶段: round_start (轮次开始)
 * 优先级: 5
 * 效果: 第二轮开始时DM掷骰生成武器/防具
 */

module.exports = {
  id: 'airdrop',
  name: '空投',

  trigger: {
    phase: 'round_start',
    timing: 'turn_2_and_after',
    activation: 'dm_roll'
  },

  conditions: {
    required: [
      { check: 'current_round', value: 2, operator: '>=' }
    ]
  },

  effects: [
    {
      type: 'spawn_items',
      dice: {
        required: true,
        sides: 6,
        item_count: 'dice_result'
      },
      item_types: ['weapon', 'armor'],
      position: 'random'
    },
    {
      type: 'trigger_if_occupied',
      condition: 'target_position_has_unit',
      trigger: 'luck'
    }
  ],

  params: {
    priority: 5,
    optional: false,
    dm_controlled: true
  }
};
```

## combatCore/tags/assist.cjs

```js
/**
 * 援助 (assist)
 * 触发阶段: on_ally_attacked (友军被攻击时)
 * 优先级: 70
 * 效果: 友军被攻击时可选择帮助
 */

module.exports = {
  id: 'assist',
  name: '援助',

  trigger: {
    phase: 'on_ally_attacked',
    timing: 'during_attack'
  },

  conditions: {
    required: [
      { check: 'ally_in_line_of_sight', value: true },
      { check: 'ally_faction', ref: 'self_faction', operator: '==' },
      { check: 'ally_is_being_attacked', value: true }
    ]
  },

  effects: [{
    type: 'assist_choice',
    choices: [
      {
        id: 'move_intercept',
        cost: 'give_up_move_action',
        effects: [
          { type: 'teleport_to_position', position: 'between_attacker_and_ally' },
          { type: 'share_damage', value: 5 }
        ]
      },
      {
        id: 'counter_attack',
        cost: 'give_up_combat_action',
        effects: [
          { type: 'counter_damage', target: 'attacker', value: 5 }
        ]
      }
    ]
  }],

  params: {
    priority: 70,
    optional: true,
    timing_lock: 'next_turn'
  }
};
```

## combatCore/tags/duel.cjs

```js
/**
 * 决斗 (duel)
 * 触发阶段: pre_attack (攻击前)
 * 优先级: 10
 * 效果: 双方互相在射程内且HP都低于对方攻击值时，进入决斗模式
 */

module.exports = {
  id: 'duel',
  name: '决斗',

  trigger: {
    phase: 'pre_attack',
    timing: 'before_damage_calc'
  },

  conditions: {
    required: [
      { check: 'target_in_range', value: true, operator: '==' },
      { check: 'self_in_target_range', value: true, operator: '==' },
      { check: 'self_hp', ref: 'target_attack_max', operator: '<' },
      { check: 'target_hp', ref: 'self_attack_max', operator: '<' }
    ]
  },

  effects: [{
    type: 'duel_resolution',
    dice: {
      required: true,
      sides: 6,
      participants: ['attacker', 'defender'],
      outcomes: {
        'higher_wins': 'winner_continues_attack',
        'tie': 'both_dead'
      }
    }
  }],

  params: {
    priority: 10,
    optional: false,
    interrupt: true
  }
};
```

## combatCore/tags/execute.cjs

```js
/**
 * 斩杀 (execute)
 * 触发阶段: post_damage (伤害结算后)
 * 优先级: 60
 * 效果: 近战攻击后，若目标HP<5，掷骰≥目标血量则斩杀
 */

module.exports = {
  id: 'execute',
  name: '斩杀',

  trigger: {
    phase: 'post_damage',
    timing: 'after_melee'
  },

  conditions: {
    required: [
      { check: 'attack_type', value: 'melee', operator: '==' },
      { check: 'target_hp', value: 5, operator: '<' }
    ]
  },

  effects: [{
    type: 'instant_kill',
    dice: {
      required: true,
      sides: 6,
      condition: '>= target_hp',
      outcomes: {
        success: 'target_dead',
        fail: 'continue'
      }
    }
  }],

  params: {
    priority: 60,
    optional: false,
    consumable: false,
    interrupt: false
  }
};
```

## combatCore/tags/focused_shot.cjs

```js
/**
 * 专注射击 (focused_shot)
 * 触发阶段: pre_attack (攻击前)
 * 优先级: 40
 * 效果: 远程攻击时放弃移动，掷骰获得伤害加成
 */

module.exports = {
  id: 'focused_shot',
  name: '专注射击',

  trigger: {
    phase: 'pre_attack',
    timing: 'before_damage_calc'
  },

  conditions: {
    required: [
      { check: 'attack_type', value: 'ranged', operator: '==' },
      { check: 'move_action_used', value: false, operator: '==' }
    ],
    action_cost: {
      give_up: 'move_action',
      remaining: false
    }
  },

  effects: [{
    type: 'damage_bonus_dice',
    dice: {
      required: true,
      sides: 6,
      choices: [
        { range: [1, 4], damage_bonus: 3 },
        { range: [5, 6], damage_bonus: 5 }
      ]
    }
  }],

  params: {
    priority: 40,
    optional: true,
    setup_phase: 'turn_start'
  }
};
```

## combatCore/tags/formation_defense.cjs

```js
/**
 * 联防 (formation_defense)
 * 触发阶段: movement_check (移动判定时)
 * 优先级: 95
 * 效果: 3个同阵营单位横向排列阻挡敌方穿越
 */

module.exports = {
  id: 'formation_defense',
  name: '联防',

  trigger: {
    phase: 'movement_check',
    timing: 'before_move_resolved'
  },

  conditions: {
    required: [
      { check: 'moving_unit_faction', ref: 'defending_units_faction', operator: '!=' },
      { check: 'blocking_units_count', value: 3, operator: '>=' },
      { check: 'blocking_units_aligned', value: 'horizontal', operator: '==' }
    ],
    formation: {
      type: 'line',
      orientation: 'horizontal',
      min_units: 3,
      spacing: 'adjacent'
    }
  },

  effects: [{
    type: 'block_movement',
    blocked: {
      directions: 'straight_line_through',
      exceptions: null
    },
    resolution: 'must_route_around'
  }],

  params: {
    priority: 95,
    optional: false,
    passive: true
  }
};
```

## combatCore/tags/luck.cjs

```js
/**
 * 幸运 (luck)
 * 触发阶段: turn_start / on_airdrop_receive
 * 优先级: 80
 * 效果: 回合开始或获得空投时掷骰获得额外行动
 */

module.exports = {
  id: 'luck',
  name: '幸运',

  trigger: {
    phase: 'turn_start',
    timing: 'immediate',
    sources: ['turn_start', 'airdrop_receive']
  },

  conditions: {
    required: []
  },

  effects: [{
    type: 'luck_resolution',
    dice: {
      required: true,
      sides: 6,
      choices: [
        { range: [1, 2], effects: [{ type: 'skip_attack' }] },
        { range: [3, 4], effects: [{ type: 'normal_attack' }] },
        { range: [5, 6], effects: [{ type: 'extra_move' }, { type: 'extra_attack' }] }
      ]
    }
  }],

  params: {
    priority: 80,
    optional: false,
    consumable: true,
    duration: 1
  }
};
```

## combatCore/tags/plunder.cjs

```js
/**
 * 抢夺 (plunder)
 * 触发阶段: post_damage (伤害结算后)
 * 优先级: 50
 * 效果: 伤害值>目标武器攻击值时，可选择抢夺目标武器
 */

module.exports = {
  id: 'plunder',
  name: '抢夺',

  trigger: {
    phase: 'post_damage',
    timing: 'after_damage_resolved'
  },

  conditions: {
    required: [
      { check: 'damage_dealt', ref: 'target_weapon_attack', operator: '>' },
      { check: 'target_has_weapon', value: true, operator: '==' }
    ]
  },

  effects: [{
    type: 'plunder_attempt',
    dice: {
      required: true,
      sides: 6,
      choices: [
        { range: [1, 3], result: 'fail', effect: null },
        { range: [4, 6], result: 'success', effect: { damage_modifier: -10, loot_weapon: true } }
      ]
    }
  }],

  params: {
    priority: 50,
    optional: true,
    choices: ['attempt', 'skip']
  }
};
```

## combatCore/tags/reattack.cjs

```js
/**
 * 再动 (reattack)
 * 触发阶段: on_kill (击杀时)
 * 优先级: 90
 * 效果: 击杀敌方单位后获得额外回合
 */

module.exports = {
  id: 'reattack',
  name: '再动',

  trigger: {
    phase: 'on_kill',
    timing: 'immediate_after'
  },

  conditions: {
    required: [
      { check: 'target_faction', ref: 'enemy', operator: '==' },
      { check: 'extra_turn_used_this_round', value: false, operator: '==' }
    ]
  },

  effects: [{
    type: 'grant_extra_turn',
    scope: 'full_turn'
  }],

  params: {
    priority: 90,
    optional: false,
    trigger_limit: {
      type: 'per_round',
      max: 1
    },
    cooldown: {
      self_trigger: false
    }
  }
};
```

## combatCore/tags/resistance.cjs

```js
/**
 * 抗性 (resistance)
 * 触发阶段: on_damage_taken (受到伤害时)
 * 优先级: 30
 * 效果: 有匹配抗性的防具时伤害-2
 */

module.exports = {
  id: 'resistance',
  name: '抗性',

  trigger: {
    phase: 'on_damage_taken',
    timing: 'damage_calculation'
  },

  conditions: {
    required: [
      { check: 'has_armor', value: true },
      { check: 'armor_resistance_type', ref: 'attack_damage_type', operator: '==' }
    ],
    armor_declaration: {
      types: ['kinetic', 'energy'],
      value: 2
    }
  },

  effects: [{
    type: 'damage_reduction',
    value: 2,
    calculation: 'subtract_before_armor'
  }],

  params: {
    priority: 30,
    optional: false,
    stacking: false,
    armor_linked: true
  }
};
```

## combatCore/tags/stealth-tags.cjs

```js
/**
 * 奇袭系统词条 - 马克西翁阵营核心
 * 
 * 包含词条:
 * 1. stealth_initiate - 战术隐蔽（回合开始进入隐身）
 * 2. stealth_ambush - 奇袭（隐身攻击额外伤害）
 * 3. stealth_camouflage - 伪装（隐身闪避判定）
 * 4. stealth_break - 暴露（隐身结束后）
 */

module.exports = [
  // ============================================================
  // 词条1: 战术隐蔽 (stealth_initiate)
  // 触发阶段: turn_start
  // 优先级: 70
  // 效果: 单位进入隐身状态，直到攻击或移动
  // ============================================================
  {
    id: 'stealth_initiate',
    name: '战术隐蔽',
    faction: 'maxion', // 马克西翁专属
    description: '回合开始时进入隐身状态，攻击或移动后暴露',

    trigger: {
      phase: 'turn_start',
      timing: 'turn_begins_before_actions'
    },

    conditions: {
      required: [
        { check: 'unit_faction', value: 'maxion', operator: '==' }
      ]
    },

    effects: [{
      type: 'enter_stealth',
      stealthDuration: 'until_action',
      revealTriggers: ['attack', 'move', 'skill']
    }],

    params: {
      priority: 70,
      optional: false,
      passive: true,
      faction_lock: 'maxion'
    }
  },

  // ============================================================
  // 词条2: 奇袭 (stealth_ambush)
  // 触发阶段: pre_attack
  // 优先级: 80
  // 效果: 隐身攻击造成额外伤害
  // ============================================================
  {
    id: 'stealth_ambush',
    name: '奇袭',
    faction: 'maxion',
    description: '隐身状态下攻击造成额外50%伤害',

    trigger: {
      phase: 'pre_attack',
      timing: 'before_attack_resolved'
    },

    conditions: {
      required: [
        { check: 'attacker_is_stealth', value: true, operator: '==' }
      ]
    },

    effects: [{
      type: 'stealth_attack_bonus',
      multiplier: 1.5,
      bonusDice: { required: true, sides: 6, threshold: 5 }
    }],

    params: {
      priority: 80,
      optional: false,
      passive: false,
      interrupt: false,
      faction_lock: 'maxion'
    }
  },

  // ============================================================
  // 词条3: 伪装 (stealth_camouflage)
  // 触发阶段: on_defended (被攻击时)
  // 优先级: 60
  // 效果: 隐身状态下有概率闪避攻击
  // ============================================================
  {
    id: 'stealth_camouflage',
    name: '伪装',
    faction: 'maxion',
    description: '隐身状态下被攻击时有50%概率闪避',

    trigger: {
      phase: 'on_defended',
      timing: 'before_damage_taken'
    },

    conditions: {
      required: [
        { check: 'defender_is_stealth', value: true, operator: '==' }
      ]
    },

    effects: [{
      type: 'stealth_evasion',
      evasionChance: 0.5,
      dice: { required: true, sides: 6, threshold: 3 }
    }],

    params: {
      priority: 60,
      optional: false,
      passive: false,
      faction_lock: 'maxion'
    }
  },

  // ============================================================
  // 词条4: 暴露 (stealth_break)
  // 触发阶段: post_attack / movement_end
  // 优先级: 50
  // 效果: 攻击或移动后退出隐身状态
  // ============================================================
  {
    id: 'stealth_break',
    name: '暴露',
    faction: 'maxion',
    description: '攻击或移动后退出隐身状态',

    trigger: {
      phase: 'post_attack',
      timing: 'after_attack_resolved'
    },

    conditions: {
      required: [
        { check: 'attacker_is_stealth', value: true, operator: '==' }
      ]
    },

    effects: [{
      type: 'exit_stealth',
      reason: 'attack'
    }],

    params: {
      priority: 50,
      optional: false,
      passive: true,
      faction_lock: 'maxion'
    }
  },

  // ============================================================
  // 词条4b: 暴露 (移动后)
  // 触发阶段: movement_end
  // 优先级: 50
  // ============================================================
  {
    id: 'stealth_break_move',
    name: '暴露-移动',
    faction: 'maxion',
    description: '移动后退出隐身状态',

    trigger: {
      phase: 'movement_end',
      timing: 'after_move_resolved'
    },

    conditions: {
      required: [
        { check: 'moving_unit_is_stealth', value: true, operator: '==' }
      ]
    },

    effects: [{
      type: 'exit_stealth',
      reason: 'movement'
    }],

    params: {
      priority: 50,
      optional: false,
      passive: true,
      faction_lock: 'maxion'
    }
  }
];
```

## combatCore/terrainMovement.cjs

```js
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
  // Phase9.5: 回退地形表 — 新增 is_destructible / max_hp / destroyed_transform_to 字段
  static FALLBACK_TERRAINS = {
    empty:     { name: '空地',     cost: 1,  defense: 0,  can_spawn: true,  color: '#88CC88', is_destructible: false, max_hp: 0, destroyed_transform_to: 'empty' },
    plain:     { name: '平原',     cost: 1,  defense: 0,  can_spawn: true,  color: '#AAFFAA', is_destructible: false, max_hp: 0, destroyed_transform_to: 'plain' },
    forest:    { name: '森林',     cost: 2,  defense: 10, can_spawn: true,  color: '#228822', is_destructible: true,  max_hp: 3, destroyed_transform_to: 'plain' },
    mountain:  { name: '山地',     cost: 3,  defense: 20, can_spawn: false, color: '#886644', is_destructible: false, max_hp: 0, destroyed_transform_to: 'mountain' },
    water:     { name: '水域',     cost: 99, defense: 0,  can_spawn: false, color: '#4488FF', is_destructible: false, max_hp: 0, destroyed_transform_to: 'water' },
    base:      { name: '基地',     cost: 1,  defense: 0,  can_spawn: true,  color: '#FF4444', is_destructible: true,  max_hp: 5, destroyed_transform_to: 'ruin' },
    mothership:{ name: '母舰',     cost: 1,  defense: 0,  can_spawn: true,  color: '#FFD700', is_destructible: true,  max_hp: 8, destroyed_transform_to: 'ruin' },
    ruin:      { name: '废墟',     cost: 2,  defense: 15, can_spawn: true,  color: '#998866', is_destructible: false, max_hp: 0, destroyed_transform_to: 'ruin' },
    lava:      { name: '岩浆',     cost: 3,  defense: 0,  can_spawn: false, color: '#FF6600', is_destructible: false, max_hp: 0, destroyed_transform_to: 'lava' },
    lunar:     { name: '月面',     cost: 1,  defense: 0,  can_spawn: true,  color: '#CCCCCC', is_destructible: false, max_hp: 0, destroyed_transform_to: 'lunar' },
    crater:    { name: '陨石坑',   cost: 2,  defense: 5,  can_spawn: true,  color: '#777766', is_destructible: false, max_hp: 0, destroyed_transform_to: 'crater' },
    city_building: { name: '城市建筑', cost: 1, defense: 25, can_spawn: false, color: '#b8860b', is_destructible: true,  max_hp: 4, destroyed_transform_to: 'ruin' },
    rubble:    { name: '残骸',     cost: 2,  defense: 10, can_spawn: true,  color: '#8b7d6b', is_destructible: false, max_hp: 0, destroyed_transform_to: 'rubble' },
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
```

## combatCore/unitTypeManager.cjs

```js
/**
 * UnitTypeManager - 单位类型管理器
 * 处理陆地/空中/海上单位的移动和克制关系
 * 
 * 单位类型:
 * - land (陆地): 只能在平原、山地、森林、基地、废墟移动
 * - air (空中): 可以在所有地形移动，无视地形障碍
 * - sea (海上): 只能在水域移动
 * 
 * 克制关系:
 * - 地对空：远程射击 -1 (难以命中空中目标)
 * - 空对地：远程射击 +1 (俯冲攻击优势)
 * - 地对海：远程射击 +1 (固定靶优势)
 * - 海对陆：无法攻击陆地单位
 * - 空对海：远程射击 +2 (完全制空权)
 */

class UnitTypeManager {
  
  /**
   * 单位移动类型
   */
  static MOVE_TYPES = {
    LAND: 'land',
    AIR: 'air',
    SEA: 'sea'
  };
  
  /**
   * 地形可通行性
   */
  static TERRAIN_PASSABLE = {
    land: ['plain', 'mountain', 'forest', 'base', 'ruin', 'lunar', 'crater'],
    air: ['plain', 'mountain', 'forest', 'base', 'ruin', 'lunar', 'crater', 'water', 'lava'],
    sea: ['water']
  };
  
  /**
   * 地形移动消耗修正
   */
  static TERRAIN_MOVE_COST = {
    land: {
      plain: 1,
      mountain: 2,
      forest: 1,
      base: 1,
      ruin: 2,
      lunar: 1,
      crater: 2,
      water: 999, // 不可通行
      lava: 999  // 不可通行
    },
    air: {
      plain: 1,
      mountain: 1,
      forest: 1,
      base: 1,
      ruin: 1,
      lunar: 1,
      crater: 1,
      water: 1,
      lava: 2 // 高温影响
    },
    sea: {
      plain: 999,
      mountain: 999,
      forest: 999,
      base: 999,
      ruin: 999,
      lunar: 999,
      crater: 999,
      water: 1,
      lava: 999 // 无法在岩浆移动
    }
  };
  
  /**
   * 攻击克制修正
   */
  static ATTACK_MODIFIERS = {
    // 攻击方类型 -> 防御方类型 -> 修正值
    land: {
      land: 0,
      air: -1,   // 地对空：难以命中
      sea: +1    // 地对海：固定靶优势
    },
    air: {
      land: 0,
      air: 0,
      sea: +2    // 空对海：完全制空权
    },
    sea: {
      land: -999, // 海对陆：无法攻击
      air: -2,    // 海对空：极度劣势
      sea: 0
    }
  };
  
  /**
   * 防御克制修正
   */
  static DEFENSE_MODIFIERS = {
    // 防御方类型 -> 攻击方类型 -> 闪避修正
    land: {
      land: 0,
      air: +1,   // 地对空：容易闪避 (空中攻击轨迹明显)
      sea: 0
    },
    air: {
      land: -1,  // 空对地：难以闪避 (俯冲攻击突然)
      air: 0,
      sea: -1    // 空对海：难以闪避
    },
    sea: {
      land: 0,
      air: +2,   // 海对空：容易闪避 (空中目标明显)
      sea: 0
    }
  };
  
  /**
   * 检查单位是否可以进入某地形
   * @param {string} moveType - 单位移动类型：'land' | 'air' | 'sea'
   * @param {string} terrain - 地形类型
   * @returns {boolean}
   */
  static canMoveTo(moveType, terrain) {
    const passable = this.TERRAIN_PASSABLE[moveType];
    if (!passable) return false;
    return passable.includes(terrain);
  }
  
  /**
   * 获取地形移动消耗
   * @param {string} moveType - 单位移动类型
   * @param {string} terrain - 地形类型
   * @returns {number} 移动消耗 (999 表示不可通行)
   */
  static getMoveCost(moveType, terrain) {
    const costs = this.TERRAIN_MOVE_COST[moveType];
    if (!costs) return 999;
    return costs[terrain] || 999;
  }
  
  /**
   * 获取攻击克制修正
   * @param {string} attackerType - 攻击方类型
   * @param {string} defenderType - 防御方类型
   * @returns {number} 攻击修正值
   */
  static getAttackModifier(attackerType, defenderType) {
    const modifiers = this.ATTACK_MODIFIERS[attackerType];
    if (!modifiers) return 0;
    return modifiers[defenderType] || 0;
  }
  
  /**
   * 获取防御闪避修正
   * @param {string} defenderType - 防御方类型
   * @param {string} attackerType - 攻击方类型
   * @returns {number} 闪避修正值
   */
  static getDefenseModifier(defenderType, attackerType) {
    const modifiers = this.DEFENSE_MODIFIERS[defenderType];
    if (!modifiers) return 0;
    return modifiers[attackerType] || 0;
  }
  
  /**
   * 检查攻击是否有效
   * @param {string} attackerType - 攻击方类型
   * @param {string} defenderType - 防御方类型
   * @returns {Object} { valid: boolean, reason: string }
   */
  static canAttack(attackerType, defenderType) {
    const modifier = this.getAttackModifier(attackerType, defenderType);
    
    if (modifier <= -999) {
      return {
        valid: false,
        reason: '无法攻击该类型单位'
      };
    }
    
    return {
      valid: true,
      reason: '可以攻击'
    };
  }
  
  /**
   * 计算完整的类型克制效果
   * @param {Object} attacker - 攻击方单位 (包含 move_type)
   * @param {Object} defender - 防御方单位 (包含 move_type)
   * @returns {Object} 完整的克制效果
   */
  static calculateTypeEffectiveness(attacker, defender) {
    const attackerType = attacker.move_type || 'land';
    const defenderType = defender.move_type || 'land';
    
    const attackMod = this.getAttackModifier(attackerType, defenderType);
    const defenseMod = this.getDefenseModifier(defenderType, attackerType);
    const canAttackResult = this.canAttack(attackerType, defenderType);
    
    return {
      attacker_type: attackerType,
      defender_type: defenderType,
      attack_modifier: attackMod,
      defense_modifier: defenseMod,
      can_attack: canAttackResult.valid,
      reason: canAttackResult.reason,
      advantage: attackMod > 0 ? 'advantage' : attackMod < 0 ? 'disadvantage' : 'neutral',
      description: this.getTypeDescription(attackerType, defenderType)
    };
  }
  
  /**
   * 获取克制关系描述
   * @param {string} attackerType
   * @param {string} defenderType
   * @returns {string}
   */
  static getTypeDescription(attackerType, defenderType) {
    const descriptions = {
      'land_land': '同类型单位，无克制',
      'land_air': '地对空：空中目标难以命中，攻击 -1',
      'land_sea': '地对海：海面固定靶，攻击 +1',
      'air_land': '空对地：俯冲攻击，无修正',
      'air_air': '空中缠斗，无克制',
      'air_sea': '空对海：完全制空权，攻击 +2',
      'sea_land': '海对陆：无法攻击陆地目标',
      'sea_air': '海对空：极度劣势，攻击 -2',
      'sea_sea': '海战，无克制'
    };
    
    const key = `${attackerType}_${defenderType}`;
    return descriptions[key] || '未知克制关系';
  }
  
  /**
   * 验证单位移动路径是否合法
   * @param {string} moveType - 单位移动类型
   * @param {Array} path - 路径数组 [{q, r, terrain}, ...]
   * @param {number} maxMovement - 最大移动力
   * @returns {Object} { valid: boolean, totalCost: number, blockedAt: number|null }
   */
  static validateMovement(moveType, path, maxMovement) {
    let totalCost = 0;
    
    for (let i = 0; i < path.length; i++) {
      const cell = path[i];
      const cost = this.getMoveCost(moveType, cell.terrain);
      totalCost += cost;
      
      if (cost >= 999) {
        return {
          valid: false,
          totalCost: totalCost,
          blockedAt: i,
          reason: `无法通过 ${cell.terrain} 地形`
        };
      }
      
      if (totalCost > maxMovement) {
        return {
          valid: false,
          totalCost: totalCost,
          blockedAt: i,
          reason: '移动力不足'
        };
      }
    }
    
    return {
      valid: true,
      totalCost: totalCost,
      blockedAt: null,
      reason: '路径合法'
    };
  }
}

module.exports = UnitTypeManager;
```

## combatCore/unitTypeModel.cjs

```js
/**
 * UnitTypeModel - 单位类型模型 (基于现有数据库)
 * 
 * 不修改数据库结构，通过现有字段映射移动类型
 * 
 * 映射规则:
 * - main_type (现有字段) → move_type (陆地/空中/海上)
 * - faction (现有字段) → 默认移动类型
 * - codename (现有字段) → 特殊单位判断
 */

class UnitTypeModel {
  
  /**
   * 单位移动类型
   */
  static MOVE_TYPES = {
    LAND: 'land',
    AIR: 'air',
    SEA: 'sea'
  };
  
  /**
   * 从现有 main_type 映射到移动类型
   * 
   * 现有 main_type 值:
   * - 机体 (Mecha) - 主力单位
   * - Royroy (跟随) - 伴随单位
   * - 武器 (Weapon) - 装备
   * - 防具 (Armor) - 装备
   * - 载具 (Vehicle) - 交通工具
   * - 背包 (Backpack) - 支援装备
   */
  static mapMainTypeToMoveType(mainType, faction = 'earth', codename = '') {
    // 特殊单位通过 codename 判断
    const codenameLower = (codename || '').toLowerCase();
    
    // 检查是否包含空中和海上关键词
    const airKeywords = ['飞', '翼', '空', '风', 'bird', 'fly', 'air', 'wing', 'falcon', 'eagle'];
    const seaKeywords = ['海', '船', '舰', '艇', '潜', 'water', 'sea', 'ship', 'boat', 'marine', 'vessel'];
    
    const hasAir = airKeywords.some(kw => codenameLower.includes(kw));
    const hasSea = seaKeywords.some(kw => codenameLower.includes(kw));
    
    // 如果同时包含空中和海上关键词，优先级：海 > 空
    // 例如："飞船" 应该是海上单位 (船是主体，飞是修饰)
    if (hasSea) return this.MOVE_TYPES.SEA;
    if (hasAir) return this.MOVE_TYPES.AIR;
    
    // 默认映射 (基于 main_type)
    const typeMapping = {
      // 陆地单位 (默认)
      '机体': this.MOVE_TYPES.LAND,
      'Royroy': this.MOVE_TYPES.LAND,
      '防具': this.MOVE_TYPES.LAND,
      '背包': this.MOVE_TYPES.LAND,
      
      // 载具根据阵营判断
      '载具': faction === 'maxion' ? this.MOVE_TYPES.SEA : this.MOVE_TYPES.LAND,
      
      // 武器不是独立单位，不分配移动类型
      '武器': this.MOVE_TYPES.LAND  // 默认陆地 (作为附件)
    };
    
    return typeMapping[mainType] || this.MOVE_TYPES.LAND;
  }
  
  /**
   * 从现有单位对象提取移动类型
   * @param {Object} unit - 单位对象 (包含 main_type, faction, codename)
   * @returns {string} 移动类型：'land' | 'air' | 'sea'
   */
  static getUnitMoveType(unit) {
    return this.mapMainTypeToMoveType(
      unit.main_type || '机体',
      unit.faction || 'earth',
      unit.codename || ''
    );
  }
  
  /**
   * 地形 ID 映射 (适配现有 Map Service 地形)
   * 
   * Map Service 现有地形:
   * - empty (空地)
   * - mountain (山地)
   * - forest (森林)
   * - water (水域)
   * - mothership (母舰 - 出生点)
   * - base (基地 - 出生点)
   * 
   * UnitTypeManager 地形:
   * - plain, mountain, forest, water, base, ruin, lunar, crater, lava
   */
  static mapTerrainId(terrainId) {
    const mapping = {
      'empty': 'plain',        // 空地 → 平原
      'mountain': 'mountain',  // 保持一致
      'forest': 'forest',      // 保持一致
      'water': 'water',        // 保持一致
      'mothership': 'base',    // 母舰 → 基地 (出生点)
      'base': 'base'           // 保持一致
    };
    
    return mapping[terrainId] || 'plain';
  }
  
  /**
   * 反向映射：UnitTypeManager 地形 → Map Service 地形
   */
  static reverseMapTerrainId(terrainId) {
    const mapping = {
      'plain': 'empty',
      'mountain': 'mountain',
      'forest': 'forest',
      'water': 'water',
      'base': 'base',
      'ruin': 'empty',       // 废墟 → 空地
      'lunar': 'empty',      // 月面 → 空地
      'crater': 'empty',     // 陨石坑 → 空地
      'lava': 'water'        // 岩浆 → 水域 (障碍)
    };
    
    return mapping[terrainId] || 'empty';
  }
  
  /**
   * 获取单位的完整类型信息
   * @param {Object} unit - 单位对象
   * @returns {Object} 完整类型信息
   */
  static getUnitTypeInfo(unit) {
    const moveType = this.getUnitMoveType(unit);
    
    return {
      unit_id: unit.id,
      name: unit.name,
      codename: unit.codename,
      faction: unit.faction,
      main_type: unit.main_type,
      move_type: moveType,
      description: this.getMoveTypeDescription(moveType),
      keywords: this.detectKeywords(unit.codename || '')
    };
  }
  
  /**
   * 检测 codename 中的关键词
   */
  static detectKeywords(codename) {
    const keywords = {
      air: [],
      sea: []
    };
    
    const codenameLower = codename.toLowerCase();
    
    const airKeywords = ['飞', '翼', '航', '空', '风', 'bird', 'fly', 'air', 'wing', 'falcon', 'eagle'];
    const seaKeywords = ['海', '船', '舰', '艇', '潜', '航', 'water', 'sea', 'ship', 'boat', 'marine'];
    
    for (const kw of airKeywords) {
      if (codenameLower.includes(kw)) keywords.air.push(kw);
    }
    
    for (const kw of seaKeywords) {
      if (codenameLower.includes(kw)) keywords.sea.push(kw);
    }
    
    return keywords;
  }
  
  /**
   * 获取移动类型描述
   */
  static getMoveTypeDescription(moveType) {
    const descriptions = {
      land: {
        cn: '陆地单位',
        en: 'Land Unit',
        terrain: '只能在陆地地形移动',
        advantage: '地对海 +1 攻击',
        disadvantage: '地对空 -1 攻击'
      },
      air: {
        cn: '空中单位',
        en: 'Air Unit',
        terrain: '可以在所有地形移动',
        advantage: '空对海 +2 攻击',
        disadvantage: '无明显劣势'
      },
      sea: {
        cn: '海上单位',
        en: 'Sea Unit',
        terrain: '只能在水域移动',
        advantage: '高防御/高火力',
        disadvantage: '无法攻击陆地，对空 -2'
      }
    };
    
    return descriptions[moveType] || descriptions.land;
  }
  
  /**
   * 检查单位是否可以进入某地形 (使用 Map Service 地形 ID)
   * @param {Object} unit - 单位对象
   * @param {string} terrainId - Map Service 地形 ID
   * @returns {boolean}
   */
  static canUnitMoveToTerrain(unit, terrainId) {
    const moveType = this.getUnitMoveType(unit);
    const mappedTerrain = this.mapTerrainId(terrainId);
    
    // 导入 UnitTypeManager
    const UnitTypeManager = require('./unitTypeManager.cjs');
    return UnitTypeManager.canMoveTo(moveType, mappedTerrain);
  }
  
  /**
   * 获取单位在地形上的移动消耗 (使用 Map Service 地形 ID)
   * @param {Object} unit - 单位对象
   * @param {string} terrainId - Map Service 地形 ID
   * @returns {number} 移动消耗
   */
  static getUnitTerrainMoveCost(unit, terrainId) {
    const moveType = this.getUnitMoveType(unit);
    const mappedTerrain = this.mapTerrainId(terrainId);
    
    const UnitTypeManager = require('./unitTypeManager.cjs');
    return UnitTypeManager.getMoveCost(moveType, mappedTerrain);
  }
}

module.exports = UnitTypeModel;
```

## combatResolver.js

```js
/**
 * combatResolver.js v3.0 — 机甲战棋战斗解析器 (Phase 10 万能语法中枢)
 *
 * 处理战斗系统：奇袭、火力覆盖、迷雾系统、主攻击、耐久度结算。
 * Phase 10: 移除硬编码技能数组，改为万能语法字段驱动。
 */

import DamagePipe from './combatCore/damagePipe.cjs';
import EquipmentDurability from './combatCore/equipmentDurability.cjs';
import SkillExecutor from './combatCore/skillExecutor.cjs';
import SkillRegistry from './combatCore/skillRegistry.cjs';
import { getGlossaryConfig } from './combatCore/configLoader.cjs';
import { getDamageType } from './combatCore/skillContract.cjs';


class CombatResolver {
    constructor() {
        this.battlefield = null;
        this.fogActive = false;
        this.fireCoverageUsed = false;
        this.durability = new EquipmentDurability();
        this.skillExecutor = new SkillExecutor();
    }

    init(battlefield, allUnits) {
        this.battlefield = battlefield;
        this.fogActive = battlefield.fogOfWar || false;
        this.fireCoverageUsed = false;
        this.durability.reset();
        this.skillExecutor.resetStableForBattle();
        if (allUnits && allUnits.length > 0) {
            this.initSkillCounters(allUnits);
        }
    }

    // ============================================================
    // 火力覆盖系统
    // ============================================================

    resolveFireCoverage(centerCell, allUnits) {
        if (this.fireCoverageUsed) {
            return { type: 'fire_coverage', used: false, message: '火力覆盖已在本场战斗中用过' };
        }

        const affectedUnits = [];
        let totalDamage = 0;

        for (const unit of allUnits) {
            if (!unit || unit.hp <= 0) continue;

            const dq = Math.abs((unit.q || 0) - (centerCell.q || 0));
            const dr = Math.abs((unit.r || 0) - (centerCell.r || 0));
            const ds = Math.abs(dq + dr);
            const dist = Math.max(dq, dr, ds);

            if (dist <= 2) {
                const blocked = this._checkFireCoverageBlock(unit);
                let actualDamage = 5;

                if (blocked) {
                    actualDamage = 0;
                    affectedUnits.push({
                        unit_id: unit.id,
                        original_damage: 5,
                        actual_damage: 0,
                        blocked: true,
                        message: `${unit.name || '?'} 抵挡了火力覆盖`
                    });
                } else {
                    unit.hp = Math.max(0, unit.hp - 5);
                    totalDamage += actualDamage;
                    affectedUnits.push({
                        unit_id: unit.id,
                        original_damage: 5,
                        actual_damage: 5,
                        blocked: false,
                        hp_after: unit.hp
                    });
                }
            }
        }

        this.fireCoverageUsed = true;
        return {
            type: 'fire_coverage',
            used: true,
            center: centerCell,
            affected_units: affectedUnits,
            total_damage: totalDamage,
            message: `火力覆盖！对(${centerCell.q},${centerCell.r})周围2格造成${totalDamage}点总伤害`
        };
    }

    _checkFireCoverageBlock(unit) {
        if (!unit || !unit.skills) return false;
        for (const skill of unit.skills) {
            if (!skill || !skill.active) continue;
            if (skill.type === 'guard' && (unit.guard_counter || 0) > 0) {
                unit.guard_counter = (unit.guard_counter || 0) - 1;
                return true;
            }
        }
        // Phase 10: 泛化装备检查
        if (unit.equipment) {
            const eq = unit.equipment;
            // 检查所有装备槽位的 damage_kind_modifiers
            for (const slot of ['full_armor', 'coating', 'shield_gen', 'reactive_armor']) {
                if (eq[slot]) {
                    this.durability.consumeDurability(unit, 'special_' + slot, 999);
                    return true;
                }
            }
        }
        return false;
    }

    _disableBlockingAbility(unit) {
        const eq = unit.equipment || {};
        for (const slot of ['full_armor', 'coating', 'shield_gen', 'reactive_armor']) {
            if (eq[slot]) {
                this.durability.consumeDurability(unit, 'special_' + slot, 999);
            }
        }
    }

    initSkillCounters(allUnits) {
        for (const unit of allUnits) {
            if (!unit || !unit.skills) continue;
            for (const skill of unit.skills) {
                if (!skill || !skill.active) continue;
                // Phase 10: 使用万能字段判断
                const uf = this.skillExecutor._getUniversalFields(skill.type);
                switch (skill.type) {
                    case 'assist':
                        this.skillExecutor.initAssistCounter(unit);
                        break;
                    case 'guard':
                        this.skillExecutor.initGuardCounter(unit);
                        break;
                    case 'blockade':
                        this.skillExecutor.initBlockadeCounter(unit);
                        break;
                }
            }
        }
    }

    // ============================================================
    // 奇袭系统 — 去骰化：始终触发，70% 攻击力
    // ============================================================

    resolveAmbush(attacker, defender) {
        const cfg = getSystemConfig('ambush');
        const damagePercent = cfg?.damage_percent ?? 0.7;
        const ambushDamage = Math.floor((attacker.attack || 10) * damagePercent);
        const terrainDefs = getGlossaryConfig()?.terrains || {};
        const defenseReduction = DamagePipe._calcDefense(defender, attacker, terrainDefs);

        return {
            type: 'ambush',
            damage: Math.max(1, ambushDamage - defenseReduction.total),
            message: `奇袭成功！造成 ${Math.max(1, ambushDamage - defenseReduction.total)} 点伤害`
        };
    }

    // ============================================================
    // 迷雾系统 — 去骰化：正常可见，无随机修正
    // ============================================================

    resolveFogEffect() {
        if (!this.fogActive) {
            return { active: false, visibility: 'normal' };
        }

        const cfg = getSystemConfig('fog_of_war');
        const visibility = cfg?.visibility ?? 'normal';
        const accuracyMod = cfg?.accuracy_modifier ?? 0;

        return {
            active: true,
            visibility,
            accuracyModifier: accuracyMod,
            message: `迷雾系统：${visibility === 'normal' ? '正常可见' : visibility === 'partial' ? '部分可见' : '完全不可见'}`
        };
    }

    // ============================================================
    // 战斗主循环 (Phase 10: 万能语法驱动)
    // ============================================================

    executeTurn(attacker, defender, options = {}) {
        const result = {
            turn: options.turn || 1,
            actions: [],
            totalDamage: 0,
            fogEffect: null,
            durabilityChanges: []
        };

        // 1. 迷雾判定
        if (this.fogActive) {
            result.fogEffect = this.resolveFogEffect();
        }

        // 2. 奇袭判定
        if (options.enableAmbush !== false) {
            const ambush = this.resolveAmbush(attacker, defender);
            if (ambush) {
                result.actions.push(ambush);
                result.totalDamage += ambush.damage;
            }
        }

        // 3. 主攻击
        let attackType = options.attack_type || 'melee';
        let attMelee = attacker.melee || attacker.attack || 10;
        let attRanged = attacker.ranged || attacker.attack || 10;

        // Phase 10: 万能语法技能路由 (移除硬编码 MELEE_SKILLS/RANGED_SKILLS)
        const resolvedSkill = this._resolveSkill(attacker, options.skill_id);

        if (resolvedSkill) {
            const uf = this.skillExecutor._getUniversalFields(resolvedSkill.type);
            // 根据 attack_stat 或 action_type 判定攻击类型
            if (uf.attack_stat === 'ranged') {
                attackType = 'ranged';
            } else if (uf.attack_stat === 'melee') {
                attackType = 'melee';
            } else if (uf.action_type === 'attack') {
                attackType = uf.attack_stat || 'melee';
            }
        }

        // 狙击技能
        let sniperMobilityReduction = 0;
        if ((attackType === 'ranged' || attackType === 'skill') && !attacker.has_moved) {
            const hasSniper = (resolvedSkill && resolvedSkill.type === 'sniper') ||
                (attacker.skills || []).some(
                    s => s && s.type === 'sniper' && s.active
                );
            if (hasSniper) {
                sniperMobilityReduction = 2;
            }
        }

        // Phase 10: 提取激活的技能效果 (含泛化 bonus_value)
        const activeSkillBonuses = this._extractSkillBonuses(attacker, resolvedSkill) || {};

        // Phase 10: 获取地形定义和万能技能字段
        const config = getGlossaryConfig();
        const terrainDefs = config?.terrains || {};
        const skillUf = resolvedSkill
            ? this.skillExecutor._getUniversalFields(resolvedSkill.type)
            : {};

        // Step 5: 配置驱动权威伤害种类——优先词条 damage_kind，缺失回退 weaponType
        const damageKind = getDamageType(skillUf, attacker.weaponType);

        // 伤害计算 (Phase 10: 传入 terrainDefs 和新字段)
        const damageResult = DamagePipe.calculate({
            attacker: {
                melee: attMelee,
                ranged: attRanged,
                attack: attMelee || attRanged || 10,
                mobility: attacker.mobility || 0,
                weaponType: attacker.weaponType || 'kinetic',
                buffs: attacker.buffs || [],
                skills: attacker.skills || [],
                extraBonuses: activeSkillBonuses,
                z: attacker.z ?? attacker.height ?? 0,
                height: attacker.height ?? attacker.z ?? 0,
                equipment: attacker.equipment || {}
            },
            defender: {
                defense: defender.defense || 5,
                armorType: defender.armorType || 'normal',
                shield: defender.shield || 0,
                resistance: defender.resistance || null,
                buffs: defender.buffs || [],
                equipment: defender.equipment || {},
                skills: defender.skills || [],
                mobility: defender.mobility || 0,
                terrain: defender.terrain || 'moon',
                z: defender.z ?? defender.height ?? 0,
                height: defender.height ?? defender.z ?? 0
            },
            attack_type: attackType,
            sniper_mobility_reduction: sniperMobilityReduction,
            terrainDefs,
            // Step 5: 显式注入归一化伤害种类（覆盖 weaponType）
            damage_kind: damageKind,
            // Phase 10: 万能语法字段注入管道
            is_manual_roll: skillUf.is_manual_roll || false,
            dice_type: skillUf.dice_type || '1d6',
            success_line: skillUf.success_line ?? 4,
            success_bonus_damage: skillUf.success_bonus_damage ?? 0,
            height_bonus_per_diff: skillUf.height_bonus_per_diff ?? 0
        });

        result.totalDamage += damageResult.final_damage;
        result.damage_pipe = damageResult;

        // 4. 耐久度结算
        const duraChanges = this.durability.resolveTurn(attacker, defender, options.turn);
        if (duraChanges && duraChanges.length) {
            result.durabilityChanges = duraChanges;
        }

        return result;
    }

    _resolveSkill(attacker, skillId) {
        if (!skillId || !attacker || !attacker.skills) return null;
        return attacker.skills.find(s => s && (s.id === skillId || s.type === skillId));
    }

    /**
     * Phase 10: 泛化技能加成提取
     * 不再按技能名硬编码分支，而是从 skillExecutor 获取 bonus_value
     */
    _extractSkillBonuses(attacker, resolvedSkill) {
        if (!attacker || !attacker.skills) return null;

        const bonuses = [];
        for (const skill of attacker.skills) {
            if (!skill || !skill.active) continue;
            // 动态注册表路由：按 skill.type 查找提取器，未注册则跳过（无硬编码分支）
            const extractor = SkillRegistry.getBonusExtractor(skill.type);
            if (!extractor) continue;
            const b = extractor({ executor: this.skillExecutor, unit: attacker, skill, resolvedSkill });
            if (b) bonuses.push(b);
        }

        return bonuses.length > 0 ? { bonuses } : null;
    }

    reset() {
        this.fogActive = false;
        this.fireCoverageUsed = false;
        this.durability.reset();
        this.skillExecutor.resetStableForBattle();
    }
}


// ============================================================
// 静态包装方法
// ============================================================

CombatResolver.resolveAttack = function(attacker, target, attack_type, skill_id) {
    const res = new CombatResolver();
    return res.executeTurn(attacker, target, { attack_type, skill_id });
};

CombatResolver.resolveSurpriseAttack = function(surpriseUnit, target, attack_type) {
    const res = new CombatResolver();
    return res.executeTurn(surpriseUnit, target, { attack_type, enableAmbush: true });
};

CombatResolver.getSupportUnits = function(target, allUnits) {
    if (!target || !allUnits) return [];
    return allUnits.filter(u => {
        if (!u || u.id === target.id || (u.hp || 0) <= 0) return false;
        if (u.faction !== target.faction) return false;
        const dq = Math.abs((u.q || 0) - (target.q || 0));
        const dr = Math.abs((u.r || 0) - (target.r || 0));
        return Math.max(dq, dr, Math.abs(dq + dr)) <= 1;
    });
};

CombatResolver.resolveEarthArtillery = function(center_q, center_r, units, battlefield_state) {
    const res = new CombatResolver();
    res.fireCoverageUsed = false;
    return res.resolveFireCoverage({ q: center_q, r: center_r }, units);
};

CombatResolver.resolveFogSystem = function(units, battlefield_state) {
    const res = new CombatResolver();
    res.fogActive = !!(battlefield_state && battlefield_state.fogOfWar);
    const effects = [];
    for (const unit of (units || [])) {
        if (unit && (unit.hp || 0) > 0) {
            effects.push({
                unit_id: unit.id,
                ...res.resolveFogEffect()
            });
        }
    }
    return { active: res.fogActive, effects };
};

CombatResolver.resolveReinforcement = function(targetUnit, supportUnit, originalDamage) {
    if (!targetUnit || !supportUnit) {
        return { interceded: false, message: '增援失败：单位无效' };
    }
    const dq = Math.abs((targetUnit.q || 0) - (supportUnit.q || 0));
    const dr = Math.abs((targetUnit.r || 0) - (supportUnit.r || 0));
    const ds = Math.abs((targetUnit.q || 0) - (supportUnit.q || 0) + (targetUnit.r || 0) - (supportUnit.r || 0));
    const dist = Math.max(dq, dr, ds);
    if (dist > 1) {
        return { interceded: false, message: '增援距离 ' + dist + ' 格，超出1格范围' };
    }
    if (supportUnit.hp <= 0) {
        return { interceded: false, message: '增援单位已阵亡' };
    }
    const redirectedDamage = Math.floor(originalDamage * 0.8);
    const targetDamage = originalDamage - redirectedDamage;
    supportUnit.hp = Math.max(0, supportUnit.hp - redirectedDamage);
    return {
        interceded: true,
        redirected_damage: redirectedDamage,
        target_damage: targetDamage,
        reinforcement_id: supportUnit.id,
        reinforcement_name: supportUnit.name || '?',
        reinforcement_hp: supportUnit.hp,
        message: (supportUnit.name || '?') + ' 增援了 ' + (targetUnit.name || '?') + '！承受 ' + redirectedDamage + ' 伤害（目标承担 ' + targetDamage + '）'
    };
};

CombatResolver.checkSurpriseAttack = function(attacker, target, allUnits) {
    return null;
};

export { CombatResolver };
```

## socketService.js

```js
import { WebSocketServer } from 'ws';
import dotenv from 'dotenv';
import jwt from 'jsonwebtoken';

// 加载环境变量（必须在读取 process.env 之前调用）
dotenv.config();

// 强制要求 JWT_SECRET
const JWT_SECRET = process.env.JWT_SECRET;
if (!JWT_SECRET) {
  throw new Error('[配置错误] JWT_SECRET 环境变量必须设置！');
}

class CombatSocketService {
  constructor() {
    this.clients = new Map(); // clientId -> WebSocket
    this.battleClients = new Map(); // battleId -> Set(clientId)
    this.clientBattles = new Map(); // clientId -> Set(battleId)
  }

  setupWebSocket(wss) {
    wss.on('connection', (ws, req) => {
      console.log('新的WebSocket连接建立');
      
      // 解析URL参数
      const url = new URL(req.url, `http://${req.headers.host}`);
      const token = url.searchParams.get('token');
      const battleId = url.searchParams.get('battleId');
      
      let clientId = null;
      let userId = null;
      
      try {
        if (token) {
          const decoded = jwt.verify(token, JWT_SECRET);
          userId = decoded.userId;
          clientId = `user_${userId}_${Date.now()}`;
        } else {
          clientId = `anon_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
        }
      } catch (error) {
        console.error('Token验证失败:', error);
        ws.close(1008, 'Token无效');
        return;
      }
      
      // 注册客户端
      this.clients.set(clientId, ws);
      console.log(`客户端 ${clientId} 已连接 (用户: ${userId || '匿名'})`);
      
      // 如果指定了战斗ID，加入战斗房间
      if (battleId) {
        this.joinBattle(clientId, battleId);
      }
      
      // 发送欢迎消息
      this.sendToClient(clientId, {
        type: 'welcome',
        clientId,
        userId,
        timestamp: new Date().toISOString()
      });
      
      // 消息处理
      ws.on('message', (data) => {
        try {
          const message = JSON.parse(data.toString());
          this.handleMessage(clientId, message);
        } catch (error) {
          console.error('消息解析失败:', error);
          this.sendToClient(clientId, {
            type: 'error',
            error: '消息格式错误',
            timestamp: new Date().toISOString()
          });
        }
      });
      
      // 连接关闭
      ws.on('close', () => {
        console.log(`客户端 ${clientId} 断开连接`);
        this.leaveAllBattles(clientId);
        this.clients.delete(clientId);
      });
      
      // 错误处理
      ws.on('error', (error) => {
        console.error(`客户端 ${clientId} WebSocket错误:`, error);
      });
    });
  }

  handleMessage(clientId, message) {
    const { type, battleId, ...data } = message;
    
    switch (type) {
      case 'join_battle':
        this.joinBattle(clientId, battleId);
        break;
        
      case 'leave_battle':
        this.leaveBattle(clientId, battleId);
        break;
        
      case 'battle_update':
        this.broadcastToBattle(battleId, {
          type: 'battle_update',
          clientId,
          ...data,
          timestamp: new Date().toISOString()
        });
        break;
        
      case 'unit_moved':
        this.broadcastToBattle(battleId, {
          type: 'unit_moved',
          clientId,
          ...data,
          timestamp: new Date().toISOString()
        });
        break;
        
      case 'unit_attacked':
        this.broadcastToBattle(battleId, {
          type: 'unit_attacked',
          clientId,
          ...data,
          timestamp: new Date().toISOString()
        });
        break;
        
      case 'turn_ended':
        this.broadcastToBattle(battleId, {
          type: 'turn_ended',
          clientId,
          ...data,
          timestamp: new Date().toISOString()
        });
        break;
        
      case 'chat_message':
        this.broadcastToBattle(battleId, {
          type: 'chat_message',
          clientId,
          ...data,
          timestamp: new Date().toISOString()
        });
        break;
        
      case 'manual_roll_request':
        // Phase 11: 手动摇骰请求 -> 广播给房间其他玩家
        console.log(`客户端 ${clientId} 请求手动摇骰:`, data);
        this.broadcastToBattle(battleId, {
          type: 'manual_roll_broadcast',
          clientId,
          ...data,
          timestamp: new Date().toISOString()
        });
        break;

      case 'manual_roll_response':
        // Phase 12: 摇骰结果回传 -> 发给请求方 + 广播房间
        console.log(`[Phase12] 客户端 ${clientId} 摇骰结果: turnId=${data.turnId} roll=${data.roll}`);
        if (data.requestClientId) {
          this.sendToClient(data.requestClientId, {
            type: 'manual_roll_result',
            clientId,
            turnId: data.turnId,
            roll: data.roll,
            diceType: data.dice_type || '1d6',
            successLine: data.success_line || 4,
            isSuccess: data.roll >= (data.success_line || 4),
            timestamp: new Date().toISOString()
          });
        }
        // 广播给房间所有客户端
        if (data.turnId) {
          this.broadcastToBattle(battleId, {
            type: 'manual_roll_broadcast',
            clientId,
            turnId: data.turnId,
            roll: data.roll,
            diceType: data.dice_type || '1d6',
            timestamp: new Date().toISOString()
          });
        }
        break;

      case 'ping':
        this.sendToClient(clientId, {
          type: 'pong',
          timestamp: new Date().toISOString()
        });
        break;
        
      default:
        console.warn(`未知消息类型: ${type}`);
        this.sendToClient(clientId, {
          type: 'error',
          error: `未知消息类型: ${type}`,
          timestamp: new Date().toISOString()
        });
    }
  }

  joinBattle(clientId, battleId) {
    // 加入战斗房间
    if (!this.battleClients.has(battleId)) {
      this.battleClients.set(battleId, new Set());
    }
    this.battleClients.get(battleId).add(clientId);
    
    // 记录客户端加入的战斗
    if (!this.clientBattles.has(clientId)) {
      this.clientBattles.set(clientId, new Set());
    }
    this.clientBattles.get(clientId).add(battleId);
    
    console.log(`客户端 ${clientId} 加入战斗 ${battleId}`);
    
    // 通知房间内其他用户
    this.broadcastToBattle(battleId, {
      type: 'player_joined',
      clientId,
      battleId,
      timestamp: new Date().toISOString()
    }, clientId); // 排除自己
    
    // 发送加入确认
    this.sendToClient(clientId, {
      type: 'joined_battle',
      battleId,
      clientCount: this.battleClients.get(battleId).size,
      timestamp: new Date().toISOString()
    });
  }

  leaveBattle(clientId, battleId) {
    // 从战斗房间移除
    if (this.battleClients.has(battleId)) {
      this.battleClients.get(battleId).delete(clientId);
      
      // 如果房间空了，删除房间
      if (this.battleClients.get(battleId).size === 0) {
        this.battleClients.delete(battleId);
      }
    }
    
    // 从客户端战斗记录中移除
    if (this.clientBattles.has(clientId)) {
      this.clientBattles.get(clientId).delete(battleId);
      
      // 如果客户端没有加入任何战斗，删除记录
      if (this.clientBattles.get(clientId).size === 0) {
        this.clientBattles.delete(clientId);
      }
    }
    
    console.log(`客户端 ${clientId} 离开战斗 ${battleId}`);
    
    // 通知房间内其他用户
    this.broadcastToBattle(battleId, {
      type: 'player_left',
      clientId,
      battleId,
      timestamp: new Date().toISOString()
    });
  }

  leaveAllBattles(clientId) {
    const battles = this.clientBattles.get(clientId);
    if (battles) {
      battles.forEach(battleId => {
        this.leaveBattle(clientId, battleId);
      });
    }
  }

  sendToClient(clientId, message) {
    const ws = this.clients.get(clientId);
    if (ws && ws.readyState === WebSocket.OPEN) {
      try {
        ws.send(JSON.stringify(message));
      } catch (error) {
        console.error(`发送消息到客户端 ${clientId} 失败:`, error);
      }
    }
  }

  broadcastToBattle(battleId, message, excludeClientId = null) {
    const clients = this.battleClients.get(battleId);
    if (!clients) return;
    
    clients.forEach(clientId => {
      if (clientId !== excludeClientId) {
        this.sendToClient(clientId, message);
      }
    });
  }

  broadcastToAll(message, excludeClientId = null) {
    this.clients.forEach((ws, clientId) => {
      if (clientId !== excludeClientId && ws.readyState === WebSocket.OPEN) {
        try {
          ws.send(JSON.stringify(message));
        } catch (error) {
          console.error(`广播消息到客户端 ${clientId} 失败:`, error);
        }
      }
    });
  }

  getBattleClients(battleId) {
    return this.battleClients.get(battleId) || new Set();
  }

  getBattleClientCount(battleId) {
    return this.getBattleClients(battleId).size;
  }

  getClientBattles(clientId) {
    return this.clientBattles.get(clientId) || new Set();
  }
}

const socketService = new CombatSocketService();

export const setupWebSocket = (wss) => {
  socketService.setupWebSocket(wss);
};

export default socketService;```

## turnManager.js

```js
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
  

  // 阵营数量（用于计算轮次）
  static FACTION_COUNT = 3;

  // 胜利条件类型
  static VICTORY_TYPES = {
    ANNIHILATE: 'annihilate',     // 全歼
    ASSASSINATE: 'assassinate',   // 刺杀ACE
    DESTROY_FACILITY: 'destroy_facility', // 摧毁设施
    HOLD_POSITION: 'hold_position',      // 坚守（存活至第N轮）
    CAPTURE: 'capture',           // 占领据点
  };
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
      hp: 100,
      max_hp: 100,
      attack: 12,
      defense: 6,
      mobility: 3,
      weaponType: 'beam',
      armorType: 'normal',
      shield: 0,
      level: 1,
      has_moved: false,
      has_acted: false,
      royroy_deployed: false,
      buffs: []
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
    const nextFaction = this.getNextFaction(state.current_faction);
    
    // 如果回到地联，说明完成了一轮
    if (nextFaction === 'earth') {
      state.turn_number = (state.turn_number || 1) + 1;
      // 重置迷雾系统的每回合标志
      state.earthFogRolledThisTurn = false;
      // 重置阵营技能使用标志
      state.earthArtilleryUsed = false;
      state.fogSystemUsed = false;
    }
    
    state.current_faction = nextFaction;
    state.phase = 'move';
    
    // 重置单位状态
    state.units.forEach(unit => {
      unit.has_moved = false;
      unit.has_acted = false;
      unit.skip_turn = false;
      unit.skipped_tactical = false;
      unit.skipped_move = false;
      // 重置造成伤害标记（用于隐匿判断）
      unit.dealtDamageLastTurn = unit.dealtDamageThisTurn || false;
      unit.dealtDamageThisTurn = false;
    });

    // 减少隐匿持续时间
    state.units.forEach(unit => {
      if (unit.concealed && unit.concealDuration !== undefined && unit.concealDuration > 0) {
        unit.concealDuration--;
        if (unit.concealDuration <= 0) {
          unit.concealed = false;
          state.battle_log.push({
            type: 'conceal_expire',
            unit_id: unit.id,
            unit_name: unit.name || unit.id,
            message: `${unit.name || unit.id} 的隐匿效果消失`,
            timestamp: new Date().toISOString()
          });
        }
      }
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
      turn_number: state.turn_number,
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
    const faction = state.current_faction;
    
    // 防守阵营（拜隆）：补给 — 每个己方回合自动恢复4HP
    if (faction === 'balon') {
      const factionRoles = state.faction_roles || {};
      const role = factionRoles['balon'] || 'defense';
      if (role === 'defense') {
        for (const unit of (state.units || [])) {
          if (unit.hp > 0 && unit.hp < (unit.max_hp || 100)) {
            const healAmount = 4;
            unit.hp = Math.min((unit.max_hp || 100), unit.hp + healAmount);
            state.battle_log.push({
              type: 'supply_heal',
              unit_id: unit.id,
              unit_name: unit.name || unit.id,
              heal_amount: healAmount,
              new_hp: unit.hp,
              message: (unit.name || unit.id) + ' 补给恢复 ' + healAmount + ' HP',
              timestamp: new Date().toISOString()
            });
          }
        }
      }
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
      unit.faction === state.current_faction && 
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
      static getCellsBetween(unit1, unit2) {
    // 六角格 Bresenham 算法：在六角坐标系中计算两点间的格子
    const cells = [];
    const dq = unit2.q - unit1.q;
    const dr = unit2.r - unit1.r;
    const steps = Math.max(Math.abs(dq), Math.abs(dr), Math.abs(dq - dr));

    if (steps === 0) {
      cells.push({ q: unit1.q, r: unit1.r });
      return cells;
    }

    for (let i = 0; i <= steps; i++) {
      const t = i / steps;
      // 六角格线性插值后取整，处理漂移
      const q_f = unit1.q + dq * t;
      const r_f = unit1.r + dr * t;

      // 六角坐标舍入 (cube rounding)
      const sq = Math.round(q_f);
      const sr = Math.round(r_f);
      const sx = Math.round(-q_f - r_f);
      // 修正：确保 q + s + r === 0 (cube coordinate invariant)
      // 此处直接用 q,r 坐标的舍入结果，在 offset 坐标系中已足够
      // 使用 closest hex rounding
      const dq_diff = Math.abs(sq - q_f);
      const dr_diff = Math.abs(sr - r_f);
      const ds_diff = Math.abs(sx + q_f + r_f);

      let q, r;
      if (dq_diff > dr_diff && dq_diff > ds_diff) {
        q = -sr - sx;
        r = sr;
      } else if (dr_diff > ds_diff) {
        q = sq;
        r = -sq - sx;
      } else {
        q = sq;
        r = sr;
      }

      cells.push({ q, r });
    }

    return cells;
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
      // 只统计存活单位 (hp > 0)
      if (unit.hp > 0) {
        factions[unit.faction] = true;
      }
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
    return (Math.abs(unit1.q - unit2.q) + Math.abs(unit1.q + unit1.r - unit2.q - unit2.r) + Math.abs(unit1.r - unit2.r)) / 2;
  }

  /**
   * 掷骰子
   */
  static rollDice(sides = 6) {
    return Math.floor(Math.random() * sides) + 1;
  }
  /**
   * 检查阵营技能是否可使用
   * 偷袭阵营的奇袭/隐匿全员可用（无视ACE）
   */
  static canUseFactionSkill(state, factionKey, skillKey, unitId, factionRoles) {
    // 获取阵营角色
    const role = (factionRoles && factionRoles[factionKey]) || this.getDefaultRole(factionKey);
    
    // 偷袭阵营技能全员可用
    if (role === 'ambush' && (skillKey === 'surprise' || skillKey === 'conceal')) {
      return { allowed: true, reason: null };
    }
    
    // ACE 检查
    const aceUnits = state.ace_units || {};
    const aceId = aceUnits[factionKey];
    if (aceId && String(unitId) !== String(aceId)) {
      return { allowed: false, reason: '需要ACE单位才能使用此技能' };
    }

    // 防守阵营被动技能全员可用（无视ACE，无冷却）
    if (role === 'defense' && (skillKey === 'reinforcement' || skillKey === 'supply')) {
      return { allowed: true, reason: null };
    }
    
    // 火力覆盖：每场1次
    if (skillKey === 'fire_cover') {
      if (state.earthArtilleryUsed || state.fireCoverageUsed) {
        return { allowed: false, reason: '火力覆盖已使用' };
      }
    }
    
    // 迷雾系统：每3轮1次
    if (skillKey === 'fog_system') {
      if (state.fogSystemUsed) {
        const round = this.getRoundNumber(state);
        if (state.fogCooldownRemaining > 0) {
          return { allowed: false, reason: `迷雾冷却中，剩余 ${state.fogCooldownRemaining} 轮` };
        }
        return { allowed: false, reason: '迷雾已使用' };
      }
    }
    
    return { allowed: true, reason: null };
  }
  
  /**
   * 获取默认阵营角色
   */
  static getDefaultRole(factionKey) {
    const defaults = {
      earth: 'attack',
      maxion: 'ambush',
      balon: 'defense',
      neutral: 'attack',
    };
    return defaults[factionKey] || 'attack';
  }
  
  /**
   * 获取当前轮次（所有阵营完成回合 = 1轮）
   */
  static getRoundNumber(state) {
    const turn = state.turn_number || state.current_turn || 1;
    return Math.ceil(turn / this.FACTION_COUNT);
  }
  
  /**
   * 检查胜利条件
   */
  static checkVictoryConditions(state, victoryConditions, holdRound, facilityCoord) {
    const conditions = victoryConditions || ['annihilate'];
    const units = state.units || [];
    
    for (const cond of conditions) {
      switch (cond) {
        case 'annihilate': {
          // 全歼：检查某个阵营是否全部被消灭
          const factions = {};
          units.forEach(u => {
            if (u.hp > 0) {
              const f = u.faction || 'earth';
              factions[f] = (factions[f] || 0) + 1;
            }
          });
          const activeFactions = Object.keys(factions).filter(f => factions[f] > 0);
          if (activeFactions.length <= 1) {
            const winner = activeFactions[0] || 'earth';
            return { victory: true, winner, condition: 'annihilate', message: `${winner} 全歼敌方！` };
          }
          break;
        }
        case 'assassinate': {
          const aceUnits = state.ace_units || {};
          for (const [faction, aceId] of Object.entries(aceUnits)) {
            const ace = units.find(u => String(u.id) === String(aceId));
            if (ace && ace.hp <= 0) {
              const opponent = Object.keys(aceUnits).find(f => f !== faction);
              return { victory: true, winner: opponent || 'earth', condition: 'assassinate', message: `${faction} ACE 被击杀！` };
            }
          }
          break;
        }
        case 'destroy_facility': {
          if (facilityCoord) {
            const cell = (state.battlefield_state?.cells || state.cells || []).find(
              c => c.q === facilityCoord.q && c.r === facilityCoord.r
            );
            if (cell && cell.destroyed) {
              return { victory: true, winner: 'attacker', condition: 'destroy_facility', message: '设施已摧毁！' };
            }
          }
          break;
        }
        case 'hold_position': {
          const round = this.getRoundNumber(state);
          if (round >= (holdRound || 8)) {
            return { victory: true, winner: 'defender', condition: 'hold_position', message: `坚守成功！已存活 ${round} 轮` };
          }
          break;
        }
        case 'capture': {
          // 占领：检查据点是否被单一阵营全部控制
          const capturePoints = (state.battlefield_state?.cells || state.cells || []).filter(c => c.isCapturePoint);
          if (capturePoints.length > 0) {
            const allCaptured = capturePoints.every(cp => {
              const occupyingUnits = units.filter(u => u.q === cp.q && u.r === cp.r && u.hp > 0);
              if (occupyingUnits.length === 0) return false;
              const factions = new Set(occupyingUnits.map(u => u.faction));
              return factions.size === 1;
            });
            if (allCaptured) {
              return { victory: true, winner: 'attacker', condition: 'capture', message: '所有据点已占领！' };
            }
          }
          break;
        }
      }
    }
    return { victory: false, winner: null, condition: null, message: null };
  }

}

export default TurnManager;
```

## unitConverter.js

```js
/**
 * UnitConverter - 格纳库棋子格式 → 战斗核心单位格式转换器
 * 
 * 将 hangar-service 存储的棋子属性（格斗/射击/结构/机动）
 * 转换为 combat-service 战斗核心所需的单位格式（attack/defense/hp/mobility/equipment）
 */

/**
 * 装备类型映射：hangar 中文类型 → combat 英文类型
 */
const EQUIP_TYPE_MAP = {
    '武器': 'weapon',
    '装甲': 'armor',
    '盾牌': 'armor',
    '推进器': 'thruster',
    '辅助': 'support',
    '机体': null,
    'none': null
};

/**
 * 阵营映射
 */
const FACTION_MAP = {
    'earth': 'earth',
    'balon': 'balon',
    'maxion': 'maxion',
    '地球联合': 'earth',
    '拜隆': 'balon',
    '马克西翁': 'maxion'
};

class UnitConverter {

    /**
     * 将 hangar 棋子数据转换为 combat 战斗单位
     * @param {Object} hangarUnit - hangar-service 返回的棋子对象
     * @param {Object} deployInfo - 部署信息 { q, r, player_id }
     * @returns {Object} combat 格式的战斗单位
     */
    static convert(hangarUnit, deployInfo = {}) {
        if (!hangarUnit) {
            throw new Error('UnitConverter: hangarUnit is required');
        }

        const faction = FACTION_MAP[hangarUnit.faction] || 'earth';

        // 核心属性推导
        const geDou = Number(hangarUnit['main_格斗'] || hangarUnit.main_格斗 || 0);
        const sheJi = Number(hangarUnit['main_射击'] || hangarUnit.main_射击 || 0);
        const jieGou = Number(hangarUnit['main_结构'] || hangarUnit.main_结构 || 0);
        const jiDong = Number(hangarUnit['main_机动'] || hangarUnit.main_机动 || 0);

        const attack = Math.max(geDou, sheJi, 1);
        const weaponType = sheJi > geDou ? 'energy' : 'kinetic';
        const defense = Math.max(jieGou, 1);
        const hp = jieGou * 10;
        const mobility = jiDong;
        const melee = geDou;
        const ranged = sheJi;

        // 装备机动增益：推进器装备的"结构"属性贡献机动值
        const leftStruct = Number(hangarUnit['left_结构'] || hangarUnit.left_结构 || 0);
        const rightStruct = Number(hangarUnit['right_结构'] || hangarUnit.right_结构 || 0);
        const extraStruct = Number(hangarUnit['extra_结构'] || hangarUnit.extra_结构 || 0);

        const leftType = hangarUnit['left_type'] || hangarUnit.left_type || 'none';
        const rightType = hangarUnit['right_type'] || hangarUnit.right_type || 'none';
        const extraType = hangarUnit['extra_type'] || hangarUnit.extra_type || 'none';

        const THRUSTER_MOBILITY_RATIO = 0.5;
        let equipmentMobilityBonus = 0;

        if (leftType === '推进器') equipmentMobilityBonus += Math.floor(leftStruct * THRUSTER_MOBILITY_RATIO);
        if (rightType === '推进器') equipmentMobilityBonus += Math.floor(rightStruct * THRUSTER_MOBILITY_RATIO);
        if (extraType === '推进器') equipmentMobilityBonus += Math.floor(extraStruct * THRUSTER_MOBILITY_RATIO);

        const totalMobility = mobility + equipmentMobilityBonus;

        // 转换装备
        const leftEquip = this._convertEquipment(hangarUnit, 'left');
        const rightEquip = this._convertEquipment(hangarUnit, 'right');
        const extraEquip = this._convertEquipment(hangarUnit, 'extra');

        // 计算护盾值（来自装甲装备）
        const shield = this._calculateShield(leftEquip, rightEquip, extraEquip);

        // 判定护甲类型
        const armorType = this._determineArmorType(leftEquip, rightEquip, extraEquip);

        const unit = {
            id: hangarUnit.id,
            unit_id: hangarUnit.id,
            player_id: deployInfo.player_id || 0,
            name: hangarUnit.name || 'Unknown',
            faction,
            q: deployInfo.q || 0,
            r: deployInfo.r || 0,
            hp,
            max_hp: hp,
            attack,
            melee,
            ranged,
            defense,
            mobility: totalMobility,
            weaponType,
            armorType,
            shield,
            resistance: this._deriveResistance(leftEquip, rightEquip, extraEquip),
            level: 1,
            has_acted: false,
            has_moved: false,
            buffs: [],

            // 特殊装备标记
            equipment: {
                full_armor: false,
                coating: false
            },

            // 装备字段（与 combat DB schema 对齐）
            left_hand_type: leftEquip.type,
            left_hand_name: leftEquip.name || null,
            left_hand_melee: leftEquip.melee,
            left_hand_ranged: leftEquip.ranged,
            left_hand_defense: leftEquip.defense,
            left_hand_durability: leftEquip.durability,
            left_hand_resistance: leftEquip.resistance || null,

            right_hand_type: rightEquip.type,
            right_hand_name: rightEquip.name || null,
            right_hand_melee: rightEquip.melee,
            right_hand_ranged: rightEquip.ranged,
            right_hand_defense: rightEquip.defense,
            right_hand_durability: rightEquip.durability,
            right_hand_resistance: rightEquip.resistance || null,

            extra_type: extraEquip.type,
            extra_name: extraEquip.name || null,
            extra_melee: extraEquip.melee,
            extra_ranged: extraEquip.ranged,
            extra_defense: extraEquip.defense,
            extra_durability: extraEquip.durability,
            extra_resistance: extraEquip.resistance || null,

            // Royroy 跟随单位
            royroy_deployed: false,
            royroy_q: null,
            royroy_r: null,

            // 保留原始数据用于技能转换
            _hangarRaw: hangarUnit,

            // 转换技能为 Tag 格式
            skills: this.convertSkills(hangarUnit)
        };

        // 如果有 Royroy，附加其信息
        if (hangarUnit.has_royroy) {
            unit.royroy = this._convertRoyroy(hangarUnit);
        }

        return unit;
    }

    /**
     * 批量转换
     */
    static convertAll(hangarUnits, deployInfoList = []) {
        return hangarUnits.map((hu, idx) => {
            const deployInfo = deployInfoList[idx] || {};
            return this.convert(hu, deployInfo);
        });
    }

    /**
     * 转换单个装备槽
     * @private
     */
    static _convertEquipment(hangarUnit, slot) {
        const prefix = `${slot}_`;
        const typeRaw = hangarUnit[`${prefix}type`] || 'none';
        const combatType = EQUIP_TYPE_MAP[typeRaw] || null;

        if (!combatType) {
            return {
                type: null,
                name: null,
                melee: 0,
                ranged: 0,
                defense: 0,
                durability: 0,
                resistance: null
            };
        }

        const geDou = Number(hangarUnit[`${prefix}格斗`] || hangarUnit[`${prefix}_格斗`] || 0);
        const sheJi = Number(hangarUnit[`${prefix}射击`] || hangarUnit[`${prefix}_射击`] || 0);
        const jieGou = Number(hangarUnit[`${prefix}结构`] || hangarUnit[`${prefix}_结构`] || 0);

        const equip = {
            type: combatType,
            name: hangarUnit[`${prefix}type`] !== 'none' ? `${typeRaw}(${slot})` : null
        };

        if (combatType === 'weapon') {
            equip.melee = geDou;
            equip.ranged = sheJi;
            equip.defense = 0;
            equip.durability = jieGou;  // 结构 × 1
            equip.resistance = null;
        } else if (combatType === 'armor') {
            equip.melee = 0;
            equip.ranged = 0;
            equip.defense = jieGou;
            equip.durability = 5;  // 固定 5
            equip.resistance = typeRaw === '盾牌' ? 'energy' : null;
        } else if (combatType === 'thruster') {
            equip.melee = 0;
            equip.ranged = 0;
            equip.defense = 0;
            equip.durability = jieGou;  // 结构 × 1 = 可被攻击次数
            equip.resistance = null;
        } else {
            equip.melee = geDou;
            equip.ranged = sheJi;
            equip.defense = jieGou;
            equip.durability = 5;  // 固定 5（背包）
            equip.resistance = null;
        }

        return equip;
    }

    /**
     * 计算总护盾值
     * @private
     */
    static _calculateShield(leftEquip, rightEquip, extraEquip) {
        let shield = 0;
        [leftEquip, rightEquip, extraEquip].forEach(eq => {
            if (eq && eq.type === 'armor') {
                shield += eq.defense || 0;
            }
        });
        return shield;
    }

    /**
     * 判定护甲类型
     * @private
     */
    static _determineArmorType(leftEquip, rightEquip, extraEquip) {
        const hasArmor = [leftEquip, rightEquip, extraEquip].some(eq => eq && eq.type === 'armor');
        const hasThruster = [leftEquip, rightEquip, extraEquip].some(eq => eq && eq.type === 'thruster');
        
        if (hasArmor) return 'heavy';
        if (hasThruster) return 'light';
        return 'normal';
    }

    /**
     * 转换 Royroy 跟随单位
     * @private
     */
    static _convertRoyroy(hangarUnit) {
        const geDou = Number(hangarUnit['royroy_格斗'] || hangarUnit.royroy_格斗 || 0);
        const sheJi = Number(hangarUnit['royroy_射击'] || hangarUnit.royroy_射击 || 0);
        const jieGou = Number(hangarUnit['royroy_结构'] || hangarUnit.royroy_结构 || 0);
        const jiDong = Number(hangarUnit['royroy_机动'] || hangarUnit.royroy_机动 || 0);

        return {
            name: hangarUnit.royroy_name || 'Royroy',
            attack: Math.max(geDou, sheJi, 1),
            defense: Math.max(jieGou, 1),
            hp: jieGou * 5,
            max_hp: jieGou * 5,
            mobility: jiDong,
            weaponType: sheJi > geDou ? 'energy' : 'kinetic',
            deployed: false
        };
    }

    /**
     * 推导单位级别的抗性类型（从装备中取第一个非空 resistance）
     * @private
     */
    static _deriveResistance(leftEquip, rightEquip, extraEquip) {
        for (const eq of [leftEquip, rightEquip, extraEquip]) {
            if (eq && eq.resistance) return eq.resistance;
        }
        return null;
    }

    /**
     * 将 hangar 技能转换为 combat Tag 格式
     * 匹配 Excel 技能表：反击/格挡/长柄/补给/扫射/投掷/稳定/狙击/助攻/守护/阻碍/侦察
     * @param {Object} hangarUnit - hangar 棋子对象
     * @returns {Array<Object>} combat Tag 数组
     */
    static convertSkills(hangarUnit) {
        const allSkills = [];
        const skillGroups = {
            'main': 'main_skills',
            'left': 'left_skills',
            'right': 'right_skills',
            'extra': 'extra_skills',
            'royroy': 'royroy_skills'
        };

        for (const [slot, field] of Object.entries(skillGroups)) {
            let skills = hangarUnit[field];
            if (typeof skills === 'string') {
                try { skills = JSON.parse(skills); } catch (e) { skills = []; }
            }
            if (!Array.isArray(skills)) continue;

            skills.forEach((skill, idx) => {
                if (!skill || !skill.name) return;
                const tag = this._skillToTag(skill, slot, idx);
                if (tag) allSkills.push(tag);
            });
        }
        return allSkills;
    }

    /**
     * 单个技能 -> Tag 转换
     * Excel 技能名称映射到 combat type
     * @private
     */
    static _skillToTag(skill, slot, index) {
        // 技能名称 → combat 类型映射
        // P2-1: 补充 6 个特殊词条（斩杀、决斗、抢夺、专注射击、幸运、再动）
        const TYPE_MAP = {
            '反击': 'counter',
            '格挡': 'block',
            '长柄': 'polearm',
            '补给': 'supply',
            '扫射': 'sweep',
            '投掷': 'throw',
            '稳定': 'stable',
            '狙击': 'sniper',
            '助攻': 'assist',
            '守护': 'guard',
            '阻碍': 'blockade',
            '侦察': 'scout',
            '全覆式装甲': 'full_armor',
            '抗性涂层': 'coating',
            '变形': 'transform',
            // 特殊词条（P2-1 新增）
            '斩杀': 'execute',
            '决斗': 'duel',
            '抢夺': 'snatch',
            '专注射击': 'focused_fire',
            '幸运': 'lucky',
            '再动': 'reactivate'
        };

        const name = skill.name || '';
        const combatType = TYPE_MAP[name] || 'unknown';

        const tag = {
            id: `${slot}_skill_${index}`,
            name,
            type: combatType,
            attribute: skill.attribute === '光束' ? 'energy' : skill.attribute === '实体' ? 'kinetic' : (skill.attribute || 'kinetic'),
            slot: slot,
            active: true,
            disabled: false,
            category: this._getSkillCategory(combatType),
            slots: combatType === 'supply' || combatType === 'scout' ? 2 : 1,
            // P2-3: 新增 targetType / needTarget / counter / description 字段
            targetType: this._getTargetType(combatType),
            needTarget: this._needTarget(combatType),
            initCounter: this._getInitCounter(combatType),
            description: skill.description || this._getSkillDesc(combatType),
            original: skill
        };

        // P2-2: 修复 range 解析 — 支持 "1-3", "4~6" 等区间格式
        if (skill.range) {
            const rangeStr = String(skill.range);
            const rangeMatch = rangeStr.match(/(\d+)\s*[-~～]\s*(\d+)/);
            if (rangeMatch) {
                tag.range_min = parseInt(rangeMatch[1]);
                tag.range_max = parseInt(rangeMatch[2]);
                tag.range = tag.range_max; // 兼容旧字段
            } else {
                const singleMatch = rangeStr.match(/(\d+)/);
                if (singleMatch) {
                    const val = parseInt(singleMatch[1]);
                    tag.range_min = val;
                    tag.range_max = val;
                    tag.range = val;
                }
            }
        }

        // 解析 special 字段
        if (skill.special) {
            tag.special = skill.special;
            const lower = String(skill.special).toLowerCase();
            if (lower.includes('必中')) tag.guaranteed_hit = true;
            if (lower.includes('暴击') || lower.includes('crit')) tag.crit_boost = true;
            if (lower.includes('穿透')) tag.pierce = true;
            if (lower.includes('吸血')) tag.lifesteal = true;
        }

        return tag;
    }

    /**
     * 获取技能分类（近战/远程/自动化/特殊）
     * @private
     */
    static _getSkillCategory(type) {
        switch (type) {
            case 'counter':
            case 'block':
            case 'polearm':
            case 'supply':
                return 'melee';
            case 'sweep':
            case 'throw':
            case 'stable':
            case 'sniper':
                return 'ranged';
            case 'assist':
            case 'guard':
            case 'blockade':
            case 'scout':
                return 'auto';
            case 'full_armor':
            case 'coating':
            case 'transform':
            // P2-1: 特殊词条分类
            case 'execute':
            case 'duel':
            case 'snatch':
            case 'focused_fire':
            case 'lucky':
            case 'reactivate':
                return 'special';
            default:
                return 'unknown';
        }
    }

    /**
     * P2-3: 获取技能目标类型
     * @private
     */
    static _getTargetType(type) {
        const map = {
            'supply': 'ally',    // 补给 → 友军
            'scout': 'ally',     // 侦察 → 友军
            'assist': 'self',    // 助攻 → 自身增益
            'guard': 'self',     // 守护 → 自身增益
            'blockade': 'self',  // 阻碍 → 自身增益能力
            'counter': 'enemy',  // 反击 → 敌方
            'throw': 'enemy',    // 投掷 → 敌方
            'sweep': 'enemy',    // 扫射 → 敌方
            'sniper': 'enemy',   // 狙击 → 敌方
            'block': 'self',     // 格挡 → 自身
            'polearm': 'enemy',  // 长柄 → 敌方
            'stable': 'enemy',   // 稳定 → 敌方目标
            'execute': 'enemy',  // 斩杀 → 敌方
            'duel': 'enemy',     // 决斗 → 敌方
            'snatch': 'enemy',   // 抢夺 → 敌方
            'focused_fire': 'enemy', // 专注射击 → 敌方
            'lucky': 'self',     // 幸运 → 自身
            'reactivate': 'self',// 再动 → 自身
            'full_armor': 'self',// 全覆式装甲 → 自身
            'coating': 'self',   // 抗性涂层 → 自身
            'transform': 'self', // 变形 → 自身
        };
        return map[type] || 'enemy';
    }

    /**
     * P2-3: 技能是否需要用户主动选择目标
     * @private
     */
    static _needTarget(type) {
        return ['throw', 'sweep', 'sniper', 'supply', 'stable'].includes(type);
    }

    /**
     * P2-3: 获取自动化技能的初始计数器值
     * @private
     */
    static _getInitCounter(type) {
        const map = {
            'assist': 5,   // Excel: 后续五次伤害+3
            'guard': 3,    // Excel: 后续三次受伤害-5
            'blockade': 3, // Excel: 后续三次对方机动值-5
        };
        return map[type] || 0;
    }

    /**
     * P2-3: 获取技能描述文本（以 Excel 规则为准）
     * @private
     */
    static _getSkillDesc(type) {
        const map = {
            'counter': '被动：受到敌人攻击且对方在范围内时触发，发动反击伤害+2',
            'block': '被动：受到敌人攻击时掷骰，1-3失败/4-6伤害-2',
            'polearm': '攻击范围1~2格（近战基础上延伸至第二圈）',
            'supply': '主动：跳过移动，对范围1内友军回复格斗值×1的HP（占用2槽）',
            'sweep': '主动：扇形2格，不判定机动值。掷骰1-3精准命中单体-2，4-6范围均摊',
            'throw': '主动：1~3格，掷骰1-3目标周围2格下次伤害+5，4-6目标移动值-5',
            'stable': '主动：1~4格，每局一次，移动后可使用专注射击',
            'sniper': '主动：4~6格，舍弃移动，机动值差计算中目标机动值-2',
            'assist': '被动：后续五次造成的伤害+3（适用于反击）',
            'guard': '被动：后续三次受到的伤害-5，与百分比减伤不叠加',
            'blockade': '被动：在后续三次伤害计算中，对方机动值-5',
            'scout': '被动：对射击值×1范围侦察，暴露敌方3×3区域（占用2槽）',
            'execute': '近战伤害结算后，目标HP<5时掷骰，点数≥剩余血量→直接斩杀',
            'duel': '双方在攻击范围内且HP<对方max(格斗,射击)时触发，双方掷骰大者胜',
            'snatch': '伤害值>被攻击者武器攻击值时掷骰，点数>3→伤害减半并获得武器',
            'focused_fire': '放弃移动，掷骰：1-4伤害+3，5-6伤害+5',
            'lucky': '获得空投时掷骰：1-2跳过攻击，3-4可攻击，5-6再移动攻击',
            'reactivate': '击杀敌军时触发，额外一回合（不连续触发）',
            'full_armor': '对实体武器伤害-2',
            'coating': '对光束武器伤害-2',
            'transform': '变形技能',
        };
        return map[type] || '';
    }

}

export default UnitConverter;
```

