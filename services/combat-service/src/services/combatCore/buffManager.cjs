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
