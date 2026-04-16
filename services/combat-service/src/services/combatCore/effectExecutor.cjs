/**
 * EffectExecutor - 效果执行器
 * 
 * 职责:
 * 1. 根据 effects[].type 映射到具体效果处理器
 * 2. 执行词条效果
 * 3. 支持效果组合和链式执行
 */

const damagePipe = require('./damagePipe.cjs');
const buffManager = require('./buffManager.cjs');

class EffectExecutor {
  constructor() {
    // 效果类型处理器映射
    this.handlers = {
      // 伤害相关
      instant_kill: this.handleInstantKill.bind(this),
      damage_bonus_dice: this.handleDamageBonusDice.bind(this),
      damage_reduction: this.handleDamageReduction.bind(this),
      
      // 判定相关
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

      // ========== 隐身效果 ==========
      enter_stealth: this.handleEnterStealth.bind(this),
      exit_stealth: this.handleExitStealth.bind(this),
      stealth_attack_bonus: this.handleStealthAttackBonus.bind(this),
      stealth_evasion: this.handleStealthEvasion.bind(this)
    };
  }

  /**
   * 执行效果列表
   * @param {array} effects - 效果定义数组
   * @param {object} context - 执行上下文
   * @returns {array} 执行结果
   */
  async execute(effects, context) {
    if (!effects || effects.length === 0) {
      return [{ success: true, reason: 'no_effects' }];
    }

    const results = [];
    
    for (const effect of effects) {
      const result = await this.executeSingle(effect, context);
      results.push(result);
      
      // 处理中断
      if (result.interrupt) {
        break;
      }
    }
    
    return results;
  }

  /**
   * 执行单个效果
   */
  async executeSingle(effect, context) {
    const { type, ...params } = effect;
    
    const handler = this.handlers[type];
    if (!handler) {
      console.warn(`[EffectExecutor] 未知效果类型: ${type}`);
      return {
        type,
        success: false,
        reason: 'unknown_effect_type'
      };
    }
    
    try {
      return await handler(params, context);
    } catch (error) {
      console.error(`[EffectExecutor] 执行效果失败: ${type}`, error);
      return {
        type,
        success: false,
        reason: 'execution_error',
        error: error.message
      };
    }
  }

  /**
   * 立即斩杀
   */
  async handleInstantKill(params, context) {
    const { dice } = params;
    
    // 如果需要掷骰
    if (dice?.required) {
      const roll = this.rollDice(dice.sides || 6);
      const targetHp = context.target?.hp || 0;
      
      if (roll >= targetHp) {
        return {
          type: 'instant_kill',
          success: true,
          roll,
          targetHp,
          result: 'target_eliminated',
          interrupt: true // 斩杀成功中断后续处理
        };
      }
      
      return {
        type: 'instant_kill',
        success: false,
        roll,
        targetHp,
        result: 'execution_failed'
      };
    }
    
    // 无条件斩杀
    return {
      type: 'instant_kill',
      success: true,
      result: 'target_eliminated',
      interrupt: true
    };
  }

  /**
   * 伤害加成掷骰（专注射击）
   */
  async handleDamageBonusDice(params, context) {
    const { dice, bonus } = params;
    
    if (dice?.required) {
      const roll = this.rollDice(dice.sides || 6);
      
      // 根据掷骰结果计算加成
      let damageBonus = 0;
      if (roll >= 5) damageBonus = bonus?.high || 5;
      else if (roll >= 3) damageBonus = bonus?.mid || 4;
      else damageBonus = bonus?.low || 3;
      
      // 应用到伤害管道
      if (context.damageContext) {
        context.damageContext.addStep({
          source: 'effect',
          type: 'tag_bonus',
          value: damageBonus,
          description: `专注射击: +${damageBonus}伤害`
        });
      }
      
      return {
        type: 'damage_bonus_dice',
        success: true,
        roll,
        bonus: damageBonus
      };
    }
    
    return {
      type: 'damage_bonus_dice',
      success: true,
      bonus: bonus?.fixed || 3
    };
  }

