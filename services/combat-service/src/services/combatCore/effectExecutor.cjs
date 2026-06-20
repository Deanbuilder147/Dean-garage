/**
 * EffectExecutor v2.0 — 效果执行器（去骰化）
 *
 * 职责:
 * 1. 根据 effects[].type 映射到具体效果处理器
 * 2. 执行词条效果（确定性公式）
 * 3. 支持效果组合和链式执行
 */

const damagePipe = require('./damagePipe.cjs');
const buffManager = require('./buffManager.cjs');

class EffectExecutor {
  constructor() {
    this.handlers = {
      // 伤害相关
      instant_kill: this.handleInstantKill.bind(this),
      damage_bonus_dice: this.handleDamageBonusFixed.bind(this),
      damage_reduction: this.handleDamageReduction.bind(this),

      // 判定相关 — 去骰化
      duel_resolution: this.handleDuelResolution.bind(this),
      luck_resolution: this.handleLuckResolution.bind(this),
      plunder_attempt: this.handlePlunderAttempt.bind(this),

      // 行动相关
      grant_extra_turn: this.handleGrantExtraTurn.bind(this),
      block_movement: this.handleBlockMovement.bind(this),

      // 支援相关
      assist_choice: this.handleAssistChoice.bind(this),

      // 生成相关
      spawn_items: this.handleSpawnItems.bind(this),

      // Buff相关
      apply_buff: this.handleApplyBuff.bind(this),
      remove_buff: this.handleRemoveBuff.bind(this),

      // 属性修改
      modify_stat: this.handleModifyStat.bind(this),

      // 特殊
      custom: this.handleCustomEffect.bind(this),

      // 隐身效果
      enter_stealth: this.handleEnterStealth.bind(this),
      exit_stealth: this.handleExitStealth.bind(this),
      stealth_attack_bonus: this.handleStealthAttackBonus.bind(this),
      stealth_evasion: this.handleStealthEvasion.bind(this)
    };
  }

  async execute(effects, context) {
    if (!effects || effects.length === 0) {
      return [{ success: true, reason: 'no_effects' }];
    }

    const results = [];
    for (const effect of effects) {
      const result = await this.executeSingle(effect, context);
      results.push(result);
      if (result.interrupt) break;
    }
    return results;
  }

  async executeSingle(effect, context) {
    const { type, ...params } = effect;
    const handler = this.handlers[type];
    if (!handler) {
      console.warn(`[EffectExecutor] 未知效果类型: ${type}`);
      return { type, success: false, reason: 'unknown_effect_type' };
    }
    try {
      return await handler(params, context);
    } catch (error) {
      console.error(`[EffectExecutor] 执行效果失败: ${type}`, error);
      return { type, success: false, reason: 'execution_error', error: error.message };
    }
  }

  /**
   * 立即斩杀 — 去骰化：根据 HP 阈值判定
   */
  async handleInstantKill(params, context) {
    const targetHp = context.target?.hp || 0;
    const maxHp = context.target?.max_hp || 1;
    const threshold = params.threshold_percent
      ? Math.max(1, Math.floor(maxHp * params.threshold_percent / 100))
      : params.threshold_fixed || 5;

    if (targetHp > 0 && targetHp <= threshold) {
      return {
        type: 'instant_kill',
        success: true,
        targetHp,
        threshold,
        result: 'target_eliminated',
        interrupt: true
      };
    }

    return {
      type: 'instant_kill',
      success: false,
      targetHp,
      threshold,
      result: 'execution_failed'
    };
  }

  /**
   * 伤害加成 — 去骰化：固定值加成
   */
  async handleDamageBonusFixed(params, context) {
    const bonus = params.fixed || params.bonus?.fixed || 4;

    if (context.damageContext) {
      context.damageContext.addStep({
        source: 'effect',
        type: 'tag_bonus',
        value: bonus,
        description: `专注射击: +${bonus}伤害`
      });
    }

    return {
      type: 'damage_bonus_dice',
      success: true,
      bonus
    };
  }

  /**
   * 伤害减免（抗性）
   */
  async handleDamageReduction(params, context) {
    const { amount = 2, conditions } = params;

    if (conditions) {
      const meetsCondition = await this.checkConditions(conditions, context);
      if (!meetsCondition) {
        return { type: 'damage_reduction', success: false, reason: 'conditions_not_met' };
      }
    }

    if (context.damageContext) {
      context.damageContext.addStep({
        source: 'effect',
        type: 'damage_reduction',
        value: -amount,
        description: `抗性: -${amount}伤害`
      });
    }

    return { type: 'damage_reduction', success: true, reduction: amount };
  }

  /**
   * 决斗判定 — 去骰化：比较 max_attack 值
   */
  async handleDuelResolution(params, context) {
    const attacker = context.attacker || {};
    const defender = context.defender || context.target || {};

    const maxA = Math.max(attacker.melee || attacker.attack || 10, attacker.ranged || 0);
    const maxB = Math.max(defender.melee || defender.attack || 10, defender.ranged || 0);

    let winner;
    if (maxA > maxB) winner = 'attacker';
    else if (maxB > maxA) winner = 'defender';
    else winner = 'tie';

    return {
      type: 'duel_resolution',
      success: true,
      statA: maxA,
      statB: maxB,
      winner,
      result: winner === 'attacker' ? 'attacker_wins' :
              winner === 'defender' ? 'defender_wins' : 'draw'
    };
  }

