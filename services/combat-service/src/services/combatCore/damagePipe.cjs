/**
 * damagePipe.cjs - 机甲战棋伤害计算管道 (Phase 10 泛化语法战斗中枢)
 * 
 * 12 阶段泛化伤害管道：
 *   1. base_attack            - 基础攻击力
 *   2. mobility_diff          - 双方机动值差
 *   3. temp_attack            - 临时攻击力
 *   4. extras                 - 泛化额外值累加器
 *   5. attack_after_extras    - 追加额外值后的攻击力
 *   6. height_bonus           - 高地优势加成
 *   7. terrain_kind_modifiers - 地形伤害类型修正
 *   8. defense                - 防御减免（泛化）
 *   9. weapon_penalty         - 武器克制惩罚（泛化）
 *  10. armor_reduction        - 装备/技能伤害减免（泛化）
 *  11. manual_roll_bonus      - 手动摇骰追加伤害
 *  12. final_damage           - 最终伤害计算
 *  13. crit                   - 暴击判定
 *
 * 使用海豹骰子 dicescript 引擎统一所有骰子判定。
 */

// DiceEngine.cjs 已于 Phase 4 废除，直接使用 Math.random()

// ============================================================
// 常量配置
// ============================================================

const CRIT_THRESHOLD = 5;       // 暴击阈值 (1d6 >= 5, 即 1/3 概率)
const CRIT_MIN = 0.8;           // 暴击倍率下限
const CRIT_MAX = 1.5;           // 暴击倍率上限
const GUARANTEED_DAMAGE = 1;    // 保底伤害

// 默认地形伤害类型修正（运行时由 terrainDefs 覆盖）
const DEFAULT_TERRAIN_KIND_MODIFIERS = {
    beam: 1.0,
    kinetic: 1.0,
    explosive: 1.0,
    corrosive: 1.0,
    thermal: 1.0
};

// 迷雾精度惩罚
const FOG_ACCURACY = 0.7;

// 泛化武器克制惩罚
const WEAPON_COUNTER_PENALTY = -2;

// ============================================================
// 伤害计算管道（静态方法）
// ============================================================

class DamagePipe {

    /**
     * 掷骰（Math.random，DiceEngine 已于 Phase 4 废除）
     */
    static rollDice(faces = 6) {
        return Math.floor(Math.random() * faces) + 1;
    }

    /**
     * 暴击判定：1d6 >= 5 → 33.3% 概率
     */
    static checkCrit() {
        return this.rollDice(6) >= CRIT_THRESHOLD;
    }

