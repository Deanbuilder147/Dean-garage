/**
 * UnitTypeManager - 单位类型管理器
 * 处理陆地/空中/海上单位的移动和克制关系
 * 
 * 单位类型:
 * - land (陆地): 只能在平原、山地、森林、基地、废墟移动
 * - air (空中): 可以在所有地形移动，无视地形障碍
 * - sea (海上): 只能在水域移动
 * 
 * 克制关系:
 * - 地对空：远程射击 -1 (难以命中空中目标)
 * - 空对地：远程射击 +1 (俯冲攻击优势)
 * - 地对海：远程射击 +1 (固定靶优势)
 * - 海对陆：无法攻击陆地单位
 * - 空对海：远程射击 +2 (完全制空权)
 */

class UnitTypeManager {
  
  /**
   * 单位移动类型
   */
  static MOVE_TYPES = {
    LAND: 'land',
    AIR: 'air',
    SEA: 'sea'
  };
  
  /**
   * 地形可通行性
   */
  static TERRAIN_PASSABLE = {
    land: ['plain', 'mountain', 'forest', 'base', 'ruin', 'lunar', 'crater'],
    air: ['plain', 'mountain', 'forest', 'base', 'ruin', 'lunar', 'crater', 'water', 'lava'],
    sea: ['water']
  };
  
  /**
   * 地形移动消耗修正
   */
  static TERRAIN_MOVE_COST = {
    land: {
      plain: 1,
      mountain: 2,
      forest: 1,
      base: 1,
      ruin: 2,
      lunar: 1,
      crater: 2,
      water: 999, // 不可通行
      lava: 999  // 不可通行
    },
    air: {
      plain: 1,
      mountain: 1,
      forest: 1,
      base: 1,
      ruin: 1,
      lunar: 1,
      crater: 1,
      water: 1,
      lava: 2 // 高温影响
    },
    sea: {
      plain: 999,
      mountain: 999,
      forest: 999,
      base: 999,
      ruin: 999,
      lunar: 999,
      crater: 999,
      water: 1,
      lava: 999 // 无法在岩浆移动
    }
  };
  
  /**
   * 攻击克制修正
   */
  static ATTACK_MODIFIERS = {
    // 攻击方类型 -> 防御方类型 -> 修正值
    land: {
      land: 0,
      air: -1,   // 地对空：难以命中
      sea: +1    // 地对海：固定靶优势
    },
    air: {
      land: 0,
      air: 0,
      sea: +2    // 空对海：完全制空权
    },
    sea: {
      land: -999, // 海对陆：无法攻击
      air: -2,    // 海对空：极度劣势
      sea: 0
    }
  };
  
  /**
   * 防御克制修正
   */
  static DEFENSE_MODIFIERS = {
    // 防御方类型 -> 攻击方类型 -> 闪避修正
    land: {
      land: 0,
      air: +1,   // 地对空：容易闪避 (空中攻击轨迹明显)
      sea: 0
    },
    air: {
      land: -1,  // 空对地：难以闪避 (俯冲攻击突然)
      air: 0,
      sea: -1    // 空对海：难以闪避
    },
    sea: {
      land: 0,
      air: +2,   // 海对空：容易闪避 (空中目标明显)
      sea: 0
    }
  };
  
  /**
   * 检查单位是否可以进入某地形
   * @param {string} moveType - 单位移动类型：'land' | 'air' | 'sea'
   * @param {string} terrain - 地形类型
   * @returns {boolean}
   */
  static canMoveTo(moveType, terrain) {
    const passable = this.TERRAIN_PASSABLE[moveType];
    if (!passable) return false;
    return passable.includes(terrain);
  }
  
  /**
   * 获取地形移动消耗
   * @param {string} moveType - 单位移动类型
   * @param {string} terrain - 地形类型
   * @returns {number} 移动消耗 (999 表示不可通行)
   */
  static getMoveCost(moveType, terrain) {
    const costs = this.TERRAIN_MOVE_COST[moveType];
    if (!costs) return 999;
    return costs[terrain] || 999;
  }
  