  /**
   * 伤害减免（抗性）
   */
  async handleDamageReduction(params, context) {
    const { amount = 2, conditions } = params;
    
    // 检查减免条件
    if (conditions) {
      const meetsCondition = await this.checkConditions(conditions, context);
      if (!meetsCondition) {
        return {
          type: 'damage_reduction',
          success: false,
          reason: 'conditions_not_met'
        };
      }
    }
    
    // 应用减免
    if (context.damageContext) {
      context.damageContext.addStep({
        source: 'effect',
        type: 'damage_reduction',
        value: -amount,
        description: `抗性: -${amount}伤害`
      });
    }
    
    return {
      type: 'damage_reduction',
      success: true,
      reduction: amount
    };
  }

  /**
   * 决斗判定
   */
  async handleDuelResolution(params, context) {
    const attackerRoll = this.rollDice(6);
    const defenderRoll = this.rollDice(6);
    
    const winner = attackerRoll > defenderRoll ? 'attacker' : 
                   defenderRoll > attackerRoll ? 'defender' : 'tie';
    
    return {
      type: 'duel_resolution',
      success: true,
      attackerRoll,
      defenderRoll,
      winner,
      result: winner === 'attacker' ? 'attacker_wins' :
              winner === 'defender' ? 'defender_wins' : 'draw'
    };
  }

  /**
   * 幸运判定
   */
  async handleLuckResolution(params, context) {
    const roll = this.rollDice(6);
    const success = roll >= 5; // 5-6 成功
    
    return {
      type: 'luck_resolution',
      success: true,
      roll,
      lucky: success,
      result: success ? 'gain_extra_action' : 'no_effect'
    };
  }

  /**
   * 抢夺判定
   */
  async handlePlunderAttempt(params, context) {
    const { dice } = params;
    
    if (dice?.required) {
      const roll = this.rollDice(dice.sides || 6);
      const targetWeaponAtk = context.target?.left_hand_melee || 
                              context.target?.left_hand_shooting || 0;
      
      // 掷骰 > 3 且目标武器攻击值 > 5
      if (roll > 3 && targetWeaponAtk > 5) {
        return {
          type: 'plunder_attempt',
          success: true,
          roll,
          result: 'weapon_seized',
          weapon: {
            name: context.target?.left_hand_name,
            attack: targetWeaponAtk
          }
        };
      }
      
      return {
        type: 'plunder_attempt',
        success: false,
        roll,
        result: 'plunder_failed'
      };
    }
    
    return {
      type: 'plunder_attempt',
      success: false,
      reason: 'no_dice_config'
    };
  }

  /**
   * 给予额外回合
   */
  async handleGrantExtraTurn(params, context) {
    const { unitId } = params;
    const targetUnit = unitId ? context.getUnit(unitId) : context.attacker;
    
    if (!targetUnit) {
      return {
        type: 'grant_extra_turn',
        success: false,
        reason: 'unit_not_found'
      };
    }
    
    // 标记额外回合
    targetUnit.extraTurn = true;
    
    return {
      type: 'grant_extra_turn',
      success: true,
      unitId: targetUnit.id,
      result: 'extra_turn_granted'
    };
  }

  /**
   * 阻挡移动（联防）
   */
  async handleBlockMovement(params, context) {
    const { blocked, resolution } = params;
    
    return {
      type: 'block_movement',
      success: true,
      blocked: true,
      directions: blocked?.directions,
      resolution: resolution || 'must_route_around',
      interrupt: true // 阻挡成功中断移动
    };
  }

