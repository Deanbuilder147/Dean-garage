/**
 * ConditionEvaluator - 条件评估器
 * 
 * 职责:
 * 1. 评估词条触发条件
 * 2. 支持复杂条件组合 (AND/OR/NOT)
 * 3. 提供预置条件检查器
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
  }

  /**
   * 评估条件组
   * @param {object} conditions - 条件定义
   * @param {object} context - 执行上下文
   * @returns {boolean}
   */
  evaluate(conditions, context) {
    if (!conditions) return true;
    
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
      // 有 ref 时，比较 check 的值和 ref 的值
      // 如: armor_resistance_type == attack_damage_type
      // 直接从上下文获取字段值，不调用检查器
      const checkValue = this.getValueFromContext(context, check);
      const refValue = this.getValueFromContext(context, ref);
      return this.compare(checkValue, refValue, operator);
    }
    
    if (!checker) {
      console.warn(`[ConditionEvaluator] 未知检查项: ${check}`);
      // 尝试从上下文直接比较
      const actualValue = this.getValueFromContext(context, check);
      return this.compare(actualValue, value, operator);
    }
    
    // 使用检查器
    return checker(context, value, operator);
  }

  /**
   * 数值比较
   */
  compare(a, b, operator) {
    // 处理 undefined
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
    
    // 字段名映射 (ref 引用可能使用不同的字段名)
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
