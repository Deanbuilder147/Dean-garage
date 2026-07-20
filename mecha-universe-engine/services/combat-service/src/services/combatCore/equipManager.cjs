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
