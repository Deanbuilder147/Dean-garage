#!/usr/bin/env python3
"""
Phase 8 — Patch 3/3: skillExecutor.cjs 动态骰子驱动
添加骰子解析、掷骰、以及所有9技能的骰子感知执行逻辑
"""
import re

PATH = '/root/original-project/services/combat-service/src/services/combatCore/skillExecutor.cjs'

with open(PATH, 'r') as f:
    content = f.read()

ch = 0

# === PATCH 1: 在 class SkillExecutor 内部添加骰子工具方法 ===
# 寻找 constructor 之后
ctor_marker = "constructor() {"
dice_methods = """
    // ============================================================
    // Phase8: 骰子系统 — 词条驱动掷骰
    // ============================================================

    /**
     * 解析骰子字符串 "2d6" -> { count: 2, sides: 6 }
     */
    _parseDice(diceStr) {
        const m = String(diceStr || '1d6').match(/^(\\d+)d(\\d+)$/i);
        if (!m) return { count: 1, sides: 6 };
        return { count: parseInt(m[1]), sides: parseInt(m[2]) };
    }

    /**
     * 执行一次掷骰，返回总点数
     */
    _rollDice(diceStr) {
        const { count, sides } = this._parseDice(diceStr);
        let total = 0;
        for (let i = 0; i < count; i++) {
            total += Math.floor(Math.random() * sides) + 1;
        }
        return total;
    }

    /**
     * 根据词条配置判定掷骰结果
     * @returns { roll, isSuccess, bonusDamage }
     */
    _evaluateDice(skillCfg) {
        if (!skillCfg) return { roll: 0, isSuccess: false, bonusDamage: 0 };
        const diceType = skillCfg.dice_type || '1d6';
        const successLine = skillCfg.success_line ?? 4;
        const bonusDamage = skillCfg.success_bonus_damage ?? 0;
        const roll = this._rollDice(diceType);
        const isSuccess = roll >= successLine;
        return {
            roll,
            diceType,
            successLine,
            isSuccess,
            bonusDamage: isSuccess ? bonusDamage : 0
        };
    }

    /**
     * 获取通用字段 — Phase8 扩展，含骰子字段
     */
    _getUniversalFields(skillCfg) {
        return {
            target_filter: skillCfg?.target_filter || 'enemy',
            cast_range: skillCfg?.cast_range ?? 1,
            aoe_radius: skillCfg?.aoe_radius ?? 0,
            base_damage: skillCfg?.base_damage ?? 0,
            status_effects: skillCfg?.status_effects || [],
            dice_type: skillCfg?.dice_type || '1d6',
            success_line: skillCfg?.success_line ?? 4,
            success_bonus_damage: skillCfg?.success_bonus_damage ?? 0,
            is_manual_roll: skillCfg?.is_manual_roll || false,
        };
    }

    /**
     * 根据骰子判定动态调整伤害
     * 核心公式: baseDamage + (isSuccess ? success_bonus_damage : 0)
     */
    _applyDiceToDamage(skillCfg, baseDamageOverride) {
        const cfg = typeof skillCfg === 'string' ? getSkillConfig(skillCfg) : skillCfg;
        const baseDamage = baseDamageOverride ?? (cfg?.base_damage ?? 0);
        if (!cfg || !cfg.dice_type || cfg.dice_type === 'none') {
            return { damage: baseDamage, dice: null };
        }
        const dice = this._evaluateDice(cfg);
        const finalDamage = baseDamage + dice.bonusDamage;
        return { damage: finalDamage, dice };
    }

"""

if ctor_marker in content and '_parseDice' not in content:
    # Find the constructor and insert after its closing brace
    # We'll insert after the first method that follows the constructor
    insert_after = "resetStableForBattle() {"
    if insert_after in content:
        content = content.replace(insert_after, dice_methods + '\n    ' + insert_after)
        ch += 1
        print('[1] Dice utility methods added')

# === PATCH 2: 更新 executeBlock — 骰子驱动格挡 ===
old_block = """    executeBlock() {
        const cfg = getSkillConfig('block');
        const reduction = cfg?.reduction ?? 2;
        return {
            triggered: true,
            blocked: true,
            reduction,
            message: `格挡成功！伤害 -${reduction}`
        };
    }"""
