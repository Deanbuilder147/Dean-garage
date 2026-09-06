// ★ 2026-08-09 修复：hexDistance 为 (q1,r1,q2,r2) 四参签名，本文件以坐标对象调用，
//   原写法 hexDistance(a,b) 恒返回 NaN（距离条件静默失效）。改用对象签名版 hexDistanceCoord。
const { hexDistanceCoord } = require('./hexKey.cjs');

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
  /**
   * ★ Phase 4A: 评估词条 trigger.condition（主动/被动共用）
   * 支持 hp_below_pct / distance_less_than / distance_greater_than。
   * 主体(subject): 默认取被作用单位 refs.target；无则取 refs.unit。
   *   - 主动技能: { unit: 施法者, target: 被作用单位 } → 以目标为主体（契合"攻击X%血量目标"语义）
   *   - 被动技能: { unit, target: unit } → 以自身为主体
   * @param {object} condition
   * @param {object} refs - { unit, target, nearestEnemyDist? }
   * @returns {boolean} true=条件满足(放行)
   */
  /**
   * B.7 条件门控 + OR/AND 路由。
   * - 支持嵌套子条件数组 `condition.conditions`（每项仍是 condition 对象），按
   *   `condition.match_mode`('all'=AND 默认 / 'any'=OR) 聚合。
   * - 扁平字段（hp_below_pct / distance_*）按 match_mode 聚合（默认 AND，向后兼容存量）。
   * - 单勾选菜单多条件 + OR 框 → match_mode:'any' = 任一符合即触发。
   */
  evaluateTriggerCondition(condition, refs = {}) {
    if (!condition || typeof condition !== 'object' || !Object.keys(condition).length) return true;
    const matchMode = condition.match_mode === 'any' ? 'any' : 'all';

    // 嵌套子条件数组
    if (Array.isArray(condition.conditions) && condition.conditions.length) {
      const sub = condition.conditions.map((c) => this.evaluateTriggerCondition(c, refs));
      return matchMode === 'any' ? sub.some(Boolean) : sub.every(Boolean);
    }

    const { unit, target, nearestEnemyDist } = refs;
    const subject = (target && (target.hp != null || target.current_hp != null || (target.currentStats && target.currentStats.hp != null))) ? target : unit;
    const checks = [];

    if (typeof condition.hp_below_pct === 'number') {
      if (!subject) return false;
      const maxHp = subject.maxHp || (subject.currentStats && subject.currentStats.maxHp) || subject.max_hp || 100;
      const hp = subject.hp != null ? subject.hp
        : (subject.currentStats && subject.currentStats.hp != null ? subject.currentStats.hp
          : (subject.current_hp != null ? subject.current_hp : null));
      if (hp == null) return false;
      const pct = maxHp > 0 ? (hp / maxHp) * 100 : 100;
      checks.push(pct < condition.hp_below_pct);
    }

    if (typeof condition.distance_less_than === 'number' || typeof condition.distance_greater_than === 'number') {
      const d = (typeof nearestEnemyDist === 'number') ? nearestEnemyDist : this._hexDist(unit, target);
      if (d == null) return false;
      if (typeof condition.distance_less_than === 'number') checks.push(d <= condition.distance_less_than);
      if (typeof condition.distance_greater_than === 'number') checks.push(d >= condition.distance_greater_than);
    }

    if (!checks.length) return true; // 无具体字段 → 放行（与存量行为一致）
    return matchMode === 'any' ? checks.some(Boolean) : checks.every(Boolean);
  }

  _hexDist(a, b) {
    if (!a || !b || a.q == null || b.q == null) return null;
    try { return hexDistanceCoord(a, b); } catch (e) { return null; }
  }

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
