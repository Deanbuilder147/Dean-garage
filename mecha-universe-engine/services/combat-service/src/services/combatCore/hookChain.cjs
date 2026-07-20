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
