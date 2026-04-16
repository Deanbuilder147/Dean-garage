/**
 * 伤害计算管道 - DamagePipe
 * 模块化的伤害计算流水线
 */

const EquipmentManager = require('./equipManager.cjs');
const BuffManager = require('./buffManager.cjs');

class DamagePipe {
  
  /**
   * 伤害计算流水线
   * @param {Object} context - 计算上下文
   * @param {Object} context.attacker - 攻击方单位
   * @param {Object} context.target - 目标单位
   * @param {string} context.attackType - 攻击类型: 'melee' | 'ranged'
   * @param {Object} context.battlefieldState - 战场状态（可选）
   * @returns {Object} 完整伤害计算结果
   */
  static calculate(context) {
    const { attacker, target, attackType, battlefieldState } = context;
    
    const result = {
      attacker_id: attacker.id,
      attacker_name: attacker.name,
      target_id: target.id,
      target_name: target.name,
      attack_type: attackType,
      steps: [],
      final_damage: 0,
      target_hp_before: target.hp,
      target_hp_after: target.hp,
      modifiers: {},
      breakdown: {}
    };

    // ========== 阶段1: 基础攻击力 ==========
    const baseAttack = this.calculateBaseAttack(attacker, attackType);
    result.steps.push({
      phase: 'base_attack',
      value: baseAttack,
      note: `${attackType === 'melee' ? '格斗' : '射击'}属性`
    });
    result.breakdown.base_attack = baseAttack;

    // ========== 阶段2: 机动差修正 ==========
    const attackerMobility = this.getMobility(attacker);
    const targetMobility = this.getMobility(target);
    const mobilityDiff = attackerMobility - targetMobility;
    const mobilityBonus = mobilityDiff;
    
    result.steps.push({
      phase: 'mobility_diff',
      value: mobilityDiff,
      note: `攻击方机动(${attackerMobility}) - 防御方机动(${targetMobility})`
    });
    result.breakdown.mobility_bonus = mobilityBonus;

    // ========== 阶段3: 武器加成 ==========
    const weaponBonus = EquipmentManager.getWeaponBonus(attacker, attackType);
    if (weaponBonus.bonus > 0) {
      result.steps.push({
        phase: 'weapon_bonus',
        value: weaponBonus.bonus,
        sources: weaponBonus.sources,
        note: '武器加成'
      });
    }
    result.breakdown.weapon_bonus = weaponBonus.bonus;

    // ========== 阶段4: Buff加成 ==========
    const attackBuff = BuffManager.getAttackBonus(attacker);
    if (attackBuff > 0) {
      result.steps.push({
        phase: 'attack_buff',
        value: attackBuff,
        note: `攻击Buff: +${attackBuff}`
      });
    }
    result.breakdown.attack_buff = attackBuff;

    // ========== 阶段5: 临时攻击力 ==========
    let tempAttack = baseAttack + mobilityBonus + weaponBonus.bonus + attackBuff;
    result.breakdown.temp_attack = tempAttack;

    // ========== 阶段6: 暴击判定 ==========
    let isCritical = false;
    let criticalMultiplier = 1;
    
    if (attacker.has_critical_chance) {
      const criticalRoll = this.rollDice(10);
      isCritical = criticalRoll >= 9;
      
      if (isCritical) {
        criticalMultiplier = 1.5;
        tempAttack = Math.floor(tempAttack * criticalMultiplier);
        result.steps.push({
          phase: 'critical_hit',
          value: tempAttack,
          roll: criticalRoll,
          multiplier: 1.5,
          note: `暴击！攻击力×1.5`
        });
      }
      result.critical_hit = isCritical;
      result.breakdown.critical = { triggered: isCritical, multiplier: criticalMultiplier };
    }

    // ========== 阶段7: 基础伤害 ==========
    let damage = Math.max(0, Math.floor(tempAttack));
    result.steps.push({
      phase: 'raw_damage',
      value: damage,
      note: '基础伤害'
    });
    result.breakdown.raw_damage = damage;

    // ========== 阶段8: 防御减伤 ==========
    const defenseReduction = this.calculateDefenseReduction(target, battlefieldState);
    if (defenseReduction.total > 0) {
      result.steps.push({
        phase: 'defense_reduction',
        value: defenseReduction.total,
        sources: defenseReduction.sources,
        note: '防御减伤'
      });
    }
    result.breakdown.defense_reduction = defenseReduction.total;

    // ========== 阶段9: 最终伤害 ==========
    result.final_damage = Math.max(0, damage - defenseReduction.total);
    result.target_hp_after = Math.max(0, target.hp - result.final_damage);
    
    result.steps.push({
      phase: 'final_damage',
      value: result.final_damage,
      formula: `${damage} - ${defenseReduction.total} = ${result.final_damage}`,
      note: '最终伤害'
    });

    // ========== 阶段10: 防具耐久度消耗 ==========
    if (defenseReduction.total > 0) {
      const durabilityResult = EquipmentManager.consumeArmorDurability(target);
      if (durabilityResult.consumed.length > 0) {
        result.steps.push({
          phase: 'durability_consumed',
          consumed: durabilityResult.consumed,
          note: '防具耐久度消耗'
        });
      }
      if (durabilityResult.destroyed.length > 0) {
        result.steps.push({
          phase: 'armor_destroyed',
          destroyed: durabilityResult.destroyed,
          note: '防具被摧毁'
        });
      }
      result.armor_effects = durabilityResult;
    }

    // ========== 汇总修饰器 ==========
    result.modifiers = {
      mobility: mobilityBonus,
      weapon: weaponBonus.bonus,
      attack_buff: attackBuff,
      defense_reduction: defenseReduction.total,
      critical: isCritical
    };

    return result;
  }

