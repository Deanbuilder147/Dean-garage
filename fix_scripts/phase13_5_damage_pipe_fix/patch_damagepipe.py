#!/usr/bin/env python3
"""
Phase 13.5: 重写装备属性抗性拦截器
严格实现 "防具属性 × 攻击属性" 交叉碰撞

修改点:
1. _calcDefense: 防御减免中加入 damage_kind 相同性校验
2. _calcArmorReduction: 重写，left_hand/right_hand/other 三大槽位
   逐一校验 equipment.damage_kind === attacker.weaponType 后方可计入
"""

import re

TARGET = "/root/original-project/services/combat-service/src/services/combatCore/damagePipe.cjs"

with open(TARGET, 'r') as f:
    content = f.read()

# ============================================================
# PATCH 1: _calcDefense — 防御减免中加入 damage_kind 属性匹配
# ============================================================
old_defense_block = """        // 泛化装备防御修正
        let eqReduction = 0;
        const eq = defender.equipment || {};
        if (eq.defense_modifiers) {
            const weaponType = attacker.weaponType || 'kinetic';
            eqReduction = eq.defense_modifiers[weaponType] || 0;
        }

        return {
            base: baseDefense,
            shield: shieldValue,
            buffs: defenseBuffs,
            terrain: terrainBonus,
            equipment_reduction: eqReduction,
            total: baseDefense + shieldValue + defenseBuffs + terrainBonus + eqReduction
        };"""

new_defense_block = """        // Phase 13.5: 装备防御修正 — 严格属性相同性校验
        let eqReduction = 0;
        const eq = defender.equipment || {};
        const weaponTypeForEq = attacker.weaponType || 'kinetic';
        // 遍历三大防具槽位，仅当装备 damage_kind 与攻击 weaponType 匹配时才计入
        for (const slot of ['left_hand', 'right_hand', 'other']) {
            try {
                const slotData = eq[slot];
                if (!slotData || typeof slotData !== 'object') continue;
                // 严格属性相同性校验: 装备有 damage_kind 则必须匹配，无则视为通用装备
                const eqKind = slotData.damage_kind || null;
                if (eqKind && eqKind !== weaponTypeForEq) continue;
                // defense_modifiers 对匹配的属性提供固定减伤
                const mods = slotData.defense_modifiers || {};
                eqReduction += Number(mods[weaponTypeForEq]) || 0;
            } catch(e) {
                console.warn(`[_calcDefense] 槽位 ${slot} 处理异常:`, e.message);
            }
        }

        return {
            base: baseDefense,
            shield: shieldValue,
            buffs: defenseBuffs,
            terrain: terrainBonus,
            equipment_reduction: eqReduction,
            total: baseDefense + shieldValue + defenseBuffs + terrainBonus + eqReduction
        };"""

# ============================================================
# PATCH 2: _calcArmorReduction — 完全重写装备属性抗性拦截器
# ============================================================
old_armor_block = """    /**
     * 装备/技能伤害减免（泛化）
     * 遍历防御方所有装备槽位和技能，查找 damage_kind_modifiers 字典，
     * 根据攻击方 weaponType 累加减免值
     *
     * @param {Object} attacker - 攻击方
     * @param {Object} defender - 防御方
     * @returns {number} 总减免值
     */
    static _calcArmorReduction(attacker, defender) {
        let reduction = 0;
        const weaponType = (attacker && attacker.weaponType) || 'kinetic';
        const eq = (defender && defender.equipment) || {};

        // 遍历所有装备槽位
        // Phase 14: 加固防御 - 确保空值不引发崩溃
        for (const slot of ['full_armor', 'coating', 'shield_gen', 'reactive_armor', 'left_hand', 'right_hand', 'other']) {
            try {
                const slotData = eq[slot];
                if (slotData && typeof slotData === 'object') {
                    const slotMods = slotData.damage_kind_modifiers || {};
                    if (slotMods && typeof slotMods === 'object') {
                        reduction += Number(slotMods[weaponType]) || 0;
                    }
                }
            } catch(e) {
                console.warn(`[_calcArmorReduction] 槽位 ${slot} 处理异常:`, e.message);
            }
        }

        // 遍历防御方技能，查找提供装备式保护的技能
        const skills = defender.skills || [];
        for (const skill of skills) {
            if (!skill || !skill.active) continue;
            const skillMods = skill.damage_kind_modifiers || {};
            reduction += skillMods[weaponType] || 0;
        }

        return reduction;
    }"""