new_block = """    executeBlock() {
        const cfg = getSkillConfig('block');
        const reduction = cfg?.reduction ?? 2;
        // Phase8: 骰子驱动 — 若配置了 dice_type 则判定成功追加
        const dice = this._evaluateDice(cfg);
        const effReduction = reduction + (dice.isSuccess ? 1 : 0);
        return {
            triggered: true,
            blocked: true,
            reduction: effReduction,
            dice,
            message: dice.roll > 0
                ? `格挡！伤害 -${effReduction} [掷${cfg.dice_type}=${dice.roll}${dice.isSuccess ? '>=success' : '<success'}]`
                : `格挡成功！伤害 -${effReduction}`
        };
    }"""
if old_block in content:
    content = content.replace(old_block, new_block)
    ch += 1
    print('[2] executeBlock dice-aware')

# === PATCH 3: 更新 executeSweep — 骰子驱动扫射 ===
old_sweep = """    executeSweep(unit, target, allUnits) {
        const cfg = getSkillConfig('sweep');
        const sectorAngle = cfg?.sector_angle ?? 60;
        // 优先使用通用字段 cast_range (v3.0)，fallback 到旧 max_range
        const maxRange = cfg?.cast_range ?? cfg?.max_range ?? 2;

        if (target && !this._isInSector(unit, target, maxRange, sectorAngle)) {
            return {
                mode: 'out_of_range',
                message: `扫射需要目标在扇形${maxRange}格范围内（当前超出范围）`
            };
        }

        // 去骰化：始终精准命中单体
        return {
            mode: 'precise',
            attack_type: 'ranged',
            active: true,
            targets: [target],
            message: `扫射精准命中！单体攻击，伤害 ${cfg?.base_damage ?? cfg?.damage_modifier_precise ?? -2}`
        };
    }"""
new_sweep = """    executeSweep(unit, target, allUnits) {
        const cfg = getSkillConfig('sweep');
        const sectorAngle = cfg?.sector_angle ?? 60;
        const maxRange = cfg?.cast_range ?? cfg?.max_range ?? 2;

        if (target && !this._isInSector(unit, target, maxRange, sectorAngle)) {
            return {
                mode: 'out_of_range',
                message: `扫射需要目标在扇形${maxRange}格范围内（当前超出范围）`
            };
        }

        // Phase8: 骰子驱动 — 判定成功追加伤害
        const { damage: finalDmg, dice } = this._applyDiceToDamage(cfg);
        return {
            mode: 'precise',
            attack_type: 'ranged',
            active: true,
            targets: [target],
            base_damage: cfg?.base_damage ?? cfg?.damage_modifier_precise ?? -2,
            final_damage: finalDmg,
            dice,
            message: dice?.roll > 0
                ? `扫射！掷${dice.diceType}=${dice.roll}${dice.isSuccess ? '>=success' : '<success'}, 伤害${finalDmg}`
                : `扫射精准命中！伤害 ${finalDmg}`
        };
    }"""
if old_sweep in content:
    content = content.replace(old_sweep, new_sweep)
    ch += 1
    print('[3] executeSweep dice-aware')

# === PATCH 4: 更新 executeThrow — 骰子驱动投掷 ===
old_throw = """    executeThrow(unit, target) {
        const cfg = getSkillConfig('throw');
        // 优先使用通用字段 cast_range (v3.0)，fallback 到 old min_range/max_range
        const range = cfg?.cast_range ?? cfg?.max_range ?? 3;
        const minRange = cfg?.min_range ?? 1;
        const maxRange = range;
        const ampValue = cfg?.value ?? 5;

        if (target) {
            const dist = this._hexDistance(unit, target);
            if (dist < minRange || dist > maxRange) {
                return {
                    mode: 'out_of_range',
                    min: minRange, max: maxRange, actual: dist,
                    message: `投掷需要 ${minRange}~${maxRange} 格距离（当前 ${dist} 格）`
                };
            }
        }
        return {
            mode: 'debuff',
            effect: 'damage_amp',
            value: ampValue,
            message: `投掷：目标周围 2 格内所有目标下次伤害 +${ampValue}`
        };
    }"""
