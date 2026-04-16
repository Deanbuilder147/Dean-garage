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