  /**
   * 幸运判定 — 去骰化：始终成功
   */
  async handleLuckResolution(params, context) {
    return {
      type: 'luck_resolution',
      success: true,
      lucky: true,
      result: 'gain_extra_action'
    };
  }

  /**
   * 抢夺判定 — 去骰化：确定性条件
   */
  async handlePlunderAttempt(params, context) {
    const targetWeaponAtk = context.target?.left_hand_melee ||
                            context.target?.left_hand_shooting || 0;

    if (targetWeaponAtk <= 0) {
      return { type: 'plunder_attempt', success: false, result: 'no_weapon_to_seize' };
    }

    return {
      type: 'plunder_attempt',
      success: true,
      result: 'weapon_seized',
      weapon: {
        name: context.target?.left_hand_name,
        attack: targetWeaponAtk
      }
    };
  }

  async handleGrantExtraTurn(params, context) {
    const { unitId } = params;
    const targetUnit = unitId ? context.getUnit(unitId) : context.attacker;
    if (!targetUnit) {
      return { type: 'grant_extra_turn', success: false, reason: 'unit_not_found' };
    }
    targetUnit.extraTurn = true;
    return { type: 'grant_extra_turn', success: true, unitId: targetUnit.id };
  }

  async handleBlockMovement(params, context) {
    return { type: 'block_movement', success: true };
  }

  async handleAssistChoice(params, context) {
    return { type: 'assist_choice', success: true };
  }

  async handleSpawnItems(params, context) {
    return { type: 'spawn_items', success: true, items: params.items || [] };
  }

  async handleApplyBuff(params, context) {
    return { type: 'apply_buff', success: true };
  }

  async handleRemoveBuff(params, context) {
    return { type: 'remove_buff', success: true };
  }

  async handleModifyStat(params, context) {
    return { type: 'modify_stat', success: true };
  }

  async handleCustomEffect(params, context) {
    const { execute } = params;
    if (typeof execute === 'function') {
      return await execute(params, context);
    }
    return { type: 'custom', success: false, reason: 'no_execute_function' };
  }

  // ============================================================
  // 隐身系统 — 去骰化
  // ============================================================

  async handleEnterStealth(params, context) {
    const unit = context.unit || context.attacker;
    if (!unit) return { type: 'enter_stealth', success: false, reason: 'no_unit' };

    const stealthType = params.type || 'conceal';
    const duration = params.duration || 2;

    unit.stealth = true;
    unit.stealthData = { type: stealthType, duration, appliedAt: Date.now() };

    return {
      type: 'enter_stealth',
      success: true,
      unitId: unit.id,
      stealthType,
      duration
    };
  }

  async handleExitStealth(params, context) {
    const unit = context.unit || context.attacker;
    if (!unit) return { type: 'exit_stealth', success: false, reason: 'no_unit' };
    const { reason } = params;
    const previousState = { stealth: unit.stealth, stealthData: unit.stealthData };

    unit.stealth = false;
    unit.stealthData = null;

    return {
      type: 'exit_stealth',
      success: true,
      result: 'stealth_broken',
      unitId: unit.id,
      reason: reason || 'unknown',
      previousState
    };
  }

  /**
   * 隐身攻击加成 — 去骰化：仅基础乘算
   */
  async handleStealthAttackBonus(params, context) {
    const { multiplier = 1.5 } = params;

    if (!context.damageContext) {
      return { type: 'stealth_attack_bonus', success: false, reason: 'no_damage_context' };
    }

    let bonus = 0;
    if (multiplier && multiplier > 1) {
      const baseDamage = context.damageContext.getTotal() || 0;
      bonus = Math.floor(baseDamage * (multiplier - 1));
    }

    if (bonus > 0) {
      context.damageContext.addStep({
        source: 'tag',
        type: 'stealth_bonus',
        value: bonus,
        description: `奇袭: +${bonus}伤害 (${multiplier}x)`
      });
    }

    return {
      type: 'stealth_attack_bonus',
      success: true,
      bonus,
      multiplier,
      description: `奇袭: 伤害${multiplier}x`
    };
  }

  /**
   * 隐身闪避 — 去骰化：固定概率匹配
   */
  async handleStealthEvasion(params, context) {
    const { evasionChance = 0.5 } = params;
    const evaded = Math.random() < evasionChance;

    return {
      type: 'stealth_evasion',
      success: true,
      evasionChance,
      evaded,
      result: evaded ? 'attack_evaded' : 'attack_hits',
      description: evaded ? '伪装生效: 闪避攻击' : '伪装失效: 攻击命中'
    };
  }

  /**
   * 条件检查（简化版）
   */
  async checkConditions(conditions, context) {
    if (!conditions) return true;
    // 简单实现：检查 hp 条件等
    return true;
  }
}

module.exports = new EffectExecutor();