    /**
     * 主计算入口：完整 12+1 阶段泛化伤害管道
     *
     * @param {Object} config
     * @param {Object} config.attacker - { melee, ranged, attack(fallback), mobility, weaponType, buffs[], skills[], extraBonuses, z, height, equipment }
     * @param {Object} config.defender - { defense, armorType, shield, resistance, buffs[], equipment, skills[], mobility, terrain, z, height }
     * @param {string} config.attack_type - 'melee' | 'ranged'
     * @param {number} config.sniper_mobility_reduction - 狙击技能：目标机动值减免（0 表示无狙击）
     * @param {Object} config.terrainDefs - 地形定义字典（可选，默认 {}）
     * @param {boolean} config.is_manual_roll - 是否启用手动摇骰阶段
     * @param {string} config.dice_type - 手动摇骰的骰子类型，如 '1d6'
     * @param {number} config.success_line - 手动摇骰的成功线
     * @param {number} config.success_bonus_damage - 手动摇骰成功追加伤害
     * @param {number} config.height_bonus_per_diff - 每高度差的伤害加成
     * @returns {Object} { stages, final_damage, is_crit, crit_multiplier }
     */
    static calculate(config) {
        const result = {
            stages: {},
            final_damage: 0,
            is_crit: false,
            crit_multiplier: 1.0
        };

        const attackType = config.attack_type || 'melee';
        const attacker = config.attacker || {};
        const defender = config.defender || {};
        const terrainDefs = config.terrainDefs || {};

        // ---- 阶段 1: 基础攻击力（近战=格斗 / 远程=射击） ----
        const baseAttack = attackType === 'melee'
            ? (attacker.melee || attacker.attack || 10)
            : (attacker.ranged || attacker.attack || 10);
        result.stages.base_attack = baseAttack;

        // ---- 阶段 2: 双方机动值差 ----
        const attMobility = attacker.mobility || 0;
        const defMobility = defender.mobility || 0;
        // 狙击技能：目标机动值 -2（Excel: 舍弃移动，机动值差计算中目标机动值-2）
        const sniperReduction = config.sniper_mobility_reduction || 0;
        const effectiveDefMobility = Math.max(0, defMobility - sniperReduction);
        const mobilityDiff = attMobility - effectiveDefMobility;
        result.stages.mobility_diff = mobilityDiff;
        if (sniperReduction > 0) {
            result.stages.sniper_mobility_reduction = sniperReduction;
        }

        // ---- 阶段 3: 临时攻击力 ----
        const tempAttack = baseAttack + mobilityDiff;
        result.stages.temp_attack = tempAttack;

        // ---- 阶段 4: 额外值（泛化累加器） ----
        const extraValues = this._calcExtraValues(attacker);
        result.stages.extras = extraValues;

        // ---- 阶段 5: 追加额外值后的攻击力 ----
        const attackAfterExtras = tempAttack + extraValues.total;
        result.stages.attack_after_extras = attackAfterExtras;

        // ---- 阶段 6: 高地优势加成 ----
        const heightBonus = this._calcHeightBonus(attacker, defender, config);
        result.stages.height_bonus = heightBonus;

        // ---- 阶段 7: 地形伤害类型修正 ----
        const terrainKindMods = this._applyTerrainKindModifiers(defender, attacker.weaponType, terrainDefs);
        result.stages.terrain_kind_modifiers = terrainKindMods;

        // ---- 阶段 8: 防御减免（泛化） ----
        const defense = this._calcDefense(defender, attacker, terrainDefs);
        result.stages.defense = defense;

        // ---- 阶段 9: 武器克制惩罚（泛化） ----
        const weaponPenalty = this._calcWeaponPenalty(attacker, defender);
        result.stages.weapon_penalty = weaponPenalty;

        // ---- 阶段 10: 装备/技能伤害减免（Phase 13.5 属性交叉碰撞） ----
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
            + manualRollResult.bonus;
        finalDamage = Math.max(GUARANTEED_DAMAGE, finalDamage);

        // 应用地形伤害类型修正
        finalDamage = Math.floor(finalDamage * terrainKindMods.modifier);
        finalDamage = Math.max(GUARANTEED_DAMAGE, finalDamage);
        result.stages.final_damage_pre_crit = finalDamage;

        // ---- 阶段 13: 暴击判定（伤害计算完成后） ----
        const isCrit = this.checkCrit();
        result.is_crit = isCrit;
        result.stages.is_crit = isCrit;

        if (isCrit) {
            const critMult = CRIT_MIN + Math.random() * (CRIT_MAX - CRIT_MIN);
            result.crit_multiplier = parseFloat(critMult.toFixed(2));
            finalDamage = Math.floor(finalDamage * critMult);
        }

        result.final_damage = Math.max(GUARANTEED_DAMAGE, finalDamage);
        result.stages.final_damage = result.final_damage;

        return result;
    }

    // ---- 内部计算方法 ----

    /**
     * 泛化额外值累加器
     * 遍历 bonuses 数组，对任意 bonus_value !== undefined 的条目累加，
     * 不做类型名判断（不区分 assist/counter/focused_fire/sweep_precise/guard/blockade）
     *
     * @param {Object} attacker - 攻击方对象
     * @returns {{ total: number, details: Object }}
     */
    static _calcExtraValues(attacker) {
        let total = 0;
        const details = {};
        const bonuses = attacker.extraBonuses?.bonuses || attacker.bonuses || [];
        for (const bonus of bonuses) {
            if (!bonus) continue;
            const val = bonus.bonus_value ?? bonus.value ?? 0;
            if (val !== 0) {
                total += val;
                details[bonus.type || 'generic'] = val;
            }
        }
        return { total, details };
    }