  /**
   * 计算基础攻击力
   */
  static calculateBaseAttack(unit, attackType) {
    return attackType === 'melee' 
      ? (unit.格斗 || 0)
      : (unit.射击 || 0);
  }

  /**
   * 获取单位机动值（包含Buff）
   */
  static getMobility(unit) {
    const baseMobility = unit.机动 || 3;
    const buffBonus = BuffManager.getMobilityBonus(unit);
    return baseMobility + buffBonus;
  }

  /**
   * 计算防御减伤
   */
  static calculateDefenseReduction(unit, battlefieldState) {
    const armor = EquipmentManager.getArmorDefense(unit);
    let terrainReduction = 0;

    // 地形减伤（如果有战场状态）
    if (battlefieldState && battlefieldState.cells) {
      const cell = battlefieldState.cells.find(c => c.q === unit.q && c.r === unit.r);
      if (cell) {
        switch (cell.terrain) {
          case 'mountain':
            terrainReduction = 3;
            break;
          case 'building':
            terrainReduction = 2;
            break;
        }
      }
    }

    // 防御Buff
    const defenseBuff = BuffManager.getDefenseBonus(unit);

    return {
      total: armor.reduction + terrainReduction + defenseBuff,
      armor: armor.reduction,
      terrain: terrainReduction,
      buff: defenseBuff,
      sources: [
        ...armor.sources,
        ...(terrainReduction > 0 ? [{ type: 'terrain', reduction: terrainReduction, note: '地形减伤' }] : []),
        ...(defenseBuff > 0 ? [{ type: 'buff', reduction: defenseBuff, note: `防御Buff: +${defenseBuff}` }] : [])
      ]
    };
  }

  /**
   * 掷骰子
   */
  static rollDice(sides = 6) {
    return Math.floor(Math.random() * sides) + 1;
  }

  /**
   * 执行完整攻击流程
   * @param {Object} attacker - 攻击方
   * @param {Object} target - 目标
   * @param {string} attackType - 攻击类型
   * @param {Object} battlefieldState - 战场状态
   * @returns {Object} 攻击结果
   */
  static resolve(attacker, target, attackType, battlefieldState = null) {
    // 1. 计算伤害
    const damageResult = this.calculate({ attacker, target, attackType, battlefieldState });

    // 2. 应用伤害到目标
    target.hp = damageResult.target_hp_after;

    // 3. 检查斩杀
    const executeResult = this.checkExecute(target, attackType, damageResult.target_hp_after);
    if (executeResult.triggered && executeResult.success) {
      target.hp = 0;
      damageResult.executed = true;
      damageResult.steps.push({
        phase: 'executed',
        roll: executeResult.roll,
        threshold: executeResult.threshold,
        note: '斩杀成功！目标生命归零'
      });
    }
    damageResult.target_hp_after = target.hp;

    return damageResult;
  }

  /**
   * 检查斩杀
   */
  static checkExecute(target, attackType, currentHp) {
    // 只有近战攻击才能斩杀，且目标HP在1-4之间
    if (attackType !== 'melee' || currentHp < 1 || currentHp >= 5) {
      return { triggered: false };
    }

    const roll = this.rollDice(6);
    const threshold = currentHp;
    const success = roll >= threshold;

    return {
      triggered: true,
      roll: roll,
      threshold: threshold,
      success: success
    };
  }

  /**
   * 计算六角格距离 (轴坐标)
   * @param {Object} pos1 - 位置1 {q, r}
   * @param {Object} pos2 - 位置2 {q, r}
   * @returns {number} 距离
   */
  static calculateHexDistance(pos1, pos2) {
    return Math.abs(pos1.q - pos2.q) + Math.abs(pos1.r - pos2.r);
  }

  /**
   * 获取指定位置的terrain
   * @param {number} q - Q坐标
   * @param {number} r - R坐标
   * @param {Object} battlefieldState - 战场状态
   * @returns {string} terrain类型
   */
  static getTerrainAt(q, r, battlefieldState) {
    if (!battlefieldState || !battlefieldState.cells) return 'lunar';
    
    const cell = battlefieldState.cells.find(c => c.q === q && c.r === r);
    return cell ? cell.terrain : 'lunar';
  }
}

module.exports = DamagePipe;
