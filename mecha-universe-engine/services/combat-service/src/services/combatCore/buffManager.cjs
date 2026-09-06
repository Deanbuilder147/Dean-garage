/**
 * Buff管理器 - BuffManager
 * 负责处理战斗中的临时增益效果
 *
 * v5：兼容旧标量 API（attack_buff/defense_buff/mobility_buff + *_turns），
 * 并新增结构化 statusEffects 列表管理（条件触发 + 次数/回合消耗）。
 */

const { matchTrigger } = require('./conditionTrigger.cjs');

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

  // ============================================================
  // v5 结构化 statusEffects API（条件触发 + 次数/回合消耗）
  // ============================================================

  /**
   * 由词条通用字段（uf）构造一个结构化 statusEffects 实例。
   * @param {string} skillType - 词条库 key（如 'assist'）
   * @param {Object} uf - _getUniversalFields 产出的通用字段
   * @returns {Object} statusEffects 实例
   */
  static buildStatusInstance(skillType, uf, expiryPhase) {
    const c = uf && uf.consumption;
    let consumption;
    if (c && c.mode === 'duration' && c.duration != null) {
      consumption = { mode: 'duration', remaining: c.duration, max: c.duration };
    } else if (c && c.count != null) {
      consumption = { mode: c.mode || 'counter', remaining: c.count, max: c.count };
    } else {
      consumption = { mode: 'counter', remaining: 1, max: 1 };
    }

    const trigger = (uf && uf.trigger && typeof uf.trigger === 'object' && uf.trigger.type)
      ? uf.trigger
      : { type: 'unconditional' };

    const appliesOn = (uf && uf.applies_on) || 'attack';
    const actionType = (uf && uf.modifier) || 'attack_buff';
    const value = Number((uf && (uf.base_damage || uf.bonus || uf.value || uf.reduction)) || 0);
    // ★ §8.9②：结算相位（默认 turn_end；被动 on_turn_start Buff 用 turn_start 避免秒失效）
    const expiry_phase = expiryPhase || (uf && uf.expiry_phase) || 'turn_end';

    return {
      id: 'st_' + Date.now().toString(36) + '_' + skillType + '_' + Math.random().toString(36).slice(2, 7),
      source: skillType,
      label: (uf && (uf.label || uf.name)) || skillType,
      action_type: actionType,
      value,
      consumption,
      trigger,
      applies_on: appliesOn,
      expiry_phase,
    };
  }

  /**
   * 将一个 statusEffects 实例写入单位（去重：同 id 不重复添加）。
   */
  static addStatus(unit, instance) {
    if (!unit) return;
    if (!Array.isArray(unit.statusEffects)) unit.statusEffects = [];
    if (instance && !unit.statusEffects.some(s => s && s.id === instance.id)) {
      unit.statusEffects.push(instance);
    }
  }

  /**
   * 按「生效方向(applies_on) + 条件触发」过滤出当前被命中的 statusEffects。
   * @param {Object} unit - 单位（含 statusEffects 数组）
   * @param {Object} ctx - { attack_type, damage_kind }
   * @param {string} appliesOn - 'attack' | 'defense' | 'attack_debuff_target'
   * @returns {Object[]}
   */
  static getMatchingStatus(unit, ctx, appliesOn) {
    if (!unit || !Array.isArray(unit.statusEffects)) return [];
    return unit.statusEffects.filter(s => s && s.applies_on === appliesOn && matchTrigger(s, ctx));
  }

  /**
   * 扣减单个 status 的 counter（remaining--），归零则移除。duration 模式不在此扣减。
   */
  static consumeStatus(unit, id) {
    if (!unit || !Array.isArray(unit.statusEffects) || !id) return;
    const idx = unit.statusEffects.findIndex(s => s && s.id === id);
    if (idx < 0) return;
    const s = unit.statusEffects[idx];
    if (s.consumption && s.consumption.mode === 'counter') {
      s.consumption.remaining = (s.consumption.remaining || 1) - 1;
      if (s.consumption.remaining <= 0) unit.statusEffects.splice(idx, 1);
    }
  }

  /**
   * 批量扣减（供调用方拿到 triggered_status 列表后调用）。
   */
  static consumeStatuses(unit, ids) {
    if (!unit || !Array.isArray(unit.statusEffects) || !Array.isArray(ids)) return;
    for (const id of ids) BuffManager.consumeStatus(unit, id);
  }

  /**
   * 回合相位结算：扣减 duration 类 status 的 remaining，归零则移除。
   * ★ §8.9②：按 expiry_phase 相位过滤——仅扣减与当前相位匹配的 status。
   *   - 'turn_end'（默认）：回合结束时递减（主动技默认）。
   *   - 'turn_start'：下一回合开始时递减（被动 on_turn_start Buff 默认，避免「刚挂上就秒失效」）。
   * @param {Object} unit
   * @param {string} phase - 'turn_end' | 'turn_start'（默认 'turn_end'，向后兼容）
   */
  static tickStatus(unit, phase = 'turn_end') {
    if (!unit || !Array.isArray(unit.statusEffects)) return;
    for (let i = unit.statusEffects.length - 1; i >= 0; i--) {
      const s = unit.statusEffects[i];
      if (!s || !s.consumption || s.consumption.mode !== 'duration') continue;
      if ((s.expiry_phase || 'turn_end') !== phase) continue; // 仅扣减匹配相位的 status
      s.consumption.remaining = (s.consumption.remaining || 1) - 1;
      if (s.consumption.remaining <= 0) unit.statusEffects.splice(i, 1);
    }
  }

  /** ★ §8.9②：回合开始相位结算（递减 expiry_phase='turn_start' 的 status）。 */
  static tickStatusStart(unit) {
    BuffManager.tickStatus(unit, 'turn_start');
  }

  // ============================================================
  // B.6 属性修正栈（stat_modifier）+ 管线纯函数（2026-08-23，档位 X）
  // 规范：六段式画布 UI 规范 · 动作原子分层模型
  // 数据契约 StatModifierInstance：
  //   { type:'stat_modifier', key, stat_type, op:'add'|'percent'|'multiplier',
  //     value, duration, consumption:{mode:'duration',remaining,max},
  //     undispellable:false, source }
  // 叠加三规则：同 key 同 value 同 op → 续时长；异 → 独立计时压栈。
  // 算值：base + Σadd → ×(1+Σpercent) → ×Πmultiplier（固定顺序，天然支持规则3）。
  // ============================================================

  /**
   * 向单位 statusEffects 压入/续期一个 stat_modifier 实例（实现叠加三规则）。
   * @param {Object} unit
   * @param {Object} mod - 完整 StatModifierInstance（不含 consumption 时自动补）
   */
  static addStatModifier(unit, mod) {
    if (!unit) return;
    if (!Array.isArray(unit.statusEffects)) unit.statusEffects = [];
    const key = mod.key;
    const op = mod.op || 'add';
    const value = Number(mod.value || 0);
    // 规则 1：同 key 同 value 同 op → 叠加时效（不新增实例）
    const matched = unit.statusEffects.find(
      e => e && e.type === 'stat_modifier' && e.key === key
        && Number(e.value || 0) === value && (e.op || 'add') === op
    );
    if (matched) {
      const dur = Number(mod.duration || (mod.consumption && mod.consumption.max) || 0);
      matched.consumption = matched.consumption || { mode: 'duration', remaining: 0, max: dur };
      matched.consumption.remaining = (matched.consumption.remaining || 0) + dur;
      matched.consumption.max = Math.max(matched.consumption.max || 0, matched.consumption.remaining);
      return matched;
    }
    // 规则 2：异 value/异 op → 独立计时压栈
    const duration = Number(mod.duration || 0);
    const instance = {
      type: 'stat_modifier',
      key,
      stat_type: mod.stat_type,
      op,
      value,
      duration,
      undispellable: !!mod.undispellable,
      source: mod.source || 'stat_mod',
      expiry_phase: mod.expiry_phase || 'turn_end',
      consumption: { mode: 'duration', remaining: duration, max: duration },
    };
    unit.statusEffects.push(instance);
    return instance;
  }

  /**
   * 动态算值纯函数（管线）：对任意 stat 按固定顺序求值，百分比/倍率天然基于当前已生效值。
   * 不回写 currentStats（档位 X：消费侧按需调用本函数取值，避免全局收口回归风险）。
   * @param {Object} unit
   * @param {string} statType
   * @returns {number}
   */
  static calculateEffectiveStat(unit, statType) {
    if (!unit) return 0;
    const base = Number(
      (unit.baseStats && unit.baseStats[statType] != null) ? unit.baseStats[statType]
        : (unit.currentStats && unit.currentStats[statType] != null) ? unit.currentStats[statType]
          : 0
    );
    const mods = (unit.statusEffects || []).filter(
      e => e && e.type === 'stat_modifier' && e.stat_type === statType
        && e.consumption && Number(e.consumption.remaining) > 0
    );
    let addSum = 0, pctSum = 0, mulProd = 1;
    for (const m of mods) {
      const op = m.op || 'add';
      const v = Number(m.value || 0);
      if (op === 'add') addSum += v;
      else if (op === 'percent') pctSum += v;
      else if (op === 'multiplier') mulProd *= v;
    }
    // 规则 3 固定顺序：base + 固定值累加 → 百分比叠加 → 倍率叠乘
    return (base + addSum) * (1 + pctSum) * mulProd;
  }

  /** 对外便捷入口（语义同 calculateEffectiveStat）。 */
  static getEffectiveStat(unit, statType) {
    return BuffManager.calculateEffectiveStat(unit, statType);
  }
}

module.exports = BuffManager;
