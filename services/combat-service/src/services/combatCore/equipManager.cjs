/**
 * 装备管理器 - EquipmentManager
 * 负责处理武器加成和防具减伤
 */

class EquipmentManager {
  
  /**
   * 获取攻击方武器总加成
   * @param {Object} unit - 单位
   * @param {string} attackType - 攻击类型: 'melee' | 'ranged'
   * @returns {Object} { bonus, sources[] }
   */
  static getWeaponBonus(unit, attackType) {
    let totalBonus = 0;
    const sources = [];

    // 左手武器
    if (unit.left_hand_type === 'weapon') {
      const bonus = attackType === 'melee' 
        ? (unit.left_hand_melee || 0)
        : (unit.left_hand_ranged || 0);
      totalBonus += bonus;
      sources.push({
        slot: 'left_hand',
        type: unit.left_hand_type,
        bonus: bonus,
        note: `左手${attackType === 'melee' ? '格斗' : '射击'}武器`
      });
    }

    // 右手武器
    if (unit.right_hand_type === 'weapon') {
      const bonus = attackType === 'melee' 
        ? (unit.right_hand_melee || 0)
        : (unit.right_hand_ranged || 0);
      totalBonus += bonus;
      sources.push({
        slot: 'right_hand',
        type: unit.right_hand_type,
        bonus: bonus,
        note: `右手${attackType === 'melee' ? '格斗' : '射击'}武器`
      });
    }

    return { bonus: totalBonus, sources };
  }

  /**
   * 获取防御方防具总减伤
   * @param {Object} unit - 单位
   * @returns {Object} { reduction, sources[] }
   */
  static getArmorDefense(unit) {
    let totalReduction = 0;
    const sources = [];

    // 左手防具
    if (unit.left_hand_type === 'armor') {
      const defense = unit.left_hand_defense || 3;
      const durability = unit.left_hand_durability || 0;
      totalReduction += defense;
      sources.push({
        slot: 'left_hand',
        type: unit.left_hand_type,
        defense: defense,
        durability: durability,
        note: '左手防具'
      });
    }

    // 右手防具
    if (unit.right_hand_type === 'armor') {
      const defense = unit.right_hand_defense || 3;
      const durability = unit.right_hand_durability || 0;
      totalReduction += defense;
      sources.push({
        slot: 'right_hand',
        type: unit.right_hand_type,
        defense: defense,
        durability: durability,
        note: '右手防具'
      });
    }

    return { reduction: totalReduction, sources };
  }

  /**
   * 获取单位手持物品信息
   * @param {Object} unit - 单位
   * @returns {Object} { left: {...}, right: {...} }
   */
  static getHandEquipment(unit) {
    return {
      left: {
        type: unit.left_hand_type,
        melee: unit.left_hand_melee,
        ranged: unit.left_hand_ranged,
        defense: unit.left_hand_defense,
        durability: unit.left_hand_durability,
        name: unit.left_hand_name
      },
      right: {
        type: unit.right_hand_type,
        melee: unit.right_hand_melee,
        ranged: unit.right_hand_ranged,
        defense: unit.right_hand_defense,
        durability: unit.right_hand_durability,
        name: unit.right_hand_name
      }
    };
  }

  /**
   * 检查装备是否有效（耐久度 > 0）
   * @param {Object} unit - 单位
   * @returns {boolean}
   */
  static hasValidEquipment(unit) {
    const leftValid = unit.left_hand_type !== 'armor' || (unit.left_hand_durability || 0) > 0;
    const rightValid = unit.right_hand_type !== 'armor' || (unit.right_hand_durability || 0) > 0;
    return leftValid && rightValid;
  }

  /**
   * 消耗防具耐久度
   * @param {Object} unit - 单位
   * @returns {Object} 消耗结果 { consumed: [], destroyed: [] }
   */
  static consumeArmorDurability(unit) {
    const result = { consumed: [], destroyed: [] };

    // 左手防具
    if (unit.left_hand_type === 'armor' && (unit.left_hand_durability || 0) > 0) {
      unit.left_hand_durability--;
      result.consumed.push({ slot: 'left_hand', remaining: unit.left_hand_durability });
      
      if (unit.left_hand_durability <= 0) {
        unit.left_hand_type = null;
        result.destroyed.push({ slot: 'left_hand' });
      }
    }

    // 右手防具
    if (unit.right_hand_type === 'armor' && (unit.right_hand_durability || 0) > 0) {
      unit.right_hand_durability--;
      result.consumed.push({ slot: 'right_hand', remaining: unit.right_hand_durability });
      
      if (unit.right_hand_durability <= 0) {
        unit.right_hand_type = null;
        result.destroyed.push({ slot: 'right_hand' });
      }
    }

    return result;
  }

  /**
   * 获取武器攻击类型描述
   * @param {Object} unit - 单位
   * @returns {string} 'melee' | 'ranged' | 'both' | 'none'
   */
  static getWeaponAttackType(unit) {
    const left = unit.left_hand_type;
    const right = unit.right_hand_type;

    const leftMelee = left === 'weapon' && (unit.left_hand_melee || 0) > 0;
    const leftRanged = left === 'weapon' && (unit.left_hand_ranged || 0) > 0;
    const rightMelee = right === 'weapon' && (unit.right_hand_melee || 0) > 0;
    const rightRanged = right === 'weapon' && (unit.right_hand_ranged || 0) > 0;

    const hasMelee = leftMelee || rightMelee;
    const hasRanged = leftRanged || rightRanged;

    if (hasMelee && hasRanged) return 'both';
    if (hasMelee) return 'melee';
    if (hasRanged) return 'ranged';
    return 'none';
  }
}

module.exports = EquipmentManager;