  /**
   * 援助选择
   */
  async handleAssistChoice(params, context) {
    const { allies, maxHelpers = 1 } = params;
    
    // 获取可援助的友军
    const availableAllies = context.allyUnits?.filter(u => 
      u.faction === context.defender?.faction && 
      u.hp > 0 &&
      u.id !== context.defender?.id
    ) || [];
    
    if (availableAllies.length === 0) {
      return {
        type: 'assist_choice',
        success: false,
        reason: 'no_available_allies'
      };
    }
    
    return {
      type: 'assist_choice',
      success: true,
      availableAllies: availableAllies.map(u => ({ id: u.id, name: u.name })),
      maxHelpers,
      requiresUserChoice: true // 需要用户选择
    };
  }

  /**
   * 生成物品（空投）
   */
  async handleSpawnItems(params, context) {
    const { items, position, radius = 0 } = params;
    
    const spawnedItems = [];
    
    if (Array.isArray(items)) {
      for (const item of items) {
        spawnedItems.push({
          type: item.type,
          name: item.name,
          position: position || this.randomPosition(radius),
          ...item.stats
        });
      }
    }
    
    return {
      type: 'spawn_items',
      success: true,
      items: spawnedItems,
      count: spawnedItems.length
    };
  }

  /**
   * 应用Buff
   */
  async handleApplyBuff(params, context) {
    const { buffType, duration = 1, value = 0 } = params;
    const targetUnit = context.target || context.unit;
    
    if (!targetUnit) {
      return {
        type: 'apply_buff',
        success: false,
        reason: 'target_not_found'
      };
    }
    
    // 使用 BuffManager 添加 Buff
    const buff = buffManager.addBuff(targetUnit, {
      type: buffType,
      duration,
      value,
      source: context.source
    });
    
    return {
      type: 'apply_buff',
      success: true,
      buff,
      target: targetUnit.id
    };
  }

  /**
   * 移除Buff
   */
  async handleRemoveBuff(params, context) {
    const { buffType } = params;
    const targetUnit = context.target || context.unit;
    
    if (!targetUnit) {
      return {
        type: 'remove_buff',
        success: false,
        reason: 'target_not_found'
      };
    }
    
    const removed = buffManager.removeBuff(targetUnit, buffType);
    
    return {
      type: 'remove_buff',
      success: removed,
      buffType,
      target: targetUnit.id
    };
  }

  /**
   * 修改属性
   */
  async handleModifyStat(params, context) {
    const { stat, value, operation = 'add' } = params;
    const targetUnit = context.target || context.unit;
    
    if (!targetUnit) {
      return {
        type: 'modify_stat',
        success: false,
        reason: 'target_not_found'
      };
    }
    
    const oldValue = targetUnit[stat] || 0;
    let newValue;
    
    switch (operation) {
      case 'add': newValue = oldValue + value; break;
      case 'subtract': newValue = oldValue - value; break;
      case 'multiply': newValue = oldValue * value; break;
      case 'set': newValue = value; break;
      default: newValue = oldValue;
    }
    
    targetUnit[stat] = newValue;
    
    return {
      type: 'modify_stat',
      success: true,
      stat,
      oldValue,
      newValue,
      operation
    };
  }

  /**
   * 自定义效果
   */
  async handleCustomEffect(params, context) {
    const { execute } = params;
    
    if (typeof execute === 'function') {
      return await execute(params, context);
    }
    
    return {
      type: 'custom',
      success: false,
      reason: 'no_execute_function'
    };
  }

  /**
   * 掷骰
   */
  rollDice(sides = 6) {
    return Math.floor(Math.random() * sides) + 1;
  }

  /**
   * 随机位置
   */
  randomPosition(radius = 0) {
    if (radius === 0) return { x: 0, y: 0 };
    
    const angle = Math.random() * Math.PI * 2;
    const distance = Math.random() * radius;
    
    return {
      x: Math.round(Math.cos(angle) * distance),
      y: Math.round(Math.sin(angle) * distance)
    };
  }

  /**
   * 注册自定义效果处理器
   */
  registerHandler(type, handler) {
    this.handlers[type] = handler;
  }

  /**
   * 获取可用效果类型
   */
  getAvailableTypes() {
    return Object.keys(this.handlers);
  }