new_armor_block = """    /**
     * 装备/技能伤害减免 — Phase 13.5 严格属性交叉碰撞
     *
     * 核心规则：
     *   1. 提取当前技能的 damage_kind (attacker.weaponType) 作为"定语"
     *   2. 遍历防御方 left_hand / right_hand / other 三大防具槽位
     *   3. 严格校验 equipment[slot].damage_kind === weaponType
     *      - 匹配: 该防具的 damage_kind_modifiers[weaponType] 计入总抗性
     *      - 不匹配: 该防具对此攻击完全不设防 (加权 = 0)
     *      - 无 damage_kind: 视为通用装备，直接应用其修饰值
     *   4. 技能提供的修饰值同样验证
     *
     * 示例：
     *   - 光束抗性盾 (damage_kind='beam') 完美抵挡 beam 攻击 50%
     *   - 同一盾牌对 kinetic 实弹攻击: damage_kind 不匹配 → 减免 = 0
     *
     * @param {Object} attacker - 攻击方 (含 weaponType / damage_kind)
     * @param {Object} defender - 防御方 (含 equipment / skills)
     * @returns {{ total: number, breakdown: Array }} 总减免值 + 逐槽明细
     */
    static _calcArmorReduction(attacker, defender) {
        let reduction = 0;
        const breakdown = [];
        const weaponType = (attacker && attacker.weaponType) || 'kinetic';
        const eq = (defender && defender.equipment) || {};

        // Phase 13.5: 仅遍历三大防具槽位，逐槽进行属性交叉碰撞
        for (const slot of ['left_hand', 'right_hand', 'other']) {
            try {
                const slotData = eq[slot];
                if (!slotData || typeof slotData !== 'object') continue;

                const eqKind = slotData.damage_kind || null; // 该装备的固有属性
                const slotMods = slotData.damage_kind_modifiers || {};

                if (!slotMods || typeof slotMods !== 'object') continue;

                // === 属性交叉碰撞核心逻辑 ===
                const modValue = Number(slotMods[weaponType]) || 0;

                if (eqKind) {
                    // 装备有明确的 damage_kind: 必须严格匹配
                    if (eqKind !== weaponType) {
                        breakdown.push({
                            slot,
                            equipment_damage_kind: eqKind,
                            attack_damage_kind: weaponType,
                            matched: false,
                            reason: `装备属性 ${eqKind} !== 攻击属性 ${weaponType}，该防具完全失效`,
                            reduction: 0
                        });
                        continue; // 属性不匹配，跳过此槽位
                    }
                    // 属性匹配，计入抗性
                    reduction += modValue;
                    breakdown.push({
                        slot,
                        equipment_damage_kind: eqKind,
                        attack_damage_kind: weaponType,
                        matched: true,
                        reason: `装备属性 ${eqKind} === 攻击属性 ${weaponType}，抗性 +${modValue}`,
                        reduction: modValue
                    });
                } else {
                    // 装备未声明 damage_kind (通用装备/向后兼容)
                    if (modValue > 0) {
                        reduction += modValue;
                        breakdown.push({
                            slot,
                            equipment_damage_kind: '(通用)',
                            attack_damage_kind: weaponType,
                            matched: true,
                            reason: `通用装备，抗性 +${modValue}`,
                            reduction: modValue
                        });
                    }
                }
            } catch(e) {
                console.warn(`[_calcArmorReduction] 槽位 ${slot} 处理异常:`, e.message);
            }
        }

        // 遍历防御方技能，同样进行属性校验
        const skills = defender.skills || [];
        for (const skill of skills) {
            if (!skill || !skill.active) continue;
            // 技能也有 damage_kind 字段用于限定生效范围
            const skillKind = skill.damage_kind || null;
            const skillMods = skill.damage_kind_modifiers || {};
            const skillValue = skillMods[weaponType] || 0;

            if (skillKind && skillKind !== weaponType) continue; // 技能属性不匹配
            reduction += skillValue;
        }

        return { total: reduction, breakdown };
    }"""

# Apply patches
patch1_ok = False
if old_defense_block in content:
    content = content.replace(old_defense_block, new_defense_block)
    print("PATCH 1 (_calcDefense): OK")
    patch1_ok = True
else:
    print("PATCH 1 (_calcDefense): WARNING - old block not found")

patch2_ok = False
if old_armor_block in content:
    content = content.replace(old_armor_block, new_armor_block)
    print("PATCH 2 (_calcArmorReduction): OK")
    patch2_ok = True
else:
    print("PATCH 2 (_calcArmorReduction): WARNING - old block not found")

# ============================================================
# PATCH 3: 修复 calculate 方法中对 _calcArmorReduction 返回值的引用
# 旧: - armorReduction  (number)
# 新: - armorReduction.total  (因为现在返回 { total, breakdown })
# ============================================================
old_final_formula = """        // ---- 阶段 10: 装备/技能伤害减免（泛化） ----
        const armorReduction = this._calcArmorReduction(attacker, defender);
        result.stages.armor_reduction = armorReduction;

        // ---- 阶段 11: 手动摇骰追加伤害 ----
        const manualRollResult = this._applyManualRollBonus(config);
        result.stages.manual_roll = manualRollResult;

        // ---- 阶段 12: 最终伤害计算 ----
        let finalDamage = Math.max(0, attackAfterExtras - defense.total)
            + heightBonus.bonus
            + weaponPenalty
            - armorReduction
            + manualRollResult.bonus;"""

new_final_formula = """        // ---- 阶段 10: 装备/技能伤害减免（Phase 13.5 属性交叉碰撞） ----
        const armorReduction = this._calcArmorReduction(attacker, defender);
        result.stages.armor_reduction = armorReduction;

        // ---- 阶段 11: 手动摇骰追加伤害 ----
        const manualRollResult = this._applyManualRollBonus(config);
        result.stages.manual_roll = manualRollResult;

        // ---- 阶段 12: 最终伤害计算 ----
        let finalDamage = Math.max(0, attackAfterExtras - defense.total)
            + heightBonus.bonus
            + weaponPenalty
            - (armorReduction.total || 0)
            + manualRollResult.bonus;"""

if old_final_formula in content:
    content = content.replace(old_final_formula, new_final_formula)
    print("PATCH 3 (calculate call site): OK")
else:
    print("PATCH 3 (calculate call site): WARNING - old formula not found")
    # Try to find and fix just the reference
    old_ref = "- armorReduction\n            + manualRollResult"
    if old_ref in content:
        new_ref = "- (armorReduction.total || 0)\n            + manualRollResult"
        content = content.replace(old_ref, new_ref)
        print("PATCH 3 (fallback simple replace): OK")
    else:
        print("PATCH 3 (fallback): also not found")

with open(TARGET, 'w') as f:
    f.write(content)

print(f"\nFile written: {TARGET}")
print(f"Total lines: {len(content.splitlines())}")
print(f"Patches applied: _calcDefense={patch1_ok}, _calcArmorReduction={patch2_ok}")
