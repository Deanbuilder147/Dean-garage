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