  // ============================================================
  // 隐身相关效果处理器
  // ============================================================

  /**
   * 进入隐身状态
   */
  async handleEnterStealth(params, context) {
    const { stealthDuration, revealTriggers } = params;
    const unit = context.unit || context.attacker;

    if (!unit) {
      return {
        type: 'enter_stealth',
        success: false,
        reason: 'unit_not_found'
      };
    }

    // 检查是否已在隐身状态
    if (unit.stealth === true) {
      return {
        type: 'enter_stealth',
        success: true,
        result: 'already_stealth',
        unitId: unit.id
      };
    }

    // 进入隐身状态
    unit.stealth = true;
    unit.stealthData = {
      enteredAt: Date.now(),
      duration: stealthDuration,
      revealTriggers: revealTriggers || ['attack', 'move', 'skill']
    };

    return {
      type: 'enter_stealth',
      success: true,
      result: 'stealth_entered',
      unitId: unit.id,
      stealthData: unit.stealthData
    };
  }

  /**
   * 退出隐身状态
   */
  async handleExitStealth(params, context) {
    const { reason } = params;
    const unit = context.unit || context.attacker || context.movingUnit;

    if (!unit) {
      return {
        type: 'exit_stealth',
        success: false,
        reason: 'unit_not_found'
      };
    }

    // 检查是否在隐身状态
    if (unit.stealth !== true) {
      return {
        type: 'exit_stealth',
        success: true,
        result: 'not_stealth',
        unitId: unit.id
      };
    }

    // 记录暴露原因
    const previousState = { ...unit.stealthData };

    // 退出隐身状态
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
   * 隐身攻击加成
   */
  async handleStealthAttackBonus(params, context) {
    const { multiplier = 1.5, bonusDice } = params;

    if (!context.damageContext) {
      return {
        type: 'stealth_attack_bonus',
        success: false,
        reason: 'no_damage_context'
      };
    }

    let bonus = 0;
    let bonusType = 'multiplier';

    // 基础乘算加成
    if (multiplier && multiplier > 1) {
      const baseDamage = context.damageContext.getTotal() || 0;
      bonus = Math.floor(baseDamage * (multiplier - 1));
      bonusType = 'multiplier';
    }

    // 额外骰子加成
    if (bonusDice?.required) {
      const roll = this.rollDice(bonusDice.sides || 6);
      if (roll >= (bonusDice.threshold || 5)) {
        bonus += roll;
        bonusType = 'dice_bonus';
      }

      return {
        type: 'stealth_attack_bonus',
        success: true,
        roll,
        bonus,
        bonusType,
        multiplier,
        description: `奇袭: 伤害${multiplier}x + 掷骰${roll}`
      };
    }

    // 应用到伤害管道
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
      bonusType,
      multiplier,
      description: `奇袭: 伤害${multiplier}x`
    };
  }

  /**
   * 隐身闪避判定
   */
  async handleStealthEvasion(params, context) {
    const { evasionChance = 0.5, dice } = params;

    let evasionRoll = Math.random();
    let evaded = evasionRoll < evasionChance;

    // 如果配置了骰子，使用骰子
    if (dice?.required) {
      const roll = this.rollDice(dice.sides || 6);
      evaded = roll >= (dice.threshold || 3);

      return {
        type: 'stealth_evasion',
        success: true,
        roll,
        threshold: dice.threshold || 3,
        evaded,
        result: evaded ? 'attack_evaded' : 'attack_hits',
        description: evaded ? '伪装生效: 闪避攻击' : '伪装失效: 攻击命中'
      };
    }

    return {
      type: 'stealth_evasion',
      success: true,
      evasionChance,
      evaded,
      result: evaded ? 'attack_evaded' : 'attack_hits',
      description: evaded ? '伪装生效: 闪避攻击' : '伪装失效: 攻击命中'
    };
  }
};

// 单例导出
module.exports = new EffectExecutor();