    /**
     * 高地优势加成
     * 计算攻击方与防御方的高度差，每差1点给予 bonusPerDiff 伤害加成
     *
     * @param {Object} attacker - 攻击方
     * @param {Object} defender - 防御方
     * @param {Object} config - 管道配置
     * @returns {{ height_diff: number, bonus: number, message?: string }}
     */
    static _calcHeightBonus(attacker, defender, config) {
        const attZ = attacker.z ?? attacker.height ?? 0;
        const defZ = defender.z ?? defender.height ?? 0;
        const heightDiff = attZ - defZ;
        const bonusPerDiff = config.height_bonus_per_diff ?? 0;
        if (heightDiff > 0 && bonusPerDiff > 0) {
            const bonus = Math.floor(heightDiff * bonusPerDiff);
            return {
                height_diff: heightDiff,
                bonus,
                message: `高地优势 z+${heightDiff}, 伤害+${bonus}`
            };
        }
        return { height_diff: heightDiff, bonus: 0 };
    }

    /**
     * 地形伤害类型修正
     * 根据防御方所在地形的 damage_kind_modifiers 字典，对特定武器类型施加倍率修正
     *
     * @param {Object} defender - 防御方
     * @param {string} weaponType - 攻击方武器类型
     * @param {Object} terrainDefs - 地形定义字典
     * @returns {{ terrain_id: string, damage_kind: string, modifier: number, defense_bonus: number }}
     */
    static _applyTerrainKindModifiers(defender, weaponType, terrainDefs) {
        const terrainId = defender.terrain || 'moon';
        const terrainDef = terrainDefs[terrainId] || {};
        const kindMods = terrainDef.damage_kind_modifiers || DEFAULT_TERRAIN_KIND_MODIFIERS;
        const modifier = kindMods[weaponType] || 1.0;
        const defenseBonus = terrainDef.defense_bonus ?? 0;
        return {
            terrain_id: terrainId,
            damage_kind: weaponType,
            modifier,
            defense_bonus: defenseBonus
        };
    }

