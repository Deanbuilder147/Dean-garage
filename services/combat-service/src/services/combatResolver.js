/**
 * 战斗结算系统
 * 基于战斗模拟系统2.0alpha规则
 * 增强版：包含阵营技能、奇袭系统、伤害计算
 * 
 * 重构说明 (2026-04-15):
 * - 伤害计算已迁移到 DamagePipe 模块
 * - Buff管理已迁移到 BuffManager 模块
 * - 装备管理已迁移到 EquipmentManager 模块
 */

import { DamagePipe, BuffManager, EquipmentManager } from './combatCore/index.cjs';

export class CombatResolver {
  
  /**
   * 解析攻击 (重构版 - 使用 DamagePipe)
   * @param {Object} attacker - 攻击方单位
   * @param {Object} target - 目标单位
   * @param {string} attackType - 攻击类型: melee/ranged
   * @returns {Object} 战斗结果
   */
  static resolveAttack(attacker, target, attackType) {
    // 使用 DamagePipe 执行伤害计算
    return DamagePipe.resolve(attacker, target, attackType);
  }

  /**
   * 检查奇袭触发
   * @param {Object} attacker - 攻击方单位
   * @param {Object} target - 目标单位
   * @param {Array} allUnits - 所有单位列表
   * @returns {Object|null} 奇袭触发信息或null
   */
  static checkSurpriseAttack(attacker, target, allUnits) {
    // 只有马克西翁阵营单位才能触发奇袭
    if (attacker.faction !== 'maxion') {
      return null;
    }

    // 50%几率触发奇袭
    const roll = this.rollDice(10);
    if (roll > 5) {
      return null;
    }

    // 查找范围内可进行奇袭的其他马克西翁单位
    const surpriseCandidates = allUnits.filter(unit => {
      // 必须是马克西翁阵营
      if (unit.faction !== 'maxion') return false;
      // 不能是当前攻击者
      if (unit.id === attacker.id) return false;
      // 必须存活且未行动
      if (unit.hp <= 0 || unit.has_acted) return false;
      // 必须在攻击范围内
      const distance = this.calculateDistance(unit, target);
      return distance <= (unit.机动 || 3);
    });

    if (surpriseCandidates.length === 0) {
      return null;
    }

    // 返回奇袭信息
    return {
      triggered: true,
      attacker_id: attacker.id,
      attacker_name: attacker.name,
      target_id: target.id,
      target_name: target.name,
      candidates: surpriseCandidates.map(unit => ({
        id: unit.id,
        name: unit.name,
        distance: this.calculateDistance(unit, target)
      })),
      note: '奇袭触发！选择是否进行奇袭攻击'
    };
  }

  /**
   * 执行奇袭攻击 (重构版)
   * @param {Object} surpriseUnit - 奇袭单位
   * @param {Object} target - 目标单位
   * @param {string} attackType - 攻击类型
   * @returns {Object} 奇袭攻击结果
   */
  static resolveSurpriseAttack(surpriseUnit, target, attackType) {
    const result = DamagePipe.resolve(surpriseUnit, target, attackType);
    
    // 添加奇袭特有的骰子效果
    const roll = DamagePipe.rollDice(10);
    result.dice_roll = roll;
    result.dice_color = roll <= 5 ? 'black' : 'red';
    result.surprise_damage_bonus = roll <= 5 ? 2 : 0;
    result.surprise_mobility_penalty = roll > 5 ? 1 : 0;

    // 标记奇袭单位下回合跳过
    surpriseUnit.skip_next_turn = true;
    result.steps.push({
      phase: 'skip_next_turn',
      note: '奇袭单位下回合将跳过'
    });

    return result;
  }

  /**
   * 地球联合：火力覆盖
   * @param {number} centerQ - 中心点Q坐标
   * @param {number} centerR - 中心点R坐标
   * @param {Array} units - 所有单位
   * @param {Object} battlefieldState - 战场状态
   * @returns {Object} 火力覆盖结果
   */
  static resolveEarthArtillery(centerQ, centerR, units, battlefieldState) {
    const result = {
      center: { q: centerQ, r: centerR },
      damage: 15,
      radius: 2,
      units_affected: [],
      logs: []
    };

    // 找到范围内的所有单位
    units.forEach(unit => {
      const distance = this.calculateDistance(
        { q: centerQ, r: centerR },
        { q: unit.q, r: unit.r }
      );
      
      if (distance <= result.radius) {
        // 计算地形减伤
        const terrain = this.getTerrainAt(unit.q, unit.r, battlefieldState);
        const terrainReduction = terrain === 'mountain' ? 5 : 0;
        
        const finalDamage = Math.max(0, result.damage - terrainReduction);
        unit.hp = Math.max(0, unit.hp - finalDamage);
        
        result.units_affected.push({
          unit_id: unit.id,
          unit_name: unit.name,
          distance: distance,
          damage_taken: finalDamage,
          hp_remaining: unit.hp,
          terrain_effect: terrainReduction > 0 ? `地形减伤${terrainReduction}` : '无'
        });
        
        result.logs.push({
          type: 'artillery_hit',
          unit_name: unit.name,
          damage: finalDamage,
          hp_remaining: unit.hp,
          terrain: terrain
        });
        
        // 检查是否摧毁
        if (unit.hp <= 0) {
          result.logs.push({
            type: 'artillery_destroyed',
            unit_name: unit.name
          });
        }
      }
    });

    result.logs.push({
      type: 'artillery_fired',
      center: { q: centerQ, r: centerR },
      units_hit: result.units_affected.length
    });

    return result;
  }