new_throw = """    executeThrow(unit, target) {
        const cfg = getSkillConfig('throw');
        const range = cfg?.cast_range ?? cfg?.max_range ?? 3;
        const minRange = cfg?.min_range ?? 1;
        const maxRange = range;
        const baseAmp = cfg?.value ?? 5;

        if (target) {
            const dist = this._hexDistance(unit, target);
            if (dist < minRange || dist > maxRange) {
                return {
                    mode: 'out_of_range',
                    min: minRange, max: maxRange, actual: dist,
                    message: `投掷需要 ${minRange}~${maxRange} 格距离（当前 ${dist} 格）`
                };
            }
        }

        // Phase8: 骰子驱动 — 成功追加增伤幅度
        const dice = this._evaluateDice(cfg);
        const ampValue = baseAmp + (dice.isSuccess ? cfg?.success_bonus_damage ?? 2 : 0);
        return {
            mode: 'debuff',
            effect: 'damage_amp',
            value: ampValue,
            dice,
            message: dice.roll > 0
                ? `投掷！增伤+${ampValue} [掷${dice.diceType}=${dice.roll}]`
                : `投掷：目标周围 2 格内所有目标下次伤害 +${ampValue}`
        };
    }"""
if old_throw in content:
    content = content.replace(old_throw, new_throw)
    ch += 1
    print('[4] executeThrow dice-aware')

# === PATCH 5: 更新 executeCounter — 骰子驱动反击 ===
old_counter = """    executeCounter(unit, attacker, skillRange) {
        const cfg = getSkillConfig('counter');
        const range = skillRange ?? cfg?.cast_range ?? 1;
        const dist = this._hexDistance(unit, attacker);
        if (dist > range) return { triggered: false };

        return {
            triggered: true,
            type: 'counter',
            attack_type: 'melee',
            active: true,
            bonus: 2,
            message: '反击触发！伤害 +2'
        };
    }"""
new_counter = """    executeCounter(unit, attacker, skillRange) {
        const cfg = getSkillConfig('counter');
        const range = skillRange ?? cfg?.cast_range ?? 1;
        const dist = this._hexDistance(unit, attacker);
        if (dist > range) return { triggered: false };

        // Phase8: 骰子驱动 — 成功追加反击伤害
        const dice = this._evaluateDice(cfg);
        const bonus = 2 + (dice.isSuccess ? (cfg?.success_bonus_damage ?? 0) : 0);
        return {
            triggered: true,
            type: 'counter',
            attack_type: 'melee',
            active: true,
            bonus,
            dice,
            message: dice.roll > 0
                ? `反击！掷${dice.diceType}=${dice.roll}, 伤害+${bonus}`
                : '反击触发！伤害 +2'
        };
    }"""
if old_counter in content:
    content = content.replace(old_counter, new_counter)
    ch += 1
    print('[5] executeCounter dice-aware')

# === PATCH 6: 更新 executeSupply — 骰子驱动补给 ===
old_supply = """    executeSupply(unit, target) {
        if (target) {
            const dist = this._hexDistance(unit, target);
            if (dist > 1 || dist === 0) {
                return {
                    heal_amount: 0,
                    out_of_range: true,
                    min: 1, max: 1, actual: dist,
                    message: `补给仅对范围 1 内友军有效（当前距离 ${dist} 格）`
                };
            }
        }
        const melee = unit.melee || unit.attack || 10;
        return {
            heal_amount: melee,
            message: `补给：回复 ${melee} 点 HP`
        };
    }"""
new_supply = """    executeSupply(unit, target) {
        if (target) {
            const dist = this._hexDistance(unit, target);
            if (dist > 1 || dist === 0) {
                return {
                    heal_amount: 0,
                    out_of_range: true,
                    min: 1, max: 1, actual: dist,
                    message: `补给仅对范围 1 内友军有效（当前距离 ${dist} 格）`
                };
            }
        }
        const melee = unit.melee || unit.attack || 10;
        // Phase8: 骰子驱动 — 成功追加回复
        const cfg = getSkillConfig('supply');
        const dice = this._evaluateDice(cfg);
        const healAmount = melee + (dice.isSuccess ? (cfg?.success_bonus_damage ?? 0) : 0);
        return {
            heal_amount: healAmount,
            dice,
            message: dice.roll > 0
                ? `补给：回复 ${healAmount} HP [掷${dice.diceType}=${dice.roll}]`
                : `补给：回复 ${healAmount} 点 HP`
        };
    }"""