  /**
   * 获取攻击克制修正
   * @param {string} attackerType - 攻击方类型
   * @param {string} defenderType - 防御方类型
   * @returns {number} 攻击修正值
   */
  static getAttackModifier(attackerType, defenderType) {
    const modifiers = this.ATTACK_MODIFIERS[attackerType];
    if (!modifiers) return 0;
    return modifiers[defenderType] || 0;
  }
  
  /**
   * 获取防御闪避修正
   * @param {string} defenderType - 防御方类型
   * @param {string} attackerType - 攻击方类型
   * @returns {number} 闪避修正值
   */
  static getDefenseModifier(defenderType, attackerType) {
    const modifiers = this.DEFENSE_MODIFIERS[defenderType];
    if (!modifiers) return 0;
    return modifiers[attackerType] || 0;
  }
  
  /**
   * 检查攻击是否有效
   * @param {string} attackerType - 攻击方类型
   * @param {string} defenderType - 防御方类型
   * @returns {Object} { valid: boolean, reason: string }
   */
  static canAttack(attackerType, defenderType) {
    const modifier = this.getAttackModifier(attackerType, defenderType);
    
    if (modifier <= -999) {
      return {
        valid: false,
        reason: '无法攻击该类型单位'
      };
    }
    
    return {
      valid: true,
      reason: '可以攻击'
    };
  }
  
  /**
   * 计算完整的类型克制效果
   * @param {Object} attacker - 攻击方单位 (包含 move_type)
   * @param {Object} defender - 防御方单位 (包含 move_type)
   * @returns {Object} 完整的克制效果
   */
  static calculateTypeEffectiveness(attacker, defender) {
    const attackerType = attacker.move_type || 'land';
    const defenderType = defender.move_type || 'land';
    
    const attackMod = this.getAttackModifier(attackerType, defenderType);
    const defenseMod = this.getDefenseModifier(defenderType, attackerType);
    const canAttackResult = this.canAttack(attackerType, defenderType);
    
    return {
      attacker_type: attackerType,
      defender_type: defenderType,
      attack_modifier: attackMod,
      defense_modifier: defenseMod,
      can_attack: canAttackResult.valid,
      reason: canAttackResult.reason,
      advantage: attackMod > 0 ? 'advantage' : attackMod < 0 ? 'disadvantage' : 'neutral',
      description: this.getTypeDescription(attackerType, defenderType)
    };
  }
  
  /**
   * 获取克制关系描述
   * @param {string} attackerType
   * @param {string} defenderType
   * @returns {string}
   */
  static getTypeDescription(attackerType, defenderType) {
    const descriptions = {
      'land_land': '同类型单位，无克制',
      'land_air': '地对空：空中目标难以命中，攻击 -1',
      'land_sea': '地对海：海面固定靶，攻击 +1',
      'air_land': '空对地：俯冲攻击，无修正',
      'air_air': '空中缠斗，无克制',
      'air_sea': '空对海：完全制空权，攻击 +2',
      'sea_land': '海对陆：无法攻击陆地目标',
      'sea_air': '海对空：极度劣势，攻击 -2',
      'sea_sea': '海战，无克制'
    };
    
    const key = `${attackerType}_${defenderType}`;
    return descriptions[key] || '未知克制关系';
  }
  
  /**
   * 验证单位移动路径是否合法
   * @param {string} moveType - 单位移动类型
   * @param {Array} path - 路径数组 [{q, r, terrain}, ...]
   * @param {number} maxMovement - 最大移动力
   * @returns {Object} { valid: boolean, totalCost: number, blockedAt: number|null }
   */
  static validateMovement(moveType, path, maxMovement) {
    let totalCost = 0;
    
    for (let i = 0; i < path.length; i++) {
      const cell = path[i];
      const cost = this.getMoveCost(moveType, cell.terrain);
      totalCost += cost;
      
      if (cost >= 999) {
        return {
          valid: false,
          totalCost: totalCost,
          blockedAt: i,
          reason: `无法通过 ${cell.terrain} 地形`
        };
      }
      
      if (totalCost > maxMovement) {
        return {
          valid: false,
          totalCost: totalCost,
          blockedAt: i,
          reason: '移动力不足'
        };
      }
    }
    
    return {
      valid: true,
      totalCost: totalCost,
      blockedAt: null,
      reason: '路径合法'
    };
  }
}

module.exports = UnitTypeManager;