    /**
     * 防御减免（泛化）
     * 基础防御 + 护盾 + Buff + 地形防御 + 装备防御修正
     *
     * @param {Object} defender - 防御方
     * @param {Object} attacker - 攻击方（用于获取 weaponType）
     * @param {Object} terrainDefs - 地形定义字典
     * @returns {{ base: number, shield: number, buffs: number, terrain: number, equipment_reduction: number, total: number }}
     */
    static _calcDefense(defender, attacker, terrainDefs) {
        const baseDefense = defender.defense || 5;
        const shieldValue = defender.shield || 0;
        const defenseBuffs = this._sumBuffs(defender.buffs || [], 'defense');

        // 泛化地形防御
        const terrainId = defender.terrain || 'moon';
        const terrainDef = terrainDefs[terrainId] || {};
        const terrainBonus = terrainDef.defense_bonus ?? 0;

        // Phase 13.5: 装备防御修正 — 严格属性相同性校验
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
        };
    }

    /**
     * 武器克制惩罚（泛化）
     * 攻击方 weaponType == 防御方 resistance → 惩罚值
     *
     * @param {Object} attacker - 攻击方
     * @param {Object} defender - 防御方
     * @returns {number} 惩罚值
     */
    static _calcWeaponPenalty(attacker, defender) {
        const attackerWeaponType = attacker.weaponType || null;
        const defenderResistance = defender.resistance || null;
        if (!attackerWeaponType || !defenderResistance) return 0;
        if (attackerWeaponType === defenderResistance) return WEAPON_COUNTER_PENALTY;
        return 0;
    }

    /**
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
    }

    /**
     * 手动摇骰追加伤害
     * 如果 config.is_manual_roll 为 true，模拟玩家手动摇骰判定
     * TODO: Phase 10 - 状态机钩子，等待玩家实际输入
     *
     * @param {Object} config - 管道配置
     * @returns {{ manual: boolean, bonus: number, roll?: number, diceType?: string, successLine?: number, isSuccess?: boolean, message?: string }}
     */
    static _applyManualRollBonus(config) {
        if (!config.is_manual_roll) return { manual: false, bonus: 0 };

        // Phase 11: 优先使用外部传入的掷骰结果 (WebSocket 手动摇骰)
        const externalResult = config.external_roll_result;
        const diceType = config.dice_type || '1d6';
        const successLine = config.success_line ?? 4;
        const bonusDamage = config.success_bonus_damage ?? 0;

        let roll, isSuccess;
        if (externalResult && externalResult.roll !== undefined) {
            // 使用外部掷骰结果
            roll = externalResult.roll;
            isSuccess = externalResult.isSuccess ?? (roll >= successLine);
        } else {
            // 回退: 自动模拟掷骰
            const m = String(diceType).match(/^(\d+)d(\d+)$/i);
            const count = m ? parseInt(m[1]) : 1;
            const sides = m ? parseInt(m[2]) : 6;
            roll = 0;
            for (let i = 0; i < count; i++) roll += Math.floor(Math.random() * sides) + 1;
            isSuccess = roll >= successLine;
        }

        const bonus = isSuccess ? bonusDamage : 0;
        return {
            manual: true,
            roll,
            diceType,
            successLine,
            isSuccess,
            bonus,
            message: `[手动摇骰] 掷${diceType}=${roll} ${isSuccess ? '>=' : '<'} ${successLine}, 追加伤害+${bonus}`
        };
    }

    /**
     * Buff 求和
     */
    static _sumBuffs(buffs, type) {
        if (!buffs || !buffs.length) return 0;
        return buffs
            .filter(b => b && b.type === type)
            .reduce((sum, b) => sum + (b.value || 0), 0);
    }

    /**
     * 计算对地形的伤害
     */
    static calculateTerrainDamage(attacker, terrainDef, config) {
        const weaponType = attacker.weaponType || 'kinetic';
        const baseDamage = attacker.attack || 10;
        const terrainResistance = terrainDef.resistance || {};
        const resistance = terrainResistance[weaponType] || 1.0;
        return Math.floor(baseDamage * resistance);
    }

    /**
     * 应用地形伤害效果
     */
    static applyTerrainDamage(terrain, damage, terrainDefs) {
        const terrainDef = terrainDefs[terrain] || {};
        const hp = terrainDef.hp || 100;
        const remaining = Math.max(0, hp - damage);
        return {
            terrain,
            damage,
            hp_before: hp,
            hp_after: remaining,
            destroyed: remaining <= 0
        };
    }

    /**
     * 快速计算：简化接口兼容旧调用
     * 自动从 attacker.attack 推断 melee/ranged（取 attack 为两者共用值）
     *
     * @param {Object} attacker - 攻击方
     * @param {Object} defender - 防御方
     * @param {string} attackType - 'melee' | 'ranged'
     * @param {Object} terrainDefs - 地形定义（可选）
     * @returns {Object} 管道计算结果
     */
    static calculateQuick(attacker, defender, attackType = 'melee', terrainDefs = {}) {
        return this.calculate({
            attacker: {
                melee: attacker.melee || attacker.attack || 10,
                ranged: attacker.ranged || attacker.attack || 10,
                attack: attacker.attack || 10,
                mobility: attacker.mobility || 0,
                weaponType: attacker.weaponType || 'kinetic',
                buffs: attacker.buffs || [],
                skills: attacker.skills || [],
                extraBonuses: attacker.extraBonuses || null,
                z: attacker.z ?? attacker.height ?? 0,
                height: attacker.height ?? attacker.z ?? 0
            },
            defender: {
                defense: defender.defense || 5,
                armorType: defender.armorType || 'normal',
                shield: defender.shield || 0,
                resistance: defender.resistance || null,
                buffs: defender.buffs || [],
                equipment: defender.equipment || {},
                skills: defender.skills || [],
                mobility: defender.mobility || 0,
                terrain: defender.terrain || 'moon',
                z: defender.z ?? defender.height ?? 0,
                height: defender.height ?? defender.z ?? 0
            },
            attack_type: attackType,
            terrainDefs: terrainDefs || {}
        });
    }
}

module.exports = DamagePipe;