if old_supply in content:
    content = content.replace(old_supply, new_supply)
    ch += 1
    print('[6] executeSupply dice-aware')

# === PATCH 7: 更新 executeFocusedFire — 骰子驱动专注射击 ===
old_ff = """    executeFocusedFire() {
        const cfg = getSkillConfig('focused_fire');
        const bonus = cfg?.base_damage ?? cfg?.bonus ?? 4;
        return {
            bonus,
            message: `专注射击：伤害 +${bonus}`
        };
    }"""
new_ff = """    executeFocusedFire() {
        const cfg = getSkillConfig('focused_fire');
        const baseBonus = cfg?.base_damage ?? cfg?.bonus ?? 4;
        // Phase8: 骰子驱动 — 成功追加专注射击伤害
        const dice = this._evaluateDice(cfg);
        const bonus = baseBonus + (dice.isSuccess ? (cfg?.success_bonus_damage ?? 0) : 0);
        return {
            bonus,
            dice,
            message: dice.roll > 0
                ? `专注射击：掷${dice.diceType}=${dice.roll}, 伤害+${bonus}`
                : `专注射击：伤害 +${bonus}`
        };
    }"""
if old_ff in content:
    content = content.replace(old_ff, new_ff)
    ch += 1
    print('[7] executeFocusedFire dice-aware')

# === PATCH 8: 更新 executeSniper — 骰子驱动狙击 ===
old_sniper = """    canSniper(unit, target) {
        if (unit.has_moved) {
            return { triggered: false, message: '狙击需要舍弃本回合移动' };
        }
        if (!target) {
            return { triggered: false, message: '狙击需要目标' };
        }
        const cfg = getSkillConfig('sniper');
        const minRange = cfg?.min_range ?? 4;
        const maxRange = cfg?.cast_range ?? cfg?.max_range ?? 6;
        const dist = this._hexDistance(unit, target);
        if (dist < minRange || dist > maxRange) {
            return {
                triggered: false,
                out_of_range: true,
                min: 4, max: 6, actual: dist,
                message: `狙击需要 4~6 格距离（当前 ${dist} 格）`
            };
        }
        return {
            triggered: true,
            type: 'sniper',
            attack_type: 'ranged',
            active: true,
            mobility_reduction: 2,
            message: '狙击：舍弃移动，目标机动值 -2'
        };
    }"""
new_sniper = """    canSniper(unit, target) {
        if (unit.has_moved) {
            return { triggered: false, message: '狙击需要舍弃本回合移动' };
        }
        if (!target) {
            return { triggered: false, message: '狙击需要目标' };
        }
        const cfg = getSkillConfig('sniper');
        const minRange = cfg?.min_range ?? 4;
        const maxRange = cfg?.cast_range ?? cfg?.max_range ?? 6;
        const dist = this._hexDistance(unit, target);
        if (dist < minRange || dist > maxRange) {
            return {
                triggered: false,
                out_of_range: true,
                min: 4, max: 6, actual: dist,
                message: `狙击需要 4~6 格距离（当前 ${dist} 格）`
            };
        }
        // Phase8: 骰子驱动 — 成功追加机动值降低
        const dice = this._evaluateDice(cfg);
        const mobReduce = 2 + (dice.isSuccess ? (cfg?.success_bonus_damage ?? 0) : 0);
        return {
            triggered: true,
            type: 'sniper',
            attack_type: 'ranged',
            active: true,
            mobility_reduction: mobReduce,
            dice,
            message: dice.roll > 0
                ? `狙击！掷${dice.diceType}=${dice.roll}, 目标机动值-${mobReduce}`
                : `狙击：舍弃移动，目标机动值 -${mobReduce}`
        };
    }"""
if old_sniper in content:
    content = content.replace(old_sniper, new_sniper)
    ch += 1
    print('[8] canSniper dice-aware')

with open(PATH, 'w') as f:
    f.write(content)

print(f'\n=== skillExecutor.cjs: {ch} patches applied ===')