  /**
   * 马克西翁：迷雾系统 (重构版 - 使用 BuffManager)
   * @param {Array} units - 所有单位
   * @param {Object} battlefieldState - 战场状态
   * @returns {Object} 迷雾系统结果
   */
  static resolveFogSystem(units, battlefieldState) {
    const result = {
      effect: null,
      duration: 2,
      units_affected: [],
      logs: []
    };

    // 掷骰子决定效果
    const roll = DamagePipe.rollDice(6);
    const maxionUnits = units.filter(u => u.faction === 'maxion');
    
    if (roll <= 2) {
      // 1-2：防御加成
      result.effect = 'defense_buff';
      
      maxionUnits.forEach(unit => {
        const applied = BuffManager.applyBuff(unit, BuffManager.BUFF_TYPES.DEFENSE, 2, result.duration);
        result.units_affected.push({
          unit_id: unit.id,
          unit_name: unit.name,
          buff: '+2防御',
          duration: result.duration,
          previousValue: applied.previousValue
        });
      });
      
      result.logs.push({
        type: 'fog_defense_buff',
        roll: roll,
        units_affected: maxionUnits.length,
        duration: result.duration
      });
      
    } else if (roll <= 4) {
      // 3-4：移动加成
      result.effect = 'mobility_buff';
      
      maxionUnits.forEach(unit => {
        const applied = BuffManager.applyBuff(unit, BuffManager.BUFF_TYPES.MOBILITY, 1, result.duration);
        result.units_affected.push({
          unit_id: unit.id,
          unit_name: unit.name,
          buff: '+1移动',
          duration: result.duration,
          previousValue: applied.previousValue
        });
      });
      
      result.logs.push({
        type: 'fog_mobility_buff',
        roll: roll,
        units_affected: maxionUnits.length,
        duration: result.duration
      });
      
    } else {
      // 5-6：攻击加成
      result.effect = 'attack_buff';
      
      maxionUnits.forEach(unit => {
        const applied = BuffManager.applyBuff(unit, BuffManager.BUFF_TYPES.ATTACK, 1, result.duration);
        result.units_affected.push({
          unit_id: unit.id,
          unit_name: unit.name,
          buff: '+1攻击',
          duration: result.duration,
          previousValue: applied.previousValue
        });
      });
      
      result.logs.push({
        type: 'fog_attack_buff',
        roll: roll,
        units_affected: maxionUnits.length,
        duration: result.duration
      });
    }

    return result;
  }

  /**
   * 拜隆：增援系统
   * @param {Object} target - 被攻击的目标单位
   * @param {Array} units - 所有单位
   * @returns {Array} 可增援的单位列表
   */
  static getSupportUnits(target, units) {
    if (target.faction !== 'balon') {
      return [];
    }

    // 查找附近的拜隆单位
    return units.filter(unit => {
      if (unit.faction !== 'balon') return false;
      if (unit.id === target.id) return false; // 不能是自己
      if (unit.hp <= 0) return false;
      
      const distance = this.calculateDistance(unit, target);
      return distance <= 2; // 增援范围2格
    });
  }

  /**
   * 执行增援
   * @param {Object} target - 被攻击的目标单位
   * @param {Object} supportUnit - 增援单位
   * @param {number} originalDamage - 原始伤害
   * @returns {Object} 增援结果
   */
  static resolveSupport(target, supportUnit, originalDamage) {
    const result = {
      target_id: target.id,
      target_name: target.name,
      support_unit_id: supportUnit.id,
      support_unit_name: supportUnit.name,
      damage_reduced: 0,
      logs: []
    };

    // 增援单位承受部分伤害
    const damageShare = Math.floor(originalDamage / 2);
    supportUnit.hp = Math.max(0, supportUnit.hp - damageShare);
    
    // 目标减少伤害
    target.hp += damageShare; // 恢复一半伤害
    
    result.damage_reduced = damageShare;
    result.logs.push({
      type: 'support_activated',
      support_unit: supportUnit.name,
      damage_shared: damageShare,
      support_unit_hp: supportUnit.hp,
      target_hp: target.hp
    });

    // 检查增援单位是否被摧毁
    if (supportUnit.hp <= 0) {
      result.logs.push({
        type: 'support_destroyed',
        unit_name: supportUnit.name,
        note: '增援单位被摧毁'
      });
    }

    return result;
  }

  /**
   * 计算六角格距离
   */
  static calculateDistance(unit1, unit2) {
    return Math.abs(unit1.q - unit2.q) + Math.abs(unit1.r - unit2.r);
  }

  /**
   * 获取指定位置的terrain
   */
  static getTerrainAt(q, r, battlefieldState) {
    if (!battlefieldState || !battlefieldState.cells) return 'lunar';
    
    const cell = battlefieldState.cells.find(c => c.q === q && c.r === r);
    return cell ? cell.terrain : 'lunar';
  }

  /**
   * 掷骰子
   */
  static rollDice(sides = 6) {
    return Math.floor(Math.random() * sides) + 1;
  }
}

export default CombatResolver;